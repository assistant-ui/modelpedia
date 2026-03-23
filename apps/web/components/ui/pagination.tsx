"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Pagination({
  pageIndex,
  totalPages,
  totalRows,
  pageSize,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
}: {
  pageIndex: number;
  totalPages: number;
  totalRows: number;
  pageSize: number;
  onPrevious: () => void;
  onNext: () => void;
  canPrevious: boolean;
  canNext: boolean;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between text-muted-foreground text-xs">
      <span>
        {pageIndex * pageSize + 1}–
        {Math.min((pageIndex + 1) * pageSize, totalRows)} of {totalRows}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          disabled={!canPrevious}
          onClick={onPrevious}
        >
          <ChevronLeft size={14} />
        </Button>
        <span className="px-2 font-mono tabular-nums">
          {pageIndex + 1} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="icon"
          disabled={!canNext}
          onClick={onNext}
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
