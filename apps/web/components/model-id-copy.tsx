"use client";

import { Button } from "./ui/button";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "./ui/dropdown";
import { toastManager } from "./ui/toast";

export function ModelIdCopy({ ids }: { ids: string[] }) {
  function copy(id: string) {
    navigator.clipboard.writeText(id);
    toastManager.add({
      description: `Copied ${id}`,
      timeout: 2000,
    });
  }

  return (
    <Dropdown>
      <DropdownTrigger>
        <Button variant="default" size="icon" title="Copy model ID">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
            <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
          </svg>
        </Button>
      </DropdownTrigger>
      <DropdownContent>
        {ids.map((id) => (
          <DropdownItem key={id} onSelect={() => copy(id)}>
            <span className="flex-1 font-mono text-foreground text-xs">
              {id}
            </span>
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}
