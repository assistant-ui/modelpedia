"use client";

import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/cn";
import { ENDPOINT_MAP, TOOL_MAP } from "@/lib/endpoint-constants";

export function EndpointList({
  endpoints,
  apiUrl,
}: {
  endpoints: string[];
  apiUrl?: string;
}) {
  return (
    <div className="ring-border overflow-hidden rounded-md ring-1">
      {endpoints.map((ep, i) => {
        const mapped = ENDPOINT_MAP[ep];
        const label = mapped?.label ?? ep.replace(/_/g, " ");
        const desc = mapped?.desc;
        const path = mapped?.path ?? `/${ep.replace(/_/g, "-")}`;
        const method = mapped?.method ?? "POST";
        const fullUrl = apiUrl
          ? `${apiUrl.replace(/\/v1\/?$/, "")}${path}`
          : path;

        return (
          <div
            key={ep}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5",
              i > 0 && "border-border border-t",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-foreground text-sm">{label}</span>
                <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px]">
                  {method}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                {desc && (
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {desc}
                  </span>
                )}
                <code className="text-muted-foreground/60 min-w-0 truncate font-mono text-xs">
                  {fullUrl}
                </code>
              </div>
            </div>
            <CopyButton value={fullUrl} />
          </div>
        );
      })}
    </div>
  );
}

export function ToolList({ tools }: { tools: string[] }) {
  return (
    <div className="ring-border overflow-hidden rounded-md ring-1">
      {tools.map((tool, i) => {
        const mapped = TOOL_MAP[tool];
        const label = mapped?.label ?? tool.replace(/_/g, " ");
        const desc = mapped?.desc;
        return (
          <div
            key={tool}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5",
              i > 0 && "border-border border-t",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-foreground text-sm">{label}</span>
                <code className="text-muted-foreground/60 font-mono text-xs">
                  {tool}
                </code>
              </div>
              {desc && (
                <div className="text-muted-foreground mt-0.5 text-xs">
                  {desc}
                </div>
              )}
            </div>
            <CopyButton value={tool} />
          </div>
        );
      })}
    </div>
  );
}
