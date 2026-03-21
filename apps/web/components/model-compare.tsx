"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PERF_LABELS, SPEED_LABELS } from "@/lib/constants";
import { formatPrice, formatTokens } from "@/lib/format";
import { ModelPicker } from "./model-picker";
import { Tooltip } from "./ui/tooltip";

interface CompareModel {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  family?: string;
  status?: string;
  context_window?: number | null;
  max_output_tokens?: number | null;
  knowledge_cutoff?: string | null;
  performance?: number;
  speed?: number;
  capabilities?: Record<string, boolean>;
  modalities?: { input?: string[]; output?: string[] };
  pricing?: {
    input?: number | null;
    output?: number | null;
    cached_input?: number | null;
    batch_input?: number | null;
    batch_output?: number | null;
  };
}

function CompareRow({
  label,
  a,
  b,
}: {
  label: string;
  a: React.ReactNode;
  b: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr] border-border border-t">
      <div className="flex items-center px-4 py-2.5 text-muted-foreground text-sm">
        {label}
      </div>
      <div className="flex items-center border-border border-l px-4 py-2.5 font-mono text-foreground text-sm">
        {a ?? "—"}
      </div>
      <div className="flex items-center border-border border-l px-4 py-2.5 font-mono text-foreground text-sm">
        {b ?? "—"}
      </div>
    </div>
  );
}

function RatingDots({
  value,
  max = 5,
  labels,
}: {
  value?: number;
  max?: number;
  labels?: string[];
}) {
  if (value == null) return <span>—</span>;
  const description = labels?.[value] ?? `${value}/${max}`;
  return (
    <Tooltip content={description}>
      <span className="flex cursor-default gap-1">
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full ${i < value ? "bg-foreground" : "bg-border"}`}
          />
        ))}
      </span>
    </Tooltip>
  );
}

function CapBadge({ supported }: { supported?: boolean }) {
  if (supported === undefined)
    return <span className="text-muted-foreground">—</span>;
  return supported ? (
    <span className="text-foreground">Yes</span>
  ) : (
    <span className="text-muted-foreground">No</span>
  );
}

const CAP_KEYS = [
  ["reasoning", "Reasoning"],
  ["vision", "Vision"],
  ["tool_call", "Tool calling"],
  ["streaming", "Streaming"],
  ["structured_output", "Structured output"],
  ["json_mode", "JSON mode"],
  ["fine_tuning", "Fine-tuning"],
  ["batch", "Batch"],
];

function CompareInner({ models }: { models: CompareModel[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const modelA = searchParams.get("a");
  const modelB = searchParams.get("b");

  const a = modelA
    ? models.find((m) => `${m.provider}/${m.id}` === modelA)
    : null;
  const b = modelB
    ? models.find((m) => `${m.provider}/${m.id}` === modelB)
    : null;

  function setModels(aKey: string | null, bKey: string | null) {
    const params = new URLSearchParams();
    if (aKey) params.set("a", aKey);
    if (bKey) params.set("b", bKey);
    const qs = params.toString();
    router.push(qs ? `/compare?${qs}` : "/compare");
  }

  return (
    <div>
      <div className="mb-8 flex gap-4">
        <ModelPicker
          models={models}
          selected={modelA}
          onSelect={(key) => setModels(key, modelB)}
          label="Select model A"
        />
        <ModelPicker
          models={models}
          selected={modelB}
          onSelect={(key) => setModels(modelA, key)}
          label="Select model B"
        />
      </div>

      {a && b ? (
        <div className="overflow-hidden rounded-md ring-1 ring-border">
          <div className="grid grid-cols-[1fr_1fr_1fr]">
            <div className="px-4 py-3 text-muted-foreground text-xs uppercase tracking-wider" />
            <div className="border-border border-l px-4 py-3">
              <a
                href={`/${a.provider}/${a.id}`}
                className="font-medium text-foreground text-sm transition-colors duration-200 hover:text-accent-foreground"
              >
                {a.name}
              </a>
              <div className="font-mono text-muted-foreground text-xs">
                {a.providerName}
              </div>
            </div>
            <div className="border-border border-l px-4 py-3">
              <a
                href={`/${b.provider}/${b.id}`}
                className="font-medium text-foreground text-sm transition-colors duration-200 hover:text-accent-foreground"
              >
                {b.name}
              </a>
              <div className="font-mono text-muted-foreground text-xs">
                {b.providerName}
              </div>
            </div>
          </div>

          <CompareRow label="Status" a={a.status ?? "—"} b={b.status ?? "—"} />
          <CompareRow
            label="Context window"
            a={a.context_window ? formatTokens(a.context_window) : null}
            b={b.context_window ? formatTokens(b.context_window) : null}
          />
          <CompareRow
            label="Max output"
            a={a.max_output_tokens ? formatTokens(a.max_output_tokens) : null}
            b={b.max_output_tokens ? formatTokens(b.max_output_tokens) : null}
          />
          <CompareRow
            label="Knowledge cutoff"
            a={a.knowledge_cutoff}
            b={b.knowledge_cutoff}
          />
          <CompareRow
            label="Performance"
            a={<RatingDots value={a.performance} labels={PERF_LABELS} />}
            b={<RatingDots value={b.performance} labels={PERF_LABELS} />}
          />
          <CompareRow
            label="Speed"
            a={<RatingDots value={a.speed} labels={SPEED_LABELS} />}
            b={<RatingDots value={b.speed} labels={SPEED_LABELS} />}
          />

          <CompareRow
            label="Input price"
            a={formatPrice(a.pricing?.input)}
            b={formatPrice(b.pricing?.input)}
          />
          <CompareRow
            label="Output price"
            a={formatPrice(a.pricing?.output)}
            b={formatPrice(b.pricing?.output)}
          />
          <CompareRow
            label="Cached input"
            a={formatPrice(a.pricing?.cached_input)}
            b={formatPrice(b.pricing?.cached_input)}
          />

          {CAP_KEYS.map(([key, label]) => (
            <CompareRow
              key={key}
              label={label}
              a={<CapBadge supported={a.capabilities?.[key]} />}
              b={<CapBadge supported={b.capabilities?.[key]} />}
            />
          ))}

          <CompareRow
            label="Input modalities"
            a={a.modalities?.input?.join(", ")}
            b={b.modalities?.input?.join(", ")}
          />
          <CompareRow
            label="Output modalities"
            a={a.modalities?.output?.join(", ")}
            b={b.modalities?.output?.join(", ")}
          />
        </div>
      ) : (
        <div className="text-balance py-16 text-center text-muted-foreground text-sm">
          Select two models to compare
        </div>
      )}
    </div>
  );
}

export function ModelCompare({ models }: { models: CompareModel[] }) {
  return (
    <Suspense>
      <CompareInner models={models} />
    </Suspense>
  );
}
