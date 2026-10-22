import type { CSSProperties } from "react";

export interface TagColorResult {
  /** 无自定义颜色时返回的 tailwind class 串。 */
  className?: string;
  /** 有 hex 自定义颜色时返回的内联样式（边框/底色用 color-mix 派生）。 */
  style?: CSSProperties;
}

/**
 * 克制色板（DESIGN.md Two-Accent / Tint-Not-Fill）：标签是分类数据，不是状态，
 * 因此只用薄荷 / 薰衣草两强调色的 tint、中性 tint，加三个低饱和色相
 * （天蓝 / 石板 / 梅，token 见 index.css `--tag-*`）。不使用琥珀 / 玫瑰
 * （它们只表达告警与错误）。每项 = 1px 同色描边 + 12% tint + 同族文字色，
 * 全部是主题 token，`glass-light` / `glass-dark` 自动换值；文字在 tint 合成于
 * panel 最不利点上 ≥ 4.5:1（themeContrast.test.ts 守卫）。
 */
export const TAG_SCHEMES: readonly string[] = [
  "border-primary-stroke bg-primary-tint text-primary-text",
  "border-secondary-accent/30 bg-secondary-accent-tint text-secondary-accent-text",
  "border-tag-sky-text/30 bg-tag-sky-tint text-tag-sky-text",
  "border-tag-slate-text/30 bg-tag-slate-tint text-tag-slate-text",
  "border-tag-plum-text/30 bg-tag-plum-tint text-tag-plum-text",
  "border-border bg-accent text-muted-foreground",
];

/**
 * repo 色块（非文字图形，≥ 3:1）：薄荷 / 薰衣草 / 天蓝三条图表序列 + 石板 / 梅，
 * 均为主题 token，避开琥珀 / 玫瑰的状态语义。
 */
export const REPO_DOT_COLORS: readonly string[] = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--tag-slate-text)",
  "var(--tag-plum-text)",
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // 转 32 位
  }
  return Math.abs(hash);
}

export function getTagColor(tag: {
  name: string;
  color?: string | null;
}): TagColorResult {
  const hex = tag.color?.trim();
  if (hex) {
    return {
      style: {
        color: hex,
        borderColor: `color-mix(in srgb, ${hex} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${hex} 12%, transparent)`,
      },
    };
  }
  const index = hashString(tag.name) % TAG_SCHEMES.length;
  return { className: TAG_SCHEMES[index] };
}

/**
 * repo 名 → 一个稳定的主题色（CSS var 串），用于 footer / sidebar 的 repo 色块。
 * 与 getTagColor 共用 hashString；可直接作 backgroundColor。
 */
export function getRepoDotColor(name: string): string {
  return REPO_DOT_COLORS[hashString(name) % REPO_DOT_COLORS.length]!;
}
