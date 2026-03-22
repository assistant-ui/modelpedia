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
      {
        path: "/v1/providers/compare",
        desc: "Compare 2–10 providers side by side: model counts, price ranges, capabilities.",
        tryPath: `${API_BASE}/v1/providers/compare?ids=openai,anthropic,google`,
        params: [["ids", "Comma-separated provider IDs (2–10, required)"]],
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
      {
        path: "/v1/models/latest",
        desc: "Recently updated models, sorted by last_updated descending.",
        tryPath: `${API_BASE}/v1/models/latest?limit=10`,
        params: [
          ["limit", "Max 500, default 100"],
          ["offset", "Default 0"],
        ],
      },
      {
        path: "/v1/models/recommend",
        desc: "Recommend models matching requirements. Returns non-deprecated models sorted by price.",
        tryPath: `${API_BASE}/v1/models/recommend?capability=vision,tool_call&min_context_window=100000&limit=5`,
        params: [
          ["capability", "Required capabilities, comma-separated"],
          ["model_type", "chat | reasoning | embed | image | tts | ..."],
          ["min_context_window", "Minimum context window in tokens"],
          ["max_price_input", "Max input price (USD per 1M tokens)"],
          ["input_modality", "Required input: text | image | audio | video"],
          ["output_modality", "Required output: text | image | audio | video"],
          ["limit", "Max 500, default 100"],
          ["offset", "Default 0"],
        ],
      },
      {
        path: "/v1/models/types",
        desc: "Model types with counts and provider coverage.",
        tryPath: `${API_BASE}/v1/models/types`,
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
      {
        path: "/v1/creators",
        desc: "Model creators with counts, providers, and families.",
        tryPath: `${API_BASE}/v1/creators`,
      },
      {
        path: "/v1/modalities",
        desc: "Input/output modality combinations with model counts.",
        tryPath: `${API_BASE}/v1/modalities`,
      },
      {
        path: "/v1/tools",
        desc: "Tools and integrations (function_calling, web_search, mcp, ...) with adoption counts.",
        tryPath: `${API_BASE}/v1/tools`,
      },
    ],
  },
  {
    title: "Pricing",
    endpoints: [
      {
        path: "/v1/pricing/compare",
        desc: "Compare pricing across models. Filter by price range, sort by cheapest.",
        tryPath: `${API_BASE}/v1/pricing/compare?max_price_input=5&sort=price_input&limit=10`,
        params: [
          [
            "ids",
            "Comma-separated provider/model IDs (optional, compares all if omitted)",
          ],
          ["min_price_input", "Min input price (USD per 1M tokens)"],
          ["max_price_input", "Max input price (USD per 1M tokens)"],
          ["sort", "price_input (default) | price_output"],
          ["order", "asc (default) | desc"],
          ["limit", "Max 500, default 100"],
          ["offset", "Default 0"],
        ],
      },
    ],
  },
  {
    title: "Changes",
    endpoints: [
      {
        path: "/v1/changes",
        desc: "Change log: model additions, updates, and removals. Newest first.",
        tryPath: `${API_BASE}/v1/changes?action=create&limit=10`,
        params: [
          ["provider", "Filter by provider id"],
          ["model", "Filter by model id"],
          ["action", "create | update | delete"],
          ["since", "ISO-8601 timestamp lower bound"],
          ["until", "ISO-8601 timestamp upper bound"],
          ["limit", "Max 500, default 100"],
          ["offset", "Default 0"],
        ],
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
