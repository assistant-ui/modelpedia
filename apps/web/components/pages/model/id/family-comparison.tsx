"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { cn } from "@/lib/cn";
import { CAP_BADGES } from "@/lib/constants";
import type { Model, ModelCapabilities } from "@/lib/data";
import { formatPrice, formatTokens } from "@/lib/format";

function MiniDots({ value, max = 5 }: { value?: number; max?: number }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i < value ? "bg-foreground" : "bg-border",
          )}
        />
      ))}
    </span>
  );
}

function capBadges(caps: ModelCapabilities | undefined) {
  if (!caps) return null;
  return (
    <span className="flex gap-0.5">
      {CAP_BADGES.map(([key, letter]) => {
        const val = caps[key as keyof ModelCapabilities];
        if (val === true) {
          return (
            <span
              key={key}
              className="flex h-3.5 w-3.5 items-center justify-center rounded bg-muted text-[9px] text-muted-foreground"
            >
              {letter}
            </span>
          );
        }
        if (val == null) {
          return (
            <span
              key={key}
              className="flex h-3.5 w-3.5 items-center justify-center rounded bg-muted text-[9px] text-muted-foreground/30"
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

function tokenColumn(
  key: "context_window" | "max_output_tokens",
  header: string,
): ColumnDef<Model> {
  return {
    accessorKey: key,
    header,
    sortingFn: "basic",
    cell: ({ row }) => {
      const v = row.original[key];
      return (
        <span className="font-mono text-muted-foreground text-xs tabular-nums">
          {v != null ? formatTokens(v) : "—"}
        </span>
      );
    },
  };
}

const columns: ColumnDef<Model>[] = [
  {
    id: "model",
    header: "Model",
    enableSorting: false,
    cell: ({ row }) => {
      const m = row.original;
      return (
        <div
          className={cn(
            "flex items-center gap-2",
            m.status === "deprecated" && "opacity-50",
          )}
        >
          <span className="text-foreground">{m.name}</span>
          {capBadges(m.capabilities)}
        </div>
      );
    },
  },
  {
    id: "perf",
    header: "Perf",
    enableSorting: false,
    meta: {
      className: "hidden sm:table-cell",
      headerClassName: "hidden sm:table-cell",
    },
    cell: ({ row }) => <MiniDots value={row.original.performance} />,
  },
  {
    id: "speed",
    header: "Speed",
    enableSorting: false,
    meta: {
      className: "hidden sm:table-cell",
      headerClassName: "hidden sm:table-cell",
    },
    cell: ({ row }) => <MiniDots value={row.original.speed} />,
  },
  tokenColumn("context_window", "Context"),
  tokenColumn("max_output_tokens", "Max out"),
  {
    id: "input_price",
    accessorFn: (row) => row.pricing?.input ?? -1,
    header: "Input",
    sortingFn: "basic",
    cell: ({ row }) => (
      <span className="font-mono text-foreground tabular-nums">
        {formatPrice(row.original.pricing?.input)}
      </span>
    ),
  },
  {
    id: "output_price",
    accessorFn: (row) => row.pricing?.output ?? -1,
    header: "Output",
    sortingFn: "basic",
    cell: ({ row }) => (
      <span className="font-mono text-muted-foreground tabular-nums">
        {formatPrice(row.original.pricing?.output)}
      </span>
    ),
  },
];

export function FamilyComparison({
  models,
  currentId,
  provider,
}: {
  models: Model[];
  currentId: string;
  provider: string;
}) {
  return (
    <DataTable
      columns={columns}
      data={models}
      pageSize={100}
      getRowHref={(m) => (m.id === currentId ? "" : `/${provider}/${m.id}`)}
      getRowClassName={(m) => (m.id === currentId ? "bg-accent" : "")}
    />
  );
}
