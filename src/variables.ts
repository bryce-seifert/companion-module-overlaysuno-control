import type { CompanionVariableDefinition } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import { FieldType, GLOBAL_OVERLAY_ID, type JsonValue } from './types.js'
import { isPlainObject } from './util.js'

export function sanitizeName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '')
}

export type VariableValue = string | number | boolean

const HEX6 = /^#?[0-9a-f]{6}$/i

export interface RgbColor {
	r: number
	g: number
	b: number
}

/** An {r,g,b} colour object — unambiguous, so treated as colour with or without a model. */
export function isRgbObject(value: unknown): value is RgbColor {
	if (!isPlainObject(value)) return false
	return typeof value.r === 'number' && typeof value.g === 'number' && typeof value.b === 'number'
}

function hexByte(n: number): string {
	return Math.max(0, Math.min(255, Math.round(n)))
		.toString(16)
		.padStart(2, '0')
}

/** Normalize a color to "#rrggbb" when recognisable; otherwise return the value unchanged. */
export function normalizeColor(value: JsonValue | unknown, fieldType?: string): JsonValue | unknown {
	if (isRgbObject(value)) {
		return `#${hexByte(value.r)}${hexByte(value.g)}${hexByte(value.b)}`
	}
	if (fieldType === FieldType.Color && typeof value === 'string' && HEX6.test(value)) {
		return `#${value.replace('#', '').toLowerCase()}`
	}
	return value
}

/** Format a field value for Companion variable display. Objects are JSON-encoded. */
function formatValue(value: unknown): VariableValue {
	if (value === null || value === undefined) return ''
	if (typeof value === 'boolean') return value ? 'On' : 'Off'
	if (typeof value === 'string' || typeof value === 'number') return value
	return JSON.stringify(value)
}

/** A registered variable and how to read its current value from the module's state. */
export interface VariableEntry {
	variableId: string
	name: string
	read: () => VariableValue | undefined
}

interface UniqueName {
	id: string
	label: string
}

/**
 * Variable-safe name per overlay id. Overlays sharing a name get "_2", "_3"… suffixes;
 * the same overlay id always resolves to the same name.
 */
function createUniqueNameTracker(): (overlayId: string, overlayName: string) => UniqueName {
	const nameCounts = new Map<string, number>()
	const byId = new Map<string, UniqueName>()

	return (overlayId, overlayName) => {
		const existing = byId.get(overlayId)
		if (existing) return existing

		const base = sanitizeName(overlayName)
		const n = (nameCounts.get(base) ?? 0) + 1
		nameCounts.set(base, n)
		const name = n === 1 ? { id: base, label: overlayName } : { id: `${base}_${n}`, label: `${overlayName} (${n})` }
		byId.set(overlayId, name)
		return name
	}
}

function buildVariableEntries(self: ModuleInstance): VariableEntry[] {
	const entries: VariableEntry[] = []
	const seen = new Set<string>()

	function add(variableId: string, name: string, read: VariableEntry['read']): void {
		if (seen.has(variableId)) {
			self.log('warn', `Duplicate variable id "${variableId}" ("${name}") - skipping`)
			return
		}
		seen.add(variableId)
		entries.push({ variableId, name, read })
	}

	const visibility = (overlayId: string) => () =>
		self.overlayVisibility.has(overlayId) ? (self.isOverlayVisible(overlayId) ? 'true' : 'false') : undefined

	const uniqueName = createUniqueNameTracker()

	add('overlay_count', 'Overlays - Total Count', () => self.overlayList.length)

	if (self.shape.singleOverlay) {
		// Global visibility variable for single-overlay apps (e.g. Lucky Draw).
		if (self.overlayVisibility.has(GLOBAL_OVERLAY_ID)) {
			add('overlay_visible', 'Overlay Visible', visibility(GLOBAL_OVERLAY_ID))
		}
	} else {
		for (const graphic of self.shape.graphics) {
			const { id: safeName, label } = uniqueName(graphic.id, graphic.name)
			add(`overlay_${safeName}_visibility`, `Overlay - ${label} - Visible`, visibility(graphic.id))
		}
	}

	for (const model of self.shape.contentModels) {
		const { id: safeOverlayName, label } = uniqueName(model.id, model.name)

		for (const field of model.model) {
			add(`overlay_${safeOverlayName}_${sanitizeName(field.id)}`, `Overlay - ${label} - ${field.title}`, () =>
				formatValue(normalizeColor(self.overlayContent.get(model.id)?.[field.id], field.type)),
			)
		}
	}

	// Customization field variables.
	if (self.customizationModel) {
		for (const field of self.customizationModel.model) {
			const safeFieldName = sanitizeName(field.id)
			add(`customize_${safeFieldName}`, `Customize - ${field.title}`, () =>
				formatValue(normalizeColor(self.customizationValues[field.id], field.type)),
			)
		}
	} else {
		// No customization model (bespoke app) — fall back to raw mainComposition keys.
		for (const fieldId of Object.keys(self.customizationValues)) {
			add(`customize_${sanitizeName(fieldId)}`, `Customize - ${fieldId}`, () =>
				formatValue(normalizeColor(self.customizationValues[fieldId])),
			)
		}
	}

	return entries
}

/** Register the app's variables. Their entries are kept, so value pushes don't rebuild ids and names. */
export function UpdateVariableDefinitions(self: ModuleInstance): void {
	self.variableEntries = buildVariableEntries(self)
	const variables: CompanionVariableDefinition[] = self.variableEntries.map(({ variableId, name }) => ({
		variableId,
		name,
	}))

	self.log('debug', `Registering ${variables.length} variables: ${JSON.stringify(variables.map((v) => v.variableId))}`)
	self.setVariableDefinitions(variables)
}

/**
 * Push variable values, sending only those that changed since the last push.
 * Pass `force` after definitions were rebuilt so Companion gets a full refresh.
 */
export function UpdateVariableValues(self: ModuleInstance, force: boolean): void {
	const values: Record<string, VariableValue | undefined> = {}
	for (const entry of self.variableEntries) {
		values[entry.variableId] = entry.read()
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
