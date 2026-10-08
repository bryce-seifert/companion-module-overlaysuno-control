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

/** Set / toggle / execute actions for a model's fields. Kinds with no eligible fields are left out. */
export function buildFieldActions(self: ModuleInstance, config: FieldActionConfig): CompanionActionDefinitions {
	const actions: CompanionActionDefinitions = {}
	const contentFields = config.fields.filter(isContentField)
	const toggleFields = config.fields.filter(isToggleField)
	const actionFields = config.fields.filter(isActionField)
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
				const requested = event.options.operation
				const operation = isNumeric && (requested === 'increment' || requested === 'decrement') ? requested : 'set'
				const payload: ApiPayload = {
					...config.payloadFor(event.options),
					command: config.commands[operation],
					fieldId,
				}
				// Increment/decrement send a step, so the field's stored type doesn't apply.
				const stored = operation === 'set' ? self.storedFieldValue(payload) : undefined

				await self.sendAndRefresh({
					...payload,
					value: matchStoredType(valueInputs.resolveValue(event.options), stored, isNumeric),
				})
			},
			learn: async (event) => {
				const values = await config.fetchValues(event.options)
				if (!values) return undefined

				const learned = valueInputs.learnValue(event.options, values[String(event.options.fieldId)])
				return learned ? { ...event.options, ...learned } : undefined
			},
		}
	}

	if (toggleFields.length > 0) {
		actions[config.actionIds.toggle] = {
			name: config.names.toggle,
			options: [...config.targetOptions, fieldOption(buildFieldChoices(toggleFields))],
			callback: async (event) => {
				await self.sendAndRefresh({
					...config.payloadFor(event.options),
					command: config.commands.toggle,
					fieldId: String(event.options.fieldId),
				})
			},
		}
	}

	if (actionFields.length > 0) {
		actions[config.actionIds.execute] = {
			name: config.names.execute,
			options: [
				...config.targetOptions,
				fieldOption(buildFieldChoices(actionFields)),
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
		}
	}

	return actions
}
