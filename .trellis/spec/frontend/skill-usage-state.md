# Skill Usage 状态与交互契约

## 1. Scope / Trigger

修改 `/usage`、`usageStore`、usage fixtures、排序/热力图/详情组件时阅读。
目标是让所有可见面板始终来自同一 target/source，并让未匹配技能仍可查看统计。

## 2. Signatures

```ts
type UsageSkillMatchStatus = "matched" | "ambiguous" | "unmatched";
type UsageMatchFilter = "all" | "installed" | "unlinked";

type UnusedPlatformInstall = {
  agentId: string;
  rowId: string | null;
  skillId: string;
  linkType: string;
  sourceKind: string | null;
  isReadOnly: boolean;
  installedPath: string;
  hasPendingRecovery: boolean;
};

type SkillUsageSummary = {
  skill: string;
  count: number;
  projects: number;
  sessions: number;
  lastUsedMs: number;
  matchStatus: UsageSkillMatchStatus;
  resolvedSkillId: string | null;
  staticTokenEstimate: number | null;
  staticByteCount: number | null;
};

invoke("usage_get_page", { source }); // one read generation: { overview, recent, providers }
invoke("usage_refresh", { force, source }); // page payload uses the same selected source
invoke("usage_get_skill_detail", { skill, source });
invoke("uninstall_skill_from_agent", { skillId, agentId, rowId? });

// usageStore.unlinkUnusedSkillFromAgents — sequential batch over the same command
type UnusedUnlinkRequest = { skillId: string; agentId: string; rowId?: string | null };
type UnusedUnlinkResult = { skillId: string; agentId: string; rowId: string | null; ok: boolean; error: string | null };
```

`usageStore` owns `selectedSource`, `selectedSkill`, `usedCachedData`,
`refreshError`, `loading`, `refreshing`, and `detailLoading`.

## 3. Contracts

- Components never call `invoke`; use typed `@/lib/ipc` only inside the store.
- Platform list sort/rank uses `useSkillUsageStats` (`usage_get_skill_usage_stats`,
  `days: null`). Do not subscribe `PlatformView` to `usageStore` source/skeleton
  state. The 30-day card badge stays on `useSkillCallCounts(..., 30)`.
- Source selection reads `usage_get_page` and commits overview, complete ranking,
  recent, providers and `overview.lastScanMs` in one `set`. Keep the previous
  source/data visible until that snapshot succeeds. A missing/zero-call source
  requires a second All snapshot; never relabel a filtered payload as All.
- The retained page stays interactive while a new source is pending. At source
  commit, invalidate detail requests again and clear any detail opened from the
  retained source, including already-resolved detail and its loading state.
- Page, refresh, and detail requests each have a sequence. A response commits only
  when sequence, active target id, source, and selected skill still match.
- The unused-skills slice (`unused`, `refreshUnused`) has its own sequence and
  fetches once per refresh at the strictest threshold (30d); the 30/60/90 chips,
  status filter, and sort are view-local reclassification on `callCount` +
  `lastUsedMs` and must not enter the store or change backend requests.
- A local-target refresh may return a stale cached page with `scanning: true`
  (exposed as `backgroundScanning`). When `usage://scan-completed` arrives with
  the active target id, the store silently refetches one page snapshot, then unused
  through the existing sequence guards: provider health and freshness update with
  the facts panels, no skeleton, no `loading`/`refreshing` flip, no toast, and
  failures are swallowed until the next explicit refresh. An in-progress source
  intent survives the background event; its older request cannot override this
  replacement read or leave `loading` stuck.
- `overview === null` is the first-load authority even before the bootstrap effect
  sets `refreshing`. Render the final-layout scanning skeleton and withhold numeric
  KPI output until an overview exists or a page-level error is available.
- Target changes invalidate all request sequences and immediately reset
  `overview`, `recent`, `providers`, `loading`, detail state, the unused slice,
  and source selection before starting a forced refresh. Never leave an old
  source request loading or render panels from the previous target during the
  rescan.
- Refresh requests the current source and publishes that complete filtered page.
  If source selection or a background read overtakes refresh, retain the current
  page and refetch the latest intended source rather than republishing the delayed
  payload. Recheck target/refresh sequence after the awaited read before triggering
  unused reads or cached-data notifications. Detail success and failure use the
  same target/source/sequence/selected-skill guards.
- Ranking install-state filtering is view-local: `installed` keeps only `matched`,
  while `unlinked` keeps `ambiguous` plus `unmatched`. It must not enter the store,
  change backend requests, or filter the recent-calls feed.
- Ranking filter/sort operate on the complete array. Above 60 visible results,
  use the shared `VirtualizedList` inside a real `26rem` scroll viewport with the
  existing overscan; retain at most one extra focused/detail-origin row. The list
  uses `ul/li` with `aria-posinset`/`aria-setsize`; legacy consumers keep the
  default `div` structure, spacing, overscan and viewport behavior.
- Fixed ranking row heights subscribe to the applied font scale. Full/narrow
  column layout follows the card's container width through one ResizeObserver;
  row height is `ceil(max(40, (full ? 40 : 58) * scale) + 1)`. Do not measure or
  observe every row, and do not infer scale from DOM/computed styles.
- The virtual ranking has one active row in the Tab path plus its separate open
  action. ArrowUp/Down and Home/End reveal and focus results across the whole set;
  Tab/Shift+Tab traverse every result/action and exit at the boundaries. Keep the
  focused row mounted during pointer scrolling. Detail close resolves its origin
  by skill at the current sort index, reveals it and restores focus; if filtering
  removes it, focus the ranking group. Recent sections use a stable key across
  their detail-dependent positions so a recent trigger survives the move.
- Match status remains readable without color. Pair translated status text with
  semantic `statusTone` dots for matched/success and ambiguous/warning; unmatched
  uses the neutral muted token.
- Selecting any ranking/recent row opens inline statistics. Only rows with a
  returned `resolvedSkillId` render a separate open-skill action; never invoke a
  resolver on click.
- Recent preserves identical-call multiplicity: React keys combine the five fact
  fields with an ordinal within that identical group. Do not deduplicate calls or
  use only skill/time/session as the key; adding a new call must not duplicate rows
  or replace otherwise-stable detail triggers.
- Project paths display only their basename. Prompt text, assistant responses,
  tool arguments, credentials, and full paths are not rendered.
- Fixed ranges are visible in UI: all history, last 16 weeks, and latest 20.
  Provider health stays in a secondary disclosure.
- Heatmap cells use a fixed track size (`size-*` + `auto-cols-[…rem]`). Do not
  pair `aspect-square` with `1fr` / `auto-cols-fr`: cell height must not follow
  container width. The `xl` two-column page must not use `row-span` to bind the
  Top skills card height to the heatmap. Top skills and heatmap cards use
  `contain-layout`; Unused does not (unlink dialog + hit-area).
- The default heatmap uses fixed `1rem` tracks; inline detail keeps the fixed
  `0.625rem` compact variant. Weekday axis, month week spans, and legend share
  an intrinsic-width plot. Single-week residual month labels are omitted without
  dropping any dates. The desktop side rail is bounded at `24rem`; ranking,
  unused, and detail columns respond to their own card width, not viewport width.
- Page KPIs live in the header summary alongside target and freshness controls;
  initial-load metric placeholders reserve the same geometry without numeric zero.
  Platform/ranking/unused filters share `UsageFilterControls` and `aria-pressed`;
  ordinary controls reserve non-overlapping hit areas of at least 40 CSS pixels
  at every supported font scale. Heatmap cells retain the dense-chart exception.
- Page `error` remains visible with a cached overview (including failed source
  loads). A failed detail replaces its skeleton with an inline error; pending and
  failed details both keep the close action and restore focus to the triggering row.
- Usage controls that override shared Button variants must override matching
  responsive/dark variants too: preserve the desktop minimum target width and the
  selected fill on dark hover. Provider disclosure and interactive provider rows
  retain the same 40px minimum target height and keyboard focus path.
- Browser fixtures run the real store and include matched, ambiguous, unmatched,
  missing static metrics, filtered sources, and non-empty heatmap data.
- `usageStore.unlinkUnusedSkillFromAgents` owns typed IPC for the whole batch: sequential
  invokes (backend mutation lock serializes anyway; N is agent-count small), per-target pending
  keys via `unlinkActionKey` cleared in `finally`, exactly one `refreshUnused()` after the batch,
  a success/partial-failure summary toast, and per-target results returned to the caller.
  Components receive the action as a prop and never invoke directly.
- Unlink entry is one far-right icon trigger per row opening `UnusedSkillUnlinkDialog`; no inline
  or second-row confirm buttons. `unusedUnlinkTargets.ts` normalizes both origins into
  `UnlinkTarget[]`: central entries map `entry.agents` (rowId always null), platform entries map
  the full cross-agent `entry.installs` (not just the section agent).
- Disabled reasons are per option: pending recovery, `central`/native shared-root (central
  origin), read-only / `sourceKind !== "user"` / null row id (platform origin). Listing every
  observation replaces the old "prefer one actionable install" pick — a same-agent user+plugin
  pair renders as two options where the plugin one is disabled, so reachability never depends on
  insertion order.
- Dialog selection: nothing preselected; select-all touches only enabled targets; the destructive
  confirm shows the selected count and stays disabled below one or while busy. On partial failure
  the dialog stays open, failed rows show their formatted reason and become the reselected set.
  Central-origin descriptions state that only Agent copies are removed and Central remains. The
  row open/unlink actions keep independent visible 40px button slots and a
  keyboard-visible focus path, including the root font scale minimum.

## 4. Validation & Error Matrix

| Condition | Required UI state |
| --- | --- |
| first load | stable final-layout skeleton |
| bootstrap effect has not started yet | skeleton, never a one-frame zero KPI strip |
| target changes while source load is pending | clear target-scoped panels, reset `loading`, force refresh |
| source request fails | keep previous selected source and page; show recoverable error |
| refresh fails with cache | keep page; set `usedCachedData`; show freshness warning |
| refresh fails without cache | page-level error with retry action |
| target/source changes during detail load | discard stale detail result |
| source commits after opening a retained-page detail | invalidate and clear old-source detail, no stuck loading |
| target changes before a stale detail rejection arrives | discard the error as well as successful data |
| pending detail | close remains reachable and restores triggering-row focus |
| detail request fails | inline error, no perpetual skeleton, reachable close action |
| ambiguous/unmatched row | inline detail works; no open-skill button |
| installed/unlinked ranking filter | filter only ranking rows; show filtered/total count and a distinct empty state |
| 10k ranking results | bounded mounted rows, full count/sort/filter, first and last reachable |
| detail origin moves or leaves the virtual window | restore its current position/focus; filtered origin falls back to ranking group |
| recent trigger opens pending/failed detail | trigger stays mounted and regains focus on close |
| static estimate `null` | explicit unavailable state, never numeric zero |
| unlink target rejects | inline row reason in dialog + summary toast; that target's pending key clears |
| batch partially fails | dialog stays open, failed rows show reason and are reselected; one refresh after the batch |
| same agent has user + plugin observations | two dialog options; user one actionable, plugin one disabled with reason |
| only read-only/plugin observation remains | disabled dialog option with translated reason |

## 5. Good / Base / Bad Cases

- Good: a rapid Claude -> Codex switch finishes out of order; only Codex overview
  and recent commit, and old Claude detail is discarded.
- Good: a target switch during a pending source request immediately shows the
  scanning skeleton; the stale request cannot keep `loading` true or republish data.
- Base: an unmatched historical call still opens its project/activity detail.
- Base: selecting `unlinked` shows ambiguous and unmatched ranking rows while
  recent calls remain unchanged.
- Good: Codex has user and plugin copies of one skill; the dialog lists both — the user
  observation is selectable with its exact `rowId`, the plugin one is disabled with a reason.
- Bad: feed the dialog only the section agent's installs, or preselect all targets so a single
  misclick unlinks every agent at once.
- Bad: publish `selectedSource = Codex` while the visible overview is still
  Claude, or resolve a Central id lazily when the row is clicked.

## 6. Tests Required

- Store: rapid A->B source completion, target change, filtered refresh, cached
  failure, detail source args, stale detail, atomic overview/recent commit, and
  target-change clearing of page data plus `loading`; 51/144/1k complete rankings
  on entry/TTL/force/source/background paths, atomic provider/freshness updates,
  disappearing-source All fallback, pending source/background handoff, source
  commit after a retained-page detail, and stale target errors/notifications.
- Components: three match states, explicit sort controls, row keyboard behavior,
  separate open action, basename-only projects, detail close/focus return,
  pre-refresh skeleton, install-state filters/counts, and filtered empty state;
  10k bounded DOM, scale/column row geometry, first/last and bidirectional Tab,
  off-window focus pinning, reordered/filtered origin restoration and recent
  pending/failed-detail trigger identity. Shared virtualizer default consumers
  retain their previous viewport/spacing/overscan behavior.
- Heatmap: 112 cells, quantile top level, numeric aria labels, roving arrow focus,
  month labels, legend, and empty state.
- Browser: 1440x900 and 1280x720 dark, 1024x768 light, narrow desktop, Chinese
  and English, with page `scrollWidth === clientWidth` and no console errors.
- Unused unlink: dialog open/target normalization (central full agents, platform cross-agent),
  disabled reasons, select-all excluding disabled, confirm args/count gating, per-target pending
  lifecycle, single post-batch refresh, partial-failure reselect, formatted failure toast, and
  the 40px hit-area trigger.

## 7. Wrong vs Correct

```tsx
// Wrong: component makes a second request and guesses navigation on click.
const id = await invoke("usage_resolve_skill_id", { skillName: row.skill });

// Correct: select statistics; use backend-provided identity for explicit action.
<button onClick={() => loadDetail(row.skill)}>{row.skill}</button>
{row.resolvedSkillId && <OpenSkillButton id={row.resolvedSkillId} />}
```
