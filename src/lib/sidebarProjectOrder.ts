import type { SidebarProjectSort } from "@/lib/sidebarWorkspacePrefs";
import type { Project } from "@/types";

function compareNames(left: Project, right: Project): number {
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
}

function scannedAt(project: Project): string | null {
  const value = project.lastScannedAt?.trim();
  return value ? value : null;
}

export function compareSidebarProjects(
  left: Project,
  right: Project,
  sort: SidebarProjectSort,
): number {
  if (left.pinned !== right.pinned) {
    return left.pinned ? -1 : 1;
  }

  switch (sort) {
    case "name":
      return compareNames(left, right);
    case "skillCount": {
      const byCount = right.skillCount - left.skillCount;
      return byCount !== 0 ? byCount : compareNames(left, right);
    }
    case "recent": {
      const leftScanned = scannedAt(left);
      const rightScanned = scannedAt(right);
      if (leftScanned && rightScanned && leftScanned !== rightScanned) {
        return rightScanned.localeCompare(leftScanned);
      }
      if (leftScanned && !rightScanned) {
        return -1;
      }
      if (!leftScanned && rightScanned) {
        return 1;
      }
      if (left.addedAt !== right.addedAt) {
        return right.addedAt.localeCompare(left.addedAt);
      }
      return compareNames(left, right);
    }
    default: {
      const exhaustive: never = sort;
      return exhaustive;
    }
  }
}

export function sortSidebarProjects(
  projects: readonly Project[],
  sort: SidebarProjectSort,
): Project[] {
  return [...projects].sort((left, right) =>
    compareSidebarProjects(left, right, sort),
  );
}
