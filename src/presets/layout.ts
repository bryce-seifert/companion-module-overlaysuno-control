import type { CompanionPresetDefinitions } from '@companion-module/base'
import type { OverlayModel, OverlayModelField } from '../api.js'

// Insert a text divider preset (a labeled section header within a category).
export function addDivider(presets: CompanionPresetDefinitions, category: string, key: string, label: string): void {
	presets[key] = { type: 'text', category, name: label, text: '' }
}

export interface FieldSection {
	// Group heading, or null when the fields are ungrouped.
	title: string | null
	fields: OverlayModelField[]
}

// Split a model's fields into ordered sections following its `groups` metadata.
// Fields not listed in any group are collected into a trailing "Other" section.
export function orderFieldsByGroups(model: OverlayModel): FieldSection[] {
	const fieldById = new Map(model.model.map((f) => [f.id, f]))
	const used = new Set<string>()
	const sections: FieldSection[] = []

	for (const group of model.groups ?? []) {
		const fields = (group.childIds ?? [])
			.map((id) => fieldById.get(id))
			.filter((f): f is OverlayModelField => f !== undefined)
		if (fields.length === 0) continue
		for (const f of fields) used.add(f.id)
		sections.push({ title: group.title || null, fields })
	}

	const rest = model.model.filter((f) => !used.has(f.id))
	if (rest.length > 0) {
		sections.push({ title: sections.length > 0 ? 'Other' : null, fields: rest })
	}

	return sections
}
