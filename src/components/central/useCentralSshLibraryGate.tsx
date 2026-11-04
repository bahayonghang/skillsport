import { useCallback } from "react";

import {
  CentralSshReachabilityPanel,
  SshUnreachableFlag,
} from "@/components/central/SshReachabilityStatus";
import {
  centralSshLibraryGate,
  type SshLibraryTarget,
} from "@/lib/sshLibraryGate";
import { usePlatformStore } from "@/stores/platformStore";
import { useTargetStore } from "@/stores/targetStore";

export function useCentralSshLibraryGate(
  activeTarget: SshLibraryTarget,
  loadCentralSkills: () => Promise<unknown>,
) {
  const sshReachability = useTargetStore((state) => state.sshReachability);
  const targetsResolved = useTargetStore((state) => state.targetsResolved);
  const verifyActiveSshTarget = useTargetStore(
    (state) => state.verifyActiveSshTarget,
  );
  const refreshCounts = usePlatformStore((state) => state.refreshCounts);
  const gate = centralSshLibraryGate(
    activeTarget,
    sshReachability,
    targetsResolved,
  );
  const unreachableMessage =
    sshReachability.phase === "unreachable" ? sshReachability.message : "";

  const retry = useCallback(async () => {
    const reachable = await verifyActiveSshTarget();
    if (!reachable) return;
    try {
      await loadCentralSkills();
    } catch {
      // List reload keeps its own store error.
    }
    try {
      await refreshCounts();
    } catch {
      // Sidebar counts refresh best-effort after the target is reachable.
    }
  }, [loadCentralSkills, refreshCounts, verifyActiveSshTarget]);

  const status =
    gate === "unreachable" ? (
      <SshUnreachableFlag message={unreachableMessage} />
    ) : undefined;
  const panel = gate ? (
    <CentralSshReachabilityPanel phase={gate} onRetry={() => void retry()} />
  ) : null;

  return { gate, status, panel };
}
