use std::path::{Path, PathBuf};

use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::{Connection, Row, SqliteConnection};
use tempfile::TempDir;

use super::{apply_migration, backup, descriptor_checksum, versions};
use crate::db;

const FIXTURE_ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/db");
static DATABASE_OPEN_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureManifest {
    format_version: u32,
    fixtures: Vec<FixtureEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureEntry {
    tag: String,
    commit: String,
    source_schema_sha256: String,
    file: String,
    fixture_sha256: String,
    table_count: i64,
    absent_tables: Vec<String>,
}

fn fixture_manifest() -> FixtureManifest {
    serde_json::from_str(include_str!("../../../tests/fixtures/db/manifest.json"))
        .expect("parse fixture manifest")
}

fn fixture_path(entry: &FixtureEntry) -> PathBuf {
    Path::new(FIXTURE_ROOT).join(&entry.file)
}

async fn materialize_fixture(entry: &FixtureEntry, path: &Path) {
    let sql = std::fs::read_to_string(fixture_path(entry)).expect("read SQL fixture");
    let pool = crate::db::pool::create_pool(path)
        .await
        .expect("open raw fixture database");
    sqlx::raw_sql(&sql)
        .execute(&pool)
        .await
        .expect("materialize tag fixture");

    let table_count = sqlx::query(
        "SELECT COUNT(*) AS count FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .fetch_one(&pool)
    .await
    .unwrap()
    .try_get::<i64, _>("count")
    .unwrap();
    assert_eq!(table_count, entry.table_count, "{} table drift", entry.tag);
    for table in &entry.absent_tables {
        let present = sqlx::query(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?) AS present",
        )
        .bind(table)
        .fetch_one(&pool)
        .await
        .unwrap()
        .try_get::<i64, _>("present")
        .unwrap();
        assert_eq!(present, 0, "{} unexpectedly contains {table}", entry.tag);
    }
    pool.close().await;
}

fn sibling_files(path: &Path, marker: &str) -> Vec<PathBuf> {
    let parent = path.parent().unwrap();
    let database_name = path.file_name().unwrap().to_string_lossy();
    std::fs::read_dir(parent)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|candidate| {
            let name = candidate.file_name().unwrap().to_string_lossy();
            name.starts_with(database_name.as_ref()) && name.contains(marker)
        })
        .collect()
}

async fn assert_owned_foreign_keys(pool: &db::DbPool) {
    for relation in db::repos::skill_relations_spec::owned_skill_relations() {
        let sql = format!("PRAGMA foreign_key_list({})", relation.table);
        let rows = sqlx::query(&sql).fetch_all(pool).await.unwrap();
        assert!(
            rows.iter().any(|row| {
                row.try_get::<String, _>("table")
                    .is_ok_and(|value| value == "skills")
                    && row
                        .try_get::<String, _>("from")
                        .is_ok_and(|value| value == relation.skill_column)
                    && row
                        .try_get::<String, _>("on_delete")
                        .is_ok_and(|value| value == "CASCADE")
            }),
            "{} is missing the skill-parent cascade",
            relation.table
        );
    }
}

async fn insert_independent_history(pool: &db::DbPool) {
    sqlx::query(
        "INSERT INTO agent_skill_observations
         (row_id, agent_id, skill_id, name, file_path, dir_path, source_kind,
          source_root, link_type, is_read_only, scanned_at)
         VALUES ('fixture-observation', 'codex', 'fixture-skill', 'Fixture Skill',
                 '/fixtures/skill.md', '/fixtures', 'global', '/fixtures',
                 'native', 0, '2026-01-01T00:00:00Z')",
    )
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO projects (id, path, name, added_at)
         VALUES ('fixture-project', '/fixtures/project', 'Fixture Project', '2026-01-01T00:00:00Z')",
    )
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO project_skill_installations
         (project_id, skill_id, agent_id, installed_path, link_type, created_at)
         VALUES ('fixture-project', 'fixture-skill', 'codex', '/fixtures/project/skill',
                 'native', '2026-01-01T00:00:00Z')",
    )
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO skill_usage_metadata
         (target_id, skill, match_status, resolved_skill_id, scanned_at_ms)
         VALUES ('local', 'fixture-skill', 'matched', 'fixture-skill', 1)",
    )
    .execute(pool)
    .await
    .unwrap();
}

#[test]
fn fixture_manifest_and_files_are_locked() {
    let manifest = fixture_manifest();
    assert_eq!(manifest.format_version, 1);
    assert_eq!(manifest.fixtures.len(), 5);
    for fixture in manifest.fixtures {
        assert_eq!(
            fixture.commit.len(),
            40,
            "{} commit is not pinned",
            fixture.tag
        );
        assert_eq!(
            fixture.source_schema_sha256.len(),
            64,
            "{} source schema checksum is not pinned",
            fixture.tag
        );
        let bytes = std::fs::read(fixture_path(&fixture)).unwrap();
        assert_eq!(
            crate::hashing::encode_lower_hex(Sha256::digest(bytes).as_ref()),
            fixture.fixture_sha256,
            "{} fixture checksum drift",
            fixture.tag
        );
    }
}

#[test]
fn migration_sources_are_checksum_locked() {
    let checksums = [
        descriptor_checksum(1).unwrap(),
        descriptor_checksum(2).unwrap(),
        descriptor_checksum(3).unwrap(),
        descriptor_checksum(4).unwrap(),
        descriptor_checksum(5).unwrap(),
        descriptor_checksum(6).unwrap(),
        descriptor_checksum(7).unwrap(),
        descriptor_checksum(8).unwrap(),
        descriptor_checksum(9).unwrap(),
        descriptor_checksum(10).unwrap(),
    ];
    assert_eq!(
        checksums,
        [
            "01da45f3f92d1b24d292f392b878b265f0cb884244792318f793f231736b362f",
            "92aeea552f562f4142946460635a6d7d2d75c89f8899ea2063a80c213bcf14aa",
            "ad1c327066e8bd7a0f5d5aca5ccd6666247d92fc2dfbee5d9c37c6a60ae948a8",
            "f1225528d87dccc2b06e0553a241fd3f0e56463cf69faafb18976401da111188",
            "1d7efcd9c5d218f4ccf4f3c4d59a286129e8e4090e6786a4fa7075313bec2ba3",
            "1144ab4443ad86e574690ad1c7ebe2e15b9b546031a63ddf596a5e9aba6c502d",
            "739c87f61d50e40dc06a4e2fdc3a7f7bcd3643067ec15e951f0a3fda04e977d2",
            "6c2e9684a9d991e689f40686bbd1bf27d7a26dc33fb9426351db4718b5d714de",
            "5fdc467c6d855f325d1444dab0a55d97c0524ef109f540a6ffe215d5309a0039",
            "1b48a027b70072e349a8c585e65b7b55e04366f472c28e35b3cfa60d0fa69db7",
        ]
    );
    assert_eq!(checksums.len(), versions::MIGRATIONS.len());
}

#[tokio::test]
async fn usage_migration_eight_retains_legacy_facts_and_marks_provenance_unready() {
    let directory = TempDir::new().unwrap();
    let path = directory.path().join("usage-v7.sqlite");
    let pool = crate::db::pool::create_pool(&path).await.unwrap();
    for version in 1..=7 {
        apply_migration(&pool, version).await.unwrap();
    }
    sqlx::query("INSERT INTO skill_calls(target_id,skill,timestamp_ms,project,session_id,source) VALUES('local','legacy',1,'p','s','Codex CLI')").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO skill_call_scan_state(target_id,last_full_scan_ms) VALUES('local',1)")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO skill_call_file_cache(target_id,provider,file_path,mtime_ms,size,calls_json,scanned_at_ms) VALUES('local','codex','opaque-fixture-path',1,1,'[]',1)").execute(&pool).await.unwrap();
    apply_migration(&pool, 8).await.unwrap();
    let facts: Vec<(String,)> = sqlx::query_as("SELECT skill FROM skill_calls")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(facts, vec![("legacy".into(),)]);
    let readiness: (i64,) =
        sqlx::query_as("SELECT local_provenance_version FROM skill_call_scan_state")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(readiness.0, 0);
    let keys: Vec<(Option<String>,)> = sqlx::query_as("SELECT file_key FROM skill_call_file_cache")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(keys, vec![(None,)]);
    super::validate_foreign_keys(&pool).await.unwrap();
}

#[tokio::test]
async fn migration_six_preserves_legacy_pending_additions_and_accepts_new_identity() {
    let directory = TempDir::new().unwrap();
    let database_path = directory.path().join("migration-six.sqlite");
    let pool = crate::db::pool::create_pool(&database_path).await.unwrap();
    for version in 1..=5 {
        apply_migration(&pool, version).await.unwrap();
    }

    sqlx::query(
        "INSERT INTO skill_repository_pending_additions
         (repository_id, source_path, skill_id, skill_name,
          conflict_existing_skill_id, discovered_at)
         VALUES ('github:owner-repo-main', 'skills/legacy', 'legacy',
                 'Legacy', NULL, '2026-08-19T00:00:00Z')",
    )
    .execute(&pool)
    .await
    .unwrap();

    apply_migration(&pool, 6).await.unwrap();
    let migrated_columns = sqlx::query("PRAGMA table_info(skill_repository_pending_additions)")
        .fetch_all(&pool)
        .await
        .unwrap()
        .into_iter()
        .map(|row| row.try_get::<String, _>("name").unwrap())
        .collect::<Vec<_>>();
    assert!(
        migrated_columns.contains(&"resolved_commit_sha".to_string()),
        "{migrated_columns:?}"
    );
    assert!(
        migrated_columns.contains(&"snapshot_digest".to_string()),
        "{migrated_columns:?}"
    );
    let legacy = db::list_pending_additions(&pool).await.unwrap();
    assert_eq!(legacy.len(), 1);
    assert_eq!(legacy[0].resolved_commit_sha, None);
    assert_eq!(legacy[0].snapshot_digest, None);

    db::upsert_pending_addition(
        &pool,
        &db::SkillRepositoryPendingAddition {
            repository_id: "github:owner-repo-main".to_string(),
            source_path: "skills/legacy".to_string(),
            skill_id: "legacy".to_string(),
            skill_name: "Legacy".to_string(),
            conflict_existing_skill_id: None,
            resolved_commit_sha: Some("a".repeat(40)),
            snapshot_digest: Some("sha256-v1:repository".to_string()),
            discovered_at: "2026-08-20T00:00:00Z".to_string(),
        },
    )
    .await
    .unwrap();
    let refreshed = db::list_pending_additions(&pool).await.unwrap();
    let expected_commit_sha = "a".repeat(40);
    assert_eq!(
        refreshed[0].resolved_commit_sha.as_deref(),
        Some(expected_commit_sha.as_str())
    );
    assert_eq!(
        refreshed[0].snapshot_digest.as_deref(),
        Some("sha256-v1:repository")
    );
}

#[tokio::test]
async fn migration_seven_creates_skills_cli_update_tables_and_reopens() {
    let _guard = DATABASE_OPEN_TEST_LOCK.lock().await;
    let directory = TempDir::new().unwrap();
    let database_path = directory.path().join("migration-seven.sqlite");
    let pool = crate::db::pool::create_pool(&database_path).await.unwrap();
    for version in 1..=6 {
        apply_migration(&pool, version).await.unwrap();
    }
    apply_migration(&pool, 7).await.unwrap();

    for table in [
        "skills_cli_update_repositories",
        "skills_cli_update_states",
        "skills_cli_update_operations",
    ] {
        let present = sqlx::query(
            "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .bind(table)
        .fetch_one(&pool)
        .await
        .unwrap()
        .try_get::<i64, _>("count")
        .unwrap();
        assert_eq!(present, 1, "{table} missing after v7");
    }

    let versions = sqlx::query("SELECT version FROM schema_migrations ORDER BY version")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(versions.len(), 7);
    pool.close().await;

    let reopened = crate::db::open_database(&database_path).await.unwrap();
    let reopened_versions = sqlx::query("SELECT version FROM schema_migrations ORDER BY version")
        .fetch_all(&reopened)
        .await
        .unwrap();
    assert_eq!(reopened_versions.len(), 10);
    reopened.close().await;
}

#[tokio::test]
async fn migration_nine_unifies_antigravity_and_cleans_legacy_cli_rows() {
    let _guard = DATABASE_OPEN_TEST_LOCK.lock().await;
    let directory = TempDir::new().unwrap();
    let database_path = directory.path().join("migration-nine.sqlite");
    let pool = crate::db::pool::create_pool(&database_path).await.unwrap();
    for version in 1..=8 {
        apply_migration(&pool, version).await.unwrap();
    }

    sqlx::query(
        "INSERT INTO agents (id, display_name, category, global_skills_dir, project_skills_dir, icon_name, is_detected, is_builtin, is_enabled)
         VALUES
           ('antigravity', 'Antigravity', 'coding', '/legacy/.gemini/antigravity/skills', '.agents/skills', 'antigravity', 1, 1, 0),
           ('antigravity-cli', 'Antigravity CLI', 'coding', '/legacy/.gemini/antigravity-cli/skills', '.agents/skills', 'antigravity', 1, 1, 1),
           ('claude-code', 'Claude Code', 'coding', '/legacy/.claude/skills', '.claude/skills', 'claude', 1, 1, 1)",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO skills (id, uid, name, file_path, is_central, scanned_at)
         VALUES ('s1', 'uid-1', 'S1', '/central/s1/SKILL.md', 1, '2026-01-01T00:00:00Z'),
                ('s2', 'uid-2', 'S2', '/central/s2/SKILL.md', 1, '2026-01-01T00:00:00Z')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO skill_installations (skill_id, agent_id, installed_path, link_type, created_at)
         VALUES
           ('s1', 'antigravity', 'C:\\Users\\fixture\\.gemini\\antigravity\\skills\\s1', 'symlink', '2026-01-01T00:00:00Z'),
           ('s1', 'antigravity-cli', '/legacy/.gemini/antigravity-cli/skills/s1', 'symlink', '2026-01-01T00:00:00Z'),
           ('s2', 'antigravity', '/new/.gemini/config/skills/s2', 'symlink', '2026-01-01T00:00:00Z'),
           ('s1', 'claude-code', '/legacy/.claude/skills/s1', 'symlink', '2026-01-01T00:00:00Z')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO agent_skill_observations
         (row_id, agent_id, skill_id, name, file_path, dir_path, source_kind, source_root, link_type, is_read_only, scanned_at)
         VALUES
           ('r1', 'antigravity-cli', 's1', 'S1', '/legacy/.gemini/antigravity-cli/skills/s1/SKILL.md', '/legacy/.gemini/antigravity-cli/skills/s1', 'global', '/legacy/.gemini/antigravity-cli/skills', 'symlink', 0, '2026-01-01T00:00:00Z'),
           ('r2', 'antigravity', 's1', 'S1', '/legacy/.gemini/antigravity/skills/s1/SKILL.md', '/legacy/.gemini/antigravity/skills/s1', 'global', '/legacy/.gemini/antigravity/skills', 'symlink', 0, '2026-01-01T00:00:00Z'),
           ('r3', 'claude-code', 's1', 'S1', '/legacy/.claude/skills/s1/SKILL.md', '/legacy/.claude/skills/s1', 'global', '/legacy/.claude/skills', 'symlink', 0, '2026-01-01T00:00:00Z')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO projects (id, path, name, added_at)
         VALUES ('p1', '/tmp/p1', 'p1', '2026-01-01T00:00:00Z')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO project_skill_installations
         (project_id, skill_id, name, file_path, source_origin, agent_id, installed_path, link_type, created_at)
         VALUES
           ('p1', 's1', 'S1', '/tmp/p1/.agents/skills/s1/SKILL.md', 'central', 'antigravity', '/tmp/p1/.agents/skills/s1', 'symlink', '2026-01-01T00:00:00Z'),
           ('p1', 's1', 'S1', '/tmp/p1/.agents/skills/s1/SKILL.md', 'central', 'antigravity-cli', '/tmp/p1/.agents/skills/s1', 'symlink', '2026-01-01T00:00:00Z'),
           ('p1', 's2', 'S2', '/tmp/p1/.agents/skills/s2/SKILL.md', 'central', 'antigravity-cli', '/tmp/p1/.agents/skills/s2', 'symlink', '2026-01-01T00:00:00Z')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO skill_update_inventory_runs
         (inventory_id, scope_kind, mode, cache_policy, generated_at)
         VALUES ('inv-1', 'global', 'check', 'default', '2026-01-01T00:00:00Z')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO skill_update_inventory_entries
         (inventory_id, bucket, entity_key, agent_id, cache_policy, cache_hit, generated_at, payload_json)
         VALUES ('inv-1', 'updates', 'k1', 'antigravity-cli', 'default', 0, '2026-01-01T00:00:00Z', '{}')",
    )
    .execute(&pool)
    .await
    .unwrap();
    apply_migration(&pool, 9).await.unwrap();
    let v9_ag_enabled: (i64,) =
        sqlx::query_as("SELECT is_enabled FROM agents WHERE id = 'antigravity'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        v9_ag_enabled.0, 1,
        "v9 should preserve enabled state from retired antigravity-cli"
    );
    let v9_cli_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM agents WHERE id = 'antigravity-cli'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(v9_cli_count.0, 0);
    let v9_installs: Vec<(String, String)> = sqlx::query_as(
        "SELECT skill_id, agent_id FROM skill_installations ORDER BY skill_id, agent_id",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        v9_installs,
        vec![
            ("s1".to_string(), "claude-code".to_string()),
            ("s2".to_string(), "antigravity".to_string()),
        ],
        "v9 alone retains /new/.gemini/config/skills/s2 before v10 cleans it"
    );
    let v9_obs_rows: Vec<(String,)> =
        sqlx::query_as("SELECT row_id FROM agent_skill_observations ORDER BY row_id")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(v9_obs_rows, vec![("r3".to_string(),)]);
    let v9_psi_rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT skill_id, agent_id FROM project_skill_installations ORDER BY skill_id, agent_id",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        v9_psi_rows,
        vec![
            ("s1".to_string(), "antigravity".to_string()),
            ("s2".to_string(), "antigravity".to_string()),
        ]
    );
    let v9_inv_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM skill_update_inventory_entries WHERE agent_id = 'antigravity-cli'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(v9_inv_count.0, 0);
    super::validate_foreign_keys(&pool).await.unwrap();
    pool.close().await;

    let reopened = db::open_database(&database_path).await.unwrap();
    let ag = db::get_agent_by_id(&reopened, "antigravity")
        .await
        .unwrap()
        .expect("antigravity agent must exist");
    assert!(
        ag.is_enabled,
        "antigravity should preserve enabled state from retired antigravity-cli"
    );
    assert!(ag
        .global_skills_dir
        .replace('\\', "/")
        .ends_with(".agents/skills"));
    assert!(db::get_agent_by_id(&reopened, "antigravity-cli")
        .await
        .unwrap()
        .is_none());

    let installs: Vec<(String, String)> = sqlx::query_as(
        "SELECT skill_id, agent_id FROM skill_installations ORDER BY skill_id, agent_id",
    )
    .fetch_all(&reopened)
    .await
    .unwrap();
    assert_eq!(
        installs,
        vec![("s1".to_string(), "claude-code".to_string())],
        "v10 cleans retired /new/.gemini/config/skills/s2 when opening through latest migration"
    );

    let obs_rows: Vec<(String,)> =
        sqlx::query_as("SELECT row_id FROM agent_skill_observations ORDER BY row_id")
            .fetch_all(&reopened)
            .await
            .unwrap();
    assert_eq!(obs_rows, vec![("r3".to_string(),)]);

    let psi_rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT skill_id, agent_id FROM project_skill_installations ORDER BY skill_id, agent_id",
    )
    .fetch_all(&reopened)
    .await
    .unwrap();
    assert_eq!(
        psi_rows,
        vec![
            ("s1".to_string(), "antigravity".to_string()),
            ("s2".to_string(), "antigravity".to_string()),
        ]
    );

    let inv_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM skill_update_inventory_entries WHERE agent_id = 'antigravity-cli'",
    )
    .fetch_one(&reopened)
    .await
    .unwrap();
    assert_eq!(inv_count.0, 0);
    super::validate_foreign_keys(&reopened).await.unwrap();
    reopened.close().await;

    let remote_path = directory.path().join("remote-v8.sqlite");
    let remote_pool = crate::db::pool::create_pool(&remote_path).await.unwrap();
    for version in 1..=8 {
        apply_migration(&remote_pool, version).await.unwrap();
    }
    sqlx::query(
        "INSERT INTO agents (id, display_name, category, global_skills_dir, project_skills_dir, icon_name, is_detected, is_builtin, is_enabled)
         VALUES ('antigravity-cli', 'Antigravity CLI', 'coding', '/home/alice/.gemini/antigravity-cli/skills', '.agents/skills', 'antigravity', 1, 1, 1)",
    )
    .execute(&remote_pool)
    .await
    .unwrap();
    remote_pool.close().await;

    let remote_reopened = db::open_database_for_remote_home(&remote_path, "/home/alice")
        .await
        .unwrap();
    let remote_ag = db::get_agent_by_id(&remote_reopened, "antigravity")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(remote_ag.global_skills_dir, "/home/alice/.agents/skills");
    assert!(db::get_agent_by_id(&remote_reopened, "antigravity-cli")
        .await
        .unwrap()
        .is_none());
    remote_reopened.close().await;
}

#[tokio::test]
async fn migration_ten_cleans_legacy_antigravity_config_skills_rows_for_local_databases() {
    let _guard = DATABASE_OPEN_TEST_LOCK.lock().await;
    let directory = TempDir::new().unwrap();

    // Simulate an untouched legacy ~/.gemini/config/skills/<skill>/SKILL.md file on disk.
    let legacy_disk_root = directory
        .path()
        .join("fake-home")
        .join(".gemini")
        .join("config")
        .join("skills");
    let legacy_disk_dir = legacy_disk_root.join("s-disk");
    std::fs::create_dir_all(&legacy_disk_dir).unwrap();
    let legacy_disk_skill_md = legacy_disk_dir.join("SKILL.md");
    let legacy_disk_bytes = b"---\nname: s-disk\n---\n# Legacy Antigravity skill kept on disk\n";
    std::fs::write(&legacy_disk_skill_md, legacy_disk_bytes).unwrap();

    let database_path = directory.path().join("migration-ten-disabled.sqlite");
    let pool = crate::db::pool::create_pool(&database_path).await.unwrap();
    for version in 1..=9 {
        apply_migration(&pool, version).await.unwrap();
    }

    sqlx::query(
        "INSERT INTO agents (id, display_name, category, global_skills_dir, project_skills_dir, icon_name, is_detected, is_builtin, is_enabled)
         VALUES
           ('antigravity', 'Antigravity', 'coding', '/home/fixture/.gemini/config/skills', '.agents/skills', 'antigravity', 1, 1, 0),
           ('claude-code', 'Claude Code', 'coding', '/home/fixture/.claude/skills', '.claude/skills', 'claude', 1, 1, 1),
           ('gemini-cli', 'Gemini CLI', 'coding', '/home/fixture/.gemini/skills', '.agents/skills', 'gemini', 1, 1, 1)",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO skills (id, uid, name, file_path, is_central, scanned_at)
         VALUES
           ('s-win', 'uid-win', 'S Win', '/central/s-win/SKILL.md', 1, '2026-01-01T00:00:00Z'),
           ('s-posix', 'uid-posix', 'S Posix', '/central/s-posix/SKILL.md', 1, '2026-01-01T00:00:00Z'),
           ('s-disk', 'uid-disk', 'S Disk', '/central/s-disk/SKILL.md', 1, '2026-01-01T00:00:00Z'),
           ('s-universal', 'uid-universal', 'S Universal', '/central/s-universal/SKILL.md', 1, '2026-01-01T00:00:00Z'),
           ('s-other', 'uid-other', 'S Other', '/central/s-other/SKILL.md', 1, '2026-01-01T00:00:00Z')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO skill_installations (skill_id, agent_id, installed_path, link_type, created_at)
         VALUES
           ('s-win', 'antigravity', 'C:\\Users\\Fixture\\.GEMINI\\Config\\Skills\\s-win', 'symlink', '2026-01-01T00:00:00Z'),
           ('s-posix', 'antigravity', '/home/fixture/.gemini/config/skills/s-posix', 'symlink', '2026-01-01T00:00:00Z'),
           ('s-disk', 'antigravity', ?, 'native', '2026-01-01T00:00:00Z'),
           ('s-universal', 'antigravity', '/home/fixture/.agents/skills/s-universal', 'symlink', '2026-01-01T00:00:00Z'),
           ('s-win', 'claude-code', '/home/fixture/.claude/skills/s-win', 'symlink', '2026-01-01T00:00:00Z'),
           ('s-posix', 'gemini-cli', '/home/fixture/.gemini/skills/s-posix', 'symlink', '2026-01-01T00:00:00Z'),
           ('s-other', 'claude-code', '/home/fixture/.gemini/config/skills/s-other', 'symlink', '2026-01-01T00:00:00Z')",
    )
    .bind(legacy_disk_dir.to_string_lossy().as_ref())
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO agent_skill_observations
         (row_id, agent_id, skill_id, name, file_path, dir_path, source_kind, source_root, link_type, is_read_only, scanned_at)
         VALUES
           ('obs-win-dir', 'antigravity', 's-win', 'S Win', 'C:\\Users\\Fixture\\.GEMINI\\Config\\Skills\\s-win\\SKILL.md', 'C:\\Users\\Fixture\\.GEMINI\\Config\\Skills\\s-win', 'global', 'C:\\Users\\Fixture\\other', 'symlink', 0, '2026-01-01T00:00:00Z'),
           ('obs-exact-dir', 'antigravity', 's-posix', 'S Posix', '/home/fixture/.gemini/config/skills/SKILL.md', '/home/fixture/.gemini/config/skills', 'global', '/home/fixture/other', 'symlink', 0, '2026-01-01T00:00:00Z'),
           ('obs-exact-root', 'antigravity', 's-posix', 'S Posix', '/home/fixture/other/s-posix/SKILL.md', '/home/fixture/other/s-posix', 'global', '/home/fixture/.gemini/config/skills', 'symlink', 0, '2026-01-01T00:00:00Z'),
           ('obs-sub-root', 'antigravity', 's-win', 'S Win', '/home/fixture/other/s-win/SKILL.md', '/home/fixture/other/s-win', 'global', 'C:\\Users\\Fixture\\.GEMINI\\Config\\Skills\\nested', 'symlink', 0, '2026-01-01T00:00:00Z'),
           ('obs-disk', 'antigravity', 's-disk', 'S Disk', ?, ?, 'global', ?, 'native', 0, '2026-01-01T00:00:00Z'),
           ('obs-universal', 'antigravity', 's-universal', 'S Universal', '/home/fixture/.agents/skills/s-universal/SKILL.md', '/home/fixture/.agents/skills/s-universal', 'global', '/home/fixture/.agents/skills', 'symlink', 0, '2026-01-01T00:00:00Z'),
           ('obs-project', 'antigravity', 's-win', 'S Win', '/tmp/p1/.agents/skills/s-win/SKILL.md', '/tmp/p1/.agents/skills/s-win', 'project', '/tmp/p1/.agents/skills', 'symlink', 0, '2026-01-01T00:00:00Z'),
           ('obs-claude', 'claude-code', 's-win', 'S Win', '/home/fixture/.claude/skills/s-win/SKILL.md', '/home/fixture/.claude/skills/s-win', 'global', '/home/fixture/.claude/skills', 'symlink', 0, '2026-01-01T00:00:00Z'),
           ('obs-gemini-cli', 'gemini-cli', 's-posix', 'S Posix', '/home/fixture/.gemini/skills/s-posix/SKILL.md', '/home/fixture/.gemini/skills/s-posix', 'global', '/home/fixture/.gemini/skills', 'symlink', 0, '2026-01-01T00:00:00Z'),
           ('obs-other-agent-legacy-path', 'claude-code', 's-other', 'S Other', '/home/fixture/.gemini/config/skills/s-other/SKILL.md', '/home/fixture/.gemini/config/skills/s-other', 'global', '/home/fixture/.gemini/config/skills', 'symlink', 0, '2026-01-01T00:00:00Z')",
    )
    .bind(legacy_disk_skill_md.to_string_lossy().as_ref())
    .bind(legacy_disk_dir.to_string_lossy().as_ref())
    .bind(legacy_disk_root.to_string_lossy().as_ref())
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO projects (id, path, name, added_at)
         VALUES ('p1', '/tmp/p1', 'p1', '2026-01-01T00:00:00Z')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO project_skill_installations
         (project_id, skill_id, name, file_path, source_origin, agent_id, installed_path, link_type, created_at)
         VALUES
           ('p1', 's-win', 'S Win', '/tmp/p1/.agents/skills/s-win/SKILL.md', 'central', 'antigravity', '/tmp/p1/.agents/skills/s-win', 'symlink', '2026-01-01T00:00:00Z'),
           ('p1', 's-posix', 'S Posix', '/tmp/p1/.agents/skills/s-posix/SKILL.md', 'central', 'antigravity', '/tmp/p1/.agents/skills/s-posix', 'symlink', '2026-01-01T00:00:00Z'),
           ('p1', 's-win', 'S Win', '/tmp/p1/.claude/skills/s-win/SKILL.md', 'central', 'claude-code', '/tmp/p1/.claude/skills/s-win', 'symlink', '2026-01-01T00:00:00Z')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO skill_update_inventory_runs
         (inventory_id, scope_kind, mode, cache_policy, generated_at)
         VALUES ('inv-1', 'global', 'check', 'default', '2026-01-01T00:00:00Z')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO skill_update_inventory_entries
         (inventory_id, bucket, entity_key, agent_id, cache_policy, cache_hit, generated_at, payload_json)
         VALUES
           ('inv-1', 'updates', 'k-ag-1', 'antigravity', 'default', 0, '2026-01-01T00:00:00Z', '{}'),
           ('inv-1', 'updates', 'k-ag-2', 'antigravity', 'default', 0, '2026-01-01T00:00:00Z', '{}'),
           ('inv-1', 'updates', 'k-claude', 'claude-code', 'default', 0, '2026-01-01T00:00:00Z', '{}'),
           ('inv-1', 'updates', 'k-gemini', 'gemini-cli', 'default', 0, '2026-01-01T00:00:00Z', '{}')",
    )
    .execute(&pool)
    .await
    .unwrap();
    pool.close().await;

    let reopened = db::open_database(&database_path).await.unwrap();
    let versions: Vec<(i64,)> =
        sqlx::query_as("SELECT version FROM schema_migrations ORDER BY version")
            .fetch_all(&reopened)
            .await
            .unwrap();
    assert_eq!(versions.len(), 10);
    assert_eq!(
        sibling_files(&database_path, ".pre-migration-v9-").len(),
        1,
        "v9 -> v10 upgrade must create exactly one pre-migration backup"
    );

    let ag = db::get_agent_by_id(&reopened, "antigravity")
        .await
        .unwrap()
        .expect("antigravity agent must exist");
    assert!(
        !ag.is_enabled,
        "v10 must preserve an existing disabled antigravity preference (is_enabled = 0)"
    );
    assert!(ag
        .global_skills_dir
        .replace('\\', "/")
        .ends_with(".agents/skills"));

    let installs: Vec<(String, String)> = sqlx::query_as(
        "SELECT skill_id, agent_id FROM skill_installations ORDER BY skill_id, agent_id",
    )
    .fetch_all(&reopened)
    .await
    .unwrap();
    assert_eq!(
        installs,
        vec![
            ("s-other".to_string(), "claude-code".to_string()),
            ("s-posix".to_string(), "gemini-cli".to_string()),
            ("s-universal".to_string(), "antigravity".to_string()),
            ("s-win".to_string(), "claude-code".to_string()),
        ]
    );

    let obs_rows: Vec<(String,)> =
        sqlx::query_as("SELECT row_id FROM agent_skill_observations ORDER BY row_id")
            .fetch_all(&reopened)
            .await
            .unwrap();
    assert_eq!(
        obs_rows,
        vec![
            ("obs-claude".to_string(),),
            ("obs-gemini-cli".to_string(),),
            ("obs-other-agent-legacy-path".to_string(),),
            ("obs-project".to_string(),),
            ("obs-universal".to_string(),),
        ]
    );

    let inv_rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT entity_key, agent_id FROM skill_update_inventory_entries ORDER BY entity_key",
    )
    .fetch_all(&reopened)
    .await
    .unwrap();
    assert_eq!(
        inv_rows,
        vec![
            ("k-claude".to_string(), "claude-code".to_string()),
            ("k-gemini".to_string(), "gemini-cli".to_string()),
        ]
    );

    let psi_rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT skill_id, agent_id FROM project_skill_installations ORDER BY skill_id, agent_id",
    )
    .fetch_all(&reopened)
    .await
    .unwrap();
    assert_eq!(
        psi_rows,
        vec![
            ("s-posix".to_string(), "antigravity".to_string()),
            ("s-win".to_string(), "antigravity".to_string()),
            ("s-win".to_string(), "claude-code".to_string()),
        ]
    );

    assert_eq!(
        std::fs::read(&legacy_disk_skill_md).unwrap(),
        legacy_disk_bytes,
        "v10 must never delete or alter files under ~/.gemini/config/skills on disk"
    );
    super::validate_foreign_keys(&reopened).await.unwrap();
    reopened.close().await;

    // Idempotent reopen must not create another backup.
    let reopened_again = db::open_database(&database_path).await.unwrap();
    assert_eq!(
        sibling_files(&database_path, ".pre-migration-").len(),
        1,
        "idempotent reopen at v10 must not create redundant backups"
    );
    reopened_again.close().await;

    // Verify existing is_enabled = 1 is also preserved unchanged across v9 -> v10.
    let enabled_path = directory.path().join("migration-ten-enabled.sqlite");
    let enabled_pool = crate::db::pool::create_pool(&enabled_path).await.unwrap();
    for version in 1..=9 {
        apply_migration(&enabled_pool, version).await.unwrap();
    }
    sqlx::query(
        "INSERT INTO agents (id, display_name, category, global_skills_dir, project_skills_dir, icon_name, is_detected, is_builtin, is_enabled)
         VALUES ('antigravity', 'Antigravity', 'coding', '/home/fixture/.gemini/config/skills', '.agents/skills', 'antigravity', 1, 1, 1)",
    )
    .execute(&enabled_pool)
    .await
    .unwrap();
    enabled_pool.close().await;

    let enabled_reopened = db::open_database(&enabled_path).await.unwrap();
    let enabled_ag = db::get_agent_by_id(&enabled_reopened, "antigravity")
        .await
        .unwrap()
        .expect("antigravity agent must exist");
    assert!(
        enabled_ag.is_enabled,
        "v10 must preserve an existing enabled antigravity preference (is_enabled = 1)"
    );
    assert!(enabled_ag
        .global_skills_dir
        .replace('\\', "/")
        .ends_with(".agents/skills"));
    super::validate_foreign_keys(&enabled_reopened)
        .await
        .unwrap();
    enabled_reopened.close().await;
}

#[tokio::test]
async fn migration_ten_cleans_legacy_antigravity_config_skills_rows_for_remote_home() {
    let _guard = DATABASE_OPEN_TEST_LOCK.lock().await;
    let directory = TempDir::new().unwrap();
    let remote_path = directory.path().join("remote-v9-disabled.sqlite");
    let remote_pool = crate::db::pool::create_pool(&remote_path).await.unwrap();
    for version in 1..=9 {
        apply_migration(&remote_pool, version).await.unwrap();
    }

    sqlx::query(
        "INSERT INTO agents (id, display_name, category, global_skills_dir, project_skills_dir, icon_name, is_detected, is_builtin, is_enabled)
         VALUES
           ('antigravity', 'Antigravity', 'coding', '/home/alice/.gemini/config/skills', '.agents/skills', 'antigravity', 1, 1, 0),
           ('claude-code', 'Claude Code', 'coding', '/home/alice/.claude/skills', '.claude/skills', 'claude', 1, 1, 1),
           ('gemini-cli', 'Gemini CLI', 'coding', '/home/alice/.gemini/skills', '.agents/skills', 'gemini', 1, 1, 1)",
    )
    .execute(&remote_pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO skills (id, uid, name, file_path, is_central, scanned_at)
         VALUES
           ('s-legacy', 'uid-legacy', 'S Legacy', '/home/alice/.skillport/s-legacy/SKILL.md', 1, '2026-01-01T00:00:00Z'),
           ('s-universal', 'uid-universal', 'S Universal', '/home/alice/.skillport/s-universal/SKILL.md', 1, '2026-01-01T00:00:00Z')",
    )
    .execute(&remote_pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO skill_installations (skill_id, agent_id, installed_path, link_type, created_at)
         VALUES
           ('s-legacy', 'antigravity', '/home/alice/.gemini/config/skills/s-legacy', 'symlink', '2026-01-01T00:00:00Z'),
           ('s-universal', 'antigravity', '/home/alice/.agents/skills/s-universal', 'symlink', '2026-01-01T00:00:00Z'),
           ('s-legacy', 'gemini-cli', '/home/alice/.gemini/skills/s-legacy', 'symlink', '2026-01-01T00:00:00Z'),
           ('s-legacy', 'claude-code', '/home/alice/.claude/skills/s-legacy', 'symlink', '2026-01-01T00:00:00Z')",
    )
    .execute(&remote_pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO agent_skill_observations
         (row_id, agent_id, skill_id, name, file_path, dir_path, source_kind, source_root, link_type, is_read_only, scanned_at)
         VALUES
           ('r-legacy-sub', 'antigravity', 's-legacy', 'S Legacy', '/home/alice/.gemini/config/skills/s-legacy/SKILL.md', '/home/alice/.gemini/config/skills/s-legacy', 'global', '/home/alice/.gemini/config/skills', 'symlink', 0, '2026-01-01T00:00:00Z'),
           ('r-legacy-exact', 'antigravity', 's-legacy', 'S Legacy', '/home/alice/.gemini/config/skills/SKILL.md', '/home/alice/.gemini/config/skills', 'global', '/home/alice/other', 'symlink', 0, '2026-01-01T00:00:00Z'),
           ('r-universal', 'antigravity', 's-universal', 'S Universal', '/home/alice/.agents/skills/s-universal/SKILL.md', '/home/alice/.agents/skills/s-universal', 'global', '/home/alice/.agents/skills', 'symlink', 0, '2026-01-01T00:00:00Z'),
           ('r-gemini', 'gemini-cli', 's-legacy', 'S Legacy', '/home/alice/.gemini/skills/s-legacy/SKILL.md', '/home/alice/.gemini/skills/s-legacy', 'global', '/home/alice/.gemini/skills', 'symlink', 0, '2026-01-01T00:00:00Z')",
    )
    .execute(&remote_pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO projects (id, path, name, added_at)
         VALUES ('p-remote', '/home/alice/repo', 'repo', '2026-01-01T00:00:00Z')",
    )
    .execute(&remote_pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO project_skill_installations
         (project_id, skill_id, name, file_path, source_origin, agent_id, installed_path, link_type, created_at)
         VALUES
           ('p-remote', 's-legacy', 'S Legacy', '/home/alice/repo/.agents/skills/s-legacy/SKILL.md', 'central', 'antigravity', '/home/alice/repo/.agents/skills/s-legacy', 'symlink', '2026-01-01T00:00:00Z')",
    )
    .execute(&remote_pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO skill_update_inventory_runs
         (inventory_id, scope_kind, mode, cache_policy, generated_at)
         VALUES ('inv-remote', 'global', 'check', 'default', '2026-01-01T00:00:00Z')",
    )
    .execute(&remote_pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO skill_update_inventory_entries
         (inventory_id, bucket, entity_key, agent_id, cache_policy, cache_hit, generated_at, payload_json)
         VALUES
           ('inv-remote', 'updates', 'k-ag', 'antigravity', 'default', 0, '2026-01-01T00:00:00Z', '{}'),
           ('inv-remote', 'updates', 'k-gemini', 'gemini-cli', 'default', 0, '2026-01-01T00:00:00Z', '{}')",
    )
    .execute(&remote_pool)
    .await
    .unwrap();
    remote_pool.close().await;

    let remote_reopened = db::open_database_for_remote_home(&remote_path, "/home/alice")
        .await
        .unwrap();
    let versions: Vec<(i64,)> =
        sqlx::query_as("SELECT version FROM schema_migrations ORDER BY version")
            .fetch_all(&remote_reopened)
            .await
            .unwrap();
    assert_eq!(versions.len(), 10);
    assert_eq!(
        sibling_files(&remote_path, ".pre-migration-v9-").len(),
        1,
        "remote v9 -> v10 upgrade must create one pre-migration backup"
    );

    let remote_ag = db::get_agent_by_id(&remote_reopened, "antigravity")
        .await
        .unwrap()
        .expect("remote antigravity agent must exist");
    assert_eq!(remote_ag.global_skills_dir, "/home/alice/.agents/skills");
    assert!(
        !remote_ag.is_enabled,
        "remote v10 upgrade must preserve is_enabled = 0"
    );

    let installs: Vec<(String, String)> = sqlx::query_as(
        "SELECT skill_id, agent_id FROM skill_installations ORDER BY skill_id, agent_id",
    )
    .fetch_all(&remote_reopened)
    .await
    .unwrap();
    assert_eq!(
        installs,
        vec![
            ("s-legacy".to_string(), "claude-code".to_string()),
            ("s-legacy".to_string(), "gemini-cli".to_string()),
            ("s-universal".to_string(), "antigravity".to_string()),
        ]
    );

    let obs_rows: Vec<(String,)> =
        sqlx::query_as("SELECT row_id FROM agent_skill_observations ORDER BY row_id")
            .fetch_all(&remote_reopened)
            .await
            .unwrap();
    assert_eq!(
        obs_rows,
        vec![("r-gemini".to_string(),), ("r-universal".to_string(),)]
    );

    let inv_rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT entity_key, agent_id FROM skill_update_inventory_entries ORDER BY entity_key",
    )
    .fetch_all(&remote_reopened)
    .await
    .unwrap();
    assert_eq!(
        inv_rows,
        vec![("k-gemini".to_string(), "gemini-cli".to_string())]
    );

    let psi_rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT skill_id, agent_id FROM project_skill_installations ORDER BY skill_id, agent_id",
    )
    .fetch_all(&remote_reopened)
    .await
    .unwrap();
    assert_eq!(
        psi_rows,
        vec![("s-legacy".to_string(), "antigravity".to_string())]
    );
    super::validate_foreign_keys(&remote_reopened)
        .await
        .unwrap();
    remote_reopened.close().await;

    let remote_again = db::open_database_for_remote_home(&remote_path, "/home/alice")
        .await
        .unwrap();
    assert_eq!(
        sibling_files(&remote_path, ".pre-migration-").len(),
        1,
        "idempotent remote reopen at v10 must not create redundant backups"
    );
    remote_again.close().await;

    // Verify remote is_enabled = 1 is preserved unchanged across v9 -> v10.
    let remote_enabled_path = directory.path().join("remote-v9-enabled.sqlite");
    let remote_enabled_pool = crate::db::pool::create_pool(&remote_enabled_path)
        .await
        .unwrap();
    for version in 1..=9 {
        apply_migration(&remote_enabled_pool, version)
            .await
            .unwrap();
    }
    sqlx::query(
        "INSERT INTO agents (id, display_name, category, global_skills_dir, project_skills_dir, icon_name, is_detected, is_builtin, is_enabled)
         VALUES ('antigravity', 'Antigravity', 'coding', '/home/alice/.gemini/config/skills', '.agents/skills', 'antigravity', 1, 1, 1)",
    )
    .execute(&remote_enabled_pool)
    .await
    .unwrap();
    remote_enabled_pool.close().await;

    let remote_enabled_reopened =
        db::open_database_for_remote_home(&remote_enabled_path, "/home/alice")
            .await
            .unwrap();
    let remote_enabled_ag = db::get_agent_by_id(&remote_enabled_reopened, "antigravity")
        .await
        .unwrap()
        .expect("remote antigravity agent must exist");
    assert_eq!(
        remote_enabled_ag.global_skills_dir,
        "/home/alice/.agents/skills"
    );
    assert!(
        remote_enabled_ag.is_enabled,
        "remote v10 upgrade must preserve is_enabled = 1"
    );
    super::validate_foreign_keys(&remote_enabled_reopened)
        .await
        .unwrap();
    remote_enabled_reopened.close().await;
}

#[tokio::test]
async fn selected_release_fixtures_upgrade_with_backup_and_cascades() {
    let _guard = DATABASE_OPEN_TEST_LOCK.lock().await;
    for fixture in fixture_manifest().fixtures {
        let directory = TempDir::new().unwrap();
        let database_path = directory.path().join("db.sqlite");
        materialize_fixture(&fixture, &database_path).await;
        std::fs::copy(
            &database_path,
            directory
                .path()
                .join("db.sqlite.pre-migration-v0-stale.sqlite3"),
        )
        .unwrap();

        let pool = db::open_database(&database_path)
            .await
            .unwrap_or_else(|error| panic!("{} upgrade failed: {error}", fixture.tag));
        let versions =
            sqlx::query("SELECT version, checksum FROM schema_migrations ORDER BY version")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(versions.len(), 10);
        for (index, row) in versions.iter().enumerate() {
            let version = i64::try_from(index + 1).unwrap();
            assert_eq!(row.try_get::<i64, _>("version").unwrap(), version);
            assert_eq!(
                row.try_get::<String, _>("checksum").unwrap(),
                descriptor_checksum(version).unwrap()
            );
        }
        let sentinel = sqlx::query("SELECT name, uid FROM skills WHERE id = 'fixture-skill'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(
            sentinel.try_get::<String, _>("name").unwrap(),
            "Fixture Skill"
        );
        assert!(!sentinel.try_get::<String, _>("uid").unwrap().is_empty());
        assert_owned_foreign_keys(&pool).await;
        assert!(file_has_table(&database_path, "fs_db_operations").await);
        // Migration 5 adds the incremental usage-scan file cache.
        assert!(file_has_table(&database_path, "skill_call_file_cache").await);
        let pending_columns = sqlx::query("PRAGMA table_info(skill_repository_pending_additions)")
            .fetch_all(&pool)
            .await
            .unwrap()
            .into_iter()
            .map(|row| row.try_get::<String, _>("name").unwrap())
            .collect::<Vec<_>>();
        assert!(pending_columns.contains(&"resolved_commit_sha".to_string()));
        assert!(pending_columns.contains(&"snapshot_digest".to_string()));
        assert!(file_has_table(&database_path, "skills_cli_update_repositories").await);
        assert!(file_has_table(&database_path, "skills_cli_update_states").await);
        assert!(file_has_table(&database_path, "skills_cli_update_operations").await);
        // Migration 4 adds nullable per-skill provenance; pre-existing rows stay
        // NULL and are read as "provenance unknown".
        let provenance = db::get_skill_repository_provenance(&pool, "fixture-skill")
            .await
            .unwrap()
            .expect("fixture membership row survived migration 4");
        assert_eq!(provenance, (None, None), "{} provenance drift", fixture.tag);
        assert_eq!(
            sqlx::query("SELECT source_path FROM skill_repository_members WHERE skill_id = ?")
                .bind("fixture-skill")
                .fetch_one(&pool)
                .await
                .unwrap()
                .try_get::<String, _>("source_path")
                .unwrap(),
            "skills/fixture-skill"
        );
        assert!(sqlx::query("PRAGMA foreign_key_check")
            .fetch_optional(&pool)
            .await
            .unwrap()
            .is_none());

        let mut connections = Vec::new();
        for _ in 0..3 {
            connections.push(pool.acquire().await.unwrap());
        }
        for connection in &mut connections {
            let enabled = sqlx::query("PRAGMA foreign_keys")
                .fetch_one(&mut **connection)
                .await
                .unwrap()
                .try_get::<i64, _>(0)
                .unwrap();
            assert_eq!(enabled, 1);
        }
        drop(connections);

        insert_independent_history(&pool).await;
        db::delete_skill(&pool, "fixture-skill").await.unwrap();
        for relation in db::repos::skill_relations_spec::owned_skill_relations() {
            let sql = format!(
                "SELECT COUNT(*) AS count FROM {} WHERE {} = 'fixture-skill'",
                relation.table, relation.skill_column
            );
            let count = sqlx::query(&sql)
                .fetch_one(&pool)
                .await
                .unwrap()
                .try_get::<i64, _>("count")
                .unwrap();
            assert_eq!(count, 0, "{} did not cascade", relation.table);
        }
        for table in [
            "agent_skill_observations",
            "project_skill_installations",
            "skill_usage_metadata",
        ] {
            let sql = format!("SELECT COUNT(*) AS count FROM {table}");
            let count = sqlx::query(&sql)
                .fetch_one(&pool)
                .await
                .unwrap()
                .try_get::<i64, _>("count")
                .unwrap();
            assert_eq!(count, 1, "{table} history should remain independent");
        }

        let backup_count = sibling_files(&database_path, ".pre-migration-v0-").len();
        assert_eq!(backup_count, 1, "{} must retain one backup", fixture.tag);
        pool.close().await;
        let reopened = db::open_database(&database_path).await.unwrap();
        assert_eq!(
            sibling_files(&database_path, ".pre-migration-v0-").len(),
            backup_count,
            "{} current reopen created another backup",
            fixture.tag
        );
        reopened.close().await;
    }
}

async fn assert_preflight_rejection(mutation_sql: &str, expected: &str) {
    let directory = TempDir::new().unwrap();
    let database_path = directory.path().join("db.sqlite");
    let pool = db::open_database(&database_path).await.unwrap();
    pool.close().await;

    let raw_pool = crate::db::pool::create_pool(&database_path).await.unwrap();
    sqlx::query(mutation_sql).execute(&raw_pool).await.unwrap();
    raw_pool.close().await;

    let error = db::open_database(&database_path).await.unwrap_err();
    assert!(
        error.to_string().contains(expected),
        "unexpected error: {error}"
    );
    assert!(sibling_files(&database_path, ".pre-migration-").is_empty());
}

async fn assert_preflight_accepts_v1_legacy_checksum_without_rewriting_it(checksum: &str) {
    let directory = TempDir::new().unwrap();
    let database_path = directory.path().join("db.sqlite");
    let pool = db::open_database(&database_path).await.unwrap();
    sqlx::query(
        "INSERT INTO skills
         (id, uid, name, description, file_path, canonical_path, is_central, source,
          content, scanned_at, fs_created_at, fs_updated_at)
         VALUES ('legacy-checksum-sentinel', 'legacy-checksum-uid', 'Legacy checksum sentinel',
                 '', '/fixture/SKILL.md', '/fixture/SKILL.md', 1, 'native', '',
                 '2026-01-01T00:00:00Z', NULL, NULL)",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("UPDATE schema_migrations SET checksum = ? WHERE version = 1")
        .bind(checksum)
        .execute(&pool)
        .await
        .unwrap();
    pool.close().await;

    let reopened = db::open_database(&database_path).await.unwrap();
    let stored_checksum = sqlx::query("SELECT checksum FROM schema_migrations WHERE version = 1")
        .fetch_one(&reopened)
        .await
        .unwrap()
        .try_get::<String, _>("checksum")
        .unwrap();
    assert_eq!(stored_checksum, checksum);
    assert_eq!(
        sqlx::query("SELECT COUNT(*) AS count FROM skills WHERE id = 'legacy-checksum-sentinel'")
            .fetch_one(&reopened)
            .await
            .unwrap()
            .try_get::<i64, _>("count")
            .unwrap(),
        1
    );
    assert!(sibling_files(&database_path, ".pre-migration-").is_empty());
    reopened.close().await;
}

#[tokio::test]
async fn preflight_accepts_the_published_windows_v1_checksum_without_rewriting_it() {
    assert_preflight_accepts_v1_legacy_checksum_without_rewriting_it(
        versions::PUBLISHED_WINDOWS_V1_CHECKSUM,
    )
    .await;
}

#[tokio::test]
async fn preflight_accepts_the_published_pre_final_schema_v1_checksum_without_rewriting_it() {
    assert_preflight_accepts_v1_legacy_checksum_without_rewriting_it(
        versions::PUBLISHED_PRE_FINAL_SCHEMA_V1_CHECKSUM,
    )
    .await;
}

#[tokio::test]
async fn preflight_rejects_checksum_gap_and_future_versions_without_backup() {
    assert_preflight_rejection(
        "UPDATE schema_migrations SET checksum = 'tampered' WHERE version = 1",
        "checksum mismatch",
    )
    .await;
    let uppercase_alias = versions::PUBLISHED_WINDOWS_V1_CHECKSUM.to_ascii_uppercase();
    let uppercase_mutation =
        format!("UPDATE schema_migrations SET checksum = '{uppercase_alias}' WHERE version = 1");
    assert_preflight_rejection(&uppercase_mutation, "checksum mismatch").await;
    let prefixed_mutation = format!(
        "UPDATE schema_migrations SET checksum = 'legacy-{}' WHERE version = 1",
        versions::PUBLISHED_WINDOWS_V1_CHECKSUM
    );
    assert_preflight_rejection(&prefixed_mutation, "checksum mismatch").await;
    let cross_version_mutation = format!(
        "UPDATE schema_migrations SET checksum = '{}' WHERE version = 2",
        versions::PUBLISHED_WINDOWS_V1_CHECKSUM
    );
    assert_preflight_rejection(&cross_version_mutation, "checksum mismatch").await;
    assert_preflight_rejection(
        "DELETE FROM schema_migrations WHERE version = 1",
        "not contiguous",
    )
    .await;
    assert_preflight_rejection(
        "INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (11, 'future', 'now')",
        "newer than supported",
    )
    .await;
}

async fn create_rebuild_collision_fixture(path: &Path) {
    let mut manifest = fixture_manifest();
    let fixture = manifest.fixtures.remove(0);
    materialize_fixture(&fixture, path).await;
    let pool = crate::db::pool::create_pool(path).await.unwrap();
    sqlx::query("CREATE TABLE __skill_relation_rebuild (id TEXT PRIMARY KEY)")
        .execute(&pool)
        .await
        .unwrap();
    pool.close().await;
}

async fn file_has_table(path: &Path, table: &str) -> bool {
    let options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(path)
        .read_only(true);
    let mut connection = SqliteConnection::connect_with(&options).await.unwrap();
    let present =
        sqlx::query("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?)")
            .bind(table)
            .fetch_one(&mut connection)
            .await
            .unwrap()
            .try_get::<i64, _>(0)
            .unwrap()
            == 1;
    connection.close().await.unwrap();
    present
}

#[tokio::test]
async fn failed_fk_migration_restores_the_original_database() {
    let _guard = DATABASE_OPEN_TEST_LOCK.lock().await;
    let directory = TempDir::new().unwrap();
    let database_path = directory.path().join("db.sqlite");
    create_rebuild_collision_fixture(&database_path).await;

    let error = db::open_database(&database_path).await.unwrap_err();
    assert!(error.to_string().contains("already exists"));
    backup::validate_sqlite_file(&database_path).await.unwrap();
    let backup_files = sibling_files(&database_path, ".pre-migration-v0-");
    assert_eq!(backup_files.len(), 1);
    assert!(
        !file_has_table(&backup_files[0], "schema_migrations").await,
        "backup unexpectedly contains migration metadata"
    );
    let options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(&database_path)
        .read_only(true);
    let mut connection = SqliteConnection::connect_with(&options).await.unwrap();
    let migration_table = sqlx::query(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations')",
    )
    .fetch_one(&mut connection)
    .await
    .unwrap()
    .try_get::<i64, _>(0)
    .unwrap();
    assert_eq!(
        migration_table, 0,
        "migration metadata survived restore; open error was: {error}"
    );
    connection.close().await.unwrap();
    assert_eq!(sibling_files(&database_path, ".pre-migration-v0-").len(), 1);
    assert_eq!(sibling_files(&database_path, ".failed-migration-").len(), 1);
}

#[tokio::test]
async fn restore_failure_is_reported_and_keeps_backup_and_quarantine() {
    let _guard = DATABASE_OPEN_TEST_LOCK.lock().await;
    let directory = TempDir::new().unwrap();
    let database_path = directory.path().join("db.sqlite");
    create_rebuild_collision_fixture(&database_path).await;
    backup::fail_next_restore_after_quarantine();

    let error = db::open_database(&database_path).await.unwrap_err();
    let message = error.to_string();
    assert!(message.contains("Database migration failed"));
    assert!(message.contains("backup restore also failed"));
    assert!(
        message.contains("injected restore failure"),
        "unexpected combined error: {message}"
    );
    assert_eq!(sibling_files(&database_path, ".pre-migration-v0-").len(), 1);
    assert_eq!(sibling_files(&database_path, ".failed-migration-").len(), 1);
}

#[tokio::test]
async fn rejected_backup_blocks_migration_before_any_schema_write() {
    let _guard = DATABASE_OPEN_TEST_LOCK.lock().await;
    let directory = TempDir::new().unwrap();
    let database_path = directory.path().join("db.sqlite");
    let mut manifest = fixture_manifest();
    let fixture = manifest.fixtures.remove(0);
    materialize_fixture(&fixture, &database_path).await;
    backup::fail_next_backup_validation();

    let error = db::open_database(&database_path).await.unwrap_err();
    assert!(error
        .to_string()
        .contains("injected backup validation failure"));
    assert!(!file_has_table(&database_path, "schema_migrations").await);
    assert!(sibling_files(&database_path, ".pre-migration-").is_empty());
}
