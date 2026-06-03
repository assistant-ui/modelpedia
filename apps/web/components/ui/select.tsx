"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export const Select = SelectPrimitive.Root;

export function SelectValue({
  className,
  ...props
}: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  );
}

export function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "bg-muted text-foreground ring-border hover:bg-accent focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ring-1 transition-colors duration-200 select-none focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children ?? <SelectValue />}
      <SelectPrimitive.Icon>
        <ChevronDown size={12} className="text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="z-50"
      >
        <SelectPrimitive.Popup
          className={cn(
            "bg-muted ring-border max-h-[var(--available-height)] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-y-auto rounded-md p-1 ring-1 transition-all duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "data-[highlighted]:bg-accent relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm transition-colors duration-200 outline-none select-none",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex-1">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <Check size={12} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export function SelectSeparator({ className }: { className?: string }) {
  return <div className={cn("bg-border -mx-1 my-1 h-px", className)} />;
}

export function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      className={cn("text-muted-foreground px-2 py-1 text-xs", className)}
      {...props}
    />
  );
}

export const SelectGroup = SelectPrimitive.Group;
