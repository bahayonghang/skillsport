import { useTranslation } from "react-i18next";

import type { SkillsCliGlobalSkill, SkillsCliInstallTarget } from "@/types";

interface InventoryCensusProps {
  skills: SkillsCliGlobalSkill[];
  targets: SkillsCliInstallTarget[];
}

/** Normalized source buckets in display order; mirrors the backend enum. */
const SOURCE_BUCKETS = [
  "github",
  "gitlab",
  "git",
  "mintlify",
  "huggingface",
  "local",
  "well-known",
  "unknown",
] as const;

/**
 * Theme-token color per bucket. Legend dots and donut segments read the same
 * value, so the palette stays theme-aware without arbitrary hex colors.
 */
const BUCKET_COLOR: Record<string, string> = {
  github: "var(--chart-1)",
  gitlab: "var(--chart-2)",
  git: "var(--chart-3)",
  mintlify: "var(--chart-4)",
  huggingface: "var(--chart-5)",
  local: "var(--chart-2)",
  "well-known": "var(--chart-4)",
  unknown: "var(--muted-foreground)",
};

// Donut geometry.
const DONUT_SIZE = 120;
const DONUT_RADIUS = 44;
const DONUT_STROKE = 14;

interface CensusRow {
  key: string;
  label: string;
  count: number;
  color: string;
}

function SourceDonut({ rows, total }: { rows: CensusRow[]; total: number }) {
  const { t } = useTranslation();
  const circumference = 2 * Math.PI * DONUT_RADIUS;
  let accumulatedLength = 0;
  return (
    <div className="relative size-32 shrink-0">
      <svg
        width={DONUT_SIZE}
        height={DONUT_SIZE}
        viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
        role="img"
        aria-label={t("skillsCli.census.donutAria", { count: total })}
        className="size-full"
      >
        <g transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}>
          {rows.map((row) => {
            const fraction = total > 0 ? row.count / total : 0;
            const segmentLength = fraction * circumference;
            const dashOffset = -accumulatedLength;
            accumulatedLength += segmentLength;
            return (
              <circle
                key={row.key}
                cx={DONUT_SIZE / 2}
                cy={DONUT_SIZE / 2}
                r={DONUT_RADIUS}
                fill="none"
                stroke={row.color}
                strokeWidth={DONUT_STROKE}
                strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                strokeDashoffset={dashOffset}
              >
                <title>
                  {t("skillsCli.census.donutTitle", {
                    label: row.label,
                    count: row.count,
                    percent: Math.round(fraction * 100),
                  })}
                </title>
              </circle>
            );
          })}
        </g>
      </svg>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
      >
        <span className="max-w-20 break-all text-lg font-semibold leading-tight tabular-nums">
          {total.toLocaleString()}
        </span>
        <span className="text-xs text-muted-foreground">
          {t("skillsCli.census.donutCenterLabel")}
        </span>
      </div>
    </div>
  );
}

function PlatformBarChart({
  ariaLabel,
  rows,
}: {
  ariaLabel: string;
  rows: CensusRow[];
}) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return null;
  }
  const maxCount = Math.max(...rows.map((row) => row.count), 1);
  const midpoint = Math.ceil(rows.length / 2);
  const groups = [rows.slice(0, midpoint), rows.slice(midpoint)];
  // Both columns reserve the same count width, so equal counts have equal bars.
  const countWidth = Math.max(3, maxCount.toLocaleString().length);
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="grid gap-y-1 @min-[44rem]/platform:grid-cols-2 @min-[44rem]/platform:gap-x-6"
    >
      {groups.filter((group) => group.length > 0).map((group) => (
        <ul key={group[0].key} className="min-w-0 space-y-1">
          {group.map((row) => {
            const title = t("skillsCli.census.barTitle", {
              label: row.label,
              count: row.count,
            });
            return (
              <li
                key={row.key}
                className="grid min-h-7 items-center gap-x-3 text-xs tabular-nums"
                style={{
                  gridTemplateColumns: `minmax(0, 1fr) minmax(0, 1fr) ${countWidth}ch`,
                }}
              >
                <span aria-hidden className="min-w-0 break-words text-muted-foreground">
                  {row.label}
                </span>
                <svg
                  role="img"
                  aria-label={title}
                  className="h-2 w-full overflow-visible text-primary-text"
                >
                  <title>{title}</title>
                  <rect
                    width={row.count > 0 ? `${(row.count / maxCount) * 100}%` : 1}
                    height="100%"
                    rx={2}
                    fill="currentColor"
                    opacity={row.count > 0 ? 1 : 0.3}
                  />
                </svg>
                <span aria-hidden className="text-right text-foreground">
                  {row.count.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}

export function InventoryCensus({ skills, targets }: InventoryCensusProps) {
  const { t } = useTranslation();
  if (skills.length === 0) {
    return (
      <p
        data-testid="skills-cli-census-empty"
        className="text-sm text-muted-foreground"
      >
        {t("skillsCli.census.empty")}
      </p>
    );
  }

  const linkedCount = skills.filter((skill) => skill.agents.length >= 1).length;
  const sourceKindPresence: Partial<
    Record<SkillsCliGlobalSkill["sourceTypeBucket"], true>
  > = {};
  for (const skill of skills) {
    sourceKindPresence[skill.sourceTypeBucket] = true;
  }
  const sourceKindCount = Object.keys(sourceKindPresence).length;

  const kpis = [
    { label: t("skillsCli.census.kpiInstalled"), value: skills.length },
    { label: t("skillsCli.census.kpiLinked"), value: linkedCount },
    { label: t("skillsCli.census.kpiSourceKinds"), value: sourceKindCount },
  ];

  const platformRows: CensusRow[] = targets.map((target) => ({
    key: target.id,
    label: target.displayName,
    count: skills.filter((skill) =>
      skill.agents.includes(target.displayName),
    ).length,
    color: "currentColor",
  }));
  const donutRows: CensusRow[] = SOURCE_BUCKETS.flatMap((bucket) => {
    const count = skills.filter(
      (skill) => skill.sourceTypeBucket === bucket,
    ).length;
    if (count === 0) {
      return [];
    }
    const i18nKey = bucket === "well-known" ? "wellKnown" : bucket;
    return [
      {
        key: bucket,
        label: t(`skillsCli.census.bucket.${i18nKey}`),
        count,
        color: BUCKET_COLOR[bucket] ?? BUCKET_COLOR.unknown,
      },
    ];
  });

  return (
    <div className="@container/census">
      <dl
        aria-label={t("skillsCli.census.kpiAria")}
        className="grid grid-cols-3 gap-4 border-b border-border pb-4"
      >
        {kpis.map((kpi) => (
          <div key={kpi.label}>
            <dt className="text-xs text-muted-foreground">{kpi.label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">
              {kpi.value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 grid items-start gap-6 @min-[60rem]/census:grid-cols-[13rem_minmax(0,1fr)]">
        <figure className="min-w-0 space-y-3">
          <figcaption className="text-xs font-medium">
            {t("skillsCli.census.sourceHeading")}
          </figcaption>
          <div className="flex flex-wrap items-start gap-4 @min-[60rem]/census:flex-col">
            <SourceDonut rows={donutRows} total={skills.length} />
            <ul className="min-w-0 space-y-2 py-1">
              {donutRows.map((row) => (
                <li key={row.key} className="flex items-center gap-2 text-xs">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: row.color }}
                  />
                  <span className="min-w-0 break-words">{row.label}</span>
                  <span className="ml-auto text-right tabular-nums text-muted-foreground">
                    {row.count.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </figure>
        <figure className="@container/platform min-w-0 space-y-3">
          <figcaption className="text-xs font-medium">
            {t("skillsCli.census.platformHeading")}
          </figcaption>
          <PlatformBarChart
            ariaLabel={t("skillsCli.census.platformAria", {
              count: platformRows.length,
            })}
            rows={platformRows}
          />
        </figure>
      </div>
    </div>
  );
}
