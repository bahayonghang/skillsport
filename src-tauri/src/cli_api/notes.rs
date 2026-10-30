//! `notes get/set`: agent-authored skill explanations.
//!
//! Notes live in `skill_explanations` (the GUI explanation view) with
//! `model = "agent:<author>"`. Writes go through the provider-independent
//! repository upsert shared with the AI generation flow.

use std::io::Read;
use std::path::PathBuf;

use serde::Serialize;

use crate::db::repos::skill_explanations_repo;
use crate::services::{ai_provider, central_skills};

use super::confirm::{self, ConfirmDecision, MutationOutput};
use super::{record_cli_mutation_log, CliApiError, CliContext, CliExplanation};

/// Maximum note size in bytes for both `--text` and `--file`.
pub const MAX_NOTE_BYTES: usize = 64 * 1024;
pub const AGENT_MODEL_PREFIX: &str = "agent:";
const DEFAULT_AUTHOR: &str = "cli";
const MAX_AUTHOR_CHARS: usize = 64;

#[derive(Debug, Clone)]
pub enum NoteInput {
    Text(String),
    File(PathBuf),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliNote {
    pub uid: String,
    pub id: String,
    pub lang: String,
    pub explanation: Option<CliExplanation>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotePlan {
    pub uid: String,
    pub id: String,
    pub lang: String,
    pub model: String,
    pub bytes: usize,
    /// A non-empty explanation already exists and will be overwritten.
    pub replaces_existing: bool,
    pub previous_model: Option<String>,
}

impl CliContext {
    pub async fn get_note(&self, reference: &str, lang: &str) -> Result<CliNote, CliApiError> {
        let lang = validate_lang(lang)?;
        let skill = central_skills::resolve_skill_ref_impl(&self.db, reference).await?;
        let explanation = load_explanation(&self.db, &skill.id, lang).await?;
        Ok(CliNote {
            uid: skill.uid,
            id: skill.id,
            lang: lang.to_string(),
            explanation,
        })
    }

    /// Write an agent note. Overwriting an existing explanation requires `--yes`.
    pub async fn set_note(
        &self,
        reference: &str,
        input: NoteInput,
        lang: &str,
        author: Option<&str>,
        dry_run: bool,
        yes: bool,
    ) -> Result<MutationOutput<NotePlan, CliNote>, CliApiError> {
        let lang = validate_lang(lang)?;
        let model = agent_model(author)?;
        let text = read_note_input(input)?;
        let skill = central_skills::resolve_skill_ref_impl(&self.db, reference).await?;
        let existing = load_explanation(&self.db, &skill.id, lang).await?;
        let plans = vec![NotePlan {
            uid: skill.uid.clone(),
            id: skill.id.clone(),
            lang: lang.to_string(),
            model: model.clone(),
            bytes: text.len(),
            replaces_existing: existing.is_some(),
            previous_model: existing.and_then(|existing| existing.model),
        }];
        let needs_confirmation = plans[0].replaces_existing;
        if confirm::require(&plans, needs_confirmation, yes, dry_run)? == ConfirmDecision::DryRun {
            return Ok(MutationOutput::dry_run(plans));
        }

        if let Err(error) = skill_explanations_repo::upsert_skill_explanation(
            &self.db, &skill.id, lang, &model, &text,
        )
        .await
        {
            let error = CliApiError::from(error);
            record_cli_mutation_log(
                &self.db,
                "refresh_skill_explanation",
                Some("database"),
                "failed",
                "Skill note write failed.",
                Some(error.code()),
                serde_json::json!({}),
            )
            .await;
            return Err(error);
        }
        record_cli_mutation_log(
            &self.db,
            "refresh_skill_explanation",
            Some("database"),
            "succeeded",
            "Skill note written.",
            None,
            serde_json::json!({ "replacedExisting": needs_confirmation }),
        )
        .await;
        let explanation = load_explanation(&self.db, &skill.id, lang).await?;
        Ok(MutationOutput::applied(
            plans,
            CliNote {
                uid: skill.uid,
                id: skill.id,
                lang: lang.to_string(),
                explanation,
            },
        ))
    }
}

async fn load_explanation(
    pool: &crate::db::DbPool,
    skill_id: &str,
    lang: &str,
) -> Result<Option<CliExplanation>, CliApiError> {
    Ok(
        ai_provider::get_skill_explanation_record_impl(pool, skill_id, lang)
            .await?
            .map(|record| CliExplanation {
                lang: record.lang,
                text: record.text,
                model: record.model,
            }),
    )
}

fn validate_lang(lang: &str) -> Result<&str, CliApiError> {
    match lang {
        "en" | "zh" => Ok(lang),
        _ => Err(CliApiError::InvalidInput(
            "lang must be en or zh".to_string(),
        )),
    }
}

fn agent_model(author: Option<&str>) -> Result<String, CliApiError> {
    let author = author.map(str::trim).unwrap_or(DEFAULT_AUTHOR);
    let valid = !author.is_empty()
        && author.chars().count() <= MAX_AUTHOR_CHARS
        && author
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'));
    if !valid {
        return Err(CliApiError::InvalidInput(format!(
            "author must be 1-{MAX_AUTHOR_CHARS} ASCII letters, digits, '-', '_', or '.'"
        )));
    }
    Ok(format!("{AGENT_MODEL_PREFIX}{author}"))
}

fn read_note_input(input: NoteInput) -> Result<String, CliApiError> {
    let text = match input {
        NoteInput::Text(text) => {
            if text.len() > MAX_NOTE_BYTES {
                return Err(too_large());
            }
            text
        }
        NoteInput::File(path) => read_note_file(&path)?,
    };
    if text.trim().is_empty() {
        return Err(CliApiError::InvalidInput(
            "Note text must not be empty".to_string(),
        ));
    }
    Ok(text)
}

/// Bounded single-file read: at most `MAX_NOTE_BYTES + 1` bytes are read.
fn read_note_file(path: &std::path::Path) -> Result<String, CliApiError> {
    let invalid =
        || CliApiError::InvalidPath("Note file is missing or not a regular file".to_string());
    let metadata = std::fs::metadata(path).map_err(|_| invalid())?;
    if !metadata.is_file() {
        return Err(invalid());
    }
    if metadata.len() > MAX_NOTE_BYTES as u64 {
        return Err(too_large());
    }
    let file = std::fs::File::open(path).map_err(|_| invalid())?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_NOTE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| invalid())?;
    if bytes.len() > MAX_NOTE_BYTES {
        return Err(too_large());
    }
    String::from_utf8(bytes)
        .map_err(|_| CliApiError::InvalidInput("Note file must be UTF-8 text".to_string()))
}

fn too_large() -> CliApiError {
    CliApiError::InvalidInput(format!("Note must be at most {MAX_NOTE_BYTES} bytes"))
}
