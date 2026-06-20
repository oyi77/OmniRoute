"use client";

import { Input } from "@/shared/components";
import { useTranslations } from "next-intl";
import { compareTr } from "@/shared/utils/turkishText";
import { ENDPOINT_CATEGORIES } from "@/shared/constants/endpointCategories";
import { toLocalDateTimeInputValue } from "./apiManagerPageUtils";
import { UsageLimitSettings } from "./components/UsageLimitSettings";
import {
  CLAUDE_CODE_DEFAULT_MODEL_ID,
  MAX_KEY_NAME_LENGTH,
  type ClaudeCodeBlockableFamilyId,
} from "./constants";
import type {
  StreamDefaultMode,
  ProviderConnection,
  Model,
  ComboOption,
  ProviderGroup,
} from "./helpers";

// ---------------------------------------------------------------------------
// Shared toggle component for small boolean sections
// ---------------------------------------------------------------------------

function ToggleSection({
  title, description, enabled, enabledLabel, disabledLabel,
  enabledColorClass, icon, onToggle,
}: {
  title: string; description: string; enabled: boolean;
  enabledLabel: string; disabledLabel: string;
  enabledColorClass: string; icon: { enabled: string; disabled: string };
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-surface/40">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text-main">{title}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      <button type="button" role="switch" aria-checked={enabled} onClick={onToggle}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
          enabled ? enabledColorClass : "bg-black/5 dark:bg-white/5 text-text-muted border border-border"
        }`}
      >
        <span className="material-symbols-outlined text-[14px]">{enabled ? icon.enabled : icon.disabled}</span>
        {enabled ? enabledLabel : disabledLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section components
// ---------------------------------------------------------------------------

export function KeyNameSection({
  keyName, nameError, onKeyNameChange,
}: {
  keyName: string; nameError: string | null; onKeyNameChange: (v: string) => void;
}) {
  const t = useTranslations("apiManager");
  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-surface/40">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text-main">{t("keyName")}</p>
        <p className="text-xs text-text-muted">{t("keyNameDesc")}</p>
      </div>
      <div className="w-48 shrink-0">
        <Input value={keyName} onChange={(e) => { onKeyNameChange(e.target.value); }}
          placeholder={t("keyNamePlaceholder")} maxLength={MAX_KEY_NAME_LENGTH} error={nameError} />
      </div>
    </div>
  );
}

export function SaveErrorBanner({ saveError }: { saveError: string | null }) {
  if (!saveError) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
      <span className="material-symbols-outlined text-red-500 text-sm">error</span>
      <p className="text-sm text-red-700 dark:text-red-300 flex-1">{saveError}</p>
    </div>
  );
}

export function AccessModeToggle({
  allowAll, onSelectAll, onRestrictMode,
}: {
  allowAll: boolean; onSelectAll: () => void; onRestrictMode: () => void;
}) {
  const t = useTranslations("apiManager");
  const btnBase = "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all";
  const active = "bg-primary text-white";
  const inactive = "text-text-muted hover:bg-black/5 dark:hover:bg-white/5";
  return (
    <div className="flex gap-2 p-1 bg-surface rounded-lg">
      <button onClick={onSelectAll} className={`${btnBase} ${allowAll ? active : inactive}`}>
        <span className="material-symbols-outlined text-[18px]">lock_open</span>{t("allowAll")}
      </button>
      <button onClick={onRestrictMode} className={`${btnBase} ${!allowAll ? active : inactive}`}>
        <span className="material-symbols-outlined text-[18px]">lock</span>{t("restrict")}
      </button>
    </div>
  );
}

export function InfoBanner({
  allowAll, selectedCount, totalModels,
}: {
  allowAll: boolean; selectedCount: number; totalModels: number;
}) {
  const t = useTranslations("apiManager");
  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg ${allowAll ? "bg-green-500/10 border border-green-500/30" : "bg-amber-500/10 border border-amber-500/30"}`}>
      <span className={`material-symbols-outlined text-[18px] ${allowAll ? "text-green-500" : "text-amber-500"}`}>
        {allowAll ? "info" : "warning"}
      </span>
      <p className={`text-xs ${allowAll ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"}`}>
        {allowAll ? t("allowAllDesc") : t("restrictDesc", { selectedCount, totalModels })}
      </p>
    </div>
  );
}

export function KeyActiveSection({ keyIsActive, onToggle }: { keyIsActive: boolean; onToggle: () => void }) {
  const t = useTranslations("apiManager");
  const tc = useTranslations("common");
  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-surface/40">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text-main">{t("keyActive")}</p>
        <p className="text-xs text-text-muted">{t("keyActiveDesc")}</p>
      </div>
      <button type="button" role="switch" aria-checked={keyIsActive} onClick={onToggle}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
          keyIsActive ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
            : "bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30"
        }`}
      >
        <span className="material-symbols-outlined text-[14px]">{keyIsActive ? "check_circle" : "block"}</span>
        {keyIsActive ? tc("enabled") : tc("disabled")}
      </button>
    </div>
  );
}

export function MaxSessionsSection({
  maxSessions, onMaxSessionsChange,
}: {
  maxSessions: number; onMaxSessionsChange: (v: number) => void;
}) {
  const t = useTranslations("apiManager");
  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-surface/40">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text-main">{t("maxActiveSessions")}</p>
        <p className="text-xs text-text-muted">0 = unlimited. Return 429 when this key exceeds concurrent sticky sessions.</p>
      </div>
      <div className="w-32">
        <Input type="number" min={0} step={1} value={String(maxSessions)}
          onChange={(e) => { const p = Number.parseInt(e.target.value || "0", 10); onMaxSessionsChange(Number.isFinite(p) && p > 0 ? p : 0); }} />
      </div>
    </div>
  );
}

export function ThrottleSection({
  throttleDelayMs, onThrottleDelayMsChange,
}: {
  throttleDelayMs: number; onThrottleDelayMsChange: (v: number) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-surface/40">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text-main">Throttle Delay</p>
        <p className="text-xs text-text-muted">Add a fixed delay before requests for this key are routed. 0 = no slowdown.</p>
      </div>
      <div className="w-36">
        <Input type="number" min={0} max={300000} step={100} value={String(throttleDelayMs)}
          onChange={(e) => { const p = Number.parseInt(e.target.value || "0", 10); onThrottleDelayMsChange(Number.isFinite(p) && p > 0 ? Math.min(p, 300000) : 0); }} />
        <p className="text-[10px] text-text-muted mt-1">milliseconds</p>
      </div>
    </div>
  );
}

export function RateLimitsSection({
  rateLimits, onAddLimit, onUpdateLimit, onRemoveLimit,
}: {
  rateLimits: Array<{ limit: number; window: number }>;
  onAddLimit: () => void;
  onUpdateLimit: (index: number, field: "limit" | "window", value: number) => void;
  onRemoveLimit: (index: number) => void;
}) {
  const t = useTranslations("apiManager");
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-surface/40">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-text-main">{t("apiManagerCustomRateLimits")}</p>
          <p className="text-xs text-text-muted">{t("apiManagerCustomRateLimitsDesc")}</p>
        </div>
        <button type="button" onClick={onAddLimit}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0">
          <span className="material-symbols-outlined text-[14px]">add</span>Add Limit
        </button>
      </div>
      {rateLimits.length > 0 && (
        <div className="flex flex-col gap-2 pt-2">
          {rateLimits.map((rl, index) => (
            <div key={index} className="flex gap-2 items-center">
              <Input type="number" min={1} value={String(rl.limit)}
                onChange={(e) => { onUpdateLimit(index, "limit", parseInt(e.target.value) || 0); }}
                placeholder={t("apiManagerRateLimitRequestsPlaceholder")} />
              <span className="text-sm text-text-muted shrink-0">{t("apiManagerRateLimitReqPer")}</span>
              <Input type="number" min={1} value={String(rl.window)}
                onChange={(e) => { onUpdateLimit(index, "window", parseInt(e.target.value) || 0); }}
                placeholder={t("apiManagerRateLimitSecondsPlaceholder")} />
              <span className="text-sm text-text-muted shrink-0">sec</span>
              <button type="button" onClick={() => onRemoveLimit(index)}
                className="p-2 text-red-500 hover:bg-red-500/10 rounded transition-colors shrink-0"
                title={t("apiManagerRemoveLimitTitle")}>
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScheduleSection({
  scheduleEnabled, scheduleFrom, scheduleUntil, scheduleDays, scheduleTz,
  onToggleEnabled, onScheduleFromChange, onScheduleUntilChange, onScheduleDaysChange, onScheduleTzChange,
}: {
  scheduleEnabled: boolean; scheduleFrom: string; scheduleUntil: string;
  scheduleDays: number[]; scheduleTz: string;
  onToggleEnabled: () => void; onScheduleFromChange: (v: string) => void;
  onScheduleUntilChange: (v: string) => void; onScheduleDaysChange: (v: number[]) => void;
  onScheduleTzChange: (v: string) => void;
}) {
  const t = useTranslations("apiManager");
  const tc = useTranslations("common");
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-surface/40">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-text-main">{t("accessSchedule")}</p>
          <p className="text-xs text-text-muted">{t("accessScheduleDesc")}</p>
        </div>
        <button type="button" role="switch" aria-checked={scheduleEnabled} onClick={onToggleEnabled}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors shrink-0 ${
            scheduleEnabled ? "bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30"
              : "bg-black/5 dark:bg-white/5 text-text-muted border border-border"
          }`}>
          <span className="material-symbols-outlined text-[14px]">schedule</span>
          {scheduleEnabled ? tc("enabled") : tc("disabled")}
        </button>
      </div>
      {scheduleEnabled && (
        <div className="flex flex-col gap-3 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-text-muted mb-1 block">{t("scheduleFrom")}</label>
              <input type="time" value={scheduleFrom} onChange={(e) => onScheduleFromChange(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background text-text-main" />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">{t("scheduleUntil")}</label>
              <input type="time" value={scheduleUntil} onChange={(e) => onScheduleUntilChange(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background text-text-main" />
            </div>
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1.5 block">{t("scheduleDays")}</label>
            <div className="flex gap-1 flex-wrap">
              {([[0, t("daySun")], [1, t("dayMon")], [2, t("dayTue")], [3, t("dayWed")],
                [4, t("dayThu")], [5, t("dayFri")], [6, t("daySat")]] as [number, string][]).map(([dayIdx, label]) => {
                const sel = scheduleDays.includes(dayIdx);
                return (
                  <button key={dayIdx} type="button"
                    onClick={() => onScheduleDaysChange(sel ? scheduleDays.filter((d) => d !== dayIdx) : [...scheduleDays, dayIdx].sort((a, b) => a - b))}
                    className={`px-2 py-1 text-[11px] font-medium rounded transition-all ${sel ? "bg-primary text-white" : "bg-surface border border-border text-text-muted hover:border-primary/50"}`}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t("scheduleTimezone")}</label>
            <input type="text" value={scheduleTz} onChange={(e) => onScheduleTzChange(e.target.value)}
              placeholder={t("apiManagerTimezonePlaceholder")}
              className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background text-text-main font-mono" />
            <p className="text-[10px] text-text-muted mt-1">{t("scheduleTimezoneHint")}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function PrivacySection({ noLogEnabled, onToggle }: { noLogEnabled: boolean; onToggle: () => void }) {
  const t = useTranslations("apiManager"); const tc = useTranslations("common");
  return (
    <ToggleSection title={t("noLogPayloadPrivacy")} description="Disable request/response payload persistence for this API key."
      enabled={noLogEnabled} enabledLabel={tc("enabled")} disabledLabel={tc("disabled")}
      enabledColorClass="bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30"
      icon={{ enabled: "visibility_off", disabled: "visibility" }} onToggle={onToggle} />
  );
}

export function AutoResolveSection({ autoResolveEnabled, onToggle }: { autoResolveEnabled: boolean; onToggle: () => void }) {
  const t = useTranslations("apiManager"); const tc = useTranslations("common");
  return (
    <ToggleSection title={t("autoResolve")} description={t("autoResolveDesc")}
      enabled={autoResolveEnabled} enabledLabel={tc("enabled")} disabledLabel={tc("disabled")}
      enabledColorClass="bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30"
      icon={{ enabled: "auto_fix_high", disabled: "auto_fix_normal" }} onToggle={onToggle} />
  );
}

export function StreamDefaultSection({
  streamDefaultMode, onModeChange,
}: {
  streamDefaultMode: StreamDefaultMode; onModeChange: (m: StreamDefaultMode) => void;
}) {
  const t = useTranslations("apiManager");
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 p-3 rounded-lg border border-border bg-surface/40">
      <div className="flex flex-col gap-1 min-w-0">
        <p className="text-sm font-medium text-text-main">{t("streamDefaultMode")}</p>
        <p className="text-xs text-text-muted">{t("streamDefaultModeDesc")}</p>
      </div>
      <div className="flex gap-1 p-0.5 bg-surface rounded-md shrink-0 w-full sm:w-auto">
        <button type="button" onClick={() => onModeChange("legacy")}
          className={`inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold transition-all ${streamDefaultMode === "legacy" ? "bg-primary text-white" : "text-text-muted hover:bg-black/5 dark:hover:bg-white/5"}`}>
          <span className="material-symbols-outlined text-[14px]">settings_backup_restore</span>{t("streamDefaultLegacy")}
        </button>
        <button type="button" onClick={() => onModeChange("json")}
          className={`inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold transition-all ${streamDefaultMode === "json" ? "bg-primary text-white" : "text-text-muted hover:bg-black/5 dark:hover:bg-white/5"}`}>
          <span className="material-symbols-outlined text-[14px]">data_object</span>{t("streamDefaultJson")}
        </button>
      </div>
    </div>
  );
}

export function BanSection({ keyIsBanned, onToggle }: { keyIsBanned: boolean; onToggle: () => void }) {
  const t = useTranslations("apiManager");
  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-red-500/20 bg-red-500/5">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-bold text-red-700 dark:text-red-400">{t("bannedStatus")}</p>
        <p className="text-xs text-red-600 dark:text-red-300">Immediately revoke all access. Used for suspected abuse or compromised keys.</p>
      </div>
      <button role="switch" aria-checked={keyIsBanned} onClick={onToggle}
        className={`inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors ${
          keyIsBanned ? "bg-red-500 text-white shadow-sm" : "bg-black/5 dark:bg-white/5 text-text-muted hover:bg-black/10 dark:hover:bg-white/10"
        }`}>
        <span className="material-symbols-outlined text-[14px]">{keyIsBanned ? "block" : "check_circle"}</span>
        {keyIsBanned ? "Banned" : "Active"}
      </button>
    </div>
  );
}

export function ExpirationSection({
  expiresAt, onExpiresAtChange,
}: {
  expiresAt: string; onExpiresAtChange: (v: string) => void;
}) {
  const t = useTranslations("apiManager"); const tc = useTranslations("common");
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-surface/40">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text-main">{t("expirationDate")}</p>
        <p className="text-xs text-text-muted">Key will automatically stop working after this date.</p>
      </div>
      <div className="flex gap-2">
        <input type="datetime-local" value={toLocalDateTimeInputValue(expiresAt)}
          onChange={(e) => {
            const val = e.target.value;
            if (!val) { onExpiresAtChange(""); return; }
            const date = new Date(val);
            if (!Number.isNaN(date.getTime())) { onExpiresAtChange(date.toISOString()); }
          }}
          className="min-w-0 flex-1 px-2 py-1.5 text-sm border border-border rounded-md bg-background text-text-main" />
        <button type="button" onClick={() => onExpiresAtChange("")} disabled={!expiresAt}
          className="shrink-0 px-3 py-1.5 text-sm font-medium border border-border rounded-md text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent">
          {tc("clear")}
        </button>
      </div>
    </div>
  );
}

export function ManagementAccessSection({ manageEnabled, onToggle }: { manageEnabled: boolean; onToggle: () => void }) {
  const t = useTranslations("apiManager"); const tc = useTranslations("common");
  return (
    <ToggleSection title={t("managementAccess")} description={t("managementAccessDesc")}
      enabled={manageEnabled} enabledLabel={tc("enabled")} disabledLabel={tc("disabled")}
      enabledColorClass="bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
      icon={{ enabled: "admin_panel_settings", disabled: "admin_panel_settings" }} onToggle={onToggle} />
  );
}

export function SelfServiceSection({
  selfUsageEnabled, selfAccountQuotaEnabled, usageCommandEnabled,
  usageLimitEnabled, dailyUsageLimitUsd, weeklyUsageLimitUsd,
  onToggleSelfUsage, onToggleSelfAccountQuota, onToggleUsageCommand,
  onUsageLimitEnabledChange, onDailyUsageLimitUsdChange, onWeeklyUsageLimitUsdChange,
}: {
  selfUsageEnabled: boolean; selfAccountQuotaEnabled: boolean; usageCommandEnabled: boolean;
  usageLimitEnabled: boolean; dailyUsageLimitUsd: string; weeklyUsageLimitUsd: string;
  onToggleSelfUsage: () => void; onToggleSelfAccountQuota: () => void;
  onToggleUsageCommand: () => void; onUsageLimitEnabledChange: (v: boolean) => void;
  onDailyUsageLimitUsdChange: (v: string) => void; onWeeklyUsageLimitUsdChange: (v: string) => void;
}) {
  const t = useTranslations("apiManager"); const tc = useTranslations("common");
  return (
    <div className="flex flex-col gap-3 p-3 rounded-lg border border-border bg-surface/40">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text-main">{t("selfServiceVisibility")}</p>
        <p className="text-xs text-text-muted">{t("selfServiceVisibilityDesc")}</p>
      </div>
      <button type="button" role="switch" aria-checked={selfUsageEnabled} onClick={onToggleSelfUsage}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
          selfUsageEnabled ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
            : "bg-black/5 dark:bg-white/5 text-text-muted border border-border"
        }`}>
        <span className="material-symbols-outlined text-[14px]">query_stats</span>
        {t("ownUsageVisibility")} - {selfUsageEnabled ? tc("enabled") : tc("disabled")}
      </button>
      <p className="text-xs text-text-muted">{t("ownUsageVisibilityDesc")}</p>
      <button type="button" role="switch" aria-checked={selfAccountQuotaEnabled} disabled={!selfUsageEnabled}
        onClick={onToggleSelfAccountQuota}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
          selfAccountQuotaEnabled ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
            : "bg-black/5 dark:bg-white/5 text-text-muted border border-border"
        } ${!selfUsageEnabled ? "opacity-50 cursor-not-allowed" : ""}`}>
        <span className="material-symbols-outlined text-[14px]">account_balance</span>
        {t("sharedAccountQuotaVisibility")} - {selfAccountQuotaEnabled ? tc("enabled") : tc("disabled")}
      </button>
      <p className="text-xs text-text-muted">{t("sharedAccountQuotaVisibilityDesc")}</p>
      <button type="button" role="switch" aria-checked={usageCommandEnabled} onClick={onToggleUsageCommand}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
          usageCommandEnabled ? "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30"
            : "bg-black/5 dark:bg-white/5 text-text-muted border border-border"
        }`}>
        <span className="material-symbols-outlined text-[14px]">terminal</span>
        {t("localUsageCommand")} - {usageCommandEnabled ? tc("enabled") : tc("disabled")}
      </button>
      <p className="text-xs text-text-muted">{t("localUsageCommandDesc")}</p>
      <UsageLimitSettings enabled={usageLimitEnabled} dailyLimitUsd={dailyUsageLimitUsd} weeklyLimitUsd={weeklyUsageLimitUsd}
        enabledLabel={tc("enabled")} disabledLabel={tc("disabled")}
        onEnabledChange={onUsageLimitEnabledChange} onDailyLimitUsdChange={onDailyUsageLimitUsdChange}
        onWeeklyLimitUsdChange={onWeeklyUsageLimitUsdChange} />
    </div>
  );
}

export function DisableNonPublicModelsSection({
  disableNonPublicModels, onToggle,
}: {
  disableNonPublicModels: boolean; onToggle: () => void;
}) {
  const t = useTranslations("apiManager"); const tc = useTranslations("common");
  return (
    <ToggleSection title={t("disableNonPublicModels")} description={t("disableNonPublicModelsDesc")}
      enabled={disableNonPublicModels} enabledLabel={tc("yes")} disabledLabel={tc("no")}
      enabledColorClass="bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
      icon={{ enabled: "shield_lock", disabled: "shield" }} onToggle={onToggle} />
  );
}

export function SelectedModelsSummary({
  selectedCount, orderedSelectedModels, claudeCodeFamiliesExpanded,
  visibleClaudeCodeFamilies, getModelDisplayName,
  onSelectAllModels, onDeselectAllModels, onToggleModel,
  onToggleClaudeCodeFamiliesExpanded, onBlockClaudeCodeFamily,
}: {
  selectedCount: number; orderedSelectedModels: string[];
  claudeCodeFamiliesExpanded: boolean;
  visibleClaudeCodeFamilies: readonly { id: string; label: string }[];
  getModelDisplayName: (modelId: string) => string;
  onSelectAllModels: () => void; onDeselectAllModels: () => void;
  onToggleModel: (modelId: string) => void;
  onToggleClaudeCodeFamiliesExpanded: () => void;
  onBlockClaudeCodeFamily: (familyId: ClaudeCodeBlockableFamilyId) => void;
}) {
  const t = useTranslations("apiManager"); const tc = useTranslations("common");
  if (selectedCount === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 p-2 bg-primary/5 rounded-lg border border-primary/20">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-primary">{t("selectedCount", { count: selectedCount })}</span>
        <div className="flex gap-1">
          <button onClick={onSelectAllModels} className="text-[10px] text-primary hover:bg-primary/10 px-1.5 py-0.5 rounded transition-colors">{tc("all")}</button>
          <button onClick={onDeselectAllModels} className="text-[10px] text-red-500 hover:bg-red-500/10 px-1.5 py-0.5 rounded transition-colors">{t("clear")}</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto content-start">
        {orderedSelectedModels.map((modelId) => {
          if (modelId === CLAUDE_CODE_DEFAULT_MODEL_ID) {
            return (
              <div key={modelId} className="flex flex-col gap-1 basis-full">
                <span className="inline-flex w-fit items-center gap-0.5 px-1.5 py-0.5 bg-primary/10 text-text-main text-[10px] rounded border border-primary/35">
                  <button type="button" onClick={onToggleClaudeCodeFamiliesExpanded}
                    className="inline-flex items-center gap-1 font-mono text-text-main"
                    title="Expand Claude Code families" aria-expanded={claudeCodeFamiliesExpanded}>
                    <span className="truncate max-w-[140px]" title={modelId}>{getModelDisplayName(modelId)}</span>
                    <span className="material-symbols-outlined text-[12px] text-primary">{claudeCodeFamiliesExpanded ? "expand_less" : "expand_more"}</span>
                  </button>
                  <button type="button" onClick={() => onToggleModel(modelId)}
                    className="text-text-muted hover:text-red-500 transition-colors" title="Remove Claude Code default">
                    <span className="material-symbols-outlined text-[12px]">close</span>
                  </button>
                </span>
                {claudeCodeFamiliesExpanded && (
                  <div className="relative ml-2 flex flex-wrap gap-1 pl-5 animate-in fade-in slide-in-from-top-1 duration-150">
                    <span aria-hidden="true" className="pointer-events-none absolute left-1.5 top-0 bottom-1 w-px bg-primary/25" />
                    <span aria-hidden="true" className="pointer-events-none absolute left-1.5 top-3 h-px w-3 bg-primary/25" />
                    {visibleClaudeCodeFamilies.map((family) => {
                      const canBlock = family.id !== "other";
                      return (
                        <span key={family.id}
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded border ${
                            canBlock ? "bg-white dark:bg-surface text-text-main border-border" : "bg-black/5 dark:bg-white/5 text-text-muted border-border"
                          }`}
                          title={canBlock ? `Allow ${family.label} family through Claude Code default` : "Catch-all for other Claude Code models"}>
                          <span className="font-mono">{family.label}</span>
                          {canBlock && (
                            <button type="button" onClick={() => onBlockClaudeCodeFamily(family.id as ClaudeCodeBlockableFamilyId)}
                              className="text-text-muted hover:text-red-500 transition-colors" title={`Block ${family.label} family`}>
                              <span className="material-symbols-outlined text-[12px]">close</span>
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          return (
            <span key={modelId} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white dark:bg-surface text-text-main text-[10px] rounded border border-border">
              <span className="font-mono truncate max-w-[120px]" title={modelId}>{getModelDisplayName(modelId)}</span>
              <button type="button" onClick={() => onToggleModel(modelId)} className="text-text-muted hover:text-red-500 transition-colors">
                <span className="material-symbols-outlined text-[12px]">close</span>
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function ModelSearchAndSelect({
  searchModel, onSearchChange, modelsByProvider, selectedModels, expandedProviders,
  getModelDisplayName, onToggleExpand, onToggleProvider, onToggleModel,
}: {
  searchModel: string; onSearchChange: (v: string) => void;
  modelsByProvider: ProviderGroup[]; selectedModels: string[]; expandedProviders: Set<string>;
  getModelDisplayName: (modelId: string) => string;
  onToggleExpand: (provider: string) => void;
  onToggleProvider: (provider: string, models: Model[]) => void;
  onToggleModel: (modelId: string) => void;
}) {
  const t = useTranslations("apiManager");
  return (
    <>
      <div className="relative">
        <Input value={searchModel} onChange={(e) => onSearchChange(e.target.value)} placeholder={t("searchModels")} icon="search" />
        {searchModel && (
          <button onClick={() => onSearchChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
      </div>
      <div className="max-h-[280px] overflow-y-auto border border-border rounded-lg divide-y divide-border">
        {modelsByProvider.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-text-muted">
            <span className="material-symbols-outlined text-2xl mb-1">search_off</span>
            <p className="text-xs">{t("noModelsFound")}</p>
          </div>
        ) : modelsByProvider.map(([provider, models]) => {
          const selectedInProvider = selectedModels.filter((m) => models.some((model) => model.id === m)).length;
          const allSelected = models.every((m) => selectedModels.includes(m.id));
          const someSelected = selectedInProvider > 0 && !allSelected;
          return (
            <div key={provider} className="group">
              <button onClick={() => onToggleExpand(provider)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface/50 transition-colors text-left">
                <span className={`material-symbols-outlined text-base transition-transform duration-200 ${expandedProviders.has(provider) ? "rotate-90" : ""}`}>chevron_right</span>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="relative flex items-center cursor-pointer shrink-0" onClick={(e) => { e.stopPropagation(); onToggleProvider(provider, models); }}>
                    <div className={`w-4 h-4 rounded border-2 transition-colors flex items-center justify-center ${
                      allSelected ? "bg-primary border-primary" : someSelected ? "bg-primary/20 border-primary" : "border-border hover:border-primary/50"
                    }`}>
                      {allSelected && (<span className="material-symbols-outlined text-white text-[12px]">check</span>)}
                      {someSelected && !allSelected && (<span className="material-symbols-outlined text-primary text-[12px]">remove</span>)}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-text-main truncate">{provider}</span>
                  <span className="text-[10px] text-text-muted bg-surface px-1 py-0.5 rounded shrink-0">{models.length}</span>
                </div>
                {selectedInProvider > 0 && (
                  <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">{selectedInProvider}</span>
                )}
              </button>
              {expandedProviders.has(provider) && (
                <div className="px-3 pb-2 pl-9">
                  <div className="flex flex-wrap gap-1">
                    {models.map((model) => {
                      const isSelected = selectedModels.includes(model.id);
                      return (
                        <button key={model.id} onClick={() => onToggleModel(model.id)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-mono transition-all ${
                            isSelected ? "bg-primary text-white" : "bg-surface border border-border text-text-muted hover:border-primary/50 hover:text-text-main"
                          }`} title={model.id}>
                          {getModelDisplayName(model.id)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function ConnectionsSection({
  allConnections, allowAllConnections, selectedConnections,
  onSetAllowAllConnections, onToggleConnection,
}: {
  allConnections: ProviderConnection[]; allowAllConnections: boolean;
  selectedConnections: string[];
  onSetAllowAllConnections: (allowAll: boolean) => void;
  onToggleConnection: (connectionId: string) => void;
}) {
  const t = useTranslations("apiManager");
  if (allConnections.length === 0) return null;
  const grouped = Object.entries(
    allConnections.reduce<Record<string, ProviderConnection[]>>((acc, conn) => {
      const p = conn.provider || "Other";
      if (!acc[p]) acc[p] = [];
      acc[p].push(conn);
      return acc;
    }, {})
  ).sort(([a], [b]) => compareTr(a, b));
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-surface/40">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-main">{t("allowedConnections")}</p>
        <div className="flex gap-1 p-0.5 bg-surface rounded-md">
          <button onClick={() => { onSetAllowAllConnections(true); }}
            className={`px-2 py-1 rounded text-xs font-medium transition-all ${allowAllConnections ? "bg-primary text-white" : "text-text-muted hover:bg-black/5 dark:hover:bg-white/5"}`}>All</button>
          <button onClick={() => onSetAllowAllConnections(false)}
            className={`px-2 py-1 rounded text-xs font-medium transition-all ${!allowAllConnections ? "bg-primary text-white" : "text-text-muted hover:bg-black/5 dark:hover:bg-white/5"}`}>Restrict</button>
        </div>
      </div>
      <p className="text-xs text-text-muted">
        {allowAllConnections ? "This key can use any active connection."
          : `Restricted to ${selectedConnections.length} connection${selectedConnections.length !== 1 ? "s" : ""}.`}
      </p>
      {!allowAllConnections && (
        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
          {grouped.map(([provider, conns]) => (
            <div key={provider}>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-1 py-0.5">{provider}</p>
              {conns.map((conn) => {
                const isSelected = selectedConnections.includes(conn.id);
                return (
                  <button key={conn.id} onClick={() => onToggleConnection(conn.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-all ${
                      isSelected ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-surface/50 hover:text-text-main"
                    }`}>
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${isSelected ? "bg-primary border-primary" : "border-border"}`}>
                      {isSelected && (<span className="material-symbols-outlined text-white text-[10px]">check</span>)}
                    </div>
                    <span className="truncate flex-1">{conn.name || conn.id.slice(0, 8)}</span>
                    {!conn.isActive && (<span className="text-[9px] text-red-400 shrink-0">inactive</span>)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CombosSection({
  allCombos, allowAllCombos, selectedCombos, onSetAllowAllCombos, onToggleCombo,
}: {
  allCombos: ComboOption[]; allowAllCombos: boolean; selectedCombos: string[];
  onSetAllowAllCombos: (allowAll: boolean) => void; onToggleCombo: (comboName: string) => void;
}) {
  if (allCombos.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-surface/40">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-main">Allowed Combos</p>
        <div className="flex gap-1 p-0.5 bg-surface rounded-md">
          <button onClick={() => { onSetAllowAllCombos(true); }}
            className={`px-2 py-1 rounded text-xs font-medium transition-all ${allowAllCombos ? "bg-primary text-white" : "text-text-muted hover:bg-black/5 dark:hover:bg-white/5"}`}>All</button>
          <button onClick={() => onSetAllowAllCombos(false)}
            className={`px-2 py-1 rounded text-xs font-medium transition-all ${!allowAllCombos ? "bg-primary text-white" : "text-text-muted hover:bg-black/5 dark:hover:bg-white/5"}`}>Restrict</button>
        </div>
      </div>
      <p className="text-xs text-text-muted">
        {allowAllCombos ? "This key can use any combo."
          : `Restricted to ${selectedCombos.length} combo${selectedCombos.length !== 1 ? "s" : ""}.`}
      </p>
      {!allowAllCombos && (
        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
          {allCombos.slice().sort((a, b) => a.name.localeCompare(b.name)).map((combo) => {
            const isSelected = selectedCombos.includes(combo.name);
            return (
              <button key={combo.id || combo.name} onClick={() => onToggleCombo(combo.name)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-all ${
                  isSelected ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-surface/50 hover:text-text-main"
                }`}>
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${isSelected ? "bg-primary border-primary" : "border-border"}`}>
                  {isSelected && (<span className="material-symbols-outlined text-white text-[10px]">check</span>)}
                </div>
                <span className="truncate flex-1">{combo.name}</span>
                {Array.isArray(combo.models) && (
                  <span className="text-[10px] text-text-muted shrink-0">{combo.models.length} models</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function EndpointsSection({
  allowAllEndpoints, selectedEndpoints, onSetAllowAllEndpoints, onToggleEndpoint,
}: {
  allowAllEndpoints: boolean; selectedEndpoints: string[];
  onSetAllowAllEndpoints: (allowAll: boolean) => void; onToggleEndpoint: (categoryId: string) => void;
}) {
  const t = useTranslations("apiManager");
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-surface/40">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-text-main">{t("endpointRestrictions")}</p>
          <p className="text-xs text-text-muted">
            {allowAllEndpoints ? t("allEndpointsAllowed") : t("endpointsRestricted", { count: selectedEndpoints.length })}
          </p>
        </div>
        <div className="flex gap-1 p-0.5 bg-surface rounded-md">
          <button onClick={() => { onSetAllowAllEndpoints(true); }}
            className={`px-2 py-1 rounded text-xs font-medium transition-all ${allowAllEndpoints ? "bg-primary text-white" : "text-text-muted hover:bg-black/5 dark:hover:bg-white/5"}`}>{t("all")}</button>
          <button onClick={() => onSetAllowAllEndpoints(false)}
            className={`px-2 py-1 rounded text-xs font-medium transition-all ${!allowAllEndpoints ? "bg-primary text-white" : "text-text-muted hover:bg-black/5 dark:hover:bg-white/5"}`}>{t("restrict")}</button>
        </div>
      </div>
      {!allowAllEndpoints && (
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
          {ENDPOINT_CATEGORIES.map((cat) => {
            const isSelected = selectedEndpoints.includes(cat.id);
            return (
              <button key={cat.id} onClick={() => onToggleEndpoint(cat.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-all ${
                  isSelected ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-surface/50 hover:text-text-main"
                }`}>
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${isSelected ? "bg-primary border-primary" : "border-border"}`}>
                  {isSelected && (<span className="material-symbols-outlined text-white text-[10px]">check</span>)}
                </div>
                <span className="truncate flex-1">{cat.label}</span>
                <span className="text-[10px] text-text-muted shrink-0 truncate max-w-[140px]">{cat.description}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
