"use client";

import { Languages } from "lucide-react";
import { hasLocale, useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { defaultLocale, locales } from "@/lib/i18n/config";
import { usePathname, useRouter } from "@/lib/i18n/navigation";

export default function LanguageSwitcher() {
  const currentLocale = useLocale();
  const locale = hasLocale(locales, currentLocale)
    ? currentLocale
    : defaultLocale;
  const t = useTranslations("language");
  const pathname = usePathname();
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("switcher.label")}
          className="gap-2 border-[#e5e5e5] bg-white text-[#1a1a1a] transition-colors hover:border-[#d4d4d4] hover:bg-[#fafafa]"
          size="sm"
          variant="outline"
        >
          <Languages />
          {t(locale)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((nextLocale) => (
          <DropdownMenuItem
            key={nextLocale}
            onSelect={() => router.replace(pathname, { locale: nextLocale })}
          >
            {t(nextLocale)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
