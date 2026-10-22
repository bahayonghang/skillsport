import { Fragment } from "react";
import { useTranslation } from "react-i18next";

import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useHotkey } from "@/hooks/useHotkey";
import { formatShortcut } from "@/lib/keyboardShortcuts";
import { SHORTCUT_GROUPS } from "@/lib/shortcutRegistry";

interface ShortcutsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function KeyCombo({ combo }: { combo: string }) {
  const descriptor = formatShortcut(combo);

  return (
    <kbd
      aria-label={descriptor.ariaLabel}
      title={descriptor.ariaLabel}
      className="inline-flex items-center gap-1"
    >
      {descriptor.tokens.map((token, index) => (
        <Fragment key={`${token}-${index}`}>
          {index > 0 && (
            <span
              aria-hidden="true"
              className="text-ui-meta text-muted-foreground"
            >
              +
            </span>
          )}
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-border bg-accent px-1.5 font-mono text-xs leading-none text-foreground">
            {token}
          </span>
        </Fragment>
      ))}
    </kbd>
  );
}

/**
 * Keyboard shortcuts quick-reference drawer (`ui/sheet`, right side, L3
 * glass). Opens on "?" (outside text inputs) or mod+/ anywhere; closes with
 * Esc and returns focus to the trigger via the sheet primitive.
 * Content is rendered from the central registry in lib/shortcutRegistry.ts.
 */
export function ShortcutsSheet({ open, onOpenChange }: ShortcutsSheetProps) {
  const { t } = useTranslation();

  useHotkey("?", () => onOpenChange(!open), { allowInEditable: false });
  useHotkey("mod+/", () => onOpenChange(!open));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{t("shortcuts.title")}</SheetTitle>
          <SheetDescription>{t("shortcuts.description")}</SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.id} aria-label={t(group.titleKey)}>
              <h3 className="text-xs font-medium text-muted-foreground">
                {t(group.titleKey)}
              </h3>
              <ul className="mt-1.5">
                {group.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-4 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-foreground">
                        {t(entry.descriptionKey)}
                      </div>
                      {entry.scopeKey && (
                        <div className="text-xs text-muted-foreground">
                          {t(entry.scopeKey)}
                        </div>
                      )}
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
                      {entry.combos.map((combo, index) => (
                        <Fragment key={combo}>
                          {index > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {t("shortcuts.or")}
                            </span>
                          )}
                          <KeyCombo combo={combo} />
                        </Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
