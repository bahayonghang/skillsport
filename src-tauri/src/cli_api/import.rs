//! `skills import --from-zip | --from-dir`: copy a local skill into Central.
//!
//! ZIP import runs the GUI's preview -> fingerprint check -> import pipeline
//! inside one call. Directory import uses
//! `services::installation::import_local_dir`. Both take the shared Local
//! Central mutation lock inside the service, never in `cli_api`.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::db::repos::{agents_repo, skills_repo};
use crate::services::installation::{self, InstallationError};
use crate::services::local_archive_import::{self, ArchiveFingerprint, LocalArchiveImportError};

use super::confirm::{self, ConfirmDecision, MutationOutput};
use super::skills::{selected_agents, validate_method};
use super::{
    mutation_error, record_cli_mutation_log, record_cli_mutation_log_as, CliApiError, CliContext,
    SyncOutput,
};

/// The GUI command whose Operation Log category and phase CLI imports share.
const ARCHIVE_IMPORT_COMMAND: &str = "import_local_skill_archive";
/// Action recorded for directory imports, which have no GUI command.
const DIR_IMPORT_ACTION: &str = "cli_import_local_dir";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SkillImportSource {
    Zip(PathBuf),
    Dir(PathBuf),
}

pub struct SkillImportRequest<'a> {
    pub source: SkillImportSource,
    pub replace: bool,
    pub sync: bool,
    pub agent_ids: &'a [String],
    pub method: &'a str,
    /// Relative source paths resolve against this directory.
    pub cwd: &'a Path,
    pub dry_run: bool,
    pub yes: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlan {
    /// `zip` or `dir`.
    pub source_type: &'static str,
    pub skill_id: String,
    pub skill_name: String,
    /// `<Central root>/<skillId>`.
    pub target_path: String,
    /// `create`, `replace`, or `duplicate` (exists and `--replace` was not given).
    pub action: &'static str,
    pub exists: bool,
    /// ZIP only: files in the skill root.
    pub file_count: Option<usize>,
    /// ZIP only: expanded bytes.
    pub total_bytes: Option<u64>,
    /// Agents `--sync` will install to after the import; empty without `--sync`.
    pub sync_agents: Vec<String>,
    pub method: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSyncError {
    pub code: &'static str,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub skill_uid: String,
    pub skill_id: String,
    pub replaced_existing: bool,
    pub sync: Option<SyncOutput>,
    /// Set when the import succeeded but the follow-up sync failed as a whole.
    pub sync_error: Option<ImportSyncError>,
}

impl ImportResult {
    pub fn is_partial_failure(&self) -> bool {
        self.sync_error.is_some()
            || self
                .sync
                .as_ref()
                .is_some_and(SyncOutput::is_partial_failure)
    }
}

impl CliContext {
    /// Import a local ZIP archive or skill directory into Central.
    ///
    /// Without `--replace`, an existing Central skill is `skill.duplicate`.
    /// Replacing an existing skill, or `--sync` to more than one agent, needs
    /// `--yes`. `--dry-run` returns the plan and writes nothing.
    pub async fn import_skill(
        &self,
        request: SkillImportRequest<'_>,
    ) -> Result<MutationOutput<ImportPlan, ImportResult>, CliApiError> {
        validate_method(request.method)?;
        let sync_agents = if request.sync {
            selected_agents(&self.db, request.agent_ids.to_vec())
                .await?
                .into_iter()
                .map(|agent| agent.id)
                .collect()
        } else {
            Vec::new()
        };
        match &request.source {
            SkillImportSource::Zip(path) => {
                let path = resolve(request.cwd, path).to_string_lossy().into_owned();
                let preview =
                    local_archive_import::preview_local_skill_archive_impl(&self.db, &path)
                        .await
                        .map_err(archive_error)?;
                let skill = preview.skills.first().ok_or_else(|| {
                    CliApiError::Internal("Archive preview returned no skill".to_string())
                })?;
                let target = central_root(&self.db).await?.join(&skill.skill_id);
                let exists = skill.conflict.is_some() || path_occupied(&target);
                let plan = build_plan(
                    &request,
                    "zip",
                    &skill.skill_id,
                    &skill.skill_name,
                    &target,
                    exists,
                    (Some(skill.file_count), Some(skill.total_expanded_bytes)),
                    &sync_agents,
                );
                if decide(&plan, &request, sync_agents.len())? == ConfirmDecision::DryRun {
                    return Ok(MutationOutput::dry_run(vec![plan]));
                }
                let imported = self
                    .apply_zip_import(&path, preview.fingerprint.clone())
                    .await?;
                self.finish_import(plan, imported.0, imported.1, &request, sync_agents)
                    .await
            }
            SkillImportSource::Dir(path) => {
                let path = resolve(request.cwd, path);
                let preview = installation::preview_local_dir_import(&self.db, &path)
                    .await
                    .map_err(dir_import_error)?;
                let plan = build_plan(
                    &request,
                    "dir",
                    &preview.skill_id,
                    &preview.skill_name,
                    &preview.target_dir,
                    preview.exists,
                    (None, None),
                    &sync_agents,
                );
                if decide(&plan, &request, sync_agents.len())? == ConfirmDecision::DryRun {
                    return Ok(MutationOutput::dry_run(vec![plan]));
                }
                let imported = self.apply_dir_import(&path, request.replace).await?;
                self.finish_import(plan, imported.0, imported.1, &request, sync_agents)
                    .await
            }
        }
    }

    /// Import step of the ZIP pipeline: re-read the archive, require the
    /// preview fingerprint, then stage, lock, swap, and upsert.
    pub(super) async fn apply_zip_import(
        &self,
        path: &str,
        fingerprint: ArchiveFingerprint,
    ) -> Result<(String, bool), CliApiError> {
        let outcome = local_archive_import::import_local_skill_archive_impl(
            &self.db,
            path,
            fingerprint,
            local_archive_import::LocalArchiveImportResolution::Overwrite,
            None,
        )
        .await;
        match outcome {
            Ok(result) => {
                record_cli_mutation_log(
                    &self.db,
                    ARCHIVE_IMPORT_COMMAND,
                    None,
                    "succeeded",
                    "Imported a local skill archive.",
                    None,
                    serde_json::json!({
                        "sourceType": "zip",
                        "resolution": "overwrite",
                        "replacedExisting": result.replaced_existing,
                        "fileCount": result.file_count,
                    }),
                )
                .await;
                Ok((result.imported_skill_id, result.replaced_existing))
            }
            Err(error) => {
                let error = archive_error(error);
                record_cli_mutation_log(
                    &self.db,
                    ARCHIVE_IMPORT_COMMAND,
                    None,
                    "failed",
                    "Local skill archive import failed.",
                    Some(error.code()),
                    serde_json::json!({ "sourceType": "zip" }),
                )
                .await;
                Err(error)
            }
        }
    }

    async fn apply_dir_import(
        &self,
        path: &Path,
        replace: bool,
    ) -> Result<(String, bool), CliApiError> {
        match installation::import_local_dir(&self.db, path, replace).await {
            Ok(result) => {
                record_cli_mutation_log_as(
                    &self.db,
                    ARCHIVE_IMPORT_COMMAND,
                    DIR_IMPORT_ACTION,
                    None,
                    "succeeded",
                    "Imported a local skill directory.",
                    None,
                    serde_json::json!({
                        "sourceType": "dir",
                        "replacedExisting": result.replaced_existing,
                    }),
                )
                .await;
                Ok((result.skill_id, result.replaced_existing))
            }
            Err(error) => {
                let error = dir_import_error(error);
                record_cli_mutation_log_as(
                    &self.db,
                    ARCHIVE_IMPORT_COMMAND,
                    DIR_IMPORT_ACTION,
                    None,
                    "failed",
                    "Local skill directory import failed.",
                    Some(error.code()),
                    serde_json::json!({ "sourceType": "dir" }),
                )
                .await;
                Err(error)
            }
        }
    }

    async fn finish_import(
        &self,
        plan: ImportPlan,
        skill_id: String,
        replaced_existing: bool,
        request: &SkillImportRequest<'_>,
        sync_agents: Vec<String>,
    ) -> Result<MutationOutput<ImportPlan, ImportResult>, CliApiError> {
        let skill_uid = skills_repo::get_skill_by_id(&self.db, &skill_id)
            .await?
            .map(|skill| skill.uid)
            .ok_or_else(|| {
                CliApiError::Internal(format!("Imported skill '{skill_id}' has no row"))
            })?;
        let (sync, sync_error) = if request.sync {
            match self
                .sync_skills(
                    vec![skill_id.clone()],
                    false,
                    sync_agents,
                    request.method,
                    false,
                )
                .await
            {
                Ok(output) => (Some(output), None),
                Err(error) => (
                    None,
                    Some(ImportSyncError {
                        code: error.code(),
                        message: error.to_string(),
                    }),
                ),
            }
        } else {
            (None, None)
        };
        Ok(MutationOutput::applied(
            vec![plan],
            ImportResult {
                skill_uid,
                skill_id,
                replaced_existing,
                sync,
                sync_error,
            },
        ))
    }
}

#[allow(clippy::too_many_arguments)]
fn build_plan(
    request: &SkillImportRequest<'_>,
    source_type: &'static str,
    skill_id: &str,
    skill_name: &str,
    target: &Path,
    exists: bool,
    (file_count, total_bytes): (Option<usize>, Option<u64>),
    sync_agents: &[String],
) -> ImportPlan {
    let action = match (exists, request.replace) {
        (false, _) => "create",
        (true, true) => "replace",
        (true, false) => "duplicate",
    };
    ImportPlan {
        source_type,
        skill_id: skill_id.to_string(),
        skill_name: skill_name.to_string(),
        target_path: target.to_string_lossy().into_owned(),
        action,
        exists,
        file_count,
        total_bytes,
        sync_agents: sync_agents.to_vec(),
        method: request.sync.then(|| request.method.to_string()),
    }
}

/// Dry run wins; a duplicate without `--replace` fails before confirmation;
/// replacing an existing skill or syncing to several agents needs `--yes`.
fn decide(
    plan: &ImportPlan,
    request: &SkillImportRequest<'_>,
    sync_agent_count: usize,
) -> Result<ConfirmDecision, CliApiError> {
    if request.dry_run {
        return Ok(ConfirmDecision::DryRun);
    }
    if plan.exists && !request.replace {
        return Err(CliApiError::duplicate(plan.skill_id.clone()));
    }
    let needs_confirmation = (plan.exists && request.replace) || sync_agent_count > 1;
    confirm::require(
        std::slice::from_ref(plan),
        needs_confirmation,
        request.yes,
        false,
    )
}

fn resolve(cwd: &Path, path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    }
}

/// A single `lstat`; bounded, so it stays on the async side.
fn path_occupied(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

async fn central_root(pool: &crate::db::DbPool) -> Result<PathBuf, CliApiError> {
    agents_repo::get_agent_by_id(pool, "central")
        .await?
        .map(|agent| PathBuf::from(agent.global_skills_dir))
        .ok_or_else(|| CliApiError::Internal("Central agent missing".to_string()))
}

/// Map an archive error to a CLI error. Messages use the archive module's
/// safe `local_archive.<code>:<summary>` text, never entry names or paths.
pub(super) fn archive_error(error: LocalArchiveImportError) -> CliApiError {
    let message = error.to_ipc_error();
    match error {
        LocalArchiveImportError::ArchiveNotFound(_) => CliApiError::InvalidPath(message),
        LocalArchiveImportError::ArchiveChangedSincePreview { .. } => {
            CliApiError::ArchiveChanged(message)
        }
        LocalArchiveImportError::CentralMutation(error) => mutation_error(error),
        LocalArchiveImportError::PathConflict(_) => CliApiError::Duplicate(message),
        LocalArchiveImportError::ArchiveReadFailed(_)
        | LocalArchiveImportError::AmbiguousArchiveLayout(_)
        | LocalArchiveImportError::NoSkillManifest(_)
        | LocalArchiveImportError::InvalidArchiveEntry { .. }
        | LocalArchiveImportError::UnsupportedArchiveEntry { .. }
        | LocalArchiveImportError::BudgetExceeded(_)
        | LocalArchiveImportError::SkillFrontmatterMissing(_)
        | LocalArchiveImportError::InvalidSkillIdentifier(_) => CliApiError::InvalidInput(message),
        _ => CliApiError::Internal(message),
    }
}

pub(super) fn dir_import_error(error: InstallationError) -> CliApiError {
    match error {
        InstallationError::LocalImportSourceInvalid(_)
        | InstallationError::LocalImportOverlapsCentral(_)
        | InstallationError::LocalImportSkillIdInvalid(_)
        | InstallationError::LocalImportManifestMissing(_)
        | InstallationError::LocalImportSymlinkRejected(_) => {
            CliApiError::InvalidPath(error.to_string())
        }
        InstallationError::LocalImportManifestInvalid(_)
        | InstallationError::CopyEntryBudgetExceeded { .. }
        | InstallationError::CopyByteBudgetExceeded { .. } => {
            CliApiError::InvalidInput(error.to_string())
        }
        InstallationError::LocalImportTargetExists(_) => CliApiError::Duplicate(error.to_string()),
        InstallationError::CentralMutation(error) => mutation_error(error),
        other => CliApiError::Internal(other.to_string()),
    }
}
