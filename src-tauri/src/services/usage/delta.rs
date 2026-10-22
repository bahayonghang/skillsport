//! Internal scan observations. Paths stay at the controlled file-cache boundary.
use std::collections::HashMap;

use super::SkillCall;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct FileFingerprint {
    pub file_path: String,
    pub file_key: Option<String>,
    pub mtime_ms: i64,
    pub size: i64,
    pub observed_order: i64,
}

#[derive(Debug)]
pub enum FileChange {
    Unchanged,
    Parsed(Vec<SkillCall>),
    Unreadable,
}

#[derive(Debug)]
pub struct ObservedFile {
    pub path: String,
    pub key: String,
    pub mtime_ms: i64,
    pub size: i64,
    pub order: i64,
    pub change: FileChange,
}

#[derive(Debug, Default)]
pub struct FileManifest {
    pub existing: HashMap<String, FileFingerprint>,
    pub files: Vec<ObservedFile>,
}

impl FileManifest {
    pub fn observe(&mut self, path: &str, mtime_ms: i64, size: i64) -> bool {
        let previous = self.existing.get(path);
        let unchanged = mtime_ms > 0
            && previous
                .is_some_and(|p| p.file_key.is_some() && p.mtime_ms == mtime_ms && p.size == size);
        let key = previous
            .and_then(|p| p.file_key.clone())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        self.files.push(ObservedFile {
            path: path.into(),
            key,
            mtime_ms,
            size,
            order: self.files.len() as i64,
            change: if unchanged {
                FileChange::Unchanged
            } else {
                FileChange::Unreadable
            },
        });
        unchanged
    }

    pub fn record(&mut self, path: String, mtime_ms: i64, size: i64, calls: Vec<SkillCall>) {
        if self.files.last().is_none_or(|f| f.path != path) {
            self.observe(&path, mtime_ms, size);
        }
        self.files.last_mut().expect("observed file").change = FileChange::Parsed(calls);
    }
}

#[derive(Debug)]
pub struct ProviderPlan {
    pub id: String,
    pub display_name: String,
    pub available: bool,
    pub files: Option<FileManifest>,
    pub whole_calls: Vec<SkillCall>,
}

pub fn group_key(provider: &str, file: &ObservedFile, ordinal: usize, call: &SkillCall) -> String {
    match provider {
        "claude-code" => serde_json::to_string(&(&call.skill, call.timestamp_ms)).expect("tuple"),
        "grok" => {
            use sha2::{Digest, Sha256};
            let directory = std::path::Path::new(&file.path)
                .parent()
                .unwrap_or_else(|| std::path::Path::new(""));
            let scope = crate::hashing::encode_lower_hex(
                Sha256::digest(directory.as_os_str().to_string_lossy().as_bytes()).as_ref(),
            );
            serde_json::to_string(&(scope, &call.skill)).expect("tuple")
        }
        _ => serde_json::to_string(&(&file.key, ordinal)).expect("tuple"),
    }
}
