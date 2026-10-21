import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { InventoryCensus } from "@/components/skillsCli/InventoryCensus";
import type { SkillsCliGlobalSkill, SkillsCliInstallTarget } from "@/types";

const targets: SkillsCliInstallTarget[] = [
  {
    id: "cursor",
    displayName: "Cursor",
    iconName: null,
    cliAgent: "cursor",
    isEnabled: true,
    defaultSelected: true,
  },
  {
    id: "amp",
    displayName: "Amp",
    iconName: null,
    cliAgent: "amp",
    isEnabled: false,
    defaultSelected: false,
  },
];

function skill(overrides: Partial<SkillsCliGlobalSkill>): SkillsCliGlobalSkill {
  return {
    name: "skill",
    path: null,
    installKind: "canonical",
    scope: "global",
    agents: [],
    source: null,
    sourceUrl: null,
    sourceType: null,
    sourceTypeBucket: "unknown",
    canonicalPath: null,
    folderHash: null,
    installedAt: null,
    updatedAt: null,
    placements: [],
    ...overrides,
  };
}

function chartTitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("svg[role='img'] title")).map(
    (node) => node.textContent ?? "",
  );
}

describe("InventoryCensus", () => {
  it("renders KPI counts for installed, linked, and source kinds", () => {
    render(
      <InventoryCensus
        targets={targets}
        skills={[
          skill({ name: "a", agents: ["Cursor"], sourceTypeBucket: "github" }),
          skill({ name: "b", agents: ["Amp"], sourceTypeBucket: "github" }),
          skill({ name: "c", agents: [], sourceTypeBucket: "unknown" }),
        ]}
      />,
    );

    const strip = screen.getByLabelText("库存统计 KPI");
    expect(strip).toHaveTextContent("已装技能");
    expect(strip).toHaveTextContent("3");
    expect(strip).toHaveTextContent("已链接平台");
    expect(strip).toHaveTextContent("2");
    expect(strip).toHaveTextContent("来源种类");
    expect(strip).toHaveTextContent("2");
  });

  it("keeps zero-count platform buckets with a titled bar", () => {
    const { container } = render(
      <InventoryCensus
        targets={targets}
        skills={[skill({ name: "a", agents: ["Cursor"] })]}
      />,
    );

    const titles = chartTitles(container);
    expect(titles).toContain("Cursor：1");
    expect(titles).toContain("Amp：0");
  });

  it("charts accessible roles, labels, and titles for donut and bars", () => {
    const { container } = render(
      <InventoryCensus
        targets={targets}
        skills={[
          skill({ name: "a", sourceTypeBucket: "github" }),
          skill({ name: "b", sourceTypeBucket: "github" }),
          skill({ name: "c", sourceTypeBucket: "unknown" }),
        ]}
      />,
    );

    expect(
      screen.getByRole("img", { name: "按来源类型的已装技能饼图，共 3 个" }),
    ).toBeInTheDocument();
    const platforms = screen.getByRole("group", {
      name: "各平台已装技能柱状图，共 2 个平台",
    });
    expect(
      within(platforms).getByRole("img", { name: "Cursor：0" }),
    ).toBeInTheDocument();
    expect(
      within(platforms).getByRole("img", { name: "Amp：0" }),
    ).toBeInTheDocument();
    const titles = chartTitles(container);
    expect(titles).toContain("GitHub：2（67%）");
    expect(titles).toContain("未知：1（33%）");
    expect(container.querySelector("svg text")).toBeNull();
  });

  it("preserves full target order, long names, zero values, and a shared bar scale across groups", () => {
    const names = [
      "A very long platform name that must remain readable",
      "Second",
      "Third",
      "Last zero platform",
    ];
    render(
      <InventoryCensus
        targets={names.map((displayName, index) => ({
          ...targets[0],
          id: `target-${index}`,
          displayName,
        }))}
        skills={[
          skill({ name: "a", agents: names.slice(0, 3) }),
          skill({ name: "b", agents: names.slice(0, 2) }),
          skill({ name: "c", agents: [names[0]] }),
          skill({ name: "d", agents: [names[0]] }),
        ]}
      />,
    );
    const platforms = screen.getByRole("group", {
      name: "各平台已装技能柱状图，共 4 个平台",
    });
    const bars = within(platforms).getAllByRole("img");
    expect(bars.map((bar) => bar.getAttribute("aria-label"))).toEqual([
      `${names[0]}：4`,
      "Second：2",
      "Third：1",
      "Last zero platform：0",
    ]);
    expect(
      bars.slice(0, 3).map((bar) => bar.querySelector("rect")?.getAttribute("width")),
    ).toEqual(["100%", "50%", "25%"]);
    expect(within(platforms).getByText(names[0])).toBeInTheDocument();
    expect(within(platforms).getByText("0")).toBeInTheDocument();
  });

  it("keeps large counts and multiple source buckets readable without changing KPI meanings", () => {
    const count = 1234;
    render(
      <InventoryCensus
        targets={targets}
        skills={Array.from({ length: count }, (_, index) =>
          skill({
            name: `skill-${index}`,
            agents: ["Cursor", "Amp"],
            sourceTypeBucket: index % 2 === 0 ? "github" : "local",
          }),
        )}
      />,
    );
    const strip = screen.getByLabelText("库存统计 KPI");
    // KPIs render as StatTiles; the value is the tile's second row.
    expect(
      Array.from(
        strip.querySelectorAll('[data-slot="stat-tile"] > div:nth-child(2)'),
      ).map((node) => node.textContent),
    ).toEqual([count.toLocaleString(), count.toLocaleString(), "2"]);
    expect(screen.getByRole("img", { name: `Cursor：${count}` })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: `Amp：${count}` })).toBeInTheDocument();
    expect(screen.getByText("GitHub：617（50%）")).toBeInTheDocument();
    expect(screen.getByText("本地：617（50%）")).toBeInTheDocument();
  });

  it("renders an empty census placeholder without charts", () => {
    render(<InventoryCensus targets={targets} skills={[]} />);

    expect(screen.getByTestId("skills-cli-census-empty")).toBeInTheDocument();
    expect(document.querySelector("svg[role='img']")).toBeNull();
  });
});
