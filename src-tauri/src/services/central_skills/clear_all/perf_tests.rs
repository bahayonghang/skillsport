//! Preview/apply timing for 1000 Central skills × 6 agents. Run with
//! `cargo test --release central_skills::clear_all::perf_tests -- --ignored --nocapture`
//! for release numbers; the debug default keeps a loose sanity bound only.

use std::sync::atomic::AtomicBool;
use std::time::Instant;

use tempfile::TempDir;

use super::candidates::RootDefaults;
use super::*;
use crate::db::{self, SkillInstallation};
use crate::test_support::file_pool;

const SKILLS: usize = 1000;
const AGENTS: [&str; 6] = [
    "windsurf", "amp", "opencode", "augment", "qoder", "kilocode",
];

#[tokio::test]
#[ignore = "performance measurement; run explicitly with --ignored --nocapture"]
async fn perf_clear_preview_1000x6() {
    let (pool, _db_dir) = file_pool().await;
    let temp = TempDir::new().unwrap();
    let central = temp.path().join("central");
    for agent in db::get_all_agents(&pool).await.unwrap() {
        let dir = if agent.id == "central" {
            central.clone()
        } else {
            temp.path().join("agents").join(&agent.id)
        };
        crate::test_support::set_agent_dir(&pool, &agent.id, &dir).await;
    }

    let seed_started = Instant::now();
    let now = chrono::Utc::now().to_rfc3339();
    let mut skills = Vec::with_capacity(SKILLS);
    let mut installations = Vec::with_capacity(SKILLS * AGENTS.len());
    for index in 0..SKILLS {
        let id = format!("skill-{index:04}");
        let dir = central.join(&id);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("SKILL.md"), format!("---\nname: {id}\n---\n")).unwrap();
        skills.push(crate::test_support::central_skill_row(&id, &dir));
        for agent_id in AGENTS {
            let link = temp.path().join("agents").join(agent_id).join(&id);
            create_link(&dir, &link);
            installations.push(SkillInstallation {
                skill_id: id.clone(),
                agent_id: agent_id.to_string(),
                installed_path: link.to_string_lossy().into_owned(),
                link_type: "symlink".to_string(),
                symlink_target: None,
                created_at: now.clone(),
            });
        }
    }
    let mut tx = pool.begin().await.unwrap();
    for skill in &skills {
        sqlx::query(
            "INSERT INTO skills (id, uid, name, description, file_path, canonical_path,
             is_central, source, content, scanned_at)
             VALUES (?, ?, ?, NULL, ?, ?, 1, NULL, NULL, ?)",
        )
        .bind(&skill.id)
        .bind(&skill.uid)
        .bind(&skill.name)
        .bind(&skill.file_path)
        .bind(&skill.canonical_path)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .unwrap();
    }
    for installation in &installations {
        sqlx::query(
            "INSERT INTO skill_installations
             (skill_id, agent_id, installed_path, link_type, symlink_target, created_at)
             VALUES (?, ?, ?, ?, NULL, ?)",
        )
        .bind(&installation.skill_id)
        .bind(&installation.agent_id)
        .bind(&installation.installed_path)
        .bind(&installation.link_type)
        .bind(&installation.created_at)
        .execute(&mut *tx)
        .await
        .unwrap();
    }
    tx.commit().await.unwrap();
    println!(
        "seeded {SKILLS} skills x {} agents in {:?}",
        AGENTS.len(),
        seed_started.elapsed()
    );

    let defaults = RootDefaults {
        local: Some(Vec::new()),
    };
    let started = Instant::now();
    let preview = preview_with(&pool, &ActiveTarget::Local, None, &defaults)
        .await
        .unwrap();
    let preview_elapsed = started.elapsed();
    println!("clear-all preview: {preview_elapsed:?}");
    assert_eq!(preview.skill_ids.len(), SKILLS);
    assert!(preview.orphan_links.is_empty());
    assert_eq!(preview.agent_summaries.len(), AGENTS.len());

    let request = ClearCentralRequest {
        skill_ids: preview.skill_ids.clone(),
        orphan_link_keys: vec![CLEAR_ALL_WILDCARD_KEY.to_string()],
        untracked_entry_keys: vec![CLEAR_ALL_WILDCARD_KEY.to_string()],
        project_link_keys: vec![CLEAR_ALL_WILDCARD_KEY.to_string()],
        ..Default::default()
    };
    let cancel = AtomicBool::new(false);
    let sink = |_: ClearCentralProgress| {};
    let started = Instant::now();
    let result = clear_with_for_tests(
        &pool,
        &ActiveTarget::Local,
        None,
        &request,
        ClearJob {
            job_id: "perf",
            cancel: &cancel,
            progress: &sink,
        },
        &defaults,
    )
    .await
    .unwrap();
    println!("clear-all apply: {:?}", started.elapsed());
    assert_eq!(result.skills.succeeded.len(), SKILLS);
    assert!(result.skills.failed.is_empty());
    assert!(preview_elapsed.as_secs_f64() < 2.0 || cfg!(debug_assertions));
}

fn create_link(target: &std::path::Path, link: &std::path::Path) {
    std::fs::create_dir_all(link.parent().unwrap()).unwrap();
    #[cfg(windows)]
    {
        crate::services::installation::fs_util::create_skills_cli_directory_link(target, link)
            .unwrap();
    }
    #[cfg(not(windows))]
    {
        crate::test_support::symlink_dir(target, link);
    }
}
