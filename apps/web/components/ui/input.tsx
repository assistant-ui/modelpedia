"use client";

import { Input as BaseInput } from "@base-ui/react/input";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<
  HTMLInputElement,
  ComponentPropsWithoutRef<typeof BaseInput>
>(({ className, ...props }, ref) => (
  <BaseInput
    ref={ref}
    className={cn(
      "bg-muted text-foreground placeholder-muted-foreground ring-border focus-visible:ring-ring w-full rounded-md px-3 py-2 text-sm ring-1 transition-[box-shadow,ring-color] duration-200 focus-visible:ring-2 focus-visible:outline-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
