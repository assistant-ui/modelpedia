import type { Metadata } from "next";
import { ChangesList } from "@/components/changes-list";
import { PageHeader } from "@/components/ui/page-header";
import { getChanges, providers } from "@/lib/data";

export const metadata: Metadata = {
  title: "Changes",
  description: "Track new models, pricing changes, and provider updates.",
};

export default function ChangesPage() {
  const changes = getChanges();

  const providerIcons: Record<string, string | undefined> = {};
  for (const p of providers) {
    providerIcons[p.id] = p.icon;
  }

  return (
    <>
      <PageHeader title="Changes" />
      <ChangesList entries={changes} providerIcons={providerIcons} />
    </>
  );
}
