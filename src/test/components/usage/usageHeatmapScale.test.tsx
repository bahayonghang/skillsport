import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ActivityHeatmap } from "@/components/usage/ActivityHeatmap";
import * as scale from "@/components/usage/usageHeatmapScale";

afterEach(() => vi.restoreAllMocks());

// Frozen pre-optimization classifier, used as the equivalence oracle.
function previousLevel(count: number, positive: number[]) {
  if (count <= 0) return 0;
  if (positive.length < 5) return Math.max(1, Math.min(5, Math.ceil(count / Math.max(1, ...positive) * 5)));
  const sorted = [...positive].sort((a, b) => a - b);
  const quantile = (value: number) => {
    const position = (sorted.length - 1) * value;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  if (count <= quantile(0.25)) return 1;
  if (count <= quantile(0.5)) return 2;
  if (count <= quantile(0.75)) return 3;
  if (count <= quantile(0.9)) return 4;
  return 5;
}

describe("usage heatmap scale", () => {
  it.each([
    [0, 0, 0, 0], [0, 1], [1, 4, 9, 16],
    [7, 7, 7, 7, 7, 7], [0, 1, 2, 3, 4, 5, 100],
    [1, 2, 2, 2, 3, 3, Number.MAX_SAFE_INTEGER],
  ])("preserves the original levels for %j", (...counts) => {
    const thresholds = scale.buildHeatmapScale(counts);
    const positive = counts.filter((count) => count > 0);
    for (const count of [...counts, ...(thresholds.thresholds ?? []).flatMap((value) => [value, value + 0.001])]) {
      expect(scale.heatLevelFor(count, thresholds)).toBe(previousLevel(count, positive));
    }
  });

  it("sorts once per dataset and does constant work for each cell", () => {
    const sorter = vi.spyOn(Array.prototype, "sort");
    const data = [5, 2, 9, 1, 4, 17];
    const thresholds = scale.buildHeatmapScale(data);
    expect(sorter).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 112; index += 1) scale.heatLevelFor(index, thresholds);
    expect(sorter).toHaveBeenCalledTimes(1);
    scale.buildHeatmapScale([0, 3, 7]);
    expect(sorter).toHaveBeenCalledTimes(1);
    expect(data).toEqual([5, 2, 9, 1, 4, 17]);
  });

  it("does not rebuild thresholds for focus, compact or other render-only updates", () => {
    const builder = vi.spyOn(scale, "buildHeatmapScale");
    const days = Array.from({ length: 112 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 0, 5) + index * 86_400_000).toISOString().slice(0, 10),
      count: index,
    }));
    const { rerender } = render(<ActivityHeatmap days={days} />);
    const cells = screen.getAllByRole("gridcell");
    fireEvent.keyDown(cells[0], { key: "ArrowRight" });
    expect(cells[7]).toHaveFocus();
    rerender(<ActivityHeatmap days={days} compact />);
    expect(builder).toHaveBeenCalledTimes(1);
    rerender(<ActivityHeatmap days={[...days]} compact />);
    expect(builder).toHaveBeenCalledTimes(2);
  });
});
