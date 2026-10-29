//! Typed errors for portable bundle export and inspection.
//!
//! Display text may contain internal diagnostics (paths, serde messages) and
//! must not reach IPC, the Operation Log, or tracing. The IPC boundary uses
//! [`PortableBundleError::to_ipc_error`] (reviewed code + fixed sentence);
//! logs record only [`PortableBundleError::code`].

use crate::ipc_error::IpcError;
use crate::services::central_updates::CentralUpdatesError;
use crate::services::resource_budget::BudgetExceeded;

#[derive(Debug, thiserror::Error)]
pub enum PortableBundleError {
    #[error("The selected file is not a SkillPort bundle: {0}")]
    NotABundle(String),

    #[error("The selected file is a legacy v1 SkillPort state export")]
    LegacyV1,

    #[error("Unsupported SkillPort bundle format version: {0}")]
    UnsupportedVersion(u32),

    #[error("The SkillPort bundle has no manifest.json")]
    ManifestMissing,

    #[error("The SkillPort bundle manifest is not UTF-8 encoded")]
    ManifestEncoding,

    #[error("Invalid SkillPort bundle manifest: {0}")]
    ManifestInvalid(String),

    #[error("SkillPort bundle integrity check failed: {0}")]
    IntegrityMismatch(String),

    #[error("SkillPort bundle contains an unsafe or unsupported entry: {0}")]
    UnsafeEntry(String),

    #[error("{0}")]
    Budget(BudgetExceeded),

    #[error("SkillPort bundle path must use the .skillport or .zip extension")]
    InvalidPath,

    #[error("{context}: {source}")]
    Io {
        context: String,
        #[source]
        source: std::io::Error,
    },

    #[error(transparent)]
    Db(#[from] sqlx::Error),

    #[error(transparent)]
    Central(#[from] CentralUpdatesError),

    #[error("Failed to serialize SkillPort bundle manifest: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Failed to write SkillPort bundle archive: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("The portable bundle operation was cancelled")]
    Cancelled,

    #[error("The bundle file changed after it was previewed")]
    PreviewStale,

    #[error("The bundle preview expired or was discarded")]
    PreviewExpired,

    #[error("The active target changed after the bundle was previewed")]
    TargetChanged,

    #[error("Skill '{0}' needs an explicit import decision")]
    DecisionRequired(String),

    #[error("Skill '{0}' cannot be renamed to the requested id")]
    RenameInvalid(String),

    #[error("Failed to join {label} task: {message}")]
    TaskJoin {
        label: &'static str,
        message: String,
    },
}

impl PortableBundleError {
    pub(crate) fn io(context: impl Into<String>, source: std::io::Error) -> Self {
        Self::Io {
            context: context.into(),
            source,
        }
    }

    pub(crate) fn task_join(label: &'static str, message: String) -> Self {
        Self::TaskJoin { label, message }
    }

    /// Stable, locale-neutral code for logs and IPC.
    pub fn code(&self) -> &'static str {
        match self {
            Self::NotABundle(_) => "portable_bundle.not_a_bundle",
            Self::LegacyV1 => "portable_bundle.legacy_v1",
            Self::UnsupportedVersion(_) => "portable_bundle.unsupported_version",
            Self::ManifestMissing => "portable_bundle.manifest_missing",
            Self::ManifestEncoding => "portable_bundle.manifest_encoding",
            Self::ManifestInvalid(_) => "portable_bundle.manifest_invalid",
            Self::IntegrityMismatch(_) => "portable_bundle.integrity_mismatch",
            Self::UnsafeEntry(_) => "portable_bundle.unsafe_entry",
            Self::Budget(_) => "portable_bundle.budget_exceeded",
            Self::InvalidPath => "portable_bundle.invalid_path",
            Self::Io { .. } | Self::Zip(_) => "portable_bundle.io",
            Self::Central(_) => "portable_bundle.target_io",
            Self::Cancelled => "operation.cancelled",
            Self::PreviewStale => "portable_bundle.preview_stale",
            Self::PreviewExpired => "portable_bundle.preview_expired",
            Self::TargetChanged => "portable_bundle.target_changed",
            Self::DecisionRequired(_) => "portable_bundle.decision_required",
            Self::RenameInvalid(_) => "portable_bundle.rename_invalid",
            Self::Db(_) | Self::Json(_) | Self::TaskJoin { .. } => "portable_bundle.internal",
        }
    }

    pub fn to_ipc_error(&self) -> IpcError {
        let code = self.code();
        let message = crate::ipc_error::public_message_for_code(code)
            .expect("portable bundle codes must have reviewed public messages");
        IpcError::new(code, message, false)
    }
}

impl From<BudgetExceeded> for PortableBundleError {
    fn from(error: BudgetExceeded) -> Self {
        Self::Budget(error)
    }
}
