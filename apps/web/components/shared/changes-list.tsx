"use client";

import { useMemo, useState } from "react";
import { ChangeEntry } from "@/components/shared/change-entry";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { ChangeEntry as ChangeEntryData } from "@/lib/data";
import { fuzzyMatch } from "@/lib/search";

const PAGE_SIZE = 50;

function scoreEntry(entry: ChangeEntryData, pattern: string): number {
  return Math.max(
    fuzzyMatch(entry.model.toLowerCase(), pattern),
    fuzzyMatch(entry.provider.toLowerCase(), pattern),
    fuzzyMatch(entry.action.toLowerCase(), pattern),
  );
}

export function ChangesList({
  entries,
  providerIcons,
}: {
  entries: ChangeEntryData[];
  providerIcons: Record<string, string | undefined>;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");

  const actions = useMemo(
    () => [...new Set(entries.map((e) => e.action))].sort(),
    [entries],
  );
  const providers = useMemo(
    () => [...new Set(entries.map((e) => e.provider))].sort(),
    [entries],
  );

  const q = query.toLowerCase().trim();

  const filtered = useMemo(() => {
    let result = entries;

    if (actionFilter) {
      result = result.filter((e) => e.action === actionFilter);
    }
    if (providerFilter) {
      result = result.filter((e) => e.provider === providerFilter);
    }
    if (q) {
      result = result
        .map((e) => ({ entry: e, score: scoreEntry(e, q) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.entry);
    }

    return result;
  }, [entries, q, actionFilter, providerFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  return (
    <>
      <div className="mb-4">
        <Input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search by model, provider, or action..."
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <span>Action</span>
          <Select
            value={actionFilter}
            onValueChange={(v) => {
              setActionFilter(v ?? "");
              setPage(1);
            }}
            items={{
              "": "All",
              ...Object.fromEntries(actions.map((a) => [a, a])),
            }}
          >
            <SelectTrigger />
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              {actions.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <span>Provider</span>
          <Select
            value={providerFilter}
            onValueChange={(v) => {
              setProviderFilter(v ?? "");
              setPage(1);
            }}
            items={{
              "": "All",
              ...Object.fromEntries(providers.map((p) => [p, p])),
            }}
          >
            <SelectTrigger />
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-muted-foreground/60 text-xs">
          {filtered.length === entries.length
            ? `${entries.length} entries`
            : `${filtered.length} of ${entries.length}`}
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="text-pretty py-16 text-center text-muted-foreground">
          {query || actionFilter || providerFilter
            ? "No matching changes found."
            : "No changes recorded yet. Changes will appear here after the next data fetch."}
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {visible.map((entry, i) => (
              <ChangeEntry
                key={`${entry.ts}-${entry.model}-${start + i}`}
                entry={entry}
                provider={
                  providerIcons[entry.provider]
                    ? { icon: providerIcons[entry.provider] }
                    : null
                }
              />
            ))}
          </div>

          <Pagination
            pageIndex={safePage - 1}
            totalPages={totalPages}
            totalRows={filtered.length}
            pageSize={PAGE_SIZE}
            onPrevious={() => setPage(safePage - 1)}
            onNext={() => setPage(safePage + 1)}
            canPrevious={safePage > 1}
            canNext={safePage < totalPages}
          />
        </>
      )}
    </>
  );
}
