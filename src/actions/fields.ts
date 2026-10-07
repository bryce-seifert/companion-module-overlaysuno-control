import type {
	CompanionActionDefinitions,
	CompanionOptionValues,
	SomeCompanionActionInputField,
} from '@companion-module/base'
import type { ApiPayload, OverlayModelField } from '../api.js'
import {
	buildFieldChoices,
	buildFieldValueInputs,
	escExpr,
	isActionField,
	isContentField,
	isToggleField,
	matchStoredType,
	NUMERIC_FIELD_TYPES,
} from '../fields.js'
import type { CommandTarget, ModuleInstance } from '../main.js'
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
	/** Where the command's response payload should be applied. */
	targetFor: (options: CompanionOptionValues) => CommandTarget
	/** Last polled values for the target, used to keep each field's stored JSON type. */
	cachedValues: (options: CompanionOptionValues) => JsonObject | undefined
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

/** Set / toggle / execute actions for a model's fields. Kinds with no eligible fields are left out. */
export function buildFieldActions(self: ModuleInstance, config: FieldActionConfig): CompanionActionDefinitions {
	const actions: CompanionActionDefinitions = {}
	const contentFields = config.fields.filter(isContentField)
	const numericFieldIds = new Set(
		contentFields.filter((field) => NUMERIC_FIELD_TYPES.has(field.type)).map((field) => field.id),
	)

	if (contentFields.length > 0) {
		const valueInputs = buildFieldValueInputs(contentFields)
		const operationOptions: SomeCompanionActionInputField[] = numericFieldIds.size
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
						isVisibleExpression: [...numericFieldIds]
							.map((id) => `$(options:fieldId) == '${escExpr(id)}'`)
							.join(' || '),
					},
				]
			: []

		actions[config.actionIds.set] = {
			name: config.names.set,
			options: [
				...config.targetOptions,
				fieldOption(valueInputs.choices),
				...operationOptions,
				...valueInputs.valueOptions,
			],
			callback: async (event) => {
				const fieldId = String(event.options.fieldId)
				const isNumeric = numericFieldIds.has(fieldId)
				const operation = isNumeric ? event.options.operation : 'set'
				const value = valueInputs.resolveValue(event.options)
				const command =
					operation === 'increment'
						? config.commands.increment
						: operation === 'decrement'
							? config.commands.decrement
							: config.commands.set

				await self.sendAndRefresh(
					{
						...config.payloadFor(event.options),
						command,
						fieldId,
						value:
							command === config.commands.set
								? matchStoredType(value, config.cachedValues(event.options)?.[fieldId], isNumeric)
								: matchStoredType(value, undefined, true),
					},
					config.targetFor(event.options),
				)
			},
			learn: async (event) => {
				const values = await config.fetchValues(event.options)
				if (!values) return undefined

				const learned = valueInputs.learnValue(event.options, values[String(event.options.fieldId)])
				return learned ? { ...event.options, ...learned } : undefined
			},
		}
	}

	const toggleChoices = buildFieldChoices(config.fields, isToggleField, 'No toggle fields')
	if (config.fields.some(isToggleField)) {
		actions[config.actionIds.toggle] = {
			name: config.names.toggle,
			options: [...config.targetOptions, fieldOption(toggleChoices)],
			callback: async (event) => {
				await self.sendAndRefresh(
					{
						...config.payloadFor(event.options),
						command: config.commands.toggle,
						fieldId: String(event.options.fieldId),
					},
					config.targetFor(event.options),
				)
			},
		}
	}

	const actionChoices = buildFieldChoices(config.fields, isActionField, 'No action fields')
	if (config.fields.some(isActionField)) {
		actions[config.actionIds.execute] = {
			name: config.names.execute,
			options: [
				...config.targetOptions,
				fieldOption(actionChoices),
				{
					id: 'value',
					type: 'dropdown',
					label: 'Function',
					choices: EXECUTE_FUNCTION_CHOICES,
					default: 'execute',
				},
			],
			callback: async (event) => {
				await self.sendAndRefresh(
					{
						...config.payloadFor(event.options),
						command: config.commands.execute,
						fieldId: String(event.options.fieldId),
						value: String(event.options.value),
					},
					config.targetFor(event.options),
				)
			},
		}
	}

	return actions
}
