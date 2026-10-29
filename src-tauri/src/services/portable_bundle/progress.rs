use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

use super::error::PortableBundleError;
use super::types::{
    PortableBundleJobStatus, PortableBundlePhase, PortableBundleProgressPayload,
    BUNDLE_PROGRESS_EVENT,
};

const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

/// Correlation, progress, and cancellation handles for one bundle job.
#[derive(Clone, Copy)]
pub(crate) struct BundleJob<'a> {
    pub(crate) job_id: &'a str,
    pub(crate) app: Option<&'a AppHandle>,
    pub(crate) cancel: Option<&'a AtomicBool>,
}

impl<'a> BundleJob<'a> {
    pub(crate) fn check_cancel(&self) -> Result<(), PortableBundleError> {
        if self
            .cancel
            .is_some_and(|cancel| cancel.load(Ordering::SeqCst))
        {
            Err(PortableBundleError::Cancelled)
        } else {
            Ok(())
        }
    }

    pub(crate) fn emit(
        &self,
        phase: PortableBundlePhase,
        status: PortableBundleJobStatus,
        total: usize,
        completed: usize,
        current_item: Option<&str>,
    ) {
        let Some(app) = self.app else {
            return;
        };
        let _ = app.emit(
            BUNDLE_PROGRESS_EVENT,
            PortableBundleProgressPayload {
                job_id: self.job_id.to_string(),
                phase,
                status,
                total,
                completed,
                current_item: current_item.map(str::to_string),
            },
        );
    }
}

/// Drops running-progress events that arrive faster than the UI can use.
pub(crate) struct ProgressThrottle {
    last: Option<Instant>,
}

impl ProgressThrottle {
    pub(crate) fn new() -> Self {
        Self { last: None }
    }

    pub(crate) fn ready(&mut self) -> bool {
        let now = Instant::now();
        if self
            .last
            .is_some_and(|last| now.duration_since(last) < PROGRESS_INTERVAL)
        {
            return false;
        }
        self.last = Some(now);
        true
    }
}
