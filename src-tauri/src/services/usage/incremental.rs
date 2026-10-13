//! Read-only local observation; publication belongs to one repository transaction.
use super::{delta::FileManifest, ProviderFileCache, Scope, UsageError, UsageProvider};
use crate::db::repos::usage_delta_repo;
use crate::db::DbPool;

pub(super) async fn collect_local_plan(
    pool: &DbPool,
    target: &str,
    provider: &dyn UsageProvider,
    scope: &Scope,
    rebuild: bool,
) -> Result<FileManifest, UsageError> {
    let rows = if rebuild {
        Vec::new()
    } else {
        usage_delta_repo::list_file_fingerprints(pool, target, provider.id()).await?
    };
    let cache = ProviderFileCache::fingerprints(rows);
    let (cache, _) = provider.collect_incremental(scope, cache).await?;
    Ok(cache.into_manifest())
}
