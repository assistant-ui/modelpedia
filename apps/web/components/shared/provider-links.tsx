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
  tokenizerUrl,
  sdk,
  githubUrl,
  blogUrl,
  twitterUrl,
  discordUrl,
  termsUrl,
  supportUrl,
}: {
  url: string;
  docsUrl: string;
  pricingUrl: string;
  statusUrl?: string;
  changelogUrl?: string;
  playgroundUrl?: string;
  tokenizerUrl?: string;
  sdk?: Record<string, string>;
  githubUrl?: string;
  blogUrl?: string;
  twitterUrl?: string;
  discordUrl?: string;
  termsUrl?: string;
  supportUrl?: string;
}) {
  const hasExtras = statusUrl || changelogUrl || playgroundUrl || tokenizerUrl;
  const hasSocial = githubUrl || blogUrl || twitterUrl || discordUrl;
  const sdkEntries = sdk ? Object.entries(sdk) : [];

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
        {tokenizerUrl && (
          <DropdownItem href={tokenizerUrl} external>
            Tokenizer
          </DropdownItem>
        )}
        {hasSocial && (
          <>
            <DropdownSeparator />
            {githubUrl && (
              <DropdownItem href={githubUrl} external>
                GitHub
              </DropdownItem>
            )}
            {blogUrl && (
              <DropdownItem href={blogUrl} external>
                Blog
              </DropdownItem>
            )}
            {twitterUrl && (
              <DropdownItem href={twitterUrl} external>
                X / Twitter
              </DropdownItem>
            )}
            {discordUrl && (
              <DropdownItem href={discordUrl} external>
                Discord
              </DropdownItem>
            )}
          </>
        )}
        {(termsUrl || supportUrl) && (
          <>
            <DropdownSeparator />
            {supportUrl && (
              <DropdownItem href={supportUrl} external>
                Support
              </DropdownItem>
            )}
            {termsUrl && (
              <DropdownItem href={termsUrl} external>
                Terms of Service
              </DropdownItem>
            )}
          </>
        )}
        {sdkEntries.length > 0 && (
          <>
            <DropdownSeparator />
            <DropdownLabel>SDK</DropdownLabel>
            {sdkEntries.map(([lang, pkg]) => (
              <DropdownItem
                key={lang}
                href={
                  lang === "python"
                    ? `https://pypi.org/project/${pkg}`
                    : `https://www.npmjs.com/package/${pkg}`
                }
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
