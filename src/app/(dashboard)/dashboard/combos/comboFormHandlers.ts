import type React from "react";

import {
  buildManualComboModelStep,
  buildPrecisionComboModelStep,
  findNextSuggestedConnectionId,
  getNextComboBuilderStage,
  getPreviousComboBuilderStage,
  hasExactModelStepDuplicate,
  parseQualifiedModel,
  resolveComboBuilderProviderId,
  COMBO_BUILDER_AUTO_CONNECTION,
} from "@/lib/combos/builderDraft";
import { sanitizeComboRuntimeConfig, getI18nOrFallback, normalizeModelEntry } from "./helpers";
import {
  STRATEGY_DEFAULTS,
  FREE_STACK_PRESET_MODELS,
  PAID_PREMIUM_PRESET_MODELS,
} from "./comboFormHelpers";
import { VALID_NAME_REGEX } from "./constants";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface FormHandlerDeps {
  // State values
  name: string;
  models: Record<string, unknown>[];
  strategy: string;
  config: Record<string, Record<string, unknown> | undefined> & Record<string, unknown>;
  nameError: string;
  agentSystemMessage: string;
  agentToolFilter: string;
  agentContextCache: boolean;
  contextLength: number | undefined;
  builderProviderId: string;
  builderModelId: string;
  builderConnectionId: string;
  builderAllowedConnectionIds: string[];
  manualModelInput: string;
  builderComboRefName: string;
  builderStage: string;
  dragIndex: number | null;
  saving: boolean;

  // State setters
  setName: React.Dispatch<React.SetStateAction<string>>;
  setModels: React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>;
  setStrategy: React.Dispatch<React.SetStateAction<string>>;
  setConfig: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  setNameError: React.Dispatch<React.SetStateAction<string>>;
  setAgentSystemMessage: React.Dispatch<React.SetStateAction<string>>;
  setAgentToolFilter: React.Dispatch<React.SetStateAction<string>>;
  setAgentContextCache: React.Dispatch<React.SetStateAction<boolean>>;
  setContextLength: React.Dispatch<React.SetStateAction<number | undefined>>;
  setContextLengthError: React.Dispatch<React.SetStateAction<string>>;
  setBuilderProviderId: React.Dispatch<React.SetStateAction<string>>;
  setBuilderModelId: React.Dispatch<React.SetStateAction<string>>;
  setBuilderConnectionId: React.Dispatch<React.SetStateAction<string>>;
  setBuilderAllowedConnectionIds: React.Dispatch<React.SetStateAction<string[]>>;
  setManualModelInput: React.Dispatch<React.SetStateAction<string>>;
  setManualModelError: React.Dispatch<React.SetStateAction<string>>;
  setBuilderComboRefName: React.Dispatch<React.SetStateAction<string>>;
  setBuilderError: React.Dispatch<React.SetStateAction<string>>;
  setBuilderStage: React.Dispatch<React.SetStateAction<string>>;
  setDragIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setDragOverIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setSaving: React.Dispatch<React.SetStateAction<boolean>>;
  setShowAdvanced: React.Dispatch<React.SetStateAction<boolean>>;
  setShowStrategyNudge: React.Dispatch<React.SetStateAction<boolean>>;

  // Derived values
  isExpertMode: boolean;
  isEdit: boolean;
  hasNoModels: boolean;
  hasInvalidWeightedTotal: boolean;
  hasCostOptimizedWithoutPricing: boolean;
  weightTotal: number;
  selectedBuilderProvider: Record<string, unknown> | null;
  selectedBuilderModel: Record<string, unknown> | null;
  selectedBuilderConnection: Record<string, unknown> | null;
  selectedBuilderConnections: Record<string, unknown>[];
  builderEffectiveAllowedConnectionIds: string[];
  builderProviders: Record<string, unknown>[];

  // External deps
  t: (key: string, params?: Record<string, unknown>) => string;
  notify: { success: (msg: string) => void };
  combo: Record<string, unknown> | null;
  onSave: (data: Record<string, unknown>) => Promise<void> | void;
}

// ─────────────────────────────────────────────
// Handler factory
// ─────────────────────────────────────────────

export function createFormHandlers(d: FormHandlerDeps) {
  const validateName = (value: string) => {
    if (!value.trim()) {
      d.setNameError(d.t("nameRequired"));
      return false;
    }
    if (!VALID_NAME_REGEX.test(value)) {
      d.setNameError(d.t("nameInvalid"));
      return false;
    }
    d.setNameError("");
    return true;
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    d.setName(value);
    if (value) validateName(value);
    else d.setNameError("");
  };

  const handleBuilderProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextProviderId = e.target.value;
    d.setBuilderProviderId(nextProviderId);
    d.setBuilderModelId("");
    d.setBuilderConnectionId(COMBO_BUILDER_AUTO_CONNECTION);
    d.setBuilderAllowedConnectionIds([]);
    d.setBuilderError("");
  };

  const handleBuilderAllowedConnectionToggle = (connectionId: string) => {
    d.setBuilderAllowedConnectionIds((prev) =>
      prev.includes(connectionId)
        ? prev.filter((id) => id !== connectionId)
        : [...prev, connectionId]
    );
    d.setBuilderError("");
  };

  const handleBuilderModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextModelId = e.target.value;
    d.setBuilderModelId(nextModelId);
    d.setBuilderError("");

    if (!nextModelId || !d.selectedBuilderProvider) {
      d.setBuilderConnectionId(COMBO_BUILDER_AUTO_CONNECTION);
      return;
    }

    d.setBuilderConnectionId(
      findNextSuggestedConnectionId(
        d.models,
        d.selectedBuilderProvider.providerId as string,
        nextModelId,
        (d.selectedBuilderProvider.connections || []) as Record<string, unknown>[]
      )
    );
  };

  const handleBuilderConnectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    d.setBuilderConnectionId(e.target.value || COMBO_BUILDER_AUTO_CONNECTION);
    d.setBuilderError("");
  };

  const handleGoToNextStage = () => {
    d.setBuilderStage((currentStage) => getNextComboBuilderStage(currentStage, { strategy: d.strategy }));
  };

  const handleGoToPreviousStage = () => {
    d.setBuilderStage((currentStage) => getPreviousComboBuilderStage(currentStage, { strategy: d.strategy }));
  };

  const handleAddBuilderStep = () => {
    if (!d.selectedBuilderProvider || !d.selectedBuilderModel) {
      return;
    }

    const nextStep = buildPrecisionComboModelStep({
      providerId: d.selectedBuilderProvider.providerId as string,
      modelId: d.selectedBuilderModel.id as string,
      connectionId:
        d.builderConnectionId !== COMBO_BUILDER_AUTO_CONNECTION ? d.builderConnectionId : null,
      connectionLabel: (d.selectedBuilderConnection?.label as string) || null,
      allowedConnectionIds: d.builderEffectiveAllowedConnectionIds,
    });

    if (hasExactModelStepDuplicate(d.models, nextStep)) {
      d.setBuilderError(
        getI18nOrFallback(
          d.t,
          "builderDuplicateExact",
          "This exact provider/model/account step is already in the combo."
        )
      );
      return;
    }

    const nextModels = [...d.models, nextStep];
    d.setModels(nextModels);
    d.setBuilderError("");
    d.setBuilderAllowedConnectionIds([]);
    d.setBuilderConnectionId(
      findNextSuggestedConnectionId(
        nextModels,
        d.selectedBuilderProvider.providerId as string,
        d.selectedBuilderModel.id as string,
        d.selectedBuilderConnections
      )
    );
  };

  const handleAddManualModel = () => {
    const parsedManualModel = parseQualifiedModel(d.manualModelInput);
    if (!parsedManualModel) {
      d.setManualModelError(
        getI18nOrFallback(d.t, "manualModelInvalid", "Enter a model as provider/model.")
      );
      return;
    }

    const resolvedProviderId = resolveComboBuilderProviderId(
      parsedManualModel.providerId,
      d.builderProviders
    );
    if (!resolvedProviderId) {
      d.setManualModelError(
        getI18nOrFallback(d.t, "manualModelUnknownProvider", "Unknown provider prefix.")
      );
      return;
    }

    const nextStep = buildManualComboModelStep({
      value: d.manualModelInput,
      providers: d.builderProviders,
    });

    if (!nextStep) {
      d.setManualModelError(
        getI18nOrFallback(d.t, "manualModelInvalid", "Enter a model as provider/model.")
      );
      return;
    }

    if (hasExactModelStepDuplicate(d.models, nextStep)) {
      d.setManualModelError(
        getI18nOrFallback(
          d.t,
          "builderDuplicateExact",
          "This exact provider/model/account step is already in the combo."
        )
      );
      return;
    }

    d.setModels([...d.models, nextStep]);
    d.setManualModelInput("");
    d.setManualModelError("");
  };

  const handleAddComboReference = () => {
    if (!d.builderComboRefName) return;

    d.setModels([
      ...d.models,
      {
        kind: "combo-ref",
        comboName: d.builderComboRefName,
        weight: 0,
      },
    ]);
    d.setBuilderComboRefName("");
    d.setBuilderError("");
  };

  const handleAddModel = (model: Record<string, unknown>) => {
    const qualifiedModel = typeof model?.value === "string" ? model.value : "";
    const parsedModel = parseQualifiedModel(qualifiedModel);
    const resolvedProviderId =
      resolveComboBuilderProviderId(model?.providerId as string, d.builderProviders) ||
      resolveComboBuilderProviderId(parsedModel?.providerId, d.builderProviders) ||
      (typeof model?.providerId === "string" && (model.providerId as string).trim()) ||
      parsedModel?.providerId ||
      null;
    const nextEntry = {
      model: qualifiedModel,
      ...(resolvedProviderId ? { providerId: resolvedProviderId } : {}),
      weight: 0,
    };
    if (hasExactModelStepDuplicate(d.models, nextEntry)) {
      d.setBuilderError(
        getI18nOrFallback(
          d.t,
          "builderDuplicateExact",
          "This exact provider/model/account step is already in the combo."
        )
      );
      return;
    }
    d.setModels([...d.models, nextEntry]);
    d.setBuilderError("");
  };

  const handleRemoveModel = (index: number) => {
    d.setModels(d.models.filter((_, i) => i !== index));
  };

  const handleWeightChange = (index: number, weight: number | string) => {
    const newModels = [...d.models];
    newModels[index] = {
      ...newModels[index],
      weight: Math.max(0, Math.min(100, Number(weight) || 0)),
    };
    d.setModels(newModels);
  };

  const handleAutoBalance = () => {
    const count = d.models.length;
    if (count === 0) return;
    const weight = Math.floor(100 / count);
    const remainder = 100 - weight * count;
    d.setModels(
      d.models.map((m, i) => ({
        ...m,
        weight: weight + (i === 0 ? remainder : 0),
      }))
    );
  };

  const applyStrategyRecommendations = () => {
    const defaults = STRATEGY_DEFAULTS[d.strategy] || STRATEGY_DEFAULTS.priority;
    d.setConfig((prev) => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(defaults)) {
        if (next[key] === undefined || next[key] === null || next[key] === "") {
          next[key] = value;
        }
      }
      return next;
    });

    if (d.strategy === "weighted" && d.models.length > 1) {
      handleAutoBalance();
    }

    if (d.strategy === "round-robin") {
      d.setShowAdvanced(true);
    }

    d.notify.success(
      getI18nOrFallback(d.t, "recommendationsApplied", "Recommendations applied to this combo.")
    );
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newModels = [...d.models];
    [newModels[index - 1], newModels[index]] = [newModels[index], newModels[index - 1]];
    d.setModels(newModels);
  };

  const handleMoveDown = (index: number) => {
    if (index === d.models.length - 1) return;
    const newModels = [...d.models];
    [newModels[index], newModels[index + 1]] = [newModels[index + 1], newModels[index]];
    d.setModels(newModels);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    d.setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
    if (e.target) {
      setTimeout(() => ((e.currentTarget as HTMLElement).style.opacity = "0.5"), 0);
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.target) (e.currentTarget as HTMLElement).style.opacity = "1";
    d.setDragIndex(null);
    d.setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    d.setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const fromIndex = d.dragIndex;
    if (fromIndex === null || fromIndex === dropIndex) return;

    const newModels = [...d.models];
    const [moved] = newModels.splice(fromIndex, 1);
    newModels.splice(dropIndex, 0, moved);
    d.setModels(newModels);
    d.setDragIndex(null);
    d.setDragOverIndex(null);
  };

  const handleSave = async () => {
    if (!validateName(d.name)) return;
    if (d.hasNoModels || d.hasInvalidWeightedTotal || d.hasCostOptimizedWithoutPricing) return;
    d.setSaving(true);

    const saveData: Record<string, unknown> = {
      name: d.name.trim(),
      models: d.models,
      strategy: d.strategy,
    };

    const configToSave = sanitizeComboRuntimeConfig(d.config);
    if (d.strategy === "round-robin") {
      if (d.config.concurrencyPerModel !== undefined)
        configToSave.concurrencyPerModel = d.config.concurrencyPerModel;
      if (d.config.queueTimeoutMs !== undefined) configToSave.queueTimeoutMs = d.config.queueTimeoutMs;
    }
    const hasConfigToSave = Object.keys(configToSave).length > 0;
    const hadExistingConfig = Object.keys(sanitizeComboRuntimeConfig(d.combo?.config)).length > 0;
    if (hasConfigToSave || (d.isEdit && hadExistingConfig)) {
      saveData.config = configToSave;
    }

    if (d.agentSystemMessage.trim()) saveData.system_message = d.agentSystemMessage.trim();
    else delete saveData.system_message;
    if (d.agentToolFilter.trim()) saveData.tool_filter_regex = d.agentToolFilter.trim();
    else delete saveData.tool_filter_regex;
    if (d.agentContextCache) saveData.context_cache_protection = true;
    else delete saveData.context_cache_protection;

    if (d.contextLength !== undefined && d.contextLength !== null) {
      const ctxLen = Number(d.contextLength);
      if (isNaN(ctxLen) || !Number.isInteger(ctxLen)) {
        d.setContextLengthError(d.t("agentFeaturesContextLengthErrorInteger"));
        d.setSaving(false);
        return;
      }
      if (ctxLen >= 1000 && ctxLen <= 2000000) {
        saveData.context_length = ctxLen;
      } else {
        d.setContextLengthError(d.t("agentFeaturesContextLengthErrorRange"));
        d.setSaving(false);
        return;
      }
    } else if (d.isEdit) {
      saveData.context_length = null;
    } else {
      delete saveData.context_length;
    }

    await d.onSave(saveData);
    d.setSaving(false);
  };

  const applyTemplate = (template: Record<string, unknown>) => {
    d.setName((template.suggestedName as string) || "");
    d.setStrategy((template.strategy as string) || "priority");
    d.setConfig(sanitizeComboRuntimeConfig((template.config as Record<string, unknown>) || {}));
    if (template.id === "free-stack") {
      d.setModels(FREE_STACK_PRESET_MODELS.map((m) => normalizeModelEntry(m)));
    } else if (template.id === "paid-premium") {
      d.setModels(PAID_PREMIUM_PRESET_MODELS.map((m) => normalizeModelEntry(m)));
    } else {
      d.setModels([]);
    }
    d.setNameError("");
  };

  return {
    validateName,
    handleNameChange,
    handleBuilderProviderChange,
    handleBuilderAllowedConnectionToggle,
    handleBuilderModelChange,
    handleBuilderConnectionChange,
    handleGoToNextStage,
    handleGoToPreviousStage,
    handleAddBuilderStep,
    handleAddManualModel,
    handleAddComboReference,
    handleAddModel,
    handleRemoveModel,
    handleWeightChange,
    handleAutoBalance,
    applyStrategyRecommendations,
    handleMoveUp,
    handleMoveDown,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    handleSave,
    applyTemplate,
  };
}
