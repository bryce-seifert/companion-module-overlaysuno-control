import { combineRgb, type CompanionButtonStyleProps } from '@companion-module/base'

/** Shared Companion button colors for this module's presets/feedbacks. */
export const COLOR = {
	white: combineRgb(255, 255, 255),
	ink: combineRgb(18, 15, 29), // #120F1D
	surface: combineRgb(48, 42, 70), // #302A46
	amber: combineRgb(255, 197, 66), // #FFC542
} as const

/** Highlight a feedback applies when its condition is met. */
export const ACTIVE_COLORS = {
	bgcolor: COLOR.amber,
	color: COLOR.ink,
} as const

/** Icon-over-label button style shared by presets. */
export function iconButtonStyle(label: string, icon: string): CompanionButtonStyleProps {
	return {
		text: label,
		size: 15,
		color: COLOR.white,
		bgcolor: COLOR.surface,
		show_topbar: false,
		alignment: 'center:bottom',
		png64: icon,
		pngalignment: 'center:top',
	}
}
