"use client";

import { Metadata } from "next";
import { generateMetadata } from "@/shared/utils/metadata";
import { useTranslations } from "next-intl";
import CompressionSettingsTab from "@/app/(dashboard)/dashboard/settings/components/CompressionSettingsTab";

export const metadata = generateMetadata("compression");

export default function CompressionPage() {
  const t = useTranslations("compression");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-[28px]">compress</span>
          {t("settingsTitle")}
        </h1>
        <p className="text-sm text-text-muted mt-1">{t("settingsDescription")}</p>
      </div>
      <CompressionSettingsTab />
    </div>
  );
}
