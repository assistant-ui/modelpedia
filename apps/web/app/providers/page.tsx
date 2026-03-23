"use client";

import { useState } from "react";
import { ProviderIcon } from "@/components/shared/provider-icon";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { TYPE_LABELS } from "@/lib/constants";
import { providers } from "@/lib/data";
import { sortProviders } from "@/lib/sort";

const SECTION_ORDER = ["direct", "cloud", "aggregator"] as const;

const TYPE_BADGE_VARIANT: Record<string, "blue" | "orange" | "purple"> = {
  direct: "blue",
  cloud: "orange",
  aggregator: "purple",
};

export default function ProvidersPage() {
  const [compatOnly, setCompatOnly] = useState(false);

  const filtered = compatOnly
    ? providers.filter((p) => p.openai_compatible)
    : providers;

  const grouped = Object.groupBy(filtered, (p) => p.type ?? "direct");

  return (
    <>
      <PageHeader
        title="Providers"
        count={providers.length}
        sub="AI model providers and platforms"
      />
      <div className="mb-6">
        <Checkbox
          checked={compatOnly}
          onCheckedChange={(val) => setCompatOnly(val as boolean)}
          label="OpenAI compatible"
        />
      </div>
      <div className="space-y-8">
        {SECTION_ORDER.map((type) => {
          const list = grouped[type];
          if (!list?.length) return null;
          const sorted = sortProviders(list);

          return (
            <section key={type}>
              <div className="mb-3 flex items-center gap-2">
                <Badge variant={TYPE_BADGE_VARIANT[type]}>
                  {TYPE_LABELS[type]}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {list.length} providers ·{" "}
                  {list.reduce((sum, p) => sum + p.models.length, 0)} models
                </span>
              </div>
              <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-2 lg:grid-cols-3">
                {sorted.map((p) => {
                  const empty = p.models.length === 0;
                  return (
                    <a
                      key={p.id}
                      href={`/${p.id}`}
                      className={cn(
                        "flex items-center gap-3 bg-background px-4 py-3.5 transition-colors duration-200 hover:bg-accent",
                        empty && "opacity-50",
                      )}
                    >
                      <ProviderIcon provider={p} size={16} />
                      <div className="min-w-0 flex-1">
                        <span className="truncate text-foreground text-sm">
                          {p.name}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
                        {p.models.length || "—"}
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
