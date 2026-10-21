import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ScannedSkill } from "@/types";
import type { PlatformSkillGroup } from "@/lib/platformSkillViewModel";

export function PlatformGroupedSkillList({
  groups,
  renderSkillCard,
}: {
  groups: PlatformSkillGroup[];
  renderSkillCard: (skill: ScannedSkill) => ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const isCollapsed = collapsed[group.key] ?? false;
        const Caret = isCollapsed ? ChevronRight : ChevronDown;
        return (
          <section key={group.key} aria-label={group.label}>
            <button
              type="button"
              onClick={() =>
                setCollapsed((prev) => ({ ...prev, [group.key]: !isCollapsed }))
              }
              aria-expanded={!isCollapsed}
              data-testid={`platform-group-header-${group.key}`}
              className="glass-sticky focus-ring sticky top-0 z-10 mb-3 flex w-full items-center gap-2 rounded-full border border-glass-stroke px-3.5 py-1.5 text-left text-sm font-medium"
            >
              <Caret className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{group.label}</span>
              <Badge size="sm" className="tabular-nums">
                {group.skills.length}
              </Badge>
            </button>
            {!isCollapsed && (
              <div
                className="grid grid-cols-1 gap-5 lg:grid-cols-2"
                data-testid={`platform-group-body-${group.key}`}
              >
                {group.skills.map((skill) => renderSkillCard(skill))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
