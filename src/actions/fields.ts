import type {
	CompanionActionDefinitions,
	CompanionOptionValues,
	SomeCompanionActionInputField,
} from '@companion-module/base'
import type { ApiPayload, OverlayModelField } from '../api.js'
import { buildFieldValueInputs, escExpr, NUMERIC_FIELD_TYPES } from '../fields.js'
import type { ModuleInstance } from '../main.js'
import type { DropdownChoice, JsonObject } from '../types.js'
import { EXECUTE_FUNCTION_CHOICES } from './shared.js'

export interface FieldActionConfig {
	fields: OverlayModelField[]
	targetOptions: SomeCompanionActionInputField[]
	actionIds: {
		set: string
		toggle: string
		execute: string
	}
	names: {
		set: string
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
	const numericFieldIds = [
		...new Set(config.fields.filter((field) => NUMERIC_FIELD_TYPES.has(field.type)).map((field) => field.id)),
	]
	const operationOptions: SomeCompanionActionInputField[] = numericFieldIds.length
		? [
				{
					id: 'operation',
					type: 'dropdown',
					label: 'Operation',
					choices: [
						{ id: 'set', label: 'Set' },
						{ id: 'increment', label: 'Increment' },
						{ id: 'decrement', label: 'Decrement' },
					],
					default: 'set',
					isVisibleExpression: numericFieldIds.map((id) => `$(options:fieldId) == '${escExpr(id)}'`).join(' || '),
				},
			]
		: []

	return {
		[config.actionIds.set]: {
			name: config.names.set,
			options: [...config.targetOptions, fieldOption(fieldChoices), ...operationOptions, ...valueInputs.valueOptions],
			callback: async (event) => {
				const operation = event.options.operation
				const command =
					numericFieldIds.includes(String(event.options.fieldId)) && operation === 'increment'
						? config.commands.increment
						: numericFieldIds.includes(String(event.options.fieldId)) && operation === 'decrement'
							? config.commands.decrement
							: config.commands.set

				await self.sendAndRefresh({
					...config.payloadFor(event.options),
					command,
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
