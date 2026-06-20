"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import useEmailPrivacyStore from "@/store/emailPrivacyStore";
import { useNotificationStore } from "@/store/notificationStore";
import { normalizeComboConfigMode } from "@/shared/constants/comboConfigMode";
import {
  COMBO_BUILDER_AUTO_CONNECTION,
  COMBO_BUILDER_STAGES,
  buildPrecisionComboModelStep,
  getComboBuilderStageChecks,
  getComboBuilderStages,
  hasExactModelStepDuplicate,
  isIntelligentBuilderStrategy,
  parseQualifiedModel,
  buildManualComboModelStep,
} from "@/lib/combos/builderDraft";
import { normalizeIntelligentRoutingConfig } from "@/lib/combos/intelligentRouting";
import { useTranslations } from "next-intl";
import { COMBO_FORM_STAGE_META } from "./constants";
import {
  getI18nOrFallback,
  sanitizeComboRuntimeConfig,
  normalizeModelEntry,
  getModelString,
  findProviderNodeByIdentifier,
} from "./helpers";
import { createFormHandlers } from "./comboFormHandlers";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type CreateDraftSnapshot = {
  name: string;
  models: unknown[];
  strategy: string;
  config: Record<string, unknown>;
  showAdvanced: boolean;
  nameError: string;
  agentSystemMessage: string;
  agentToolFilter: string;
  agentContextCache: boolean;
  contextLength: number | undefined;
};

interface ComboFormStateParams {
  isOpen: boolean;
  combo: Record<string, unknown> | null;
  comboConfigMode: string;
  activeProviders: unknown[];
  onSave: (data: Record<string, unknown>) => Promise<void> | void;
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useComboFormState({
  isOpen,
  combo,
  comboConfigMode,
  activeProviders,
  onSave,
}: ComboFormStateParams) {
  const t = useTranslations("combos");
  const tc = useTranslations("common");
  const emailsVisible = useEmailPrivacyStore((s) => s.emailsVisible);
  const notify = useNotificationStore();
  const isExpertMode = normalizeComboConfigMode(comboConfigMode) === "expert";

  const getEmptyCreateDraftSnapshot = useCallback(
    (): CreateDraftSnapshot => ({
      name: "",
      models: [],
      strategy: "priority",
      config: {},
      showAdvanced: false,
      nameError: "",
      agentSystemMessage: "",
      agentToolFilter: "",
      agentContextCache: false,
      contextLength: undefined,
    }),
    []
  );

  const createDraftStateRef = useRef<CreateDraftSnapshot>(getEmptyCreateDraftSnapshot());

  // ── State ──
  const [name, setName] = useState(combo?.name || "");
  const [models, setModels] = useState(() => {
    return ((combo?.models as unknown[]) || []).map((m) => normalizeModelEntry(m));
  });
  const [strategy, setStrategy] = useState((combo?.strategy as string) || "priority");
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [pricingByProvider, setPricingByProvider] = useState<Record<string, unknown>>({});
  const [modelAliases, setModelAliases] = useState<Record<string, unknown>>({});
  const [providerNodes, setProviderNodes] = useState<Record<string, unknown>[]>([]);
  const [builderOptions, setBuilderOptions] = useState<{
    providers: Record<string, unknown>[];
    comboRefs: Record<string, unknown>[];
  }>({ providers: [], comboRefs: [] });
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderProviderId, setBuilderProviderId] = useState("");
  const [builderModelId, setBuilderModelId] = useState("");
  const [builderConnectionId, setBuilderConnectionId] = useState(COMBO_BUILDER_AUTO_CONNECTION);
  // #3266: optional account allowlist — scopes an auto-selecting step's round-robin
  // to a subset of the provider's connections. Empty = whole active pool.
  const [builderAllowedConnectionIds, setBuilderAllowedConnectionIds] = useState<string[]>([]);
  const [manualModelInput, setManualModelInput] = useState("");
  const [manualModelError, setManualModelError] = useState("");
  const [builderComboRefName, setBuilderComboRefName] = useState("");
  const [builderError, setBuilderError] = useState("");
  const [builderStage, setBuilderStage] = useState<string>(COMBO_BUILDER_STAGES[0]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [config, setConfig] = useState(sanitizeComboRuntimeConfig(combo?.config));
  const [showStrategyNudge, setShowStrategyNudge] = useState(false);
  const strategyChangeMountedRef = useRef(false);
  // Agent features (#399 / #401 / #454)
  const [agentSystemMessage, setAgentSystemMessage] = useState<string>(
    (combo?.system_message as string) || ""
  );
  const [agentToolFilter, setAgentToolFilter] = useState<string>(
    (combo?.tool_filter_regex as string) || ""
  );
  const [agentContextCache, setAgentContextCache] = useState<boolean>(
    !!combo?.context_cache_protection
  );
  const [contextLength, setContextLength] = useState<number | undefined>(
    (combo?.context_length as number) || undefined
  );
  const [contextLengthError, setContextLengthError] = useState<string>("");

  // DnD state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // ── Derived values ──
  const comboBuilderStages = useMemo(() => getComboBuilderStages({ strategy }), [strategy]);
  const visibleStageMeta = useMemo(
    () => COMBO_FORM_STAGE_META.filter((stageMeta) => comboBuilderStages.includes(stageMeta.id)),
    [comboBuilderStages]
  );
  const usesIntelligentBuilderStage = isIntelligentBuilderStrategy(strategy);
  const intelligentConfig = useMemo(() => normalizeIntelligentRoutingConfig(config), [config]);

  const builderProviders = useMemo(
    () => (builderOptions.providers || []) as Record<string, unknown>[],
    [builderOptions.providers]
  );
  const builderComboRefs = ((builderOptions.comboRefs || []) as Record<string, unknown>[]).filter(
    (comboRef) => comboRef.name !== combo?.name && comboRef.name !== (name as string).trim()
  );
  const selectedBuilderProvider =
    (builderProviders.find(
      (provider) => (provider as Record<string, unknown>).providerId === builderProviderId
    ) as Record<string, unknown>) || null;
  const selectedBuilderModel =
    ((selectedBuilderProvider?.models as Record<string, unknown>[])?.find(
      (model) => (model as Record<string, unknown>).id === builderModelId
    ) as Record<string, unknown>) || null;
  const selectedBuilderConnections = (selectedBuilderProvider?.connections ||
    []) as Record<string, unknown>[];
  const selectedBuilderConnection =
    builderConnectionId && builderConnectionId !== COMBO_BUILDER_AUTO_CONNECTION
      ? (selectedBuilderConnections.find(
          (connection) => (connection as Record<string, unknown>).id === builderConnectionId
        ) as Record<string, unknown>) || null
      : null;
  // Defensive: only carry allowlist ids that still belong to the selected provider's
  // connections, so stale ids from a previous provider can never leak into a step.
  const builderEffectiveAllowedConnectionIds = builderAllowedConnectionIds.filter((id) =>
    selectedBuilderConnections.some(
      (connection) => (connection as Record<string, unknown>).id === id
    )
  );
  const builderCandidateStep =
    selectedBuilderProvider && selectedBuilderModel
      ? buildPrecisionComboModelStep({
          providerId: selectedBuilderProvider.providerId as string,
          modelId: selectedBuilderModel.id as string,
          connectionId:
            builderConnectionId !== COMBO_BUILDER_AUTO_CONNECTION ? builderConnectionId : null,
          connectionLabel: (selectedBuilderConnection?.label as string) || null,
          allowedConnectionIds: builderEffectiveAllowedConnectionIds,
        })
      : null;
  const builderHasDuplicate =
    builderCandidateStep && hasExactModelStepDuplicate(models, builderCandidateStep);
  const manualModelStep = buildManualComboModelStep({
    value: manualModelInput,
    providers: builderProviders,
  });
  const manualModelHasDuplicate =
    manualModelStep && hasExactModelStepDuplicate(models, manualModelStep);
  const weightTotal = models.reduce(
    (sum, modelEntry) => sum + ((modelEntry.weight as number) || 0),
    0
  );

  const hasPricingForModel = useCallback(
    (modelValue: string) => {
      const parsed = parseQualifiedModel(modelValue);
      if (!parsed) return false;

      const { providerId: providerIdentifier, modelId } = parsed;
      const matchedNode = findProviderNodeByIdentifier(
        providerNodes,
        providerIdentifier
      ) as Record<string, unknown> | null;

      const providerCandidates = [providerIdentifier];
      if (matchedNode?.apiType) providerCandidates.push(matchedNode.apiType as string);
      if (matchedNode?.name) providerCandidates.push(String(matchedNode.name).toLowerCase());

      return providerCandidates.some(
        (candidate) =>
          !!(pricingByProvider as Record<string, Record<string, unknown>>)?.[candidate]?.[modelId]
      );
    },
    [pricingByProvider, providerNodes]
  );

  const pricedModelCount = models.reduce(
    (count, modelEntry) =>
      count + (hasPricingForModel(modelEntry.model as string) ? 1 : 0),
    0
  );
  const pricingCoveragePercent =
    models.length > 0 ? Math.round((pricedModelCount / models.length) * 100) : 0;
  const hasNoModels = models.length === 0;
  const hasRoundRobinSingleModel = strategy === "round-robin" && models.length === 1;
  const hasCostOptimizedWithoutPricing =
    strategy === "cost-optimized" && models.length > 0 && pricedModelCount === 0;
  const hasCostOptimizedPartialPricing =
    strategy === "cost-optimized" &&
    models.length > 0 &&
    pricedModelCount > 0 &&
    pricedModelCount < models.length;
  const hasInvalidWeightedTotal =
    strategy === "weighted" && models.length > 0 && weightTotal !== 100;
  const builderStageChecks = getComboBuilderStageChecks({
    name,
    nameError,
    modelsCount: models.length,
    hasInvalidWeightedTotal,
    hasCostOptimizedWithoutPricing,
  });
  const canAdvanceFromCurrentStage =
    builderStage === "basics"
      ? builderStageChecks.basics
      : builderStage === "steps"
        ? builderStageChecks.steps
        : builderStage === "intelligent"
          ? true
          : true;
  const currentStageIndex = visibleStageMeta.findIndex(
    (stageMeta) => stageMeta.id === builderStage
  );
  const pinnedAccountCount = models.filter(
    (entry) => Boolean(entry?.connectionId)
  ).length;
  const comboRefCount = models.filter(
    (entry) => entry?.kind === "combo-ref"
  ).length;
  const uniqueProviderCount = new Set(
    models
      .map((entry) => {
        const target = getModelString(entry);
        const parsed = parseQualifiedModel(target);
        return entry?.providerId || parsed?.providerId || null;
      })
      .filter(Boolean)
  ).size;
  const saveBlocked =
    !name.trim() ||
    !!nameError ||
    !!contextLengthError ||
    saving ||
    hasNoModels ||
    hasInvalidWeightedTotal ||
    hasCostOptimizedWithoutPricing;
  const readinessChecks = [
    {
      id: "name",
      ok: !!name.trim() && !nameError,
      label: getI18nOrFallback(t, "readinessCheckName", "Combo name is valid"),
    },
    {
      id: "models",
      ok: !hasNoModels,
      label: getI18nOrFallback(t, "readinessCheckModels", "At least one model is selected"),
    },
    {
      id: "weights",
      ok: strategy === "weighted" ? !hasInvalidWeightedTotal : true,
      label:
        strategy === "weighted"
          ? getI18nOrFallback(t, "readinessCheckWeights", "Weighted total is 100%")
          : getI18nOrFallback(t, "readinessCheckWeightsOptional", "Weight rule not required"),
    },
    {
      id: "pricing",
      ok: strategy === "cost-optimized" ? !hasCostOptimizedWithoutPricing : true,
      label:
        strategy === "cost-optimized"
          ? getI18nOrFallback(t, "readinessCheckPricing", "Pricing data is available")
          : getI18nOrFallback(t, "readinessCheckPricingOptional", "Pricing rule not required"),
    },
  ];
  const saveBlockers: string[] = [];
  if (!name.trim()) {
    saveBlockers.push(getI18nOrFallback(t, "saveBlockName", "Define a combo name."));
  } else if (nameError) {
    saveBlockers.push(nameError);
  }
  if (hasNoModels) {
    saveBlockers.push(getI18nOrFallback(t, "saveBlockModels", "Add at least one model."));
  }
  if (hasInvalidWeightedTotal) {
    saveBlockers.push(
      typeof t.has === "function" && t.has("saveBlockWeighted")
        ? t("saveBlockWeighted", { total: weightTotal })
        : `Set weights to 100% (current: ${weightTotal}%).`
    );
  }
  if (hasCostOptimizedWithoutPricing) {
    saveBlockers.push(
      getI18nOrFallback(
        t,
        "saveBlockPricing",
        "Add pricing for at least one model or choose a different strategy."
      )
    );
  }
  const showInlineReadinessPanel = !isExpertMode || saveBlockers.length > 0;

  const isEdit = !!combo;
  const showBasicsSection = isExpertMode || builderStage === "basics";
  const showStepsSection = isExpertMode || builderStage === "steps";
  const showStrategySection = isExpertMode || builderStage === "strategy";
  const showIntelligentSection =
    usesIntelligentBuilderStage && (isExpertMode || builderStage === "intelligent");
  const showReviewSection = !isExpertMode && builderStage === "review";
  const advancedConfigVisible = isExpertMode || showAdvanced;

  // ── Effects ──

  const resetFormForCombo = useCallback(
    (
      nextCombo: Record<string, unknown> | null,
      comboDefaults: Record<string, unknown> | null = null
    ) => {
      const nextDefaults =
        nextCombo || comboDefaults
          ? {
              ...(comboDefaults || {}),
            }
          : {};
      const nextConfig = nextCombo?.config
        ? sanitizeComboRuntimeConfig(nextCombo.config)
        : sanitizeComboRuntimeConfig(
            Object.fromEntries(
              Object.entries(nextDefaults).filter(([key]) => key !== "strategy")
            )
          );

      setName((nextCombo?.name as string) || "");
      setModels(
        ((nextCombo?.models as unknown[]) || []).map((m) => normalizeModelEntry(m))
      );
      setStrategy(
        (nextCombo?.strategy as string) ||
          (comboDefaults?.strategy as string) ||
          "priority"
      );
      setConfig(nextConfig);
      setShowAdvanced(isExpertMode);
      setNameError("");
      setContextLengthError("");
      setAgentSystemMessage((nextCombo?.system_message as string) || "");
      setAgentToolFilter((nextCombo?.tool_filter_regex as string) || "");
      setAgentContextCache(!!nextCombo?.context_cache_protection);
      setContextLength((nextCombo?.context_length as number) || undefined);
    },
    [isExpertMode]
  );

  useEffect(() => {
    createDraftStateRef.current = {
      name,
      models,
      strategy,
      config,
      showAdvanced,
      nameError,
      agentSystemMessage,
      agentToolFilter,
      agentContextCache,
      contextLength,
    };
  }, [
    name,
    models,
    strategy,
    config,
    showAdvanced,
    nameError,
    agentSystemMessage,
    agentToolFilter,
    agentContextCache,
    contextLength,
  ]);

  useEffect(() => {
    if (!comboBuilderStages.includes(builderStage)) {
      setBuilderStage("strategy");
    }
  }, [builderStage, comboBuilderStages]);

  const fetchModalData = async () => {
    setBuilderLoading(true);
    try {
      const [aliasesRes, nodesRes, pricingRes, builderRes] = await Promise.all([
        fetch("/api/models/alias"),
        fetch("/api/provider-nodes"),
        fetch("/api/pricing"),
        fetch("/api/combos/builder/options"),
      ]);

      if (!aliasesRes.ok || !nodesRes.ok) {
        throw new Error(
          `Failed to fetch data: aliases=${aliasesRes.status}, nodes=${nodesRes.status}`
        );
      }
      const pricingData = pricingRes.ok ? await pricingRes.json() : {};
      const builderData = builderRes.ok ? await builderRes.json() : {};

      const [aliasesData, nodesData] = await Promise.all([aliasesRes.json(), nodesRes.json()]);
      setPricingByProvider(
        pricingData && typeof pricingData === "object" && !Array.isArray(pricingData)
          ? pricingData
          : {}
      );
      setModelAliases(aliasesData.aliases || {});
      setProviderNodes(nodesData.nodes || []);
      setBuilderOptions({
        providers: builderData.providers || [],
        comboRefs: builderData.comboRefs || [],
      });
    } catch (error) {
      console.error("Error fetching modal data:", error);
      setBuilderOptions({ providers: [], comboRefs: [] });
    } finally {
      setBuilderLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchModalData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setBuilderProviderId("");
    setBuilderModelId("");
    setBuilderConnectionId(COMBO_BUILDER_AUTO_CONNECTION);
    setBuilderAllowedConnectionIds([]);
    setManualModelInput("");
    setManualModelError("");
    setBuilderComboRefName("");
    setBuilderError("");
    setBuilderStage("basics");
  }, [(combo as Record<string, unknown> | null)?.id, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    if (combo) {
      resetFormForCombo(combo);
      return () => {
        cancelled = true;
      };
    }

    createDraftStateRef.current = getEmptyCreateDraftSnapshot();
    resetFormForCombo(null, null);

    const loadDefaults = async () => {
      try {
        const response = await fetch("/api/settings/combo-defaults");
        const data = response.ok ? await response.json() : {};
        const draft = createDraftStateRef.current;
        const isPristineDraft =
          draft.name.trim().length === 0 &&
          draft.models.length === 0 &&
          draft.strategy === "priority" &&
          Object.keys(draft.config || {}).length === 0 &&
          (draft.showAdvanced === false || (isExpertMode && draft.showAdvanced === true)) &&
          draft.nameError.length === 0 &&
          draft.agentSystemMessage.length === 0 &&
          draft.agentToolFilter.length === 0 &&
          draft.agentContextCache === false &&
          draft.contextLength === undefined;

        if (!cancelled && isPristineDraft) {
          resetFormForCombo(null, data.comboDefaults || null);
        }
      } catch {
        // Keep the blank create form if defaults fail to load.
      }
    };

    loadDefaults();

    return () => {
      cancelled = true;
    };
  }, [combo, getEmptyCreateDraftSnapshot, isExpertMode, isOpen, resetFormForCombo]);

  useEffect(() => {
    if (!isOpen) return;
    if (builderProviderId) return;
    if (builderProviders.length === 1) {
      setBuilderProviderId(
        (builderProviders[0] as Record<string, unknown>).providerId as string
      );
    }
  }, [builderProviderId, builderProviders, isOpen]);

  useEffect(() => {
    if (!strategyChangeMountedRef.current) {
      strategyChangeMountedRef.current = true;
      return;
    }

    setShowStrategyNudge(true);
    const timeoutId = setTimeout(() => setShowStrategyNudge(false), 2600);
    return () => clearTimeout(timeoutId);
  }, [strategy]);

  // ── Handlers via factory ──
  const handlers = createFormHandlers({
    name,
    models,
    strategy,
    config,
    nameError,
    agentSystemMessage,
    agentToolFilter,
    agentContextCache,
    contextLength,
    builderProviderId,
    builderModelId,
    builderConnectionId,
    builderAllowedConnectionIds,
    manualModelInput,
    builderComboRefName,
    builderStage,
    dragIndex,
    saving,
    setName,
    setModels,
    setStrategy,
    setConfig,
    setNameError,
    setAgentSystemMessage,
    setAgentToolFilter,
    setAgentContextCache,
    setContextLength,
    setContextLengthError,
    setBuilderProviderId,
    setBuilderModelId,
    setBuilderConnectionId,
    setBuilderAllowedConnectionIds,
    setManualModelInput,
    setManualModelError,
    setBuilderComboRefName,
    setBuilderError,
    setBuilderStage,
    setDragIndex,
    setDragOverIndex,
    setSaving,
    setShowAdvanced,
    setShowStrategyNudge,
    isExpertMode,
    isEdit,
    hasNoModels,
    hasInvalidWeightedTotal,
    hasCostOptimizedWithoutPricing,
    weightTotal,
    selectedBuilderProvider,
    selectedBuilderModel,
    selectedBuilderConnection,
    selectedBuilderConnections,
    builderEffectiveAllowedConnectionIds,
    builderProviders,
    t,
    notify,
    combo,
    onSave,
  });

  // ── Return ──
  return {
    // Translations
    t,
    tc,
    // Derived flags
    isExpertMode,
    isEdit,
    usesIntelligentBuilderStage,
    // Builder stage
    builderStage,
    setBuilderStage,
    visibleStageMeta,
    currentStageIndex,
    builderStageChecks,
    canAdvanceFromCurrentStage,
    // Section visibility
    showBasicsSection,
    showStepsSection,
    showStrategySection,
    showIntelligentSection,
    showReviewSection,
    advancedConfigVisible,
    // Readiness / save
    saveBlocked,
    saving,
    showInlineReadinessPanel,
    readinessChecks,
    saveBlockers,
    // Basics
    name,
    nameError,
    strategy,
    setStrategy,
    showStrategyNudge,
    // Config
    config,
    setConfig,
    intelligentConfig,
    // Advanced
    showAdvanced,
    setShowAdvanced,
    // Agent features
    agentSystemMessage,
    setAgentSystemMessage,
    agentToolFilter,
    setAgentToolFilter,
    agentContextCache,
    setAgentContextCache,
    contextLength,
    setContextLength,
    contextLengthError,
    setContextLengthError,
    // Steps panel - models
    models,
    weightTotal,
    pricedModelCount,
    pricingCoveragePercent,
    hasNoModels,
    hasInvalidWeightedTotal,
    hasRoundRobinSingleModel,
    hasCostOptimizedPartialPricing,
    hasCostOptimizedWithoutPricing,
    hasPricingForModel,
    // Steps panel - builder
    builderProviderId,
    builderModelId,
    builderConnectionId,
    builderLoading,
    builderProviders,
    selectedBuilderProvider,
    selectedBuilderModel,
    selectedBuilderConnections,
    builderAllowedConnectionIds,
    builderCandidateStep,
    builderHasDuplicate,
    builderComboRefName,
    setBuilderComboRefName,
    builderComboRefs,
    builderError,
    manualModelInput,
    setManualModelInput,
    manualModelError,
    setManualModelError,
    manualModelHasDuplicate,
    // Steps panel - DnD
    dragIndex,
    dragOverIndex,
    // Review
    pinnedAccountCount,
    uniqueProviderCount,
    comboRefCount,
    // Model select modal
    showModelSelect,
    setShowModelSelect,
    // Store values
    emailsVisible,
    modelAliases,
    // Active providers passthrough
    activeProviders,
    // All handlers from factory
    ...handlers,
  };
}
