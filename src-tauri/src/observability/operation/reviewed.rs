//! Reviewed static diagnostics: the only failure shape an auditable operation
//! may persist. Every field is a static label, flag or number; raw source
//! errors and `Display` strings never cross this boundary.

use super::super::policy::{OperationDefinition, OperationPhase};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ReviewedDiagnostic {
    pub(super) code: &'static str,
    pub(super) category: &'static str,
    pub(super) phase: OperationPhase,
    pub(super) public_message: &'static str,
    pub(super) retryable: bool,
    pub(super) failure_stage: Option<&'static str>,
    pub(super) http_status: Option<u16>,
}

impl ReviewedDiagnostic {
    pub const fn new(
        code: &'static str,
        category: &'static str,
        phase: OperationPhase,
        public_message: &'static str,
        retryable: bool,
    ) -> Self {
        Self {
            code,
            category,
            phase,
            public_message,
            retryable,
            failure_stage: None,
            http_status: None,
        }
    }

    /// Attach the static step that failed (for example `commit_resolve`).
    pub const fn with_failure_stage(mut self, stage: &'static str) -> Self {
        self.failure_stage = Some(stage);
        self
    }

    /// Attach the numeric HTTP status the remote service answered with.
    pub const fn with_http_status(mut self, status: Option<u16>) -> Self {
        self.http_status = status;
        self
    }

    pub const fn unexpected(definition: OperationDefinition) -> Self {
        Self::new(
            "internal.unexpected",
            definition.category().as_str(),
            definition.default_phase(),
            "The operation failed. See runtime logs for details.",
            false,
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ReviewedFailure {
    pub(super) diagnostic: ReviewedDiagnostic,
}

impl ReviewedFailure {
    pub const fn new(diagnostic: ReviewedDiagnostic) -> Self {
        Self { diagnostic }
    }
}
