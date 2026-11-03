import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveRepoRoot } from "../lib/repo-root.mjs";

const NPM_API = "@tauri-apps/api";
const NPM_PLUGIN_PREFIX = "@tauri-apps/plugin-";
const NPM_CLI = "@tauri-apps/cli";

/**
 * Tauri CLI rejects a build when an installed npm package and its Rust crate
 * differ at major.minor. `just ci` never invokes that check.
 */
export function majorMinor(version) {
  const match = /^(\d+)\.(\d+)\.\d+/.exec(String(version));
  if (!match) {
    throw new Error(`Not a release semver version: ${version}`);
  }
  return `${match[1]}.${match[2]}`;
}

export function directTauriPackages(packageJsonText) {
  const manifest = JSON.parse(packageJsonText);
  const names = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
  return [...names]
    .filter(
      (name) =>
        name === NPM_API || name === NPM_CLI || name.startsWith(NPM_PLUGIN_PREFIX),
    )
    .sort();
}

export function rustCrateForNpmPackage(name) {
  if (name === NPM_API) return "tauri";
  if (name.startsWith(NPM_PLUGIN_PREFIX)) {
    return `tauri-plugin-${name.slice(NPM_PLUGIN_PREFIX.length)}`;
  }
  return null;
}

export function readPnpmImporterVersions(lockText) {
  const versions = new Map();
  const lines = lockText.split(/\r?\n/);
  let inRoot = false;
  let currentPackage = null;

  for (const line of lines) {
    if (!inRoot) {
      if (line === "  .:") inRoot = true;
      continue;
    }
    if (/^  \S/.test(line)) break;

    const header = /^ {6}'(@tauri-apps\/[^']+)':$/.exec(line);
    if (header) {
      currentPackage = header[1];
      continue;
    }
    if (!currentPackage) continue;

    const version = /^ {8}version: (\d+\.\d+\.\d+)(?:\(|$)/.exec(line);
    if (version) {
      versions.set(currentPackage, version[1]);
      currentPackage = null;
    }
  }

  return versions;
}

export function readCargoPackageVersions(lockText) {
  const versions = new Map();
  for (const block of lockText.split("[[package]]").slice(1)) {
    const name = /\nname = "([^"]+)"/.exec(block)?.[1];
    const version = /\nversion = "([^"]+)"/.exec(block)?.[1];
    if (!name || !version) continue;
    if (name !== "tauri" && !name.startsWith("tauri-plugin-")) continue;
    const seen = versions.get(name);
    if (seen && seen !== version) {
      throw new Error(`Cargo.lock resolves ${name} to both ${seen} and ${version}.`);
    }
    versions.set(name, version);
  }
  return versions;
}

export function readInstalledVersion(rootDir, packageName) {
  const packageJsonPath = join(rootDir, "node_modules", ...packageName.split("/"), "package.json");
  if (!existsSync(packageJsonPath)) return null;
  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  return typeof manifest.version === "string" ? manifest.version : null;
}

export function collectTauriAlignmentIssues({
  packageJsonText,
  lockText,
  cargoLockText,
  installedVersions,
}) {
  const locked = readPnpmImporterVersions(lockText);
  const cargo = readCargoPackageVersions(cargoLockText);
  const issues = [];

  for (const name of directTauriPackages(packageJsonText)) {
    const lockedVersion = locked.get(name);
    if (!lockedVersion) {
      issues.push(`${name} is in package.json but pnpm-lock.yaml has no resolved version.`);
      continue;
    }

    const installed = installedVersions.get(name) ?? null;
    if (installed == null) {
      issues.push(
        `Installed ${name} is missing; pnpm-lock.yaml resolves ${lockedVersion}. Run pnpm install --frozen-lockfile.`,
      );
    } else if (installed !== lockedVersion) {
      issues.push(
        `Installed ${name} is ${installed}; pnpm-lock.yaml resolves ${lockedVersion}. Run pnpm install --frozen-lockfile.`,
      );
    }

    const crate = rustCrateForNpmPackage(name);
    if (!crate) continue;

    const cargoVersion = cargo.get(crate);
    if (!cargoVersion) {
      issues.push(`Cargo.lock has no ${crate} package for ${name}@${lockedVersion}.`);
      continue;
    }
    if (majorMinor(lockedVersion) !== majorMinor(cargoVersion)) {
      issues.push(
        `${crate} (v${cargoVersion}) : ${name} (v${lockedVersion}). NPM and Rust crate versions must share the same major.minor.`,
      );
    }
  }

  return issues;
}

export function assertTauriPackageAlignment(rootDir) {
  const packageJsonText = readFileSync(join(rootDir, "package.json"), "utf8");
  const lockText = readFileSync(join(rootDir, "pnpm-lock.yaml"), "utf8");
  const cargoLockText = readFileSync(join(rootDir, "src-tauri", "Cargo.lock"), "utf8");
  const installedVersions = new Map(
    directTauriPackages(packageJsonText).map((name) => [name, readInstalledVersion(rootDir, name)]),
  );
  const issues = collectTauriAlignmentIssues({
    packageJsonText,
    lockText,
    cargoLockText,
    installedVersions,
  });
  if (issues.length === 0) return;

  throw new Error(
    `[build] Tauri package versions are not aligned.\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
  );
}

function isDirectExecution() {
  return (
    process.argv[1] !== undefined &&
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  );
}

if (isDirectExecution()) {
  try {
    assertTauriPackageAlignment(resolveRepoRoot(import.meta.url));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
