import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WindowMaterialSetting } from "@/components/settings/WindowMaterialSetting";
import { useWindowMaterialStore } from "@/stores/windowMaterialStore";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

const realSetPreference = useWindowMaterialStore.getState().setPreference;

describe("WindowMaterialSetting", () => {
  beforeEach(() => {
    useWindowMaterialStore.getState().reset();
    toastError.mockReset();
  });

  afterEach(() => {
    useWindowMaterialStore.setState({ setPreference: realSetPreference });
    useWindowMaterialStore.getState().reset();
  });

  it("toggles the preference through the store", async () => {
    const setPreference = vi.fn().mockResolvedValue(undefined);
    useWindowMaterialStore.setState({
      preference: "mica",
      state: { applied: "mica", reason: null, supported: true },
      setPreference,
    });
    render(<WindowMaterialSetting />);

    const toggle = screen.getByRole("switch", { name: "使用 Mica 窗口材质" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("让 Windows 11 的 Mica 材质透过玻璃背景显示。")).toBeInTheDocument();

    fireEvent.click(toggle);
    await waitFor(() => expect(setPreference).toHaveBeenCalledWith("off"));
  });

  it("is disabled with an explanation on Windows 10", () => {
    useWindowMaterialStore.setState({
      preference: "mica",
      state: { applied: "none", reason: "unsupportedOs", supported: false },
    });
    render(<WindowMaterialSetting />);

    const toggle = screen.getByRole("switch", { name: "使用 Mica 窗口材质" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    const explanation = screen.getByText("Mica 需要 Windows 11，当前系统保持不透明背景。");
    expect(toggle.getAttribute("aria-describedby")).toBe(explanation.id);
  });

  it("shows a toast when saving fails", async () => {
    const setPreference = vi.fn().mockRejectedValue(new Error("save failed"));
    useWindowMaterialStore.setState({
      preference: "mica",
      state: { applied: "mica", reason: null, supported: true },
      setPreference,
    });
    render(<WindowMaterialSetting />);

    fireEvent.click(screen.getByRole("switch", { name: "使用 Mica 窗口材质" }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "无法保存窗口材质设置。",
        expect.objectContaining({ description: expect.any(String) }),
      ),
    );
  });
});
