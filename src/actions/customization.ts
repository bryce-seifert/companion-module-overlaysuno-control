import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
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
				let value: Record<string, unknown>
				try {
					value = JSON.parse(String(event.options.value))
				} catch (e) {
					self.log('error', `SetCustomization: invalid JSON - ${e}`)
					return
				}
				await self.sendAndRefresh({ command: 'SetCustomization', value })
			},
			learn: async (event) => {
				const values = await self.fetchLiveCustomization()
				if (!values) return undefined
				// Learn replaces the option set wholesale, so carry the existing options through.
				// Pretty-printed so the learned JSON is actually editable in the textinput.
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
