"use client";

import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Command = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "overflow-hidden rounded-lg bg-background shadow-2xl ring-1 ring-border",
      className,
    )}
    {...props}
  />
));
Command.displayName = "Command";

export const CommandInput = forwardRef<
  HTMLInputElement,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center border-border border-b px-3">
    <Search size={14} className="shrink-0 text-muted-foreground" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "flex-1 bg-transparent px-3 py-3 text-foreground text-sm placeholder-muted-foreground outline-none",
        className,
      )}
      {...props}
    />
  </div>
));
CommandInput.displayName = "CommandInput";

export const CommandList = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn("h-72 overflow-y-auto overscroll-contain p-2", className)}
    {...props}
  />
));
CommandList.displayName = "CommandList";

export const CommandEmpty = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className={cn(
      "flex h-full items-center justify-center text-muted-foreground text-xs",
      className,
    )}
    {...props}
  />
));
CommandEmpty.displayName = "CommandEmpty";

export const CommandGroup = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs",
      className,
    )}
    {...props}
  />
));
CommandGroup.displayName = "CommandGroup";

export const CommandItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-foreground text-sm aria-selected:bg-accent",
      className,
    )}
    {...props}
  />
));
CommandItem.displayName = "CommandItem";

export const CommandSeparator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn("my-1 h-px bg-border", className)}
    {...props}
  />
));
CommandSeparator.displayName = "CommandSeparator";
