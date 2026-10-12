import { describe, expect, it } from "vitest";

import { sortSidebarProjects } from "@/lib/sidebarProjectOrder";
import type { Project } from "@/types";

function project(overrides: Partial<Project> & Pick<Project, "id" | "name">): Project {
  return {
    path: `D:/work/${overrides.name}`,
    pinned: false,
    addedAt: "2026-01-01T00:00:00Z",
    lastScannedAt: null,
    skillCount: 0,
    ...overrides,
  };
}

const alpha = project({
  id: "alpha",
  name: "Alpha",
  skillCount: 1,
  addedAt: "2026-01-02T00:00:00Z",
});
const bravo = project({
  id: "bravo",
  name: "Bravo",
  skillCount: 9,
  pinned: true,
  addedAt: "2026-01-01T00:00:00Z",
  lastScannedAt: "2026-03-01T00:00:00Z",
});
const coda = project({
  id: "coda",
  name: "Coda",
  skillCount: 9,
  addedAt: "2026-04-01T00:00:00Z",
  lastScannedAt: "2026-02-01T00:00:00Z",
});

describe("sortSidebarProjects", () => {
  it("sorts pinned projects first, then by name", () => {
    expect(sortSidebarProjects([coda, alpha, bravo], "name").map((item) => item.id)).toEqual([
      "bravo",
      "alpha",
      "coda",
    ]);
  });

  it("sorts by skill count descending after pin, then by name", () => {
    const unpinned = project({
      id: "delta",
      name: "Delta",
      skillCount: 9,
    });
    expect(
      sortSidebarProjects([alpha, coda, unpinned, bravo], "skillCount").map((item) => item.id),
    ).toEqual(["bravo", "coda", "delta", "alpha"]);
  });

  it("puts unscanned projects after scanned ones when sorting by recent scan", () => {
    expect(sortSidebarProjects([alpha, coda, bravo], "recent").map((item) => item.id)).toEqual([
      "bravo",
      "coda",
      "alpha",
    ]);
  });

  it("uses added time when neither project has been scanned", () => {
    const older = project({ id: "older", name: "Older", addedAt: "2026-01-01T00:00:00Z" });
    const newer = project({ id: "newer", name: "Newer", addedAt: "2026-05-01T00:00:00Z" });

    expect(sortSidebarProjects([older, newer], "recent").map((item) => item.id)).toEqual([
      "newer",
      "older",
    ]);
  });
});
