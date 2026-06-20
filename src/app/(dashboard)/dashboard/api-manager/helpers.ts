"use client";

import { useState, useEffect } from "react";
import { MAX_KEY_NAME_LENGTH } from "./constants";

// Debounce hook for search optimization
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Sanitize user input to prevent XSS
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .replace(/"/g, "")
    .replace(/'/g, "")
    .trim()
    .slice(0, MAX_KEY_NAME_LENGTH);
}

// Validate key name
export function validateKeyName(
  name: string,
  t: (key: string, values?: Record<string, unknown>) => string
): { valid: boolean; error?: string } {
  if (!name || !name.trim()) {
    return { valid: false, error: t("keyNameRequired") };
  }
  if (name.length > MAX_KEY_NAME_LENGTH) {
    return { valid: false, error: t("keyNameTooLong", { max: MAX_KEY_NAME_LENGTH }) };
  }
  // Allow Unicode letters (accented chars), numbers, spaces, hyphens, underscores
  if (!/^[\p{L}\p{N}_\-\s]+$/u.test(name)) {
    return {
      valid: false,
      error: t("keyNameInvalid"),
    };
  }
  return { valid: true };
}

export interface AccessSchedule {
  enabled: boolean;
  from: string;
  until: string;
  days: number[];
  tz: string;
}

export type StreamDefaultMode = "legacy" | "json";

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  allowedModels: string[] | null;
  blockedModels?: string[] | null;
  allowedCombos: string[] | null;
  allowedConnections: string[] | null;
  noLog?: boolean;
  autoResolve?: boolean;
  isActive?: boolean;
  throttleDelayMs?: number | null;
  isBanned?: boolean;
  expiresAt?: string | null;
  maxSessions?: number;
  accessSchedule?: AccessSchedule | null;
  rateLimits?: Array<{ limit: number; window: number }> | null;
  scopes?: string[];
  allowedEndpoints?: string[];
  streamDefaultMode?: StreamDefaultMode;
  disableNonPublicModels?: boolean;
  allowUsageCommand?: boolean;
  usageLimitEnabled?: boolean;
  dailyUsageLimitUsd?: number | null;
  weeklyUsageLimitUsd?: number | null;
  allowedQuotas?: string[] | null;
  createdAt: string;
}

export interface ProviderConnection {
  id: string;
  name: string;
  provider: string;
  isActive: boolean;
}

export interface KeyUsageStats {
  totalRequests: number;
  totalCost: number;
  lastUsed: string | null;
}

export interface Model {
  id: string;
  owned_by: string;
  name?: string;
}

export interface ComboOption {
  id?: string;
  name: string;
  models?: unknown[];
}

/** Tuple type for models grouped by provider: [providerName, models[]] */
export type ProviderGroup = [provider: string, models: Model[]];
