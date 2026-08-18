import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import type { ApiPayload } from '../api.js'
import { overlayChoices } from './shared.js'

const SLOT_MODE_COMMANDS = {
	first: 'TakeOverlayFirstSlot',
	next: 'TakeOverlayNextSlot',
	previous: 'TakeOverlayPreviousSlot',
	last: 'TakeOverlayLastSlot',
	name: 'TakeOverlaySlotName',
	number: 'TakeOverlaySlotNumber',
} as const

type SlotMode = keyof typeof SLOT_MODE_COMMANDS

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
					allowCustom: false,
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
				const mode = String(event.options.mode) as SlotMode
				const id = String(event.options.overlayId)
				const command = SLOT_MODE_COMMANDS[mode] ?? SLOT_MODE_COMMANDS.first

				const payload: ApiPayload = { command, id }
				if (mode === 'name') payload.value = String(event.options.slotName)
				if (mode === 'number') payload.value = String(event.options.slotNumber)

				await self.sendAndRefresh(payload)
			},
		},
	}
}
