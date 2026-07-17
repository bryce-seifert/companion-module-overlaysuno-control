import type { CompanionVariableDefinition } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import { isSubCompositionVisible, hasPayload } from './api.js'

export function sanitizeName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '')
}

export type VariableValue = string | number | boolean

const HEX6 = /^#?[0-9a-f]{6}$/i

// An {r,g,b} colour object. Unambiguous, so it's treated as a colour with or without a model.
export function isRgbObject(value: unknown): value is { r: number; g: number; b: number } {
	if (typeof value !== 'object' || value === null) return false
	const o = value as Record<string, unknown>
	return typeof o.r === 'number' && typeof o.g === 'number' && typeof o.b === 'number'
}

function hexByte(n: number): string {
	return Math.max(0, Math.min(255, Math.round(n)))
		.toString(16)
		.padStart(2, '0')
}

// Normalize a color to "#rrggbb"
export function normalizeColor(value: unknown, fieldType?: string): unknown {
	if (isRgbObject(value)) {
		return `#${hexByte(value.r)}${hexByte(value.g)}${hexByte(value.b)}`
	}
	if (fieldType?.toLowerCase() === 'color' && typeof value === 'string' && HEX6.test(value)) {
		return `#${value.replace('#', '').toLowerCase()}`
	}
	return value
}

// Format a field value for display. Objects are JSON-encoded.
function formatValue(value: unknown): VariableValue {
	if (value === null || value === undefined) return ''
	if (typeof value === 'boolean') return value ? 'On' : 'Off'
	if (typeof value === 'string' || typeof value === 'number') return value
	return JSON.stringify(value)
}

interface VariableEntry {
	variableId: string
	name: string
	value: VariableValue | undefined
}

function buildVariableEntries(self: ModuleInstance): VariableEntry[] {
	const entries: VariableEntry[] = []
	const seen = new Set<string>()

	function add(variableId: string, name: string, value: VariableValue | undefined): void {
		if (seen.has(variableId)) {
			self.log('warn', `Duplicate variable id "${variableId}" ("${name}") - skipping`)
			return
		}
		seen.add(variableId)
		entries.push({ variableId, name, value })
	}

	add('overlay_count', 'Overlays - Total Count', self.overlayList.length)

	for (const overlay of self.overlayList) {
		const safeName = sanitizeName(overlay.name)
		const visible = self.overlayVisibility.get(overlay.id)
		add(
			`overlay_${safeName}_visibility`,
			`Overlay - ${overlay.name} - Visible`,
			self.overlayVisibility.has(overlay.id) ? (visible ? 'true' : 'false') : undefined,
		)
	}

	// Global visibility variable for single-overlay apps (like Lucky Draw)
	if (self.overlayList.length === 0 && self.overlayVisibility.has('global')) {
		const visible = self.overlayVisibility.get('global')
		add('overlay_visible', 'Overlay Visible', visible ? 'true' : 'false')
	}

	// Per-overlay content field variables (driven by overlay models)
	for (const model of self.overlayModels) {
		const safeOverlayName = sanitizeName(model.name)
		const content = self.overlayContent.get(model.id) ?? {}

		for (const field of model.model) {
			const safeFieldName = sanitizeName(field.id)
			add(
				`overlay_${safeOverlayName}_${safeFieldName}`,
				`Overlay - ${model.name} - ${field.title}`,
				formatValue(normalizeColor(content[field.id], field.type)),
			)
		}
	}

	// Subcompositions with no model behind them
	const modelledIds = new Set(self.overlayModels.map((m) => m.id))

	// Subcomposition names are not unique in a bespoke app
	const nameCounts = new Map<string, number>()
	function uniqueName(subCompositionName: string): { id: string; label: string } {
		const base = sanitizeName(subCompositionName)
		const n = (nameCounts.get(base) ?? 0) + 1
		nameCounts.set(base, n)
		return n === 1
			? { id: base, label: subCompositionName }
			: { id: `${base}_${n}`, label: `${subCompositionName} (${n})` }
	}

	for (const sub of self.controlState) {
		if (sub.mainComposition || modelledIds.has(sub.subCompositionId)) continue
		// Skip internal composition layers (infoLine, nameLogoScore, ...). They carry no data
		// of their own, so all they'd contribute is a visibility variable nobody asked for.
		if (!hasPayload(sub)) continue

		const { id: safeName, label } = uniqueName(sub.subCompositionName)
		add(
			`overlay_${safeName}_visibility`,
			`Overlay - ${label} - Visible`,
			isSubCompositionVisible(sub) ? 'true' : 'false',
		)

		for (const [fieldId, value] of Object.entries(sub.payload ?? {})) {
			add(
				`overlay_${safeName}_${sanitizeName(fieldId)}`,
				`Overlay - ${label} - ${fieldId}`,
				formatValue(normalizeColor(value)),
			)
		}
	}

	// Customization field variables
	if (self.customizationModel) {
		for (const field of self.customizationModel.model) {
			const safeFieldName = sanitizeName(field.id)
			add(
				`customize_${safeFieldName}`,
				`Customize - ${field.title}`,
				formatValue(normalizeColor(self.customizationValues[field.id], field.type)),
			)
		}
	} else {
		// No customization model (bespoke app) - fall back to the raw mainComposition keys.
		for (const [fieldId, value] of Object.entries(self.customizationValues)) {
			add(`customize_${sanitizeName(fieldId)}`, `Customize - ${fieldId}`, formatValue(normalizeColor(value)))
		}
	}

	return entries
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const variables: CompanionVariableDefinition[] = buildVariableEntries(self).map(({ variableId, name }) => ({
		variableId,
		name,
	}))

	self.log('debug', `Registering ${variables.length} variables: ${JSON.stringify(variables.map((v) => v.variableId))}`)
	self.setVariableDefinitions(variables)
}

// Push variable values, sending only the ones that actually changed since the last push.
// `force` re-sends everything - use it when the definitions were just rebuilt
export function UpdateVariableValues(self: ModuleInstance, force = false): void {
	const values: Record<string, VariableValue | undefined> = {}
	for (const entry of buildVariableEntries(self)) {
		values[entry.variableId] = entry.value
	}

	const changed = force
		? values
		: Object.fromEntries(Object.entries(values).filter(([id, value]) => self.lastVariableValues[id] !== value))

	self.lastVariableValues = values

	const count = Object.keys(changed).length
	if (count === 0) return

	self.log('debug', `Updating ${count} changed variable value(s)`)
	self.setVariableValues(changed)
}
