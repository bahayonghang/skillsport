export type HeatLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface HeatmapScale {
  max: number;
  thresholds: number[] | null;
}

/** 数据变化时只排序一次；焦点和语言更新不重新计算分位数。 */
export function buildHeatmapScale(counts: readonly number[]): HeatmapScale {
  const positive = counts.filter((count) => count > 0);
  if (positive.length < 5) {
    return { max: Math.max(1, ...positive), thresholds: null };
  }
  positive.sort((a, b) => a - b);
  return {
    max: positive[positive.length - 1],
    thresholds: [0.25, 0.5, 0.75, 0.9].map((value) => {
      const position = (positive.length - 1) * value;
      const lower = Math.floor(position);
      const upper = Math.ceil(position);
      return positive[lower] +
        (positive[upper] - positive[lower]) * (position - lower);
    }),
  };
}

export function heatLevelFor(count: number, scale: HeatmapScale): HeatLevel {
  if (count <= 0) return 0;
  if (scale.thresholds === null) {
    return Math.max(1, Math.min(5, Math.ceil((count / scale.max) * 5))) as HeatLevel;
  }
  if (count <= scale.thresholds[0]) return 1;
  if (count <= scale.thresholds[1]) return 2;
  if (count <= scale.thresholds[2]) return 3;
  if (count <= scale.thresholds[3]) return 4;
  return 5;
}
