//! Bounded, fail-closed reader for portable bundles.
//!
//! The reader never touches Central, the database, or the network. It
//! sniffs the input (ZIP, legacy v1 JSON, or something else), runs the
//! shared ZIP safety inventory, parses `manifest.json`, and verifies every
//! payload file against the manifest. Whole-bundle problems are errors;
//! problems confined to one skill are reported in
//! [`ParsedBundle::invalid_skills`] so the rest of the bundle stays usable.

// The import preview/apply commands (task `portable-bundle-import`) are the
// production callers; until they land only tests exercise the reader.
#![cfg_attr(not(test), allow(dead_code))]

use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::{Cursor, Read};
use std::path::Path;

use zip::ZipArchive;

use crate::services::central_updates::{content_digest_of, sha256_hex, SkillTreeFile};
use crate::services::local_archive_import::inventory::{
    build_inventory, fingerprint_of, ArchiveFingerprint,
};
use crate::services::local_archive_import::LocalArchiveImportError;
use crate::services::resource_budget::{BudgetExceeded, ResourceBudget};

use super::collect::is_portable_skill_id;
use super::error::PortableBundleError;
use super::types::{
    BundleManifest, BundleSkill, BUNDLE_FORMAT_VERSION, BUNDLE_KIND, LEGACY_V1_KIND,
    MANIFEST_MAX_BYTES, MANIFEST_PATH, SKILLS_DIR,
};

const UTF8_BOM: &[u8] = &[0xef, 0xbb, 0xbf];

#[derive(Debug, Clone)]
pub(crate) struct ParsedBundle {
    pub(crate) fingerprint: ArchiveFingerprint,
    pub(crate) manifest: BundleManifest,
    /// Skill id → stable reason code (`invalid_id`, `payload_mismatch`,
    /// `integrity_mismatch`, `manifest_missing`, `unknown_tag`).
    pub(crate) invalid_skills: BTreeMap<String, String>,
}

/// Read a bundle file under the archive budget. Blocking.
pub(crate) fn read_bundle_bytes(
    path: &Path,
    budget: ResourceBudget,
) -> Result<Vec<u8>, PortableBundleError> {
    let file = std::fs::File::open(path)
        .map_err(|source| PortableBundleError::io("Failed to open bundle file", source))?;
    let metadata = file
        .metadata()
        .map_err(|source| PortableBundleError::io("Failed to inspect bundle file", source))?;
    if !metadata.is_file() {
        return Err(PortableBundleError::NotABundle(
            "path is not a regular file".to_string(),
        ));
    }
    budget.reject_archive_size(metadata.len())?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(budget.archive_bytes.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|source| PortableBundleError::io("Failed to read bundle file", source))?;
    budget.reject_archive_size(bytes.len() as u64)?;
    Ok(bytes)
}

/// Parse and verify bundle bytes. Blocking (hashes every payload file).
pub(crate) fn parse_bundle(
    bytes: &[u8],
    budget: ResourceBudget,
) -> Result<ParsedBundle, PortableBundleError> {
    if !bytes.starts_with(b"PK") {
        return Err(classify_non_zip(bytes));
    }
    let inventory = build_inventory(bytes, budget).map_err(map_inventory_error)?;
    let mut zip = ZipArchive::new(Cursor::new(bytes))?;

    let manifest_entry = inventory
        .entries
        .iter()
        .find(|entry| entry.path == MANIFEST_PATH)
        .ok_or(PortableBundleError::ManifestMissing)?;
    if manifest_entry.byte_len > MANIFEST_MAX_BYTES {
        return Err(BudgetExceeded::new(
            "Portable bundle manifest",
            manifest_entry.byte_len,
            MANIFEST_MAX_BYTES,
        )
        .into());
    }
    let manifest_bytes = read_entry(&mut zip, MANIFEST_PATH)?;
    let manifest = parse_manifest(&manifest_bytes)?;
    validate_manifest_structure(&manifest)?;

    let entry_sizes = inventory
        .entries
        .iter()
        .map(|entry| (entry.path.as_str(), entry.byte_len))
        .collect::<HashMap<_, _>>();
    let declared = declared_payload_paths(&manifest);
    if let Some(orphan) = inventory
        .entries
        .iter()
        .find(|entry| entry.path != MANIFEST_PATH && !declared.contains(entry.path.as_str()))
    {
        return Err(PortableBundleError::IntegrityMismatch(format!(
            "undeclared entry '{}'",
            orphan.path
        )));
    }

    let tag_keys = manifest
        .tags
        .iter()
        .map(|tag| tag.key.as_str())
        .collect::<HashSet<_>>();
    let mut invalid_skills = BTreeMap::new();
    for skill in &manifest.skills {
        if let Some(reason) = verify_skill(&mut zip, &entry_sizes, &tag_keys, skill)? {
            invalid_skills.insert(skill.id.clone(), reason.to_string());
        }
    }

    Ok(ParsedBundle {
        fingerprint: fingerprint_of(bytes),
        manifest,
        invalid_skills,
    })
}

/// Extract one verified skill's files from bundle bytes. Blocking.
pub(crate) fn read_skill_payload(
    bytes: &[u8],
    skill: &BundleSkill,
) -> Result<Vec<SkillTreeFile>, PortableBundleError> {
    let mut zip = ZipArchive::new(Cursor::new(bytes))?;
    let mut files = Vec::with_capacity(skill.files.len());
    for file in &skill.files {
        let bytes = read_entry(&mut zip, &format!("{}/{}", skill.payload_dir, file.path))?;
        if sha256_hex(&bytes) != file.sha256 {
            return Err(PortableBundleError::IntegrityMismatch(format!(
                "skill '{}' file '{}' changed",
                skill.id, file.path
            )));
        }
        files.push(SkillTreeFile {
            relative_path: file.path.clone(),
            bytes,
        });
    }
    Ok(files)
}

fn classify_non_zip(bytes: &[u8]) -> PortableBundleError {
    let text = if bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]) {
        decode_utf16(bytes)
    } else {
        std::str::from_utf8(bytes.strip_prefix(UTF8_BOM).unwrap_or(bytes))
            .ok()
            .map(str::to_string)
    };
    let kind = text
        .as_deref()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(text).ok())
        .and_then(|value| {
            value
                .get("kind")
                .and_then(|kind| kind.as_str())
                .map(str::to_string)
        });
    match kind.as_deref() {
        Some(LEGACY_V1_KIND) => PortableBundleError::LegacyV1,
        Some(BUNDLE_KIND) => {
            PortableBundleError::NotABundle("bare manifest without payload archive".to_string())
        }
        _ => PortableBundleError::NotABundle("not a ZIP archive".to_string()),
    }
}

fn decode_utf16(bytes: &[u8]) -> Option<String> {
    let little_endian = bytes.starts_with(&[0xff, 0xfe]);
    let units = bytes[2..]
        .as_chunks::<2>()
        .0
        .iter()
        .map(|&pair| {
            if little_endian {
                u16::from_le_bytes(pair)
            } else {
                u16::from_be_bytes(pair)
            }
        })
        .collect::<Vec<_>>();
    String::from_utf16(&units).ok()
}

fn parse_manifest(bytes: &[u8]) -> Result<BundleManifest, PortableBundleError> {
    if bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]) {
        return Err(PortableBundleError::ManifestEncoding);
    }
    let text = std::str::from_utf8(bytes.strip_prefix(UTF8_BOM).unwrap_or(bytes))
        .map_err(|_| PortableBundleError::ManifestEncoding)?;
    let value = serde_json::from_str::<serde_json::Value>(text)
        .map_err(|error| PortableBundleError::ManifestInvalid(error.to_string()))?;
    match value.get("kind").and_then(|kind| kind.as_str()) {
        Some(BUNDLE_KIND) => {}
        Some(LEGACY_V1_KIND) => return Err(PortableBundleError::LegacyV1),
        _ => {
            return Err(PortableBundleError::NotABundle(
                "manifest kind is not a SkillPort bundle".to_string(),
            ))
        }
    }
    let version = value
        .get("formatVersion")
        .and_then(|version| version.as_u64())
        .ok_or_else(|| PortableBundleError::ManifestInvalid("missing formatVersion".to_string()))?;
    if version != u64::from(BUNDLE_FORMAT_VERSION) {
        return Err(PortableBundleError::UnsupportedVersion(
            u32::try_from(version).unwrap_or(u32::MAX),
        ));
    }
    // Parse from text (not the Value) so serde errors carry line/column.
    serde_json::from_str::<BundleManifest>(text)
        .map_err(|error| PortableBundleError::ManifestInvalid(error.to_string()))
}

/// Whole-manifest invariants. Violations make the bundle unusable.
fn validate_manifest_structure(manifest: &BundleManifest) -> Result<(), PortableBundleError> {
    let invalid = |detail: String| Err(PortableBundleError::ManifestInvalid(detail));

    let mut group_keys = HashSet::new();
    for group in &manifest.tag_groups {
        if !group_keys.insert(group.key.as_str()) {
            return invalid(format!("duplicate tag group key '{}'", group.key));
        }
    }
    let mut tag_keys = HashSet::new();
    let mut tag_names = HashSet::new();
    for tag in &manifest.tags {
        if !tag_keys.insert(tag.key.as_str()) {
            return invalid(format!("duplicate tag key '{}'", tag.key));
        }
        if !tag_names.insert(tag.name.as_str()) {
            return invalid(format!("duplicate tag name '{}'", tag.name));
        }
        if let Some(group_key) = &tag.group_key {
            if !group_keys.contains(group_key.as_str()) {
                return invalid(format!("tag '{}' references unknown group", tag.key));
            }
        }
    }
    let mut skill_ids = HashSet::new();
    for skill in &manifest.skills {
        if !skill_ids.insert(skill.id.to_ascii_lowercase()) {
            return invalid(format!("duplicate skill id '{}'", skill.id));
        }
    }
    Ok(())
}

/// Every payload path the manifest declares, for orphan detection.
fn declared_payload_paths(manifest: &BundleManifest) -> HashSet<String> {
    manifest
        .skills
        .iter()
        .flat_map(|skill| {
            skill
                .files
                .iter()
                .map(move |file| format!("{}/{}", skill.payload_dir, file.path))
        })
        .collect()
}

fn verify_skill(
    zip: &mut ZipArchive<Cursor<&[u8]>>,
    entry_sizes: &HashMap<&str, u64>,
    tag_keys: &HashSet<&str>,
    skill: &BundleSkill,
) -> Result<Option<&'static str>, PortableBundleError> {
    if !is_portable_skill_id(&skill.id) {
        return Ok(Some("invalid_id"));
    }
    if skill.payload_dir != format!("{SKILLS_DIR}/{}", skill.id) {
        return Ok(Some("payload_mismatch"));
    }
    if skill
        .tag_keys
        .iter()
        .any(|key| !tag_keys.contains(key.as_str()))
    {
        return Ok(Some("unknown_tag"));
    }
    if !skill
        .files
        .iter()
        .any(|file| file.path.eq_ignore_ascii_case("SKILL.md"))
    {
        return Ok(Some("manifest_missing"));
    }

    let mut seen = HashSet::new();
    let mut digest_entries = Vec::with_capacity(skill.files.len());
    for file in &skill.files {
        let entry_path = format!("{}/{}", skill.payload_dir, file.path);
        if !seen.insert(file.path.as_str())
            || entry_sizes.get(entry_path.as_str()) != Some(&file.size)
        {
            return Ok(Some("payload_mismatch"));
        }
        let bytes = read_entry(zip, &entry_path)?;
        let sha256 = sha256_hex(&bytes);
        if sha256 != file.sha256 {
            return Ok(Some("integrity_mismatch"));
        }
        digest_entries.push((file.path.clone(), sha256));
    }
    if content_digest_of(digest_entries) != skill.content_digest {
        return Ok(Some("integrity_mismatch"));
    }
    Ok(None)
}

fn read_entry(
    zip: &mut ZipArchive<Cursor<&[u8]>>,
    path: &str,
) -> Result<Vec<u8>, PortableBundleError> {
    let mut entry = zip.by_name(path).map_err(|error| match error {
        zip::result::ZipError::FileNotFound => {
            PortableBundleError::IntegrityMismatch(format!("missing entry '{path}'"))
        }
        other => PortableBundleError::Zip(other),
    })?;
    // The inventory already bounded the declared size; never decompress past it.
    let declared = entry.size();
    let mut bytes = Vec::with_capacity(declared as usize);
    (&mut entry)
        .take(declared.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|source| PortableBundleError::io("Failed to read bundle entry", source))?;
    if bytes.len() as u64 != declared {
        return Err(PortableBundleError::IntegrityMismatch(format!(
            "entry '{path}' size differs from its header"
        )));
    }
    Ok(bytes)
}

fn map_inventory_error(error: LocalArchiveImportError) -> PortableBundleError {
    match error {
        LocalArchiveImportError::BudgetExceeded(budget) => PortableBundleError::Budget(budget),
        LocalArchiveImportError::ArchiveReadFailed(detail) => {
            PortableBundleError::NotABundle(detail)
        }
        other => PortableBundleError::UnsafeEntry(other.to_string()),
    }
}
