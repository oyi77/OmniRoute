"use client";

import { useState, useMemo, useCallback, memo } from "react";
import { Button, Modal } from "@/shared/components";
import { useTranslations } from "next-intl";
import { mergeApiKeyPermissionScopes } from "./apiManagerScopes";
import { SELF_ACCOUNT_QUOTA_SCOPE, SELF_USAGE_SCOPE } from "@/shared/constants/selfServiceScopes";
import {
  CLAUDE_CODE_DEFAULT_MODEL_ID,
  CLAUDE_CODE_DEFAULT_MODEL_NAME,
  CLAUDE_CODE_DEFAULT_FAMILIES,
  CLAUDE_CODE_FAMILY_BLOCK_PATTERNS,
  CLAUDE_CODE_BLOCK_PATTERN_SET,
  MAX_SELECTED_MODELS,
  type ClaudeCodeBlockableFamilyId,
} from "./constants";
import { validateKeyName } from "./helpers";
import type {
  AccessSchedule,
  StreamDefaultMode,
  ApiKey,
  ProviderConnection,
  Model,
  ComboOption,
  ProviderGroup,
} from "./helpers";
import {
  getBlockedClaudeCodeFamilies,
  isClaudeCodeFamilyModel,
} from "./claude-code";
import {
  KeyNameSection,
  SaveErrorBanner,
  AccessModeToggle,
  InfoBanner,
  KeyActiveSection,
  MaxSessionsSection,
  ThrottleSection,
  RateLimitsSection,
  ScheduleSection,
  PrivacySection,
  AutoResolveSection,
  StreamDefaultSection,
  BanSection,
  ExpirationSection,
  ManagementAccessSection,
  SelfServiceSection,
  DisableNonPublicModelsSection,
  SelectedModelsSummary,
  ModelSearchAndSelect,
  ConnectionsSection,
  CombosSection,
  EndpointsSection,
} from "./modal-sections";

// -- Permissions Modal Component (Memoized for Performance) ------------------------------------------

export const PermissionsModal = memo(function PermissionsModal({
  isOpen,
  onClose,
  apiKey,
  modelsByProvider,
  allModels,
  allCombos,
  allConnections,
  searchModel,
  onSearchChange,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  apiKey: ApiKey;
  modelsByProvider: ProviderGroup[];
  allModels: Model[];
  allCombos: ComboOption[];
  allConnections: ProviderConnection[];
  searchModel: string;
  onSearchChange: (v: string) => void;
  onSave: (
    name: string,
    models: string[],
    combos: string[],
    noLog: boolean,
    connections: string[],
    autoResolve: boolean,
    isActive: boolean,
    throttleDelayMs: number,
    isBanned: boolean,
    expiresAt: string | null,
    maxSessions: number,
    accessSchedule: AccessSchedule | null,
    rateLimits: Array<{ limit: number; window: number }> | null,
    scopes: string[],
    allowedEndpoints: string[],
    streamDefaultMode: StreamDefaultMode,
    disableNonPublicModels: boolean,
    allowUsageCommand: boolean,
    usageLimitEnabled: boolean,
    dailyUsageLimitUsd: number | null,
    weeklyUsageLimitUsd: number | null,
    blockedModels: string[]
  ) => void;
}) {
  const t = useTranslations("apiManager");
  const tc = useTranslations("common");

  // Initialize state from props - component remounts when key prop changes
  const initialModels = Array.isArray(apiKey?.allowedModels) ? apiKey.allowedModels : [];
  const initialBlockedModels = useMemo(
    () => (Array.isArray(apiKey?.blockedModels) ? apiKey.blockedModels : []),
    [apiKey?.blockedModels]
  );
  const initialCombos = Array.isArray(apiKey?.allowedCombos) ? apiKey.allowedCombos : [];
  const initialConnections = Array.isArray(apiKey?.allowedConnections)
    ? apiKey.allowedConnections
    : [];
  const [keyName, setKeyName] = useState(apiKey?.name ?? "");
  const [selectedModels, setSelectedModels] = useState<string[]>(initialModels);
  const [blockedClaudeCodeFamilies, setBlockedClaudeCodeFamilies] = useState<
    ClaudeCodeBlockableFamilyId[]
  >(() => getBlockedClaudeCodeFamilies(initialBlockedModels));
  const [claudeCodeFamiliesExpanded, setClaudeCodeFamiliesExpanded] = useState(false);
  const [selectedCombos, setSelectedCombos] = useState<string[]>(initialCombos);
  const [allowAll, setAllowAll] = useState(initialModels.length === 0);
  const [allowAllCombos, setAllowAllCombos] = useState(initialCombos.length === 0);
  const [noLogEnabled, setNoLogEnabled] = useState(apiKey?.noLog === true);
  const [autoResolveEnabled, setAutoResolveEnabled] = useState(apiKey?.autoResolve === true);
  const [keyIsActive, setKeyIsActive] = useState(apiKey?.isActive !== false);
  const [throttleDelayMs, setThrottleDelayMs] = useState(
    typeof apiKey?.throttleDelayMs === "number" && apiKey.throttleDelayMs > 0
      ? apiKey.throttleDelayMs
      : 0
  );
  const [keyIsBanned, setKeyIsBanned] = useState(apiKey?.isBanned === true);
  const [expiresAt, setExpiresAt] = useState(apiKey?.expiresAt ?? "");
  const [manageEnabled, setManageEnabled] = useState(
    Array.isArray(apiKey?.scopes) && apiKey.scopes.includes("manage")
  );
  const [selfUsageEnabled, setSelfUsageEnabled] = useState(
    Array.isArray(apiKey?.scopes) && apiKey.scopes.includes(SELF_USAGE_SCOPE)
  );
  const [selfAccountQuotaEnabled, setSelfAccountQuotaEnabled] = useState(
    Array.isArray(apiKey?.scopes) && apiKey.scopes.includes(SELF_ACCOUNT_QUOTA_SCOPE)
  );
  const [maxSessions, setMaxSessions] = useState(
    typeof apiKey?.maxSessions === "number" && apiKey.maxSessions > 0 ? apiKey.maxSessions : 0
  );
  const [scheduleEnabled, setScheduleEnabled] = useState(apiKey?.accessSchedule?.enabled === true);
  const [scheduleFrom, setScheduleFrom] = useState(apiKey?.accessSchedule?.from ?? "08:00");
  const [scheduleUntil, setScheduleUntil] = useState(apiKey?.accessSchedule?.until ?? "18:00");
  const [scheduleDays, setScheduleDays] = useState<number[]>(
    apiKey?.accessSchedule?.days ?? [1, 2, 3, 4, 5]
  );
  const [scheduleTz, setScheduleTz] = useState(
    apiKey?.accessSchedule?.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [rateLimits, setRateLimits] = useState<Array<{ limit: number; window: number }>>(
    Array.isArray(apiKey?.rateLimits) ? apiKey.rateLimits : []
  );
  const [streamDefaultMode, setStreamDefaultMode] = useState<StreamDefaultMode>(
    apiKey?.streamDefaultMode === "json" ? "json" : "legacy"
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedConnections, setSelectedConnections] = useState<string[]>(initialConnections);
  const [allowAllConnections, setAllowAllConnections] = useState(initialConnections.length === 0);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() => {
    // Expand all providers by default when in restrict mode with existing selections
    if (initialModels.length > 0) {
      return new Set(modelsByProvider.map(([p]) => p));
    }
    return new Set();
  });

  const initialEndpoints = Array.isArray(apiKey?.allowedEndpoints) ? apiKey.allowedEndpoints : [];
  const [selectedEndpoints, setSelectedEndpoints] = useState<string[]>(initialEndpoints);
  const [allowAllEndpoints, setAllowAllEndpoints] = useState(initialEndpoints.length === 0);
  const [disableNonPublicModels, setDisableNonPublicModels] = useState(
    apiKey?.disableNonPublicModels === true
  );
  const [usageCommandEnabled, setUsageCommandEnabled] = useState(
    apiKey?.allowUsageCommand === true
  );
  const [usageLimitEnabled, setUsageLimitEnabled] = useState(apiKey?.usageLimitEnabled === true);
  const [dailyUsageLimitUsd, setDailyUsageLimitUsd] = useState(
    typeof apiKey?.dailyUsageLimitUsd === "number" && apiKey.dailyUsageLimitUsd > 0
      ? String(apiKey.dailyUsageLimitUsd)
      : ""
  );
  const [weeklyUsageLimitUsd, setWeeklyUsageLimitUsd] = useState(
    typeof apiKey?.weeklyUsageLimitUsd === "number" && apiKey.weeklyUsageLimitUsd > 0
      ? String(apiKey.weeklyUsageLimitUsd)
      : ""
  );
  const getModelDisplayName = useCallback(
    (modelId: string) =>
      modelId === CLAUDE_CODE_DEFAULT_MODEL_ID ? CLAUDE_CODE_DEFAULT_MODEL_NAME : modelId,
    []
  );

  // Memoize callbacks to prevent child re-renders
  const handleToggleModel = useCallback(
    (modelId: string) => {
      if (allowAll) return;

      setSelectedModels((prev) => {
        if (prev.includes(modelId)) {
          if (modelId === CLAUDE_CODE_DEFAULT_MODEL_ID) {
            setClaudeCodeFamiliesExpanded(false);
          }
          return prev.filter((m) => m !== modelId);
        }
        return [...prev, modelId];
      });
    },
    [allowAll]
  );

  const handleToggleProvider = useCallback(
    (provider: string, models: Model[]) => {
      if (allowAll) return;

      const modelIds = models.map((m) => m.id);
      setSelectedModels((prev) => {
        const allSelected = modelIds.every((id) => prev.includes(id));
        if (allSelected) {
          return prev.filter((m) => !modelIds.includes(m));
        }
        return [...new Set([...prev, ...modelIds])];
      });
    },
    [allowAll]
  );

  const handleSelectAll = useCallback(() => {
    setAllowAll(true);
    setSelectedModels([]);
    setBlockedClaudeCodeFamilies([]);
    setClaudeCodeFamiliesExpanded(false);
  }, []);

  const handleRestrictMode = useCallback(() => {
    setAllowAll(false);
    // Expand all providers when entering restrict mode
    const allProviders = new Set(modelsByProvider.map(([p]) => p));
    setExpandedProviders(allProviders);
  }, [modelsByProvider]);

  const handleToggleExpand = useCallback((provider: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  }, []);

  const handleSelectAllModels = useCallback(() => {
    const allModelIds = allModels.map((m) => m.id);
    setSelectedModels(allModelIds);
    setBlockedClaudeCodeFamilies([]);
    setClaudeCodeFamiliesExpanded(false);
  }, [allModels]);

  const handleDeselectAllModels = useCallback(() => {
    setSelectedModels([]);
    setBlockedClaudeCodeFamilies([]);
    setClaudeCodeFamiliesExpanded(false);
  }, []);

  const handleBlockClaudeCodeFamily = useCallback((familyId: ClaudeCodeBlockableFamilyId) => {
    setBlockedClaudeCodeFamilies((prev) => (prev.includes(familyId) ? prev : [...prev, familyId]));
    setSelectedModels((prev) =>
      prev.filter((modelId) => !isClaudeCodeFamilyModel(modelId, familyId))
    );
  }, []);

  const handleToggleCombo = useCallback(
    (comboName: string) => {
      if (allowAllCombos) return;
      setSelectedCombos((prev) =>
        prev.includes(comboName) ? prev.filter((name) => name !== comboName) : [...prev, comboName]
      );
    },
    [allowAllCombos]
  );

  const handleToggleConnection = useCallback(
    (connectionId: string) => {
      if (allowAllConnections) return;
      setSelectedConnections((prev) =>
        prev.includes(connectionId)
          ? prev.filter((c) => c !== connectionId)
          : [...prev, connectionId]
      );
    },
    [allowAllConnections]
  );

  const handleToggleEndpoint = useCallback(
    (categoryId: string) => {
      if (allowAllEndpoints) return;
      setSelectedEndpoints((prev) =>
        prev.includes(categoryId) ? prev.filter((e) => e !== categoryId) : [...prev, categoryId]
      );
    },
    [allowAllEndpoints]
  );

  const parseUsdLimitInput = useCallback((value: string): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, []);

  const handleSave = useCallback(() => {
    // Clear previous inline errors
    setNameError(null);
    setSaveError(null);

    // Validate name inline before calling onSave
    const validation = validateKeyName(keyName, t);
    if (!validation.valid) {
      setNameError(validation.error || t("invalidKeyName"));
      return;
    }

    // Validate models selection
    if (!allowAll && !Array.isArray(selectedModels)) {
      setSaveError(t("invalidModelsSelection"));
      return;
    }

    // Limit number of selected models to prevent abuse
    if (!allowAll && selectedModels.length > MAX_SELECTED_MODELS) {
      setSaveError(t("cannotSelectMoreThanModels", { max: MAX_SELECTED_MODELS }));
      return;
    }

    const schedule: AccessSchedule | null = scheduleEnabled
      ? {
          enabled: true,
          from: scheduleFrom,
          until: scheduleUntil,
          days: scheduleDays,
          tz: scheduleTz,
        }
      : null;
    const hasClaudeCodeDefaultSelected =
      !allowAll && selectedModels.includes(CLAUDE_CODE_DEFAULT_MODEL_ID);
    const blockedModels = initialBlockedModels.filter(
      (pattern) => !CLAUDE_CODE_BLOCK_PATTERN_SET.has(pattern)
    );
    if (hasClaudeCodeDefaultSelected) {
      for (const familyId of blockedClaudeCodeFamilies) {
        blockedModels.push(...CLAUDE_CODE_FAMILY_BLOCK_PATTERNS[familyId]);
      }
    }
    onSave(
      keyName,
      allowAll ? [] : selectedModels,
      allowAllCombos ? [] : selectedCombos,
      noLogEnabled,
      allowAllConnections ? [] : selectedConnections,
      autoResolveEnabled,
      keyIsActive,
      throttleDelayMs,
      keyIsBanned,
      expiresAt || null,
      maxSessions,
      schedule,
      rateLimits.length > 0 ? rateLimits : null,
      mergeApiKeyPermissionScopes(apiKey?.scopes, {
        manageEnabled,
        selfUsageEnabled,
        selfAccountQuotaEnabled,
      }),
      allowAllEndpoints ? [] : selectedEndpoints,
      streamDefaultMode,
      disableNonPublicModels,
      usageCommandEnabled,
      usageLimitEnabled,
      parseUsdLimitInput(dailyUsageLimitUsd),
      parseUsdLimitInput(weeklyUsageLimitUsd),
      blockedModels
    );
  }, [
    onSave,
    keyName,
    allowAll,
    selectedModels,
    allowAllCombos,
    selectedCombos,
    noLogEnabled,
    allowAllConnections,
    selectedConnections,
    autoResolveEnabled,
    keyIsActive,
    throttleDelayMs,
    keyIsBanned,
    expiresAt,
    maxSessions,
    manageEnabled,
    selfUsageEnabled,
    selfAccountQuotaEnabled,
    scheduleEnabled,
    scheduleFrom,
    scheduleUntil,
    scheduleDays,
    scheduleTz,
    rateLimits,
    allowAllEndpoints,
    selectedEndpoints,
    streamDefaultMode,
    disableNonPublicModels,
    usageCommandEnabled,
    usageLimitEnabled,
    dailyUsageLimitUsd,
    weeklyUsageLimitUsd,
    parseUsdLimitInput,
    blockedClaudeCodeFamilies,
    initialBlockedModels,
    apiKey?.scopes,
    t,
  ]);

  const selectedCount = selectedModels.length;
  const totalModels = allModels.length;
  const hasClaudeCodeDefaultSelected =
    !allowAll && selectedModels.includes(CLAUDE_CODE_DEFAULT_MODEL_ID);
  const orderedSelectedModels = useMemo(() => {
    if (!hasClaudeCodeDefaultSelected) return selectedModels;
    return [
      CLAUDE_CODE_DEFAULT_MODEL_ID,
      ...selectedModels.filter((modelId) => modelId !== CLAUDE_CODE_DEFAULT_MODEL_ID),
    ];
  }, [hasClaudeCodeDefaultSelected, selectedModels]);
  const visibleClaudeCodeFamilies = useMemo(
    () =>
      CLAUDE_CODE_DEFAULT_FAMILIES.filter(
        (family) =>
          family.id === "other" ||
          !blockedClaudeCodeFamilies.includes(family.id as ClaudeCodeBlockableFamilyId)
      ),
    [blockedClaudeCodeFamilies]
  );

  const handleKeyNameChange = useCallback(
    (value: string) => {
      setKeyName(value);
      setNameError(null);
    },
    []
  );

  const handleAddRateLimit = useCallback(() => {
    setRateLimits((prev) => [...prev, { limit: 100, window: 60 }]);
  }, []);

  const handleUpdateRateLimit = useCallback(
    (index: number, field: "limit" | "window", value: number) => {
      setRateLimits((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    []
  );

  const handleRemoveRateLimit = useCallback((index: number) => {
    setRateLimits((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleToggleSelfUsage = useCallback(() => {
    setSelfUsageEnabled((prev) => {
      if (prev) setSelfAccountQuotaEnabled(false);
      return !prev;
    });
  }, []);

  return (
    <Modal
      isOpen={onClose ? isOpen : false}
      title={t("permissionsTitle", { name: apiKey?.name || "" })}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <KeyNameSection
          keyName={keyName}
          nameError={nameError}
          onKeyNameChange={handleKeyNameChange}
        />

        <SaveErrorBanner saveError={saveError} />

        <AccessModeToggle
          allowAll={allowAll}
          onSelectAll={handleSelectAll}
          onRestrictMode={handleRestrictMode}
        />

        <InfoBanner
          allowAll={allowAll}
          selectedCount={selectedCount}
          totalModels={totalModels}
        />

        <KeyActiveSection
          keyIsActive={keyIsActive}
          onToggle={() => setKeyIsActive((prev) => !prev)}
        />

        <MaxSessionsSection
          maxSessions={maxSessions}
          onMaxSessionsChange={setMaxSessions}
        />

        <ThrottleSection
          throttleDelayMs={throttleDelayMs}
          onThrottleDelayMsChange={setThrottleDelayMs}
        />

        <RateLimitsSection
          rateLimits={rateLimits}
          onAddLimit={handleAddRateLimit}
          onUpdateLimit={handleUpdateRateLimit}
          onRemoveLimit={handleRemoveRateLimit}
        />

        <ScheduleSection
          scheduleEnabled={scheduleEnabled}
          scheduleFrom={scheduleFrom}
          scheduleUntil={scheduleUntil}
          scheduleDays={scheduleDays}
          scheduleTz={scheduleTz}
          onToggleEnabled={() => setScheduleEnabled((prev) => !prev)}
          onScheduleFromChange={setScheduleFrom}
          onScheduleUntilChange={setScheduleUntil}
          onScheduleDaysChange={setScheduleDays}
          onScheduleTzChange={setScheduleTz}
        />

        <PrivacySection
          noLogEnabled={noLogEnabled}
          onToggle={() => setNoLogEnabled((prev) => !prev)}
        />

        <AutoResolveSection
          autoResolveEnabled={autoResolveEnabled}
          onToggle={() => setAutoResolveEnabled((prev) => !prev)}
        />

        <StreamDefaultSection
          streamDefaultMode={streamDefaultMode}
          onModeChange={setStreamDefaultMode}
        />

        <BanSection
          keyIsBanned={keyIsBanned}
          onToggle={() => setKeyIsBanned((prev) => !prev)}
        />

        <ExpirationSection
          expiresAt={expiresAt}
          onExpiresAtChange={setExpiresAt}
        />

        <ManagementAccessSection
          manageEnabled={manageEnabled}
          onToggle={() => setManageEnabled((prev) => !prev)}
        />

        <SelfServiceSection
          selfUsageEnabled={selfUsageEnabled}
          selfAccountQuotaEnabled={selfAccountQuotaEnabled}
          usageCommandEnabled={usageCommandEnabled}
          usageLimitEnabled={usageLimitEnabled}
          dailyUsageLimitUsd={dailyUsageLimitUsd}
          weeklyUsageLimitUsd={weeklyUsageLimitUsd}
          onToggleSelfUsage={handleToggleSelfUsage}
          onToggleSelfAccountQuota={() => setSelfAccountQuotaEnabled((prev) => !prev)}
          onToggleUsageCommand={() => setUsageCommandEnabled((prev) => !prev)}
          onUsageLimitEnabledChange={setUsageLimitEnabled}
          onDailyUsageLimitUsdChange={setDailyUsageLimitUsd}
          onWeeklyUsageLimitUsdChange={setWeeklyUsageLimitUsd}
        />

        <DisableNonPublicModelsSection
          disableNonPublicModels={disableNonPublicModels}
          onToggle={() => setDisableNonPublicModels((prev) => !prev)}
        />

        {!allowAll && (
          <SelectedModelsSummary
            selectedCount={selectedCount}
            orderedSelectedModels={orderedSelectedModels}
            claudeCodeFamiliesExpanded={claudeCodeFamiliesExpanded}
            visibleClaudeCodeFamilies={visibleClaudeCodeFamilies}
            getModelDisplayName={getModelDisplayName}
            onSelectAllModels={handleSelectAllModels}
            onDeselectAllModels={handleDeselectAllModels}
            onToggleModel={handleToggleModel}
            onToggleClaudeCodeFamiliesExpanded={() =>
              setClaudeCodeFamiliesExpanded((prev) => !prev)
            }
            onBlockClaudeCodeFamily={handleBlockClaudeCodeFamily}
          />
        )}

        {!allowAll && (
          <ModelSearchAndSelect
            searchModel={searchModel}
            onSearchChange={onSearchChange}
            modelsByProvider={modelsByProvider}
            selectedModels={selectedModels}
            expandedProviders={expandedProviders}
            getModelDisplayName={getModelDisplayName}
            onToggleExpand={handleToggleExpand}
            onToggleProvider={handleToggleProvider}
            onToggleModel={handleToggleModel}
          />
        )}

        <ConnectionsSection
          allConnections={allConnections}
          allowAllConnections={allowAllConnections}
          selectedConnections={selectedConnections}
          onSetAllowAllConnections={(value) => {
            setAllowAllConnections(value);
            if (value) setSelectedConnections([]);
          }}
          onToggleConnection={handleToggleConnection}
        />

        <CombosSection
          allCombos={allCombos}
          allowAllCombos={allowAllCombos}
          selectedCombos={selectedCombos}
          onSetAllowAllCombos={(value) => {
            setAllowAllCombos(value);
            if (value) setSelectedCombos([]);
          }}
          onToggleCombo={handleToggleCombo}
        />

        <EndpointsSection
          allowAllEndpoints={allowAllEndpoints}
          selectedEndpoints={selectedEndpoints}
          onSetAllowAllEndpoints={(value) => {
            setAllowAllEndpoints(value);
            if (value) setSelectedEndpoints([]);
          }}
          onToggleEndpoint={handleToggleEndpoint}
        />

        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={handleSave} fullWidth>
            {t("savePermissions")}
          </Button>
          <Button onClick={onClose} variant="ghost" fullWidth>
            {tc("cancel")}
          </Button>
        </div>
      </div>
    </Modal>
  );
});
