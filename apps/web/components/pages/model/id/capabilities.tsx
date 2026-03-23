import {
  Braces,
  Brain,
  Eye,
  Hammer,
  Layers,
  Lightbulb,
  Play,
  SlidersHorizontal,
} from "lucide-react";
import { InheritedBadge } from "@/components/shared/model-detail";
import { Section } from "@/components/ui/section";
import { cn } from "@/lib/cn";
import type { EnrichedModel } from "@/lib/data";

const CAP_MAP = {
  vision: { label: "vision", icon: Eye },
  tool_call: { label: "tool call", icon: Hammer },
  structured_output: { label: "structured output", icon: Braces },
  reasoning: { label: "reasoning", icon: Brain },
  json_mode: { label: "json mode", icon: Lightbulb },
  streaming: { label: "streaming", icon: Play },
  fine_tuning: { label: "fine tuning", icon: SlidersHorizontal },
  batch: { label: "batch", icon: Layers },
} as const;

const CAP_KEYS = Object.keys(CAP_MAP) as (keyof typeof CAP_MAP)[];

export function CapabilitiesGrid({
  model,
  inherited,
}: {
  model: EnrichedModel;
  inherited?: Set<string>;
}) {
  return (
    <Section id="capabilities" title="Capabilities">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-4">
        {CAP_KEYS.map((key) => {
          const val = model.capabilities?.[key];
          const { label, icon: Icon } = CAP_MAP[key];
          const isInherited = inherited?.has(`capabilities.${key}`);
          return (
            <div
              key={key}
              className="flex items-center gap-2 bg-background px-3 py-2.5"
            >
              <Icon
                size={14}
                className={cn(
                  "shrink-0",
                  val === true ? "text-foreground" : "text-muted-foreground/40",
                )}
              />
              <span
                className={cn(
                  "flex-1 text-sm",
                  val === true ? "text-foreground" : "text-muted-foreground/40",
                )}
              >
                {label}
              </span>
              {isInherited && <InheritedBadge from={model.inheritedFrom} />}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
