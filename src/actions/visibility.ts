import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import type { ApiPayload } from '../api.js'
import { overlayChoices } from './shared.js'

export function getVisibilityActions(self: ModuleInstance): CompanionActionDefinitions {
	const choices = overlayChoices(self)

	return {
		overlay_visibility: {
			name: 'Overlays - Visibility',
			options: [
				{
					id: 'action',
					type: 'dropdown',
					label: 'Action',
					choices: [
						{ id: 'show', label: 'Show' },
						{ id: 'hide', label: 'Hide' },
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'show_all', label: 'Show All' },
						{ id: 'hide_all', label: 'Hide All' },
					],
					default: 'show',
				},
				{
					id: 'overlayId',
					type: 'dropdown',
					label: 'Overlay',
					choices,
					default: choices[0]?.id ?? '',
					allowCustom: true,
					isVisibleExpression: `$(options:action) != 'show_all' && $(options:action) != 'hide_all'`,
				},
			],
			callback: async (event) => {
				const action = String(event.options.action)

				if (action === 'show_all' || action === 'hide_all') {
					await self.sendAndRefresh({ command: action === 'show_all' ? 'ShowAllOverlays' : 'HideAllOverlays' })
					return
				}

				const command = action === 'hide' ? 'HideOverlay' : action === 'toggle' ? 'ToggleOverlay' : 'ShowOverlay'
				const payload: ApiPayload = { command }
				const overlayId = String(event.options.overlayId ?? '')
				if (overlayId) {
					payload.id = overlayId
				}
				await self.sendAndRefresh(payload)
			},
		},
	}
}
