import { Download } from "lucide-react";
import { MetricCard } from "@/components/shared/model-detail";
import { ProviderIcon } from "@/components/shared/provider-icon";
import { ProviderLinks } from "@/components/shared/provider-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { Row } from "@/components/ui/row";
import { TYPE_LABELS } from "@/lib/constants";
import type { ProviderWithModels } from "@/lib/data";
import { regionFlag } from "@/lib/format";

export function ProviderDetailHeader({
  provider,
  family,
}: {
  provider: ProviderWithModels;
  family?: string;
}) {
  const activeCount = provider.models.filter(
    (m) => m.status !== "deprecated",
  ).length;
  const deprecatedCount = provider.models.length - activeCount;
  const families = new Set(
    provider.models.map((m) => m.family).filter(Boolean),
  );

  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center gap-2.5">
        <ProviderIcon provider={provider} size={20} />
        <h1 className="font-medium text-foreground text-lg tracking-tight">
          {family ? `${provider.name} · ${family}` : provider.name}
        </h1>
        {provider.type && (
          <Badge>{TYPE_LABELS[provider.type] ?? provider.type}</Badge>
        )}
        {provider.openai_compatible && (
          <Badge variant="blue">OpenAI compatible</Badge>
        )}
        <span className="flex-1" />
        <Dropdown>
          <DropdownTrigger>
            <Button variant="ghost" size="icon" title="Export data">
              <Download size={16} />
            </Button>
          </DropdownTrigger>
          <DropdownContent align="end">
            <DropdownLabel>Export</DropdownLabel>
            <DropdownItem
              href={`https://api.modelpedia.dev/v1/export?format=json&provider=${provider.id}`}
            >
              JSON
            </DropdownItem>
            <DropdownItem
              href={`https://api.modelpedia.dev/v1/export?format=csv&provider=${provider.id}`}
            >
              CSV
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
        <ProviderLinks
          url={provider.url}
          docsUrl={provider.docs_url}
          pricingUrl={provider.pricing_url}
          statusUrl={provider.status_url}
          changelogUrl={provider.changelog_url}
          playgroundUrl={provider.playground_url}
          tokenizerUrl={provider.tokenizer_url}
          sdk={provider.sdk}
          githubUrl={provider.github_url}
          blogUrl={provider.blog_url}
          twitterUrl={provider.twitter_url}
          discordUrl={provider.discord_url}
          termsUrl={provider.terms_url}
          supportUrl={provider.support_url}
        />
      </div>

      {provider.description && (
        <p className="text-pretty text-muted-foreground text-sm leading-relaxed">
          {provider.description}
        </p>
      )}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border">
        <MetricCard
          label="Active models"
          value={String(activeCount)}
          sub={
            deprecatedCount > 0 ? `+ ${deprecatedCount} deprecated` : undefined
          }
        />
        <MetricCard label="Families" value={String(families.size)} />
      </div>

      <div className="overflow-hidden rounded-md ring-1 ring-border">
        <Row
          label="Headquarters"
          value={`${regionFlag(provider.region)} ${provider.headquarters ?? provider.region}`}
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(provider.headquarters ?? provider.region)}`}
        />
        {provider.founded && (
          <Row label="Founded" value={String(provider.founded)} />
        )}
        <Row
          label="API Base URL"
          value={provider.api_url}
          mono
          copyValue={provider.api_url}
        />
        {provider.models_url && (
          <Row
            label="Models"
            value={provider.models_url.replace(/^https?:\/\//, "")}
            href={provider.models_url}
          />
        )}
      </div>
    </div>
  );
}
