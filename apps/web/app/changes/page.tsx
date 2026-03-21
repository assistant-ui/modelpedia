import type { Metadata } from "next";
import { ChangeEntry } from "@/components/change-entry";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getChangelog, getProvider } from "@/lib/data";

export const metadata: Metadata = {
  title: "Changes",
  description:
    "Changelog of AI model data updates. Track new models, pricing changes, and provider updates.",
};

const PAGE_SIZE = 50;

export default async function ChangesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const changelog = getChangelog();
  const totalPages = Math.max(1, Math.ceil(changelog.length / PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, Number(pageParam) || 1));
  const start = (page - 1) * PAGE_SIZE;
  const changes = changelog.slice(start, start + PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Changes"
        sub={`${changelog.length} total entries · page ${page} of ${totalPages}`}
      />

      {changes.length === 0 ? (
        <p className="text-pretty py-16 text-center text-muted-foreground">
          No changes recorded yet. Changes will appear here after the next data
          fetch.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {changes.map((entry, i) => (
              <ChangeEntry
                key={`${entry.ts}-${entry.model}-${i}`}
                entry={entry}
                provider={getProvider(entry.provider)}
              />
            ))}
          </div>

          <nav className="flex items-center justify-between pt-6">
            {page > 1 ? (
              <ButtonLink href={`/changes?page=${page - 1}`} variant="outline">
                Previous
              </ButtonLink>
            ) : (
              <span />
            )}
            <span className="text-muted-foreground text-xs">
              {start + 1}–{Math.min(start + PAGE_SIZE, changelog.length)} of{" "}
              {changelog.length}
            </span>
            {page < totalPages ? (
              <ButtonLink href={`/changes?page=${page + 1}`} variant="outline">
                Next
              </ButtonLink>
            ) : (
              <span />
            )}
          </nav>
        </>
      )}
    </>
  );
}
