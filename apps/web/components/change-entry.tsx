import Link from "next/link";
import { ProviderIcon } from "@/components/provider-icon";
import type { ChangelogEntry } from "@/lib/data";
import { formatDate, formatValue } from "@/lib/format";

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-500/10 text-green-500",
  delete: "bg-red-500/10 text-red-500",
};
const DEFAULT_ACTION_COLOR = "bg-blue-500/10 text-blue-500";

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function formatSubValue(field: string, value: unknown): string {
  if (value == null) return "—";
  if (field === "pricing" && typeof value === "number") return `$${value}`;
  const s = formatValue(value);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

function DiffPair({
  from,
  to,
  field,
}: {
  from: unknown;
  to: unknown;
  field: string;
}) {
  const hasFrom = from != null;
  const hasTo = to != null;
  return (
    <>
      {hasFrom && (
        <span className="text-red-400 line-through">
          {formatSubValue(field, from)}
        </span>
      )}
      {hasFrom && hasTo && <span className="text-muted-foreground">→</span>}
      {hasTo && (
        <span className="text-green-400">{formatSubValue(field, to)}</span>
      )}
    </>
  );
}

/** Compact inline diff for object fields like pricing */
function InlineObjDiff({
  field,
  from,
  to,
}: {
  field: string;
  from: Record<string, unknown>;
  to: Record<string, unknown>;
}) {
  const allKeys = [...new Set([...Object.keys(from), ...Object.keys(to)])];
  const changed = allKeys.filter(
    (k) => JSON.stringify(from[k]) !== JSON.stringify(to[k]),
  );
  if (changed.length === 0) return null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-0.5">
      <span className="shrink-0 font-mono text-muted-foreground">{field}</span>
      {changed.map((key) => (
        <span key={key} className="inline-flex items-baseline gap-1">
          <span className="text-muted-foreground/60">
            {key.replaceAll("_", " ")}
          </span>
          <DiffPair from={from[key]} to={to[key]} field={field} />
        </span>
      ))}
    </div>
  );
}

function ChangeField({
  field,
  from,
  to,
}: {
  field: string;
  from: unknown;
  to: unknown;
}) {
  if (isObj(from) || isObj(to)) {
    return (
      <InlineObjDiff
        field={field}
        from={isObj(from) ? from : {}}
        to={isObj(to) ? to : {}}
      />
    );
  }

  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="shrink-0 font-mono text-muted-foreground">{field}</span>
      <DiffPair from={from} to={to} field={field} />
    </div>
  );
}

/** For create actions, show changed fields as compact tags */
function CreateSummary({ changes }: { changes: Record<string, unknown> }) {
  const fields = Object.keys(changes);
  return (
    <div className="flex flex-wrap gap-1.5">
      {fields.map((f) => (
        <span
          key={f}
          className="rounded bg-green-500/10 px-1.5 py-0.5 font-mono text-green-500 text-xs"
        >
          {f}
        </span>
      ))}
    </div>
  );
}

export function ChangeEntry({
  entry,
  provider,
  showModel = true,
}: {
  entry: ChangelogEntry;
  provider: { icon?: string } | null | undefined;
  showModel?: boolean;
}) {
  const hasChanges = entry.changes && Object.keys(entry.changes).length > 0;

  return (
    <div className="rounded-md ring-1 ring-border">
      <div className="flex items-center gap-3 px-4 py-3">
        <ProviderIcon provider={provider} size={14} />
        {showModel && entry.action !== "delete" ? (
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
            href={`https://github.com/assistant-ui/modelpedia/commit/${entry.commit}`}
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
      {hasChanges && (
        <div className="border-border border-t px-4 py-2 text-xs">
          {entry.action === "create" ? (
            <CreateSummary changes={entry.changes!} />
          ) : (
            Object.entries(entry.changes!).map(([field, { from, to }]) => (
              <ChangeField key={field} field={field} from={from} to={to} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
