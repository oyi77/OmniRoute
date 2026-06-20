"use client";

import {
  Card,
  DataTable,
  Select,
} from "@/shared/components";
import { HISTORY_COLUMNS, NO_COMPARE_TARGET, AUTO_API_KEY, STRATEGIES } from "./constants";
import { getTargetLabel, formatTimestamp } from "./result-helpers";
import type {
  EvalApiKeyOption,
  EvalRun,
  EvalRunSummary,
  EvalScorecard,
  EvalSuite,
  EvalTargetOption,
  TranslateFn,
} from "./types";

export interface ControlsSectionProps {
  suites: EvalSuite[];
  totalCases: number;
  uniqueModels: string[];
  selectedTargetKey: string;
  setSelectedTargetKey: (key: string) => void;
  targetOptions: EvalTargetOption[];
  compareTargetKey: string;
  setCompareTargetKey: (key: string) => void;
  compareOptions: EvalTargetOption[];
  selectedApiKeyId: string;
  setSelectedApiKeyId: (id: string) => void;
  apiKeys: EvalApiKeyOption[];
  scorecard: EvalScorecard | null;
  showHowItWorks: boolean;
  setShowHowItWorks: React.Dispatch<React.SetStateAction<boolean>>;
  recentRuns: EvalRun[];
  t: TranslateFn;
}

export function ControlsSection({
  suites,
  totalCases,
  uniqueModels,
  selectedTargetKey,
  setSelectedTargetKey,
  targetOptions,
  compareTargetKey,
  setCompareTargetKey,
  compareOptions,
  selectedApiKeyId,
  setSelectedApiKeyId,
  apiKeys,
  scorecard,
  showHowItWorks,
  setShowHowItWorks,
  recentRuns,
  t,
}: ControlsSectionProps) {
  return (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="px-4 py-3 text-center">
          <span className="text-xs text-text-muted uppercase font-semibold tracking-wide">
            {t("statsSuites")}
          </span>
          <div className="text-2xl font-bold mt-1 text-violet-400">{suites.length}</div>
        </Card>
        <Card className="px-4 py-3 text-center">
          <span className="text-xs text-text-muted uppercase font-semibold tracking-wide">
            {t("statsTestCases")}
          </span>
          <div className="text-2xl font-bold mt-1 text-sky-400">{totalCases}</div>
        </Card>
        <Card className="px-4 py-3 text-center">
          <span className="text-xs text-text-muted uppercase font-semibold tracking-wide">
            {t("statsModels")}
          </span>
          <div className="text-2xl font-bold mt-1 text-emerald-400">{uniqueModels.length}</div>
        </Card>
        <Card className="px-4 py-3 text-center">
          <span className="text-xs text-text-muted uppercase font-semibold tracking-wide">
            {t("statsCoverage")}
          </span>
          <div className="text-2xl font-bold mt-1 text-amber-400">
            {t("statsStrategiesCount", { count: STRATEGIES.length })}
          </div>
        </Card>
      </div>

      {/* Controls */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-[20px]">route</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold">{t("evalControlsTitle")}</h3>
            <p className="text-xs text-text-muted">{t("evalControlsHint")}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Select
            label={t("evalTarget")}
            value={selectedTargetKey}
            onChange={(event) => setSelectedTargetKey(event.target.value)}
            options={targetOptions.map((option) => ({
              value: option.key,
              label: getTargetLabel(option, t),
            }))}
            hint={t("evalTargetHint")}
          />
          <Select
            label={t("evalCompareTarget")}
            value={compareTargetKey || NO_COMPARE_TARGET}
            onChange={(event) =>
              setCompareTargetKey(
                event.target.value === NO_COMPARE_TARGET ? "" : event.target.value
              )
            }
            options={[
              {
                value: NO_COMPARE_TARGET,
                label: t("evalCompareOptional"),
              },
              ...compareOptions.map((option) => ({
                value: option.key,
                label: getTargetLabel(option, t),
              })),
            ]}
            hint={t("evalCompareHint")}
          />
          <Select
            label={t("evalApiKey")}
            value={selectedApiKeyId || AUTO_API_KEY}
            onChange={(event) =>
              setSelectedApiKeyId(event.target.value === AUTO_API_KEY ? "" : event.target.value)
            }
            options={[
              {
                value: AUTO_API_KEY,
                label: t("evalApiKeyAuto"),
              },
              ...apiKeys
                .filter((key) => key.isActive !== false)
                .map((key) => ({
                  value: key.id,
                  label: key.name,
                })),
            ]}
            hint={t("evalApiKeyHint")}
          />
        </div>
      </Card>

      {/* Scorecard */}
      {scorecard && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <span className="material-symbols-outlined text-[20px]">analytics</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold">{t("scorecardTitle")}</h3>
              <p className="text-xs text-text-muted">{t("scorecardHint")}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">
                {t("scorecardSuites")}
              </p>
              <p className="text-2xl font-bold text-violet-400 mt-1">{scorecard.suites}</p>
            </Card>
            <Card className="px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">
                {t("scorecardCases")}
              </p>
              <p className="text-2xl font-bold text-sky-400 mt-1">{scorecard.totalCases}</p>
            </Card>
            <Card className="px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">
                {t("scorecardPassed")}
              </p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{scorecard.totalPassed}</p>
            </Card>
            <Card className="px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">
                {t("scorecardPassRate")}
              </p>
              <p className="text-2xl font-bold text-amber-400 mt-1">{scorecard.overallPassRate}%</p>
            </Card>
          </div>

          {scorecard.perSuite.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
              {scorecard.perSuite.slice(0, 6).map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-border/20 bg-surface/20 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-text-main truncate">
                      {entry.name}
                    </span>
                    <span className="text-xs font-semibold text-primary">{entry.passRate}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* How It Works */}
      <Card className="p-0 overflow-hidden">
        <button
          onClick={() => setShowHowItWorks((prev) => !prev)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-surface/30 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[20px]">help</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-main">{t("howItWorks")}</h3>
              <p className="text-xs text-text-muted">{t("howItWorksSubtitle")}</p>
            </div>
          </div>
          <span
            className={`material-symbols-outlined text-text-muted transition-transform duration-200 ${
              showHowItWorks ? "rotate-180" : ""
            }`}
          >
            expand_more
          </span>
        </button>

        {showHowItWorks && (
          <div className="px-6 pb-6 border-t border-border/10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="flex flex-col items-center text-center p-4 rounded-lg bg-violet-500/5 border border-violet-500/10">
                <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center mb-3">
                  <span className="text-lg font-bold text-violet-400">1</span>
                </div>
                <h4 className="text-sm font-semibold text-text-main mb-1">{t("define")}</h4>
                <p className="text-xs text-text-muted">{t("defineStepDescription")}</p>
              </div>
              <div className="flex flex-col items-center text-center p-4 rounded-lg bg-sky-500/5 border border-sky-500/10">
                <div className="w-10 h-10 rounded-full bg-sky-500/20 flex items-center justify-center mb-3">
                  <span className="text-lg font-bold text-sky-400">2</span>
                </div>
                <h4 className="text-sm font-semibold text-text-main mb-1">{t("run")}</h4>
                <p className="text-xs text-text-muted">{t("runStepDescription")}</p>
              </div>
              <div className="flex flex-col items-center text-center p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3">
                  <span className="text-lg font-bold text-emerald-400">3</span>
                </div>
                <h4 className="text-sm font-semibold text-text-main mb-1">{t("evaluate")}</h4>
                <p className="text-xs text-text-muted">{t("evaluateStepDescription")}</p>
              </div>
            </div>

            <div className="mt-6">
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
                {t("evaluationStrategies")}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {STRATEGIES.map((strategy) => (
                  <div
                    key={strategy.name}
                    className={`flex items-center gap-3 p-3 rounded-lg ${strategy.bg}`}
                  >
                    <span className={`material-symbols-outlined text-[18px] ${strategy.color}`}>
                      {strategy.icon}
                    </span>
                    <div>
                      <span className={`text-xs font-mono font-semibold ${strategy.color}`}>
                        {t(strategy.labelKey)}
                      </span>
                      <p className="text-xs text-text-muted mt-0.5">{t(strategy.descriptionKey)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Recent Runs History */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
            <span className="material-symbols-outlined text-[20px]">history</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold">{t("recentRunsTitle")}</h3>
            <p className="text-xs text-text-muted">{t("recentRunsHint")}</p>
          </div>
        </div>

        <DataTable
          columns={HISTORY_COLUMNS.map((column) => ({
            key: column.key,
            label: t(column.labelKey),
          }))}
          data={recentRuns.map((run) => ({
            ...run,
            id: run.id,
          }))}
          renderCell={(row, column) => {
            if (column.key === "target") {
              return (
                <span className="text-xs font-medium text-primary">
                  {getTargetLabel(row.target as EvalRun["target"], t)}
                </span>
              );
            }

            if (column.key === "passRate") {
              return (
                <span className="text-xs font-semibold text-emerald-400">
                  {Number((row.summary as EvalRunSummary)?.passRate || 0)}%
                </span>
              );
            }

            if (column.key === "avgLatencyMs") {
              return (
                <span className="text-xs font-mono text-text-muted">
                  {Number(row.avgLatencyMs || 0)}ms
                </span>
              );
            }

            if (column.key === "createdAt") {
              return (
                <span className="text-xs text-text-muted">
                  {formatTimestamp(String(row.createdAt || ""))}
                </span>
              );
            }

            return <span className="text-sm text-text-main">{String(row[column.key] || "—")}</span>;
          }}
          maxHeight="320px"
          emptyMessage={t("historyEmpty")}
        />
      </Card>
    </>
  );
}
