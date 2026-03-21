"use client";

import { Menu } from "@base-ui/react/menu";

export function Dropdown({ children }: { children: React.ReactNode }) {
  return <Menu.Root>{children}</Menu.Root>;
}

export function DropdownTrigger({ children }: { children: React.ReactNode }) {
  return <Menu.Trigger render={children as React.ReactElement} />;
}

export function DropdownContent({
  children,
  align = "end",
}: {
  children: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  return (
    <Menu.Portal>
      <Menu.Positioner sideOffset={6} align={align}>
        <Menu.Popup className="min-w-40 origin-top-right overflow-hidden rounded-md bg-muted ring-1 ring-border transition-all duration-150 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

export function DropdownItem({
  children,
  onSelect,
  href,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  href?: string;
}) {
  return (
    <Menu.Item
      onClick={onSelect}
      render={
        href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" />
        ) : undefined
      }
      className="flex w-full cursor-default items-center px-3 py-2 text-left text-sm outline-none transition-colors duration-200 data-[highlighted]:bg-accent"
    >
      {children}
    </Menu.Item>
  );
}
