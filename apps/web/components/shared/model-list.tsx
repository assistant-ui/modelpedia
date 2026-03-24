"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { ProviderIcon } from "@/components/shared/provider-icon";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { CAP_LABELS } from "@/lib/constants";
import type { ModelCapabilities } from "@/lib/data";
import { formatPrice, formatTokens } from "@/lib/format";

export interface ModelItem {
  id: string;
  name: string;
  provider: string;
  created_by?: string;
  family?: string;
  status?: string;
  model_type?: string;
  context_window?: number | null;
  capabilities?: ModelCapabilities;
  pricing?: { input?: number | null; output?: number | null };
  providerIcon?: string;
  license?: string;
  parameters?: number | null;
  active_parameters?: number | null;
  [key: string]: unknown;
}

function modelFilterFn(row: ModelItem, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const target =
    `${row.name} ${row.id} ${row.provider} ${row.created_by ?? ""} ${row.family ?? ""}`.toLowerCase();
  return terms.every((t) => target.includes(t));
}

function capBadges(caps: ModelCapabilities | undefined) {
  if (!caps) return null;
  return (
    <span className="flex gap-0.5">
      {CAP_LABELS.map(([key, letter]) => {
        const val = caps[key as keyof ModelCapabilities];
        if (val === true) {
          return (
            <span
              key={key}
              className="flex h-4 w-4 items-center justify-center rounded bg-muted text-[10px] text-foreground"
              title={key.replace(/_/g, " ")}
            >
              {letter}
            </span>
          );
        }
        if (val == null) {
          return (
            <span
              key={key}
              className="flex h-4 w-4 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground/30"
              title={`${key.replace(/_/g, " ")} (no data)`}
            >
              {letter}
            </span>
          );
        }
        return null;
      })}
    </span>
  );
}

function buildColumns(showProvider?: boolean): ColumnDef<ModelItem>[] {
  return [
    {
      id: "model",
      accessorFn: (row) => row.name,
      header: "Model",
      enableSorting: false,
      meta: { className: "max-w-0 w-full" },
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div
            className={cn(
              "flex min-w-0 items-center gap-2",
              m.status === "deprecated" && "opacity-50",
            )}
          >
            {showProvider && (
              <ProviderIcon
                provider={m.providerIcon ? { icon: m.providerIcon } : null}
                size={13}
              />
            )}
            <div className="min-w-0 overflow-hidden">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-foreground text-sm">
                  {m.name}
                </span>
                {m.license && m.license !== "proprietary" && (
                  <Badge
                    variant="green"
                    title={m.license}
                    className="shrink-0 text-[10px]"
                  >
                    OSS
                  </Badge>
                )}
              </span>
              <span className="truncate font-mono text-muted-foreground text-xs">
                {m.id}
              </span>
            </div>
          </div>
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
  const [typeFilter, setTypeFilter] = useState("");
  const [capFilters, setCapFilters] = useState<Set<string>>(new Set());
  const [ossOnly, setOssOnly] = useState(false);

  function toggleCap(key: string) {
    setCapFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const deprecatedCount = models.filter(
    (m) => m.status === "deprecated",
  ).length;

  const types = [
    ...new Set(models.map((m) => m.model_type).filter(Boolean)),
  ].sort();

  let data =
    showDeprecated || deprecatedCount === 0
      ? models
      : models.filter((m) => m.status !== "deprecated");

  if (typeFilter) {
    data = data.filter((m) => m.model_type === typeFilter);
  }

  if (capFilters.size > 0) {
    data = data.filter((m) =>
      [...capFilters].every(
        (cap) => m.capabilities?.[cap as keyof ModelCapabilities],
      ),
    );
  }

  if (ossOnly) {
    data = data.filter((m) => m.license && m.license !== "proprietary");
  }

  const columns = buildColumns(showProvider);

  return (
    <DataTable
      columns={columns}
      data={data}
      searchable={searchable}
      searchPlaceholder="Search models..."
      initialQuery={initialQuery}
      globalFilterFn={modelFilterFn}
      getRowHref={(m) => `/${m.provider}/${m.id}`}
      toolbar={
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            {types.length > 1 && (
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <span>Type</span>
                <Select
                  value={typeFilter}
                  onValueChange={(v) => setTypeFilter(v ?? "")}
                  items={{
                    "": "All",
                    ...Object.fromEntries(types.map((t) => [t, t])),
                  }}
                >
                  <SelectTrigger />
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    {types.map((t) => (
                      <SelectItem key={t} value={t!}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Checkbox
              checked={ossOnly}
              onCheckedChange={(v) => setOssOnly(v === true)}
              label="OSS"
              className="shrink-0 text-muted-foreground text-xs"
            />
            {deprecatedCount > 0 && (
              <Checkbox
                checked={showDeprecated}
                onCheckedChange={(v) => setShowDeprecated(v === true)}
                label={`Show deprecated (${deprecatedCount})`}
                className="shrink-0 text-muted-foreground text-xs"
              />
            )}
          </div>
          <div className="hidden flex-wrap gap-x-1 gap-y-1 md:flex">
            {CAP_LABELS.map(([key, letter]) => {
              const active = capFilters.has(key);
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => toggleCap(key)}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors",
                    active
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground/60 hover:text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-3.5 w-3.5 items-center justify-center rounded text-[9px]",
                      active
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {letter}
                  </span>
                  {key.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>
        </div>
      }
    />
  );
}
