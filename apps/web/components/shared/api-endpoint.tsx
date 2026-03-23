"use client";

import { useState } from "react";
import { highlight } from "sugar-high";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

function buttonLabel(loading: boolean, visible: boolean): string {
  if (loading) return "...";
  if (visible) return "Hide";
  return "Try";
}

export function ApiEndpoint({
  path,
  tryPath,
  description,
  params,
}: {
  path: string;
  tryPath?: string;
  description?: string;
  params?: [string, string][];
}) {
  const [html, setHtml] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleTry() {
    if (html) {
      setVisible(!visible);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(tryPath ?? path);
      const json = await res.json();
      const full = JSON.stringify(json, null, 2);
      const MAX_LINES = 200;
      const lines = full.split("\n");
      const truncated =
        lines.length > MAX_LINES
          ? `${lines.slice(0, MAX_LINES).join("\n")}\n\n// ... ${lines.length - MAX_LINES} more lines`
          : full;
      const escaped = truncated
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      setHtml(highlight(escaped));
      setVisible(true);
    } catch {
      setHtml("Request failed");
      setVisible(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-md ring-1 ring-border">
      <div className="flex items-center gap-3 px-4 py-2 text-sm">
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
          GET
        </span>
        <code className="shrink-0 text-foreground">{path}</code>
        {description && (
          <span className="text-muted-foreground text-xs">{description}</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto shrink-0"
          onClick={handleTry}
        >
          {buttonLabel(loading, visible)}
        </Button>
      </div>
      {params && (
        <div className="mx-4 mb-3 overflow-hidden rounded text-xs ring-1 ring-border">
          {params.map(([name, desc], i) => (
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
      {visible && (
        <div className="border-border border-t">
          <pre
            className="max-h-80 overflow-auto px-4 py-3 text-foreground text-xs"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      )}
    </div>
  );
}
