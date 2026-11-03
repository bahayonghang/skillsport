/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type AlignmentHelpers = {
  collectTauriAlignmentIssues: (input: {
    packageJsonText: string;
    lockText: string;
    cargoLockText: string;
    installedVersions: Map<string, string | null>;
  }) => string[];
  directTauriPackages: (packageJsonText: string) => string[];
  readPnpmImporterVersions: (lockText: string) => Map<string, string>;
};

// @ts-expect-error The alignment check is an ESM Node script outside the TS source tree.
const { collectTauriAlignmentIssues, directTauriPackages, readPnpmImporterVersions } = (await import("../../../scripts/check/tauri-package-alignment.mjs")) as AlignmentHelpers;

const packageJsonText = JSON.stringify({
  dependencies: {
    "@tauri-apps/api": "^2.12.4",
    "@tauri-apps/plugin-updater": "^2.14.1",
  },
  devDependencies: {
    "@tauri-apps/cli": "^2.12.4",
  },
});

const lockText = `importers:

  .:
    dependencies:
      '@tauri-apps/api':
        specifier: ^2.12.4
        version: 2.12.4
      '@tauri-apps/plugin-updater':
        specifier: ^2.14.1
        version: 2.14.1
    devDependencies:
      '@tauri-apps/cli':
        specifier: ^2.12.4
        version: 2.12.4

  other:
    dependencies:
      '@tauri-apps/api':
        version: 2.0.0
`;

const cargoLockText = `[[package]]
name = "tauri"
version = "2.12.5"

[[package]]
name = "tauri-plugin-updater"
version = "2.14.1"
`;

function issuesFor(installed: Record<string, string | null>) {
  return collectTauriAlignmentIssues({
    packageJsonText,
    lockText,
    cargoLockText,
    installedVersions: new Map(Object.entries(installed)),
  });
}

describe("Tauri npm and Rust package alignment", () => {
  it("accepts the same major.minor, including a newer Rust patch", () => {
    expect(
      issuesFor({
        "@tauri-apps/api": "2.12.4",
        "@tauri-apps/cli": "2.12.4",
        "@tauri-apps/plugin-updater": "2.14.1",
      }),
    ).toEqual([]);
  });

  it("tells a stale node_modules install to refresh the lockfile", () => {
    expect(
      issuesFor({
        "@tauri-apps/api": "2.11.1",
        "@tauri-apps/cli": "2.11.4",
        "@tauri-apps/plugin-updater": "2.10.1",
      }).join("\n"),
    ).toMatch(/Installed @tauri-apps\/api is 2\.11\.1; pnpm-lock\.yaml resolves 2\.12\.4\. Run pnpm install --frozen-lockfile\./);
  });

  it("rejects a lockfile and Cargo.lock major.minor mismatch", () => {
    const drifted = cargoLockText.replace('version = "2.14.1"', 'version = "2.10.1"');
    expect(
      collectTauriAlignmentIssues({
        packageJsonText,
        lockText,
        cargoLockText: drifted,
        installedVersions: new Map([
          ["@tauri-apps/api", "2.12.4"],
          ["@tauri-apps/cli", "2.12.4"],
          ["@tauri-apps/plugin-updater", "2.14.1"],
        ]),
      }).join("\n"),
    ).toMatch(/tauri-plugin-updater \(v2\.10\.1\) : @tauri-apps\/plugin-updater \(v2\.14\.1\)/);
  });

  it("keeps this repository lockfile on the same Tauri major.minor as Cargo.lock", () => {
    const repoPackageJson = readFileSync("package.json", "utf8");
    const repoLock = readFileSync("pnpm-lock.yaml", "utf8");
    const repoCargoLock = readFileSync("src-tauri/Cargo.lock", "utf8");
    const locked = readPnpmImporterVersions(repoLock);
    const installedVersions = new Map(
      directTauriPackages(repoPackageJson).map((name) => [name, locked.get(name) ?? null]),
    );

    expect(
      collectTauriAlignmentIssues({
        packageJsonText: repoPackageJson,
        lockText: repoLock,
        cargoLockText: repoCargoLock,
        installedVersions,
      }),
    ).toEqual([]);
  });

  it("runs the alignment check before dev and the desktop bundle", () => {
    const justfile = readFileSync("justfile", "utf8");
    const buildScript = readFileSync("scripts/build/build.mjs", "utf8");

    expect(justfile).toMatch(
      /dev:\r?\n\s+node scripts\/check\/tauri-package-alignment\.mjs\r?\n\s+pnpm tauri dev/,
    );
    expect(justfile).toMatch(/help:\r?\n\s+@just --list/);
    expect(buildScript).toContain("assertTauriPackageAlignment");
  });
});
