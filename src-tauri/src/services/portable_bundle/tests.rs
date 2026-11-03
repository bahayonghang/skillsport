use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::Instant;

use tempfile::TempDir;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use super::collect::{collect_metadata, normalize_source_path};
use super::reader::{parse_bundle, read_bundle_bytes, read_skill_payload};
use super::types::{BUNDLE_KIND, MANIFEST_PATH};
use super::writer::BundleWriter;
use super::*;
use crate::db::{self, DbPool, Skill};
use crate::services::central_updates::{CentralFs, SkillTreeFile};
use crate::services::resource_budget::ResourceBudget;
use crate::test_support::mem_pool;

const JOB: BundleJob<'static> = BundleJob {
    job_id: "bundle-test",
    app: None,
    cancel: None,
};

fn central_skill(root: &Path, id: &str) -> Skill {
    let dir = root.join(id);
    Skill {
        id: id.to_string(),
        uid: format!("{id}-uid"),
        name: id.to_string(),
        description: Some(format!("{id} description")),
        file_path: dir.join("SKILL.md").to_string_lossy().into_owned(),
        canonical_path: Some(dir.to_string_lossy().into_owned()),
        is_central: true,
        source: None,
        content: None,
        scanned_at: "2026-10-28T00:00:00Z".to_string(),
        fs_created_at: None,
        fs_updated_at: None,
    }
}

/// Create a Central skill directory and its database row.
async fn seed_skill(pool: &DbPool, root: &Path, id: &str, extra: &[(&str, &[u8])]) {
    let dir = root.join(id);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("SKILL.md"),
        format!("---\nname: {id}\n---\nbody\n"),
    )
    .unwrap();
    for (path, bytes) in extra {
        let file = dir.join(path);
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(file, bytes).unwrap();
    }
    db::upsert_skill(pool, &central_skill(root, id))
        .await
        .unwrap();
}

async fn tag_skill(pool: &DbPool, skill_id: &str, tag_name: &str) -> String {
    let tag = match db::get_skill_tag_by_name(pool, tag_name).await.unwrap() {
        Some(tag) => tag,
        None => db::create_skill_tag(pool, tag_name, None, Some("#123456"))
            .await
            .unwrap(),
    };
    db::assign_skill_tags(
        pool,
        &[skill_id.to_string()],
        std::slice::from_ref(&tag.id),
        "manual",
        None,
        None,
    )
    .await
    .unwrap();
    tag.id
}

async fn export_to(pool: &DbPool, path: &Path) -> PortableBundleExportResult {
    export_bundle(pool, &CentralFs::Local, "local", path.to_path_buf(), JOB)
        .await
        .unwrap()
}

fn parse_file(path: &Path) -> (Vec<u8>, super::reader::ParsedBundle) {
    let bytes = read_bundle_bytes(path, ResourceBudget::portable_bundle()).unwrap();
    let parsed = parse_bundle(&bytes, ResourceBudget::portable_bundle()).unwrap();
    (bytes, parsed)
}

fn zip_bytes(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    for (name, bytes) in entries {
        zip.start_file(*name, SimpleFileOptions::default()).unwrap();
        zip.write_all(bytes).unwrap();
    }
    zip.finish().unwrap().into_inner()
}

/// Valid single-skill bundle bytes plus its manifest, for mutation tests.
async fn sample_bundle() -> (TempDir, Vec<u8>, BundleManifest) {
    let pool = mem_pool().await;
    let dir = TempDir::new().unwrap();
    let central = dir.path().join("central");
    seed_skill(&pool, &central, "alpha", &[("refs/notes.md", b"notes")]).await;
    let out = dir.path().join("out.skillport");
    export_to(&pool, &out).await;
    let (bytes, parsed) = parse_file(&out);
    (dir, bytes, parsed.manifest)
}

fn rebuild(manifest: &BundleManifest, payload: &[(&str, &[u8])]) -> Vec<u8> {
    let json = serde_json::to_vec(manifest).unwrap();
    let mut entries = payload.to_vec();
    entries.push((MANIFEST_PATH, json.as_slice()));
    zip_bytes(&entries)
}

fn parse_err(bytes: &[u8]) -> PortableBundleError {
    parse_bundle(bytes, ResourceBudget::portable_bundle()).unwrap_err()
}

#[tokio::test]
async fn local_export_round_trips_content_metadata_and_provenance() {
    let pool = mem_pool().await;
    let dir = TempDir::new().unwrap();
    let central = dir.path().join("central");
    seed_skill(
        &pool,
        &central,
        "alpha",
        &[("refs/deep/notes.md", b"\x00binary\xff")],
    )
    .await;
    seed_skill(&pool, &central, "beta", &[]).await;
    db::assign_github_repository_to_skill(
        &pool,
        "openai",
        "skills",
        "main",
        "https://github.com/openai/skills",
        "alpha",
        "skills/alpha/SKILL.md",
    )
    .await
    .unwrap();
    let group = db::create_tag_group(
        &pool,
        db::NewTagGroup {
            name: "Writing",
            color: Some("#abcdef"),
        },
    )
    .await
    .unwrap();
    let tag_id = tag_skill(&pool, "alpha", "Docs").await;
    db::set_tag_group(&pool, &tag_id, Some(&group.id))
        .await
        .unwrap();
    db::create_saved_view(
        &pool,
        db::NewSavedView {
            name: "Pinned docs",
            query: r#"{"tags":["Docs"]}"#,
            icon: None,
            pinned: true,
        },
    )
    .await
    .unwrap();

    let out = dir.path().join("library.skillport");
    let result = export_to(&pool, &out).await;
    assert_eq!(result.skills_exported, 2);
    assert!(result.skipped_skills.is_empty());
    assert_eq!(result.file_count, 3);
    assert!(result.bundle_bytes > 0);

    let (bytes, parsed) = parse_file(&out);
    assert!(
        parsed.invalid_skills.is_empty(),
        "{:?}",
        parsed.invalid_skills
    );
    assert_eq!(parsed.fingerprint.byte_len, result.bundle_bytes);
    assert_eq!(parsed.fingerprint.byte_len, bytes.len() as u64);
    let manifest = &parsed.manifest;
    assert_eq!(manifest.kind, BUNDLE_KIND);
    assert_eq!(manifest.origin.target_kind, "local");

    let hashes = CentralFs::Local
        .hash_directories(&[central.join("alpha"), central.join("beta")])
        .await
        .unwrap();
    let alpha = manifest
        .skills
        .iter()
        .find(|skill| skill.id == "alpha")
        .unwrap();
    assert_eq!(alpha.content_digest, hashes[&central.join("alpha")]);
    assert_eq!(
        alpha.provenance,
        BundleProvenance::Github {
            owner: "openai".to_string(),
            repo: "skills".to_string(),
            branch: Some("main".to_string()),
            source_path: "skills/alpha".to_string(),
            commit_sha: None,
        }
    );
    let beta = manifest
        .skills
        .iter()
        .find(|skill| skill.id == "beta")
        .unwrap();
    assert_eq!(beta.content_digest, hashes[&central.join("beta")]);
    assert_eq!(beta.provenance, BundleProvenance::Unknown);

    let docs = manifest.tags.iter().find(|tag| tag.name == "Docs").unwrap();
    assert_eq!(alpha.tag_keys, vec![docs.key.clone()]);
    let writing = manifest
        .tag_groups
        .iter()
        .find(|group| group.name == "Writing")
        .unwrap();
    assert_eq!(docs.group_key.as_deref(), Some(writing.key.as_str()));
    assert!(manifest
        .saved_views
        .iter()
        .any(|view| view.name == "Pinned docs" && view.pinned));

    let payload = read_skill_payload(&bytes, alpha).unwrap();
    let notes = payload
        .iter()
        .find(|file| file.relative_path == "refs/deep/notes.md")
        .unwrap();
    assert_eq!(notes.bytes, b"\x00binary\xff");
}

#[tokio::test]
async fn shared_root_source_paths_keep_per_repository_provenance_and_tags() {
    let pool = mem_pool().await;
    let dir = TempDir::new().unwrap();
    let central = dir.path().join("central");
    for index in 0..6 {
        let id = format!("root-skill-{index}");
        seed_skill(&pool, &central, &id, &[]).await;
        db::assign_github_repository_to_skill(
            &pool,
            &format!("owner{index}"),
            "repo",
            "master",
            &format!("https://github.com/owner{index}/repo"),
            &id,
            "SKILL.md",
        )
        .await
        .unwrap();
        tag_skill(&pool, &id, &format!("tag-{index}")).await;
    }

    let out = dir.path().join("shared.skillport");
    export_to(&pool, &out).await;
    let (_, parsed) = parse_file(&out);
    for index in 0..6 {
        let id = format!("root-skill-{index}");
        let skill = parsed
            .manifest
            .skills
            .iter()
            .find(|skill| skill.id == id)
            .unwrap();
        match &skill.provenance {
            BundleProvenance::Github {
                owner, source_path, ..
            } => {
                assert_eq!(owner, &format!("owner{index}"));
                assert_eq!(source_path, ".");
            }
            other => panic!("unexpected provenance {other:?}"),
        }
        let tag_names = skill
            .tag_keys
            .iter()
            .map(|key| {
                &parsed
                    .manifest
                    .tags
                    .iter()
                    .find(|tag| &tag.key == key)
                    .unwrap()
                    .name
            })
            .collect::<Vec<_>>();
        assert_eq!(tag_names, vec![&format!("tag-{index}")]);
    }
}

#[tokio::test]
async fn unreadable_or_incomplete_skills_are_skipped_without_failing_export() {
    let pool = mem_pool().await;
    let dir = TempDir::new().unwrap();
    let central = dir.path().join("central");
    seed_skill(&pool, &central, "good", &[]).await;
    // Directory without SKILL.md.
    std::fs::create_dir_all(central.join("no-manifest")).unwrap();
    std::fs::write(central.join("no-manifest").join("README.md"), "x").unwrap();
    db::upsert_skill(&pool, &central_skill(&central, "no-manifest"))
        .await
        .unwrap();
    // Database row whose directory is gone.
    db::upsert_skill(&pool, &central_skill(&central, "vanished"))
        .await
        .unwrap();
    // Id that cannot become a path component.
    let mut bad = central_skill(&central, "bad-id");
    bad.id = "bad:id".to_string();
    db::upsert_skill(&pool, &bad).await.unwrap();

    let out = dir.path().join("partial.skillport");
    let result = export_to(&pool, &out).await;
    assert_eq!(result.skills_exported, 1);
    let mut reasons = result
        .skipped_skills
        .iter()
        .map(|skipped| (skipped.id.as_str(), skipped.reason.as_str()))
        .collect::<Vec<_>>();
    reasons.sort();
    assert_eq!(
        reasons,
        vec![
            ("bad:id", "invalid_id"),
            ("no-manifest", "manifest_missing"),
            ("vanished", "read_failed"),
        ]
    );
    let (_, parsed) = parse_file(&out);
    assert_eq!(parsed.manifest.skipped_skills.len(), 3);
}

#[tokio::test]
async fn cancelled_export_leaves_no_destination_or_temporary_file() {
    let pool = mem_pool().await;
    let dir = TempDir::new().unwrap();
    let central = dir.path().join("central");
    seed_skill(&pool, &central, "alpha", &[]).await;
    let out_dir = dir.path().join("out");
    std::fs::create_dir_all(&out_dir).unwrap();
    let cancel = AtomicBool::new(true);
    let job = BundleJob {
        job_id: "bundle-test",
        app: None,
        cancel: Some(&cancel),
    };

    let error = export_bundle(
        &pool,
        &CentralFs::Local,
        "local",
        out_dir.join("x.skillport"),
        job,
    )
    .await
    .unwrap_err();
    assert!(matches!(error, PortableBundleError::Cancelled));
    assert_eq!(std::fs::read_dir(&out_dir).unwrap().count(), 0);
}

#[tokio::test]
async fn export_rejects_destination_without_bundle_extension() {
    let pool = mem_pool().await;
    let dir = TempDir::new().unwrap();
    let error = export_bundle(
        &pool,
        &CentralFs::Local,
        "local",
        dir.path().join("state.json"),
        JOB,
    )
    .await
    .unwrap_err();
    assert!(matches!(error, PortableBundleError::InvalidPath));
    assert_eq!(error.to_ipc_error().code, "portable_bundle.invalid_path");
}

#[tokio::test]
async fn manifest_and_ipc_errors_carry_no_paths_or_identity() {
    let pool = mem_pool().await;
    let dir = TempDir::new().unwrap();
    let central = dir.path().join("central");
    seed_skill(&pool, &central, "alpha", &[]).await;
    let out = dir.path().join("private.skillport");
    export_to(&pool, &out).await;
    let (bytes, _) = parse_file(&out);
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut manifest = String::new();
    std::io::Read::read_to_string(&mut zip.by_name(MANIFEST_PATH).unwrap(), &mut manifest).unwrap();
    let temp_root = dir.path().to_string_lossy().replace('\\', "\\\\");
    assert!(!manifest.contains(&temp_root));
    assert!(!manifest.contains("central"));
    assert!(!manifest.contains("alpha-uid"));
    assert!(!manifest.contains("\"uid\""));

    let error = PortableBundleError::io(
        format!("Failed to open '{}' token=ghp_secret", dir.path().display()),
        std::io::Error::other("denied"),
    );
    let serialized = serde_json::to_string(&error.to_ipc_error()).unwrap();
    assert!(serialized.contains("portable_bundle.io"));
    assert!(!serialized.contains("ghp_secret"));
    assert!(!serialized.contains(&dir.path().display().to_string()));
}

#[tokio::test]
async fn reader_identifies_legacy_v1_json_in_any_common_encoding() {
    let v1 = r#"{"kind":"skillport/state-export","version":1,"centralSkills":[]}"#;
    let mut bom = vec![0xef, 0xbb, 0xbf];
    bom.extend_from_slice(v1.as_bytes());
    let mut utf16 = vec![0xff, 0xfe];
    for unit in v1.encode_utf16() {
        utf16.extend_from_slice(&unit.to_le_bytes());
    }
    for bytes in [v1.as_bytes().to_vec(), bom, utf16] {
        let error = parse_err(&bytes);
        assert!(matches!(error, PortableBundleError::LegacyV1), "{error:?}");
        assert_eq!(error.to_ipc_error().code, "portable_bundle.legacy_v1");
    }
    assert!(matches!(
        parse_err(b"hello world"),
        PortableBundleError::NotABundle(_)
    ));
}

#[tokio::test]
async fn reader_rejects_structural_problems_with_specific_codes() {
    let (_dir, _bytes, manifest) = sample_bundle().await;
    let skill = &manifest.skills[0];
    let skill_md = format!("{}/SKILL.md", skill.payload_dir);
    let notes = format!("{}/refs/notes.md", skill.payload_dir);
    let skill_md_bytes = b"---\nname: alpha\n---\nbody\n".as_slice();
    let payload = [
        (skill_md.as_str(), skill_md_bytes),
        (notes.as_str(), b"notes".as_slice()),
    ];

    // Sanity: the rebuilt bundle is valid.
    let valid = rebuild(&manifest, &payload);
    let parsed = parse_bundle(&valid, ResourceBudget::portable_bundle()).unwrap();
    assert!(parsed.invalid_skills.is_empty());

    assert!(matches!(
        parse_err(&zip_bytes(&payload)),
        PortableBundleError::ManifestMissing
    ));

    let mut utf16_manifest = vec![0xff, 0xfe];
    for unit in serde_json::to_string(&manifest).unwrap().encode_utf16() {
        utf16_manifest.extend_from_slice(&unit.to_le_bytes());
    }
    assert!(matches!(
        parse_err(&zip_bytes(&[(MANIFEST_PATH, &utf16_manifest)])),
        PortableBundleError::ManifestEncoding
    ));

    let mut bom_manifest = vec![0xef, 0xbb, 0xbf];
    bom_manifest.extend_from_slice(&serde_json::to_vec(&manifest).unwrap());
    let mut with_bom = payload.to_vec();
    with_bom.push((MANIFEST_PATH, &bom_manifest));
    assert!(parse_bundle(&zip_bytes(&with_bom), ResourceBudget::portable_bundle()).is_ok());

    let mut newer = serde_json::to_value(&manifest).unwrap();
    newer["formatVersion"] = 3.into();
    let newer = serde_json::to_vec(&newer).unwrap();
    assert!(matches!(
        parse_err(&zip_bytes(&[(MANIFEST_PATH, &newer)])),
        PortableBundleError::UnsupportedVersion(3)
    ));

    let mut missing_field = serde_json::to_value(&manifest).unwrap();
    missing_field.as_object_mut().unwrap().remove("skills");
    let missing_field = serde_json::to_vec(&missing_field).unwrap();
    match parse_err(&zip_bytes(&[(MANIFEST_PATH, &missing_field)])) {
        PortableBundleError::ManifestInvalid(detail) => {
            assert!(detail.contains("skills"), "{detail}")
        }
        other => panic!("unexpected {other:?}"),
    }

    let mut orphan = payload.to_vec();
    orphan.push(("skills/ghost/SKILL.md", b"boo"));
    let json = serde_json::to_vec(&manifest).unwrap();
    orphan.push((MANIFEST_PATH, &json));
    assert!(matches!(
        parse_err(&zip_bytes(&orphan)),
        PortableBundleError::IntegrityMismatch(_)
    ));

    let mut traversal = payload.to_vec();
    traversal.push(("../evil.txt", b"x"));
    traversal.push((MANIFEST_PATH, &json));
    assert!(matches!(
        parse_err(&zip_bytes(&traversal)),
        PortableBundleError::UnsafeEntry(_)
    ));

    let mut duplicate = manifest.clone();
    duplicate.skills.push(duplicate.skills[0].clone());
    assert!(matches!(
        parse_err(&rebuild(&duplicate, &payload)),
        PortableBundleError::ManifestInvalid(_)
    ));
}

#[tokio::test]
async fn reader_isolates_per_skill_integrity_failures() {
    let (_dir, _bytes, manifest) = sample_bundle().await;
    let skill = &manifest.skills[0];
    let skill_md = format!("{}/SKILL.md", skill.payload_dir);
    let notes = format!("{}/refs/notes.md", skill.payload_dir);
    let skill_md_bytes = b"---\nname: alpha\n---\nbody\n".as_slice();

    // Same size, different bytes → sha256 mismatch.
    let tampered = rebuild(
        &manifest,
        &[
            (skill_md.as_str(), skill_md_bytes),
            (notes.as_str(), b"NOTES".as_slice()),
        ],
    );
    let parsed = parse_bundle(&tampered, ResourceBudget::portable_bundle()).unwrap();
    assert_eq!(
        parsed.invalid_skills.get("alpha").map(String::as_str),
        Some("integrity_mismatch")
    );
    assert!(matches!(
        read_skill_payload(&tampered, skill),
        Err(PortableBundleError::IntegrityMismatch(_))
    ));

    let mut unknown_tag = manifest.clone();
    unknown_tag.skills[0].tag_keys = vec!["t999".to_string()];
    let parsed = parse_bundle(
        &rebuild(
            &unknown_tag,
            &[
                (skill_md.as_str(), skill_md_bytes),
                (notes.as_str(), b"notes".as_slice()),
            ],
        ),
        ResourceBudget::portable_bundle(),
    )
    .unwrap();
    assert_eq!(
        parsed.invalid_skills.get("alpha").map(String::as_str),
        Some("unknown_tag")
    );
}

#[tokio::test]
async fn budgets_reject_oversized_bundles_on_read_and_write() {
    let (dir, bytes, _) = sample_bundle().await;
    let path = dir.path().join("out.skillport");
    let tight = ResourceBudget {
        archive_bytes: bytes.len() as u64 - 1,
        ..ResourceBudget::portable_bundle()
    };
    assert!(matches!(
        read_bundle_bytes(&path, tight),
        Err(PortableBundleError::Budget(_))
    ));

    let destination = dir.path().join("tiny.skillport");
    let mut writer = BundleWriter::create(
        &destination,
        ResourceBudget {
            archive_files: 1,
            ..ResourceBudget::portable_bundle()
        },
    )
    .unwrap();
    let files = vec![
        SkillTreeFile {
            relative_path: "SKILL.md".to_string(),
            bytes: b"a".to_vec(),
        },
        SkillTreeFile {
            relative_path: "b.md".to_string(),
            bytes: b"b".to_vec(),
        },
    ];
    assert!(matches!(
        writer.add_skill("skills/x", &files),
        Err(PortableBundleError::Budget(_))
    ));
    drop(writer);
    assert!(!destination.exists());
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 2);
}

#[tokio::test]
async fn export_summary_counts_central_state_quickly() {
    let pool = mem_pool().await;
    let root = PathBuf::from("/central");
    for index in 0..1000 {
        db::upsert_skill(&pool, &central_skill(&root, &format!("skill-{index:04}")))
            .await
            .unwrap();
    }
    for index in 0..10 {
        db::assign_github_repository_to_skill(
            &pool,
            "owner",
            "repo",
            "main",
            "https://github.com/owner/repo",
            &format!("skill-{index:04}"),
            &format!("skills/skill-{index:04}"),
        )
        .await
        .unwrap();
    }
    let baseline = collect_metadata(&pool).await.unwrap();

    let started = Instant::now();
    let summary = export_summary(&pool, "ssh").await.unwrap();
    let elapsed = started.elapsed();

    assert_eq!(summary.target_kind, "ssh");
    assert_eq!(summary.skills, 1000);
    assert_eq!(summary.skills_with_github_source, 10);
    assert_eq!(summary.tags, baseline.tags.len());
    assert_eq!(summary.tag_groups, baseline.tag_groups.len());
    assert_eq!(summary.saved_views, baseline.saved_views.len());
    assert!(elapsed.as_millis() < 500, "summary took {elapsed:?}");
}

#[test]
fn source_paths_normalize_to_one_spelling() {
    assert_eq!(normalize_source_path("SKILL.md"), ".");
    assert_eq!(normalize_source_path("/"), ".");
    assert_eq!(
        normalize_source_path("skills\\docx\\SKILL.md"),
        "skills/docx"
    );
    assert_eq!(normalize_source_path("/skills/docx/"), "skills/docx");
}
