import type { ModuleInstance } from './main.js'
import type { ControlSubComposition, OverlayModel, OverlayModelField } from './api.js'
import { hasPayload } from './api.js'
import { isRgbObject } from './variables.js'

// Bespoke control apps that are not supported by GetOverlayModels, so they have no field titles or types - but
// /control still reports every field's live value
function inferFieldType(value: unknown): string | undefined {
	if (typeof value === 'boolean') return 'checkbox'
	// Checked before `number`/`object`: an {r,g,b} object is unambiguously a colour.
	if (isRgbObject(value)) return 'color'
	if (typeof value === 'number') return 'number'
	if (typeof value === 'string') return 'text'
	return undefined
}

// The datastore key is the only name available, so it serves as both id and title.
function inferFields(payload: Record<string, unknown>): OverlayModelField[] {
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

// Subcompositions carrying data of their own, in /control order.
function contentSubCompositions(self: ModuleInstance): ControlSubComposition[] {
	return self.controlState.filter((s) => !s.mainComposition && hasPayload(s))
}

// Overlay models to drive read-only content lookups: the real ones when the app provides them,
// otherwise a best-effort reconstruction from the live /control payloads.
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

// Resolve a Show/Hide/Toggle schema command to boolean datastore field
export function resolveVisibilityField(
	self: ModuleInstance,
	command: string,
): { overlayId: string; fieldId: string } | undefined {
	const prefix = ['Show', 'Hide', 'Toggle'].find((p) => command.startsWith(p))
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
