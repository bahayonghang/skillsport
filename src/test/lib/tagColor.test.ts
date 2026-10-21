import { describe, expect, it } from "vitest";
import {
  getRepoDotColor,
  getTagColor,
  REPO_DOT_COLORS,
  TAG_SCHEMES,
} from "@/lib/tagColor";

describe("getTagColor", () => {
  it("hex 颜色优先于哈希", () => {
    const a = getTagColor({ name: "anything", color: "#ff8800" });
    expect(a.style?.color).toBeTruthy();
    expect(a.className).toBeUndefined();
  });

  it("无颜色时按名哈希且确定", () => {
    const a = getTagColor({ name: "frontend" });
    const b = getTagColor({ name: "frontend" });
    expect(a.className).toBe(b.className);
    expect(a.className).toBeTruthy();
  });

  it("不同名分散到不同色（大概率）", () => {
    const names = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const classes = new Set(
      names.map((n) => getTagColor({ name: n }).className),
    );
    expect(classes.size).toBeGreaterThan(1);
  });

  it("色板只使用主题 token，不使用原生 Tailwind 调色板或 dark: 二元适配", () => {
    const palette =
      /\b(?:rose|amber|emerald|sky|violet|fuchsia|teal|orange|indigo|cyan|red|green|blue|yellow|purple|pink)-\d{2,3}\b/;
    for (const scheme of TAG_SCHEMES) {
      expect(scheme).not.toMatch(palette);
      expect(scheme).not.toMatch(/\bdark:/);
      // 每项 = 描边 + tint 底 + 同族文字
      expect(scheme).toMatch(/\bborder-\S+/);
      expect(scheme).toMatch(/\bbg-\S+/);
      expect(scheme).toMatch(/\btext-\S+/);
    }
  });

  it("不借用状态色（琥珀 / 玫瑰只表达告警与错误）", () => {
    for (const scheme of TAG_SCHEMES) {
      expect(scheme).not.toMatch(/warning|destructive/);
    }
    for (const color of REPO_DOT_COLORS) {
      expect(color).not.toMatch(/chart-4|chart-5|warning|destructive/);
    }
  });
});

describe("getRepoDotColor", () => {
  it("同名确定性返回同色", () => {
    expect(getRepoDotColor("anthropics/skills")).toBe(
      getRepoDotColor("anthropics/skills"),
    );
  });

  it("返回主题 token 引用", () => {
    expect(getRepoDotColor("anthropics/skills")).toMatch(/^var\(--[\w-]+\)$/);
  });
});
