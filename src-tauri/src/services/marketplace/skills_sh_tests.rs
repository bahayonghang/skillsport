use super::*;
use github_import::{GitHubRepoPreview, GitHubRepoRef, GitHubSkillConflict, GitHubSkillPreview};

fn candidate(id: &str, directory: &str, path: &str) -> GitHubSkillPreview {
    GitHubSkillPreview {
        source_path: path.to_string(),
        skill_id: id.to_string(),
        skill_name: id.to_string(),
        description: None,
        plugin_name: None,
        root_directory: "skills".to_string(),
        skill_directory_name: directory.to_string(),
        download_url: "https://raw.githubusercontent.com/fixture/repo/main/SKILL.md".to_string(),
        conflict: None,
        files: None,
    }
}

fn preview(skills: Vec<GitHubSkillPreview>) -> GitHubRepoPreview {
    GitHubRepoPreview {
        repo: GitHubRepoRef {
            owner: "fixture".to_string(),
            repo: "repo".to_string(),
            branch: "main".to_string(),
            normalized_url: "https://github.com/fixture/repo".to_string(),
        },
        skills,
        preview_id: "fixture-preview".to_string(),
        resolved_commit_sha: "a".repeat(40),
        snapshot_digest: "sha256-v1:fixture".to_string(),
        expires_at: "2099-01-01T00:00:00Z".to_string(),
    }
}

#[test]
fn remote_selection_prefers_id_or_directory_over_earlier_path_fallback() {
    for direct in [
        candidate("wanted", "different", "skills/direct-id"),
        candidate("different", "wanted", "skills/direct-directory"),
    ] {
        let expected = direct.source_path.clone();
        let preview = preview(vec![candidate("other", "other", "skills/wanted"), direct]);
        let selection = skills_sh_selection_from_preview(&preview, " WANTED ", false).unwrap();
        assert_eq!(selection.source_path, expected);
        assert_eq!(
            selection.resolution,
            github_import::DuplicateResolution::Overwrite
        );
        assert_eq!(selection.renamed_skill_id, None);
    }
}

#[test]
fn remote_selection_preserves_first_equal_match_and_path_fallback() {
    let preview = preview(vec![
        candidate("one", "one", "skills/Wanted"),
        candidate("two", "two", "other/wanted"),
    ]);
    assert_eq!(
        skills_sh_selection_from_preview(&preview, "wanted", false)
            .unwrap()
            .source_path,
        "skills/Wanted"
    );
    let preview = self::preview(vec![
        candidate("wanted", "one", "skills/first"),
        candidate("wanted", "two", "skills/second"),
    ]);
    assert_eq!(
        skills_sh_selection_from_preview(&preview, "wanted", false)
            .unwrap()
            .source_path,
        "skills/first"
    );
}

#[test]
fn remote_selection_requires_explicit_replace_only_for_selected_conflict() {
    let mut conflicted = candidate("wanted", "wanted", "skills/wanted");
    conflicted.conflict = Some(GitHubSkillConflict {
        existing_skill_id: "wanted".to_string(),
        existing_name: "wanted".to_string(),
        existing_canonical_path: None,
        proposed_skill_id: "wanted".to_string(),
        proposed_name: "wanted".to_string(),
    });
    let preview = preview(vec![conflicted, candidate("free", "free", "skills/free")]);
    assert!(matches!(
        skills_sh_selection_from_preview(&preview, "wanted", false),
        Err(MarketplaceError::DuplicateRequiresReplace(id)) if id == "wanted"
    ));
    assert!(skills_sh_selection_from_preview(&preview, "wanted", true).is_ok());
    assert!(skills_sh_selection_from_preview(&preview, "free", false).is_ok());
}

#[test]
fn remote_selection_reports_missing_and_rejects_unsupported_ids() {
    let preview = preview(vec![candidate("demo", "demo", "skills/demo")]);
    assert!(matches!(
        skills_sh_selection_from_preview(&preview, "missing", false),
        Err(MarketplaceError::SkillsShCandidateNotFound { skill_id, owner, repo })
            if skill_id == "missing" && owner == "fixture" && repo == "repo"
    ));
    for invalid in ["", "  ", ".", "a/b", "a\\b"] {
        assert!(matches!(
            skills_sh_selection_from_preview(&preview, invalid, false),
            Err(MarketplaceError::SkillsShSkillIdUnsupported)
        ));
    }
}

#[test]
fn remote_auth_fallback_stops_before_archive_acquisition() {
    use github_import::{GithubImportError, PreviewFailure, PreviewStage};
    let auth = Some("fixture-token".to_string());
    for stage in [
        PreviewStage::RepoInspect,
        PreviewStage::CommitResolve,
        PreviewStage::SnapshotAcquire,
        PreviewStage::CandidateBuild,
        PreviewStage::SnapshotRegister,
    ] {
        let failure = PreviewFailure {
            stage,
            error: GithubImportError::RepoNotFound,
        };
        assert_eq!(
            retry_skills_sh_preview_without_auth(&auth, &failure),
            matches!(stage, PreviewStage::RepoInspect)
        );
        assert!(!retry_skills_sh_preview_without_auth(&None, &failure));
    }
}

#[test]
fn remote_marketplace_routes_before_local_acquisition_and_reuses_preview() {
    // Architectural guard: remote installs must not reintroduce the old local
    // snapshot acquisition + independent remote download route.
    let source = include_str!("skills_sh.rs");
    let install = source
        .split("pub async fn install_from_skills_sh_with_options_impl(")
        .nth(1)
        .unwrap()
        .split("async fn install_skills_sh_remote(")
        .next()
        .unwrap();
    assert!(
        install.find("return install_skills_sh_remote(").unwrap()
            < install.find("skills_sh_snapshot_with_auth(").unwrap()
    );
    let remote = source
        .split("async fn install_skills_sh_remote(")
        .nth(1)
        .unwrap()
        .split("fn retry_skills_sh_preview_without_auth(")
        .next()
        .unwrap();
    assert!(remote.contains("import_github_repo_skills_from_preview_with_branch("));
    assert!(remote.contains("&preview.preview_id"));
    assert!(remote.contains("discard_preview_snapshot_for_target(active_target"));
    assert!(!remote.contains("skills_sh_snapshot_with_auth("));
    assert!(!remote.contains("import_github_repo_skills_remote_with_auth("));
}
