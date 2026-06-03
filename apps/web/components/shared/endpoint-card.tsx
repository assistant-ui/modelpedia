"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import type { McpTool } from "@/lib/api-docs-data";
import { cn } from "@/lib/cn";
import { ApiEndpoint } from "./api-endpoint";

const tabItems = ["REST", "MCP"] as const;
type Tab = (typeof tabItems)[number];

function McpToolView({ tool }: { tool: McpTool }) {
  return (
    <div className="ring-border overflow-hidden rounded-md ring-1">
      <div className="flex h-11 items-center gap-3 px-4 text-sm">
        <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
          TOOL
        </span>
        <code className="text-foreground shrink-0">{tool.name}</code>
        <span className="text-muted-foreground hidden text-xs sm:inline">
          {tool.desc}
        </span>
      </div>
      {tool.params && (
        <div className="ring-border mx-4 mb-3 overflow-hidden rounded text-xs ring-1">
          {tool.params.map(([name, desc], i) => (
            <div
              key={name}
              className={cn(
                "grid grid-cols-1 px-3 py-2 sm:grid-cols-[1fr_2fr]",
                i > 0 && "border-border border-t",
              )}
            >
              <code className="text-foreground">{name}</code>
              <span className="text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EndpointCard({
  path,
  tryPath,
  description,
  params,
  mcp,
}: {
  path: string;
  tryPath: string;
  description: string;
  params?: [string, string][];
  mcp?: McpTool;
}) {
  const [tab, setTab] = useState<Tab>("REST");

  if (!mcp) {
    return (
      <ApiEndpoint
        path={path}
        tryPath={tryPath}
        description={description}
        params={params}
      />
    );
  }

  return (
    <div className="space-y-3">
      <Tabs items={tabItems} value={tab} onChange={setTab} className="w-fit" />
      {tab === "REST" ? (
        <ApiEndpoint
          path={path}
          tryPath={tryPath}
          description={description}
          params={params}
        />
      ) : (
        <McpToolView tool={mcp} />
      )}
    </div>
  );
}
