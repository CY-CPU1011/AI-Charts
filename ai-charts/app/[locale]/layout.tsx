import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ChartNoAxesCombined } from "lucide-react";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import LanguageSwitcher from "@/components/language-switcher";
import { Toaster } from "@/components/ui/sonner";
import { routing } from "@/lib/i18n/config";

import "../globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Charts",
  description: "Turn natural-language data prompts into charts.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  // Extensions such as Huaban can inject attributes before React hydrates.
  return (
    <html
      lang={locale}
      className={geist.className}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-white antialiased" suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex animate-fade-in-up items-center justify-between px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-10 items-center justify-center rounded-xl bg-[#1a1a1a] text-white"
              >
                <ChartNoAxesCombined className="size-5" strokeWidth={2.25} />
              </span>
              <h1 className="text-lg font-semibold tracking-tight text-[#1a1a1a]">
                AI Charts
              </h1>
            </div>
            <div className="pointer-events-auto">
              <LanguageSwitcher />
            </div>
          </header>
          {children}
          <Toaster position="top-center" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
