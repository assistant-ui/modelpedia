"use client";

import { useMemo, useState } from "react";
import { highlight } from "sugar-high";
import { Tabs } from "@/components/ui/tabs";
import { API_BASE } from "@/lib/api-docs-data";

const clients = [
  "Claude Code",
  "Claude Desktop",
  "Cursor",
  "Windsurf",
  "VS Code",
  "Others",
] as const;
type Client = (typeof clients)[number];

const MCP_URL = `${API_BASE}/mcp`;

function configFor(client: Client): { code: string } {
  switch (client) {
    case "Claude Code":
      return {
        code: `claude mcp add modelpedia --transport http ${MCP_URL}`,
      };
    case "Claude Desktop":
      return {
        code: JSON.stringify(
          {
            mcpServers: {
              modelpedia: { type: "url", url: MCP_URL },
            },
          },
          null,
          2,
        ),
      };
    case "Cursor":
      return {
        code: JSON.stringify(
          {
            mcpServers: {
              modelpedia: { url: MCP_URL },
            },
          },
          null,
          2,
        ),
      };
    case "Windsurf":
      return {
        code: JSON.stringify(
          {
            mcpServers: {
              modelpedia: { serverUrl: MCP_URL },
            },
          },
          null,
          2,
        ),
      };
    case "VS Code":
      return {
        code: JSON.stringify(
          {
            servers: {
              modelpedia: { type: "http", url: MCP_URL },
            },
          },
          null,
          2,
        ),
      };
    case "Others":
      return {
        code: MCP_URL,
      };
  }
}

export function McpSetup() {
  const [client, setClient] = useState<Client>("Claude Code");
  const [copied, setCopied] = useState(false);
  const { code } = configFor(client);
  const html = useMemo(() => highlight(code), [code]);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <>
      <Tabs
        items={clients}
        value={client}
        onChange={setClient}
        className="w-fit overflow-x-auto"
      />
      {client === "Others" && (
        <p className="mt-3 text-muted-foreground text-xs">
          Use the Streamable HTTP endpoint URL below with any MCP-compatible
          client. No auth required.
        </p>
      )}
      <div className="mt-3 flex items-start overflow-hidden rounded-md ring-1 ring-border">
        <pre
          className="flex-1 px-4 py-3 font-mono text-foreground text-xs"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <button
          type="button"
          onClick={handleCopy}
          className="m-2 shrink-0 rounded p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
          title="Copy"
        >
          {copied ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      </div>
    </>
  );
}
