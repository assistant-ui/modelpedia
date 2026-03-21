"use client";

import { useMemo, useState } from "react";
import { ChangeEntry } from "@/components/change-entry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const q = query.toLowerCase().trim();
  const filtered = useMemo(() => {
    if (!q) return entries;
    return entries
      .map((e) => ({ entry: e, score: scoreEntry(e, q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.entry);
  }, [entries, q]);

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

      <p className="mb-4 text-muted-foreground text-xs">
        {q
          ? `${filtered.length} results for "${query}"`
          : `${entries.length} total entries`}
      </p>

      {visible.length === 0 ? (
        <p className="text-pretty py-16 text-center text-muted-foreground">
          {query
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
                    ? { icon: providerIcons[entry.provider]! }
                    : null
                }
              />
            ))}
          </div>

          {totalPages > 1 && (
            <nav className="flex items-center justify-between pt-6">
              {safePage > 1 ? (
                <Button variant="outline" onClick={() => setPage(safePage - 1)}>
                  Previous
                </Button>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground text-xs">
                {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length}
              </span>
              {safePage < totalPages ? (
                <Button variant="outline" onClick={() => setPage(safePage + 1)}>
                  Next
                </Button>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
