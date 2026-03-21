"use client";

import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check, Minus } from "lucide-react";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "@/lib/cn";

const Checkbox = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof BaseCheckbox.Root> & {
    label?: string;
    className?: string;
  }
>(({ label, className, ...props }, ref) => (
  <label
    className={cn(
      "inline-flex items-center gap-2 text-foreground text-sm",
      props.disabled && "pointer-events-none opacity-50",
      className,
    )}
  >
    <BaseCheckbox.Root
      ref={ref}
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border bg-background transition-colors duration-200",
        "hover:border-foreground/30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "data-[checked]:border-foreground data-[checked]:bg-foreground data-[checked]:text-background",
        "data-[indeterminate]:border-foreground data-[indeterminate]:bg-foreground data-[indeterminate]:text-background",
      )}
      {...props}
    >
      <BaseCheckbox.Indicator className="flex items-center justify-center">
        {props.indeterminate ? (
          <Minus size={12} strokeWidth={2.5} />
        ) : (
          <Check size={12} strokeWidth={2.5} />
        )}
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
    {label && <span>{label}</span>}
  </label>
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
