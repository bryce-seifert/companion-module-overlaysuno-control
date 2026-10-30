import type { ModuleInstance } from './main.js'
import type { OverlayModel } from './api.js'
import { contentSubCompositions, controlSubModel, inferFields } from './inferred-model.js'

/**
 * How the module writes to the app:
 * - 'commands': named commands via PUT /api (standard overlays.uno apps).
 * - 'patch': state and fields directly on the datastore via PATCH /control (bespoke apps, which reject the commands).
 */
export type Transport = 'commands' | 'patch'

export const VISIBILITY_ACTIONS = [
	{ id: 'show', label: 'Show', command: 'ShowOverlay', bulk: false },
	{ id: 'hide', label: 'Hide', command: 'HideOverlay', bulk: false },
	{ id: 'toggle', label: 'Toggle', command: 'ToggleOverlay', bulk: false },
	{ id: 'show_all', label: 'Show All', command: 'ShowAllOverlays', bulk: true },
	{ id: 'hide_all', label: 'Hide All', command: 'HideAllOverlays', bulk: true },
] as const

export type VisibilityAction = (typeof VISIBILITY_ACTIONS)[number]

/** Something the visibility action shows and hides. */
export interface Graphic {
	/** Id on the wire. A single-overlay app's only overlay is addressed with ''. */
	id: string
	name: string
	/** Logic layer scoped to its parent composition; graphics sharing one replace each other on screen. */
	layerKey: string | null
	layerName: string | null
}

/**
 * What the connected app offers and how to drive it, resolved once from discovery (and /control for apps
 * with no models), so actions, presets, feedbacks and variables don't each re-derive it.
 */
export interface AppShape {
	/** How show/hide is sent, or null when the app offers no way to. */
	visibilityTransport: Transport | null
	visibilityActions: VisibilityAction[]
	/** Overlays visibility actions, feedbacks and variables cover. */
	graphics: Graphic[]
	/** The app has one overlay, addressed as '' and with its visibility stored under 'global'. */
	singleOverlay: boolean
	/** How content fields are written, or null when they're only inferred from /control and read-only. */
	contentTransport: Transport | null
	/** Overlays with content fields, from the best source available. */
	contentModels: OverlayModel[]
}

/** PATCH /control can only set an animation state, so the bulk actions have no equivalent. */
const PATCH_VISIBILITY_ACTIONS = VISIBILITY_ACTIONS.filter((action) => !action.bulk)

function resolveVisibility(self: ModuleInstance): Pick<AppShape, 'visibilityTransport' | 'visibilityActions'> {
	// Apps with their own visibility commands (e.g. ShowScorebug) reject these, so offer only what the schema lists.
	const commandActions = VISIBILITY_ACTIONS.filter((action) => self.availableCommands.has(action.command))
	if (commandActions.length > 0) return { visibilityTransport: 'commands', visibilityActions: commandActions }

	if (self.controlSubs.some((sub) => sub.isGraphic)) {
		return { visibilityTransport: 'patch', visibilityActions: PATCH_VISIBILITY_ACTIONS }
	}
	return { visibilityTransport: null, visibilityActions: [] }
}

function resolveGraphics(self: ModuleInstance, transport: Transport | null, singleOverlay: boolean): Graphic[] {
	if (singleOverlay) return [{ id: '', name: 'Overlay', layerKey: null, layerName: null }]

	if (transport === 'patch') {
		return self.controlSubs
			.filter((sub) => sub.isGraphic)
			.map(({ id, name, layerKey, layerName }) => ({ id, name, layerKey, layerName }))
	}

	// Overlay ids are subcomposition ids, so /model can still say which logic layer each is in.
	return self.overlayList.map((overlay) => {
		const sub = self.controlSubs.find((s) => s.id === overlay.id)
		return { id: overlay.id, name: overlay.name, layerKey: sub?.layerKey ?? null, layerName: sub?.layerName ?? null }
	})
}

function resolveContent(self: ModuleInstance): Pick<AppShape, 'contentTransport' | 'contentModels'> {
	if (self.overlayModels.length > 0) return { contentTransport: 'commands', contentModels: self.overlayModels }

	const modelled = self.controlSubs.filter((sub) => sub.fields.length > 0).map(controlSubModel)
	if (modelled.length > 0) return { contentTransport: 'patch', contentModels: modelled }

	// No models at all: reconstruct field types from live values, for feedbacks and variables only.
	return {
		contentTransport: null,
		contentModels: contentSubCompositions(self).map((sub) => ({
			id: sub.subCompositionId,
			name: sub.subCompositionName,
			model: inferFields(sub.payload ?? {}),
			groups: [],
			hasSlots: false,
		})),
	}
}

export function resolveAppShape(self: ModuleInstance): AppShape {
	const visibility = resolveVisibility(self)
	// Bespoke apps driven over PATCH have many subcompositions; without GetOverlays, the rest have one overlay.
	const singleOverlay = self.overlayList.length === 0 && visibility.visibilityTransport !== 'patch'

	return {
		...visibility,
		graphics: resolveGraphics(self, visibility.visibilityTransport, singleOverlay),
		singleOverlay,
		...resolveContent(self),
	}
}
