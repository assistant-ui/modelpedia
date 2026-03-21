"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toastManager } from "./ui/toast";

/** Map endpoint keys to display label, description, API path, and HTTP method. */
const ENDPOINT_MAP: Record<
  string,
  { label: string; desc: string; method: string; path: string }
> = {
  chat_completions: {
    label: "Chat Completions",
    desc: "Generate chat responses with messages",
    method: "POST",
    path: "/v1/chat/completions",
  },
  responses: {
    label: "Responses",
    desc: "Stateful multi-turn conversations",
    method: "POST",
    path: "/v1/responses",
  },
  batch: {
    label: "Batch",
    desc: "Async batch processing at lower cost",
    method: "POST",
    path: "/v1/batches",
  },
  assistants: {
    label: "Assistants",
    desc: "Persistent assistants with tools and files",
    method: "POST",
    path: "/v1/assistants",
  },
  fine_tuning: {
    label: "Fine-tuning",
    desc: "Train custom models on your data",
    method: "POST",
    path: "/v1/fine_tuning/jobs",
  },
  embeddings: {
    label: "Embeddings",
    desc: "Generate vector embeddings for text",
    method: "POST",
    path: "/v1/embeddings",
  },
  image_generation: {
    label: "Image Generation",
    desc: "Generate images from text prompts",
    method: "POST",
    path: "/v1/images/generations",
  },
  image_edit: {
    label: "Image Edit",
    desc: "Edit images with text instructions",
    method: "POST",
    path: "/v1/images/edits",
  },
  realtime: {
    label: "Realtime",
    desc: "Low-latency streaming via WebSocket",
    method: "WS",
    path: "/v1/realtime",
  },
  speech_generation: {
    label: "Speech",
    desc: "Convert text to spoken audio",
    method: "POST",
    path: "/v1/audio/speech",
  },
  transcription: {
    label: "Transcription",
    desc: "Convert audio to text",
    method: "POST",
    path: "/v1/audio/transcriptions",
  },
  translation: {
    label: "Translation",
    desc: "Translate audio to English text",
    method: "POST",
    path: "/v1/audio/translations",
  },
  moderation: {
    label: "Moderation",
    desc: "Check content against usage policies",
    method: "POST",
    path: "/v1/moderations",
  },
  completions: {
    label: "Completions",
    desc: "Legacy text completion",
    method: "POST",
    path: "/v1/completions",
  },
  videos: {
    label: "Video Generation",
    desc: "Generate videos from text prompts",
    method: "POST",
    path: "/v1/videos/generations",
  },
};

/** Map tool keys to display label + description. */
const TOOL_MAP: Record<string, { label: string; desc: string }> = {
  function_calling: {
    label: "Function Calling",
    desc: "Call external functions and APIs",
  },
  web_search: { label: "Web Search", desc: "Search the web for information" },
  file_search: {
    label: "File Search",
    desc: "Search across uploaded files",
  },
  image_generation: {
    label: "Image Generation",
    desc: "Generate images inline",
  },
  code_interpreter: {
    label: "Code Interpreter",
    desc: "Execute code in a sandbox",
  },
  mcp: {
    label: "MCP",
    desc: "Connect to Model Context Protocol servers",
  },
  computer_use: {
    label: "Computer Use",
    desc: "Control a virtual desktop",
  },
  hosted_shell: {
    label: "Hosted Shell",
    desc: "Run shell commands in a container",
  },
  apply_patch: { label: "Apply Patch", desc: "Apply code patches to files" },
  skills: { label: "Skills", desc: "Use built-in skill modules" },
  tool_search: { label: "Tool Search", desc: "Discover and use tools" },
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toastManager.add({ description: `Copied ${value}`, timeout: 2000 });
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-auto shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      title={`Copy ${value}`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

export function EndpointList({
  endpoints,
  apiUrl,
}: {
  endpoints: string[];
  apiUrl?: string;
}) {
  return (
    <div className="overflow-hidden rounded-md ring-1 ring-border">
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
            className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-border border-t" : ""}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-foreground text-sm">{label}</span>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {method}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                {desc && (
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {desc}
                  </span>
                )}
                <code className="min-w-0 truncate font-mono text-muted-foreground/60 text-xs">
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
    <div className="overflow-hidden rounded-md ring-1 ring-border">
      {tools.map((tool, i) => {
        const mapped = TOOL_MAP[tool];
        const label = mapped?.label ?? tool.replace(/_/g, " ");
        const desc = mapped?.desc;
        return (
          <div
            key={tool}
            className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-border border-t" : ""}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-foreground text-sm">{label}</span>
                <code className="font-mono text-muted-foreground/60 text-xs">
                  {tool}
                </code>
              </div>
              {desc && (
                <div className="mt-0.5 text-muted-foreground text-xs">
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
