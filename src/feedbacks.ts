import { COLOR } from './style.js'
import type { ModuleInstance } from './main.js'
import { hasPayload } from './api.js'
import { buildFieldValueInputs, isContentField } from './fields.js'
import { inferredContentModels } from './inferred-model.js'
import { GLOBAL_OVERLAY_ID, type DropdownChoice, type JsonValue } from './types.js'
import { normalizeColor } from './variables.js'

function contentMatches(live: JsonValue | undefined, expected: string | number | boolean, fieldType?: string): boolean {
	if (live === null || live === undefined) return false

	const value = normalizeColor(live, fieldType)

	// Checkbox/toggle fields. Some apps store the flag as a string — keep a loose fallback.
	if (typeof expected === 'boolean') {
		return value === expected || String(value) === String(expected)
	}

	// Structured values (font spec, gradient) — compare their JSON form.
	if (typeof value === 'object' && value !== null) {
		return JSON.stringify(value) === String(expected)
	}

	// Anything else isn't a value a user could have typed into an option.
	if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
		return false
	}

	// Numeric fields: compare numerically so "40" still matches stored "40.0".
	const liveNum = Number(value)
	const expectedNum = Number(expected)
	if (value !== '' && expected !== '' && Number.isFinite(liveNum) && Number.isFinite(expectedNum)) {
		return liveNum === expectedNum
	}

	return String(value) === String(expected)
}

/** Overlays selectable in the visibility feedback. */
function visibilityChoices(self: ModuleInstance): DropdownChoice[] {
	if (self.overlayChoices.length > 0) return self.overlayChoices

	const subs = self.controlState
		.filter((s) => !s.mainComposition && hasPayload(s))
		.map((s) => ({ id: s.subCompositionId, label: s.subCompositionName }))

	return subs.length > 0 ? subs : [{ id: '', label: 'No overlays loaded' }]
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const overlayChoices = visibilityChoices(self)

	// Same type-aware value editors the Set Content Field action uses.
	// Bespoke apps have no models, so fall back to fields inferred from /control payloads.
	const contentModels = inferredContentModels(self)
	const contentFields = contentModels.flatMap((m) => m.model).filter(isContentField)
	const contentInputs = buildFieldValueInputs(contentFields)
	const contentFieldTypes = new Map(contentFields.map((f) => [f.id, f.type]))
	const contentOverlays: DropdownChoice[] =
		contentModels.length > 0
			? contentModels.map((m) => ({ id: m.id, label: m.name }))
			: [{ id: '', label: 'No overlays loaded' }]
	const customizationFields = (self.customizationModel?.model ?? []).filter(isContentField)
	const customizationInputs = buildFieldValueInputs(customizationFields)
	const customizationFieldTypes = new Map(customizationFields.map((field) => [field.id, field.type]))

	self.setFeedbackDefinitions({
		overlay_content_field: {
			name: 'Overlay - Content Field Matches Value',
			type: 'boolean',
			defaultStyle: {
				color: COLOR.ink,
				bgcolor: COLOR.amber,
			},
			options: [
				{
					id: 'overlayId',
					type: 'dropdown',
					label: 'Overlay',
					choices: contentOverlays,
					default: contentOverlays[0]?.id ?? '',
					allowCustom: false,
				},
				{
					id: 'fieldId',
					type: 'dropdown',
					label: 'Field',
					choices: contentInputs.choices,
					default: contentInputs.choices[0]?.id ?? '',
					allowCustom: true,
				},
				...contentInputs.valueOptions,
			],
			callback: (feedback) => {
				const content = self.overlayContent.get(String(feedback.options.overlayId))
				if (!content) return false

				const fieldId = String(feedback.options.fieldId)
				const expected = contentInputs.resolveValue(feedback.options)
				return contentMatches(content[fieldId], expected, contentFieldTypes.get(fieldId))
			},
			learn: async (feedback) => {
				const content = await self.fetchLiveContent(String(feedback.options.overlayId))
				if (!content) return undefined

				const learned = contentInputs.learnValue(feedback.options, content[String(feedback.options.fieldId)])
				if (!learned) return undefined

				// Learn replaces the option set wholesale — carry existing options through.
				return { ...feedback.options, ...learned }
			},
		},

		customization_field: {
			name: 'Customization Field Matches Value',
			type: 'boolean',
			defaultStyle: {
				color: COLOR.ink,
				bgcolor: COLOR.amber,
			},
			options: [
				{
					id: 'fieldId',
					type: 'dropdown',
					label: 'Field',
					choices: customizationInputs.choices,
					default: customizationInputs.choices[0]?.id ?? '',
					allowCustom: true,
				},
				...customizationInputs.valueOptions,
			],
			callback: (feedback) => {
				const fieldId = String(feedback.options.fieldId)
				const expected = customizationInputs.resolveValue(feedback.options)
				return contentMatches(self.customizationValues[fieldId], expected, customizationFieldTypes.get(fieldId))
			},
			learn: async (feedback) => {
				const values = await self.fetchLiveCustomization()
				if (!values) return undefined

				const learned = customizationInputs.learnValue(feedback.options, values[String(feedback.options.fieldId)])
				return learned ? { ...feedback.options, ...learned } : undefined
			},
		},

		overlay_visible: {
			name: 'Overlay Visible',
			type: 'boolean',
			defaultStyle: {
				color: COLOR.ink,
				bgcolor: COLOR.amber,
			},
			options: [
				{
					id: 'overlayId',
					type: 'dropdown',
					label: 'Overlay',
					choices: overlayChoices,
					default: overlayChoices[0]?.id ?? '',
					allowCustom: false,
				},
			],
			callback: (feedback) => {
				// Single-overlay apps store visibility under 'global'; those presets pass ''.
				const overlayId = String(feedback.options.overlayId) || GLOBAL_OVERLAY_ID
				return self.overlayVisibility.get(overlayId) === true
			},
		},

		app_thumbnail: {
			name: 'App Thumbnail',
			type: 'advanced',
			options: [],
			callback: () => {
				return self.appThumbnailPng64 ? { png64: self.appThumbnailPng64 } : {}
			},
		},
	})
}
