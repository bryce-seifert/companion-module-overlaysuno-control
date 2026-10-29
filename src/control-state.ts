import { isSubCompositionVisible, type ControlSubComposition } from './api.js'
import {
	GLOBAL_OVERLAY_ID,
	GLOBAL_VISIBILITY_FIELD,
	HIDDEN_SUBCOMPOSITION_STATE,
	VISIBLE_SUBCOMPOSITION_STATE,
	type JsonObject,
} from './types.js'

/** Copy of `subs` with each matching subcomposition updated by `patch`. */
export function patchSubs(
	subs: ControlSubComposition[],
	matches: (sub: ControlSubComposition) => boolean,
	patch: (sub: ControlSubComposition) => Partial<ControlSubComposition>,
): ControlSubComposition[] {
	return subs.map((s) => (matches(s) ? { ...s, ...patch(s) } : s))
}

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
	logicLayers: ReadonlyMap<string, string>,
): ControlSubComposition[] {
	const state = visible ? VISIBLE_SUBCOMPOSITION_STATE : HIDDEN_SUBCOMPOSITION_STATE

	if (overlayId && overlayId !== GLOBAL_OVERLAY_ID) {
		const layer = visible ? logicLayers.get(overlayId) : undefined
		return subs.map((s) => {
			if (s.subCompositionId === overlayId) return { ...s, state }
			if (layer && logicLayers.get(s.subCompositionId) === layer) return { ...s, state: HIDDEN_SUBCOMPOSITION_STATE }
			return s
		})
	}

	const flagSub = globalVisibilityFlagSub(subs)
	if (flagSub) {
		return patchSubs(
			subs,
			(s) => s === flagSub,
			(s) => ({ payload: { ...s.payload, [GLOBAL_VISIBILITY_FIELD]: visible } }),
		)
	}

	const only = soleOverlaySub(subs)
	return patchSubs(
		subs,
		(s) => s === only,
		() => ({ state }),
	)
}

/**
 * A subcomposition's payload with `fields` merged in. Only keys /control already reports are taken, so
 * an update can't change the app's shape (and force a definitions rebuild) between polls.
 */
export function mergeKnownFields(sub: ControlSubComposition, fields: JsonObject): Partial<ControlSubComposition> {
	const payload = sub.payload ?? {}
	const known = Object.entries(fields).filter(([key]) => key in payload)
	return { payload: { ...payload, ...Object.fromEntries(known) } }
}
