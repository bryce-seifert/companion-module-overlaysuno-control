import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import type { OverlayModelField } from '../api.js'
import { buildFieldChoices, buildFieldValueInputs, NUMERIC_FIELD_TYPES } from '../fields.js'
import { EXECUTE_FUNCTION_CHOICES } from './shared.js'

export function getCustomizationActions(self: ModuleInstance): CompanionActionDefinitions {
	const fields = self.customizationModel?.model ?? []
	const valueInputs = buildFieldValueInputs(fields)
	const fieldChoices = valueInputs.choices
	const numericChoices = buildFieldChoices(
		fields,
		(f: OverlayModelField) => NUMERIC_FIELD_TYPES.has(f.type),
		'No numeric fields',
	)

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

		set_customization_field: {
			name: 'Customize - Set Field',
			options: [
				{
					id: 'fieldId',
					type: 'dropdown',
					label: 'Field',
					choices: fieldChoices,
					default: fieldChoices[0]?.id ?? '',
					allowCustom: true,
				},
				...valueInputs.valueOptions,
			],
			callback: async (event) => {
				const value = valueInputs.resolveValue(event.options)
				await self.sendAndRefresh({ command: 'SetCustomizationField', fieldId: String(event.options.fieldId), value })
			},
			learn: async (event) => {
				const values = await self.fetchLiveCustomization()
				if (!values) return undefined

				const learned = valueInputs.learnValue(event.options, values[String(event.options.fieldId)])
				if (!learned) return undefined

				// Learn replaces the option set wholesale, so carry the existing options through -
				// returning only the learned value key would blank out fieldId.
				return { ...event.options, ...learned }
			},
		},

		adjust_customization_field: {
			name: 'Customize - Adjust Field',
			options: [
				{
					id: 'fieldId',
					type: 'dropdown',
					label: 'Field',
					choices: numericChoices,
					default: numericChoices[0]?.id ?? '',
					allowCustom: true,
				},
				{
					id: 'direction',
					type: 'dropdown',
					label: 'Direction',
					choices: [
						{ id: 'increment', label: 'Increment (+)' },
						{ id: 'decrement', label: 'Decrement (−)' },
					],
					default: 'increment',
				},
				{
					id: 'value',
					type: 'textinput',
					label: 'Amount',
					default: '1',
					useVariables: true,
				},
			],
			callback: async (event) => {
				const decrement = event.options.direction === 'decrement'
				await self.sendAndRefresh({
					command: decrement ? 'DecrementCustomizationField' : 'IncrementCustomizationField',
					fieldId: String(event.options.fieldId),
					value: String(event.options.value),
				})
			},
		},

		toggle_customization_field: {
			name: 'Customize - Toggle Field',
			options: [
				{
					id: 'fieldId',
					type: 'dropdown',
					label: 'Field',
					choices: fieldChoices,
					default: fieldChoices[0]?.id ?? '',
					allowCustom: true,
				},
			],
			callback: async (event) => {
				await self.sendAndRefresh({ command: 'ToggleCustomizationField', fieldId: String(event.options.fieldId) })
			},
		},

		exec_customization_field: {
			name: 'Customize - Execute Field',
			options: [
				{
					id: 'fieldId',
					type: 'dropdown',
					label: 'Field',
					choices: fieldChoices,
					default: fieldChoices[0]?.id ?? '',
					allowCustom: true,
				},
				{
					id: 'value',
					type: 'dropdown',
					label: 'Function',
					choices: EXECUTE_FUNCTION_CHOICES,
					default: 'execute',
				},
			],
			callback: async (event) => {
				await self.sendAndRefresh({
					command: 'ExecuteCustomizationField',
					fieldId: String(event.options.fieldId),
					value: String(event.options.value),
				})
			},
		},
	}
}
