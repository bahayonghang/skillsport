import { useState, type MouseEvent } from "react";
import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getTagColor } from "@/lib/tagColor";

interface TagLite {
  id: string;
  name: string;
  color?: string | null;
}

export interface CardTagEditorProps {
  tags: TagLite[];
  allTags: TagLite[];
  onAdd: (tagId: string) => void;
  onCreate: (name: string) => void;
  onRemove: (tagId: string) => void;
}

/** 阻断卡片导航/选择的事件冒泡（参考 RepoTrailingActions 模式）。 */
const stop = (e: MouseEvent) => e.stopPropagation();

export function CardTagEditor({
  tags,
  allTags,
  onAdd,
  onCreate,
  onRemove,
}: CardTagEditorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const assigned = new Set(tags.map((tg) => tg.id));
  const candidates = allTags.filter(
    (tg) =>
      !assigned.has(tg.id) &&
      tg.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const canCreate =
    query.trim().length > 0 &&
    !allTags.some((tg) => tg.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className="flex flex-wrap items-center gap-1" onClick={stop}>
      {tags.map((tag) => {
        const color = getTagColor(tag);
        return (
          <span
            key={tag.id}
            style={color.style}
            className={cn(
              "group/tag inline-flex h-5 items-center gap-1 rounded-pill border px-2 text-xs font-medium",
              color.className,
            )}
          >
            {tag.name}
            <button
              type="button"
              aria-label={t("central.cardTagRemove", { name: tag.name })}
              onClick={(e) => {
                stop(e);
                onRemove(tag.id);
              }}
              className="focus-ring rounded-pill opacity-0 transition-opacity duration-150 group-hover/tag:opacity-100 focus-visible:opacity-100"
            >
              <X className="size-2.5" />
            </button>
          </span>
        );
      })}

      <div className="relative">
        <button
          type="button"
          aria-label={t("central.cardTagAdd")}
          title={t("central.cardTagAdd")}
          onClick={(e) => {
            stop(e);
            setOpen((v) => !v);
          }}
          className={cn(
            "focus-ring relative grid size-6 place-items-center rounded-pill border border-dashed border-input text-muted-foreground",
            "after:absolute after:left-1/2 after:top-1/2 after:size-10 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']",
            "opacity-60 transition-[opacity,border-color,color] duration-150 hover:border-primary-stroke hover:text-primary-text focus-visible:opacity-100",
            "group-hover/skill-card:opacity-100 group-focus-within/skill-card:opacity-100",
          )}
        >
          <Plus className="size-4" />
        </button>
        {open && (
          <div
            className="glass-overlay absolute z-40 mt-1 w-48 rounded-card p-1.5 text-popover-foreground"
            onMouseDown={(e) => e.preventDefault()}
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("central.cardTagSearchPlaceholder")}
              className="mb-1 w-full rounded-control border border-input bg-input-surface px-2.5 py-1 text-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            />
            <div className="max-h-40 overflow-y-auto">
              {candidates.map((tg) => (
                <button
                  key={tg.id}
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    onAdd(tg.id);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="block w-full truncate rounded-control px-2.5 py-1 text-left text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  {tg.name}
                </button>
              ))}
              {canCreate && (
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    onCreate(query.trim());
                    setQuery("");
                    setOpen(false);
                  }}
                  className="block w-full truncate rounded-control px-2.5 py-1 text-left text-xs text-primary-text hover:bg-accent focus-visible:bg-accent focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  {t("central.cardTagCreate", { name: query.trim() })}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
