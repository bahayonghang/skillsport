use std::process::ExitCode;

use clap::{Args, Parser, Subcommand, ValueEnum};
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;

use skillport_lib::cli_api::{
    CliApiError, CliContext, NoteInput, ProjectInstallRequest, TagAddRequest,
};

#[derive(Debug, Clone, Copy, ValueEnum)]
enum Language {
    En,
    Zh,
}

#[derive(Debug, Parser)]
#[command(
    name = "skillport-cli",
    version,
    about = "Manage Local SkillPort skills"
)]
struct Cli {
    #[arg(long, global = true)]
    json: bool,
    #[arg(long, global = true, value_enum, default_value_t = Language::En)]
    lang: Language,
    #[command(subcommand)]
    command: TopCommand,
}

#[derive(Debug, Subcommand)]
enum TopCommand {
    Skills {
        #[command(subcommand)]
        command: SkillsCommand,
    },
    Agents {
        #[command(subcommand)]
        command: AgentsCommand,
    },
    Projects {
        #[command(subcommand)]
        command: ProjectsCommand,
    },
    Tags {
        #[command(subcommand)]
        command: TagsCommand,
    },
    Notes {
        #[command(subcommand)]
        command: NotesCommand,
    },
}

#[derive(Debug, Subcommand)]
enum AgentsCommand {
    List,
}

#[derive(Debug, Subcommand)]
enum ProjectsCommand {
    List,
    Skills {
        project: String,
    },
    Add {
        /// Project directory; defaults to the current directory.
        path: Option<String>,
        #[arg(long)]
        dry_run: bool,
    },
    Install(ProjectInstallArgs),
    Uninstall(ProjectUninstallArgs),
}

#[derive(Debug, Args)]
struct ProjectInstallArgs {
    project: String,
    #[arg(required = true)]
    references: Vec<String>,
    #[arg(long = "agent", required = true)]
    agent: String,
    #[arg(long, default_value = "auto")]
    method: String,
    #[arg(long)]
    dry_run: bool,
    #[arg(long)]
    yes: bool,
}

#[derive(Debug, Args)]
struct ProjectUninstallArgs {
    project: String,
    #[arg(required = true)]
    references: Vec<String>,
    #[arg(long = "agent", required = true)]
    agent: String,
    #[arg(long)]
    dry_run: bool,
    #[arg(long)]
    yes: bool,
}

#[derive(Debug, Args)]
struct UnlinkArgs {
    #[arg(required = true)]
    references: Vec<String>,
    #[arg(long = "agent", required = true)]
    agent: String,
    #[arg(long)]
    dry_run: bool,
    #[arg(long)]
    yes: bool,
}

#[derive(Debug, Subcommand)]
enum TagsCommand {
    List,
    Create(TagCreateArgs),
    Add(TagAddArgs),
    Remove(TagRemoveArgs),
}

#[derive(Debug, Args)]
struct TagCreateArgs {
    name: String,
    #[arg(long)]
    group: Option<String>,
    #[arg(long)]
    color: Option<String>,
    #[arg(long)]
    description: Option<String>,
    #[arg(long)]
    dry_run: bool,
}

#[derive(Debug, Args)]
struct TagAddArgs {
    #[arg(required = true)]
    references: Vec<String>,
    #[arg(long = "tag", required = true)]
    tags: Vec<String>,
    #[arg(long)]
    reason: Option<String>,
    #[arg(long)]
    confidence: Option<f64>,
    #[arg(long)]
    review: bool,
    #[arg(long)]
    dry_run: bool,
    #[arg(long)]
    yes: bool,
}

#[derive(Debug, Args)]
struct TagRemoveArgs {
    reference: String,
    #[arg(long = "tag", required = true)]
    tags: Vec<String>,
    #[arg(long)]
    dry_run: bool,
    #[arg(long)]
    yes: bool,
}

#[derive(Debug, Subcommand)]
enum NotesCommand {
    Get { reference: String },
    Set(NoteSetArgs),
}

#[derive(Debug, Args)]
struct NoteSetArgs {
    reference: String,
    #[arg(long, conflicts_with = "file", required_unless_present = "file")]
    text: Option<String>,
    #[arg(long)]
    file: Option<PathBuf>,
    #[arg(long)]
    author: Option<String>,
    #[arg(long)]
    dry_run: bool,
    #[arg(long)]
    yes: bool,
}

#[derive(Debug, Subcommand)]
enum SkillsCommand {
    List {
        #[arg(long = "tag")]
        tags: Vec<String>,
        #[arg(long = "agent")]
        agent: Option<String>,
        #[arg(long = "source")]
        source: Option<String>,
    },
    Show {
        reference: String,
    },
    Search {
        query: String,
        #[arg(long)]
        limit: Option<u32>,
    },
    Install(InstallArgs),
    Sync(SyncArgs),
    Unlink(UnlinkArgs),
}

#[derive(Debug, Args)]
struct InstallArgs {
    source: String,
    #[arg(long)]
    replace: bool,
    #[arg(long)]
    yes: bool,
    #[arg(long)]
    sync: bool,
    #[arg(long = "agent")]
    agents: Vec<String>,
    #[arg(long, default_value = "auto")]
    method: String,
}

#[derive(Debug, Args)]
struct SyncArgs {
    references: Vec<String>,
    #[arg(long)]
    all: bool,
    #[arg(long = "agent")]
    agents: Vec<String>,
    #[arg(long, default_value = "auto")]
    method: String,
    #[arg(long)]
    dry_run: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SuccessEnvelope {
    schema_version: u8,
    ok: bool,
    data: Value,
    warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorEnvelope {
    schema_version: u8,
    ok: bool,
    error: ErrorPayload,
}

#[derive(Debug, Serialize)]
struct ErrorPayload {
    code: &'static str,
    message: String,
    details: Value,
}

struct CommandOutput {
    data: Value,
    partial: bool,
    action: &'static str,
}

#[tokio::main]
async fn main() -> ExitCode {
    let cli = Cli::parse();
    match execute(&cli).await {
        Ok(output) => {
            render_success(&cli, &output);
            ExitCode::from(if output.partial { 5 } else { 0 })
        }
        Err(error) => {
            render_error(&cli, &error);
            ExitCode::from(error.exit_code())
        }
    }
}

async fn execute(cli: &Cli) -> Result<CommandOutput, CliApiError> {
    let context = CliContext::open_default().await?;
    match &cli.command {
        TopCommand::Agents { command } => match command {
            AgentsCommand::List => Ok(CommandOutput {
                data: to_value(context.list_agents().await?)?,
                partial: false,
                action: "agents_list",
            }),
        },
        TopCommand::Projects { command } => match command {
            ProjectsCommand::List => Ok(CommandOutput {
                data: to_value(context.list_projects().await?)?,
                partial: false,
                action: "projects_list",
            }),
            ProjectsCommand::Skills { project } => Ok(CommandOutput {
                data: to_value(
                    context
                        .list_project_skills(project, &current_dir()?)
                        .await?,
                )?,
                partial: false,
                action: "project_skills",
            }),
            ProjectsCommand::Add { path, dry_run } => {
                let output = context
                    .add_project(path.as_deref(), &current_dir()?, *dry_run)
                    .await?;
                mutation_output(output.dry_run, output, "projects_add")
            }
            ProjectsCommand::Install(args) => {
                let cwd = current_dir()?;
                let output = context
                    .install_to_project(ProjectInstallRequest {
                        project_ref: &args.project,
                        skill_refs: &args.references,
                        agent_id: &args.agent,
                        method: &args.method,
                        cwd: &cwd,
                        dry_run: args.dry_run,
                        yes: args.yes,
                    })
                    .await?;
                let partial = output
                    .result
                    .as_ref()
                    .is_some_and(|result| result.has_failures());
                partial_mutation_output(output.dry_run, output, partial, "projects_install")
            }
            ProjectsCommand::Uninstall(args) => {
                let output = context
                    .uninstall_from_project(
                        &args.project,
                        &args.references,
                        &args.agent,
                        &current_dir()?,
                        args.dry_run,
                        args.yes,
                    )
                    .await?;
                let partial = output
                    .result
                    .as_ref()
                    .is_some_and(|result| result.has_failures());
                partial_mutation_output(output.dry_run, output, partial, "projects_uninstall")
            }
        },
        TopCommand::Tags { command } => match command {
            TagsCommand::List => Ok(CommandOutput {
                data: to_value(context.list_tags().await?)?,
                partial: false,
                action: "tags_list",
            }),
            TagsCommand::Create(args) => {
                let output = context
                    .create_tag(
                        &args.name,
                        args.group.as_deref(),
                        args.color.as_deref(),
                        args.description.as_deref(),
                        args.dry_run,
                    )
                    .await?;
                mutation_output(output.dry_run, output, "tags_create")
            }
            TagsCommand::Add(args) => {
                let output = context
                    .add_tags(TagAddRequest {
                        skill_refs: &args.references,
                        tag_refs: &args.tags,
                        reason: args.reason.as_deref(),
                        confidence: args.confidence,
                        review: args.review,
                        dry_run: args.dry_run,
                        yes: args.yes,
                    })
                    .await?;
                mutation_output(output.dry_run, output, "tags_add")
            }
            TagsCommand::Remove(args) => {
                let output = context
                    .remove_tags(&args.reference, &args.tags, args.dry_run, args.yes)
                    .await?;
                mutation_output(output.dry_run, output, "tags_remove")
            }
        },
        TopCommand::Notes { command } => match command {
            NotesCommand::Get { reference } => Ok(CommandOutput {
                data: to_value(context.get_note(reference, language_code(cli.lang)).await?)?,
                partial: false,
                action: "notes_get",
            }),
            NotesCommand::Set(args) => {
                let input = match (&args.text, &args.file) {
                    (Some(text), None) => NoteInput::Text(text.clone()),
                    (None, Some(file)) => NoteInput::File(file.clone()),
                    _ => {
                        return Err(CliApiError::InvalidInput(
                            "Pass exactly one of --text or --file".to_string(),
                        ))
                    }
                };
                let output = context
                    .set_note(
                        &args.reference,
                        input,
                        language_code(cli.lang),
                        args.author.as_deref(),
                        args.dry_run,
                        args.yes,
                    )
                    .await?;
                mutation_output(output.dry_run, output, "notes_set")
            }
        },
        TopCommand::Skills { command } => match command {
            SkillsCommand::List {
                tags,
                agent,
                source,
            } => Ok(CommandOutput {
                data: to_value(
                    context
                        .list_skills_filtered(tags, agent.as_deref(), source.as_deref())
                        .await?,
                )?,
                partial: false,
                action: "list",
            }),
            SkillsCommand::Show { reference } => Ok(CommandOutput {
                data: to_value(
                    context
                        .show_skill(reference, language_code(cli.lang))
                        .await?,
                )?,
                partial: false,
                action: "show",
            }),
            SkillsCommand::Search { query, limit } => Ok(CommandOutput {
                data: to_value(context.search_skills(query.clone(), *limit).await?)?,
                partial: false,
                action: "search",
            }),
            SkillsCommand::Install(args) => {
                let result = context
                    .install_skill(
                        &args.source,
                        args.replace,
                        args.yes,
                        args.sync,
                        args.agents.clone(),
                        &args.method,
                    )
                    .await?;
                let partial = result.is_partial_failure();
                Ok(CommandOutput {
                    data: to_value(result)?,
                    partial,
                    action: "install",
                })
            }
            SkillsCommand::Sync(args) => {
                let result = context
                    .sync_skills(
                        args.references.clone(),
                        args.all,
                        args.agents.clone(),
                        &args.method,
                        args.dry_run,
                    )
                    .await?;
                let partial = result.is_partial_failure();
                Ok(CommandOutput {
                    data: to_value(result)?,
                    partial,
                    action: if args.dry_run { "sync_preview" } else { "sync" },
                })
            }
            SkillsCommand::Unlink(args) => {
                let output = context
                    .unlink_skills(&args.references, &args.agent, args.dry_run, args.yes)
                    .await?;
                let partial = output
                    .result
                    .as_ref()
                    .is_some_and(|result| result.has_failures());
                partial_mutation_output(output.dry_run, output, partial, "unlink")
            }
        },
    }
}

fn language_code(lang: Language) -> &'static str {
    match lang {
        Language::En => "en",
        Language::Zh => "zh",
    }
}

fn mutation_output(
    dry_run: bool,
    output: impl Serialize,
    action: &'static str,
) -> Result<CommandOutput, CliApiError> {
    partial_mutation_output(dry_run, output, false, action)
}

/// Like `mutation_output`, but a batch with failed items exits with code 5.
fn partial_mutation_output(
    dry_run: bool,
    output: impl Serialize,
    partial: bool,
    action: &'static str,
) -> Result<CommandOutput, CliApiError> {
    Ok(CommandOutput {
        data: to_value(output)?,
        partial,
        action: if dry_run { "mutation_preview" } else { action },
    })
}

fn current_dir() -> Result<PathBuf, CliApiError> {
    std::env::current_dir().map_err(|error| CliApiError::Internal(error.to_string()))
}

fn to_value(value: impl Serialize) -> Result<Value, CliApiError> {
    serde_json::to_value(value).map_err(|error| CliApiError::Internal(error.to_string()))
}

fn render_success(cli: &Cli, output: &CommandOutput) {
    if cli.json {
        let envelope = SuccessEnvelope {
            schema_version: 1,
            ok: true,
            data: output.data.clone(),
            warnings: Vec::new(),
        };
        println!("{}", serde_json::to_string(&envelope).unwrap());
        return;
    }

    let label = success_label(cli.lang, output.action);
    println!("{label}");
    println!("{}", serde_json::to_string_pretty(&output.data).unwrap());
    if output.partial {
        eprintln!(
            "{}",
            match cli.lang {
                Language::En => "Some items failed.",
                Language::Zh => "部分项目失败。",
            }
        );
    }
}

fn success_label(lang: Language, action: &str) -> &'static str {
    match (lang, action) {
        (Language::Zh, "list") => "中央技能",
        (Language::Zh, "show") => "技能详情",
        (Language::Zh, "search") => "搜索结果",
        (Language::Zh, "install") => "安装结果",
        (Language::Zh, "sync_preview") => "同步预览",
        (Language::Zh, "agents_list") => "平台",
        (Language::Zh, "projects_list") => "项目",
        (Language::Zh, "project_skills") => "项目技能",
        (Language::Zh, "tags_list") => "标签",
        (Language::Zh, "tags_create") => "标签已创建",
        (Language::Zh, "tags_add") => "标签已添加",
        (Language::Zh, "tags_remove") => "标签已移除",
        (Language::Zh, "notes_get") => "技能说明",
        (Language::Zh, "notes_set") => "说明已保存",
        (Language::Zh, "projects_add") => "项目已添加",
        (Language::Zh, "projects_install") => "项目安装结果",
        (Language::Zh, "projects_uninstall") => "项目卸载结果",
        (Language::Zh, "unlink") => "卸载结果",
        (Language::Zh, "mutation_preview") => "变更预览（未写入）",
        (Language::Zh, _) => "同步结果",
        (Language::En, "list") => "Central skills",
        (Language::En, "show") => "Skill details",
        (Language::En, "search") => "Search results",
        (Language::En, "install") => "Install result",
        (Language::En, "sync_preview") => "Sync preview",
        (Language::En, "agents_list") => "Agents",
        (Language::En, "projects_list") => "Projects",
        (Language::En, "project_skills") => "Project skills",
        (Language::En, "tags_list") => "Tags",
        (Language::En, "tags_create") => "Tag created",
        (Language::En, "tags_add") => "Tags added",
        (Language::En, "tags_remove") => "Tags removed",
        (Language::En, "notes_get") => "Skill note",
        (Language::En, "notes_set") => "Note saved",
        (Language::En, "projects_add") => "Project added",
        (Language::En, "projects_install") => "Project install result",
        (Language::En, "projects_uninstall") => "Project uninstall result",
        (Language::En, "unlink") => "Unlink result",
        (Language::En, "mutation_preview") => "Change preview (nothing written)",
        (Language::En, _) => "Sync result",
    }
}

fn render_error(cli: &Cli, error: &CliApiError) {
    if cli.json {
        let envelope = ErrorEnvelope {
            schema_version: 1,
            ok: false,
            error: error_payload(error),
        };
        eprintln!("{}", serde_json::to_string(&envelope).unwrap());
        return;
    }
    eprintln!(
        "{}: {error}",
        match cli.lang {
            Language::En => "Error",
            Language::Zh => "错误",
        }
    );
    if let Some(plans) = error.details().get("plans") {
        eprintln!("{}", serde_json::to_string_pretty(plans).unwrap());
    }
}

fn error_payload(error: &CliApiError) -> ErrorPayload {
    ErrorPayload {
        code: error.code(),
        message: error.to_string(),
        details: error.details(),
    }
}

#[cfg(test)]
mod tests {
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

        let projects =
            Cli::try_parse_from(["skillport-cli", "--json", "projects", "list"]).unwrap();
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
        let get = Cli::try_parse_from(["skillport-cli", "--lang", "zh", "notes", "get", "alpha"])
            .unwrap();
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
            Cli::try_parse_from(["skillport-cli", "notes", "set", "alpha", "--file", "b.md"])
                .is_ok()
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
        assert!(
            Cli::try_parse_from(["skillport-cli", "projects", "install", ".", "alpha"]).is_err()
        );
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
}
