import type { CompanionButtonStyleProps, CompanionPresetDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import { usesAnimateActions, type AnimateAction } from '../actions/subcomposition.js'
import { ICON_HIDE_OVERLAY, ICON_SHOW_OVERLAY, ICON_TOGGLE_OVERLAY } from '../icons.js'
import { graphicSubs, type ControlSub } from '../inferred-model.js'
import { sanitizeName } from '../variables.js'
import { addDivider } from './layout.js'
import { ACTIVE_COLORS, iconButtonStyle } from './visibility.js'

const ANIMATE_CATEGORY = 'Overlays - Animate'

interface AnimateButtonSpec {
	action: AnimateAction
	verb: string
	icon: string
	feedbackStyle: Partial<CompanionButtonStyleProps>
	invertFeedback: boolean
}

const ANIMATE_BUTTONS: AnimateButtonSpec[] = [
	{ action: 'in', verb: 'In', icon: ICON_SHOW_OVERLAY, feedbackStyle: { ...ACTIVE_COLORS }, invertFeedback: false },
	{ action: 'out', verb: 'Out', icon: ICON_HIDE_OVERLAY, feedbackStyle: { ...ACTIVE_COLORS }, invertFeedback: true },
	{
		action: 'toggle',
		verb: 'Toggle',
		icon: ICON_TOGGLE_OVERLAY,
		feedbackStyle: { ...ACTIVE_COLORS, png64: ICON_HIDE_OVERLAY },
		invertFeedback: false,
	},
]

function addAnimateButtons(sub: ControlSub, presets: CompanionPresetDefinitions): void {
	for (const spec of ANIMATE_BUTTONS) {
		presets[`animate_${spec.action}_${sub.id}`] = {
			type: 'button',
			category: ANIMATE_CATEGORY,
			name: `${spec.verb}: ${sub.name}`,
			style: iconButtonStyle(`${spec.verb}\\n${sub.name}`, spec.icon),
			steps: [
				{
					down: [{ actionId: 'subcomposition_animate', options: { action: spec.action, subCompositionId: sub.id } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'overlay_visible',
					...(spec.invertFeedback ? { isInverted: true } : {}),
					options: { overlayId: sub.id },
					style: spec.feedbackStyle,
				},
			],
		}
	}
}

/** In / Out / Toggle per subcomposition, grouped by logic layer since those share a screen position. */
function buildAnimatePresets(self: ModuleInstance, presets: CompanionPresetDefinitions): void {
	const layered = new Map<string, ControlSub[]>()
	const unlayered: ControlSub[] = []
	for (const sub of graphicSubs(self)) {
		if (!sub.layerKey) {
			unlayered.push(sub)
			continue
		}
		layered.set(sub.layerKey, [...(layered.get(sub.layerKey) ?? []), sub])
	}

	for (const [layerKey, subs] of layered) {
		addDivider(
			presets,
			ANIMATE_CATEGORY,
			`animate_layer_${sanitizeName(layerKey)}`,
			`Logic layer: ${subs[0].layerName}`,
		)
		for (const sub of subs) addAnimateButtons(sub, presets)
	}

	if (unlayered.length === 0) return
	if (layered.size > 0) addDivider(presets, ANIMATE_CATEGORY, 'animate_layer_none', 'Other')
	for (const sub of unlayered) addAnimateButtons(sub, presets)
}

export function buildSubCompositionPresets(self: ModuleInstance, presets: CompanionPresetDefinitions): void {
	if (!usesAnimateActions(self)) return

	buildAnimatePresets(self, presets)
}
