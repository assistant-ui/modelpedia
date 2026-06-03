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
            "bg-muted ring-border z-50 min-w-40 origin-top-right overflow-hidden rounded-md ring-1 transition-all duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
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
        "data-[highlighted]:bg-accent flex w-full cursor-default items-center px-3 py-2 text-left text-sm transition-colors duration-200 outline-none",
        className,
      )}
    >
      {children}
    </Menu.Item>
  );
}

export function DropdownSeparator({ className }: { className?: string }) {
  return <Menu.Separator className={cn("bg-border my-1 h-px", className)} />;
}

export function DropdownLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("text-muted-foreground px-3 py-1.5 text-xs", className)}>
      {children}
    </div>
  );
}
