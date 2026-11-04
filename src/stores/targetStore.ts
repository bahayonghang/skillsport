import { create } from "zustand";
import { invoke } from "@/lib/ipc";
import { backendErrorStateValue } from "@/lib/backendError";
import { isSshTarget } from "@/lib/targetKind";
import {
  type SshReachability,
  sshLibraryIsLive,
} from "@/lib/sshLibraryGate";
import {
  CreateSshTargetRequest,
  CreateWslTargetRequest,
  SshTargetTestResult,
  TargetConfigQuarantineStatus,
  TargetSummary,
  TestSshTargetRequest,
  TestWslTargetRequest,
  UpdateSshTargetRequest,
  UpdateWslTargetRequest,
  WslDistributionSummary,
  WslTargetTestResult,
} from "@/types";

export type { SshReachability };

const LOCAL_TARGET: TargetSummary = {
  id: "local",
  kind: "local",
  label: "Local",
  isActive: true,
};

interface TargetState {
  targets: TargetSummary[];
  activeTarget: TargetSummary;
  quarantineStatus: TargetConfigQuarantineStatus | null;
  quarantineStatusError: string | null;
  wslDistributions: WslDistributionSummary[];
  isLoading: boolean;
  isLoadingWslDistributions: boolean;
  isCreating: boolean;
  updatingTargetId: string | null;
  testingTargetId: string | null;
  updatingPasswordTargetId: string | null;
  switchingTargetId: string | null;
  deletingTargetId: string | null;
  requiresTargetReload: boolean;
  error: string | null;
  wslDistributionError: string | null;
  /** False until the first `loadTargets` settles. The placeholder local target is not proof of a local library. */
  targetsResolved: boolean;
  sshReachability: SshReachability;
  sshProbeSerial: number;

  loadTargets: () => Promise<void>;
  loadWslDistributions: () => Promise<void>;
  createSshTarget: (request: CreateSshTargetRequest) => Promise<TargetSummary>;
  updateSshTarget: (request: UpdateSshTargetRequest) => Promise<TargetSummary>;
  testSshTarget: (
    request: TestSshTargetRequest,
  ) => Promise<SshTargetTestResult>;
  createWslTarget: (request: CreateWslTargetRequest) => Promise<TargetSummary>;
  updateWslTarget: (request: UpdateWslTargetRequest) => Promise<TargetSummary>;
  testWslTarget: (
    request: TestWslTargetRequest,
  ) => Promise<WslTargetTestResult>;
  updateSshTargetPassword: (
    targetId: string,
    password: string,
  ) => Promise<SshTargetTestResult>;
  deleteTarget: (targetId: string) => Promise<void>;
  switchTarget: (targetId: string) => Promise<TargetSummary>;
  verifyActiveSshTarget: () => Promise<boolean>;
  clearError: () => void;
}

function sameSshEndpoint(left: TargetSummary, right: TargetSummary): boolean {
  return (
    isSshTarget(left) &&
    isSshTarget(right) &&
    left.id === right.id &&
    (left.host ?? "") === (right.host ?? "") &&
    (left.port ?? 22) === (right.port ?? 22) &&
    (left.username ?? "") === (right.username ?? "")
  );
}

function publicProbeMessage(message: string | null | undefined): string {
  const trimmed = message?.trim() ?? "";
  return trimmed || "SSH connection is unavailable.";
}

function sshProbeRequest(targetId: string): TestSshTargetRequest {
  return { id: targetId };
}

function resolveActiveTarget(targets: TargetSummary[]): TargetSummary {
  return (
    targets.find((target) => target.isActive) ?? targets[0] ?? LOCAL_TARGET
  );
}

function markActive(
  targets: TargetSummary[],
  targetId: string,
): TargetSummary[] {
  return targets.map((target) => ({
    ...target,
    isActive: target.id === targetId,
  }));
}

async function refreshTargetsAfterMutation(
  loadTargets: () => Promise<void>,
  markReloadRequired: () => void,
): Promise<void> {
  try {
    await loadTargets();
  } catch {
    markReloadRequired();
  }
}

export const useTargetStore = create<TargetState>((set, get) => ({
  targets: [LOCAL_TARGET],
  activeTarget: LOCAL_TARGET,
  quarantineStatus: null,
  quarantineStatusError: null,
  wslDistributions: [],
  isLoading: false,
  isLoadingWslDistributions: false,
  isCreating: false,
  updatingTargetId: null,
  testingTargetId: null,
  updatingPasswordTargetId: null,
  switchingTargetId: null,
  deletingTargetId: null,
  requiresTargetReload: false,
  error: null,
  wslDistributionError: null,
  targetsResolved: false,
  sshReachability: { phase: "idle" },
  sshProbeSerial: 0,

  loadTargets: async () => {
    set({ isLoading: true, error: null, quarantineStatusError: null });
    const [targetsResult, quarantineResult] = await Promise.allSettled([
      invoke("list_targets"),
      invoke("get_target_config_quarantine_status"),
    ]);

    if (targetsResult.status === "rejected") {
      set({
        error: String(targetsResult.reason),
        quarantineStatus:
          quarantineResult.status === "fulfilled"
            ? quarantineResult.value
            : get().quarantineStatus,
        quarantineStatusError:
          quarantineResult.status === "rejected"
            ? String(quarantineResult.reason)
            : null,
        targetsResolved: true,
        isLoading: false,
      });
      throw targetsResult.reason;
    }

    const targets = targetsResult.value ?? [LOCAL_TARGET];
    const activeTarget = resolveActiveTarget(targets);
    const previous = get();
    const keepReachable =
      sameSshEndpoint(previous.activeTarget, activeTarget) &&
      previous.sshReachability.phase === "reachable" &&
      previous.sshReachability.targetId === activeTarget.id;
    const probeActive = isSshTarget(activeTarget) && !keepReachable;
    const sshProbeSerial = probeActive
      ? previous.sshProbeSerial + 1
      : previous.sshProbeSerial;
    const sshReachability: SshReachability = !isSshTarget(activeTarget)
      ? { phase: "idle" }
      : keepReachable
        ? previous.sshReachability
        : { phase: "checking", targetId: activeTarget.id };
    set({
      targets,
      activeTarget,
      sshReachability,
      sshProbeSerial,
      targetsResolved: true,
      quarantineStatus:
        quarantineResult.status === "fulfilled"
          ? quarantineResult.value
          : previous.quarantineStatus,
      quarantineStatusError:
        quarantineResult.status === "rejected"
          ? String(quarantineResult.reason)
          : null,
      isLoading: false,
      requiresTargetReload: false,
    });
    if (probeActive) {
      void probeActiveSsh(get, set, activeTarget.id, sshProbeSerial);
    }
  },

  loadWslDistributions: async () => {
    set({ isLoadingWslDistributions: true, wslDistributionError: null });
    try {
      const distributions = await invoke("list_wsl_distributions");
      set({
        wslDistributions: distributions ?? [],
        isLoadingWslDistributions: false,
      });
    } catch (err) {
      set({
        wslDistributionError: String(err),
        isLoadingWslDistributions: false,
      });
      throw err;
    }
  },

  createSshTarget: async (request) => {
    set({ isCreating: true, error: null });
    try {
      const target = await invoke("create_ssh_target", {
        request,
      });
      set((state) => ({
        targets: [
          ...state.targets.filter((item) => item.id !== target.id),
          target,
        ],
        activeTarget: resolveActiveTarget([
          ...state.targets.filter((item) => item.id !== target.id),
          target,
        ]),
        isCreating: false,
      }));
      await refreshTargetsAfterMutation(get().loadTargets, () =>
        set({ requiresTargetReload: true }),
      );
      return target;
    } catch (err) {
      set({ error: String(err), isCreating: false });
      throw err;
    }
  },

  updateSshTarget: async (request) => {
    set({ updatingTargetId: request.id, error: null });
    try {
      const target = await invoke("update_ssh_target", {
        request,
      });
      await refreshTargetsAfterMutation(get().loadTargets, () =>
        set({ requiresTargetReload: true }),
      );
      return target;
    } catch (err) {
      set({ error: String(err) });
      throw err;
    } finally {
      set({ updatingTargetId: null });
    }
  },

  testSshTarget: async (request) => {
    const testingTargetId = request.id ?? "new";
    set({ testingTargetId, error: null });
    try {
      return await invoke("test_ssh_target", { request });
    } catch (err) {
      set({ error: String(err) });
      throw err;
    } finally {
      set({ testingTargetId: null });
    }
  },

  createWslTarget: async (request) => {
    set({ isCreating: true, error: null });
    try {
      const target = await invoke("create_wsl_target", {
        request,
      });
      set((state) => ({
        targets: [
          ...state.targets.filter((item) => item.id !== target.id),
          target,
        ],
        activeTarget: resolveActiveTarget([
          ...state.targets.filter((item) => item.id !== target.id),
          target,
        ]),
        isCreating: false,
      }));
      await refreshTargetsAfterMutation(get().loadTargets, () =>
        set({ requiresTargetReload: true }),
      );
      return target;
    } catch (err) {
      set({ error: String(err), isCreating: false });
      throw err;
    }
  },

  updateWslTarget: async (request) => {
    set({ updatingTargetId: request.id, error: null });
    try {
      const target = await invoke("update_wsl_target", {
        request,
      });
      await refreshTargetsAfterMutation(get().loadTargets, () =>
        set({ requiresTargetReload: true }),
      );
      return target;
    } catch (err) {
      set({ error: String(err) });
      throw err;
    } finally {
      set({ updatingTargetId: null });
    }
  },

  testWslTarget: async (request) => {
    const testingTargetId = request.id ?? "new-wsl";
    set({ testingTargetId, error: null });
    try {
      return await invoke("test_wsl_target", { request });
    } catch (err) {
      set({ error: String(err) });
      throw err;
    } finally {
      set({ testingTargetId: null });
    }
  },

  updateSshTargetPassword: async (targetId, password) => {
    set({ updatingPasswordTargetId: targetId, error: null });
    try {
      const result = await invoke("update_ssh_target_password", {
        targetId,
        password,
      });
      if (result.ok) {
        await refreshTargetsAfterMutation(get().loadTargets, () =>
          set({ requiresTargetReload: true }),
        );
      }
      return result;
    } catch (err) {
      set({ error: String(err) });
      throw err;
    } finally {
      set({ updatingPasswordTargetId: null });
    }
  },

  deleteTarget: async (targetId) => {
    set({ deletingTargetId: targetId, error: null });
    try {
      await invoke("delete_target", { targetId });
      await refreshTargetsAfterMutation(get().loadTargets, () =>
        set({ requiresTargetReload: true }),
      );
    } catch (err) {
      set({ error: String(err) });
      throw err;
    } finally {
      set({ deletingTargetId: null });
    }
  },

  switchTarget: async (targetId) => {
    const current = get();
    const candidate = current.targets.find((target) => target.id === targetId);
    if (candidate && candidate.id === current.activeTarget.id) {
      return current.activeTarget;
    }

    set({ switchingTargetId: targetId, error: null });
    try {
      if (!candidate || !isSshTarget(candidate)) {
        const activeTarget = await invoke("set_active_target", { targetId });
        set((state) => ({
          targets: markActive(state.targets, activeTarget.id),
          activeTarget,
          sshReachability: { phase: "idle" },
          sshProbeSerial: state.sshProbeSerial + 1,
          error: null,
        }));
        await refreshTargetsAfterMutation(get().loadTargets, () =>
          set({ requiresTargetReload: true }),
        );
        return activeTarget;
      }

      const result = await invoke("test_ssh_target", {
        request: sshProbeRequest(targetId),
      });
      if (!result?.ok) {
        const message = publicProbeMessage(result?.message);
        set({ error: message });
        throw new Error(message);
      }

      const activeTarget = await invoke("set_active_target", { targetId });
      set((state) => ({
        targets: markActive(state.targets, activeTarget.id),
        activeTarget,
        sshReachability: {
          phase: "reachable",
          targetId: activeTarget.id,
        },
        sshProbeSerial: state.sshProbeSerial + 1,
        error: null,
      }));
      await refreshTargetsAfterMutation(get().loadTargets, () =>
        set({ requiresTargetReload: true }),
      );
      return activeTarget;
    } catch (err) {
      if (get().error == null) {
        set({ error: backendErrorStateValue(err) });
      }
      throw err;
    } finally {
      set({ switchingTargetId: null });
    }
  },

  verifyActiveSshTarget: async () => {
    const active = get().activeTarget;
    if (!isSshTarget(active)) {
      set({ sshReachability: { phase: "idle" } });
      return true;
    }
    if (
      sshLibraryIsLive(
        active,
        get().sshReachability,
        get().targetsResolved,
      ) &&
      get().sshReachability.phase === "reachable"
    ) {
      return true;
    }
    const serial = get().sshProbeSerial + 1;
    set({
      sshProbeSerial: serial,
      sshReachability: { phase: "checking", targetId: active.id },
    });
    return probeActiveSsh(get, set, active.id, serial);
  },

  clearError: () => set({ error: null }),
}));

type TargetStoreGet = () => TargetState;
type TargetStoreSet = (
  partial:
    | Partial<TargetState>
    | ((state: TargetState) => Partial<TargetState>),
) => void;

async function probeActiveSsh(
  get: TargetStoreGet,
  set: TargetStoreSet,
  targetId: string,
  serial: number,
): Promise<boolean> {
  const stillCurrent = () => {
    const state = get();
    return (
      state.sshProbeSerial === serial &&
      isSshTarget(state.activeTarget) &&
      state.activeTarget.id === targetId
    );
  };

  try {
    const result = await invoke("test_ssh_target", {
      request: sshProbeRequest(targetId),
    });
    if (!stillCurrent()) return false;
    if (result?.ok) {
      set({ sshReachability: { phase: "reachable", targetId } });
      return true;
    }
    set({
      sshReachability: {
        phase: "unreachable",
        targetId,
        message: publicProbeMessage(result?.message),
      },
    });
    return false;
  } catch (err) {
    if (!stillCurrent()) return false;
    set({
      sshReachability: {
        phase: "unreachable",
        targetId,
        message: backendErrorStateValue(err),
      },
    });
    return false;
  }
}
