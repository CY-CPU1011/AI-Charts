import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import ChatChartIsland from "@/components/chat-chart-island";
import { routing } from "@/lib/i18n/config";

export default async function LocalePage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <main className="min-h-dvh">
      <ChatChartIsland />
    </main>
  );
}
