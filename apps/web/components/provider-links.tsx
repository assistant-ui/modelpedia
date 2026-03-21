"use client";

import { Ellipsis } from "lucide-react";
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
        <button className="flex items-center rounded-md p-1 text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground">
          <Ellipsis size={16} />
        </button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem href={url}>Website</DropdownItem>
        <DropdownItem href={docsUrl}>Docs</DropdownItem>
        <DropdownItem href={pricingUrl}>Pricing</DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
