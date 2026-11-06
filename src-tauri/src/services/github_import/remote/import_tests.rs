use super::*;
use crate::test_support::{mem_pool_with_home, FakeRunner};

fn connection(runner: Arc<FakeRunner>) -> ConnectedRemoteTarget {
    ConnectedRemoteTarget::Ssh(crate::targets::ConnectedSshTarget::for_tests_with_runner(
        crate::targets::RemoteTargetConfig {
            id: "import-fixture".into(),
            label: "fixture".into(),
            host: "example.invalid".into(),
            username: "fixture".into(),
            port: 22,
            auth_method: crate::targets::SshAuthMethod::Key,
            key_path: String::new(),
            credential_key: None,
            protected_password: None,
            password: None,
            remote_home: "/home/fixture".into(),
            remote_os: "Linux".into(),
            symlink_enabled: false,
        },
        runner,
    ))
}

#[tokio::test]
async fn workspace_import_binds_payload_to_preview_before_central_mutation() {
    let original = b"---\nname: demo\ndescription: original\n---\nContent\n";
    let changed = b"---\nname: demo\ndescription: modified\n---\nContent\n";
    assert_eq!(original.len(), changed.len());
    for tampered in [false, true] {
        let pool = mem_pool_with_home("/home/fixture").await;
        let runner = Arc::new(FakeRunner::new());
        runner.push_success("skills/demo/SKILL.md\n");
        runner.push_output_bytes(1, b"", b""); // Optional plugin manifest is absent.
        runner.push_output_bytes(1, b"", b""); // Optional marketplace manifest is absent.
        runner.push_output_bytes(0, original, b""); // Candidate discovery.
        runner.push_output_bytes(0, if tampered { changed } else { original }, b"");
        // Stop the valid control exactly at the first mutating operation.
        runner.push_output_bytes(1, b"", b"");
        let expected = [PreviewSnapshotFile {
            repo_path: "skills/demo/SKILL.md".into(),
            byte_len: original.len() as u64,
            sha256: file_sha256(original),
        }];
        let outcome = import_github_repo_skills_remote_from_workspace(
            &pool,
            Arc::new(connection(runner.clone())),
            &GitHubRepoRef {
                owner: "fixture".into(),
                repo: "repo".into(),
                branch: "main".into(),
                normalized_url: "https://github.com/fixture/repo".into(),
            },
            None,
            &GitHubPreviewWorkspace {
                remote_workspace_dir: "/tmp/preview".into(),
                remote_repo_dir: "/tmp/preview/repo".into(),
            },
            Some(&expected),
            vec![GitHubSkillImportSelection {
                source_path: "skills/demo".into(),
                resolution: DuplicateResolution::Overwrite,
                renamed_skill_id: None,
            }],
            None,
            None,
        )
        .await;
        {
            let calls = runner.calls();
            if tampered {
                assert!(matches!(
                    outcome,
                    Err(GithubImportError::PreviewSnapshotIntegrity)
                ));
                assert_eq!(calls.len(), 5);
                assert!(calls
                    .iter()
                    .all(|call| !call.args.last().unwrap().contains("mkdir")));
            } else {
                assert!(matches!(outcome, Err(GithubImportError::Remote(_))));
                assert_eq!(calls.len(), 6);
                assert!(calls
                    .last()
                    .unwrap()
                    .args
                    .last()
                    .unwrap()
                    .starts_with("mkdir -p "));
            }
        }
        assert!(db::get_skill_by_id(&pool, "demo").await.unwrap().is_none());
        let journal_rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM fs_db_operations")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(journal_rows, 0);
    }
}
