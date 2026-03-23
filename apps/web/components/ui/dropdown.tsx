"use client";

import { Menu } from "@base-ui/react/menu";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Dropdown({ children }: { children: ReactNode }) {
  return <Menu.Root>{children}</Menu.Root>;
}

export function DropdownTrigger({ children }: { children: ReactNode }) {
  return <Menu.Trigger render={children as ReactElement} />;
}

export function DropdownContent({
  children,
  align = "end",
  className,
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <Menu.Portal>
      <Menu.Positioner sideOffset={6} align={align}>
        <Menu.Popup
          className={cn(
            "z-50 min-w-40 origin-top-right overflow-hidden rounded-md bg-muted ring-1 ring-border transition-all duration-150 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
            className,
          )}
        >
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
  external,
  className,
}: {
  children: ReactNode;
  onSelect?: () => void;
  href?: string;
  external?: boolean;
  className?: string;
}) {
  return (
    <Menu.Item
      onClick={onSelect}
      render={
        href ? (
          <a
            href={href}
            {...(external && {
              target: "_blank",
              rel: "noopener noreferrer",
            })}
          />
        ) : undefined
      }
      className={cn(
        "flex w-full cursor-default items-center px-3 py-2 text-left text-sm outline-none transition-colors duration-200 data-[highlighted]:bg-accent",
        className,
      )}
    >
      {children}
    </Menu.Item>
  );
}

export function DropdownSeparator({ className }: { className?: string }) {
  return <Menu.Separator className={cn("my-1 h-px bg-border", className)} />;
}

export function DropdownLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-3 py-1.5 text-muted-foreground text-xs", className)}>
      {children}
    </div>
  );
}
