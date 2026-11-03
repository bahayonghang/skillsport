import { useEffect, useRef, useState } from "react";
import { FileArchive, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { isTauriRuntime } from "@/lib/ipc";
import { BUNDLE_FILE_EXTENSION } from "@/lib/portabilityViewModel";
import { cn } from "@/lib/utils";

/**
 * File button plus a drop zone. Tauri delivers dropped files as paths on the
 * webview, so the zone only highlights; any drop while mounted and enabled
 * is taken as the bundle (only the first path is used).
 */
export function ImportFilePicker({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const onPickRef = useRef(onPick);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    onPickRef.current = onPick;
    disabledRef.current = disabled;
  }, [onPick, disabled]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    // Drop support is a convenience: if the webview API is unavailable the
    // file button still works, so failures are ignored.
    void import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview()
          .onDragDropEvent((event) => {
            const payload = event.payload;
            if (payload.type === "enter" || payload.type === "over") {
              setDragging(!disabledRef.current);
            } else if (payload.type === "leave") {
              setDragging(false);
            } else if (payload.type === "drop") {
              setDragging(false);
              const path = payload.paths[0];
              if (path && !disabledRef.current) onPickRef.current(path);
            }
          })
          .then((fn) => {
            if (cancelled) fn();
            else unlisten = fn;
          }),
      )
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  async function handleBrowse() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "SkillPort", extensions: [BUNDLE_FILE_EXTENSION] }],
    });
    if (typeof selected === "string" && selected) onPick(selected);
  }

  return (
    <div
      data-testid="central-portability-drop-zone"
      data-dragging={dragging || undefined}
      className={cn(
        "flex flex-col items-center gap-3 rounded-inner border border-dashed border-border px-6 py-8 text-center transition-colors",
        dragging && "border-primary-stroke bg-primary-tint",
      )}
    >
      <FileArchive className="size-8 text-muted-foreground" />
      <div className="space-y-1">
        <div className="text-sm font-medium">
          {t("central.bundle.import.dropTitle")}
        </div>
        <div className="text-xs text-muted-foreground">
          {t("central.bundle.import.dropHint")}
        </div>
      </div>
      <Button
        variant="outline"
        data-testid="central-portability-import-browse"
        onClick={() => void handleBrowse()}
        disabled={disabled}
      >
        <Upload className="size-4" />
        {t("central.bundle.import.browse")}
      </Button>
    </div>
  );
}
