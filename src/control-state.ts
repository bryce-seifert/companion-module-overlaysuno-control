import { isSubCompositionVisible, type ControlSubComposition } from './api.js'
import type { Graphic } from './app-shape.js'
import {
	GLOBAL_OVERLAY_ID,
	GLOBAL_VISIBILITY_FIELD,
	HIDDEN_SUBCOMPOSITION_STATE,
	VISIBLE_SUBCOMPOSITION_STATE,
	type JsonObject,
} from './types.js'

/** The only non-app subcomposition, when there is exactly one — how single-overlay apps are targeted. */
export function soleOverlaySub(subs: ControlSubComposition[]): ControlSubComposition | undefined {
	const overlays = subs.filter((s) => !s.mainComposition)
	return overlays.length === 1 ? overlays[0] : undefined
}

export function globalVisibilityFlagSub(subs: ControlSubComposition[]): ControlSubComposition | undefined {
	return subs.find((s) => !s.mainComposition && typeof s.payload?.[GLOBAL_VISIBILITY_FIELD] === 'boolean')
}

/** On-air state of a single-overlay app, or undefined when it can't be told. */
export function globalVisibility(subs: ControlSubComposition[]): boolean | undefined {
	const flagSub = globalVisibilityFlagSub(subs)
	if (flagSub) return flagSub.payload?.[GLOBAL_VISIBILITY_FIELD] === true

	const only = soleOverlaySub(subs)
	return only ? isSubCompositionVisible(only) : undefined
}

/**
 * Subcompositions with one overlay's visibility set, written where applyControlState() reads it back.
 * Showing an overlay also takes the others in its logic layer out, as the app itself does.
 */
export function withVisibility(
	subs: ControlSubComposition[],
	overlayId: string,
	visible: boolean,
	graphics: readonly Pick<Graphic, 'id' | 'layerKey'>[],
): ControlSubComposition[] {
	const state = visible ? VISIBLE_SUBCOMPOSITION_STATE : HIDDEN_SUBCOMPOSITION_STATE

	if (overlayId && overlayId !== GLOBAL_OVERLAY_ID) {
		const layerOf = (id: string) => graphics.find((graphic) => graphic.id === id)?.layerKey
		const layer = visible ? layerOf(overlayId) : undefined
		return subs.map((s) => {
			if (s.subCompositionId === overlayId) return { ...s, state }
			if (layer && layerOf(s.subCompositionId) === layer) return { ...s, state: HIDDEN_SUBCOMPOSITION_STATE }
			return s
		})
	}

	const flagSub = globalVisibilityFlagSub(subs)
	if (flagSub) {
		return subs.map((s) =>
			s === flagSub ? { ...s, payload: { ...s.payload, [GLOBAL_VISIBILITY_FIELD]: visible } } : s,
		)
	}

	const only = soleOverlaySub(subs)
	return subs.map((s) => (s === only ? { ...s, state } : s))
}

/**
 * Subcompositions with `fields` merged into one subcomposition's payload. Only keys /control already
 * reports are taken, so an update can't change the app's shape (and force a definitions rebuild) between polls.
 */
export function withFields(subs: ControlSubComposition[], subId: string, fields: JsonObject): ControlSubComposition[] {
	return subs.map((s) => {
		if (s.subCompositionId !== subId) return s
		const payload = s.payload ?? {}
		const known = Object.entries(fields).filter(([key]) => key in payload)
		return { ...s, payload: { ...payload, ...Object.fromEntries(known) } }
	})
}
