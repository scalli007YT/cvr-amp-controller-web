import { z } from "zod";
import {
  MATRIX_GAIN_MAX_DB,
  MATRIX_GAIN_MIN_DB,
  DELAY_MIN_MS,
  DELAY_IN_MAX_MS,
  DELAY_OUT_MAX_MS,
} from "@/lib/constants";

const channelSchema = z
  .number()
  .int("channel/source must be an integer")
  .min(0, "channel/source must be between 0 and 3")
  .max(3, "channel/source must be between 0 and 3");

const baseSchema = z.object({
  mac: z.string().trim().min(1, "Missing mac"),
  channel: channelSchema,
});

const muteInSchema = baseSchema.extend({
  action: z.literal("muteIn"),
  value: z.boolean(),
});

const muteOutSchema = baseSchema.extend({
  action: z.literal("muteOut"),
  value: z.boolean(),
});

const invertPolarityOutSchema = baseSchema.extend({
  action: z.literal("invertPolarityOut"),
  value: z.boolean(),
});

const noiseGateOutSchema = baseSchema.extend({
  action: z.literal("noiseGateOut"),
  value: z.boolean(),
});

const matrixGainSchema = baseSchema.extend({
  action: z.literal("matrixGain"),
  value: z
    .number()
    .min(MATRIX_GAIN_MIN_DB, `matrixGain must be >= ${MATRIX_GAIN_MIN_DB} dB`)
    .max(MATRIX_GAIN_MAX_DB, `matrixGain must be <= +${MATRIX_GAIN_MAX_DB} dB`),
  source: channelSchema,
});

const matrixActiveSchema = baseSchema.extend({
  action: z.literal("matrixActive"),
  value: z.boolean(),
  source: channelSchema,
});

const delayInSchema = baseSchema.extend({
  action: z.literal("delayIn"),
  value: z
    .number()
    .min(DELAY_MIN_MS, `delayIn must be >= ${DELAY_MIN_MS} ms`)
    .max(DELAY_IN_MAX_MS, `delayIn must be <= ${DELAY_IN_MAX_MS} ms`),
});

const delayOutSchema = baseSchema.extend({
  action: z.literal("delayOut"),
  value: z
    .number()
    .min(DELAY_MIN_MS, `delayOut must be >= ${DELAY_MIN_MS} ms`)
    .max(DELAY_OUT_MAX_MS, `delayOut must be <= ${DELAY_OUT_MAX_MS} ms`),
});

export const ampActionRequestSchema = z.union([
  muteInSchema,
  muteOutSchema,
  invertPolarityOutSchema,
  noiseGateOutSchema,
  matrixGainSchema,
  matrixActiveSchema,
  delayInSchema,
  delayOutSchema,
]);

export type AmpActionRequest = z.infer<typeof ampActionRequestSchema>;
