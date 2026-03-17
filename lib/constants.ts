// Matrix crosspoint gain limits (dB)
export const MATRIX_GAIN_MIN_DB = -80.0;
export const MATRIX_GAIN_MAX_DB = 18.0;

// Output trim limits (dB)
export const OUTPUT_TRIM_MIN_DB = -18.0;
export const OUTPUT_TRIM_MAX_DB = 18.0;

// Output volume limits (dB)
export const OUTPUT_VOLUME_MIN_DB = -80.0;
export const OUTPUT_VOLUME_MAX_DB = 18.0;

// Delay limits (ms)
export const DELAY_MIN_MS = 0;
export const DELAY_IN_MAX_MS = 100;
export const DELAY_OUT_MAX_MS = 20;

// HP/LP crossover frequency limits (Hz)
export const CROSSOVER_FREQ_MIN_HZ = 20;
export const CROSSOVER_FREQ_MAX_HZ = 20000;

// Parametric EQ band limits
export const EQ_BAND_GAIN_MIN_DB = -18.0;
export const EQ_BAND_GAIN_MAX_DB = 18.0;
export const EQ_BAND_Q_MIN = 0.1;
export const EQ_BAND_Q_MAX = 32.0;

// RMS limiter bounds
export const RMS_LIMITER_THRESHOLD_MIN_VRMS = 1.0;
export const RMS_LIMITER_ATTACK_MAX_MS = 2000;
export const RMS_LIMITER_RELEASE_MAX_MULTIPLIER = 32;

// Peak limiter bounds
export const PEAK_LIMITER_THRESHOLD_MIN_VP = 1.4;
export const PEAK_LIMITER_HOLD_MAX_MS = 2000;
export const PEAK_LIMITER_RELEASE_MAX_MS = 1000;

// Preset validation limits
export const PRESET_NAME_MIN_LENGTH = 1;
export const PRESET_NAME_MAX_LENGTH = 32;
export const PRESET_SLOT_MIN = 1;
export const PRESET_SLOT_MAX = 40;
