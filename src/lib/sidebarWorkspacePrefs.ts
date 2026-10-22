export const SIDEBAR_WORKSPACE_SECTIONS_KEY = "sidebar.workspaceSections.v1";

export type SidebarProjectSort = "name" | "skillCount" | "recent";

export interface SidebarWorkspaceSections {
  globalWorkspace: boolean;
  projectWorkspace: boolean;
  projectSort: SidebarProjectSort;
}

export const DEFAULT_SIDEBAR_WORKSPACE_SECTIONS: SidebarWorkspaceSections = {
  globalWorkspace: true,
  projectWorkspace: true,
  projectSort: "name",
};

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export function isSidebarProjectSort(value: unknown): value is SidebarProjectSort {
  return value === "name" || value === "skillCount" || value === "recent";
}

export function readSidebarWorkspaceSections(
  storage: Pick<StorageLike, "getItem"> | null = defaultStorage(),
): SidebarWorkspaceSections {
  if (!storage) {
    return DEFAULT_SIDEBAR_WORKSPACE_SECTIONS;
  }

  try {
    const raw = storage.getItem(SIDEBAR_WORKSPACE_SECTIONS_KEY);
    if (!raw) {
      return DEFAULT_SIDEBAR_WORKSPACE_SECTIONS;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_SIDEBAR_WORKSPACE_SECTIONS;
    }
    const record = parsed as Partial<SidebarWorkspaceSections>;
    return {
      globalWorkspace:
        typeof record.globalWorkspace === "boolean"
          ? record.globalWorkspace
          : DEFAULT_SIDEBAR_WORKSPACE_SECTIONS.globalWorkspace,
      projectWorkspace:
        typeof record.projectWorkspace === "boolean"
          ? record.projectWorkspace
          : DEFAULT_SIDEBAR_WORKSPACE_SECTIONS.projectWorkspace,
      projectSort: isSidebarProjectSort(record.projectSort)
        ? record.projectSort
        : DEFAULT_SIDEBAR_WORKSPACE_SECTIONS.projectSort,
    };
  } catch {
    return DEFAULT_SIDEBAR_WORKSPACE_SECTIONS;
  }
}

export function writeSidebarWorkspaceSections(
  value: SidebarWorkspaceSections,
  storage: Pick<StorageLike, "setItem"> | null = defaultStorage(),
): void {
  storage?.setItem(SIDEBAR_WORKSPACE_SECTIONS_KEY, JSON.stringify(value));
}

function defaultStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}
