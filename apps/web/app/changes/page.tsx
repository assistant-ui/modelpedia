import type { Metadata } from "next";
import { ChangesList } from "@/components/changes-list";
import { PageHeader } from "@/components/ui/page-header";
import { getChangelog, providers } from "@/lib/data";

export const metadata: Metadata = {
  title: "Changes",
  description:
    "Changelog of AI model data updates. Track new models, pricing changes, and provider updates.",
};

export default function ChangesPage() {
  const changelog = getChangelog();

  const providerIcons: Record<string, string | undefined> = {};
  for (const p of providers) {
    providerIcons[p.id] = p.icon;
  }

  return (
    <>
      <PageHeader title="Changes" />
      <ChangesList entries={changelog} providerIcons={providerIcons} />
    </>
  );
}
