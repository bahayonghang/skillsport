import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ipc", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@/lib/ipc";
import type { InstalledFontList } from "@/lib/ipc/generatedCommandMap";
import {
  clearInstalledFontCache,
  loadInstalledFontFamilies,
} from "@/lib/systemFonts";

describe("loadInstalledFontFamilies", () => {
  beforeEach(() => {
    clearInstalledFontCache();
    vi.mocked(invoke).mockReset();
  });

  it("parses a catalog and reuses the session cache", async () => {
    vi.mocked(invoke).mockResolvedValue({
      families: ["Segoe UI", "", "Microsoft YaHei"],
      available: true,
    });

    const first = await loadInstalledFontFamilies();
    const second = await loadInstalledFontFamilies();

    expect(first).toEqual({
      families: ["Segoe UI", "Microsoft YaHei"],
      available: true,
    });
    expect(second).toBe(first);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("treats a null payload as unavailable", async () => {
    vi.mocked(invoke).mockResolvedValue(null);

    await expect(loadInstalledFontFamilies()).resolves.toEqual({
      families: [],
      available: false,
    });
  });

  it("keeps a newer refresh ahead of an older response", async () => {
    let resolveOld: (value: InstalledFontList) => void = () => {};
    vi.mocked(invoke)
      .mockImplementationOnce(
        () =>
          new Promise<InstalledFontList>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce({ families: ["Newer"], available: true });

    const older = loadInstalledFontFamilies();
    const newer = loadInstalledFontFamilies(true);
    resolveOld({ families: ["Older"], available: true });

    await expect(older).resolves.toEqual({
      families: ["Older"],
      available: true,
    });
    await expect(newer).resolves.toEqual({
      families: ["Newer"],
      available: true,
    });
    await expect(loadInstalledFontFamilies()).resolves.toEqual({
      families: ["Newer"],
      available: true,
    });
  });
});
