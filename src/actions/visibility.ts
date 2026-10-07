import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import type { ApiPayload } from '../api.js'
import { overlayChoices } from './shared.js'

export const VISIBILITY_ACTIONS = [
	{ id: 'show', label: 'Show', command: 'ShowOverlay' },
	{ id: 'hide', label: 'Hide', command: 'HideOverlay' },
	{ id: 'toggle', label: 'Toggle', command: 'ToggleOverlay' },
	{ id: 'show_all', label: 'Show All', command: 'ShowAllOverlays' },
	{ id: 'hide_all', label: 'Hide All', command: 'HideAllOverlays' },
] as const

/** Whether the app's schema lists the command behind a visibility action id. */
export function supportsVisibilityAction(self: ModuleInstance, actionId: string): boolean {
	const action = VISIBILITY_ACTIONS.find((a) => a.id === actionId)
	return action !== undefined && self.hasCommand(action.command)
}

function isBulkVisibilityAction(action: string): boolean {
	return action === 'show_all' || action === 'hide_all'
}

export function getVisibilityActions(self: ModuleInstance): CompanionActionDefinitions {
	// Apps with their own visibility commands (e.g. ShowScorebug) reject these, so offer only what the schema lists.
	const supported = VISIBILITY_ACTIONS.filter((action) => supportsVisibilityAction(self, action.id))
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
				const action = String(event.options.action)
				const command = (VISIBILITY_ACTIONS.find((a) => a.id === action) ?? VISIBILITY_ACTIONS[0]).command

				if (isBulkVisibilityAction(action)) {
					await self.sendAndRefresh({ command }, null)
					return
				}

				const payload: ApiPayload = { command }
				const overlayId = String(event.options.overlayId ?? '')
				if (overlayId) payload.id = overlayId

				await self.sendAndRefresh(payload, { kind: 'visibility', overlayId })
			},
		},
	}
}
