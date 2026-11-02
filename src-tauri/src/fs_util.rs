//! Cross-domain filesystem helper: the canonical `spawn_blocking` wrapper for
//! running synchronous `std::fs` work from async contexts.
//!
//! Heavy IO (recursive copy/delete/traversal, batch writes, directory moves)
//! must go through [`run_blocking_fs_with`] (typed domain errors) so the
//! Tauri async runtime workers are never blocked by disk latency. Domain
//! modules re-export or import this wrapper directly — do not introduce a
//! second wrapping pattern.

/// Run a synchronous filesystem task on the blocking-thread pool, mapping a
/// failed join into the caller's error type via `join_error`.
///
/// Typed-error domains (e.g. `InstallationError`, `ScannerError`) call this
/// with their own join-error constructor so the task error type flows through
/// unchanged.
pub(crate) async fn run_blocking_fs_with<T, E, F>(
    label: &'static str,
    task: F,
    join_error: fn(&'static str, String) -> E,
) -> Result<T, E>
where
    T: Send + 'static,
    E: Send + 'static,
    F: FnOnce() -> Result<T, E> + Send + 'static,
{
    #[cfg(test)]
    let _benchmark_span = tracing::info_span!("blocking_fs_await", phase = label);
    match tauri::async_runtime::spawn_blocking(task).await {
        Ok(result) => result,
        Err(e) => Err(join_error(label, e.to_string())),
    }
}

/// `std::fs::rename` that retries transient Windows sharing/access failures.
///
/// On Windows, antivirus or the indexer can briefly hold a handle inside a
/// directory that was just written, so renaming it fails with OS error 5
/// (access denied) or 32 (sharing violation). Retries for up to ~2 s; other
/// platforms and other errors return immediately. Blocking: call it inside a
/// `run_blocking_fs_with` closure.
pub(crate) fn rename_with_retry(
    source: &std::path::Path,
    target: &std::path::Path,
) -> std::io::Result<()> {
    const ATTEMPTS: usize = 40;
    for attempt in 0..ATTEMPTS {
        match std::fs::rename(source, target) {
            Ok(()) => return Ok(()),
            Err(error)
                if cfg!(windows)
                    && attempt + 1 < ATTEMPTS
                    && matches!(error.raw_os_error(), Some(5 | 32)) =>
            {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(error) => return Err(error),
        }
    }
    unreachable!("rename retry loop always returns")
}
