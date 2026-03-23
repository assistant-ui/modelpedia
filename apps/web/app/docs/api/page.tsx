import type { Metadata } from "next";
import { ApiEndpoint } from "@/components/shared/api-endpoint";
import { PageHeader } from "@/components/ui/page-header";
import { Row } from "@/components/ui/row";
import { Section } from "@/components/ui/section";
import { API_BASE, sections } from "@/lib/api-docs-data";

export const metadata: Metadata = {
  title: "API",
  description:
    "REST API reference for querying AI models, providers, and capabilities. JSON, no auth, CORS enabled.",
};

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
        <Section key={section.title} title={section.title}>
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
        </Section>
      ))}

      <Section title="Response format">
        <div className="overflow-hidden rounded-md text-sm ring-1 ring-border">
          <div className="flex items-baseline gap-4 border-border border-b px-4 py-2.5">
            <span className="w-16 shrink-0 text-muted-foreground sm:w-24">
              Success
            </span>
            <code className="text-muted-foreground">
              {'{ "data": ..., "meta": { "total", "limit", "offset" } }'}
            </code>
          </div>
          <div className="flex items-baseline gap-4 border-border border-b px-4 py-2.5">
            <span className="w-16 shrink-0 text-muted-foreground sm:w-24">
              Error
            </span>
            <code className="text-muted-foreground">
              {'{ "error": { "message", "status" } }'}
            </code>
          </div>
        </div>
      </Section>

      <Section title="Conventions">
        <div className="overflow-hidden rounded-md text-sm ring-1 ring-border">
          <Row label="Field present" value="Known value" />
          <Row label="Field omitted" value="Unknown" />
          <Row label="Field is null" value="Not applicable" />
          <Row label="pricing.*" value="USD per 1M tokens" />
          <Row label="context_window" value="Token count" />
          <Row
            label="capabilities.*"
            value="Boolean flags (true = supported)"
          />
          <Row
            label="modalities.*"
            value='Array of: "text", "image", "audio", "video"'
          />
          <Row label="performance / speed" value="1–5 scale" />
          <Row label="status" value='"active" | "deprecated" | "preview"' />
        </div>
      </Section>

      <Section title="Notes">
        <div className="overflow-hidden rounded-md text-sm ring-1 ring-border">
          <Row label="Auth" value="None required" />
          <Row label="CORS" value="Enabled on all endpoints" />
          <Row label="Rate limit" value="No rate limit" />
        </div>
      </Section>
    </>
  );
}
