import { COLOR } from './style.js'
import type { ModuleInstance } from './main.js'
import { hasPayload } from './api.js'
import { buildFieldValueInputs } from './fields.js'
import { inferredContentModels } from './inferred-model.js'
import { normalizeColor } from './variables.js'

function contentMatches(live: unknown, expected: string | number | boolean, fieldType?: string): boolean {
	if (live === null || live === undefined) return false

	const value = normalizeColor(live, fieldType)

	// Checkbox/toggle fields. Some apps store the flag as a string, hence the loose fallback.
	if (typeof expected === 'boolean') {
		return value === expected || String(value) === String(expected)
	}

	// Structured values (a font spec, a gradient) - compare their JSON form.
	if (typeof value === 'object') {
		return JSON.stringify(value) === String(expected)
	}

	// Anything else isn't a value a user could have typed into an option.
	if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
		return false
	}

	// Numeric fields, compared numerically so a user typing "40" still matches a stored "40.0".
	const liveNum = Number(value)
	const expectedNum = Number(expected)
	if (value !== '' && expected !== '' && Number.isFinite(liveNum) && Number.isFinite(expectedNum)) {
		return liveNum === expectedNum
	}

	// Text and selection fields.
	return String(value) === String(expected)
}

// Overlays selectable in the visibility feedback
function visibilityChoices(self: ModuleInstance): { id: string; label: string }[] {
	if (self.overlayChoices.length > 0) return self.overlayChoices

	const subs = self.controlState
		.filter((s) => !s.mainComposition && hasPayload(s))
		.map((s) => ({ id: s.subCompositionId, label: s.subCompositionName }))

	return subs.length > 0 ? subs : [{ id: '', label: 'No overlays loaded' }]
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const overlayChoices = visibilityChoices(self)

	// Same type-aware value editors the Set Content Field action uses, so the feedback's value
	// input matches the selected field's type. Bespoke apps have no models, so fall back to the
	// field list inferred from the live /control payloads - this feedback is read-only, so
	// unlike the actions there's no risk of offering a field the app can't be told to change.
	const contentModels = inferredContentModels(self)
	const contentFields = contentModels.flatMap((m) => m.model)
	const contentInputs = buildFieldValueInputs(contentFields)
	const contentFieldTypes = new Map(contentFields.map((f) => [f.id, f.type]))
	const contentOverlays =
		contentModels.length > 0
			? contentModels.map((m) => ({ id: m.id, label: m.name }))
			: [{ id: '', label: 'No overlays loaded' }]

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
					allowCustom: true,
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

				// Learn replaces the option set wholesale, so carry the existing options through -
				// returning only the learned value key would blank out overlayId and fieldId.
				return { ...feedback.options, ...learned }
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
					allowCustom: true,
				},
			],
			callback: (feedback) => {
				// Single-overlay apps store visibility under 'global'; those presets pass an empty overlayId.
				const overlayId = String(feedback.options.overlayId) || 'global'
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
