use std::process::ExitCode;

use clap::{ArgGroup, Args, Parser, Subcommand, ValueEnum};
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;

use skillport_lib::cli_api::{
    CliApiError, CliContext, NoteInput, ProjectInstallRequest, SkillImportRequest,
    SkillImportSource, TagAddRequest,
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
    Import(ImportArgs),
    Sync(SyncArgs),
    Unlink(UnlinkArgs),
}

#[derive(Debug, Args)]
#[command(group(
    ArgGroup::new("import_source")
        .required(true)
        .args(["from_zip", "from_dir"])
))]
struct ImportArgs {
    /// Local `.zip` skill archive.
    #[arg(long, value_name = "FILE")]
    from_zip: Option<PathBuf>,
    /// Local directory that contains SKILL.md.
    #[arg(long, value_name = "DIR")]
    from_dir: Option<PathBuf>,
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
    #[arg(long)]
    dry_run: bool,
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
            SkillsCommand::Import(args) => {
                let source = match (&args.from_zip, &args.from_dir) {
                    (Some(file), None) => SkillImportSource::Zip(file.clone()),
                    (None, Some(dir)) => SkillImportSource::Dir(dir.clone()),
                    _ => {
                        return Err(CliApiError::InvalidInput(
                            "Pass exactly one of --from-zip or --from-dir".to_string(),
                        ))
                    }
                };
                let cwd = current_dir()?;
                let output = context
                    .import_skill(SkillImportRequest {
                        source,
                        replace: args.replace,
                        sync: args.sync,
                        agent_ids: &args.agents,
                        method: &args.method,
                        cwd: &cwd,
                        dry_run: args.dry_run,
                        yes: args.yes,
                    })
                    .await?;
                let partial = output
                    .result
                    .as_ref()
                    .is_some_and(|result| result.is_partial_failure());
                partial_mutation_output(output.dry_run, output, partial, "import")
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
        (Language::Zh, "import") => "导入结果",
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
        (Language::En, "import") => "Import result",
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
#[path = "skillport-cli/tests.rs"]
mod tests;
