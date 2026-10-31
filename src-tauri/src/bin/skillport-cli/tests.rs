use super::*;
use serde_json::json;
use skillport_lib::cli_api::CliEntity;

#[test]
fn success_envelope_schema_is_versioned() {
    let encoded = serde_json::to_value(SuccessEnvelope {
        schema_version: 1,
        ok: true,
        data: json!({ "uid": "stable" }),
        warnings: Vec::new(),
    })
    .unwrap();
    assert_eq!(encoded["schemaVersion"], 1);
    assert_eq!(encoded["ok"], true);
    assert_eq!(encoded["data"]["uid"], "stable");
}

#[test]
fn error_envelope_uses_locale_neutral_code() {
    let error = CliApiError::ambiguous(CliEntity::Skill, "ambiguous");
    let encoded = serde_json::to_value(ErrorEnvelope {
        schema_version: 1,
        ok: false,
        error: ErrorPayload {
            code: error.code(),
            message: error.to_string(),
            details: json!({}),
        },
    })
    .unwrap();
    assert_eq!(encoded["schemaVersion"], 1);
    assert_eq!(encoded["ok"], false);
    assert_eq!(encoded["error"]["code"], "skill.ambiguous");
    assert_eq!(encoded["error"]["message"], "ambiguous");
}

#[test]
fn parser_accepts_read_commands() {
    let agents = Cli::try_parse_from(["skillport-cli", "--json", "agents", "list"]).unwrap();
    assert!(agents.json);
    assert!(matches!(agents.lang, Language::En));
    assert!(matches!(
        agents.command,
        TopCommand::Agents {
            command: AgentsCommand::List
        }
    ));

    let projects = Cli::try_parse_from(["skillport-cli", "--json", "projects", "list"]).unwrap();
    assert!(matches!(
        projects.command,
        TopCommand::Projects {
            command: ProjectsCommand::List
        }
    ));

    let dot = Cli::try_parse_from(["skillport-cli", "projects", "skills", "."]).unwrap();
    match dot.command {
        TopCommand::Projects {
            command: ProjectsCommand::Skills { project },
        } => assert_eq!(project, "."),
        other => panic!("unexpected command: {other:?}"),
    }

    let tags = Cli::try_parse_from(["skillport-cli", "--lang", "zh", "tags", "list"]).unwrap();
    assert!(matches!(tags.lang, Language::Zh));
    assert!(matches!(
        tags.command,
        TopCommand::Tags {
            command: TagsCommand::List
        }
    ));

    let filtered = Cli::try_parse_from([
        "skillport-cli",
        "--json",
        "skills",
        "list",
        "--tag",
        "docs",
        "--tag",
        "docs-writing",
        "--agent",
        "codex",
        "--source",
        "github",
    ])
    .unwrap();
    match filtered.command {
        TopCommand::Skills {
            command:
                SkillsCommand::List {
                    tags,
                    agent,
                    source,
                },
        } => {
            assert_eq!(tags, ["docs", "docs-writing"]);
            assert_eq!(agent.as_deref(), Some("codex"));
            assert_eq!(source.as_deref(), Some("github"));
        }
        other => panic!("unexpected command: {other:?}"),
    }
}

#[test]
fn read_command_labels_do_not_reuse_the_skill_list_label() {
    assert_eq!(success_label(Language::En, "list"), "Central skills");
    assert_eq!(success_label(Language::Zh, "list"), "中央技能");
    assert_eq!(success_label(Language::En, "sync"), "Sync result");
    assert_eq!(success_label(Language::Zh, "sync"), "同步结果");
    assert_eq!(success_label(Language::En, "agents_list"), "Agents");
    assert_eq!(success_label(Language::Zh, "agents_list"), "平台");
    assert_eq!(success_label(Language::En, "projects_list"), "Projects");
    assert_eq!(success_label(Language::Zh, "projects_list"), "项目");
    assert_eq!(
        success_label(Language::En, "project_skills"),
        "Project skills"
    );
    assert_eq!(success_label(Language::Zh, "project_skills"), "项目技能");
    assert_eq!(success_label(Language::En, "tags_list"), "Tags");
    assert_eq!(success_label(Language::Zh, "tags_list"), "标签");
    assert_ne!(
        success_label(Language::En, "agents_list"),
        success_label(Language::En, "list")
    );
}

#[test]
fn confirmation_error_envelope_carries_plans() {
    let error = CliApiError::ConfirmationRequired {
        message: "confirm".to_string(),
        plans: json!([{ "skillId": "alpha", "tagId": "docs" }]),
    };
    let encoded = serde_json::to_value(ErrorEnvelope {
        schema_version: 1,
        ok: false,
        error: error_payload(&error),
    })
    .unwrap();
    assert_eq!(encoded["schemaVersion"], 1);
    assert_eq!(encoded["error"]["code"], "input.confirmation_required");
    assert_eq!(encoded["error"]["details"]["plans"][0]["skillId"], "alpha");
    assert_eq!(error.exit_code(), 2);

    let plain = error_payload(&CliApiError::InvalidInput("x".into()));
    assert_eq!(plain.details, json!({}));
}

#[test]
fn parser_accepts_tag_mutations() {
    let create = Cli::try_parse_from([
        "skillport-cli",
        "tags",
        "create",
        "Release Notes",
        "--group",
        "Writing",
        "--color",
        "#fff",
        "--description",
        "Notes",
        "--dry-run",
    ])
    .unwrap();
    match create.command {
        TopCommand::Tags {
            command: TagsCommand::Create(args),
        } => {
            assert_eq!(args.name, "Release Notes");
            assert_eq!(args.group.as_deref(), Some("Writing"));
            assert!(args.dry_run);
        }
        other => panic!("unexpected command: {other:?}"),
    }

    let add = Cli::try_parse_from([
        "skillport-cli",
        "--json",
        "tags",
        "add",
        "alpha",
        "beta",
        "--tag",
        "docs",
        "--tag",
        "writing",
        "--reason",
        "fits",
        "--confidence",
        "0.7",
        "--review",
        "--yes",
    ])
    .unwrap();
    match add.command {
        TopCommand::Tags {
            command: TagsCommand::Add(args),
        } => {
            assert_eq!(args.references, ["alpha", "beta"]);
            assert_eq!(args.tags, ["docs", "writing"]);
            assert_eq!(args.confidence, Some(0.7));
            assert!(args.review && args.yes && !args.dry_run);
        }
        other => panic!("unexpected command: {other:?}"),
    }
    assert!(Cli::try_parse_from(["skillport-cli", "tags", "add", "alpha"]).is_err());
    assert!(Cli::try_parse_from(["skillport-cli", "tags", "add", "--tag", "docs"]).is_err());

    let remove = Cli::try_parse_from([
        "skillport-cli",
        "tags",
        "remove",
        "alpha",
        "--tag",
        "docs",
        "--yes",
    ])
    .unwrap();
    assert!(matches!(
        remove.command,
        TopCommand::Tags {
            command: TagsCommand::Remove(TagRemoveArgs { yes: true, .. })
        }
    ));
    assert!(Cli::try_parse_from([
        "skillport-cli",
        "tags",
        "remove",
        "alpha",
        "beta",
        "--tag",
        "x"
    ])
    .is_err());
}

#[test]
fn parser_accepts_note_commands_and_requires_one_source() {
    let get =
        Cli::try_parse_from(["skillport-cli", "--lang", "zh", "notes", "get", "alpha"]).unwrap();
    assert!(matches!(get.lang, Language::Zh));
    assert!(matches!(
        get.command,
        TopCommand::Notes {
            command: NotesCommand::Get { .. }
        }
    ));

    let set = Cli::try_parse_from([
        "skillport-cli",
        "notes",
        "set",
        "alpha",
        "--text",
        "hello",
        "--author",
        "codex",
        "--dry-run",
    ])
    .unwrap();
    match set.command {
        TopCommand::Notes {
            command: NotesCommand::Set(args),
        } => {
            assert_eq!(args.text.as_deref(), Some("hello"));
            assert_eq!(args.author.as_deref(), Some("codex"));
            assert!(args.dry_run);
        }
        other => panic!("unexpected command: {other:?}"),
    }
    assert!(Cli::try_parse_from(["skillport-cli", "notes", "set", "alpha"]).is_err());
    assert!(Cli::try_parse_from([
        "skillport-cli",
        "notes",
        "set",
        "alpha",
        "--text",
        "a",
        "--file",
        "b.md",
    ])
    .is_err());
    assert!(
        Cli::try_parse_from(["skillport-cli", "notes", "set", "alpha", "--file", "b.md"]).is_ok()
    );
}

#[test]
fn parser_accepts_project_and_unlink_mutations() {
    let add = Cli::try_parse_from(["skillport-cli", "projects", "add"]).unwrap();
    match add.command {
        TopCommand::Projects {
            command: ProjectsCommand::Add { path, dry_run },
        } => {
            assert!(path.is_none());
            assert!(!dry_run);
        }
        other => panic!("unexpected command: {other:?}"),
    }
    let add_dot =
        Cli::try_parse_from(["skillport-cli", "projects", "add", ".", "--dry-run"]).unwrap();
    assert!(matches!(
        add_dot.command,
        TopCommand::Projects {
            command: ProjectsCommand::Add { dry_run: true, .. }
        }
    ));

    let install = Cli::try_parse_from([
        "skillport-cli",
        "--json",
        "projects",
        "install",
        ".",
        "alpha",
        "beta",
        "--agent",
        "codex",
        "--method",
        "copy",
        "--yes",
    ])
    .unwrap();
    match install.command {
        TopCommand::Projects {
            command: ProjectsCommand::Install(args),
        } => {
            assert_eq!(args.project, ".");
            assert_eq!(args.references, ["alpha", "beta"]);
            assert_eq!(args.agent, "codex");
            assert_eq!(args.method, "copy");
            assert!(args.yes && !args.dry_run);
        }
        other => panic!("unexpected command: {other:?}"),
    }
    assert!(Cli::try_parse_from(["skillport-cli", "projects", "install", ".", "alpha"]).is_err());
    assert!(Cli::try_parse_from([
        "skillport-cli",
        "projects",
        "install",
        ".",
        "--agent",
        "codex"
    ])
    .is_err());

    let uninstall = Cli::try_parse_from([
        "skillport-cli",
        "projects",
        "uninstall",
        "demo",
        "alpha",
        "--agent",
        "codex",
        "--dry-run",
    ])
    .unwrap();
    assert!(matches!(
        uninstall.command,
        TopCommand::Projects {
            command: ProjectsCommand::Uninstall(ProjectUninstallArgs { dry_run: true, .. })
        }
    ));

    let unlink = Cli::try_parse_from([
        "skillport-cli",
        "skills",
        "unlink",
        "alpha",
        "beta",
        "--agent",
        "codex",
        "--yes",
    ])
    .unwrap();
    match unlink.command {
        TopCommand::Skills {
            command: SkillsCommand::Unlink(args),
        } => {
            assert_eq!(args.references, ["alpha", "beta"]);
            assert_eq!(args.agent, "codex");
            assert!(args.yes);
        }
        other => panic!("unexpected command: {other:?}"),
    }
    assert!(Cli::try_parse_from(["skillport-cli", "skills", "unlink", "alpha"]).is_err());
    assert!(
        Cli::try_parse_from(["skillport-cli", "skills", "unlink", "--agent", "codex"]).is_err()
    );
    assert_eq!(success_label(Language::En, "unlink"), "Unlink result");
    assert_eq!(success_label(Language::Zh, "projects_add"), "项目已添加");
}

#[test]
fn parser_accepts_import_sources() {
    let zip = Cli::try_parse_from([
        "skillport-cli",
        "--json",
        "skills",
        "import",
        "--from-zip",
        "demo.zip",
        "--replace",
        "--sync",
        "--agent",
        "codex",
        "--agent",
        "claude-code",
        "--yes",
    ])
    .unwrap();
    match zip.command {
        TopCommand::Skills {
            command: SkillsCommand::Import(args),
        } => {
            assert_eq!(args.from_zip, Some(PathBuf::from("demo.zip")));
            assert!(args.from_dir.is_none());
            assert_eq!(args.agents, ["codex", "claude-code"]);
            assert_eq!(args.method, "auto");
            assert!(args.replace && args.sync && args.yes && !args.dry_run);
        }
        other => panic!("unexpected command: {other:?}"),
    }
    let dir = Cli::try_parse_from([
        "skillport-cli",
        "skills",
        "import",
        "--from-dir",
        "skills/skillport",
        "--dry-run",
    ])
    .unwrap();
    assert!(matches!(
        dir.command,
        TopCommand::Skills {
            command: SkillsCommand::Import(ImportArgs { dry_run: true, .. })
        }
    ));
    assert!(Cli::try_parse_from(["skillport-cli", "skills", "import"]).is_err());
    assert!(Cli::try_parse_from([
        "skillport-cli",
        "skills",
        "import",
        "--from-zip",
        "a.zip",
        "--from-dir",
        "b",
    ])
    .is_err());
    assert_eq!(success_label(Language::En, "import"), "Import result");
    assert_eq!(success_label(Language::Zh, "import"), "导入结果");
}

#[test]
fn archive_fingerprint_mismatch_maps_to_exit_three() {
    let error = CliApiError::ArchiveChanged("changed".into());
    let payload = error_payload(&error);
    assert_eq!(payload.code, "archive.fingerprint_mismatch");
    assert_eq!(payload.details, json!({}));
    assert_eq!(error.exit_code(), 3);
}

#[test]
fn mutation_labels_are_distinct() {
    assert_eq!(success_label(Language::En, "tags_add"), "Tags added");
    assert_eq!(success_label(Language::Zh, "notes_set"), "说明已保存");
    assert_eq!(
        success_label(Language::En, "mutation_preview"),
        "Change preview (nothing written)"
    );
    assert_ne!(success_label(Language::En, "tags_remove"), "Sync result");
}

#[test]
fn parser_requires_explicit_sync_scope() {
    let parsed = Cli::try_parse_from(["skillport-cli", "skills", "sync", "--all"]);
    assert!(parsed.is_ok());
    let parsed = Cli::try_parse_from([
        "skillport-cli",
        "--json",
        "skills",
        "install",
        "owner/repo@skill",
        "--sync",
        "--agent",
        "codex",
    ]);
    assert!(parsed.is_ok());
}
