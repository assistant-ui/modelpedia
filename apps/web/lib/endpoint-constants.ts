/** Map endpoint keys to display label, description, API path, and HTTP method. */
export const ENDPOINT_MAP: Record<
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
  // Anthropic
  messages: {
    label: "Messages",
    desc: "Create messages with multi-turn conversations",
    method: "POST",
    path: "/v1/messages",
  },
  // Google
  generateContent: {
    label: "Generate Content",
    desc: "Generate text from multimodal input",
    method: "POST",
    path: "/v1beta/models/{model}:generateContent",
  },
  streamGenerateContent: {
    label: "Stream Content",
    desc: "Stream text generation responses",
    method: "POST",
    path: "/v1beta/models/{model}:streamGenerateContent",
  },
};

/** Map tool keys to display label + description. */
export const TOOL_MAP: Record<string, { label: string; desc: string }> = {
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
