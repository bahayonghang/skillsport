import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useTranslation } from "react-i18next";

const mockedToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: mockedToast }));

const eventBus = vi.hoisted(() => {
  type Handler = (event: { payload: unknown }) => void;
  const handlers = new Map<string, Set<Handler>>();
  return {
    handlers,
    listen: vi.fn(async (name: string, handler: Handler) => {
      const set = handlers.get(name) ?? new Set<Handler>();
      set.add(handler);
      handlers.set(name, set);
      return () => set.delete(handler);
    }),
    emit(name: string, payload: unknown) {
      for (const handler of handlers.get(name) ?? []) handler({ payload });
    },
  };
});
vi.mock("@tauri-apps/api/event", () => ({ listen: eventBus.listen }));

import { ClearCentralSkillsDialog } from "@/components/central/clearAll/ClearCentralSkillsDialog";
import {
  centralClearFixturePreview,
  centralClearFixtureResult,
  type CentralClearFixtureScenario,
} from "@/fixtures/centralClear";
import { ipcFixtureError } from "@/lib/ipc/errors";
import { useCentralClearAllWorkflow } from "@/pages/centralClearAllWorkflow";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import { usePlatformStore } from "@/stores/platformStore";
import type { TargetSummary } from "@/types/credentials";
import {
  CENTRAL_CLEAR_PROGRESS_EVENT,
  type ClearCentralRequest,
  type ClearCentralResult,
} from "@/types/centralClear";
import { ipcInvokeCalls, mockIpcCommands } from "../../support/ipcMock";

const ASYNC_UI_TIMEOUT_MS = 5_000;
const PHRASE = "清空中央仓库";

const agents = [
  { id: "claude-code", display_name: "Claude Code" },
  { id: "cursor", display_name: "Cursor" },
];
const localTarget: TargetSummary = { id: "local", kind: "local", label: "Local", isActive: true };

const loadCentralSkills = vi.fn();
const refreshCounts = vi.fn();
const onAfterClear = vi.fn();
const onOpenBackup = vi.fn();

function Harness({ target = localTarget }: { target?: TargetSummary }) {
  const { t } = useTranslation();
  const workflow = useCentralClearAllWorkflow({ t, onAfterClear, onOpenBackup });
  return (
    <>
      <button type="button" onClick={workflow.openDialog}>
        open-clear-all
      </button>
      <ClearCentralSkillsDialog t={t} workflow={workflow} agents={agents} target={target} />
    </>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function mockScenario(
  scenario: CentralClearFixtureScenario,
  apply?: (request: ClearCentralRequest) => unknown,
) {
  mockIpcCommands({
    preview_clear_central_skills: () => centralClearFixturePreview(scenario),
    clear_central_skills: ({ request }: { request: ClearCentralRequest }) =>
      apply ? apply(request) : centralClearFixtureResult(scenario, request),
    cancel_central_clear: true,
  });
}

async function openDialog(target?: TargetSummary) {
  render(<Harness target={target} />);
  fireEvent.click(screen.getByText("open-clear-all"));
  const dialog = await screen.findByRole(
    "alertdialog",
    {},
    { timeout: ASYNC_UI_TIMEOUT_MS },
  );
  return within(dialog);
}

async function openPreview(target?: TargetSummary) {
  const dialog = await openDialog(target);
  await dialog.findByTestId("central-clear-all-summary", {}, { timeout: ASYNC_UI_TIMEOUT_MS });
  return dialog;
}

function typePhrase(dialog: ReturnType<typeof within>, value = PHRASE) {
  fireEvent.change(dialog.getByTestId("central-clear-all-phrase"), { target: { value } });
}

function lastRequest(): ClearCentralRequest {
  const calls = ipcInvokeCalls("clear_central_skills");
  return (calls[calls.length - 1].args as { request: ClearCentralRequest }).request;
}

describe("ClearCentralSkillsDialog + workflow", () => {
  beforeEach(() => {
    eventBus.handlers.clear();
    useCentralSkillsStore.getState().resetForTargetChange();
    loadCentralSkills.mockResolvedValue(undefined);
    refreshCounts.mockResolvedValue(undefined);
    useCentralSkillsStore.setState({ loadCentralSkills });
    usePlatformStore.setState({ refreshCounts });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("is an alertdialog that names the target and focuses Cancel", async () => {
    mockScenario("normal");
    const dialog = await openPreview();
    expect(dialog.getByText("一键清理中央仓库 · 本地")).toBeInTheDocument();
    await waitFor(() =>
      expect(dialog.getByTestId("central-clear-all-cancel")).toHaveFocus(),
    );
    expect(dialog.getByTestId("central-clear-all-phrase")).toHaveAttribute(
      "aria-describedby",
    );
  });

  it("shows the SSH target name in the title", async () => {
    mockScenario("normal");
    const dialog = await openPreview({
      id: "ssh-1",
      kind: "ssh",
      label: "prod-box",
      isActive: true,
    });
    expect(dialog.getByText("一键清理中央仓库 · prod-box")).toBeInTheDocument();
  });

  it("renders aggregated agent rows, toggles, and notices", async () => {
    mockScenario("normal");
    const dialog = await openPreview();
    expect(dialog.getByTestId("central-clear-all-agent-claude-code")).toHaveTextContent(
      "Claude Code",
    );
    expect(dialog.getByTestId("central-clear-all-agent-cursor")).toBeInTheDocument();
    expect(dialog.getByTestId("central-clear-all-skipped-unmanaged")).toBeInTheDocument();
    expect(dialog.getByTestId("central-clear-all-pending-recovery")).toBeInTheDocument();
    // Path details are collapsed until expanded.
    expect(dialog.queryByTestId("central-clear-all-path-list")).not.toBeInTheDocument();
    fireEvent.click(dialog.getByTestId("central-clear-all-orphan-links-expand"));
    expect(dialog.getByTestId("central-clear-all-path-list")).toHaveTextContent(
      "~/.claude/skills/old-skill",
    );
  });

  it("formats a preview failure and toasts once", async () => {
    mockIpcCommands({
      preview_clear_central_skills: () => {
        throw ipcFixtureError("central.clear_failed", "raw detail C:/secret/path");
      },
    });
    const dialog = await openDialog();
    const alert = await dialog.findByRole("alert", {}, { timeout: ASYNC_UI_TIMEOUT_MS });
    expect(alert).toHaveTextContent("中央仓库清理失败。");
    expect(alert).not.toHaveTextContent("C:/secret/path");
    expect(mockedToast.error).toHaveBeenCalledTimes(1);
    expect(dialog.getByTestId("central-clear-all-repreview")).toBeInTheDocument();
  });

  it("shows nothing-to-clear and keeps confirm disabled for an empty preview", async () => {
    mockScenario("empty");
    const dialog = await openDialog();
    await dialog.findByTestId("central-clear-all-empty", {}, { timeout: ASYNC_UI_TIMEOUT_MS });
    expect(dialog.getByTestId("central-clear-all-confirm")).toBeDisabled();
  });

  it("still shows skipped-directory notices when there is nothing to clear", async () => {
    mockIpcCommands({
      preview_clear_central_skills: () => ({
        ...centralClearFixturePreview("empty"),
        skippedUnmanagedCount: 3,
      }),
    });
    const dialog = await openDialog();
    await dialog.findByTestId("central-clear-all-empty", {}, { timeout: ASYNC_UI_TIMEOUT_MS });
    expect(dialog.getByTestId("central-clear-all-skipped-unmanaged")).toBeInTheDocument();
    expect(dialog.getByTestId("central-clear-all-confirm")).toBeDisabled();
  });

  it("requires the phrase; cancel never calls apply", async () => {
    mockScenario("normal");
    const dialog = await openPreview();
    const confirm = dialog.getByTestId("central-clear-all-confirm");
    expect(confirm).toBeDisabled();
    typePhrase(dialog, "清空");
    expect(confirm).toBeDisabled();
    typePhrase(dialog, `  ${PHRASE} `);
    expect(confirm).toBeEnabled();
    expect(confirm).toHaveTextContent("永久清理 3 个 skill");

    fireEvent.click(dialog.getByTestId("central-clear-all-cancel"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(ipcInvokeCalls("clear_central_skills")).toHaveLength(0);
  });

  it("labels residue-only confirms by item count", async () => {
    mockScenario("orphanOnly");
    const dialog = await openPreview();
    typePhrase(dialog);
    expect(dialog.getByTestId("central-clear-all-confirm")).toHaveTextContent("清理 2 项残留");
  });

  it("sends checked copy agents and [] for disabled categories", async () => {
    mockScenario("normal");
    const dialog = await openPreview();
    fireEvent.click(dialog.getByRole("checkbox", { name: "一并删除 Cursor 中的 copy 安装" }));
    fireEvent.click(dialog.getByTestId("central-clear-all-project-links-toggle"));
    typePhrase(dialog);
    fireEvent.click(dialog.getByTestId("central-clear-all-confirm"));

    await waitFor(() => expect(ipcInvokeCalls("clear_central_skills")).toHaveLength(1));
    const request = lastRequest();
    expect(request.removeCopyAgentIds).toEqual(["cursor"]);
    expect(request.projectLinkKeys).toEqual([]);
    expect(request.orphanLinkKeys).toHaveLength(3);
    expect(request.skillIds).toEqual(["frontend-design", "code-reviewer", "pdf-tools"]);
  });

  it("sends the wildcard for a truncated category and says so", async () => {
    mockScenario("truncated");
    const dialog = await openPreview();
    expect(dialog.getByTestId("central-clear-all-orphan-links-truncated")).toBeInTheDocument();
    fireEvent.click(dialog.getByTestId("central-clear-all-orphan-links-expand"));
    expect(
      dialog.getByTestId("central-clear-all-path-list").querySelectorAll("li").length,
    ).toBeLessThan(200);
    typePhrase(dialog);
    fireEvent.click(dialog.getByTestId("central-clear-all-confirm"));
    await waitFor(() => expect(ipcInvokeCalls("clear_central_skills")).toHaveLength(1));
    expect(lastRequest().orphanLinkKeys).toEqual(["*"]);
  });

  it("filters progress by jobId, blocks dismissal while running, and cancels", async () => {
    const pending = deferred<ClearCentralResult>();
    mockScenario("normal", () => pending.promise);
    const dialog = await openPreview();
    typePhrase(dialog);
    fireEvent.click(dialog.getByTestId("central-clear-all-confirm"));

    const progressbar = await dialog.findByRole(
      "progressbar",
      {},
      { timeout: ASYNC_UI_TIMEOUT_MS },
    );
    await waitFor(() => expect(ipcInvokeCalls("clear_central_skills")).toHaveLength(1));
    const { jobId } = ipcInvokeCalls("clear_central_skills")[0].args as { jobId: string };

    act(() => {
      eventBus.emit(CENTRAL_CLEAR_PROGRESS_EVENT, {
        jobId: "other-job",
        phase: "orphanLinks",
        status: "running",
        completed: 9,
        total: 10,
      });
    });
    expect(progressbar).toHaveAttribute("aria-valuenow", "0");

    act(() => {
      eventBus.emit(CENTRAL_CLEAR_PROGRESS_EVENT, {
        jobId,
        phase: "skills",
        status: "running",
        completed: 4,
        total: 10,
      });
    });
    expect(progressbar).toHaveAttribute("aria-valuenow", "4");
    expect(progressbar).toHaveAttribute("aria-valuemax", "10");
    expect(dialog.getByTestId("central-clear-all-phase")).toHaveTextContent("删除中央 skill");

    // ESC does not dismiss a running clear.
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    fireEvent.click(dialog.getByTestId("central-clear-all-cancel-run"));
    await waitFor(() => expect(ipcInvokeCalls("cancel_central_clear")).toHaveLength(1));
    expect(ipcInvokeCalls("cancel_central_clear")[0].args).toEqual({ jobId });
    await waitFor(() =>
      expect(dialog.getByTestId("central-clear-all-cancel-run")).toHaveTextContent("正在取消…"),
    );

    await act(async () => {
      pending.resolve({
        ...centralClearFixtureResult("normal", lastRequest()),
        cancelled: true,
      });
    });
    const result = await dialog.findByTestId(
      "central-clear-all-result",
      {},
      { timeout: ASYNC_UI_TIMEOUT_MS },
    );
    expect(result).toHaveTextContent("清理已取消");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("keeps the dialog open on partial failure and can preview again", async () => {
    mockScenario("partialFailure");
    const dialog = await openPreview();
    typePhrase(dialog);
    fireEvent.click(dialog.getByTestId("central-clear-all-confirm"));

    const list = await dialog.findByTestId(
      "central-clear-all-failed-list",
      {},
      { timeout: ASYNC_UI_TIMEOUT_MS },
    );
    expect(list).toHaveTextContent("frontend-design");
    expect(list).toHaveTextContent("~/.claude/skills/old-skill");
    expect(list).toHaveTextContent("该条目未能删除，可能被占用或无权限");
    expect(dialog.getByTestId("central-clear-all-result-failed")).toHaveTextContent("失败：2");
    expect(mockedToast.error).toHaveBeenCalledTimes(1);
    expect(loadCentralSkills).toHaveBeenCalledTimes(1);
    expect(refreshCounts).toHaveBeenCalledTimes(1);

    fireEvent.click(dialog.getByTestId("central-clear-all-repreview"));
    await waitFor(() =>
      expect(ipcInvokeCalls("preview_clear_central_skills")).toHaveLength(2),
    );
    await dialog.findByTestId("central-clear-all-summary", {}, { timeout: ASYNC_UI_TIMEOUT_MS });
  });

  it("refreshes once, resets page state, and closes on full success", async () => {
    mockScenario("normal");
    const dialog = await openPreview();
    typePhrase(dialog);
    fireEvent.click(dialog.getByTestId("central-clear-all-confirm"));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(), {
      timeout: ASYNC_UI_TIMEOUT_MS,
    });
    expect(ipcInvokeCalls("preview_clear_central_skills")).toHaveLength(1);
    expect(ipcInvokeCalls("clear_central_skills")).toHaveLength(1);
    expect(loadCentralSkills).toHaveBeenCalledTimes(1);
    expect(loadCentralSkills).toHaveBeenCalledWith({ throwOnError: true });
    expect(refreshCounts).toHaveBeenCalledTimes(1);
    expect(onAfterClear).toHaveBeenCalledTimes(1);
    expect(mockedToast.success).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open with an inline error when apply is rejected as busy", async () => {
    mockScenario("normal", () => {
      throw ipcFixtureError("job.central_clear_busy", "busy");
    });
    const dialog = await openPreview();
    typePhrase(dialog);
    fireEvent.click(dialog.getByTestId("central-clear-all-confirm"));
    const alert = await dialog.findByRole("alert", {}, { timeout: ASYNC_UI_TIMEOUT_MS });
    expect(alert).toHaveTextContent("已有中央仓库清理任务在运行");
    expect(loadCentralSkills).not.toHaveBeenCalled();
    expect(dialog.getByTestId("central-clear-all-confirm")).toBeEnabled();
  });

  it("opens the backup dialog from the warning link", async () => {
    mockScenario("normal");
    const dialog = await openPreview();
    fireEvent.click(dialog.getByTestId("central-clear-all-backup"));
    expect(onOpenBackup).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });
});
