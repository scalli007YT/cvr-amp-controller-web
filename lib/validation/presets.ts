import { z } from "zod";
import {
  PRESET_NAME_MAX_LENGTH,
  PRESET_NAME_MIN_LENGTH,
  PRESET_SLOT_MAX,
  PRESET_SLOT_MIN,
} from "@/lib/constants";

export const presetNameSchema = z
  .string()
  .trim()
  .min(PRESET_NAME_MIN_LENGTH, "Preset name cannot be empty")
  .max(
    PRESET_NAME_MAX_LENGTH,
    `Preset name must be ${PRESET_NAME_MAX_LENGTH} characters or fewer`,
  );

export const presetStoreRequestSchema = z.object({
  ip: z.string().min(1, "Missing ip"),
  mac: z.string().min(1, "Missing mac"),
  slot: z
    .number()
    .int("slot must be an integer")
    .min(
      PRESET_SLOT_MIN,
      `slot must be between ${PRESET_SLOT_MIN} and ${PRESET_SLOT_MAX}`,
    )
    .max(
      PRESET_SLOT_MAX,
      `slot must be between ${PRESET_SLOT_MIN} and ${PRESET_SLOT_MAX}`,
    ),
  name: presetNameSchema,
});

export type PresetStoreRequest = z.infer<typeof presetStoreRequestSchema>;
