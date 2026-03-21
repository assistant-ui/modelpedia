"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Input } from "./ui/input";
import { formatTokens, ProviderIcon } from "./views";

const PAGE_SIZE = 10;

const CAP_LABELS: [string, string][] = [
  ["reasoning", "R"],
  ["vision", "V"],
  ["tool_call", "T"],
  ["streaming", "S"],
  ["structured_output", "J"],
  ["fine_tuning", "F"],
];

interface ModelItem {
  id: string;
  name: string;
  provider: string;
  status?: string;
  context_window?: number | null;
  capabilities?: Record<string, boolean>;
  pricing?: { input?: number | null; output?: number | null };
  providerIcon?: string;
}

function capBadges(caps: Record<string, boolean> | undefined) {
  if (!caps) return null;
  return (
    <span className="flex gap-0.5">
      {CAP_LABELS.map(([key, letter]) =>
        caps[key] ? (
          <span
            key={key}
            className="flex h-4 w-4 items-center justify-center rounded bg-muted text-[10px] text-foreground"
            title={key.replace(/_/g, " ")}
          >
            {letter}
          </span>
        ) : null,
      )}
    </span>
  );
}

function capLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
      {CAP_LABELS.map(([key, letter]) => (
        <span key={key} className="flex items-center gap-1">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-muted text-[10px] text-foreground">
            {letter}
          </span>
          {key.replace(/_/g, " ")}
        </span>
      ))}
    </div>
  );
}

type SortKey = "ctx" | "pin" | "pout";

function getSortValue(m: ModelItem, key: SortKey): number {
  if (key === "ctx") return m.context_window ?? 0;
  if (key === "pin") return m.pricing?.input ?? -1;
  return m.pricing?.output ?? -1;
}

export function ModelList({
  models,
  showProvider,
  searchable,
  initialQuery = "",
}: {
  models: ModelItem[];
  showProvider?: boolean;
  searchable?: boolean;
  initialQuery?: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [showDeprecated, setShowDeprecated] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(0);

  const OFFICIAL = new Set([
    "openai", "anthropic", "google", "mistral", "deepseek", "xai",
    "cohere", "meta", "zhipu", "minimax", "alibaba", "qwen",
  ]);

  const searched = query
    ? models
        .filter((m) => {
          const q = query.toLowerCase();
          return (
            m.name.toLowerCase().includes(q) ||
            m.id.toLowerCase().includes(q) ||
            m.provider.toLowerCase().includes(q)
          );
        })
        .sort((a, b) => {
          const q = query.toLowerCase();
          const aOfficial = OFFICIAL.has(a.provider) ? 1 : 0;
          const bOfficial = OFFICIAL.has(b.provider) ? 1 : 0;
          if (aOfficial !== bOfficial) return bOfficial - aOfficial;
          const aExact = a.name.toLowerCase() === q ? 1 : 0;
          const bExact = b.name.toLowerCase() === q ? 1 : 0;
          return bExact - aExact;
      })
    : models;

  const deprecatedCount = searched.filter(
    (m) => m.status === "deprecated",
  ).length;
  const filtered =
    showDeprecated || deprecatedCount === 0
      ? searched
      : searched.filter((m) => m.status !== "deprecated");

  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const va = getSortValue(a, sortKey);
        const vb = getSortValue(b, sortKey);
        return sortAsc ? va - vb : vb - va;
      })
    : filtered;

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const safePage = Math.min(page, totalPages - 1);
  const paged = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      if (!sortAsc) {
        // third click: reset
        setSortKey(null);
        setSortAsc(true);
      } else {
        setSortAsc(false);
      }
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function sortClass(key: SortKey) {
    if (sortKey !== key) return "";
    return sortAsc ? "asc" : "desc";
  }

  return (
    <div>
      {searchable && (
        <div className="mb-4">
          <Input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search models..."
          />
        </div>
      )}
      <div className="mb-4 flex items-start justify-between gap-4">
        {capLegend()}
        {deprecatedCount > 0 && (
          <button
            className="shrink-0 text-muted-foreground text-xs transition-colors duration-200 hover:text-foreground"
            onClick={() => {
              setShowDeprecated(!showDeprecated);
              setPage(0);
            }}
          >
            {showDeprecated
              ? "Hide deprecated"
              : `Show deprecated (${deprecatedCount})`}
          </button>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          No models found.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md ring-1 ring-border">
          <div className="flex items-center px-4 py-2 text-muted-foreground text-xs uppercase tracking-wider">
            <span className="min-w-0 flex-1">Model</span>
            <span className="hidden w-18 md:block">Caps</span>
            <span
              className={`hidden w-14 text-right sm:block ${sortClass("ctx")}`}
              data-sort="ctx"
              onClick={() => handleSort("ctx")}
            >
              Context
            </span>
            <span
              className={`hidden w-16 text-right sm:block ${sortClass("pin")}`}
              data-sort="pin"
              onClick={() => handleSort("pin")}
            >
              Input
            </span>
            <span
              className={`hidden w-16 text-right sm:block ${sortClass("pout")}`}
              data-sort="pout"
              onClick={() => handleSort("pout")}
            >
              Output
            </span>
          </div>
          {paged.map((m) => {
            const href = `/${m.provider}/${m.id}`;
            const deprecated = m.status === "deprecated";
            return (
              <a
                key={`${m.provider}/${m.id}`}
                href={href}
                className={`flex items-center gap-2 border-border border-t bg-background px-4 py-2.5 transition-colors duration-200 hover:bg-accent ${deprecated ? "opacity-50" : ""}`}
              >
                {showProvider && (
                  <ProviderIcon
                    provider={m.providerIcon ? { icon: m.providerIcon } : null}
                    size={13}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-foreground text-sm">
                    {m.name}
                  </span>
                  <span className="block truncate font-mono text-muted-foreground text-xs">
                    {m.id}
                  </span>
                </div>
                <span className="hidden w-18 shrink-0 md:block">
                  {capBadges(m.capabilities)}
                </span>
                <span className="hidden w-14 shrink-0 text-right font-mono text-muted-foreground text-sm tabular-nums sm:block">
                  {m.context_window ? formatTokens(m.context_window) : ""}
                </span>
                <span className="hidden w-16 shrink-0 text-right text-sm tabular-nums sm:block">
                  {m.pricing?.input != null ? (
                    <span className="font-mono text-foreground">
                      ${m.pricing.input}
                    </span>
                  ) : (
                    ""
                  )}
                </span>
                <span className="hidden w-16 shrink-0 text-right text-sm tabular-nums sm:block">
                  {m.pricing?.output != null ? (
                    <span className="font-mono text-muted-foreground">
                      ${m.pricing.output}
                    </span>
                  ) : (
                    ""
                  )}
                </span>
              </a>
            );
          })}
        </div>
      )}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-muted-foreground text-xs">
          <span>
            {safePage * PAGE_SIZE + 1}–
            {Math.min((safePage + 1) * PAGE_SIZE, sorted.length)} of{" "}
            {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="rounded-md p-1 transition-colors duration-200 hover:bg-accent disabled:opacity-30"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 font-mono tabular-nums">
              {safePage + 1} / {totalPages}
            </span>
            <button
              className="rounded-md p-1 transition-colors duration-200 hover:bg-accent disabled:opacity-30"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
