"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { ProviderIcon } from "@/components/provider-icon";
import { CAP_LABELS } from "@/lib/constants";
import { formatPrice, formatTokens } from "@/lib/format";
import { DataTable } from "./data-table";
import { Checkbox } from "./ui/checkbox";

export interface ModelItem {
  id: string;
  name: string;
  provider: string;
  status?: string;
  context_window?: number | null;
  capabilities?: Record<string, boolean>;
  pricing?: { input?: number | null; output?: number | null };
  providerIcon?: string;
}

function modelFilterFn(row: ModelItem, query: string): boolean {
  const q = query.toLowerCase();
  return (
    row.name.toLowerCase().includes(q) ||
    row.id.toLowerCase().includes(q) ||
    row.provider.toLowerCase().includes(q)
  );
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

function buildColumns(showProvider?: boolean): ColumnDef<ModelItem>[] {
  return [
    {
      id: "model",
      accessorFn: (row) => row.name,
      header: "Model",
      enableSorting: false,
      cell: ({ row }) => {
        const m = row.original;
        return (
          <a
            href={`/${m.provider}/${m.id}`}
            className={`flex items-center gap-2 transition-colors duration-200 hover:text-accent-foreground ${m.status === "deprecated" ? "opacity-50" : ""}`}
          >
            {showProvider && (
              <ProviderIcon
                provider={m.providerIcon ? { icon: m.providerIcon } : null}
                size={13}
              />
            )}
            <div className="min-w-0">
              <span className="block truncate text-foreground text-sm">
                {m.name}
              </span>
              <span className="block truncate font-mono text-muted-foreground text-xs">
                {m.id}
              </span>
            </div>
          </a>
        );
      },
    },
    {
      id: "caps",
      header: "Caps",
      enableSorting: false,
      meta: {
        className: "hidden md:table-cell",
        headerClassName: "hidden md:table-cell",
      },
      cell: ({ row }) => capBadges(row.original.capabilities),
    },
    {
      accessorKey: "context_window",
      header: "Context",
      sortingFn: "basic",
      meta: {
        className: "hidden sm:table-cell",
        headerClassName: "hidden sm:table-cell",
      },
      cell: ({ row }) => {
        const v = row.original.context_window;
        return v ? (
          <span className="font-mono text-muted-foreground text-sm tabular-nums">
            {formatTokens(v)}
          </span>
        ) : null;
      },
    },
    {
      id: "pricing",
      accessorFn: (row) => row.pricing?.input ?? -1,
      header: "Pricing",
      sortingFn: "basic",
      meta: {
        className: "hidden sm:table-cell",
        headerClassName: "hidden sm:table-cell",
      },
      cell: ({ row }) => {
        const p = row.original.pricing;
        if (p?.input == null && p?.output == null) return null;
        return (
          <span className="font-mono tabular-nums">
            <span className="block text-foreground text-sm">
              {formatPrice(p?.input)}
            </span>
            <span className="block text-muted-foreground text-xs">
              {formatPrice(p?.output)}
            </span>
          </span>
        );
      },
    },
  ];
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
  const [showDeprecated, setShowDeprecated] = useState(false);

  const deprecatedCount = models.filter(
    (m) => m.status === "deprecated",
  ).length;

  const data =
    showDeprecated || deprecatedCount === 0
      ? models
      : models.filter((m) => m.status !== "deprecated");

  const columns = buildColumns(showProvider);

  return (
    <DataTable
      columns={columns}
      data={data}
      searchable={searchable}
      searchPlaceholder="Search models..."
      initialQuery={initialQuery}
      globalFilterFn={modelFilterFn}
      toolbar={
        <div className="flex items-center justify-between gap-4">
          {capLegend()}
          {deprecatedCount > 0 && (
            <Checkbox
              checked={showDeprecated}
              onCheckedChange={(v) => setShowDeprecated(v === true)}
              label={`Show deprecated (${deprecatedCount})`}
              className="shrink-0 text-muted-foreground text-xs"
            />
          )}
        </div>
      }
    />
  );
}
