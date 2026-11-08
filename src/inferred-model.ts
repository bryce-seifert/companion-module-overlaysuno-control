import type { ModuleInstance } from './main.js'
import type { ControlModelNode, ControlSubComposition, OverlayModel, OverlayModelField } from './api.js'
import { hasPayload } from './api.js'
import { FieldType, isExcludedFieldType, type JsonObject, type JsonValue } from './types.js'
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
	if (value !== null) return FieldType.Json
	return undefined
}

/** The datastore key is the only name available, so it serves as both id and title. */
export function inferFields(payload: JsonObject): OverlayModelField[] {
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

/** A subcomposition from the /model tree, with what actions, presets and feedbacks need. */
export interface ControlSub {
	id: string
	name: string
	/** Logic layer name, or null when the subcomposition is in none. */
	layerName: string | null
	/** Identifies the layer among its siblings — layers are scoped to one parent composition. */
	layerKey: string | null
	fields: OverlayModelField[]
	/**
	 * Something an operator brings on and off air. Subcompositions with fields of their own hold control data
	 * (data feeds, flags), and a graphic's descendants animate with it.
	 */
	isGraphic: boolean
}

/** Every subcomposition below the app-level root, depth first. */
export function flattenControlModel(roots: ControlModelNode[]): ControlSub[] {
	const subs: ControlSub[] = []

	const visit = (node: ControlModelNode, parentId: string, insideGraphic: boolean): void => {
		// Graphic vs data uses the raw model: a node that only holds excluded types is still data, not a graphic.
		const isGraphic = !insideGraphic && node.model.length === 0
		subs.push({
			id: node.id,
			name: node.name,
			layerName: node.logicLayer?.name ?? null,
			layerKey: node.logicLayer ? `${parentId}:${node.logicLayer.name}` : null,
			fields: node.model.filter((field) => !isExcludedFieldType(field.type)),
			isGraphic,
		})
		for (const child of node.subcompositions) visit(child, node.id, insideGraphic || isGraphic)
	}

	for (const root of roots) {
		for (const child of root.subcompositions) visit(child, root.id, false)
	}
	return subs
}

/** A subcomposition's /model fields as an overlay model. */
export function controlSubModel(sub: ControlSub): OverlayModel {
	return { id: sub.id, name: sub.name, model: sub.fields, groups: [], hasSlots: false }
}

/** Subcompositions carrying data of their own, in /control order. */
export function contentSubCompositions(self: ModuleInstance): ControlSubComposition[] {
	return self.controlState.filter((s) => !s.mainComposition && hasPayload(s))
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
