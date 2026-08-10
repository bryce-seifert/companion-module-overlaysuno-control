import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import { parseJsonObject } from '../util.js'
import { buildFieldActions } from './fields.js'

export function getCustomizationActions(self: ModuleInstance): CompanionActionDefinitions {
	const fields = self.customizationModel?.model ?? []

	return {
		set_customization: {
			name: 'Customize - Set Customization (JSON)',
			options: [
				{
					id: 'value',
					type: 'textinput',
					label: 'Customization (JSON)',
					default: '{}',
					useVariables: true,
				},
			],
			callback: async (event) => {
				const parsed = parseJsonObject(String(event.options.value))
				if (!parsed.ok) {
					self.log('error', `SetCustomization: invalid JSON - ${parsed.error}`)
					return
				}
				await self.sendAndRefresh({ command: 'SetCustomization', value: parsed.value })
			},
			learn: async (event) => {
				const values = await self.fetchLiveCustomization()
				if (!values) return undefined
				// Learn replaces options wholesale — carry existing ones through. Pretty-print for editing.
				return { ...event.options, value: JSON.stringify(values, null, 2) }
			},
		},
		...buildFieldActions(self, {
			fields,
			targetOptions: [],
			actionIds: {
				set: 'set_customization_field',
				adjust: 'adjust_customization_field',
				toggle: 'toggle_customization_field',
				execute: 'exec_customization_field',
			},
			names: {
				set: 'Customize - Set Field',
				adjust: 'Customize - Adjust Field',
				toggle: 'Customize - Toggle Field',
				execute: 'Customize - Execute Field',
			},
			commands: {
				set: 'SetCustomizationField',
				increment: 'IncrementCustomizationField',
				decrement: 'DecrementCustomizationField',
				toggle: 'ToggleCustomizationField',
				execute: 'ExecuteCustomizationField',
			},
			payloadFor: () => ({ command: '' }),
			fetchValues: async () => self.fetchLiveCustomization(),
		}),
	}
}
