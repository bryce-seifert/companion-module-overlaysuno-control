import type { InputValue, SomeCompanionFeedbackInputField, CompanionOptionValues } from '@companion-module/base'
import type { OverlayModelField } from './api.js'
import { sanitizeName, normalizeColor, isRgbObject } from './variables.js'

// Escape a string so it can be embedded in a Companion expression single-quoted literal.
export function escExpr(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

// Parse an overlays.uno hex color (e.g. "ffde00" or "#ffde00") into a Companion color number.
export function hexToColorNumber(hex: string): number {
	const clean = hex.replace(/^#/, '')
	const n = parseInt(clean, 16)
	return Number.isNaN(n) ? 0 : n & 0xffffff
}

// Coerce a color field default (hex string or {r,g,b}) into a Companion color number.
function colorDefaultAsNumber(value: unknown): number {
	const hex = normalizeColor(value, 'color')
	return typeof hex === 'string' ? hexToColorNumber(hex) : 0
}

// Format a Companion color number as an overlays.uno hex string, e.g. "#ffde00".
function colorNumberToHex(n: number): string {
	return `#${((n >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`
}

// Human-readable suffix for a field type, so fields with duplicate titles are distinguishable.
function fieldTypeLabel(type: string): string {
	switch (type) {
		case 'color':
			return 'Color'
		case 'checkbox':
			return 'Toggle'
		case 'selection':
			return 'Options'
		case 'metricfont':
			return 'Font'
		case 'number':
		case 'counter':
		case 'normalizednumber':
			return 'Number'
		case 'button':
			return 'Button'
		case 'timecontrol':
			return 'Time'
		default:
			return ''
	}
}

// Dropdown label for a field: its title plus a type hint (e.g. "Title (Color)").
function fieldChoiceLabel(field: OverlayModelField): string {
	const suffix = fieldTypeLabel(field.type)
	return suffix ? `${field.title} (${suffix})` : field.title
}

// Field types that support numeric increment/decrement.
export const NUMERIC_FIELD_TYPES = new Set(['number', 'counter', 'normalizednumber'])

// Build a deduped, labeled field selector from the given fields, optionally
// restricted to fields matching `predicate` (e.g. only numeric fields for
// increment/decrement). Falls back to a placeholder when nothing matches.
export function buildFieldChoices(
	fields: OverlayModelField[],
	predicate?: (field: OverlayModelField) => boolean,
	emptyLabel = 'No fields loaded',
): { id: string; label: string }[] {
	const choices: { id: string; label: string }[] = []
	const seen = new Set<string>()
	for (const field of fields) {
		if (seen.has(field.id)) continue
		seen.add(field.id)
		if (predicate && !predicate(field)) continue
		choices.push({ id: field.id, label: fieldChoiceLabel(field) })
	}
	if (choices.length === 0) choices.push({ id: '', label: emptyLabel })
	return choices
}

// For a "set field" action, describe which option key holds the value
export function fieldSetOption(field: OverlayModelField): { optionId: string; value: InputValue } {
	if (field.type === 'checkbox') {
		return { optionId: 'value_boolean', value: field.defaultValue === true }
	}
	if (field.type === 'color') {
		return { optionId: 'value_color', value: colorDefaultAsNumber(field.defaultValue) }
	}
	if (field.type === 'selection' && field.selections?.length) {
		const value = (field.defaultValue ?? field.selections[0]?.id ?? '') as InputValue
		return { optionId: `value_sel_${sanitizeName(field.id)}`, value }
	}
	const raw = field.defaultValue
	const value = typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean' ? raw : ''
	return { optionId: 'value', value }
}

export interface FieldValueInputs {
	// Dropdown choices for the field selector.
	choices: { id: string; label: string }[]
	// Value option(s) whose editor matches the selected field's type.
	valueOptions: SomeCompanionFeedbackInputField[]
	// Read the correct value out of the options based on the selected field's type.
	resolveValue: (options: CompanionOptionValues) => string | number | boolean
	// Inverse of resolveValue: given the field's live value from the API
	learnValue: (options: CompanionOptionValues, live: unknown) => CompanionOptionValues | undefined
}

// Build a field selector plus type-aware value editor(s) for "set field" actions.
// Selection (enum) fields get a dropdown of their allowed values, checkbox/toggle
// fields get a checkbox, and everything else falls back to a variable-enabled text
// input. Only the editor matching the currently selected field is shown, via
// `isVisibleExpression`.
export function buildFieldValueInputs(fields: OverlayModelField[]): FieldValueInputs {
	const choices: { id: string; label: string }[] = []
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
		if (field.type === 'selection' && field.selections?.length) {
			selectionFields.push(field)
		} else if (field.type === 'checkbox') {
			checkboxIds.push(field.id)
		} else if (field.type === 'color') {
			colorFields.push(field)
		}
	}
	if (choices.length === 0) {
		choices.push({ id: '', label: 'No fields loaded' })
	}

	// Stable option id per selection field (field ids can contain spaces/symbols).
	const selectionOptionId = new Map<string, string>()
	selectionFields.forEach((field) => selectionOptionId.set(field.id, fieldSetOption(field).optionId))

	const colorIds = colorFields.map((f) => f.id)
	const typedIds = [...checkboxIds, ...colorIds, ...selectionFields.map((f) => f.id)]
	const valueOptions: SomeCompanionFeedbackInputField[] = []

	// Text fallback - shown for text/number/color/etc. and any custom field id.
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
			default: colorDefaultAsNumber(colorFields[0]?.defaultValue),
			isVisibleExpression: colorIds.map((id) => `$(options:fieldId) == '${escExpr(id)}'`).join(' || '),
		})
	}

	for (const field of selectionFields) {
		const optionId = selectionOptionId.get(field.id) as string
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

	const resolveValue = (options: CompanionOptionValues): string | number | boolean => {
		const fieldId = String(options.fieldId ?? '')
		const type = typeById.get(fieldId)
		if (type === 'checkbox') {
			return options.value_boolean === true
		}
		if (type === 'color') {
			const raw = options.value_color
			if (typeof raw === 'number') return colorNumberToHex(raw)
			// Stale action or custom value - pass through a hex/string as-is.
			if (typeof raw === 'string' && raw) return raw
			return String(options.value ?? '')
		}
		if (type === 'selection') {
			const optionId = selectionOptionId.get(fieldId)
			const raw = optionId ? options[optionId] : undefined
			if (typeof raw === 'string') return raw
			if (typeof raw === 'number' || typeof raw === 'boolean') return raw
			// Option was never initialized (e.g. an action placed before this option existed).
			return String(options.value ?? '')
		}
		return String(options.value ?? '')
	}

	const learnValue = (options: CompanionOptionValues, live: unknown): CompanionOptionValues | undefined => {
		if (live === undefined || live === null) return undefined

		const fieldId = String(options.fieldId ?? '')
		const type = typeById.get(fieldId)

		if (type === 'checkbox') {
			return { value_boolean: live === true }
		}
		if (type === 'color') {
			// The datastore stores colours raw ({r,g,b,a} on some apps, bare hex on others);
			// normalizeColor() collapses those to "#rrggbb" before the picker's number form.
			const hex = normalizeColor(live, 'color')
			if (typeof hex !== 'string') return undefined
			return { value_color: hexToColorNumber(hex) }
		}
		if (type === 'selection') {
			const optionId = selectionOptionId.get(fieldId)
			if (!optionId) return undefined
			if (typeof live === 'string' || typeof live === 'number' || typeof live === 'boolean') {
				return { [optionId]: live }
			}
			return undefined
		}

		// A color on an app with no model (bespoke apps 400 on GetOverlayModels, so `type` is
		// undefined for every field). There's no color picker option registered for it, so learn
		// the normalized hex into the text input instead
		if (isRgbObject(live)) {
			return { value: String(normalizeColor(live)) }
		}

		// Text fallback, and any custom field id the model doesn't know about.
		if (typeof live === 'string' || typeof live === 'number' || typeof live === 'boolean') {
			return { value: String(live) }
		}
		// Structured values (a gradient, a font spec) round-trip as JSON
		return { value: JSON.stringify(live) }
	}

	return { choices, valueOptions, resolveValue, learnValue }
}
