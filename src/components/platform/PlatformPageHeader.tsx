import { PageHeader } from "@/components/ui/page-header";
import { PlatformIcon } from "@/components/platform/PlatformIcon";
import { formatPathForDisplay } from "@/lib/path";

/**
 * Platform page title area: the shared `PageHeader` (the page's single `<h1>`)
 * with the platform icon + name as title and the scope note + skills
 * directory as muted meta. Sits directly on the canvas.
 */
export function PlatformPageHeader({
  agentId,
  name,
  scopeNote,
  skillsDir,
}: {
  agentId: string;
  name: string;
  /** Optional scope line (Universal page only). */
  scopeNote?: string;
  skillsDir: string;
}) {
  return (
    <PageHeader
      title={
        <span className="inline-flex min-w-0 items-center gap-2.5">
          <PlatformIcon agentId={agentId} className="size-6 text-primary-text" size={24} />
          <span className="min-w-0 truncate">{name}</span>
        </span>
      }
      meta={
        <span className="flex min-w-0 flex-col gap-0.5">
          {scopeNote && <span>{scopeNote}</span>}
          <span className="truncate font-mono text-ui-meta" title={skillsDir}>
            {formatPathForDisplay(skillsDir)}
          </span>
        </span>
      }
    />
  );
}
