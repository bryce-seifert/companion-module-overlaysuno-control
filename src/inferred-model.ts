import type { ModuleInstance } from './main.js'
import type { ControlSubComposition, OverlayModel, OverlayModelField } from './api.js'
import { hasPayload } from './api.js'
import { FieldType, type JsonObject, type JsonValue } from './types.js'
import { isRgbObject } from './variables.js'

/**
 * Bespoke apps often 400 on GetOverlayModels, so they have no field titles/types —
 * but /control still reports every field's live value. Infer a usable type from that.
 */
function inferFieldType(value: JsonValue): string | undefined {
	if (typeof value === 'boolean') return FieldType.Checkbox
	// Checked before number/object: an {r,g,b} object is unambiguously a colour.
	if (isRgbObject(value)) return FieldType.Color
	if (typeof value === 'number') return FieldType.Number
	if (typeof value === 'string') return FieldType.Text
	return undefined
}

/** The datastore key is the only name available, so it serves as both id and title. */
function inferFields(payload: JsonObject): OverlayModelField[] {
	const fields: OverlayModelField[] = []

	for (const [id, value] of Object.entries(payload)) {
		const type = inferFieldType(value)
		if (!type) continue

		fields.push({
			id,
			title: id,
			type,
			defaultValue: value,
			resetValue: value,
			immediateUpdate: false,
			index: fields.length,
		})
	}

	return fields
}

/** Subcompositions carrying data of their own, in /control order. */
function contentSubCompositions(self: ModuleInstance): ControlSubComposition[] {
	return self.controlState.filter((s) => !s.mainComposition && hasPayload(s))
}

/**
 * Overlay models for read-only content lookups: real models when available,
 * otherwise a best-effort reconstruction from live /control payloads.
 */
export function inferredContentModels(self: ModuleInstance): OverlayModel[] {
	if (self.overlayModels.length > 0) return self.overlayModels

	return contentSubCompositions(self).map((sub) => ({
		id: sub.subCompositionId,
		name: sub.subCompositionName,
		model: inferFields(sub.payload ?? {}),
		groups: [],
		hasSlots: false,
	}))
}

const VISIBILITY_COMMAND_PREFIXES = ['Show', 'Hide', 'Toggle'] as const

/**
 * Resolve a Show/Hide/Toggle schema command to a boolean datastore field,
 * so generated presets can light a feedback when that field is on.
 */
export function resolveVisibilityField(
	self: ModuleInstance,
	command: string,
): { overlayId: string; fieldId: string } | undefined {
	const prefix = VISIBILITY_COMMAND_PREFIXES.find((p) => command.startsWith(p))
	if (!prefix) return undefined

	const stem = command.slice(prefix.length)
	if (!stem) return undefined

	const candidates = [`Show${stem}`, stem, `${stem}On`]

	for (const sub of contentSubCompositions(self)) {
		const payload = sub.payload ?? {}
		const fieldId = candidates.find((key) => typeof payload[key] === 'boolean')
		if (fieldId) {
			return { overlayId: sub.subCompositionId, fieldId }
		}
	}

	return undefined
}
