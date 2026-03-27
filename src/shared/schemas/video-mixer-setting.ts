import { z } from "zod";

export const videoMixerModeSchema = z.enum(["none", "vmix", "atem", "companion-osc"]);

const hostSchema = z.string().trim().max(255);
const portSchema = z.number().int().min(1).max(65535);
const atemMeSchema = z.number().int().min(0).max(255).nullable();
const companionOscPageSchema = z.number().int().min(1);
const companionOscPageWidthSchema = z.number().int().min(1);

export const videoMixerSettingsSchema = z.object({
  mode: videoMixerModeSchema,
  vmixHost: hostSchema,
  vmixPort: portSchema,
  atemHost: hostSchema,
  atemPort: portSchema,
  atemMe: atemMeSchema,
  companionOscHost: hostSchema,
  companionOscPort: portSchema,
  companionOscPage: companionOscPageSchema,
  companionOscPageWidth: companionOscPageWidthSchema,
});

export const videoMixerSettingsUpdateSchema = videoMixerSettingsSchema.superRefine((value, context) => {
  if (value.mode === "vmix" && value.vmixHost.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["vmixHost"],
      message: "vMix host is required when the vMix integration is active.",
    });
  }

  if (value.mode === "atem" && value.atemHost.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["atemHost"],
      message: "ATEM host is required when the ATEM integration is active.",
    });
  }

  if (value.mode === "companion-osc" && value.companionOscHost.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["companionOscHost"],
      message: "Companion OSC host is required when the Companion OSC integration is active.",
    });
  }
});

export const videoMixerPreviewTestSchema = z.undefined();


