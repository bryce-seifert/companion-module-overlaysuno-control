import type {
	CompanionActionDefinitions,
	CompanionOptionValues,
	SomeCompanionActionInputField,
} from '@companion-module/base'
import type { ApiPayload, OverlayModelField } from '../api.js'
import { buildFieldChoices, buildFieldValueInputs, NUMERIC_FIELD_TYPES } from '../fields.js'
import type { ModuleInstance } from '../main.js'
import type { DropdownChoice, JsonObject } from '../types.js'
import { EXECUTE_FUNCTION_CHOICES } from './shared.js'

export interface FieldActionConfig {
	fields: OverlayModelField[]
	targetOptions: SomeCompanionActionInputField[]
	actionIds: {
		set: string
		adjust: string
		toggle: string
		execute: string
	}
	names: {
		set: string
		adjust: string
		toggle: string
		execute: string
	}
	commands: {
		set: string
		increment: string
		decrement: string
		toggle: string
		execute: string
	}
	payloadFor: (options: CompanionOptionValues) => ApiPayload
	fetchValues: (options: CompanionOptionValues) => Promise<JsonObject | undefined>
}

function fieldOption(choices: DropdownChoice[]): SomeCompanionActionInputField {
	return {
		id: 'fieldId',
		type: 'dropdown',
		label: 'Field',
		choices,
		default: choices[0]?.id ?? '',
		allowCustom: true,
	}
}

export function buildFieldActions(self: ModuleInstance, config: FieldActionConfig): CompanionActionDefinitions {
	const valueInputs = buildFieldValueInputs(config.fields)
	const fieldChoices = valueInputs.choices
	const numericChoices = buildFieldChoices(
		config.fields,
		(field) => NUMERIC_FIELD_TYPES.has(field.type),
		'No numeric fields',
	)

	return {
		[config.actionIds.set]: {
			name: config.names.set,
			options: [...config.targetOptions, fieldOption(fieldChoices), ...valueInputs.valueOptions],
			callback: async (event) => {
				await self.sendAndRefresh({
					...config.payloadFor(event.options),
					command: config.commands.set,
					fieldId: String(event.options.fieldId),
					value: valueInputs.resolveValue(event.options),
				})
			},
			learn: async (event) => {
				const values = await config.fetchValues(event.options)
				if (!values) return undefined

				const learned = valueInputs.learnValue(event.options, values[String(event.options.fieldId)])
				return learned ? { ...event.options, ...learned } : undefined
			},
		},
		[config.actionIds.adjust]: {
			name: config.names.adjust,
			options: [
				...config.targetOptions,
				fieldOption(numericChoices),
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
				const command = event.options.direction === 'decrement' ? config.commands.decrement : config.commands.increment
				await self.sendAndRefresh({
					...config.payloadFor(event.options),
					command,
					fieldId: String(event.options.fieldId),
					value: String(event.options.value),
				})
			},
		},
		[config.actionIds.toggle]: {
			name: config.names.toggle,
			options: [...config.targetOptions, fieldOption(fieldChoices)],
			callback: async (event) => {
				await self.sendAndRefresh({
					...config.payloadFor(event.options),
					command: config.commands.toggle,
					fieldId: String(event.options.fieldId),
				})
			},
		},
		[config.actionIds.execute]: {
			name: config.names.execute,
			options: [
				...config.targetOptions,
				fieldOption(fieldChoices),
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
					...config.payloadFor(event.options),
					command: config.commands.execute,
					fieldId: String(event.options.fieldId),
					value: String(event.options.value),
				})
			},
		},
	}
}
