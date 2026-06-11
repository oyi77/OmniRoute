import { z } from "zod";
import {
  ACCOUNT_FALLBACK_STRATEGY_VALUES,
  ROUTING_STRATEGY_VALUES,
} from "@/shared/constants/routingStrategies";
import {
  isForbiddenUpstreamHeaderName,
  isForbiddenCustomHeaderName,
} from "@/shared/constants/upstreamHeaders";

export const payloadRuleModelSpecSchema = z
  .object({
    name: z.string().trim().min(1),
    protocol: z.string().trim().min(1).optional(),
  })
  .strict();

export const payloadMutationRuleSchema = z
  .object({
    models: z.array(payloadRuleModelSpecSchema).min(1),
    params: z
      .record(z.string().trim().min(1), z.unknown())
      .refine((value) => Object.keys(value).length > 0, "params must contain at least one path"),
  })
  .strict();

export const payloadFilterRuleSchema = z
  .object({
    models: z.array(payloadRuleModelSpecSchema).min(1),
    params: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export const updatePayloadRulesSchema = z
  .object({
    default: z.array(payloadMutationRuleSchema).optional(),
    override: z.array(payloadMutationRuleSchema).optional(),
    filter: z.array(payloadFilterRuleSchema).optional(),
    defaultRaw: z.array(payloadMutationRuleSchema).optional(),
    "default-raw": z.array(payloadMutationRuleSchema).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.default === undefined &&
      value.override === undefined &&
      value.filter === undefined &&
      value.defaultRaw === undefined &&
      value["default-raw"] === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "No valid fields to update",
        path: [],
      });
    }
  });