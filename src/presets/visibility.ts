import type {
	CompanionButtonPresetDefinition,
	CompanionPresetDefinitions,
	CompanionButtonStyleProps,
} from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import { ACTIVE_COLORS, iconButtonStyle } from '../style.js'
import { addDivider } from './layout.js'
import type { Graphic } from '../app-shape.js'
import { sanitizeName } from '../variables.js'
import { ICON_SHOW_OVERLAY, ICON_HIDE_OVERLAY, ICON_TOGGLE_OVERLAY } from '../icons.js'

const VISIBILITY_CATEGORY = 'Overlays - Visibility'

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

export function visibilityFeedbacks(
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
		style: iconButtonStyle(spec.label, spec.icon),
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
		style: iconButtonStyle(label, icon),
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
		feedbackStyle: ACTIVE_COLORS,
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

function addOverlayButtons(supported: SupportedActions, presets: CompanionPresetDefinitions, overlay: Graphic): void {
	addVisibilityButton(supported, presets, {
		key: `show_${overlay.id}`,
		action: 'show',
		name: `Show: ${overlay.name}`,
		label: `Show\\n${overlay.name}`,
		overlayId: overlay.id,
		icon: ICON_SHOW_OVERLAY,
		feedbackStyle: ACTIVE_COLORS,
	})
	addVisibilityButton(supported, presets, {
		key: `hide_${overlay.id}`,
		action: 'hide',
		name: `Hide: ${overlay.name}`,
		label: `Hide\\n${overlay.name}`,
		overlayId: overlay.id,
		icon: ICON_HIDE_OVERLAY,
		feedbackStyle: ACTIVE_COLORS,
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

/** Overlays sharing a logic layer share a screen position, so they're listed together; the rest come last. */
function addLayeredOverlayButtons(
	graphics: Graphic[],
	supported: SupportedActions,
	presets: CompanionPresetDefinitions,
): void {
	const layers = new Map<string, Graphic[]>()
	const unlayered: Graphic[] = []
	for (const graphic of graphics) {
		if (graphic.layerKey) layers.set(graphic.layerKey, [...(layers.get(graphic.layerKey) ?? []), graphic])
		else unlayered.push(graphic)
	}

	for (const [layerKey, members] of layers) {
		addDivider(
			presets,
			VISIBILITY_CATEGORY,
			`vis_layer_${sanitizeName(layerKey)}`,
			`Logic layer: ${members[0].layerName}`,
		)
		for (const graphic of members) addOverlayButtons(supported, presets, graphic)
	}

	if (unlayered.length === 0) return
	addDivider(presets, VISIBILITY_CATEGORY, 'vis_layer_none', 'Other')
	for (const graphic of unlayered) addOverlayButtons(supported, presets, graphic)
}

function buildMultiOverlayVisibilityPresets(
	graphics: Graphic[],
	supported: SupportedActions,
	presets: CompanionPresetDefinitions,
): void {
	const hasPerOverlay = supported.has('show') || supported.has('hide') || supported.has('toggle')

	if (hasPerOverlay && graphics.some((graphic) => graphic.layerKey)) {
		addLayeredOverlayButtons(graphics, supported, presets)
	} else {
		for (const overlay of hasPerOverlay ? graphics : []) {
			addDivider(presets, VISIBILITY_CATEGORY, `vis_header_${overlay.id}`, overlay.name)
			addOverlayButtons(supported, presets, overlay)
		}
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
	const supported = new Set<string>(self.shape.visibilityActions.map((action) => action.id))
	if (supported.size === 0) return

	if (self.shape.singleOverlay) {
		buildSingleOverlayVisibilityPresets(supported, presets)
		return
	}

	buildMultiOverlayVisibilityPresets(self.shape.graphics, supported, presets)
}
