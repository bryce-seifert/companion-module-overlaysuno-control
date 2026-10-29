import type { CompanionActionDefinitions, SomeCompanionActionInputField } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import {
	buildFieldChoices,
	buildFieldValueInputs,
	escExpr,
	isContentField,
	isToggleField,
	matchStoredType,
} from '../fields.js'
import { controlSubChoices, controlSubModels, graphicSubs } from '../inferred-model.js'
import { ANIMATE_OUT_STATE, NUMERIC_FIELD_TYPES, VISIBLE_SUBCOMPOSITION_STATE } from '../types.js'
import { toFiniteNumber } from '../util.js'
import { modelChoices } from './shared.js'
import { supportedVisibilityActions } from './visibility.js'

export const ANIMATE_ACTIONS = [
	{ id: 'in', label: 'Animate In' },
	{ id: 'out', label: 'Animate Out' },
	{ id: 'toggle', label: 'Toggle' },
] as const

export type AnimateAction = (typeof ANIMATE_ACTIONS)[number]['id']

/** Animate In/Out drives graphics for apps without visibility commands; the others use those instead. */
export function usesAnimateActions(self: ModuleInstance): boolean {
	return graphicSubs(self).length > 0 && supportedVisibilityActions(self).length === 0
}

/**
 * Actions that drive the datastore directly (PATCH /control), for bespoke apps whose /api offers
 * no visibility or field commands. Only offered when GET /model described the app.
 */
export function getSubCompositionActions(self: ModuleInstance): CompanionActionDefinitions {
	return {
		...getAnimateActions(self),
		...getSubCompositionFieldActions(self),
	}
}

function getAnimateActions(self: ModuleInstance): CompanionActionDefinitions {
	if (!usesAnimateActions(self)) return {}

	const subChoices = controlSubChoices(self)

	return {
		subcomposition_animate: {
			name: 'Overlays - Animate In/Out',
			description: 'Graphics sharing a logic layer replace each other: animating one in takes the others out.',
			options: [
				{
					id: 'action',
					type: 'dropdown',
					label: 'Action',
					choices: ANIMATE_ACTIONS.map(({ id, label }) => ({ id, label })),
					default: 'toggle',
				},
				{
					id: 'subCompositionId',
					type: 'dropdown',
					label: 'Overlay',
					choices: subChoices,
					default: subChoices[0]?.id ?? '',
					allowCustom: false,
				},
			],
			callback: async (event) => {
				const subCompositionId = String(event.options.subCompositionId ?? '')
				if (!subCompositionId) return

				const action = event.options.action
				const animateIn = action === 'toggle' ? !self.isOverlayVisible(subCompositionId) : action === 'in'
				await self.sendControlPatch({
					subCompositionId,
					state: animateIn ? VISIBLE_SUBCOMPOSITION_STATE : ANIMATE_OUT_STATE,
				})
			},
		},
	}
}

/** Set / toggle actions for the fields /model describes; bespoke apps reject the generic field commands. */
function getSubCompositionFieldActions(self: ModuleInstance): CompanionActionDefinitions {
	// Apps with real overlay models already get the command-based field actions.
	if (self.overlayModels.length > 0) return {}

	const models = controlSubModels(self)
	const fields = models.flatMap((m) => m.model)
	const contentFields = fields.filter(isContentField)
	const toggleFields = fields.filter(isToggleField)
	if (contentFields.length === 0) return {}

	const subChoices = modelChoices(models)
	const subOption: SomeCompanionActionInputField = {
		id: 'subCompositionId',
		type: 'dropdown',
		label: 'Overlay',
		choices: subChoices,
		default: subChoices[0]?.id ?? '',
		allowCustom: false,
	}
	const valueInputs = buildFieldValueInputs(contentFields)
	const numericFieldIds = new Set(contentFields.filter((f) => NUMERIC_FIELD_TYPES.has(f.type)).map((f) => f.id))

	const storedValue = (subCompositionId: string, fieldId: string) =>
		self.overlayContent.get(subCompositionId)?.[fieldId]

	const actions: CompanionActionDefinitions = {
		subcomposition_set_field: {
			name: 'Overlays - Set Field',
			options: [
				subOption,
				{
					id: 'fieldId',
					type: 'dropdown',
					label: 'Field',
					choices: valueInputs.choices,
					default: valueInputs.choices[0]?.id ?? '',
					allowCustom: true,
				},
				...(numericFieldIds.size
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
							} satisfies SomeCompanionActionInputField,
						]
					: []),
				...valueInputs.valueOptions,
			],
			callback: async (event) => {
				const subCompositionId = String(event.options.subCompositionId ?? '')
				const fieldId = String(event.options.fieldId ?? '')
				if (!subCompositionId || !fieldId) return

				const isNumeric = numericFieldIds.has(fieldId)
				const stored = storedValue(subCompositionId, fieldId)
				const requested = valueInputs.resolveValue(event.options)
				const operation = event.options.operation

				// /control has no increment command, so step from the last known value.
				const value =
					isNumeric && (operation === 'increment' || operation === 'decrement')
						? toFiniteNumber(stored, 0) + (operation === 'increment' ? 1 : -1) * toFiniteNumber(requested, 1)
						: matchStoredType(requested, stored, isNumeric)

				await self.sendControlPatch({ subCompositionId, payload: { [fieldId]: value } })
			},
			learn: async (event) => {
				const values = await self.fetchLiveContent(String(event.options.subCompositionId))
				if (!values) return undefined

				const learned = valueInputs.learnValue(event.options, values[String(event.options.fieldId)])
				return learned ? { ...event.options, ...learned } : undefined
			},
		},
	}

	if (toggleFields.length > 0) {
		const toggleChoices = buildFieldChoices(toggleFields)
		actions.subcomposition_toggle_field = {
			name: 'Overlays - Toggle Field',
			options: [
				subOption,
				{
					id: 'fieldId',
					type: 'dropdown',
					label: 'Field',
					choices: toggleChoices,
					default: toggleChoices[0]?.id ?? '',
					allowCustom: true,
				},
			],
			callback: async (event) => {
				const subCompositionId = String(event.options.subCompositionId ?? '')
				const fieldId = String(event.options.fieldId ?? '')
				if (!subCompositionId || !fieldId) return

				const stored = storedValue(subCompositionId, fieldId)
				// Some apps store the flag as a string.
				const current = stored === true || stored === 'true'
				await self.sendControlPatch({ subCompositionId, payload: { [fieldId]: !current } })
			},
		}
	}

	return actions
}
