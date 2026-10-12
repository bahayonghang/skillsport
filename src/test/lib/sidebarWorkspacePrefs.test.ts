import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SIDEBAR_WORKSPACE_SECTIONS,
  readSidebarWorkspaceSections,
  SIDEBAR_WORKSPACE_SECTIONS_KEY,
  writeSidebarWorkspaceSections,
} from "@/lib/sidebarWorkspacePrefs";

function memoryStorage(initial = ""): Storage {
  const values = new Map<string, string>();
  if (initial) {
    values.set(SIDEBAR_WORKSPACE_SECTIONS_KEY, initial);
  }
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
    key: () => null,
    length: values.size,
  };
}

describe("sidebarWorkspacePrefs", () => {
  beforeEach(() => {
    window.localStorage.removeItem(SIDEBAR_WORKSPACE_SECTIONS_KEY);
  });

  it("returns defaults when storage is empty", () => {
    expect(readSidebarWorkspaceSections(memoryStorage())).toEqual(
      DEFAULT_SIDEBAR_WORKSPACE_SECTIONS,
    );
  });

  it("returns defaults for invalid JSON and unknown sort keys", () => {
    expect(readSidebarWorkspaceSections(memoryStorage("{"))).toEqual(
      DEFAULT_SIDEBAR_WORKSPACE_SECTIONS,
    );
    expect(
      readSidebarWorkspaceSections(
        memoryStorage(JSON.stringify({ projectSort: "drag", globalWorkspace: "yes" })),
      ),
    ).toEqual(DEFAULT_SIDEBAR_WORKSPACE_SECTIONS);
  });

  it("keeps valid fields and fills the rest from defaults", () => {
    expect(
      readSidebarWorkspaceSections(
        memoryStorage(JSON.stringify({ projectWorkspace: false, projectSort: "recent" })),
      ),
    ).toEqual({
      globalWorkspace: true,
      projectWorkspace: false,
      projectSort: "recent",
    });
  });

  it("writes the section state", () => {
    const storage = memoryStorage();
    const next = {
      globalWorkspace: false,
      projectWorkspace: true,
      projectSort: "skillCount" as const,
    };

    writeSidebarWorkspaceSections(next, storage);

    expect(readSidebarWorkspaceSections(storage)).toEqual(next);
  });
});
