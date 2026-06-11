import { z } from "zod";
import {
  ACCOUNT_FALLBACK_STRATEGY_VALUES,
  ROUTING_STRATEGY_VALUES,
} from "@/shared/constants/routingStrategies";
import {
  isForbiddenUpstreamHeaderName,
  isForbiddenCustomHeaderName,
} from "@/shared/constants/upstreamHeaders";

import { nonEmptyJsonRecordSchema } from "./misc.ts";

export const translatorDetectSchema = z.object({
  body: nonEmptyJsonRecordSchema,
});

export const translatorSendSchema = z.object({
  provider: z.string().trim().min(1, "Provider is required"),
  body: nonEmptyJsonRecordSchema,
});

export const translatorTranslateSchema = z
  .object({
    step: z.union([z.number().int().min(1).max(4), z.literal("direct")]),
    provider: z.string().trim().min(1).optional(),
    body: nonEmptyJsonRecordSchema,
    sourceFormat: z.string().optional(),
    targetFormat: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.step !== "direct" && !value.provider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Step and provider are required",
        path: ["provider"],
      });
    }
  });