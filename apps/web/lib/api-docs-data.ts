export const API_BASE = "https://api.modelpedia.dev";

export const sections: {
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
        desc: "Compare 2-10 providers side by side: model counts, price ranges, capabilities.",
        tryPath: `${API_BASE}/v1/providers/compare?ids=openai,anthropic,google`,
        params: [["ids", "Comma-separated provider IDs (2-10, required)"]],
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
          ["ids", "Comma-separated provider/model IDs (2-10, required)"],
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
];
