import { invoke } from "@/lib/ipc";

export interface InstalledFontCatalog {
  families: readonly string[];
  available: boolean;
}

let cache: InstalledFontCatalog | null = null;
let inflight: Promise<InstalledFontCatalog> | null = null;
let generation = 0;

function parseCatalog(value: unknown): InstalledFontCatalog {
  if (!value || typeof value !== "object") {
    return { families: [], available: false };
  }
  const record = value as { families?: unknown; available?: unknown };
  const families = Array.isArray(record.families)
    ? record.families.filter(
        (family): family is string =>
          typeof family === "string" && family.trim().length > 0,
      )
    : [];
  return {
    families,
    available: record.available !== false && Array.isArray(record.families),
  };
}

export function clearInstalledFontCache(): void {
  generation += 1;
  cache = null;
  inflight = null;
}

export function loadInstalledFontFamilies(
  force = false,
): Promise<InstalledFontCatalog> {
  if (force) {
    generation += 1;
    cache = null;
    inflight = null;
  }
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;

  const request = generation;
  const pending = invoke("list_installed_font_families")
    .then((value) => {
      const next = parseCatalog(value);
      if (request === generation) cache = next;
      return next;
    })
    .catch(() => {
      const next = { families: [], available: false };
      if (request === generation) cache = next;
      return next;
    })
    .finally(() => {
      if (request === generation) inflight = null;
    });
  inflight = pending;
  return pending;
}
