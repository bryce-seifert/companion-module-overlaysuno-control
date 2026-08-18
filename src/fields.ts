import type { InputValue, SomeCompanionFeedbackInputField, CompanionOptionValues } from '@companion-module/base'
import type { OverlayModelField } from './api.js'
import { ACTION_FIELD_TYPES, FieldType, NUMERIC_FIELD_TYPES, type DropdownChoice, type JsonValue } from './types.js'
import { expandEscapeSequences } from './util.js'
import { sanitizeName, normalizeColor, isRgbObject } from './variables.js'

export { ACTION_FIELD_TYPES, NUMERIC_FIELD_TYPES }

/** True for button / time-control fields that are triggered, not set. */
export function isActionField(field: OverlayModelField): boolean {
	return ACTION_FIELD_TYPES.has(field.type)
}

/** True for fields that hold content values (everything except action fields). */
export function isContentField(field: OverlayModelField): boolean {
	return !isActionField(field)
}

/** Escape a string so it can be embedded in a Companion expression single-quoted literal. */
export function escExpr(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** Parse an overlays.uno hex color (e.g. "ffde00" or "#ffde00") into a Companion color number. */
export function hexToColorNumber(hex: string): number {
	const clean = hex.replace(/^#/, '')
	const n = parseInt(clean, 16)
	return Number.isNaN(n) ? 0 : n & 0xffffff
}

/** Coerce a color field default (hex string or {r,g,b}) into a Companion color number. */
function colorDefaultAsNumber(value: JsonValue): number {
	const hex = normalizeColor(value, FieldType.Color)
	return typeof hex === 'string' ? hexToColorNumber(hex) : 0
}

/** Format a Companion color number as an overlays.uno hex string, e.g. "#ffde00". */
function colorNumberToHex(n: number): string {
	return `#${((n >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`
}

/** Format a field identifier for display, e.g. "winsColor" or "wins_color" -> "Wins Color". */
function fieldIdLabel(id: string): string {
	return id
		.trim()
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.replace(/\b\w/g, (character) => character.toUpperCase())
}

/** Dropdown / button label for a field, using its identifier to distinguish generic duplicate titles. */
export function fieldChoiceLabel(field: OverlayModelField): string {
	return fieldIdLabel(field.id) || field.title
}

/**
 * Build a deduped, labeled field selector from the given fields, optionally
 * restricted by `predicate`. Falls back to a placeholder when nothing matches.
 */
export function buildFieldChoices(
	fields: OverlayModelField[],
	predicate?: (field: OverlayModelField) => boolean,
	emptyLabel = 'No fields loaded',
): DropdownChoice[] {
	const choices: DropdownChoice[] = []
	const seen = new Set<string>()

	for (const field of fields) {
		if (seen.has(field.id)) continue
		seen.add(field.id)
		if (predicate && !predicate(field)) continue
		choices.push({ id: field.id, label: fieldChoiceLabel(field) })
	}

	choices.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
	if (choices.length === 0) choices.push({ id: '', label: emptyLabel })
	return choices
}

/** For a "set field" action, describe which option key holds the value. */
export function fieldSetOption(field: OverlayModelField): { optionId: string; value: InputValue } {
	if (field.type === FieldType.Checkbox) {
		return { optionId: 'value_boolean', value: field.defaultValue === true }
	}
	if (field.type === FieldType.Color) {
		return { optionId: 'value_color', value: colorDefaultAsNumber(field.defaultValue) }
	}
	if (field.type === FieldType.Selection && field.selections?.length) {
		const value = (field.defaultValue ?? field.selections[0]?.id ?? '') as InputValue
		return { optionId: `value_sel_${sanitizeName(field.id)}`, value }
	}

	const raw = field.defaultValue
	const value = typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean' ? raw : ''
	return { optionId: 'value', value }
}

export interface FieldValueInputs {
	/** Dropdown choices for the field selector. */
	choices: DropdownChoice[]
	/** Value option(s) whose editor matches the selected field's type. */
	valueOptions: SomeCompanionFeedbackInputField[]
	/** Read the correct value out of the options based on the selected field's type. */
	resolveValue: (options: CompanionOptionValues) => string | number | boolean
	/**
	 * Inverse of resolveValue: given the field's live value from the API,
	 * produce the option patch Learn should apply.
	 */
	learnValue: (options: CompanionOptionValues, live: JsonValue | undefined) => CompanionOptionValues | undefined
}

interface CategorizedFields {
	choices: DropdownChoice[]
	typeById: Map<string, string>
	selectionFields: OverlayModelField[]
	checkboxIds: string[]
	colorFields: OverlayModelField[]
}

function categorizeFields(fields: OverlayModelField[]): CategorizedFields {
	const choices: DropdownChoice[] = []
	const seen = new Set<string>()
	const typeById = new Map<string, string>()
	const selectionFields: OverlayModelField[] = []
	const checkboxIds: string[] = []
	const colorFields: OverlayModelField[] = []

	for (const field of fields) {
		if (seen.has(field.id)) continue
		seen.add(field.id)
		choices.push({ id: field.id, label: fieldChoiceLabel(field) })
		typeById.set(field.id, field.type)

		if (field.type === FieldType.Selection && field.selections?.length) {
			selectionFields.push(field)
		} else if (field.type === FieldType.Checkbox) {
			checkboxIds.push(field.id)
		} else if (field.type === FieldType.Color) {
			colorFields.push(field)
		}
	}

	choices.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
	if (choices.length === 0) {
		choices.push({ id: '', label: 'No fields loaded' })
	}

	return { choices, typeById, selectionFields, checkboxIds, colorFields }
}

function buildValueOptions(
	categorized: CategorizedFields,
	selectionOptionId: Map<string, string>,
): SomeCompanionFeedbackInputField[] {
	const { checkboxIds, colorFields, selectionFields } = categorized
	const colorIds = colorFields.map((f) => f.id)
	const typedIds = [...checkboxIds, ...colorIds, ...selectionFields.map((f) => f.id)]
	const valueOptions: SomeCompanionFeedbackInputField[] = []

	// Text fallback — shown for text/number/etc. and any custom field id.
	valueOptions.push({
		id: 'value',
		type: 'textinput',
		label: 'Value',
		default: '',
		useVariables: true,
		isVisibleExpression: typedIds.length
			? typedIds.map((id) => `$(options:fieldId) != '${escExpr(id)}'`).join(' && ')
			: undefined,
	})

	if (checkboxIds.length) {
		valueOptions.push({
			id: 'value_boolean',
			type: 'checkbox',
			label: 'Value',
			default: false,
			isVisibleExpression: checkboxIds.map((id) => `$(options:fieldId) == '${escExpr(id)}'`).join(' || '),
		})
	}

	if (colorFields.length) {
		valueOptions.push({
			id: 'value_color',
			type: 'colorpicker',
			label: 'Color',
			returnType: 'number',
			default: colorDefaultAsNumber(colorFields[0]?.defaultValue ?? null),
			isVisibleExpression: colorIds.map((id) => `$(options:fieldId) == '${escExpr(id)}'`).join(' || '),
		})
	}

	for (const field of selectionFields) {
		const optionId = selectionOptionId.get(field.id)
		if (!optionId) continue

		valueOptions.push({
			id: optionId,
			type: 'dropdown',
			label: `Value - ${field.title}`,
			default: field.selections?.[0]?.id ?? '',
			choices: (field.selections ?? []).map((s) => ({ id: s.id, label: s.title })),
			allowCustom: true,
			isVisibleExpression: `$(options:fieldId) == '${escExpr(field.id)}'`,
		})
	}

	return valueOptions
}

function createResolveValue(
	typeById: Map<string, string>,
	selectionOptionId: Map<string, string>,
): FieldValueInputs['resolveValue'] {
	return (options) => {
		const fieldId = String(options.fieldId ?? '')
		const type = typeById.get(fieldId)

		if (type === FieldType.Checkbox) {
			return options.value_boolean === true
		}

		if (type === FieldType.Color) {
			const raw = options.value_color
			if (typeof raw === 'number') return colorNumberToHex(raw)
			// Stale action or custom value — pass through a hex/string as-is.
			if (typeof raw === 'string' && raw) return raw
			return String(options.value ?? '')
		}

		if (type === FieldType.Selection) {
			const optionId = selectionOptionId.get(fieldId)
			const raw = optionId ? options[optionId] : undefined
			if (typeof raw === 'string') return raw
			if (typeof raw === 'number' || typeof raw === 'boolean') return raw
			// Option was never initialized (e.g. action placed before this option existed).
			return String(options.value ?? '')
		}

		return expandEscapeSequences(String(options.value ?? ''))
	}
}

function createLearnValue(
	typeById: Map<string, string>,
	selectionOptionId: Map<string, string>,
): FieldValueInputs['learnValue'] {
	return (options, live) => {
		if (live === undefined || live === null) return undefined

		const fieldId = String(options.fieldId ?? '')
		const type = typeById.get(fieldId)

		if (type === FieldType.Checkbox) {
			return { value_boolean: live === true }
		}

		if (type === FieldType.Color) {
			// Datastore stores colours as {r,g,b,a} or bare hex; normalize before the picker.
			const hex = normalizeColor(live, FieldType.Color)
			if (typeof hex !== 'string') return undefined
			return { value_color: hexToColorNumber(hex) }
		}

		if (type === FieldType.Selection) {
			const optionId = selectionOptionId.get(fieldId)
			if (!optionId) return undefined
			if (typeof live === 'string' || typeof live === 'number' || typeof live === 'boolean') {
				return { [optionId]: live }
			}
			return undefined
		}

		// Bespoke apps have no model, so `type` is undefined — learn RGB into the text input.
		if (isRgbObject(live)) {
			return { value: String(normalizeColor(live)) }
		}

		if (typeof live === 'string' || typeof live === 'number' || typeof live === 'boolean') {
			return { value: String(live) }
		}

		// Structured values (gradient, font spec) round-trip as JSON.
		return { value: JSON.stringify(live) }
	}
}

/**
 * Build a field selector plus type-aware value editor(s) for "set field" actions.
 * Only the editor matching the currently selected field is shown via `isVisibleExpression`.
 */
export function buildFieldValueInputs(fields: OverlayModelField[]): FieldValueInputs {
	const categorized = categorizeFields(fields)

	// Stable option id per selection field (field ids can contain spaces/symbols).
	const selectionOptionId = new Map<string, string>()
	for (const field of categorized.selectionFields) {
		selectionOptionId.set(field.id, fieldSetOption(field).optionId)
	}

	return {
		choices: categorized.choices,
		valueOptions: buildValueOptions(categorized, selectionOptionId),
		resolveValue: createResolveValue(categorized.typeById, selectionOptionId),
		learnValue: createLearnValue(categorized.typeById, selectionOptionId),
	}
}
