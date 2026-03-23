"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { type MouseEvent, useState } from "react";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchable?: boolean;
  searchPlaceholder?: string;
  initialQuery?: string;
  pageSize?: number;
  toolbar?: React.ReactNode;
  globalFilterFn?: (row: TData, query: string) => boolean;
  getRowHref?: (row: TData) => string;
  getRowClassName?: (row: TData) => string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchable,
  searchPlaceholder = "Search...",
  initialQuery = "",
  pageSize = 10,
  toolbar,
  globalFilterFn,
  getRowHref,
  getRowClassName,
}: DataTableProps<TData, TValue>) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState(initialQuery);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: globalFilterFn
      ? (row, _columnId, filterValue) =>
          globalFilterFn(row.original, filterValue)
      : undefined,
    initialState: { pagination: { pageSize } },
  });

  const pageIndex = table.getState().pagination.pageIndex;
  const totalPages = table.getPageCount();
  const totalRows = table.getFilteredRowModel().rows.length;

  return (
    <div>
      {searchable && (
        <div className="mb-4">
          <Input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
          />
        </div>
      )}
      {toolbar && <div className="mb-4">{toolbar}</div>}
      <div className="overflow-hidden rounded-md ring-1 ring-border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as
                    | Record<string, string>
                    | undefined;
                  const headerCls =
                    meta?.headerClassName ?? meta?.className ?? "";
                  const sortCls = header.column.getCanSort()
                    ? "cursor-pointer select-none"
                    : "";
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(headerCls, sortCls)}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => {
                const href = getRowHref?.(row.original);
                const handleRowClick = href
                  ? (e: MouseEvent) => {
                      if (
                        e.defaultPrevented ||
                        e.metaKey ||
                        e.ctrlKey ||
                        e.shiftKey
                      )
                        return;
                      router.push(href);
                    }
                  : undefined;
                const rowCls = getRowClassName?.(row.original) ?? "";
                return (
                  <TableRow
                    key={row.id}
                    className={cn(href && "cursor-pointer", rowCls)}
                    onClick={handleRowClick}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as
                        | Record<string, string>
                        | undefined;
                      return (
                        <TableCell
                          key={cell.id}
                          className={meta?.className ?? ""}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-balance py-8 text-center text-muted-foreground"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination
        pageIndex={pageIndex}
        totalPages={totalPages}
        totalRows={totalRows}
        pageSize={pageSize}
        onPrevious={() => table.previousPage()}
        onNext={() => table.nextPage()}
        canPrevious={table.getCanPreviousPage()}
        canNext={table.getCanNextPage()}
      />
    </div>
  );
}
