// 语义状态色工具：统一 success / warning / info / error 四态的类名，
// 杜绝各组件复制原生 Tailwind 调色板（amber/emerald/sky/red…）。
//
// 1.1.0 起 tone 的唯一来源是 `BADGE_TONE_CLASS`（`<Badge>` = DESIGN.md
// pill-status 的实现，见 src/components/ui/badge.tsx）。下方 status* 导出名
// 保留给现有消费方，取值由 Badge tone 映射而来；页面任务（C5–C8）逐步改用
// `<Badge tone=…>`。lib 不得 import components，所以映射表放在这里，由 Badge
// 反向引用。
//
// 配套 token 见 src/index.css：
//   tint 浅底：--primary-tint / --secondary-accent-tint / --warning-tint /
//     --destructive-tint（12%，按「叠在 panel / sidebar / overlay 合成色上」
//     验 ≥4.5:1，见 themeContrast.test.ts）
//   文字：--primary-text（= success-foreground）/ --secondary-accent-text
//     （= info-foreground）/ --warning-foreground / --destructive-text
//
// 用法约定：
//   状态胶囊      → <Badge tone="success" icon={…}>文字</Badge>
//   彩色文字      → statusTextClass[tone]
//   tint 背景     → statusSoftClass[tone]
//   状态点 swatch → statusFillClass[tone]（其上不叠文字）
// tint 必须坐在 panel / sidebar / overlay 上；直接放在 canvas 上不在对比度矩阵内。

export type BadgeTone =
  | "neutral"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "destructive"
  | "info";

export const BADGE_TONES: readonly BadgeTone[] = [
  "neutral",
  "primary",
  "secondary",
  "success",
  "warning",
  "destructive",
  "info",
];

/** Badge / pill-status 的 tint 底 + 语义文字色（不含形状）。 */
export const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-accent text-muted-foreground",
  primary: "bg-primary-tint text-primary-text",
  secondary: "bg-secondary-accent-tint text-secondary-accent-text",
  success: "bg-primary-tint text-success-foreground",
  warning: "bg-warning-tint text-warning-foreground",
  destructive: "bg-destructive-tint text-destructive-text",
  info: "bg-secondary-accent-tint text-info-foreground",
};

/** 作为可选中过滤器时的 1px 同色描边（DESIGN.md pill-status）。 */
export const BADGE_TONE_STROKE_CLASS: Record<BadgeTone, string> = {
  neutral: "border-border",
  primary: "border-primary-stroke",
  secondary: "border-secondary-accent/30",
  success: "border-primary-stroke",
  warning: "border-warning/30",
  destructive: "border-destructive/30",
  info: "border-info/30",
};

export type StatusTone = "success" | "warning" | "info" | "error";

/** StatusTone → Badge tone。 */
export const STATUS_BADGE_TONE: Record<StatusTone, BadgeTone> = {
  success: "success",
  warning: "warning",
  info: "info",
  error: "destructive",
};

function mapStatus(
  build: (tone: BadgeTone) => string,
): Record<StatusTone, string> {
  return {
    success: build(STATUS_BADGE_TONE.success),
    warning: build(STATUS_BADGE_TONE.warning),
    info: build(STATUS_BADGE_TONE.info),
    error: build(STATUS_BADGE_TONE.error),
  };
}

/** 带边框的 tint chip 颜色类（不含 `border` 宽度本身与圆角/间距，调用方自带布局类）。 */
export const statusChipClass: Record<StatusTone, string> = mapStatus(
  (tone) => `${BADGE_TONE_STROKE_CLASS[tone]} ${BADGE_TONE_CLASS[tone]}`,
);

/** 无边框 tint（仅底色 + 前景文字）。 */
export const statusSoftClass: Record<StatusTone, string> = mapStatus(
  (tone) => BADGE_TONE_CLASS[tone],
);

/** 纯前景文字色（无底色）。 */
export const statusTextClass: Record<StatusTone, string> = {
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  info: "text-info-foreground",
  error: "text-destructive-text",
};

/** 状态点 / 图标 swatch 的实心填充（其上无文字叠加）。 */
export const statusFillClass: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  error: "bg-destructive",
};
