import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import type { OverlayModelField } from '../api.js'
import { buildFieldChoices, buildFieldValueInputs, NUMERIC_FIELD_TYPES } from '../fields.js'
import { overlayChoices, EXECUTE_FUNCTION_CHOICES } from './shared.js'

export function getContentActions(self: ModuleInstance): CompanionActionDefinitions {
	const choices = overlayChoices(self)

	const contentFields = self.overlayModels.flatMap((m) => m.model)
	const valueInputs = buildFieldValueInputs(contentFields)
	const fieldChoices = valueInputs.choices
	const numericChoices = buildFieldChoices(
		contentFields,
		(f: OverlayModelField) => NUMERIC_FIELD_TYPES.has(f.type),
		'No numeric fields',
	)

	return {
		set_overlay_content: {
			name: 'Overlays - Set Content (JSON)',
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
					id: 'content',
					type: 'textinput',
					label: 'Content (JSON)',
					default: '{}',
					useVariables: true,
				},
			],
			callback: async (event) => {
				let content: Record<string, unknown>
				try {
					content = JSON.parse(String(event.options.content))
				} catch (e) {
					self.log('error', `SetOverlayContent: invalid JSON - ${e}`)
					return
				}
				await self.sendAndRefresh({ command: 'SetOverlayContent', id: String(event.options.overlayId), content })
			},
			learn: async (event) => {
				const content = await self.fetchLiveContent(String(event.options.overlayId))
				if (!content) return undefined
				return { ...event.options, content: JSON.stringify(content, null, 2) }
			},
		},

		set_overlay_content_field: {
			name: 'Overlays - Set Content Field',
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
				await self.sendAndRefresh({
					command: 'SetOverlayContentField',
					id: String(event.options.overlayId),
					fieldId: String(event.options.fieldId),
					value,
				})
			},
			learn: async (event) => {
				const content = await self.fetchLiveContent(String(event.options.overlayId))
				if (!content) return undefined

				const learned = valueInputs.learnValue(event.options, content[String(event.options.fieldId)])
				if (!learned) return undefined

				// Learn replaces the option set wholesale, so carry the existing options through -
				// returning only the learned value key would blank out overlayId and fieldId.
				return { ...event.options, ...learned }
			},
		},

		adjust_overlay_content_field: {
			name: 'Overlays - Adjust Content Field',
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
					command: decrement ? 'DecrementOverlayContentField' : 'IncrementOverlayContentField',
					id: String(event.options.overlayId),
					fieldId: String(event.options.fieldId),
					value: String(event.options.value),
				})
			},
		},

		toggle_overlay_content_field: {
			name: 'Overlays - Toggle Content Field',
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
					id: 'fieldId',
					type: 'dropdown',
					label: 'Field',
					choices: fieldChoices,
					default: fieldChoices[0]?.id ?? '',
					allowCustom: true,
				},
			],
			callback: async (event) => {
				await self.sendAndRefresh({
					command: 'ToggleOverlayContentField',
					id: String(event.options.overlayId),
					fieldId: String(event.options.fieldId),
				})
			},
		},

		exec_overlay_content_field: {
			name: 'Overlays - Execute Content Field',
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
					command: 'ExecuteOverlayContentField',
					id: String(event.options.overlayId),
					fieldId: String(event.options.fieldId),
					value: String(event.options.value),
				})
			},
		},
	}
}
