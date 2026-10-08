import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import type { ApiPayload } from '../api.js'
import { overlayChoices } from './shared.js'

export const VISIBILITY_ACTIONS = [
	{ id: 'show', label: 'Show', command: 'ShowOverlay', bulk: false },
	{ id: 'hide', label: 'Hide', command: 'HideOverlay', bulk: false },
	{ id: 'toggle', label: 'Toggle', command: 'ToggleOverlay', bulk: false },
	{ id: 'show_all', label: 'Show All', command: 'ShowAllOverlays', bulk: true },
	{ id: 'hide_all', label: 'Hide All', command: 'HideAllOverlays', bulk: true },
] as const

export type VisibilityAction = (typeof VISIBILITY_ACTIONS)[number]

/** Apps with their own visibility commands (e.g. ShowScorebug) reject these, so offer only what the schema lists. */
export function supportedVisibilityActions(self: ModuleInstance): VisibilityAction[] {
	return VISIBILITY_ACTIONS.filter((action) => self.hasCommand(action.command))
}

export function getVisibilityActions(self: ModuleInstance): CompanionActionDefinitions {
	const supported = supportedVisibilityActions(self)
	if (supported.length === 0) return {}

	const choices = overlayChoices(self)

	return {
		overlay_visibility: {
			name: 'Overlays - Visibility',
			options: [
				{
					id: 'action',
					type: 'dropdown',
					label: 'Action',
					choices: supported.map(({ id, label }) => ({ id, label })),
					default: supported[0].id,
				},
				{
					id: 'overlayId',
					type: 'dropdown',
					label: 'Overlay',
					choices,
					default: choices[0]?.id ?? '',
					allowCustom: false,
					isVisibleExpression: `$(options:action) != 'show_all' && $(options:action) != 'hide_all'`,
				},
			],
			callback: async (event) => {
				const action = supported.find((a) => a.id === event.options.action) ?? supported[0]
				const payload: ApiPayload = { command: action.command }

				const overlayId = String(event.options.overlayId ?? '')
				if (!action.bulk && overlayId) payload.id = overlayId

				await self.sendAndRefresh(payload)
			},
		},
	}
}
