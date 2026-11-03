//! Candidate computation shared by preview and the locked apply rescan.
//!
//! SQL is a fixed number of batch queries regardless of skill count
//! (agents, Central skills, installations in 500-id chunks, projects, project
//! installations). Filesystem inspection runs in one blocking unit.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use crate::db::repos::{agents_repo, installations_repo, projects_repo, skills_repo};
use crate::db::{Agent, DbPool, Project, ProjectSkillInstallation, Skill, SkillInstallation};
use crate::paths::{key_is_within, path_comparison_key, remote_path_comparison_key};
use crate::targets::{ActiveTarget, ConnectedRemoteTarget};

use super::super::delete::{
    ensure_child_path, ensure_remote_child_path, normalize_remote_path, remote_skill_delete_dir,
    skill_delete_dir,
};
use super::super::error::CentralSkillsError;
use super::super::types::FailedCentralSkillDelete;
use super::remote::{
    probe_remote_dirs, probe_remote_paths, resolve_remote_link_target, RemoteDirListing,
    RemoteEntry, RemotePathState,
};
use super::sweep::{
    local_link_target, sweep_local, target_is_attributable, LocalSweepInput, ScanDir,
    JOURNAL_ENTRY_PREFIX, SWEEP_WARNING_UNREADABLE,
};
use super::types::{
    ClearCentralAgentSummary, ClearCentralOwnerKind, ClearCentralPathItem, ClearCentralSweepWarning,
};

/// Default Central roots to attribute links to. Production uses the app-data
/// and home-derived defaults; tests inject TempDir roots.
#[derive(Debug, Clone, Default)]
pub(super) struct RootDefaults {
    pub local: Option<Vec<PathBuf>>,
}

#[derive(Debug, Clone)]
pub(super) enum CentralRootRef {
    Local(PathBuf),
    Remote(String),
}

#[derive(Debug, Clone)]
pub(super) struct ProjectLinkCandidate {
    pub item: ClearCentralPathItem,
    pub project_id: String,
    pub skill_id: String,
    pub agent_id: String,
}

#[derive(Debug, Clone)]
pub(super) struct ClearPlan {
    pub central_root: CentralRootRef,
    pub root_keys: Vec<String>,
    /// Central skills that pass the per-skill delete preview, sorted by id.
    pub skill_ids: Vec<String>,
    pub skill_preview_failed: Vec<FailedCentralSkillDelete>,
    pub installations: HashMap<String, Vec<SkillInstallation>>,
    /// Keys of every DB Central skill directory (also preview-failed ones).
    pub central_skill_dir_keys: HashSet<String>,
    pub project_links: Vec<ProjectLinkCandidate>,
    pub orphan_links: Vec<ClearCentralPathItem>,
    pub untracked: Vec<ClearCentralPathItem>,
    pub skipped_unmanaged: usize,
    pub warnings: Vec<ClearCentralSweepWarning>,
    /// Remote only: raw `readlink` value captured by the locked probe, keyed
    /// by item key. Removal deletes a link only if it still has this target.
    pub remote_link_targets: HashMap<String, String>,
}

impl ClearPlan {
    pub(super) fn central_root_display(&self) -> String {
        match &self.central_root {
            CentralRootRef::Local(path) => path.to_string_lossy().into_owned(),
            CentralRootRef::Remote(path) => path.clone(),
        }
    }

    pub(super) fn agent_summaries(&self) -> Vec<ClearCentralAgentSummary> {
        let mut rows: HashMap<String, ClearCentralAgentSummary> = HashMap::new();
        for skill_id in &self.skill_ids {
            for installation in self.installations.get(skill_id).into_iter().flatten() {
                if installation.agent_id == "central" {
                    continue;
                }
                let row = rows
                    .entry(installation.agent_id.clone())
                    .or_insert_with(|| empty_summary(&installation.agent_id));
                if installation.link_type == "copy" {
                    row.copy_count += 1;
                } else {
                    row.link_count += 1;
                }
            }
        }
        for orphan in &self.orphan_links {
            if orphan.owner_kind == ClearCentralOwnerKind::Agent {
                rows.entry(orphan.owner_id.clone())
                    .or_insert_with(|| empty_summary(&orphan.owner_id))
                    .orphan_link_count += 1;
            }
        }
        let mut summaries = rows.into_values().collect::<Vec<_>>();
        summaries.sort_by(|left, right| left.agent_id.cmp(&right.agent_id));
        summaries
    }
}

fn empty_summary(agent_id: &str) -> ClearCentralAgentSummary {
    ClearCentralAgentSummary {
        agent_id: agent_id.to_string(),
        link_count: 0,
        copy_count: 0,
        orphan_link_count: 0,
    }
}

struct DbSnapshot {
    agents: Vec<Agent>,
    central_root: String,
    skills: Vec<Skill>,
    installations: HashMap<String, Vec<SkillInstallation>>,
    projects: Vec<Project>,
    project_installations: Vec<ProjectSkillInstallation>,
}

async fn load_db_snapshot(pool: &DbPool) -> Result<DbSnapshot, CentralSkillsError> {
    let agents = agents_repo::get_all_agents(pool).await?;
    let central_root = agents
        .iter()
        .find(|agent| agent.id == "central")
        .map(|agent| agent.global_skills_dir.clone())
        .ok_or(CentralSkillsError::CentralAgentMissing)?;
    let mut skills = skills_repo::get_central_skills(pool).await?;
    skills.sort_by(|left, right| left.id.cmp(&right.id));
    let skill_ids = skills
        .iter()
        .map(|skill| skill.id.clone())
        .collect::<Vec<_>>();
    let installations =
        installations_repo::get_skill_installations_for_skills(pool, &skill_ids).await?;
    let projects = projects_repo::list_projects(pool).await?;
    let project_installations = projects_repo::list_all_project_skill_installations(pool).await?;
    Ok(DbSnapshot {
        agents,
        central_root,
        skills,
        installations,
        projects,
        project_installations,
    })
}

pub(super) async fn load_plan(
    pool: &DbPool,
    target: &ActiveTarget,
    remote: Option<&ConnectedRemoteTarget>,
    defaults: &RootDefaults,
) -> Result<ClearPlan, CentralSkillsError> {
    let snapshot = load_db_snapshot(pool).await?;
    match (target, remote) {
        (ActiveTarget::Local, _) => load_local_plan(snapshot, defaults).await,
        (_, Some(connection)) => load_remote_plan(snapshot, connection).await,
        (_, None) => Err(CentralSkillsError::Remote(
            "Failed to connect to the selected target.".to_string(),
        )),
    }
}

// ─── Local ───────────────────────────────────────────────────────────────────

async fn load_local_plan(
    snapshot: DbSnapshot,
    defaults: &RootDefaults,
) -> Result<ClearPlan, CentralSkillsError> {
    let defaults = defaults.local.clone();
    crate::fs_util::run_blocking_fs_with(
        "Central clear-all scan",
        move || Ok(build_local_plan(snapshot, defaults)),
        CentralSkillsError::task_join,
    )
    .await
}

fn build_local_plan(snapshot: DbSnapshot, defaults: Option<Vec<PathBuf>>) -> ClearPlan {
    let central_root = crate::paths::expand_home_path(&snapshot.central_root);
    let roots = match defaults {
        Some(defaults) => crate::paths::attributable_central_roots_with(&central_root, &defaults),
        None => crate::paths::attributable_central_roots(&central_root),
    };
    let root_keys = roots
        .iter()
        .map(|root| path_comparison_key(root))
        .collect::<Vec<_>>();

    // Same checks as `preview_delete_central_skill_impl`, without per-skill SQL.
    let mut skill_ids = Vec::new();
    let mut skill_preview_failed = Vec::new();
    let mut central_skill_dir_keys = HashSet::new();
    let mut canonical_parents: HashMap<PathBuf, PathBuf> = HashMap::new();
    for skill in &snapshot.skills {
        match skill_delete_dir(skill) {
            Ok(dir) => {
                central_skill_dir_keys.insert(path_comparison_key(&dir));
                // Also the canonical-ancestor form, so a DB path stored through
                // a different (linked/8.3) spelling of the root still matches.
                if let Some(key) = slot_key_cached(&dir, &mut canonical_parents) {
                    central_skill_dir_keys.insert(key);
                }
                match ensure_child_path(&central_root, &dir, &skill.id) {
                    Ok(()) => skill_ids.push(skill.id.clone()),
                    Err(_) => skill_preview_failed
                        .push(FailedCentralSkillDelete::preview_fallback(skill.id.clone())),
                }
            }
            Err(_) => skill_preview_failed
                .push(FailedCentralSkillDelete::preview_fallback(skill.id.clone())),
        }
    }

    let mut registered_keys = HashSet::new();
    for installation in snapshot.installations.values().flatten() {
        registered_keys.insert(path_comparison_key(Path::new(&installation.installed_path)));
    }
    for row in &snapshot.project_installations {
        registered_keys.insert(path_comparison_key(Path::new(&row.installed_path)));
    }

    let project_links = local_project_links(&snapshot.project_installations, &root_keys);
    let scan_dirs = local_scan_dirs(&snapshot.agents, &snapshot.projects, &central_root);
    let sweep = sweep_local(&LocalSweepInput {
        scan_dirs: &scan_dirs,
        root_keys: &root_keys,
        registered_keys: &registered_keys,
        central_root: &central_root,
        central_skill_dir_keys: &central_skill_dir_keys,
    });

    ClearPlan {
        central_root: CentralRootRef::Local(central_root),
        root_keys,
        skill_ids,
        skill_preview_failed,
        installations: snapshot.installations,
        central_skill_dir_keys,
        project_links,
        orphan_links: sweep.orphans,
        untracked: sweep.untracked,
        skipped_unmanaged: sweep.skipped_unmanaged,
        warnings: sweep.warnings,
        remote_link_targets: HashMap::new(),
    }
}

/// [`super::sweep::slot_comparison_key`] with one canonicalization per
/// distinct parent (Central skills share a handful of parents).
fn slot_key_cached(dir: &Path, cache: &mut HashMap<PathBuf, PathBuf>) -> Option<String> {
    let parent = dir
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())?;
    let name = dir.file_name()?;
    let canonical = cache
        .entry(parent.to_path_buf())
        .or_insert_with(|| crate::paths::canonicalize_path_with_missing(parent));
    Some(path_comparison_key(&canonical.join(name)))
}

/// Every agent global dir (enabled or not, built-in or custom) plus every
/// registered project × agent project dir, deduplicated by comparison key.
/// Directories equal to or inside the Central root are skipped (native
/// shared roots go with the Central directory itself).
fn local_scan_dirs(agents: &[Agent], projects: &[Project], central_root: &Path) -> Vec<ScanDir> {
    let central_key = path_comparison_key(central_root);
    let mut seen = HashSet::new();
    let mut dirs = Vec::new();
    let mut push = |owner_kind, owner_id: &str, dir: PathBuf| {
        if dir.as_os_str().is_empty() {
            return;
        }
        let key = path_comparison_key(&dir);
        if key_is_within(&central_key, &key) || crate::paths::paths_equivalent(&dir, central_root) {
            return;
        }
        if seen.insert(key) {
            dirs.push(ScanDir {
                owner_kind,
                owner_id: owner_id.to_string(),
                dir,
            });
        }
    };
    for agent in agents.iter().filter(|agent| agent.id != "central") {
        if agent.global_skills_dir.trim().is_empty() {
            continue;
        }
        push(
            ClearCentralOwnerKind::Agent,
            &agent.id,
            crate::paths::expand_home_path(&agent.global_skills_dir),
        );
    }
    for project in projects {
        for agent in agents.iter().filter(|agent| agent.id != "central") {
            let Ok(relative) =
                crate::services::installation::project::project_relative_skills_dir(agent)
            else {
                continue;
            };
            push(
                ClearCentralOwnerKind::Project,
                &project.id,
                PathBuf::from(&project.path).join(relative),
            );
        }
    }
    dirs
}

fn local_project_links(
    rows: &[ProjectSkillInstallation],
    root_keys: &[String],
) -> Vec<ProjectLinkCandidate> {
    let mut candidates = Vec::new();
    for row in rows.iter().filter(|row| row.link_type == "symlink") {
        let path = PathBuf::from(&row.installed_path);
        let dangling = match std::fs::symlink_metadata(&path) {
            Ok(metadata)
                if crate::services::installation::fs_util::is_reparse_or_symlink(&metadata) =>
            {
                let Some(target) = local_link_target(&path) else {
                    continue;
                };
                if !target_is_attributable(&target, root_keys) {
                    continue;
                }
                !path.exists()
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                // Link already gone: the psi row is stale only when its
                // recorded target was a Central path.
                let Some(stored) = row.symlink_target.as_deref() else {
                    continue;
                };
                let target = crate::services::installation::fs_util::resolved_symlink_target(
                    &path,
                    Path::new(stored),
                );
                if !target_is_attributable(&target, root_keys) {
                    continue;
                }
                true
            }
            _ => continue,
        };
        candidates.push(ProjectLinkCandidate {
            item: ClearCentralPathItem {
                key: path_comparison_key(&path),
                path: row.installed_path.clone(),
                owner_kind: ClearCentralOwnerKind::Project,
                owner_id: row.project_id.clone(),
                skill_name: Some(row.skill_id.clone()),
                dangling,
            },
            project_id: row.project_id.clone(),
            skill_id: row.skill_id.clone(),
            agent_id: row.agent_id.clone(),
        });
    }
    candidates.sort_by(|left, right| left.item.key.cmp(&right.item.key));
    candidates.dedup_by(|left, right| {
        left.item.key == right.item.key
            && left.project_id == right.project_id
            && left.skill_id == right.skill_id
            && left.agent_id == right.agent_id
    });
    candidates
}

// ─── Remote ──────────────────────────────────────────────────────────────────

fn remote_key_attributable(target: &str, root_keys: &[String]) -> bool {
    let key = remote_path_comparison_key(target);
    root_keys
        .iter()
        .any(|root_key| key_is_within(root_key, &key))
}

fn remote_relative_project_dir(agent: &Agent, remote_home: &str) -> Option<String> {
    if crate::db::is_universal_project_agent(&agent.id) {
        return Some(crate::db::UNIVERSAL_PROJECT_SKILLS_DIR.to_string());
    }
    if let Some(dir) = agent.project_skills_dir.as_deref() {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            let relative = trimmed
                .strip_prefix("~/")
                .or_else(|| trimmed.strip_prefix("~\\"))
                .unwrap_or(trimmed)
                .replace('\\', "/");
            return (!relative.starts_with('/')).then_some(relative);
        }
    }
    let global = crate::paths::expand_remote_home_path(&agent.global_skills_dir, remote_home);
    let home = remote_home.trim_end_matches('/');
    global
        .strip_prefix(&format!("{home}/"))
        .filter(|relative| !relative.is_empty())
        .map(str::to_string)
}

async fn load_remote_plan(
    snapshot: DbSnapshot,
    connection: &ConnectedRemoteTarget,
) -> Result<ClearPlan, CentralSkillsError> {
    let remote_home = connection.remote_home().to_string();
    let central_root = normalize_remote_path(&crate::paths::expand_remote_home_path(
        &snapshot.central_root,
        &remote_home,
    ))?;
    let root_keys = crate::paths::remote_attributable_central_roots(&central_root, &remote_home);

    let mut skill_ids = Vec::new();
    let mut skill_preview_failed = Vec::new();
    let mut central_skill_dir_keys = HashSet::new();
    for skill in &snapshot.skills {
        let checked = remote_skill_delete_dir(skill).and_then(|dir| {
            if let Ok(normalized) = normalize_remote_path(&dir) {
                central_skill_dir_keys.insert(normalized);
            } else {
                // Unnormalizable spelling: keep it so its name stays tracked.
                central_skill_dir_keys.insert(remote_path_comparison_key(&dir));
            }
            ensure_remote_child_path(&central_root, &dir, &skill.id)
        });
        match checked {
            Ok(_) => skill_ids.push(skill.id.clone()),
            Err(_) => skill_preview_failed
                .push(FailedCentralSkillDelete::preview_fallback(skill.id.clone())),
        }
    }

    let mut registered_keys = HashSet::new();
    for installation in snapshot.installations.values().flatten() {
        registered_keys.insert(remote_path_comparison_key(&installation.installed_path));
    }
    for row in &snapshot.project_installations {
        registered_keys.insert(remote_path_comparison_key(&row.installed_path));
    }

    // Scan dirs: Central root first (untracked entries), then agents/projects.
    let central_key = remote_path_comparison_key(&central_root);
    let mut seen = HashSet::from([central_key.clone()]);
    let mut scan_dirs: Vec<(ClearCentralOwnerKind, String, String)> = Vec::new();
    let mut push = |owner_kind, owner_id: &str, dir: String| {
        let key = remote_path_comparison_key(&dir);
        if !key.starts_with('/') || key == "/" || key_is_within(&central_key, &key) {
            return;
        }
        if seen.insert(key.clone()) {
            scan_dirs.push((owner_kind, owner_id.to_string(), key));
        }
    };
    for agent in snapshot.agents.iter().filter(|agent| agent.id != "central") {
        if agent.global_skills_dir.trim().is_empty() {
            continue;
        }
        push(
            ClearCentralOwnerKind::Agent,
            &agent.id,
            crate::paths::expand_remote_home_path(&agent.global_skills_dir, &remote_home),
        );
    }
    for project in &snapshot.projects {
        for agent in snapshot.agents.iter().filter(|agent| agent.id != "central") {
            if let Some(relative) = remote_relative_project_dir(agent, &remote_home) {
                push(
                    ClearCentralOwnerKind::Project,
                    &project.id,
                    crate::paths::remote_join(&project.path, &relative),
                );
            }
        }
    }

    let mut probe_dirs = vec![central_root.clone()];
    probe_dirs.extend(scan_dirs.iter().map(|(_, _, dir)| dir.clone()));
    let probe = probe_remote_dirs(connection, &probe_dirs).await?;
    let tracked = RemoteTrackedDirs::new(probe.resolved_root.as_deref(), &central_skill_dir_keys);
    let mut remote_link_targets = HashMap::new();

    let mut untracked = Vec::new();
    let mut orphan_links = Vec::new();
    let mut skipped_unmanaged = 0;
    let mut warnings = Vec::new();
    for (index, listing) in probe.listings.into_iter().enumerate() {
        let dir = &probe_dirs[index];
        let entries = match listing {
            RemoteDirListing::Missing => continue,
            RemoteDirListing::Unreadable => {
                warnings.push(ClearCentralSweepWarning {
                    path: dir.clone(),
                    code: SWEEP_WARNING_UNREADABLE.to_string(),
                });
                continue;
            }
            RemoteDirListing::Entries(entries) => entries,
        };
        if index == 0 {
            for entry in entries {
                let name = match &entry {
                    RemoteEntry::Link { name, .. } | RemoteEntry::Dir { name } => name,
                };
                if name.starts_with('.') {
                    continue;
                }
                // Conservative: an entry that might be a tracked skill dir
                // (or whose root could not be resolved) is never offered.
                if tracked.may_be_tracked(name) {
                    continue;
                }
                let path = crate::paths::remote_join(dir, name);
                untracked.push(ClearCentralPathItem {
                    key: path.clone(),
                    path,
                    owner_kind: ClearCentralOwnerKind::Central,
                    owner_id: "central".to_string(),
                    skill_name: Some(name.clone()),
                    dangling: false,
                });
            }
            continue;
        }
        let (owner_kind, owner_id, _) = &scan_dirs[index - 1];
        for entry in entries {
            match entry {
                RemoteEntry::Link { name, target } => {
                    if name.starts_with(JOURNAL_ENTRY_PREFIX) {
                        continue;
                    }
                    let path = crate::paths::remote_join(dir, &name);
                    if registered_keys.contains(&path) {
                        continue;
                    }
                    let resolved = resolve_remote_link_target(dir, &target);
                    if remote_key_attributable(&resolved, &root_keys) {
                        remote_link_targets.insert(path.clone(), target);
                        orphan_links.push(ClearCentralPathItem {
                            key: path.clone(),
                            path,
                            owner_kind: *owner_kind,
                            owner_id: owner_id.clone(),
                            skill_name: Some(name),
                            // The probe does not follow links; dangling state
                            // is unknown remotely and reported as false.
                            dangling: false,
                        });
                    }
                }
                RemoteEntry::Dir { name } => {
                    if name.starts_with(JOURNAL_ENTRY_PREFIX) {
                        continue;
                    }
                    let path = crate::paths::remote_join(dir, &name);
                    if !registered_keys.contains(&path) {
                        skipped_unmanaged += 1;
                    }
                }
            }
        }
    }
    orphan_links.sort_by(|left, right| left.key.cmp(&right.key));
    untracked.sort_by(|left, right| left.key.cmp(&right.key));

    let link_rows = snapshot
        .project_installations
        .iter()
        .filter(|row| row.link_type == "symlink")
        .collect::<Vec<_>>();
    let link_paths = link_rows
        .iter()
        .map(|row| remote_path_comparison_key(&row.installed_path))
        .collect::<Vec<_>>();
    let states = if link_paths.is_empty() {
        Vec::new()
    } else {
        probe_remote_paths(connection, &link_paths).await?
    };
    let mut project_links = Vec::new();
    for ((row, path), state) in link_rows.into_iter().zip(link_paths).zip(states) {
        let parent = crate::targets::remote_parent(&path).unwrap_or_else(|| "/".to_string());
        let (dangling, expected_target) = match state {
            RemotePathState::Link(raw) => {
                if !remote_key_attributable(&resolve_remote_link_target(&parent, &raw), &root_keys)
                {
                    continue;
                }
                (false, raw)
            }
            RemotePathState::Gone => {
                let Some(stored) = row.symlink_target.as_deref() else {
                    continue;
                };
                if !remote_key_attributable(
                    &resolve_remote_link_target(&parent, stored),
                    &root_keys,
                ) {
                    continue;
                }
                // Link already gone: an empty expected target makes the
                // remove script skip any link that reappeared meanwhile.
                (true, String::new())
            }
            RemotePathState::Other => continue,
        };
        remote_link_targets.insert(path.clone(), expected_target);
        project_links.push(ProjectLinkCandidate {
            item: ClearCentralPathItem {
                key: path.clone(),
                path,
                owner_kind: ClearCentralOwnerKind::Project,
                owner_id: row.project_id.clone(),
                skill_name: Some(row.skill_id.clone()),
                dangling,
            },
            project_id: row.project_id.clone(),
            skill_id: row.skill_id.clone(),
            agent_id: row.agent_id.clone(),
        });
    }
    project_links.sort_by(|left, right| left.item.key.cmp(&right.item.key));

    Ok(ClearPlan {
        central_root: CentralRootRef::Remote(central_root),
        root_keys,
        skill_ids,
        skill_preview_failed,
        installations: snapshot.installations,
        central_skill_dir_keys,
        project_links,
        orphan_links,
        untracked,
        skipped_unmanaged,
        warnings,
        remote_link_targets,
    })
}

/// Remote counterpart of the local two-key rule for untracked Central
/// entries. A Central child `<root>/<name>` is tracked when a DB skill dir is
/// `<stored root>/<name>` or `<resolved root>/<name>` (root symlinks resolved
/// by the probe with `cd -P && pwd -P`, the entry itself never followed).
/// A DB dir under any other spelling may still alias the root and cannot be
/// proven different without another remote round-trip, so every DB skill
/// dir's final name is treated as tracked; this is a strict superset of the
/// two-key match. Without a resolved root nothing is offered as untracked.
struct RemoteTrackedDirs {
    resolved: bool,
    names: HashSet<String>,
}

impl RemoteTrackedDirs {
    fn new(resolved_root: Option<&str>, skill_dirs: &HashSet<String>) -> Self {
        let names = skill_dirs
            .iter()
            .filter_map(|dir| {
                let key = remote_path_comparison_key(dir);
                key.rsplit_once('/')
                    .map(|(_, name)| name.to_string())
                    .filter(|name| !name.is_empty())
            })
            .collect();
        Self {
            resolved: resolved_root.is_some(),
            names,
        }
    }

    fn may_be_tracked(&self, name: &str) -> bool {
        !self.resolved || self.names.contains(name)
    }
}
