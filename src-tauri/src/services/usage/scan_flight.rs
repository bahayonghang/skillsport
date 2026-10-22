//! One publication cycle per pool/target, including force and background scans.
//! A detached owner retains the lease if its caller is dropped during blocking IO.
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};

use futures_util::FutureExt;
use tokio::sync::watch;
use tracing::instrument::WithSubscriber;

use super::{RefreshSummary, UsageError};
use crate::db::DbPool;

type Outcome = Result<RefreshSummary, Arc<UsageError>>;
type FlightKey = (usize, String);
static FLIGHTS: LazyLock<Mutex<HashMap<FlightKey, watch::Receiver<Option<Outcome>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub(super) async fn run<F>(
    pool: &DbPool,
    target: &str,
    scan: F,
) -> Result<RefreshSummary, UsageError>
where
    F: std::future::Future<Output = Result<RefreshSummary, UsageError>> + Send + 'static,
{
    let key = (
        Arc::as_ptr(&pool.connect_options()) as usize,
        target.to_owned(),
    );
    let mut receiver = {
        let mut flights = FLIGHTS.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(receiver) = flights.get(&key) {
            receiver.clone()
        } else {
            let (sender, receiver) = watch::channel(None);
            flights.insert(key.clone(), receiver.clone());
            tokio::spawn(
                async move {
                    let result = std::panic::AssertUnwindSafe(scan)
                        .catch_unwind()
                        .await
                        .unwrap_or_else(|_| {
                            Err(UsageError::task_join("usage scan", "scan panicked".into()))
                        })
                        .map_err(Arc::new);
                    let mut flights = FLIGHTS.lock().unwrap_or_else(|p| p.into_inner());
                    let _ = sender.send(Some(result));
                    flights.remove(&key);
                }
                .with_current_subscriber(),
            );
            receiver
        }
    };
    loop {
        if let Some(result) = receiver.borrow_and_update().clone() {
            return result.map_err(UsageError::SharedScan);
        }
        receiver
            .changed()
            .await
            .map_err(|_| UsageError::task_join("usage scan", "scan owner stopped".into()))?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::sync::Notify;

    fn summary() -> RefreshSummary {
        RefreshSummary {
            cached: false,
            calls_written: 144,
            providers_available: 1,
            scanned_at_ms: 10,
        }
    }

    #[tokio::test]
    async fn usage_scan_flight_coalesces_force_background_cold_and_survives_caller_drop() {
        let pool = crate::test_support::mem_pool().await;
        let started = Arc::new(Notify::new());
        let release = Arc::new(Notify::new());
        let count = Arc::new(AtomicUsize::new(0));
        let (s, r, c) = (started.clone(), release.clone(), count.clone());
        let mut owner = Box::pin(run(&pool, "local", async move {
            c.fetch_add(1, Ordering::SeqCst);
            s.notify_one();
            r.notified().await;
            Ok(summary())
        }));
        assert!(futures_util::poll!(&mut owner).is_pending());
        started.notified().await;
        let mut force = Box::pin(run(&pool, "local", async {
            panic!("second scan must not start");
            #[allow(unreachable_code)]
            Ok(summary())
        }));
        assert!(futures_util::poll!(&mut force).is_pending());
        let mut cold = Box::pin(run(&pool, "local", async {
            panic!("third scan must not start");
            #[allow(unreachable_code)]
            Ok(summary())
        }));
        assert!(futures_util::poll!(&mut cold).is_pending());
        drop(owner); // Blocking owner remains leased until its publication finishes.
        release.notify_one();
        assert_eq!(force.await.unwrap().calls_written, 144);
        assert_eq!(cold.await.unwrap().calls_written, 144);
        assert_eq!(count.load(Ordering::SeqCst), 1);
        assert_eq!(
            run(&pool, "local", async { Ok(summary()) })
                .await
                .unwrap()
                .scanned_at_ms,
            10
        );
    }

    #[tokio::test]
    async fn usage_scan_flight_allows_distinct_targets_and_releases_after_failure_and_panic() {
        let pool = crate::test_support::mem_pool().await;
        let entered = Arc::new(Notify::new());
        let release = Arc::new(Notify::new());
        let (e, r) = (entered.clone(), release.clone());
        let mut a = Box::pin(run(&pool, "ssh-a", async move {
            e.notify_one();
            r.notified().await;
            Ok(summary())
        }));
        assert!(futures_util::poll!(&mut a).is_pending());
        entered.notified().await;
        let (e, r) = (entered.clone(), release.clone());
        let mut b = Box::pin(run(&pool, "wsl-b", async move {
            e.notify_one();
            r.notified().await;
            Ok(summary())
        }));
        assert!(futures_util::poll!(&mut b).is_pending());
        entered.notified().await;
        release.notify_waiters();
        assert!(a.await.is_ok());
        assert!(b.await.is_ok());
        assert!(run(&pool, "ssh-a", async {
            Err(UsageError::Parse("fixture".into()))
        })
        .await
        .is_err());
        assert!(run(&pool, "ssh-a", async {
            panic!("fixture panic");
            #[allow(unreachable_code)]
            Ok(summary())
        })
        .await
        .is_err());
        assert!(run(&pool, "ssh-a", async { Ok(summary()) }).await.is_ok());
    }
}
