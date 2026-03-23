import type { Metadata } from "next";
import { AnalyticsDashboard } from "@/components/pages/analytics/dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { computeAnalytics } from "@/lib/analytics";
import { allModels, providers } from "@/lib/data";

export const metadata: Metadata = {
  title: "Analytics",
  description:
    "AI model landscape analytics — pricing trends, capability coverage, release timelines, and market insights across 30+ providers.",
};

export default function AnalyticsPage() {
  const data = computeAnalytics(allModels, providers);

  return (
    <>
      <PageHeader title="Analytics" sub="AI model landscape at a glance" />
      <AnalyticsDashboard data={data} />
    </>
  );
}
