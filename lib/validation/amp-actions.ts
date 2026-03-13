import { z } from "zod";
import {
  MATRIX_GAIN_MAX_DB,
  MATRIX_GAIN_MIN_DB,
  DELAY_MIN_MS,
  DELAY_IN_MAX_MS,
  DELAY_OUT_MAX_MS,
  CROSSOVER_FREQ_MIN_HZ,
  CROSSOVER_FREQ_MAX_HZ,
  EQ_BAND_GAIN_MIN_DB,
  EQ_BAND_GAIN_MAX_DB,
  EQ_BAND_Q_MIN,
  EQ_BAND_Q_MAX,
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

const crossoverTargetSchema = z.enum(["input", "output"]);
const crossoverKindSchema = z.enum(["hp", "lp"]);
const crossoverFilterTypeSchema = z
  .number()
  .int("filterType must be an integer")
  .min(0, "filterType must be between 0 and 10")
  .max(10, "filterType must be between 0 and 10");

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

const powerModeOutSchema = baseSchema.extend({
  action: z.literal("powerModeOut"),
  value: z
    .number()
    .int("powerModeOut must be an integer")
    .min(0, "powerModeOut must be between 0 and 2")
    .max(2, "powerModeOut must be between 0 and 2"),
});

const crossoverEnabledSchema = baseSchema.extend({
  action: z.literal("crossoverEnabled"),
  value: z.boolean(),
  target: crossoverTargetSchema,
  kind: crossoverKindSchema,
  filterType: crossoverFilterTypeSchema,
});

const crossoverFreqSchema = baseSchema.extend({
  action: z.literal("crossoverFreq"),
  value: z
    .number()
    .min(
      CROSSOVER_FREQ_MIN_HZ,
      `crossoverFreq must be >= ${CROSSOVER_FREQ_MIN_HZ} Hz`,
    )
    .max(
      CROSSOVER_FREQ_MAX_HZ,
      `crossoverFreq must be <= ${CROSSOVER_FREQ_MAX_HZ} Hz`,
    ),
  target: crossoverTargetSchema,
  kind: crossoverKindSchema,
});

const eqTargetSchema = z.enum(["input", "output"]);
const eqBandIndexSchema = z
  .number()
  .int("band must be an integer")
  .min(1, "band must be between 1 and 8")
  .max(8, "band must be between 1 and 8");

const eqBandTypeSchema = baseSchema.extend({
  action: z.literal("eqBandType"),
  /** 0..10 = full parametric EQ type list from the original controller UI */
  value: z.number().int().min(0).max(10),
  target: eqTargetSchema,
  band: eqBandIndexSchema,
  bypass: z.boolean(),
});

const eqBandFreqSchema = baseSchema.extend({
  action: z.literal("eqBandFreq"),
  value: z
    .number()
    .min(
      CROSSOVER_FREQ_MIN_HZ,
      `eqBandFreq must be >= ${CROSSOVER_FREQ_MIN_HZ} Hz`,
    )
    .max(
      CROSSOVER_FREQ_MAX_HZ,
      `eqBandFreq must be <= ${CROSSOVER_FREQ_MAX_HZ} Hz`,
    ),
  target: eqTargetSchema,
  band: eqBandIndexSchema,
});

const eqBandGainSchema = baseSchema.extend({
  action: z.literal("eqBandGain"),
  value: z
    .number()
    .min(EQ_BAND_GAIN_MIN_DB, `eqBandGain must be >= ${EQ_BAND_GAIN_MIN_DB} dB`)
    .max(
      EQ_BAND_GAIN_MAX_DB,
      `eqBandGain must be <= +${EQ_BAND_GAIN_MAX_DB} dB`,
    ),
  target: eqTargetSchema,
  band: eqBandIndexSchema,
});

const eqBandQSchema = baseSchema.extend({
  action: z.literal("eqBandQ"),
  value: z
    .number()
    .min(EQ_BAND_Q_MIN, `eqBandQ must be >= ${EQ_BAND_Q_MIN}`)
    .max(EQ_BAND_Q_MAX, `eqBandQ must be <= ${EQ_BAND_Q_MAX}`),
  target: eqTargetSchema,
  band: eqBandIndexSchema,
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
  powerModeOutSchema,
  crossoverEnabledSchema,
  crossoverFreqSchema,
  eqBandTypeSchema,
  eqBandFreqSchema,
  eqBandGainSchema,
  eqBandQSchema,
]);

export type AmpActionRequest = z.infer<typeof ampActionRequestSchema>;
