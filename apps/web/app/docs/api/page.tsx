import type { Metadata } from "next";
import { ApiEndpoint } from "@/components/api-endpoint";
import { PageHeader } from "@/components/ui/page-header";
import { Row } from "@/components/ui/row";

export const metadata: Metadata = {
  title: "API",
  description:
    "REST API reference for querying AI models, providers, and capabilities. JSON, no auth, CORS enabled.",
};

const API_BASE = "https://api.modelpedia.dev";

const sections: {
  title: string;
  endpoints: {
    path: string;
    desc: string;
    tryPath: string;
    params?: [string, string][];
  }[];
}[] = [
  {
    title: "Overview",
    endpoints: [
      {
        path: "/v1/stats",
        desc: "Registry statistics: provider, model, family, creator counts.",
        tryPath: `${API_BASE}/v1/stats`,
      },
      {
        path: "/v1/search",
        desc: "Unified search across providers and models.",
        tryPath: `${API_BASE}/v1/search?q=gpt`,
        params: [
          ["q", "Search query (min 2 chars, required)"],
          ["limit", "Max model results (default 20, max 50)"],
        ],
      },
    ],
  },
  {
    title: "Providers",
    endpoints: [
      {
        path: "/v1/providers",
        desc: "All providers with model counts.",
        tryPath: `${API_BASE}/v1/providers`,
      },
      {
        path: "/v1/providers/:id",
        desc: "Single provider with full details and models.",
        tryPath: `${API_BASE}/v1/providers/openai`,
      },
    ],
  },
  {
    title: "Models",
    endpoints: [
      {
        path: "/v1/models",
        desc: "List models. Filterable, sortable, paginated.",
        tryPath: `${API_BASE}/v1/models?capability=reasoning&sort=price_input&limit=5`,
        params: [
          ["provider", "Filter by provider id"],
          ["family", "Filter by model family"],
          ["creator", "Filter by original creator"],
          ["status", "active | deprecated | preview"],
          [
            "capability",
            "reasoning | vision | tool_call | streaming | structured_output | json_mode | fine_tuning | batch",
          ],
          ["q", "Search across id, name, description"],
          ["sort", "name | context_window | price_input | price_output"],
          ["order", "asc (default) | desc"],
          ["limit", "Max 500, default 100"],
          ["offset", "Default 0"],
        ],
      },
      {
        path: "/v1/models/:provider/:id",
        desc: "Single model details. Supports / in IDs.",
        tryPath: `${API_BASE}/v1/models/openai/gpt-4o`,
      },
      {
        path: "/v1/models/compare",
        desc: "Compare up to 10 models side by side.",
        tryPath: `${API_BASE}/v1/models/compare?ids=openai/gpt-4o,anthropic/claude-sonnet-4-6`,
        params: [
          ["ids", "Comma-separated provider/model IDs (2–10, required)"],
        ],
      },
    ],
  },
  {
    title: "Taxonomy",
    endpoints: [
      {
        path: "/v1/families",
        desc: "Model families with counts and metadata.",
        tryPath: `${API_BASE}/v1/families`,
      },
      {
        path: "/v1/capabilities",
        desc: "All capabilities with model and provider counts.",
        tryPath: `${API_BASE}/v1/capabilities`,
      },
    ],
  },
];

export default function ApiDocsPage() {
  return (
    <>
      <PageHeader
        title="API Reference"
        sub="REST API for querying models, providers, and capabilities"
      />
      <div className="mb-8 overflow-hidden rounded-md ring-1 ring-border">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-muted-foreground text-sm">Base URL</span>
          <code className="font-mono text-foreground text-sm">
            {API_BASE}/v1
          </code>
        </div>
        <div className="flex items-center justify-between border-border border-t px-4 py-3">
          <span className="text-muted-foreground text-sm">Format</span>
          <span className="text-foreground text-sm">
            JSON (append{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              ?pretty
            </code>{" "}
            for formatted output)
          </span>
        </div>
      </div>

      {sections.map((section) => (
        <div key={section.title} className="mb-10">
          <h2 className="mb-4 text-muted-foreground text-sm">
            {section.title}
          </h2>
          <div className="space-y-4">
            {section.endpoints.map((ep) => (
              <ApiEndpoint
                key={ep.path}
                path={ep.path}
                tryPath={ep.tryPath}
                description={ep.desc}
                params={ep.params}
              />
            ))}
          </div>
        </div>
      ))}

      <h2 className="mb-4 text-muted-foreground text-sm">Response format</h2>
      <div className="mb-10 overflow-hidden rounded-md text-sm ring-1 ring-border">
        <div className="flex items-baseline gap-4 border-border border-b px-4 py-2.5">
          <span className="w-24 shrink-0 text-muted-foreground">Success</span>
          <code className="text-muted-foreground">
            {'{ "data": ..., "meta": { "total", "limit", "offset" } }'}
          </code>
        </div>
        <div className="flex items-baseline gap-4 border-border border-b px-4 py-2.5">
          <span className="w-24 shrink-0 text-muted-foreground">Error</span>
          <code className="text-muted-foreground">
            {'{ "error": { "message", "status" } }'}
          </code>
        </div>
      </div>

      <h2 className="mb-4 text-muted-foreground text-sm">Conventions</h2>
      <div className="mb-10 overflow-hidden rounded-md text-sm ring-1 ring-border">
        <Row label="Field present" value="Known value" />
        <Row label="Field omitted" value="Unknown" />
        <Row label="Field is null" value="Not applicable" />
        <Row label="pricing.*" value="USD per 1M tokens" />
        <Row label="context_window" value="Token count" />
        <Row label="capabilities.*" value="Boolean flags (true = supported)" />
        <Row
          label="modalities.*"
          value='Array of: "text", "image", "audio", "video"'
        />
        <Row label="performance / speed" value="1–5 scale" />
        <Row label="status" value='"active" | "deprecated" | "preview"' />
      </div>

      <h2 className="mb-4 text-muted-foreground text-sm">Markdown format</h2>
      <div className="overflow-hidden rounded-md text-sm ring-1 ring-border">
        <div className="flex items-baseline gap-4 border-border border-b px-4 py-2.5">
          <span className="w-32 shrink-0 text-muted-foreground">
            Query param
          </span>
          <code className="text-foreground">?format=md</code>
        </div>
        <div className="flex items-baseline gap-4 border-border border-b px-4 py-2.5">
          <span className="w-32 shrink-0 text-muted-foreground">
            Accept header
          </span>
          <code className="text-foreground">Accept: text/markdown</code>
        </div>
        <div className="flex items-baseline gap-4 px-4 py-2.5">
          <span className="w-32 shrink-0 text-muted-foreground">
            Supported paths
          </span>
          <code className="text-muted-foreground">
            /, /:provider, /:provider/:model
          </code>
        </div>
      </div>
    </>
  );
}
