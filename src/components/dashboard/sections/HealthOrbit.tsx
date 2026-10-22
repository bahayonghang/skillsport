import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { CheckCircle2, CircleAlert, CircleDashed, Gauge } from "lucide-react";

import { PanelHeader } from "@/components/dashboard/DashboardPanels";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import type { DashboardReadiness } from "@/types";

interface HealthOrbitProps {
  readiness: DashboardReadiness;
}

interface FactorProps {
  label: string;
  value: number;
}

type ReadinessStatus = "ready" | "review" | "triage";

const STATUS_TONE: Record<ReadinessStatus, BadgeTone> = {
  ready: "success",
  review: "warning",
  triage: "destructive",
};

const STATUS_ICON: Record<ReadinessStatus, ReactNode> = {
  ready: <CheckCircle2 />,
  review: <CircleDashed />,
  triage: <CircleAlert />,
};

function toPercent(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function getReadinessStatus(score: number): ReadinessStatus {
  if (score >= 80) return "ready";
  if (score >= 50) return "review";
  return "triage";
}

/** One readiness factor: label + percentage + thin mint bar (no nested box). */
function FactorRail({ label, value }: FactorProps) {
  const safeValue = Math.max(0, Math.min(1, value));
  const percent = toPercent(safeValue);

  return (
    <div className="py-1">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className="text-xs font-semibold tabular-nums">{percent}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-accent">
        <span
          className="block h-full origin-left rounded-pill bg-primary transition-transform duration-200 ease-out"
          style={{ transform: `scaleX(${safeValue})` }}
        />
      </div>
    </div>
  );
}

/**
 * Readiness panel (DESIGN.md Signature: Dashboard): the score is a mint
 * StatTile (completion semantics) — no conic score plaque, no grid mask —
 * and the four quality factors are flat rows with thin mint bars.
 */
export function HealthOrbit({ readiness }: HealthOrbitProps) {
  const { t } = useTranslation();
  const score = Math.max(0, Math.min(100, Math.round(readiness.score)));
  const status = getReadinessStatus(score);
  const factors: FactorProps[] = [
    {
      label: t("dashboard.readiness.factors.categorized"),
      value: readiness.categorizedRatio,
    },
    {
      label: t("dashboard.readiness.factors.described"),
      value: readiness.describedRatio,
    },
    {
      label: t("dashboard.readiness.factors.sourced"),
      value: readiness.sourcedRatio,
    },
    {
      label: t("dashboard.readiness.factors.installHealth"),
      value: readiness.installHealthRatio,
    },
  ];

  return (
    <Card
      className="p-0"
      role="region"
      aria-label={t("dashboard.readiness.label")}
    >
      <PanelHeader
        title={t("dashboard.readiness.label")}
        description={t("dashboard.readiness.description")}
        action={
          <Badge tone={STATUS_TONE[status]} icon={STATUS_ICON[status]}>
            {t(`dashboard.readiness.status.${status}`)}
          </Badge>
        }
      />
      <CardContent className="grid gap-4 px-4 pb-4 sm:grid-cols-[minmax(8.5rem,11rem)_minmax(0,1fr)] sm:items-center">
        <StatTile
          tone="primary"
          icon={<Gauge />}
          label={t("dashboard.readiness.scoreLabel")}
          value={score}
          hint={t("dashboard.readiness.scoreHint")}
          title={t("dashboard.readiness.ariaLabel", { score })}
        />
        <div
          role="group"
          className="grid gap-1"
          aria-label={t("dashboard.readiness.factors.ariaLabel")}
        >
          {factors.map((factor) => (
            <FactorRail key={factor.label} {...factor} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
