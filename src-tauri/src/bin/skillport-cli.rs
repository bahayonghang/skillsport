use std::process::ExitCode;

use clap::{Args, Parser, Subcommand, ValueEnum};
use serde::Serialize;
use serde_json::{json, Value};
use skillport_lib::cli_api::{CliApiError, CliContext};

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
}

#[derive(Debug, Subcommand)]
enum AgentsCommand {
    List,
}

#[derive(Debug, Subcommand)]
enum ProjectsCommand {
    List,
    Skills { project: String },
}

#[derive(Debug, Subcommand)]
enum TagsCommand {
    List,
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
            ProjectsCommand::Skills { project } => {
                let cwd = std::env::current_dir()
                    .map_err(|error| CliApiError::Internal(error.to_string()))?;
                Ok(CommandOutput {
                    data: to_value(context.list_project_skills(project, &cwd).await?)?,
                    partial: false,
                    action: "project_skills",
                })
            }
        },
        TopCommand::Tags { command } => match command {
            TagsCommand::List => Ok(CommandOutput {
                data: to_value(context.list_tags().await?)?,
                partial: false,
                action: "tags_list",
            }),
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
        },
    }
}

fn language_code(lang: Language) -> &'static str {
    match lang {
        Language::En => "en",
        Language::Zh => "zh",
    }
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
        (Language::En, _) => "Sync result",
    }
}

fn render_error(cli: &Cli, error: &CliApiError) {
    if cli.json {
        let envelope = ErrorEnvelope {
            schema_version: 1,
            ok: false,
            error: ErrorPayload {
                code: error.code(),
                message: error.to_string(),
                details: json!({}),
            },
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
}

#[cfg(test)]
mod tests {
    use super::*;
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
