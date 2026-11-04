export type SshReachability =
  | { phase: "idle" }
  | { phase: "checking"; targetId: string }
  | { phase: "reachable"; targetId: string }
  | { phase: "unreachable"; targetId: string; message: string };

export type SshLibraryTarget = {
  id: string;
  kind: string;
};

/**
 * Cached Central skills may paint only after the target list is known, and
 * only for a reachable active SSH target or for local/WSL.
 * Before `loadTargets` resolves, the placeholder local target must not open
 * the gate: the backend may already be serving the active SSH cache.
 */
export function sshLibraryIsLive(
  activeTarget: SshLibraryTarget,
  reachability: SshReachability,
  targetsResolved = true,
): boolean {
  if (!targetsResolved) return false;
  if (activeTarget.kind !== "ssh") return true;
  return (
    reachability.phase === "reachable" &&
    reachability.targetId === activeTarget.id
  );
}

/** `null` means the live library may paint. Idle or a mismatched probe fails closed to checking. */
export function centralSshLibraryGate(
  activeTarget: SshLibraryTarget,
  reachability: SshReachability,
  targetsResolved = true,
): "pending" | "checking" | "unreachable" | null {
  if (!targetsResolved) return "pending";
  if (sshLibraryIsLive(activeTarget, reachability, true)) return null;
  if (
    reachability.phase === "unreachable" &&
    reachability.targetId === activeTarget.id
  ) {
    return "unreachable";
  }
  return "checking";
}
