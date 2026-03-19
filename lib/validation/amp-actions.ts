import { z } from "zod";
import {
  AMP_NAME_MAX_LENGTH,
  AMP_NAME_MIN_LENGTH,
  MATRIX_GAIN_MAX_DB,
  MATRIX_GAIN_MIN_DB,
  OUTPUT_VOLUME_MIN_DB,
  OUTPUT_VOLUME_MAX_DB,
  OUTPUT_TRIM_MIN_DB,
  OUTPUT_TRIM_MAX_DB,
  DELAY_MIN_MS,
  DELAY_IN_MAX_MS,
  DELAY_OUT_MAX_MS,
  CROSSOVER_FREQ_MIN_HZ,
  CROSSOVER_FREQ_MAX_HZ,
  EQ_BAND_GAIN_MIN_DB,
  EQ_BAND_GAIN_MAX_DB,
  EQ_BAND_Q_MIN,
  EQ_BAND_Q_MAX,
  RMS_LIMITER_THRESHOLD_MIN_VRMS,
  RMS_LIMITER_ATTACK_MAX_MS,
  RMS_LIMITER_RELEASE_MAX_MULTIPLIER,
  PEAK_LIMITER_THRESHOLD_MIN_VP,
  PEAK_LIMITER_HOLD_MAX_MS,
  PEAK_LIMITER_RELEASE_MAX_MS
} from "@/lib/constants";

export const SOURCE_DELAY_MIN_MS = 0;
export const SOURCE_DELAY_MAX_MS = 10;
export const SOURCE_TRIM_MIN_DB = 0;
export const SOURCE_TRIM_MAX_DB = 18;

const channelSchema = z.number().int("channel/source must be an integer").min(0, "channel/source must be >= 0");

const baseSchema = z.object({
  mac: z.string().trim().min(1, "Missing mac"),
  channel: channelSchema
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
  value: z.boolean()
});

const volumeOutSchema = baseSchema.extend({
  action: z.literal("volumeOut"),
  value: z
    .number()
    .min(OUTPUT_VOLUME_MIN_DB, `volumeOut must be >= ${OUTPUT_VOLUME_MIN_DB} dB`)
    .max(OUTPUT_VOLUME_MAX_DB, `volumeOut must be <= +${OUTPUT_VOLUME_MAX_DB} dB`)
});

const legacyVolumeInSchema = baseSchema.extend({
  action: z.literal("volumeIn"),
  value: z
    .number()
    .min(OUTPUT_VOLUME_MIN_DB, `volumeOut must be >= ${OUTPUT_VOLUME_MIN_DB} dB`)
    .max(OUTPUT_VOLUME_MAX_DB, `volumeOut must be <= +${OUTPUT_VOLUME_MAX_DB} dB`)
});

const muteOutSchema = baseSchema.extend({
  action: z.literal("muteOut"),
  value: z.boolean()
});

const invertPolarityOutSchema = baseSchema.extend({
  action: z.literal("invertPolarityOut"),
  value: z.boolean()
});

const noiseGateOutSchema = baseSchema.extend({
  action: z.literal("noiseGateOut"),
  value: z.boolean()
});

const rmsLimiterOutSchema = baseSchema.extend({
  action: z.literal("rmsLimiterOut"),
  value: z.boolean(),
  attackMs: z
    .number()
    .int("attackMs must be an integer")
    .min(0)
    .max(RMS_LIMITER_ATTACK_MAX_MS, `attackMs must be <= ${RMS_LIMITER_ATTACK_MAX_MS} ms`)
    .optional(),
  releaseMultiplier: z
    .number()
    .int("releaseMultiplier must be an integer")
    .min(0)
    .max(RMS_LIMITER_RELEASE_MAX_MULTIPLIER, `releaseMultiplier must be <= ${RMS_LIMITER_RELEASE_MAX_MULTIPLIER}×Atk`)
    .optional(),
  thresholdVrms: z
    .number()
    .min(RMS_LIMITER_THRESHOLD_MIN_VRMS, `thresholdVrms must be >= ${RMS_LIMITER_THRESHOLD_MIN_VRMS} Vrms`)
    .optional()
});

const peakLimiterOutSchema = baseSchema.extend({
  action: z.literal("peakLimiterOut"),
  value: z.boolean(),
  holdMs: z
    .number()
    .int("holdMs must be an integer")
    .min(0)
    .max(PEAK_LIMITER_HOLD_MAX_MS, `holdMs must be <= ${PEAK_LIMITER_HOLD_MAX_MS} ms`)
    .optional(),
  releaseMs: z
    .number()
    .int("releaseMs must be an integer")
    .min(0)
    .max(PEAK_LIMITER_RELEASE_MAX_MS, `releaseMs must be <= ${PEAK_LIMITER_RELEASE_MAX_MS} ms`)
    .optional(),
  thresholdVp: z
    .number()
    .min(PEAK_LIMITER_THRESHOLD_MIN_VP, `thresholdVp must be >= ${PEAK_LIMITER_THRESHOLD_MIN_VP} Vpeak`)
    .optional()
});

const matrixGainSchema = baseSchema.extend({
  action: z.literal("matrixGain"),
  value: z
    .number()
    .min(MATRIX_GAIN_MIN_DB, `matrixGain must be >= ${MATRIX_GAIN_MIN_DB} dB`)
    .max(MATRIX_GAIN_MAX_DB, `matrixGain must be <= +${MATRIX_GAIN_MAX_DB} dB`),
  source: channelSchema
});

const matrixActiveSchema = baseSchema.extend({
  action: z.literal("matrixActive"),
  value: z.boolean(),
  source: channelSchema
});

const sourceTypeSchema = baseSchema.extend({
  action: z.literal("sourceType"),
  value: z
    .number()
    .int("sourceType must be an integer")
    .min(0, "sourceType must be between 0 and 2")
    .max(2, "sourceType must be between 0 and 2")
});

const sourceDelaySchema = baseSchema.extend({
  action: z.literal("sourceDelay"),
  value: z
    .number()
    .min(SOURCE_DELAY_MIN_MS, `sourceDelay must be >= ${SOURCE_DELAY_MIN_MS} ms`)
    .max(SOURCE_DELAY_MAX_MS, `sourceDelay must be <= ${SOURCE_DELAY_MAX_MS} ms`),
  source: z
    .number()
    .int("source must be an integer")
    .min(0, "source must be between 0 and 2")
    .max(2, "source must be between 0 and 2"),
  trim: z
    .number()
    .min(SOURCE_TRIM_MIN_DB, `sourceTrim must be >= ${SOURCE_TRIM_MIN_DB} dB`)
    .max(SOURCE_TRIM_MAX_DB, `sourceTrim must be <= ${SOURCE_TRIM_MAX_DB} dB`)
});

const sourceTrimSchema = baseSchema.extend({
  action: z.literal("sourceTrim"),
  value: z
    .number()
    .min(SOURCE_TRIM_MIN_DB, `sourceTrim must be >= ${SOURCE_TRIM_MIN_DB} dB`)
    .max(SOURCE_TRIM_MAX_DB, `sourceTrim must be <= ${SOURCE_TRIM_MAX_DB} dB`),
  source: z
    .number()
    .int("source must be an integer")
    .min(0, "source must be between 0 and 2")
    .max(2, "source must be between 0 and 2"),
  delay: z
    .number()
    .min(SOURCE_DELAY_MIN_MS, `sourceDelay must be >= ${SOURCE_DELAY_MIN_MS} ms`)
    .max(SOURCE_DELAY_MAX_MS, `sourceDelay must be <= ${SOURCE_DELAY_MAX_MS} ms`)
});

const analogTypeSchema = baseSchema.extend({
  action: z.literal("analogType"),
  value: z
    .number()
    .int("analogType must be an integer")
    .min(0, "analogType must be between 0 and 15")
    .max(15, "analogType must be between 0 and 15")
});

const delayInSchema = baseSchema.extend({
  action: z.literal("delayIn"),
  value: z
    .number()
    .min(DELAY_MIN_MS, `delayIn must be >= ${DELAY_MIN_MS} ms`)
    .max(DELAY_IN_MAX_MS, `delayIn must be <= ${DELAY_IN_MAX_MS} ms`)
});

const delayOutSchema = baseSchema.extend({
  action: z.literal("delayOut"),
  value: z
    .number()
    .min(DELAY_MIN_MS, `delayOut must be >= ${DELAY_MIN_MS} ms`)
    .max(DELAY_OUT_MAX_MS, `delayOut must be <= ${DELAY_OUT_MAX_MS} ms`)
});

const outputTrimSchema = baseSchema.extend({
  action: z.literal("outputTrim"),
  value: z
    .number()
    .min(OUTPUT_TRIM_MIN_DB, `outputTrim must be >= ${OUTPUT_TRIM_MIN_DB} dB`)
    .max(OUTPUT_TRIM_MAX_DB, `outputTrim must be <= +${OUTPUT_TRIM_MAX_DB} dB`)
});

const powerModeOutSchema = baseSchema.extend({
  action: z.literal("powerModeOut"),
  value: z
    .number()
    .int("powerModeOut must be an integer")
    .min(0, "powerModeOut must be between 0 and 2")
    .max(2, "powerModeOut must be between 0 and 2")
});

const bridgePairSchema = z.object({
  mac: z.string().trim().min(1, "Missing mac"),
  action: z.literal("bridgePair"),
  channel: z.number().int("bridge pair must be an integer").min(0, "bridge pair must be >= 0"),
  value: z.boolean()
});

const crossoverEnabledSchema = baseSchema.extend({
  action: z.literal("crossoverEnabled"),
  value: z.boolean(),
  target: crossoverTargetSchema,
  kind: crossoverKindSchema,
  filterType: crossoverFilterTypeSchema
});

const crossoverFreqSchema = baseSchema.extend({
  action: z.literal("crossoverFreq"),
  value: z
    .number()
    .min(CROSSOVER_FREQ_MIN_HZ, `crossoverFreq must be >= ${CROSSOVER_FREQ_MIN_HZ} Hz`)
    .max(CROSSOVER_FREQ_MAX_HZ, `crossoverFreq must be <= ${CROSSOVER_FREQ_MAX_HZ} Hz`),
  target: crossoverTargetSchema,
  kind: crossoverKindSchema
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
  bypass: z.boolean()
});

const eqBandFreqSchema = baseSchema.extend({
  action: z.literal("eqBandFreq"),
  value: z
    .number()
    .min(CROSSOVER_FREQ_MIN_HZ, `eqBandFreq must be >= ${CROSSOVER_FREQ_MIN_HZ} Hz`)
    .max(CROSSOVER_FREQ_MAX_HZ, `eqBandFreq must be <= ${CROSSOVER_FREQ_MAX_HZ} Hz`),
  target: eqTargetSchema,
  band: eqBandIndexSchema
});

const eqBandGainSchema = baseSchema.extend({
  action: z.literal("eqBandGain"),
  value: z
    .number()
    .min(EQ_BAND_GAIN_MIN_DB, `eqBandGain must be >= ${EQ_BAND_GAIN_MIN_DB} dB`)
    .max(EQ_BAND_GAIN_MAX_DB, `eqBandGain must be <= +${EQ_BAND_GAIN_MAX_DB} dB`),
  target: eqTargetSchema,
  band: eqBandIndexSchema
});

const eqBandQSchema = baseSchema.extend({
  action: z.literal("eqBandQ"),
  value: z
    .number()
    .min(EQ_BAND_Q_MIN, `eqBandQ must be >= ${EQ_BAND_Q_MIN}`)
    .max(EQ_BAND_Q_MAX, `eqBandQ must be <= ${EQ_BAND_Q_MAX}`),
  target: eqTargetSchema,
  band: eqBandIndexSchema
});

const eqBlockBandSchema = z.object({
  type: z.number().int().min(0).max(10),
  gain: z.number(),
  freq: z
    .number()
    .min(CROSSOVER_FREQ_MIN_HZ, `eq band freq must be >= ${CROSSOVER_FREQ_MIN_HZ} Hz`)
    .max(CROSSOVER_FREQ_MAX_HZ, `eq band freq must be <= ${CROSSOVER_FREQ_MAX_HZ} Hz`),
  q: z
    .number()
    .min(EQ_BAND_Q_MIN, `eq band Q must be >= ${EQ_BAND_Q_MIN}`)
    .max(EQ_BAND_Q_MAX, `eq band Q must be <= ${EQ_BAND_Q_MAX}`),
  bypass: z.boolean()
});

const eqBlockSchema = baseSchema.extend({
  action: z.literal("eqBlock"),
  // Reserved placeholder to stay compatible with existing request helper shape.
  value: z.number().optional(),
  target: eqTargetSchema,
  bands: z.array(eqBlockBandSchema).length(10, "eqBlock must contain exactly 10 bands")
});

const renameAmpSchema = z.object({
  mac: z.string().trim().min(1, "Missing mac"),
  action: z.literal("renameAmp"),
  channel: z.literal(0),
  value: z
    .string()
    .trim()
    .min(AMP_NAME_MIN_LENGTH, "Amp name cannot be empty")
    .max(AMP_NAME_MAX_LENGTH, `Amp name must be ${AMP_NAME_MAX_LENGTH} characters or fewer`)
});

export const ampActionRequestSchema = z.union([
  muteInSchema,
  volumeOutSchema,
  legacyVolumeInSchema,
  muteOutSchema,
  invertPolarityOutSchema,
  noiseGateOutSchema,
  rmsLimiterOutSchema,
  peakLimiterOutSchema,
  matrixGainSchema,
  matrixActiveSchema,
  sourceTypeSchema,
  sourceDelaySchema,
  sourceTrimSchema,
  analogTypeSchema,
  delayInSchema,
  delayOutSchema,
  outputTrimSchema,
  powerModeOutSchema,
  bridgePairSchema,
  crossoverEnabledSchema,
  crossoverFreqSchema,
  eqBlockSchema,
  eqBandTypeSchema,
  eqBandFreqSchema,
  eqBandGainSchema,
  eqBandQSchema,
  renameAmpSchema
]);

export type AmpActionRequest = z.infer<typeof ampActionRequestSchema>;
