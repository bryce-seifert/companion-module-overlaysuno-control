import type {
	CompanionButtonPresetDefinition,
	CompanionPresetDefinitions,
	CompanionButtonStyleProps,
} from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import { COLOR } from '../style.js'
import { addDivider } from './layout.js'
import { supportedVisibilityActions } from '../actions/visibility.js'
import { ICON_SHOW_OVERLAY, ICON_HIDE_OVERLAY, ICON_TOGGLE_OVERLAY } from '../icons.js'

const VISIBILITY_CATEGORY = 'Overlays - Visibility'

const ACTIVE_COLORS = {
	bgcolor: COLOR.amber,
	color: COLOR.ink,
} as const

type VisibilityAction = 'show' | 'hide' | 'toggle'

interface VisibilityPresetSpec {
	key: string
	action: VisibilityAction
	name: string
	label: string
	overlayId: string
	icon: string
	feedbackStyle: Partial<CompanionButtonStyleProps>
	invertFeedback?: boolean
}

function visibilityFeedbacks(
	overlayId: string,
	feedbackStyle: Partial<CompanionButtonStyleProps>,
	invertFeedback: boolean,
): CompanionButtonPresetDefinition['feedbacks'] {
	return [
		{
			feedbackId: 'overlay_visible',
			...(invertFeedback ? { isInverted: true } : {}),
			options: { overlayId },
			style: feedbackStyle,
		},
	]
}

/** Ids of the visibility actions this app supports. */
type SupportedActions = ReadonlySet<string>

function addVisibilityButton(
	supported: SupportedActions,
	presets: CompanionPresetDefinitions,
	spec: VisibilityPresetSpec,
): void {
	if (!supported.has(spec.action)) return
	presets[spec.key] = {
		type: 'button',
		category: VISIBILITY_CATEGORY,
		name: spec.name,
		style: {
			text: spec.label,
			size: 15,
			color: COLOR.white,
			bgcolor: COLOR.surface,
			show_topbar: false,
			alignment: 'center:bottom',
			png64: spec.icon,
			pngalignment: 'center:top',
		},
		steps: [
			{
				down: [{ actionId: 'overlay_visibility', options: { action: spec.action, overlayId: spec.overlayId } }],
				up: [],
			},
		],
		feedbacks: visibilityFeedbacks(spec.overlayId, spec.feedbackStyle, spec.invertFeedback ?? false),
	}
}

function addBulkVisibilityButton(
	supported: SupportedActions,
	presets: CompanionPresetDefinitions,
	key: string,
	action: 'show_all' | 'hide_all',
	name: string,
	label: string,
	icon: string,
): void {
	if (!supported.has(action)) return
	presets[key] = {
		type: 'button',
		category: VISIBILITY_CATEGORY,
		name,
		style: {
			text: label,
			size: 15,
			color: COLOR.white,
			bgcolor: COLOR.surface,
			show_topbar: false,
			alignment: 'center:bottom',
			png64: icon,
			pngalignment: 'center:top',
		},
		steps: [{ down: [{ actionId: 'overlay_visibility', options: { action } }], up: [] }],
		feedbacks: [],
	}
}

function buildSingleOverlayVisibilityPresets(supported: SupportedActions, presets: CompanionPresetDefinitions): void {
	addVisibilityButton(supported, presets, {
		key: 'show_global_overlay',
		action: 'show',
		name: 'Show Overlay',
		label: 'Show\\nOverlay',
		overlayId: '',
		icon: ICON_SHOW_OVERLAY,
		feedbackStyle: { ...ACTIVE_COLORS },
	})
	addVisibilityButton(supported, presets, {
		key: 'hide_global_overlay',
		action: 'hide',
		name: 'Hide Overlay',
		label: 'Hide\\nOverlay',
		overlayId: '',
		icon: ICON_HIDE_OVERLAY,
		feedbackStyle: { ...ACTIVE_COLORS, png64: ICON_HIDE_OVERLAY },
		invertFeedback: true,
	})
	addVisibilityButton(supported, presets, {
		key: 'toggle_global_overlay',
		action: 'toggle',
		name: 'Toggle Overlay',
		label: 'Toggle\\nOverlay',
		overlayId: '',
		icon: ICON_TOGGLE_OVERLAY,
		feedbackStyle: { ...ACTIVE_COLORS, png64: ICON_HIDE_OVERLAY },
	})
}

function buildMultiOverlayVisibilityPresets(
	self: ModuleInstance,
	supported: SupportedActions,
	presets: CompanionPresetDefinitions,
): void {
	const hasPerOverlay = supported.has('show') || supported.has('hide') || supported.has('toggle')

	for (const overlay of hasPerOverlay ? self.overlayList : []) {
		addDivider(presets, VISIBILITY_CATEGORY, `vis_header_${overlay.id}`, overlay.name)

		addVisibilityButton(supported, presets, {
			key: `show_${overlay.id}`,
			action: 'show',
			name: `Show: ${overlay.name}`,
			label: `Show\\n${overlay.name}`,
			overlayId: overlay.id,
			icon: ICON_SHOW_OVERLAY,
			feedbackStyle: { ...ACTIVE_COLORS },
		})
		addVisibilityButton(supported, presets, {
			key: `hide_${overlay.id}`,
			action: 'hide',
			name: `Hide: ${overlay.name}`,
			label: `Hide\\n${overlay.name}`,
			overlayId: overlay.id,
			icon: ICON_HIDE_OVERLAY,
			feedbackStyle: { ...ACTIVE_COLORS },
			invertFeedback: true,
		})
		addVisibilityButton(supported, presets, {
			key: `toggle_${overlay.id}`,
			action: 'toggle',
			name: `Toggle: ${overlay.name}`,
			label: `Toggle\\n${overlay.name}`,
			overlayId: overlay.id,
			icon: ICON_TOGGLE_OVERLAY,
			// Multi-overlay toggle feedback only swaps the icon (preserves historical style).
			feedbackStyle: { png64: ICON_HIDE_OVERLAY },
		})
	}

	if (supported.has('show_all') || supported.has('hide_all')) {
		addDivider(presets, VISIBILITY_CATEGORY, 'vis_header_all', 'All Overlays')
	}
	addBulkVisibilityButton(
		supported,
		presets,
		'show_all_overlays',
		'show_all',
		'Show All Overlays',
		'Show\\nAll',
		ICON_SHOW_OVERLAY,
	)
	addBulkVisibilityButton(
		supported,
		presets,
		'hide_all_overlays',
		'hide_all',
		'Hide All Overlays',
		'Hide\\nAll',
		ICON_HIDE_OVERLAY,
	)
}

export function buildVisibilityPresets(self: ModuleInstance, presets: CompanionPresetDefinitions): void {
	const supported = new Set<string>(supportedVisibilityActions(self).map((action) => action.id))
	if (supported.size === 0) return

	if (self.overlayList.length === 0) {
		buildSingleOverlayVisibilityPresets(supported, presets)
		return
	}

	buildMultiOverlayVisibilityPresets(self, supported, presets)
}
