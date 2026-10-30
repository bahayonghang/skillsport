//! `skills import --from-zip | --from-dir` contracts for `cli_api`.

use std::collections::BTreeSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde_json::Value;
use zip::write::{SimpleFileOptions, ZipWriter};

use super::{CliApiError, CliContext, SkillImportRequest, SkillImportSource};
use crate::db::DbPool;
use crate::test_support;

const AGENT: &str = "claude-code";

struct Fixture {
    context: CliContext,
    pool: DbPool,
    temp: tempfile::TempDir,
}

impl Fixture {
    fn central(&self) -> PathBuf {
        self.temp.path().join("central")
    }

    fn src(&self) -> PathBuf {
        self.temp.path().join("src")
    }

    fn agent_dir(&self) -> PathBuf {
        self.temp.path().join("agent-skills")
    }

    /// Central tree plus table row counts: the side-effect fingerprint.
    async fn state(&self) -> (BTreeSet<PathBuf>, BTreeSet<PathBuf>, Vec<i64>) {
        let mut counts = Vec::new();
        for table in ["skills", "skill_installations", "operation_logs"] {
            counts.push(
                sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
                    .fetch_one(&self.pool)
                    .await
                    .unwrap(),
            );
        }
        (tree(&self.central()), tree(&self.agent_dir()), counts)
    }
}

async fn fixture() -> Fixture {
    let pool = test_support::mem_pool().await;
    let temp = tempfile::tempdir().unwrap();
    let central = temp.path().join("central");
    std::fs::create_dir_all(&central).unwrap();
    test_support::set_agent_dir(&pool, "central", &central).await;
    let agent_dir = temp.path().join("agent-skills");
    std::fs::create_dir_all(&agent_dir).unwrap();
    test_support::set_agent_dir(&pool, AGENT, &agent_dir).await;
    std::fs::create_dir_all(temp.path().join("src")).unwrap();
    Fixture {
        context: CliContext::new(
            pool.clone(),
            Arc::new(crate::secrets::MockSecretStore::default()),
        ),
        pool,
        temp,
    }
}

fn tree(root: &Path) -> BTreeSet<PathBuf> {
    fn walk(root: &Path, dir: &Path, out: &mut BTreeSet<PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            out.insert(path.strip_prefix(root).unwrap().to_path_buf());
            if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                walk(root, &path, out);
            }
        }
    }
    let mut out = BTreeSet::new();
    walk(root, root, &mut out);
    out
}

fn zip_bytes(files: &[(&str, &[u8])]) -> Vec<u8> {
    let mut buffer = std::io::Cursor::new(Vec::new());
    let mut writer = ZipWriter::new(&mut buffer);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    for (name, bytes) in files {
        writer.start_file(*name, options).unwrap();
        writer.write_all(bytes).unwrap();
    }
    writer.finish().unwrap();
    buffer.into_inner()
}

fn skill_zip(fixture: &Fixture, file: &str, name: &str, extra: &[u8]) -> PathBuf {
    let manifest = format!("---\nname: {name}\ndescription: zipped\n---\n# {name}\n");
    let bytes = zip_bytes(&[
        ("demo/SKILL.md", manifest.as_bytes()),
        ("demo/notes.txt", extra),
    ]);
    let path = fixture.src().join(file);
    std::fs::write(&path, bytes).unwrap();
    path
}

fn request(
    source: SkillImportSource,
    cwd: &Path,
    replace: bool,
    dry_run: bool,
    yes: bool,
) -> SkillImportRequest<'_> {
    SkillImportRequest {
        source,
        replace,
        sync: false,
        agent_ids: &[],
        method: "copy",
        cwd,
        dry_run,
        yes,
    }
}

async fn skill_row(pool: &DbPool, id: &str) -> Option<(String, Option<String>, bool)> {
    sqlx::query_as("SELECT uid, source, is_central FROM skills WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .unwrap()
}

async fn last_log(pool: &DbPool) -> (String, String, String, Option<String>, Value) {
    let (category, action, status, error, details): (
        String,
        String,
        String,
        Option<String>,
        String,
    ) = sqlx::query_as(
        "SELECT category, action, status, error_summary, details_json
         FROM operation_logs ORDER BY rowid DESC LIMIT 1",
    )
    .fetch_one(pool)
    .await
    .unwrap();
    (
        category,
        action,
        status,
        error,
        serde_json::from_str(&details).unwrap(),
    )
}

// ─── ZIP ─────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn zip_import_creates_a_central_skill_and_logs_the_archive_category() {
    let fx = fixture().await;
    skill_zip(&fx, "demo.zip", "Demo", b"v1");
    let output = fx
        .context
        .import_skill(request(
            SkillImportSource::Zip(PathBuf::from("demo.zip")),
            &fx.src(),
            false,
            false,
            false,
        ))
        .await
        .unwrap();
    assert!(!output.dry_run);
    assert_eq!(output.plans[0].action, "create");
    assert_eq!(output.plans[0].source_type, "zip");
    assert_eq!(output.plans[0].file_count, Some(2));
    let result = output.result.unwrap();
    assert_eq!(result.skill_id, "demo");
    assert!(!result.replaced_existing);
    assert!(fx.central().join("demo").join("notes.txt").is_file());
    let (uid, source, central) = skill_row(&fx.pool, "demo").await.unwrap();
    assert_eq!(uid, result.skill_uid);
    assert_eq!(source.as_deref(), Some("local-archive"));
    assert!(central);

    let (category, action, status, error, details) = last_log(&fx.pool).await;
    assert_eq!(category, "import");
    assert_eq!(action, "import_local_skill_archive");
    assert_eq!(status, "succeeded");
    assert!(error.is_none());
    assert_eq!(details["source"], "cli");
    assert_eq!(details["sourceType"], "zip");
    assert_eq!(details["fileCount"], 2);
    assert!(!details.to_string().contains("demo.zip"));
}

#[tokio::test]
async fn zip_dry_run_writes_nothing() {
    let fx = fixture().await;
    let zip = skill_zip(&fx, "demo.zip", "Demo", b"v1");
    let before = fx.state().await;
    let output = fx
        .context
        .import_skill(request(
            SkillImportSource::Zip(zip),
            &fx.src(),
            false,
            true,
            false,
        ))
        .await
        .unwrap();
    assert!(output.dry_run);
    assert!(output.result.is_none());
    assert_eq!(output.plans[0].skill_id, "demo");
    assert_eq!(
        PathBuf::from(&output.plans[0].target_path),
        fx.central().join("demo")
    );
    assert_eq!(fx.state().await, before);
}

#[tokio::test]
async fn zip_duplicate_requires_replace_and_replace_requires_yes() {
    let fx = fixture().await;
    test_support::seed_central_skill(&fx.pool, &fx.central().join("demo"), "demo", "old").await;
    let zip = skill_zip(&fx, "demo.zip", "Demo", b"v2");
    let before = fx.state().await;

    let preview = fx
        .context
        .import_skill(request(
            SkillImportSource::Zip(zip.clone()),
            &fx.src(),
            false,
            true,
            false,
        ))
        .await
        .unwrap();
    assert_eq!(preview.plans[0].action, "duplicate");
    assert!(preview.plans[0].exists);

    let duplicate = fx
        .context
        .import_skill(request(
            SkillImportSource::Zip(zip.clone()),
            &fx.src(),
            false,
            false,
            true,
        ))
        .await
        .unwrap_err();
    assert_eq!(duplicate.code(), "skill.duplicate");
    assert_eq!(duplicate.exit_code(), 3);

    let unconfirmed = fx
        .context
        .import_skill(request(
            SkillImportSource::Zip(zip.clone()),
            &fx.src(),
            true,
            false,
            false,
        ))
        .await
        .unwrap_err();
    assert_eq!(unconfirmed.code(), "input.confirmation_required");
    assert_eq!(unconfirmed.details()["plans"][0]["action"], "replace");
    assert_eq!(fx.state().await, before);

    let replaced = fx
        .context
        .import_skill(request(
            SkillImportSource::Zip(zip),
            &fx.src(),
            true,
            false,
            true,
        ))
        .await
        .unwrap()
        .result
        .unwrap();
    assert!(replaced.replaced_existing);
    assert_eq!(replaced.skill_uid, "demo-uid", "replace keeps the uid");
    assert_eq!(
        std::fs::read(fx.central().join("demo").join("notes.txt")).unwrap(),
        b"v2"
    );
}

#[tokio::test]
async fn zip_fingerprint_mismatch_stops_before_any_write() {
    let fx = fixture().await;
    let zip = skill_zip(&fx, "demo.zip", "Demo", b"v1");
    let preview = crate::services::local_archive_import::preview_local_skill_archive_impl(
        &fx.pool,
        &zip.to_string_lossy(),
    )
    .await
    .unwrap();
    skill_zip(&fx, "demo.zip", "Demo", b"swapped between reads");
    let central_before = tree(&fx.central());

    let error = fx
        .context
        .apply_zip_import(&zip.to_string_lossy(), preview.fingerprint)
        .await
        .unwrap_err();
    assert!(matches!(error, CliApiError::ArchiveChanged(_)));
    assert_eq!(error.code(), "archive.fingerprint_mismatch");
    assert_eq!(error.exit_code(), 3);
    assert!(!error.to_string().contains(&*zip.to_string_lossy()));
    assert_eq!(tree(&fx.central()), central_before);
    assert!(skill_row(&fx.pool, "demo").await.is_none());
    let (category, _, status, error_code, _) = last_log(&fx.pool).await;
    assert_eq!(category, "import");
    assert_eq!(status, "failed");
    assert_eq!(error_code.as_deref(), Some("archive.fingerprint_mismatch"));
}

#[tokio::test]
async fn zip_path_traversal_is_rejected_without_writes() {
    let fx = fixture().await;
    let bytes = zip_bytes(&[
        ("SKILL.md", b"---\nname: Evil\n---\n" as &[u8]),
        ("../escape.txt", b"x"),
    ]);
    let zip = fx.src().join("evil.zip");
    std::fs::write(&zip, bytes).unwrap();
    let before = fx.state().await;
    let error = fx
        .context
        .import_skill(request(
            SkillImportSource::Zip(zip),
            &fx.src(),
            false,
            false,
            true,
        ))
        .await
        .unwrap_err();
    assert_eq!(error.code(), "input.invalid");
    assert!(error.to_string().starts_with("local_archive."));
    assert!(!error.to_string().contains("escape"));
    assert_eq!(fx.state().await, before);
    assert!(!fx.temp.path().join("escape.txt").exists());
}

#[tokio::test]
async fn zip_missing_file_is_path_invalid() {
    let fx = fixture().await;
    let error = fx
        .context
        .import_skill(request(
            SkillImportSource::Zip(PathBuf::from("missing.zip")),
            &fx.src(),
            false,
            false,
            false,
        ))
        .await
        .unwrap_err();
    assert_eq!(error.code(), "path.invalid");
    assert_eq!(error.exit_code(), 2);
}

#[tokio::test]
async fn zip_import_with_sync_installs_and_multi_agent_sync_needs_yes() {
    let fx = fixture().await;
    let zip = skill_zip(&fx, "demo.zip", "Demo", b"v1");
    let codex_dir = fx.temp.path().join("codex-skills");
    test_support::set_agent_dir(&fx.pool, "codex", &codex_dir).await;
    let before = fx.state().await;

    let agents = vec![AGENT.to_string(), "codex".to_string()];
    let unconfirmed = fx
        .context
        .import_skill(SkillImportRequest {
            sync: true,
            agent_ids: &agents,
            ..request(
                SkillImportSource::Zip(zip.clone()),
                &fx.src(),
                false,
                false,
                false,
            )
        })
        .await
        .unwrap_err();
    assert_eq!(unconfirmed.code(), "input.confirmation_required");
    assert_eq!(
        unconfirmed.details()["plans"][0]["syncAgents"],
        serde_json::json!([AGENT, "codex"])
    );
    assert_eq!(fx.state().await, before);

    let one = vec![AGENT.to_string()];
    let output = fx
        .context
        .import_skill(SkillImportRequest {
            sync: true,
            agent_ids: &one,
            ..request(SkillImportSource::Zip(zip), &fx.src(), false, false, false)
        })
        .await
        .unwrap();
    let result = output.result.unwrap();
    assert!(!result.is_partial_failure());
    let sync = result.sync.unwrap();
    assert_eq!(sync.result.unwrap().succeeded.len(), 1);
    assert!(fx.agent_dir().join("demo").join("SKILL.md").exists());
}

#[tokio::test]
async fn unknown_sync_agent_fails_before_import() {
    let fx = fixture().await;
    let zip = skill_zip(&fx, "demo.zip", "Demo", b"v1");
    let before = fx.state().await;
    let agents = vec!["no-such-agent".to_string()];
    let error = fx
        .context
        .import_skill(SkillImportRequest {
            sync: true,
            agent_ids: &agents,
            ..request(SkillImportSource::Zip(zip), &fx.src(), false, false, true)
        })
        .await
        .unwrap_err();
    assert_eq!(error.code(), "input.invalid");
    assert_eq!(fx.state().await, before);
}

// ─── Directory ───────────────────────────────────────────────────────────────

fn source_dir(fx: &Fixture, name: &str) -> PathBuf {
    let dir = test_support::write_skill_md(&fx.src().join(name), "Dir Skill", Some("from dir"));
    std::fs::create_dir_all(dir.join("refs")).unwrap();
    std::fs::write(dir.join("refs").join("a.md"), "a").unwrap();
    dir
}

#[tokio::test]
async fn dir_import_copies_the_tree_and_logs_with_the_import_category() {
    let fx = fixture().await;
    source_dir(&fx, "My Skill");
    let output = fx
        .context
        .import_skill(request(
            SkillImportSource::Dir(PathBuf::from("My Skill")),
            &fx.src(),
            false,
            false,
            false,
        ))
        .await
        .unwrap();
    let plan = &output.plans[0];
    assert_eq!(plan.source_type, "dir");
    assert_eq!(plan.skill_id, "my-skill", "scanner id rule");
    assert_eq!(plan.skill_name, "Dir Skill");
    let result = output.result.unwrap();
    assert!(fx
        .central()
        .join("my-skill")
        .join("refs")
        .join("a.md")
        .is_file());
    assert!(
        fx.src().join("My Skill").join("SKILL.md").is_file(),
        "source kept"
    );
    let (uid, source, central) = skill_row(&fx.pool, "my-skill").await.unwrap();
    assert_eq!(uid, result.skill_uid);
    assert_eq!(source.as_deref(), Some("local-dir"));
    assert!(central);
    let leftovers = std::fs::read_dir(fx.central())
        .unwrap()
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    assert_eq!(leftovers, ["my-skill"], "no staging or backup residue");

    let (category, action, status, _, details) = last_log(&fx.pool).await;
    assert_eq!(category, "import");
    assert_eq!(action, "cli_import_local_dir");
    assert_eq!(status, "succeeded");
    assert_eq!(details["sourceType"], "dir");
    assert!(!details.to_string().contains("My Skill"));
}

#[tokio::test]
async fn dir_dry_run_writes_nothing() {
    let fx = fixture().await;
    let dir = source_dir(&fx, "demo");
    let before = fx.state().await;
    let output = fx
        .context
        .import_skill(request(
            SkillImportSource::Dir(dir),
            &fx.src(),
            false,
            true,
            false,
        ))
        .await
        .unwrap();
    assert!(output.dry_run && output.result.is_none());
    assert_eq!(output.plans[0].action, "create");
    assert_eq!(fx.state().await, before);
}

#[tokio::test]
async fn dir_without_skill_md_or_frontmatter_is_rejected() {
    let fx = fixture().await;
    let empty = fx.src().join("empty");
    std::fs::create_dir_all(&empty).unwrap();
    let before = fx.state().await;
    let error = fx
        .context
        .import_skill(request(
            SkillImportSource::Dir(empty),
            &fx.src(),
            false,
            false,
            true,
        ))
        .await
        .unwrap_err();
    assert_eq!(error.code(), "path.invalid");
    assert_eq!(error.exit_code(), 2);

    let bad = fx.src().join("bad");
    std::fs::create_dir_all(&bad).unwrap();
    std::fs::write(bad.join("SKILL.md"), "# no frontmatter").unwrap();
    let error = fx
        .context
        .import_skill(request(
            SkillImportSource::Dir(bad),
            &fx.src(),
            false,
            false,
            true,
        ))
        .await
        .unwrap_err();
    assert_eq!(error.code(), "input.invalid");

    let missing = fx
        .context
        .import_skill(request(
            SkillImportSource::Dir(PathBuf::from("nope")),
            &fx.src(),
            false,
            false,
            true,
        ))
        .await
        .unwrap_err();
    assert_eq!(missing.code(), "path.invalid");
    assert_eq!(fx.state().await, before);
}

#[tokio::test]
async fn dir_inside_or_containing_central_is_rejected() {
    let fx = fixture().await;
    test_support::seed_central_skill(&fx.pool, &fx.central().join("demo"), "demo", "x").await;
    let before = fx.state().await;
    for source in [
        fx.central().join("demo"),
        fx.central(),
        fx.temp.path().to_path_buf(),
    ] {
        let error = fx
            .context
            .import_skill(request(
                SkillImportSource::Dir(source.clone()),
                &fx.src(),
                true,
                true,
                true,
            ))
            .await
            .unwrap_err();
        assert_eq!(error.code(), "path.invalid", "{}", source.display());
    }
    assert_eq!(fx.state().await, before);
}

#[tokio::test]
async fn dir_replace_keeps_uid_and_requires_yes() {
    let fx = fixture().await;
    test_support::seed_central_skill(&fx.pool, &fx.central().join("demo"), "demo", "old").await;
    let dir = source_dir(&fx, "demo");
    let before = fx.state().await;
    let duplicate = fx
        .context
        .import_skill(request(
            SkillImportSource::Dir(dir.clone()),
            &fx.src(),
            false,
            false,
            true,
        ))
        .await
        .unwrap_err();
    assert_eq!(duplicate.code(), "skill.duplicate");
    let unconfirmed = fx
        .context
        .import_skill(request(
            SkillImportSource::Dir(dir.clone()),
            &fx.src(),
            true,
            false,
            false,
        ))
        .await
        .unwrap_err();
    assert_eq!(unconfirmed.code(), "input.confirmation_required");
    assert_eq!(fx.state().await, before);

    let result = fx
        .context
        .import_skill(request(
            SkillImportSource::Dir(dir),
            &fx.src(),
            true,
            false,
            true,
        ))
        .await
        .unwrap()
        .result
        .unwrap();
    assert!(result.replaced_existing);
    assert_eq!(result.skill_uid, "demo-uid");
    assert!(fx
        .central()
        .join("demo")
        .join("refs")
        .join("a.md")
        .is_file());
    let (_, source, _) = skill_row(&fx.pool, "demo").await.unwrap();
    assert_eq!(source.as_deref(), Some("local-dir"));
}

/// Create a directory symlink, or return false when the platform refuses
/// (Windows without Developer Mode or elevation).
fn try_symlink_dir(target: &Path, link: &Path) -> bool {
    #[cfg(unix)]
    let created = std::os::unix::fs::symlink(target, link);
    #[cfg(windows)]
    let created = std::os::windows::fs::symlink_dir(target, link);
    created.is_ok()
}

#[tokio::test]
async fn dir_symlink_root_is_followed_and_nested_symlinks_are_rejected() {
    let fx = fixture().await;
    let real = source_dir(&fx, "real-skill");
    let link = fx.src().join("Linked Skill");
    if !try_symlink_dir(&real, &link) {
        eprintln!("skipping: directory symlinks are unavailable");
        return;
    }
    let output = fx
        .context
        .import_skill(request(
            SkillImportSource::Dir(link),
            &fx.src(),
            false,
            false,
            false,
        ))
        .await
        .unwrap();
    assert_eq!(
        output.plans[0].skill_id, "linked-skill",
        "id from the link name"
    );
    let copied = fx.central().join("linked-skill");
    assert!(!std::fs::symlink_metadata(&copied)
        .unwrap()
        .file_type()
        .is_symlink());
    assert!(copied.join("refs").join("a.md").is_file());

    let nested = source_dir(&fx, "nested");
    assert!(try_symlink_dir(&real, &nested.join("outside")));
    let before = fx.state().await;
    let error = fx
        .context
        .import_skill(request(
            SkillImportSource::Dir(nested),
            &fx.src(),
            false,
            false,
            false,
        ))
        .await
        .unwrap_err();
    assert_eq!(error.code(), "path.invalid");
    assert!(error.to_string().contains("symbolic link"));
    assert_eq!(fx.state().await, before);
}
