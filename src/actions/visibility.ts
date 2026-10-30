import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import { applyVisibility } from '../writers.js'
import { graphicChoices } from './shared.js'

export function getVisibilityActions(self: ModuleInstance): CompanionActionDefinitions {
	const supported = self.shape.visibilityActions
	if (supported.length === 0) return {}

	const choices = graphicChoices(self)

	return {
		overlay_visibility: {
			name: 'Overlays - Visibility',
			description: 'Overlays sharing a logic layer replace each other: showing one hides the others.',
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
				await applyVisibility(self, action, String(event.options.overlayId ?? ''))
			},
		},
	}
}
