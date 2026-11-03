import { invoke } from "@/lib/ipc";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import { useProjectsStore } from "@/stores/projectsStore";
import { useTagGroupsStore } from "@/stores/tagGroupsStore";

const DEBOUNCE_MS = 300;

let lastMarker: number | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let checkGeneration = 0;
let readChain: Promise<void> = Promise.resolve();

/**
 * Debounced focus/visibility refresh. A mount-time read records the baseline
 * and does not reload. Later reads reload only when the marker moves.
 * A failed marker read leaves the last marker and the current lists alone.
 */
export function captureExternalChangeBaseline(): void {
  enqueueMarkerRead(false);
}

export function scheduleExternalChangeRefresh(): void {
  if (timer !== null) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    timer = null;
    enqueueMarkerRead(true);
  }, DEBOUNCE_MS);
}

export function cancelScheduledExternalChangeRefresh(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  checkGeneration += 1;
}

export function resetExternalChangeWatcherForTests(): void {
  cancelScheduledExternalChangeRefresh();
  lastMarker = null;
  readChain = Promise.resolve();
}

function enqueueMarkerRead(refreshIfChanged: boolean): void {
  const generation = checkGeneration;
  readChain = readChain.catch(() => undefined).then(() => readMarker(refreshIfChanged, generation));
}

async function readMarker(refreshIfChanged: boolean, generation: number): Promise<void> {
  // `@/lib/ipc` already routes the browser demo to the fixture.
  if (generation !== checkGeneration) {
    return;
  }
  let marker: number;
  try {
    marker = await invoke("get_data_change_marker");
  } catch {
    return;
  }
  if (generation !== checkGeneration) {
    return;
  }
  if (typeof marker !== "number" || !Number.isFinite(marker)) {
    return;
  }
  const previous = lastMarker;
  lastMarker = marker;
  if (!refreshIfChanged || previous === null || marker === previous) {
    return;
  }
  await Promise.allSettled([
    useCentralSkillsStore.getState().loadCentralSkills(),
    useProjectsStore.getState().loadProjects(),
    useTagGroupsStore.getState().loadTagGroups(),
  ]);
}
