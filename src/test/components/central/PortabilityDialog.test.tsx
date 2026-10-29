import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import defaultCapability from "../../../../src-tauri/capabilities/default.json";
import { PortabilityDialog } from "@/components/central/portability/PortabilityDialog";
import { ipcFixtureError } from "@/lib/ipc/errors";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import type {
  PortableBundleExportSummary,
  PortableBundleImportPreview,
  PortableBundleImportResult,
  PortableBundleSkillPreview,
} from "@/types";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
  open: vi.fn(),
}));

import { open, save } from "@tauri-apps/plugin-dialog";

const summary: PortableBundleExportSummary = {
  targetKind: "local",
  skills: 3,
  skillsWithGithubSource: 1,
  tags: 2,
  tagGroups: 1,
  savedViews: 1,
  registries: 1,
};

function skill(id: string, status: PortableBundleSkillPreview["status"]): PortableBundleSkillPreview {
  return { id, name: id, status, hasGithubSource: false, fileCount: 1, contentBytes: 1 };
}

function makePreview(skills: PortableBundleSkillPreview[]): PortableBundleImportPreview {
  return {
    previewToken: "token",
    createdAt: "2026-10-28T00:00:00Z",
    appVersion: "1.0.0",
    originTargetKind: "local",
    skills,
    metadata: {
      registries: { add: 1, exists: 0, update: 0 },
      tagGroups: { add: 0, exists: 1, update: 0 },
      tags: { add: 2, exists: 0, update: 0 },
      savedViews: { add: 0, exists: 0, update: 1 },
    },
    bundleSkippedSkills: [],
  };
}

const actions = {
  loadPortabilityExportSummary: vi.fn(),
  exportPortableBundle: vi.fn(),
  previewPortableBundle: vi.fn(),
  applyPortableBundleImport: vi.fn(),
  discardPortableBundlePreview: vi.fn(),
  cancelPortabilityJob: vi.fn(),
  resetPortabilityDialog: vi.fn(),
};

function setPortability(patch: Partial<ReturnType<typeof useCentralSkillsStore.getState>["portability"]>) {
  useCentralSkillsStore.setState((state) => ({ portability: { ...state.portability, ...patch } }));
}

function renderDialog() {
  return render(<PortabilityDialog open onOpenChange={vi.fn()} />);
}

describe("PortabilityDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCentralSkillsStore.getState().resetForTargetChange();
    actions.loadPortabilityExportSummary.mockImplementation(async () => {
      setPortability({ exportSummary: summary });
      return summary;
    });
    actions.discardPortableBundlePreview.mockResolvedValue(undefined);
    actions.cancelPortabilityJob.mockResolvedValue(undefined);
    useCentralSkillsStore.setState(actions);
  });

  it("keeps file access behind the dialog plugin only", () => {
    const capability = defaultCapability as { permissions: Array<string | { identifier: string }> };
    expect(capability.permissions).toContain("dialog:allow-open");
    expect(capability.permissions).toContain("dialog:allow-save");
    expect(capability.permissions).not.toContain("fs:allow-read-text-file");
    expect(capability.permissions).not.toContain("fs:allow-write-text-file");
  });

  it("shows the export summary and saves a .skillport bundle", async () => {
    vi.mocked(save).mockResolvedValue("D:\\exports\\out.skillport");
    actions.exportPortableBundle.mockResolvedValue({
      skillsExported: 3,
      skippedSkills: [],
      fileCount: 5,
      contentBytes: 10,
      bundleBytes: 2048,
    });
    renderDialog();

    const button = await screen.findByTestId("central-portability-export-save");
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    await waitFor(() => expect(actions.exportPortableBundle).toHaveBeenCalledWith("D:\\exports\\out.skillport"));
    const options = vi.mocked(save).mock.calls[0]?.[0];
    expect(options?.defaultPath).toMatch(/^skillport-.+-\d{4}-\d{2}-\d{2}\.skillport$/);
    expect(options?.filters).toEqual([{ name: "SkillPort", extensions: ["skillport"] }]);
  });

  it("explains legacy JSON exports when preview rejects them", async () => {
    vi.mocked(open).mockResolvedValue("D:\\old.json");
    actions.previewPortableBundle.mockRejectedValue(
      ipcFixtureError("portable_bundle.legacy_v1", "legacy"),
    );
    renderDialog();

    fireEvent.click(screen.getByTestId("central-portability-import-tab"));
    fireEvent.click(screen.getByTestId("central-portability-import-browse"));

    const alert = await screen.findByTestId("central-portability-error");
    expect(actions.previewPortableBundle).toHaveBeenCalledWith("D:\\old.json");
    expect(alert).toHaveTextContent("旧版 SkillPort 状态导出文件");
    expect(alert).toHaveTextContent("旧版 JSON 导出已不再支持");
  });

  it("requires a decision for conflicts before apply and supports bulk overwrite", async () => {
    setPortability({
      preview: makePreview([skill("alpha", "new"), skill("beta", "identical"), skill("gamma", "changed")]),
      previewPath: "D:\\in.skillport",
    });
    actions.applyPortableBundleImport.mockResolvedValue(undefined);
    renderDialog();
    fireEvent.click(screen.getByTestId("central-portability-import-tab"));

    const apply = screen.getByTestId("central-portability-apply");
    expect(apply).toBeDisabled();
    expect(screen.getByTestId("central-portability-apply-hint")).toHaveTextContent("1");

    fireEvent.click(screen.getByTestId("central-portability-bulk-overwrite"));
    expect(apply).toBeEnabled();
    expect(useCentralSkillsStore.getState().portability.decisions.gamma).toEqual({
      skillId: "gamma",
      action: "overwrite",
    });

    fireEvent.click(apply);
    await waitFor(() => expect(actions.applyPortableBundleImport).toHaveBeenCalledWith(undefined));
  });

  it("flags an invalid rename and blocks apply", () => {
    setPortability({ preview: makePreview([skill("gamma", "changed")]), previewPath: "D:\\in.skillport" });
    renderDialog();
    fireEvent.click(screen.getByTestId("central-portability-import-tab"));

    fireEvent.click(screen.getByTestId("central-portability-action-gamma-rename"));
    const input = screen.getByTestId("central-portability-rename-gamma");
    fireEvent.change(input, { target: { value: "bad/name" } });

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("central-portability-apply")).toBeDisabled();

    fireEvent.change(input, { target: { value: "gamma-copy" } });
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.getByTestId("central-portability-apply")).toBeEnabled();
  });

  it("retries only unfinished skills from the result view", async () => {
    const result: PortableBundleImportResult = {
      imported: ["alpha"],
      overwritten: [],
      renamed: [],
      skipped: [],
      failed: [{ id: "gamma", code: "write_failed" }],
      metadata: { added: 1, updated: 0, unchanged: 0 },
      cancelled: false,
    };
    setPortability({
      preview: makePreview([skill("alpha", "new"), skill("gamma", "changed")]),
      decisions: { gamma: { skillId: "gamma", action: "overwrite" } },
      lastResult: result,
    });
    actions.applyPortableBundleImport.mockResolvedValue(result);
    renderDialog();
    fireEvent.click(screen.getByTestId("central-portability-import-tab"));

    expect(screen.getByTestId("central-portability-result-failed")).toHaveTextContent("gamma");
    fireEvent.click(screen.getByTestId("central-portability-retry-failed"));
    await waitFor(() => expect(actions.applyPortableBundleImport).toHaveBeenCalledWith(["gamma"]));
  });

  it("virtualizes large decision lists", () => {
    const skills = Array.from({ length: 1000 }, (_, index) => skill(`skill-${index}`, "new"));
    setPortability({ preview: makePreview(skills), previewPath: "D:\\big.skillport" });
    renderDialog();
    fireEvent.click(screen.getByTestId("central-portability-import-tab"));

    const rows = screen.getAllByTestId(/^central-portability-row-/);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(60);
    expect(screen.getByTestId("central-portability-count-new")).toHaveTextContent("1000");
  });

  it("shows job progress with a cancel button while busy", () => {
    useCentralSkillsStore.setState((state) => ({
      portabilityJob: {
        ...state.portabilityJob,
        jobId: "job",
        kind: "apply",
        phase: "apply",
        status: "running",
        total: 10,
        completed: 4,
      },
    }));
    renderDialog();

    expect(screen.getByTestId("central-portability-progress")).toHaveTextContent("4 / 10");
    fireEvent.click(screen.getByTestId("central-portability-cancel-job"));
    expect(actions.cancelPortabilityJob).toHaveBeenCalled();
  });
});
