import { type ComponentProps, forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Table = forwardRef<HTMLTableElement, ComponentProps<"table">>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-hidden">
      <table
        ref={ref}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  ),
);
Table.displayName = "Table";

export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  ComponentProps<"thead">
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

export const TableBody = forwardRef<
  HTMLTableSectionElement,
  ComponentProps<"tbody">
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

export const TableRow = forwardRef<HTMLTableRowElement, ComponentProps<"tr">>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-border border-b transition-colors duration-200 hover:bg-accent data-[state=selected]:bg-accent",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

export const TableHead = forwardRef<HTMLTableCellElement, ComponentProps<"th">>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-9 px-4 text-left align-middle font-normal text-muted-foreground text-xs uppercase tracking-wider [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

export const TableCell = forwardRef<HTMLTableCellElement, ComponentProps<"td">>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        "px-4 py-2.5 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  ),
);
TableCell.displayName = "TableCell";
