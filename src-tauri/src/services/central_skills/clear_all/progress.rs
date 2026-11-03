//! Throttled progress and cancellation for one clear-all job.
//!
//! The service never sees an `AppHandle`: the command layer passes a sink
//! closure, so tests can record events and blocking filesystem closures stay
//! free of Tauri handles (see `spawn-blocking-io.md`).

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use super::types::{ClearCentralPhase, ClearCentralProgress, ClearCentralProgressStatus};

const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);
const PROGRESS_ITEM_STEP: usize = 25;

pub type ClearProgressSink<'a> = &'a (dyn Fn(ClearCentralProgress) + Send + Sync);

/// Correlation, progress, and cancellation handles for one clear-all job.
#[derive(Clone, Copy)]
pub struct ClearJob<'a> {
    pub job_id: &'a str,
    pub cancel: &'a AtomicBool,
    pub progress: ClearProgressSink<'a>,
}

impl ClearJob<'_> {
    pub(super) fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }
}

pub(super) struct ProgressTracker<'a> {
    job: ClearJob<'a>,
    phase: ClearCentralPhase,
    completed: usize,
    total: usize,
    last_emit: Instant,
    since_emit: usize,
}

impl<'a> ProgressTracker<'a> {
    pub(super) fn new(job: ClearJob<'a>, total: usize) -> Self {
        Self {
            job,
            phase: ClearCentralPhase::Recovery,
            completed: 0,
            total,
            last_emit: Instant::now(),
            since_emit: 0,
        }
    }

    pub(super) fn set_total(&mut self, total: usize) {
        self.total = total.max(self.completed);
    }

    pub(super) fn completed(&self) -> usize {
        self.completed
    }

    /// Phase switches always emit.
    pub(super) fn start_phase(&mut self, phase: ClearCentralPhase) {
        self.phase = phase;
        self.emit(ClearCentralProgressStatus::Started);
    }

    pub(super) fn advance(&mut self, items: usize) {
        if items == 0 {
            return;
        }
        self.completed = self.completed.saturating_add(items).min(self.total);
        self.since_emit += items;
        if self.since_emit >= PROGRESS_ITEM_STEP || self.last_emit.elapsed() >= PROGRESS_INTERVAL {
            self.emit(ClearCentralProgressStatus::Running);
        }
    }

    /// Terminal states always emit.
    pub(super) fn finish(&mut self, status: ClearCentralProgressStatus) {
        self.emit(status);
    }

    fn emit(&mut self, status: ClearCentralProgressStatus) {
        self.last_emit = Instant::now();
        self.since_emit = 0;
        (self.job.progress)(ClearCentralProgress {
            job_id: self.job.job_id.to_string(),
            phase: self.phase,
            status,
            completed: self.completed,
            total: self.total,
        });
    }
}
