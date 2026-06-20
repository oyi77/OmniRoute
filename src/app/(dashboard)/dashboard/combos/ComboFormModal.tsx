"use client";

import dynamic from "next/dynamic";
import Button from "@/shared/components/Button";
import Modal from "@/shared/components/Modal";
import { canAccessComboBuilderStage } from "@/lib/combos/builderDraft";
import BuilderIntelligentStep from "./BuilderIntelligentStep";
import { getI18nOrFallback } from "./helpers";
import ComboFormBasicsSection from "./ComboFormBasicsSection";
import ComboFormStepsPanel from "./ComboFormStepsPanel";
import ComboFormAdvancedConfig from "./ComboFormAdvancedConfig";
import ComboFormAgentFeatures from "./ComboFormAgentFeatures";
import ComboFormReviewSection from "./ComboFormReviewSection";
import { useComboFormState } from "./useComboFormState";

const ModelSelectModal = dynamic(() => import("@/shared/components/ModelSelectModal"), {
  ssr: false,
});

export default // ─────────────────────────────────────────────
// Combo Form Modal
// ─────────────────────────────────────────────
function ComboFormModal({ isOpen, combo, onClose, onSave, activeProviders, comboConfigMode }) {
  const {
    t,
    tc,
    isExpertMode,
    isEdit,
    usesIntelligentBuilderStage,
    builderStage,
    setBuilderStage,
    visibleStageMeta,
    currentStageIndex,
    builderStageChecks,
    canAdvanceFromCurrentStage,
    showBasicsSection,
    showStepsSection,
    showStrategySection,
    showIntelligentSection,
    showReviewSection,
    advancedConfigVisible,
    saveBlocked,
    saving,
    showInlineReadinessPanel,
    readinessChecks,
    saveBlockers,
    handleSave,
    name,
    nameError,
    handleNameChange,
    strategy,
    setStrategy,
    showStrategyNudge,
    applyStrategyRecommendations,
    applyTemplate,
    config,
    setConfig,
    intelligentConfig,
    showAdvanced,
    setShowAdvanced,
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
    models,
    handleAutoBalance,
    handleAddModel,
    handleRemoveModel,
    handleWeightChange,
    handleMoveUp,
    handleMoveDown,
    weightTotal,
    pricedModelCount,
    pricingCoveragePercent,
    hasNoModels,
    hasInvalidWeightedTotal,
    hasRoundRobinSingleModel,
    hasCostOptimizedPartialPricing,
    hasCostOptimizedWithoutPricing,
    hasPricingForModel,
    builderProviderId,
    handleBuilderProviderChange,
    builderLoading,
    builderProviders,
    selectedBuilderProvider,
    builderModelId,
    handleBuilderModelChange,
    selectedBuilderModel,
    builderConnectionId,
    handleBuilderConnectionChange,
    selectedBuilderConnections,
    builderAllowedConnectionIds,
    handleBuilderAllowedConnectionToggle,
    builderCandidateStep,
    builderHasDuplicate,
    handleAddBuilderStep,
    builderComboRefName,
    setBuilderComboRefName,
    builderComboRefs,
    handleAddComboReference,
    builderError,
    manualModelInput,
    setManualModelInput,
    manualModelError,
    setManualModelError,
    handleAddManualModel,
    manualModelHasDuplicate,
    dragIndex,
    dragOverIndex,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    pinnedAccountCount,
    uniqueProviderCount,
    comboRefCount,
    showModelSelect,
    setShowModelSelect,
    emailsVisible,
    modelAliases,
    handleGoToNextStage,
    handleGoToPreviousStage,
  } = useComboFormState({ isOpen, combo, comboConfigMode, activeProviders, onSave });

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={isEdit ? t("editCombo") : t("createCombo")}
        size="full"
      >
        <div className="flex flex-col gap-3">
          {!isExpertMode && (
            <div className="rounded-lg border border-black/8 dark:border-white/8 bg-black/[0.02] dark:bg-white/[0.02] p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <p className="text-xs font-semibold text-text-main">
                    {getI18nOrFallback(t, "builderFlowTitle", "Combo Builder Flow")}
                  </p>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    {getI18nOrFallback(
                      t,
                      "builderStagesDescription",
                      "Move through the stages in order to define the combo, build the steps, choose the routing strategy and review the result."
                    )}
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-text-muted">
                  {Math.max(currentStageIndex + 1, 1)}/{visibleStageMeta.length}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {visibleStageMeta.map((stageMeta, index) => {
                  const isActive = builderStage === stageMeta.id;
                  const canVisitStage = isActive
                    ? true
                    : canAccessComboBuilderStage(stageMeta.id, builderStageChecks, { strategy });
                  const isCompleted =
                    stageMeta.id === "review"
                      ? false
                      : stageMeta.id === "basics"
                        ? builderStageChecks.basics
                        : stageMeta.id === "steps"
                          ? builderStageChecks.steps
                          : stageMeta.id === "intelligent"
                            ? usesIntelligentBuilderStage
                            : builderStageChecks.strategy;

                  return (
                    <button
                      key={stageMeta.id}
                      type="button"
                      data-testid={`combo-builder-stage-${stageMeta.id}`}
                      onClick={() => {
                        if (!canVisitStage) return;
                        setBuilderStage(stageMeta.id);
                      }}
                      disabled={!canVisitStage}
                      className={`text-left rounded-lg border px-3 py-2 transition-all ${
                        isActive
                          ? "border-primary bg-primary/8"
                          : canVisitStage
                            ? "border-black/8 dark:border-white/8 bg-white/60 dark:bg-white/[0.02] hover:border-primary/40"
                            : "border-black/6 dark:border-white/6 bg-black/[0.015] dark:bg-white/[0.015] opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`material-symbols-outlined text-[14px] ${
                            isCompleted && !isActive
                              ? "text-emerald-500"
                              : isActive
                                ? "text-primary"
                                : "text-text-muted"
                          }`}
                        >
                          {isCompleted && !isActive ? "check_circle" : stageMeta.icon}
                        </span>
                        <span className="text-[11px] font-semibold text-text-main">
                          {getI18nOrFallback(
                            t,
                            `builderStage.${stageMeta.id}.label`,
                            stageMeta.fallbackLabel
                          )}
                        </span>
                      </div>
                      <p className="text-[10px] text-text-muted mt-1 leading-[1.45]">
                        {getI18nOrFallback(
                          t,
                          `builderStage.${stageMeta.id}.description`,
                          stageMeta.fallbackDescription
                        )}
                      </p>
                      <p className="text-[9px] uppercase tracking-wide mt-1 text-text-muted">
                        {index < currentStageIndex
                          ? getI18nOrFallback(t, "builderStageVisited", "Visited")
                          : isActive
                            ? getI18nOrFallback(t, "builderStageCurrent", "Current")
                            : canVisitStage
                              ? getI18nOrFallback(t, "builderStagePending", "Pending")
                              : getI18nOrFallback(t, "builderStageLocked", "Locked")}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <ComboFormBasicsSection
            showBasicsSection={showBasicsSection}
            showStrategySection={showStrategySection}
            t={t}
            isExpertMode={isExpertMode}
            isEdit={isEdit}
            name={name}
            handleNameChange={handleNameChange}
            nameError={nameError}
            strategy={strategy}
            setStrategy={setStrategy}
            showStrategyNudge={showStrategyNudge}
            applyStrategyRecommendations={applyStrategyRecommendations}
            applyTemplate={applyTemplate}
          />

          {showIntelligentSection && (
            <BuilderIntelligentStep
              t={t}
              config={config}
              activeProviders={activeProviders}
              onChange={(nextIntelligentConfig: Record<string, unknown>) =>
                setConfig((previousConfig) => ({
                  ...previousConfig,
                  ...nextIntelligentConfig,
                  weights: {
                    ...(previousConfig?.weights || {}),
                    ...(nextIntelligentConfig?.weights || {}),
                  },
                }))
              }
            />
          )}

          <ComboFormStepsPanel
            showStepsSection={showStepsSection}
            t={t}
            isExpertMode={isExpertMode}
            strategy={strategy}
            models={models}
            handleAutoBalance={handleAutoBalance}
            setShowModelSelect={setShowModelSelect}
            manualModelInput={manualModelInput}
            setManualModelInput={setManualModelInput}
            manualModelError={manualModelError}
            setManualModelError={setManualModelError}
            handleAddManualModel={handleAddManualModel}
            manualModelHasDuplicate={manualModelHasDuplicate}
            builderProviderId={builderProviderId}
            handleBuilderProviderChange={handleBuilderProviderChange}
            builderLoading={builderLoading}
            builderProviders={builderProviders}
            selectedBuilderProvider={selectedBuilderProvider}
            builderModelId={builderModelId}
            handleBuilderModelChange={handleBuilderModelChange}
            selectedBuilderModel={selectedBuilderModel}
            builderConnectionId={builderConnectionId}
            handleBuilderConnectionChange={handleBuilderConnectionChange}
            selectedBuilderConnections={selectedBuilderConnections}
            emailsVisible={emailsVisible}
            builderAllowedConnectionIds={builderAllowedConnectionIds}
            handleBuilderAllowedConnectionToggle={handleBuilderAllowedConnectionToggle}
            builderCandidateStep={builderCandidateStep}
            builderHasDuplicate={builderHasDuplicate}
            handleAddBuilderStep={handleAddBuilderStep}
            builderComboRefName={builderComboRefName}
            setBuilderComboRefName={setBuilderComboRefName}
            builderComboRefs={builderComboRefs}
            handleAddComboReference={handleAddComboReference}
            builderError={builderError}
            dragIndex={dragIndex}
            dragOverIndex={dragOverIndex}
            handleDragStart={handleDragStart}
            handleDragEnd={handleDragEnd}
            handleDragOver={handleDragOver}
            handleDrop={handleDrop}
            handleWeightChange={handleWeightChange}
            handleMoveUp={handleMoveUp}
            handleMoveDown={handleMoveDown}
            handleRemoveModel={handleRemoveModel}
            hasPricingForModel={hasPricingForModel}
            weightTotal={weightTotal}
            pricedModelCount={pricedModelCount}
            pricingCoveragePercent={pricingCoveragePercent}
            hasNoModels={hasNoModels}
            hasInvalidWeightedTotal={hasInvalidWeightedTotal}
            hasRoundRobinSingleModel={hasRoundRobinSingleModel}
            hasCostOptimizedPartialPricing={hasCostOptimizedPartialPricing}
            hasCostOptimizedWithoutPricing={hasCostOptimizedWithoutPricing}
            showInlineReadinessPanel={showInlineReadinessPanel}
            readinessChecks={readinessChecks}
            saveBlockers={saveBlockers}
          />

          <ComboFormAdvancedConfig
            showStrategySection={showStrategySection}
            isExpertMode={isExpertMode}
            t={t}
            showAdvanced={showAdvanced}
            setShowAdvanced={setShowAdvanced}
            advancedConfigVisible={advancedConfigVisible}
            config={config}
            setConfig={setConfig}
            strategy={strategy}
          />

          <ComboFormAgentFeatures
            showStrategySection={showStrategySection}
            isExpertMode={isExpertMode}
            t={t}
            agentSystemMessage={agentSystemMessage}
            setAgentSystemMessage={setAgentSystemMessage}
            agentToolFilter={agentToolFilter}
            setAgentToolFilter={setAgentToolFilter}
            agentContextCache={agentContextCache}
            setAgentContextCache={setAgentContextCache}
            contextLength={contextLength}
            setContextLength={setContextLength}
            contextLengthError={contextLengthError}
            setContextLengthError={setContextLengthError}
          />

          <ComboFormReviewSection
            showReviewSection={showReviewSection}
            t={t}
            name={name}
            strategy={strategy}
            models={models}
            pinnedAccountCount={pinnedAccountCount}
            uniqueProviderCount={uniqueProviderCount}
            comboRefCount={comboRefCount}
            config={config}
            agentSystemMessage={agentSystemMessage}
            agentToolFilter={agentToolFilter}
            agentContextCache={agentContextCache}
            usesIntelligentBuilderStage={usesIntelligentBuilderStage}
            intelligentConfig={intelligentConfig}
            readinessChecks={readinessChecks}
            saveBlockers={saveBlockers}
          />

          {/* Actions */}
          {isExpertMode ? (
            <div className="flex gap-2 pt-1">
              <Button onClick={onClose} variant="ghost" fullWidth size="sm">
                {tc("cancel")}
              </Button>
              <Button onClick={handleSave} fullWidth size="sm" disabled={saveBlocked}>
                {saving ? t("saving") : isEdit ? tc("save") : t("createCombo")}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 pt-1">
              <Button
                onClick={builderStage === "basics" ? onClose : handleGoToPreviousStage}
                variant="ghost"
                fullWidth
                size="sm"
                data-testid="combo-builder-back"
              >
                {builderStage === "basics" ? tc("cancel") : getI18nOrFallback(tc, "back", "Back")}
              </Button>
              {builderStage === "review" ? (
                <Button onClick={handleSave} fullWidth size="sm" disabled={saveBlocked}>
                  {saving ? t("saving") : isEdit ? tc("save") : t("createCombo")}
                </Button>
              ) : (
                <Button
                  onClick={handleGoToNextStage}
                  fullWidth
                  size="sm"
                  disabled={!canAdvanceFromCurrentStage}
                  data-testid="combo-builder-next"
                >
                  {getI18nOrFallback(tc, "next", "Next")}
                </Button>
              )}
            </div>
          )}

          {(isExpertMode || builderStage !== "review") && !canAdvanceFromCurrentStage && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-300">
              {builderStage === "basics"
                ? getI18nOrFallback(
                    t,
                    "builderNeedValidName",
                    "Define a valid combo name before continuing."
                  )
                : getI18nOrFallback(
                    t,
                    "addStepBeforeContinue",
                    "Add at least one step before continuing to the next stage."
                  )}
            </div>
          )}
        </div>
      </Modal>

      {/* Model Select Modal */}
      <ModelSelectModal
        isOpen={showModelSelect}
        onClose={() => setShowModelSelect(false)}
        onSelect={handleAddModel}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title={t("addModelToCombo")}
        selectedModel={null}
        addedModelValues={models.map((m) => m.model)}
      />
    </>
  );
}
