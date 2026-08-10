import { combineRgb } from '@companion-module/base'

/** Shared Companion button colors for this module's presets/feedbacks. */
export const COLOR = {
	white: combineRgb(255, 255, 255),
	ink: combineRgb(18, 15, 29), // #120F1D
	surface: combineRgb(48, 42, 70), // #302A46
	amber: combineRgb(255, 197, 66), // #FFC542
} as const
