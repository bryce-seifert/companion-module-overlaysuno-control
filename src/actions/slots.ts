import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import type { ApiPayload } from '../api.js'
import { overlayChoices } from './shared.js'

export function getSlotActions(self: ModuleInstance): CompanionActionDefinitions {
	const choices = overlayChoices(self)

	return {
		take_overlay_slot: {
			name: 'Overlays - Take Slot',
			options: [
				{
					id: 'overlayId',
					type: 'dropdown',
					label: 'Overlay',
					choices,
					default: choices[0]?.id ?? '',
					allowCustom: true,
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Slot',
					choices: [
						{ id: 'first', label: 'First' },
						{ id: 'next', label: 'Next' },
						{ id: 'previous', label: 'Previous' },
						{ id: 'last', label: 'Last' },
						{ id: 'name', label: 'By Name' },
						{ id: 'number', label: 'By Number' },
					],
					default: 'first',
				},
				{
					id: 'slotName',
					type: 'textinput',
					label: 'Slot Name',
					default: '',
					useVariables: true,
					isVisibleExpression: `$(options:mode) == 'name'`,
				},
				{
					id: 'slotNumber',
					type: 'number',
					label: 'Slot Number',
					default: 1,
					min: 1,
					max: 1000,
					isVisibleExpression: `$(options:mode) == 'number'`,
				},
			],
			callback: async (event) => {
				const mode = String(event.options.mode)
				const id = String(event.options.overlayId)

				const payload: ApiPayload = { command: 'TakeOverlayFirstSlot', id }
				switch (mode) {
					case 'next':
						payload.command = 'TakeOverlayNextSlot'
						break
					case 'previous':
						payload.command = 'TakeOverlayPreviousSlot'
						break
					case 'last':
						payload.command = 'TakeOverlayLastSlot'
						break
					case 'name':
						payload.command = 'TakeOverlaySlotName'
						payload.value = String(event.options.slotName)
						break
					case 'number':
						payload.command = 'TakeOverlaySlotNumber'
						payload.value = String(event.options.slotNumber)
						break
					default:
						payload.command = 'TakeOverlayFirstSlot'
				}
				await self.sendAndRefresh(payload)
			},
		},
	}
}
