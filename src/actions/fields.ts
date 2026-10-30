import type {
	CompanionActionDefinitions,
	CompanionOptionValues,
	SomeCompanionActionInputField,
} from '@companion-module/base'
import type { OverlayModelField } from '../api.js'
import {
	buildFieldChoices,
	buildFieldValueInputs,
	escExpr,
	isActionField,
	isToggleField,
	isWritableField,
	matchStoredType,
	NUMERIC_FIELD_TYPES,
} from '../fields.js'
import type { DropdownChoice } from '../types.js'
import type { FieldWriter } from '../writers.js'
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
	/** The writer's target id for an action's options. */
	targetOf: (options: CompanionOptionValues) => string
	writer: FieldWriter
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
export function buildFieldActions(config: FieldActionConfig): CompanionActionDefinitions {
	const actions: CompanionActionDefinitions = {}
	const { writer, targetOf } = config
	const contentFields = config.fields.filter(isWritableField)
	const toggleFields = config.fields.filter(isToggleField)
	const actionFields = writer.execute ? config.fields.filter(isActionField) : []
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
				const targetId = targetOf(event.options)
				const fieldId = String(event.options.fieldId)
				const isNumeric = numericFieldIds.has(fieldId)
				const requested = valueInputs.resolveValue(event.options)
				const operation = event.options.operation

				if (isNumeric && (operation === 'increment' || operation === 'decrement')) {
					// A step, so the field's stored type doesn't apply.
					await writer.adjust(targetId, fieldId, operation, matchStoredType(requested, undefined, true))
					return
				}
				await writer.set(targetId, fieldId, matchStoredType(requested, writer.stored(targetId, fieldId), isNumeric))
			},
			learn: async (event) => {
				const values = await writer.fetchValues(targetOf(event.options))
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
				await writer.toggle(targetOf(event.options), String(event.options.fieldId))
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
				await writer.execute?.(targetOf(event.options), String(event.options.fieldId), String(event.options.value))
			},
		}
	}

	return actions
}
