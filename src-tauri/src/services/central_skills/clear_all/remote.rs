//! SSH/WSL probe and removal scripts for Central clear-all.
//!
//! Paths always travel as positional arguments (shell-quoted by the
//! transport), never interpolated into script source. Records are one line
//! per item: a fixed tag, the 1-based argument index, and every file-system
//! derived field (entry names, `readlink` values, resolved roots) hex-encoded
//! with POSIX `od`. A name or link target containing tabs or newlines can
//! therefore never forge or split a record; the parser rejects anything that
//! is not exactly a known tag, a valid index, and strict hex.
//!
//! Unlike the scanner probe, entries are kept when they are dangling links
//! (`[ -L ] || [ -e ]`), because dangling links are what clear-all must find.

use crate::targets::ConnectedRemoteTarget;

use super::super::error::CentralSkillsError;

/// Items per probe/removal script invocation (keeps the command line bounded).
pub(super) const REMOTE_REMOVE_BATCH: usize = 200;

/// Shared helpers: exact `readlink` capture (trailing newlines preserved) and
/// hex encoding of arbitrary bytes.
const REMOTE_SCRIPT_PRELUDE: &str = r#"nl=$(printf '\nx'); nl=${nl%x}
hex() { printf '%s' "$1" | od -An -tx1 -v | tr -d ' \n'; }
read_target() { LT=$(readlink -- "$1"; printf x); LT=${LT%x}; LT=${LT%"$nl"}; }
"#;

/// Args: Central root first, then scan dirs. For the Central root (index 1)
/// a `REAL` record carries `cd -P && pwd -P` (symlinks in the root resolved,
/// entries never followed); `UNRESOLVED` when that fails.
pub(super) const REMOTE_DIR_PROBE_BODY: &str = r#"i=0
for dir in "$@"; do
  i=$((i + 1))
  if [ ! -d "$dir" ]; then
    printf 'MISS\t%s\n' "$i"
    continue
  fi
  if [ ! -r "$dir" ] || [ ! -x "$dir" ]; then
    printf 'UNREADABLE\t%s\n' "$i"
    continue
  fi
  if [ "$i" -eq 1 ]; then
    if real=$(cd -P "$dir" 2>/dev/null && pwd -P && printf x); then
      real=${real%x}; real=${real%"$nl"}
      printf 'REAL\t%s\t%s\n' "$i" "$(hex "$real")"
    else
      printf 'UNRESOLVED\t%s\n' "$i"
    fi
  fi
  for entry in "$dir"/* "$dir"/.[!.]* "$dir"/..?*; do
    [ -L "$entry" ] || [ -e "$entry" ] || continue
    name=${entry##*/}
    if [ -L "$entry" ]; then
      read_target "$entry"
      printf 'LINK\t%s\t%s\t%s\n' "$i" "$(hex "$name")" "$(hex "$LT")"
    elif [ -d "$entry" ]; then
      printf 'DIR\t%s\t%s\n' "$i" "$(hex "$name")"
    fi
  done
done
"#;

pub(super) const REMOTE_PATH_PROBE_BODY: &str = r#"i=0
for p in "$@"; do
  i=$((i + 1))
  if [ -L "$p" ]; then
    read_target "$p"
    printf 'LINK\t%s\t%s\n' "$i" "$(hex "$LT")"
  elif [ -e "$p" ]; then
    printf 'OTHER\t%s\n' "$i"
  else
    printf 'GONE\t%s\n' "$i"
  fi
done
"#;

/// Args: `(path, expected readlink value)` pairs. Removes a link only when it
/// is still a link whose raw target equals the value captured by the locked
/// probe; anything else is reported and left alone.
pub(super) const REMOTE_REMOVE_LINKS_BODY: &str = r#"i=0
while [ "$#" -ge 2 ]; do
  p=$1; want=$2; shift 2
  i=$((i + 1))
  if [ -L "$p" ]; then
    read_target "$p"
    if [ "$LT" = "$want" ]; then
      if rm -f -- "$p"; then printf 'OK\t%s\n' "$i"; else printf 'ERR\t%s\n' "$i"; fi
    else
      printf 'SKIP\t%s\n' "$i"
    fi
  elif [ -e "$p" ]; then
    printf 'SKIP\t%s\n' "$i"
  else
    printf 'GONE\t%s\n' "$i"
  fi
done
"#;

/// Removes untracked Central entries: links without following, directories
/// recursively. Callers validate every path as a direct Central child first.
pub(super) const REMOTE_REMOVE_ENTRIES_BODY: &str = r#"i=0
for p in "$@"; do
  i=$((i + 1))
  if [ -L "$p" ]; then
    if rm -f -- "$p"; then printf 'OK\t%s\n' "$i"; else printf 'ERR\t%s\n' "$i"; fi
  elif [ -d "$p" ]; then
    if rm -rf -- "$p"; then printf 'OK\t%s\n' "$i"; else printf 'ERR\t%s\n' "$i"; fi
  elif [ -e "$p" ]; then
    printf 'SKIP\t%s\n' "$i"
  else
    printf 'GONE\t%s\n' "$i"
  fi
done
"#;

pub(super) fn remote_script(body: &str) -> String {
    format!("{REMOTE_SCRIPT_PRELUDE}{body}")
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum RemoteEntry {
    Link { name: String, target: String },
    Dir { name: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub(super) enum RemoteDirListing {
    #[default]
    Missing,
    Unreadable,
    Entries(Vec<RemoteEntry>),
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub(super) struct RemoteDirProbe {
    pub listings: Vec<RemoteDirListing>,
    /// Physical path of the Central root (index 1); `None` when the root is
    /// missing or could not be resolved.
    pub resolved_root: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum RemotePathState {
    Link(String),
    Other,
    Gone,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum RemoteRemoveStatus {
    Removed,
    Skipped,
    Gone,
    Failed,
}

fn remote_error(_: crate::targets::TargetsError) -> CentralSkillsError {
    CentralSkillsError::Remote("Failed to inspect the selected target.".to_string())
}

fn parse_index(value: &str, len: usize) -> Option<usize> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let index = value.parse::<usize>().ok()?;
    (1..=len).contains(&index).then(|| index - 1)
}

/// Strict lowercase/uppercase hex → UTF-8 text without NUL.
pub(super) fn decode_hex_field(value: &str) -> Option<String> {
    if !value.len().is_multiple_of(2) || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let bytes = (0..value.len())
        .step_by(2)
        .map(|offset| u8::from_str_radix(&value[offset..offset + 2], 16))
        .collect::<Result<Vec<_>, _>>()
        .ok()?;
    let text = String::from_utf8(bytes).ok()?;
    (!text.contains('\0')).then_some(text)
}

fn decode_entry_name(value: &str) -> Option<String> {
    decode_hex_field(value)
        .filter(|name| !name.is_empty() && name != "." && name != ".." && !name.contains('/'))
}

pub(super) async fn probe_remote_dirs(
    connection: &ConnectedRemoteTarget,
    dirs: &[String],
) -> Result<RemoteDirProbe, CentralSkillsError> {
    if dirs.is_empty() {
        return Ok(RemoteDirProbe::default());
    }
    let args = dirs.iter().map(String::as_str).collect::<Vec<_>>();
    let output = connection
        .run_script(&remote_script(REMOTE_DIR_PROBE_BODY), &args)
        .await
        .map_err(remote_error)?;
    Ok(parse_dir_probe(&output, dirs.len()))
}

pub(super) fn parse_dir_probe(output: &str, len: usize) -> RemoteDirProbe {
    let mut listings = vec![RemoteDirListing::Missing; len];
    let mut seen = vec![false; len];
    let mut resolved_root = None;
    for line in output.split('\n') {
        let fields = line.split('\t').collect::<Vec<_>>();
        let Some(index) = fields.get(1).and_then(|value| parse_index(value, len)) else {
            continue;
        };
        let entry = match (fields[0], fields.len()) {
            ("MISS", 2) => {
                listings[index] = RemoteDirListing::Missing;
                continue;
            }
            ("UNREADABLE", 2) => {
                listings[index] = RemoteDirListing::Unreadable;
                continue;
            }
            ("REAL", 3) if index == 0 => {
                resolved_root = decode_hex_field(fields[2])
                    .filter(|path| path.starts_with('/'))
                    .and_then(|path| super::super::delete::normalize_remote_path(&path).ok());
                continue;
            }
            ("UNRESOLVED", 2) if index == 0 => {
                resolved_root = None;
                continue;
            }
            ("LINK", 4) => {
                let (Some(name), Some(target)) =
                    (decode_entry_name(fields[2]), decode_hex_field(fields[3]))
                else {
                    continue;
                };
                RemoteEntry::Link { name, target }
            }
            ("DIR", 3) => {
                let Some(name) = decode_entry_name(fields[2]) else {
                    continue;
                };
                RemoteEntry::Dir { name }
            }
            _ => continue,
        };
        if !seen[index] {
            seen[index] = true;
            listings[index] = RemoteDirListing::Entries(Vec::new());
        }
        if let RemoteDirListing::Entries(entries) = &mut listings[index] {
            entries.push(entry);
        }
    }
    RemoteDirProbe {
        listings,
        resolved_root,
    }
}

pub(super) async fn probe_remote_paths(
    connection: &ConnectedRemoteTarget,
    paths: &[String],
) -> Result<Vec<RemotePathState>, CentralSkillsError> {
    let script = remote_script(REMOTE_PATH_PROBE_BODY);
    let mut states = Vec::with_capacity(paths.len());
    for chunk in paths.chunks(REMOTE_REMOVE_BATCH) {
        let args = chunk.iter().map(String::as_str).collect::<Vec<_>>();
        let output = connection
            .run_script(&script, &args)
            .await
            .map_err(remote_error)?;
        states.extend(parse_path_probe(&output, chunk.len()));
    }
    Ok(states)
}

pub(super) fn parse_path_probe(output: &str, len: usize) -> Vec<RemotePathState> {
    // Unreported or malformed paths are "other" so they are never deleted.
    let mut states = vec![RemotePathState::Other; len];
    for line in output.split('\n') {
        let fields = line.split('\t').collect::<Vec<_>>();
        let Some(index) = fields.get(1).and_then(|value| parse_index(value, len)) else {
            continue;
        };
        states[index] = match (fields[0], fields.len()) {
            ("LINK", 3) => match decode_hex_field(fields[2]) {
                Some(target) => RemotePathState::Link(target),
                None => RemotePathState::Other,
            },
            ("GONE", 2) => RemotePathState::Gone,
            _ => RemotePathState::Other,
        };
    }
    states
}

/// Remove links, verifying each `(path, expected_target)` pair remotely.
pub(super) async fn run_remote_remove_links(
    connection: &ConnectedRemoteTarget,
    pairs: &[(String, String)],
) -> Result<Vec<RemoteRemoveStatus>, CentralSkillsError> {
    let args = pairs
        .iter()
        .flat_map(|(path, target)| [path.as_str(), target.as_str()])
        .collect::<Vec<_>>();
    run_remote_remove(connection, REMOTE_REMOVE_LINKS_BODY, &args, pairs.len()).await
}

pub(super) async fn run_remote_remove_entries(
    connection: &ConnectedRemoteTarget,
    paths: &[String],
) -> Result<Vec<RemoteRemoveStatus>, CentralSkillsError> {
    let args = paths.iter().map(String::as_str).collect::<Vec<_>>();
    run_remote_remove(connection, REMOTE_REMOVE_ENTRIES_BODY, &args, paths.len()).await
}

async fn run_remote_remove(
    connection: &ConnectedRemoteTarget,
    body: &str,
    args: &[&str],
    items: usize,
) -> Result<Vec<RemoteRemoveStatus>, CentralSkillsError> {
    if items == 0 {
        return Ok(Vec::new());
    }
    let output = connection
        .run_script(&remote_script(body), args)
        .await
        .map_err(|_| {
            CentralSkillsError::Remote(
                "Failed to remove entries on the selected target.".to_string(),
            )
        })?;
    Ok(parse_remove_output(&output, items))
}

pub(super) fn parse_remove_output(output: &str, len: usize) -> Vec<RemoteRemoveStatus> {
    // Missing or malformed status lines are failures: the outcome is unknown.
    let mut statuses = vec![RemoteRemoveStatus::Failed; len];
    for line in output.split('\n') {
        let fields = line.split('\t').collect::<Vec<_>>();
        if fields.len() != 2 {
            continue;
        }
        let Some(index) = parse_index(fields[1], len) else {
            continue;
        };
        statuses[index] = match fields[0] {
            "OK" => RemoteRemoveStatus::Removed,
            "SKIP" => RemoteRemoveStatus::Skipped,
            "GONE" => RemoteRemoveStatus::Gone,
            _ => RemoteRemoveStatus::Failed,
        };
    }
    statuses
}

/// Resolve a raw `readlink` value against the link's parent directory.
pub(super) fn resolve_remote_link_target(link_parent: &str, raw: &str) -> String {
    if raw.starts_with('/') {
        raw.to_string()
    } else {
        crate::paths::remote_join(link_parent, raw)
    }
}
