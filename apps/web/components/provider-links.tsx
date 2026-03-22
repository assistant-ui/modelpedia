"use client";

import { Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";

export function ProviderLinks({
  url,
  docsUrl,
  pricingUrl,
  statusUrl,
  changelogUrl,
  playgroundUrl,
  sdk,
}: {
  url: string;
  docsUrl: string;
  pricingUrl: string;
  statusUrl?: string;
  changelogUrl?: string;
  playgroundUrl?: string;
  sdk?: Record<string, string>;
}) {
  const hasExtras = statusUrl || changelogUrl || playgroundUrl;
  const hasSdk = sdk && Object.keys(sdk).length > 0;

  return (
    <Dropdown>
      <DropdownTrigger>
        <Button variant="ghost" size="icon">
          <Ellipsis size={16} />
        </Button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem href={url} external>
          Website
        </DropdownItem>
        <DropdownItem href={docsUrl} external>
          Docs
        </DropdownItem>
        <DropdownItem href={pricingUrl} external>
          Pricing
        </DropdownItem>
        {playgroundUrl && (
          <DropdownItem href={playgroundUrl} external>
            Playground
          </DropdownItem>
        )}
        {hasExtras && <DropdownSeparator />}
        {statusUrl && (
          <DropdownItem href={statusUrl} external>
            Status
          </DropdownItem>
        )}
        {changelogUrl && (
          <DropdownItem href={changelogUrl} external>
            Changelog
          </DropdownItem>
        )}
        {hasSdk && (
          <>
            <DropdownSeparator />
            <DropdownLabel>SDK</DropdownLabel>
            {Object.entries(sdk!).map(([lang, pkg]) => (
              <DropdownItem
                key={lang}
                href={`https://www.npmjs.com/package/${pkg}`}
                external
              >
                <span className="capitalize">{lang}</span>
                <span className="ml-auto pl-4 font-mono text-muted-foreground text-xs">
                  {pkg}
                </span>
              </DropdownItem>
            ))}
          </>
        )}
      </DropdownContent>
    </Dropdown>
  );
}
