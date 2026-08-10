import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import type { ApiPayload } from '../api.js'
import { parseJsonValueOrString } from '../util.js'

export function getCustomActions(self: ModuleInstance): CompanionActionDefinitions {
	return {
		send_custom_command: {
			name: 'Custom - Send Command',
			description:
				'Send an arbitrary command to the Overlays Uno API. Use this for overlay types with unique commands.',
			options: [
				{
					id: 'command',
					type: 'textinput',
					label: 'Command',
					default: '',
					required: true,
					useVariables: true,
					tooltip: 'The API command name, e.g. Start, SetNames, ShuffleNames',
				},
				{
					id: 'value',
					type: 'textinput',
					label: 'Value (optional)',
					default: '',
					useVariables: true,
					tooltip: 'The value to send with the command. Leave empty if the command takes no value.',
				},
				{
					id: 'id',
					type: 'textinput',
					label: 'Overlay ID (optional)',
					default: '',
					useVariables: true,
					tooltip: 'Only needed for commands that target a specific overlay.',
				},
				{
					id: 'fieldId',
					type: 'textinput',
					label: 'Field ID (optional)',
					default: '',
					useVariables: true,
					tooltip: 'Only needed for field-level commands like SetCustomizationField.',
				},
			],
			callback: async (event) => {
				const command = String(event.options.command ?? '')
				if (!command) {
					self.log('warn', 'Send Custom Command: command is empty')
					return
				}

				const payload: ApiPayload = { command }

				const value = String(event.options.value ?? '')
				if (value) {
					payload.value = parseJsonValueOrString(value)
				}

				const id = String(event.options.id ?? '')
				if (id) payload.id = id

				const fieldId = String(event.options.fieldId ?? '')
				if (fieldId) payload.fieldId = fieldId

				await self.sendAndRefresh(payload)
			},
		},
	}
}
