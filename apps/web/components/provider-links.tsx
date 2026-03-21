"use client";

import { Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "@/components/ui/dropdown";

export function ProviderLinks({
  url,
  docsUrl,
  pricingUrl,
}: {
  url: string;
  docsUrl: string;
  pricingUrl: string;
}) {
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
      </DropdownContent>
    </Dropdown>
  );
}
