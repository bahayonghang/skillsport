import { cn } from "@/lib/utils";

// DESIGN.md Components → card (L2 simulated glass, no real blur) and
// Signature: UnifiedSkillCard. Every skill card scenario shares this shell:
// translucent panel + 1px glass stroke + `shadow-glass`, `rounded-card`
// (18px), one-step hover shadow. Selected = 1px mint stroke + faint mint
// tint wash over the panel fill (`.tint-primary` is a background-image, so
// the panel colour underneath stays — the composite themeContrast measures).
export function cardShellClass(selected?: boolean): string {
  return cn(
    "glass-panel glass-panel-hover flex h-full flex-col rounded-card",
    selected && "border-primary-stroke tint-primary",
  );
}
