/// <reference types="node" />

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type ModelOptions = {
  sourceDir: string;
  rootDir: string;
  migrationFiles?: string[];
};
type SchemaModule = {
  source: string;
  tables: Array<{
    name: string;
    cols: Array<{ name: string }>;
    indexes: Array<{ name: string }>;
    additionalSources?: string[];
  }>;
};

const schemaModule =
  // @ts-expect-error The documentation generator is an ESM Node script outside the TS source tree.
  await import("../../../scripts/docs/build-schema-table.mjs");
const buildSchemaModel = schemaModule.buildSchemaModel as (
  options: ModelOptions,
) => SchemaModule[];
const collectMigrationFiles = schemaModule.collectMigrationFiles as (
  directory: string,
) => string[];
const generateSchemaDocs = schemaModule.generateSchemaDocs as (
  options: ModelOptions & {
    outputFile: string;
    check?: boolean;
    log: (message: string) => void;
  },
) => string;

function withFixture(
  test: (fixture: {
    rootDir: string;
    sourceDir: string;
    migrationDir: string;
    outputFile: string;
  }) => void,
) {
  const rootDir = mkdtempSync(join(tmpdir(), "skillport-schema-migrations-"));
  const sourceDir = join(rootDir, "schema");
  const migrationDir = join(rootDir, "migrations");
  const outputFile = join(rootDir, "generated", "data-model.md");
  mkdirSync(sourceDir);
  mkdirSync(migrationDir);
  try {
    test({ rootDir, sourceDir, migrationDir, outputFile });
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

function writeSql(file: string, statements: string[]): void {
  writeFileSync(
    file,
    statements.map((sql) => `sqlx::query("${sql}");`).join("\n") + "\n",
    "utf8",
  );
}

describe("schema model with explicit append-only migrations", () => {
  it("merges new columns and indexes into their original table and locates new tables", () => {
    withFixture(({ rootDir, sourceDir, migrationDir, outputFile }) => {
      writeSql(join(sourceDir, "usage.rs"), [
        "CREATE TABLE IF NOT EXISTS file_cache (target TEXT NOT NULL, path TEXT NOT NULL)",
      ]);
      const migration = join(migrationDir, "v8.rs");
      writeSql(migration, [
        "ALTER TABLE file_cache ADD COLUMN file_key TEXT",
        "ALTER TABLE file_cache ADD COLUMN observed_order INTEGER NOT NULL DEFAULT 0",
        "CREATE UNIQUE INDEX idx_file_key ON file_cache(target, file_key)",
        "CREATE TABLE candidates (target TEXT NOT NULL, ordinal INTEGER NOT NULL, PRIMARY KEY (target, ordinal))",
        "CREATE INDEX idx_candidate_target ON candidates(target)",
      ]);
      const options = { rootDir, sourceDir, migrationFiles: [migration] };
      const model = buildSchemaModel(options);

      expect(model.map((module) => module.source)).toEqual([
        "schema/usage.rs",
        "migrations/v8.rs",
      ]);
      expect(model[0].tables[0].cols.map((column) => column.name)).toEqual([
        "target",
        "path",
        "file_key",
        "observed_order",
      ]);
      expect(model[0].tables[0].additionalSources).toEqual([
        "migrations/v8.rs:1",
        "migrations/v8.rs:2",
        "migrations/v8.rs:3",
      ]);
      expect(model[1].tables.map((table) => table.name)).toEqual(["candidates"]);

      const markdown = generateSchemaDocs({
        ...options,
        outputFile,
        log: () => undefined,
      });
      expect(markdown).toContain("| `observed_order` | `INTEGER` | no | `0` | — |");
      expect(markdown).toContain("- `idx_file_key` on `(target, file_key)` unique");
      expect(markdown).toContain("Additional DDL: `migrations/v8.rs:1`");
      expect(markdown.match(/### `file_cache`/g)).toHaveLength(1);
      expect(markdown.match(/\| `ordinal` \| `INTEGER` \| no \| — \| ✓ \|/g)).toHaveLength(1);
    });
  });

  it("loads no repository or fixture migrations unless explicitly requested", () => {
    withFixture(({ rootDir, sourceDir, migrationDir }) => {
      writeSql(join(sourceDir, "example.rs"), [
        "CREATE TABLE IF NOT EXISTS examples (id TEXT PRIMARY KEY)",
      ]);
      const migration = join(migrationDir, "v8.rs");
      writeSql(migration, ["ALTER TABLE examples ADD COLUMN unexpected TEXT"]);

      expect(buildSchemaModel({ rootDir, sourceDir })[0].tables[0].cols).toHaveLength(1);
      expect(
        buildSchemaModel({ rootDir, sourceDir, migrationFiles: [migration] })[0]
          .tables[0].cols.map((column) => column.name),
      ).toEqual(["id", "unexpected"]);
    });
  });

  it("orders dedicated migrations numerically and excludes baseline and FK rebuild sources", () => {
    withFixture(({ rootDir, sourceDir, migrationDir }) => {
      writeSql(join(sourceDir, "usage.rs"), [
        "CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY)",
      ]);
      writeSql(join(migrationDir, "v1.rs"), [
        "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY)",
      ]);
      writeSql(join(migrationDir, "v2.rs"), [
        "CREATE TABLE __skill_relation_rebuild (id TEXT PRIMARY KEY)",
        "ALTER TABLE __skill_relation_rebuild RENAME TO items",
      ]);
      writeSql(join(migrationDir, "v10.rs"), [
        "CREATE INDEX idx_items_key ON items(file_key)",
      ]);
      writeSql(join(migrationDir, "v8.rs"), [
        "ALTER TABLE items ADD COLUMN file_key TEXT",
      ]);
      writeSql(join(migrationDir, "mod.rs"), ["ALTER TABLE missing ADD COLUMN wrong TEXT"]);

      const migrationFiles = collectMigrationFiles(migrationDir);
      expect(migrationFiles).toEqual([
        join(migrationDir, "v8.rs"),
        join(migrationDir, "v10.rs"),
      ]);
      const model = buildSchemaModel({ rootDir, sourceDir, migrationFiles });
      expect(model).toHaveLength(1);
      expect(model[0].tables.map((table) => table.name)).toEqual(["items"]);
      expect(model[0].tables[0].additionalSources).toEqual([
        "migrations/v8.rs:1",
        "migrations/v10.rs:1",
      ]);
    });
  });

  it("keeps only the final index definition, including a partial predicate", () => {
    withFixture(({ rootDir, sourceDir, migrationDir, outputFile }) => {
      writeSql(join(sourceDir, "example.rs"), [
        "CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, status TEXT)",
        "CREATE INDEX IF NOT EXISTS idx_items ON items(id)",
      ]);
      const migration = join(migrationDir, "v8.rs");
      writeSql(migration, [
        "DROP INDEX idx_items",
        "CREATE UNIQUE INDEX idx_items ON items(id, status) WHERE status NOT IN ('completed', 'failed')",
      ]);

      const markdown = generateSchemaDocs({
        rootDir,
        sourceDir,
        migrationFiles: [migration],
        outputFile,
        log: () => undefined,
      });
      expect(markdown).toContain(
        "- `idx_items` on `(id, status)` unique where `status NOT IN ('completed', 'failed')`",
      );
      expect(markdown).not.toContain("- `idx_items` on `(id)`");
      expect(markdown.match(/`idx_items`/g)).toHaveLength(1);
    });
  });

  it("omits dropped tables and releases their indexes across migration files", () => {
    withFixture(({ rootDir, sourceDir, migrationDir }) => {
      writeSql(join(sourceDir, "example.rs"), [
        "CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY)",
      ]);
      const migration = join(migrationDir, "v8.rs");
      writeSql(migration, [
        "CREATE TABLE __temporary_rebuild (id TEXT PRIMARY KEY)",
        "CREATE INDEX idx_temporary ON __temporary_rebuild(id)",
        "DROP TABLE __temporary_rebuild",
      ]);
      const nextMigration = join(migrationDir, "v9.rs");
      writeSql(nextMigration, [
        "CREATE TABLE __temporary_rebuild (new_id INTEGER PRIMARY KEY)",
        "CREATE INDEX idx_temporary ON __temporary_rebuild(new_id)",
        "DROP TABLE IF EXISTS __temporary_rebuild",
        "CREATE INDEX idx_temporary ON items(id)",
      ]);

      const model = buildSchemaModel({
        rootDir,
        sourceDir,
        migrationFiles: [migration, nextMigration],
      });
      expect(model).toHaveLength(1);
      expect(model[0].tables.map((table) => table.name)).toEqual(["items"]);
      expect(model[0].tables[0].indexes.map((index) => index.name)).toEqual(["idx_temporary"]);
    });
  });

  it.each([
    ["ALTER TABLE missing ADD COLUMN file_key TEXT", "ALTER TABLE", "references unknown table missing"],
    ["CREATE INDEX idx_missing ON missing(id)", "CREATE INDEX", "references unknown table missing"],
    ["ALTER TABLE items RENAME TO renamed", "ALTER TABLE", "unsupported"],
    ["CREATE TABLE items (id INTEGER)", "CREATE TABLE", "already defined"],
  ])("fails closed on migration DDL %s at its exact source line", (sql, kind, reason) => {
    withFixture(({ rootDir, sourceDir, migrationDir }) => {
      writeSql(join(sourceDir, "example.rs"), [
        "CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY)",
      ]);
      const migration = join(migrationDir, "v8.rs");
      writeFileSync(migration, `// ignored header\n\n${`sqlx::query("${sql}");`}\n`, "utf8");

      expect(() =>
        buildSchemaModel({ rootDir, sourceDir, migrationFiles: [migration] }),
      ).toThrow(new RegExp(`${kind} in migrations/v8\\.rs:3`));
      expect(() =>
        buildSchemaModel({ rootDir, sourceDir, migrationFiles: [migration] }),
      ).toThrow(reason);
    });
  });

  it("produces deterministic bytes and checks clean or stale documents without any source writes", () => {
    withFixture(({ rootDir, sourceDir, migrationDir, outputFile }) => {
      const source = join(sourceDir, "example.rs");
      writeSql(source, ["CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY)"]);
      const migration = join(migrationDir, "v8.rs");
      writeSql(migration, ["ALTER TABLE items ADD COLUMN file_key TEXT"]);
      const options = {
        rootDir,
        sourceDir,
        migrationFiles: [migration],
        outputFile,
        log: () => undefined,
      };
      const first = generateSchemaDocs(options);
      expect(generateSchemaDocs(options)).toBe(first);
      const fixedTime = new Date("2020-01-01T00:00:00.000Z");
      for (const file of [source, migration, outputFile]) {
        utimesSync(file, fixedTime, fixedTime);
      }
      const before = [source, migration, outputFile].map((file) => ({
        bytes: readFileSync(file),
        mtime: statSync(file).mtimeMs,
      }));

      expect(generateSchemaDocs({ ...options, check: true })).toBe(first);
      for (const [index, file] of [source, migration, outputFile].entries()) {
        expect(readFileSync(file)).toEqual(before[index].bytes);
        expect(statSync(file).mtimeMs).toBe(before[index].mtime);
      }

      writeFileSync(outputFile, "stale\n", "utf8");
      utimesSync(outputFile, fixedTime, fixedTime);
      const staleMtime = statSync(outputFile).mtimeMs;
      expect(() => generateSchemaDocs({ ...options, check: true })).toThrow(/pnpm docs:gen/);
      expect(readFileSync(outputFile, "utf8")).toBe("stale\n");
      expect(statSync(outputFile).mtimeMs).toBe(staleMtime);
      for (const [index, file] of [source, migration].entries()) {
        expect(readFileSync(file)).toEqual(before[index].bytes);
        expect(statSync(file).mtimeMs).toBe(before[index].mtime);
      }
    });
  });
});
