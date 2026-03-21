import Link from "next/link";
import { ProviderIcon } from "@/components/provider-icon";
import type { ChangelogEntry } from "@/lib/data";
import { formatDate, formatValue } from "@/lib/format";

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-500/10 text-green-500",
  delete: "bg-red-500/10 text-red-500",
};
const DEFAULT_ACTION_COLOR = "bg-blue-500/10 text-blue-500";

export function ChangeEntry({
  entry,
  provider,
  showModel = true,
}: {
  entry: ChangelogEntry;
  provider: { icon?: string } | null | undefined;
  showModel?: boolean;
}) {
  return (
    <div className="rounded-md ring-1 ring-border">
      <div className="flex items-center gap-3 px-4 py-3">
        <ProviderIcon provider={provider} size={14} />
        {showModel ? (
          <Link
            href={`/${entry.provider}/${entry.model}`}
            className="min-w-0 flex-1 truncate font-mono text-foreground text-sm transition-colors duration-200 hover:text-accent-foreground"
          >
            {entry.model}
          </Link>
        ) : (
          <span className="min-w-0 flex-1 truncate font-mono text-foreground text-sm">
            {entry.model}
          </span>
        )}
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${ACTION_COLORS[entry.action] ?? DEFAULT_ACTION_COLOR}`}
        >
          {entry.action}
        </span>
        {entry.commit && (
          <a
            href={`https://github.com/assistant-ui/ai-model/commit/${entry.commit}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-mono text-muted-foreground/50 text-xs transition-colors duration-200 hover:text-muted-foreground"
          >
            {entry.commit.slice(0, 7)}
          </a>
        )}
        <span className="shrink-0 text-muted-foreground text-xs">
          {formatDate(entry.ts)}
        </span>
      </div>
      {entry.changes && Object.keys(entry.changes).length > 0 && (
        <div className="border-border border-t px-4 py-2 text-xs">
          {Object.entries(entry.changes).map(([field, { from, to }]) => (
            <div key={field} className="flex items-center gap-2 py-0.5">
              <span className="font-mono text-muted-foreground">{field}</span>
              <span className="text-red-400 line-through">
                {formatValue(from)}
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="text-green-400">{formatValue(to)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
