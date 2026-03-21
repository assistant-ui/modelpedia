"use client";

import { Input as BaseInput } from "@base-ui/react/input";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "@/lib/cn";

const Input = forwardRef<
  HTMLInputElement,
  ComponentPropsWithoutRef<typeof BaseInput>
>(({ className, ...props }, ref) => (
  <BaseInput
    ref={ref}
    className={cn(
      "w-full rounded-md bg-muted px-3 py-2 text-foreground text-sm placeholder-muted-foreground ring-1 ring-border transition-[box-shadow,ring-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
