"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ContextRequirements {
  minContextWindow?: number;
  preferLargeContext?: boolean;
  contextFilterMode?: "strict" | "lenient";
}

interface ContextRequirementsEditorProps {
  value?: ContextRequirements;
  onChange: (value: ContextRequirements) => void;
}

const CONTEXT_PRESETS = [
  { label: "Off", value: 0 },
  { label: "8K", value: 8192 },
  { label: "32K", value: 32000 },
  { label: "64K", value: 65536 },
  { label: "128K", value: 128000 },
  { label: "200K", value: 200000 },
  { label: "1M", value: 1000000 },
];

function formatContextSize(tokens: number): string {
  if (tokens === 0) return "Off";
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`;
  return tokens.toString();
}

export default function ContextRequirementsEditor({
  value = {},
  onChange,
}: ContextRequirementsEditorProps) {
  const minContextWindow = value.minContextWindow ?? 0;
  const preferLargeContext = value.preferLargeContext ?? false;
  const contextFilterMode = value.contextFilterMode ?? "lenient";

  const handleMinContextChange = (newValue: number[]) => {
    onChange({
      ...value,
      minContextWindow: newValue[0] === 0 ? undefined : newValue[0],
    });
  };

  const handlePreferLargeContextChange = (checked: boolean) => {
    onChange({
      ...value,
      preferLargeContext: checked || undefined,
    });
  };

  const handleFilterModeChange = (mode: "strict" | "lenient") => {
    onChange({
      ...value,
      contextFilterMode: mode,
    });
  };

  // Find closest preset for slider value
  const sliderValue = minContextWindow;
  const maxSlider = 1000000;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Context Window Requirements
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p>
                  Filter and sort combo targets by their context window size. Useful for long
                  documents, large codebases, or extensive conversations.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription>
          Configure minimum context requirements and sorting preferences for this combo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Minimum Context Window */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="minContextWindow" className="flex items-center gap-2">
              Minimum Context Window
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      Filters out models with context windows below this threshold. Set to 0 to
                      disable filtering.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <span className="text-sm font-medium">
              {formatContextSize(minContextWindow)} tokens
            </span>
          </div>
          <Slider
            id="minContextWindow"
            min={0}
            max={maxSlider}
            step={1000}
            value={[sliderValue]}
            onValueChange={handleMinContextChange}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            {CONTEXT_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => handleMinContextChange([preset.value])}
                className={`hover:text-foreground transition-colors ${
                  minContextWindow === preset.value ? "text-foreground font-medium" : ""
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prefer Large Context */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="preferLargeContext" className="flex items-center gap-2">
              Prefer Large Context Models
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      Sorts remaining targets by context window size (descending). Large context
                      models will be tried first.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <p className="text-xs text-muted-foreground">
              Sort targets by context size (largest first)
            </p>
          </div>
          <Switch
            id="preferLargeContext"
            checked={preferLargeContext}
            onCheckedChange={handlePreferLargeContextChange}
          />
        </div>

        {/* Context Filter Mode */}
        {minContextWindow > 0 && (
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              Unknown Context Handling
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>How to handle models with unknown context window limits:</p>
                    <ul className="mt-2 space-y-1 text-xs">
                      <li>
                        <strong>Strict:</strong> Excludes models with unknown limits
                      </li>
                      <li>
                        <strong>Lenient:</strong> Includes models with unknown limits
                      </li>
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <RadioGroup
              value={contextFilterMode}
              onValueChange={(value) => handleFilterModeChange(value as "strict" | "lenient")}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="strict" id="strict" />
                <Label htmlFor="strict" className="font-normal cursor-pointer">
                  Strict (exclude unknown)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="lenient" id="lenient" />
                <Label htmlFor="lenient" className="font-normal cursor-pointer">
                  Lenient (include unknown)
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* Status Message */}
        {minContextWindow > 0 && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium">Active Filters:</p>
            <ul className="mt-1 space-y-1 text-muted-foreground">
              <li>• Minimum context: {formatContextSize(minContextWindow)} tokens</li>
              {preferLargeContext && <li>• Sorted by context size (largest first)</li>}
              <li>• Unknown limits: {contextFilterMode === "strict" ? "excluded" : "included"}</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
