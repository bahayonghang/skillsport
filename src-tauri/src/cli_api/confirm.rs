//! Shared `--dry-run` / `--yes` confirmation contract for CLI mutations.
//!
//! Every write command builds its plan list first, then calls [`require`]:
//!
//! - `--dry-run` always wins and returns [`ConfirmDecision::DryRun`]; the
//!   caller returns `{ dryRun: true, plans, result: null }` without writing.
//! - A command that needs confirmation (destructive or multi-target) and was
//!   not given `--yes` fails with `input.confirmation_required` (exit 2); the
//!   plans travel in the error envelope's `details.plans`.
//! - Otherwise the caller proceeds with the mutation.

use serde::Serialize;

use super::CliApiError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConfirmDecision {
    /// Return the plans and do not write.
    DryRun,
    /// Perform the mutation.
    Proceed,
}

/// Uniform write-command output. `result` is `None` for a dry run.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationOutput<P, R> {
    pub dry_run: bool,
    pub plans: Vec<P>,
    pub result: Option<R>,
}

impl<P, R> MutationOutput<P, R> {
    pub fn dry_run(plans: Vec<P>) -> Self {
        Self {
            dry_run: true,
            plans,
            result: None,
        }
    }

    pub fn applied(plans: Vec<P>, result: R) -> Self {
        Self {
            dry_run: false,
            plans,
            result: Some(result),
        }
    }
}

pub const CONFIRMATION_REQUIRED_MESSAGE: &str =
    "This operation requires confirmation; review details.plans and rerun with --yes";

/// Decide whether a planned mutation may run.
///
/// `needs_confirmation` is the command's own policy (destructive, overwrite,
/// or more than one target). It is ignored for dry runs.
pub fn require<P: Serialize>(
    plans: &[P],
    needs_confirmation: bool,
    yes: bool,
    dry_run: bool,
) -> Result<ConfirmDecision, CliApiError> {
    if dry_run {
        return Ok(ConfirmDecision::DryRun);
    }
    if needs_confirmation && !yes {
        let plans = serde_json::to_value(plans)
            .map_err(|error| CliApiError::Internal(error.to_string()))?;
        return Err(CliApiError::ConfirmationRequired {
            message: CONFIRMATION_REQUIRED_MESSAGE.to_string(),
            plans,
        });
    }
    Ok(ConfirmDecision::Proceed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Plan {
        skill_id: &'static str,
    }

    #[test]
    fn dry_run_wins_over_missing_confirmation() {
        let plans = [Plan { skill_id: "a" }];
        assert_eq!(
            require(&plans, true, false, true).unwrap(),
            ConfirmDecision::DryRun
        );
        assert_eq!(
            require(&plans, false, true, true).unwrap(),
            ConfirmDecision::DryRun
        );
    }

    #[test]
    fn missing_yes_returns_plans_in_details() {
        let plans = [Plan { skill_id: "a" }, Plan { skill_id: "b" }];
        let error = require(&plans, true, false, false).unwrap_err();
        assert_eq!(error.code(), "input.confirmation_required");
        assert_eq!(error.exit_code(), 2);
        assert_eq!(error.to_string(), CONFIRMATION_REQUIRED_MESSAGE);
        assert_eq!(
            error.details(),
            json!({ "plans": [{ "skillId": "a" }, { "skillId": "b" }] })
        );
    }

    #[test]
    fn yes_or_unconfirmed_policy_proceeds() {
        let plans = [Plan { skill_id: "a" }];
        assert_eq!(
            require(&plans, true, true, false).unwrap(),
            ConfirmDecision::Proceed
        );
        assert_eq!(
            require(&plans, false, false, false).unwrap(),
            ConfirmDecision::Proceed
        );
    }

    #[test]
    fn other_errors_have_empty_details() {
        assert_eq!(CliApiError::InvalidInput("x".into()).details(), json!({}));
        let path = CliApiError::InvalidPath("x".into());
        assert_eq!(path.code(), "path.invalid");
        assert_eq!(path.exit_code(), 2);
    }

    #[test]
    fn dry_run_output_shape_matches_sync_output() {
        let output: MutationOutput<Plan, ()> =
            MutationOutput::dry_run(vec![Plan { skill_id: "a" }]);
        assert_eq!(
            serde_json::to_value(output).unwrap(),
            json!({ "dryRun": true, "plans": [{ "skillId": "a" }], "result": null })
        );
    }
}
