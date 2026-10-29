import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import {
  captureExternalChangeBaseline,
  resetExternalChangeWatcherForTests,
  scheduleExternalChangeRefresh,
} from "@/stores/externalChangeWatcher";
import { usePlatformStore } from "@/stores/platformStore";
import { useProjectsStore } from "@/stores/projectsStore";
import { useTagGroupsStore } from "@/stores/tagGroupsStore";
import { ipcInvokeCalls, mockIpcCommand } from "@/test/support/ipcMock";

const loadCentralSkills = vi.fn(async () => undefined);
const loadProjects = vi.fn(async () => undefined);
const loadTagGroups = vi.fn(async () => undefined);

describe("externalChangeWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetExternalChangeWatcherForTests();
    loadCentralSkills.mockReset().mockResolvedValue(undefined);
    loadProjects.mockReset().mockResolvedValue(undefined);
    loadTagGroups.mockReset().mockResolvedValue(undefined);
    useCentralSkillsStore.setState({ loadCentralSkills });
    useProjectsStore.setState({ loadProjects });
    useTagGroupsStore.setState({ loadTagGroups });
  });

  afterEach(() => {
    resetExternalChangeWatcherForTests();
    vi.useRealTimers();
  });

  async function flushDebounce(): Promise<void> {
    await vi.advanceTimersByTimeAsync(300);
  }

  it("does not refresh when the marker is unchanged", async () => {
    mockIpcCommand("get_data_change_marker", 4);
    const refreshScan = vi.spyOn(
      usePlatformStore.getState(),
      "refreshScanInBackground",
    );

    scheduleExternalChangeRefresh();
    await flushDebounce();
    scheduleExternalChangeRefresh();
    await flushDebounce();

    expect(ipcInvokeCalls("get_data_change_marker")).toHaveLength(2);
    expect(loadCentralSkills).not.toHaveBeenCalled();
    expect(loadProjects).not.toHaveBeenCalled();
    expect(loadTagGroups).not.toHaveBeenCalled();
    expect(refreshScan).not.toHaveBeenCalled();
    refreshScan.mockRestore();
  });

  it("refreshes after the mount baseline when a later focus sees a new marker", async () => {
    let marker = 3;
    mockIpcCommand("get_data_change_marker", () => marker);

    captureExternalChangeBaseline();
    await vi.advanceTimersByTimeAsync(0);
    expect(loadCentralSkills).not.toHaveBeenCalled();

    marker = 8;
    scheduleExternalChangeRefresh();
    await flushDebounce();

    expect(loadCentralSkills).toHaveBeenCalledTimes(1);
    expect(loadProjects).toHaveBeenCalledTimes(1);
    expect(loadTagGroups).toHaveBeenCalledTimes(1);
  });

  it("refreshes central skills, projects, and tag groups when the marker changes", async () => {
    let marker = 4;
    mockIpcCommand("get_data_change_marker", () => marker);
    const refreshScan = vi.spyOn(
      usePlatformStore.getState(),
      "refreshScanInBackground",
    );

    scheduleExternalChangeRefresh();
    await flushDebounce();
    marker = 9;
    scheduleExternalChangeRefresh();
    await flushDebounce();

    expect(loadCentralSkills).toHaveBeenCalledTimes(1);
    expect(loadCentralSkills).toHaveBeenCalledWith();
    expect(loadProjects).toHaveBeenCalledTimes(1);
    expect(loadTagGroups).toHaveBeenCalledTimes(1);
    expect(refreshScan).not.toHaveBeenCalled();
    refreshScan.mockRestore();
  });

  it("coalesces several focus events inside the debounce window into one refresh", async () => {
    let marker = 1;
    mockIpcCommand("get_data_change_marker", () => marker);

    scheduleExternalChangeRefresh();
    await flushDebounce();
    marker = 2;
    scheduleExternalChangeRefresh();
    await vi.advanceTimersByTimeAsync(100);
    scheduleExternalChangeRefresh();
    await vi.advanceTimersByTimeAsync(100);
    scheduleExternalChangeRefresh();
    await vi.advanceTimersByTimeAsync(299);

    expect(loadCentralSkills).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(ipcInvokeCalls("get_data_change_marker")).toHaveLength(2);
    expect(loadCentralSkills).toHaveBeenCalledTimes(1);
    expect(loadProjects).toHaveBeenCalledTimes(1);
    expect(loadTagGroups).toHaveBeenCalledTimes(1);
  });

  it("does not refresh when the marker read fails", async () => {
    mockIpcCommand("get_data_change_marker", () => {
      throw new Error("database busy");
    });

    scheduleExternalChangeRefresh();
    await flushDebounce();

    expect(loadCentralSkills).not.toHaveBeenCalled();
    expect(loadProjects).not.toHaveBeenCalled();
    expect(loadTagGroups).not.toHaveBeenCalled();
  });
});
