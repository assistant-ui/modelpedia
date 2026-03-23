import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import { type ComponentProps, forwardRef } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground ring-1 ring-border hover:bg-accent",
        outline:
          "text-muted-foreground ring-1 ring-border hover:bg-accent hover:text-foreground",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        primary: "bg-foreground text-background hover:bg-foreground/80",
      },
      size: {
        default: "px-4 py-2 text-sm",
        sm: "px-3 py-1.5 text-xs",
        icon: "h-7 w-7 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

type ButtonLinkProps = ComponentProps<typeof Link> &
  VariantProps<typeof buttonVariants>;

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  ({ className, variant, size, ...props }, ref) => (
    <Link
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
ButtonLink.displayName = "ButtonLink";

type ButtonAnchorProps = ComponentProps<"a"> &
  VariantProps<typeof buttonVariants>;

export const ButtonAnchor = forwardRef<HTMLAnchorElement, ButtonAnchorProps>(
  ({ className, variant, size, ...props }, ref) => (
    <a
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
ButtonAnchor.displayName = "ButtonAnchor";
