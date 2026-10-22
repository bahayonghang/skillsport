mod snapshot_failure_tests {
    use super::super::*;

    #[test]
    fn snapshot_retryability_and_diagnostic_category_share_one_typed_classifier() {
        let retryable = [
            (
                GithubImportError::ArchiveTimeout,
                "github_import.archive_timeout",
            ),
            (
                GithubImportError::ArchiveRequest,
                "github_import.archive_request",
            ),
            (
                GithubImportError::ArchiveResponseBody,
                "github_import.archive_response_body",
            ),
            (
                GithubImportError::ArchiveStatusExhausted,
                "github_import.archive_status_exhausted",
            ),
        ];
        for (error, category) in retryable {
            assert!(error.is_snapshot_retryable());
            assert_eq!(error.snapshot_diagnostic_category(), category);
        }

        let not_retryable = [
            GithubImportError::InvalidBranchSelection,
            GithubImportError::ArchiveRedirectRejected,
            GithubImportError::AccessDenied("token=secret".to_string()),
            GithubImportError::ConfiguredTokenAccessDenied("token=secret".to_string()),
            GithubImportError::RepoNotFound,
            GithubImportError::Parse("response body".to_string()),
            GithubImportError::Budget(crate::services::resource_budget::BudgetExceeded::new(
                "archive", 2, 1,
            )),
            GithubImportError::PreviewSnapshotIntegrity,
        ];
        for error in not_retryable {
            assert!(!error.is_snapshot_retryable(), "{error:?}");
        }
    }
}

mod ipc_error_code_tests {
    use super::super::*;
    use crate::ipc_error::{public_message_for_code, IpcError};
    use crate::services::central_updates::CentralUpdatesError;

    #[test]
    fn configured_github_denial_keeps_auth_context_in_the_typed_code() {
        let configured = GithubImportError::from_denial(GitHubAccessDenial {
            kind: GitHubAccessDenialKind::AuthenticationOrPermission,
            operation: "reading the repository",
            status: reqwest::StatusCode::FORBIDDEN,
            used_auth: true,
        });
        let anonymous = GithubImportError::from_denial(GitHubAccessDenial {
            kind: GitHubAccessDenialKind::AuthenticationOrPermission,
            operation: "reading the repository",
            status: reqwest::StatusCode::FORBIDDEN,
            used_auth: false,
        });

        assert_eq!(
            configured.ipc_error_code(),
            Some("github_import.configured_token_failed")
        );
        assert_eq!(
            configured.diagnostic_category(),
            "github_import.configured_token_failed"
        );
        assert_eq!(
            anonymous.ipc_error_code(),
            Some("github_import.access_denied")
        );
        assert_eq!(
            anonymous.diagnostic_category(),
            "github_import.access_denied"
        );
    }

    fn locale_github_import_keys(json: &str) -> serde_json::Value {
        serde_json::from_str::<serde_json::Value>(json).unwrap()["backendErrors"]["github_import"]
            .clone()
    }

    #[test]
    fn apply_path_codes_align_across_ipc_public_message_and_i18n() {
        let en = locale_github_import_keys(include_str!("../../../../../src/i18n/locales/en.json"));
        let zh = locale_github_import_keys(include_str!("../../../../../src/i18n/locales/zh.json"));
        let seeds = "token=secret https://example.invalid C:/Users/private";
        let cases = [
            (
                GithubImportError::SelectionUnavailable(seeds.to_string()),
                "github_import.selection_unavailable",
            ),
            (
                GithubImportError::InvalidCandidate(seeds.to_string()),
                "github_import.invalid_candidate",
            ),
            (
                GithubImportError::RepoPathGone(seeds.to_string()),
                "github_import.source_path_missing",
            ),
            (
                GithubImportError::TargetDirExists(seeds.to_string()),
                "github_import.target_exists",
            ),
            (
                GithubImportError::DuplicateSelection(seeds.to_string()),
                "github_import.duplicate_selection",
            ),
            (
                GithubImportError::RenameIdInUse(seeds.to_string()),
                "github_import.rename_conflict",
            ),
            (
                GithubImportError::RenameIdRequired(seeds.to_string()),
                "github_import.rename_conflict",
            ),
            (
                GithubImportError::NoSelections,
                "github_import.no_importable_skills",
            ),
            (
                GithubImportError::NoValidOperations,
                "github_import.no_importable_skills",
            ),
        ];

        for (error, code) in cases {
            assert_eq!(error.ipc_error_code(), Some(code), "{error:?}");
            assert_eq!(error.diagnostic_category(), code, "{error:?}");
            let message = public_message_for_code(code).unwrap_or_else(|| {
                panic!("missing public_message_for_code for {code}");
            });
            assert!(!message.contains(seeds), "{code} leaked Display seeds");
            assert!(!message.contains("token=secret"));
            assert!(!message.contains("example.invalid"));
            assert!(!message.contains("Users/private"));
            assert_ne!(message, error.to_string(), "{code} used Display text");

            let suffix = code.strip_prefix("github_import.").expect(code);
            assert!(
                en.get(suffix).and_then(|value| value.as_str()).is_some(),
                "missing en backendErrors.github_import.{suffix}"
            );
            assert!(
                zh.get(suffix).and_then(|value| value.as_str()).is_some(),
                "missing zh backendErrors.github_import.{suffix}"
            );
        }
    }

    #[test]
    fn central_apply_ipc_does_not_leak_paths_or_file_contents() {
        let secret = r"C:\Users\alice\private\skill.md token=ghp_super_secret";
        let error = GithubImportError::CentralApply(Box::new(CentralUpdatesError::Batch(
            secret.to_string(),
        )));
        assert_eq!(error.diagnostic_category(), "central_updates.batch");
        let ipc = IpcError::from(error.to_ipc_error());
        let serialized = serde_json::to_string(&ipc).expect("serialize");
        assert!(!error.to_ipc_error().contains("alice"));
        assert!(!error.to_ipc_error().contains("ghp_super_secret"));
        assert!(!ipc.message.contains("alice"));
        assert!(!ipc.message.contains("ghp_"));
        assert!(!serialized.contains("alice"));
        assert!(!serialized.contains("ghp_"));
        assert_eq!(
            ipc.message,
            "The operation failed. See runtime logs for details."
        );
    }
}
