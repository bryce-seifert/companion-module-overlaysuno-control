import type { CompanionPresetDefinitions } from '@companion-module/base'
import type { OverlayModel, OverlayModelField } from '../api.js'
import { sanitizeName } from '../variables.js'
import { fieldSetOption } from '../fields.js'
import { COLOR } from '../style.js'
import { addDivider, orderFieldsByGroups } from './layout.js'
import { ICON_ADD_1, ICON_MINUS_1, ICON_PLAY_TIME, ICON_PAUSE_TIME, ICON_RESET, ICON_RESTORE_TIME } from '../icons.js'

export function buildContentFieldPresets(model: OverlayModel, presets: CompanionPresetDefinitions): void {
	const category = `Overlay - ${model.name} - Content`

	orderFieldsByGroups(model).forEach((section, i) => {
		if (section.title) {
			addDivider(presets, category, `content_${model.id}_group_${i}_${sanitizeName(section.title)}`, section.title)
		}
		for (const field of section.fields) {
			buildContentFieldPreset(model, field, category, presets)
		}
	})
}

function buildContentFieldPreset(
	model: OverlayModel,
	field: OverlayModelField,
	category: string,
	presets: CompanionPresetDefinitions,
): void {
	const type = field.type.toLowerCase()

	if (!NO_VALUE_PRESET.has(type)) {
		buildValuePreset(model, field, category, presets)
	}

	switch (type) {
		case 'text':
		case 'textarea':
			buildTextPreset(model, field, category, presets)
			break

		case 'number':
		case 'counter':
		case 'normalizednumber':
			// Emits its own value readout, between the +1 and -1 buttons.
			buildNumberPresets(model, field, category, presets)
			break

		case 'checkbox':
			buildCheckboxPreset(model, field, category, presets)
			break

		case 'button':
			buildButtonPreset(model, field, category, presets)
			break

		case 'timecontrol':
			buildTimeControlPresets(model, field, category, presets)
			break

		default:
			// For unknown field types, provide a generic Set Field preset
			buildTextPreset(model, field, category, presets)
			break
	}
}

// Field types that don't get a standalone "current value" preset: a `button` field is a pure
// trigger with no value to show
const NO_VALUE_PRESET = new Set(['button', 'number', 'counter', 'normalizednumber'])

function buildTextPreset(
	model: OverlayModel,
	field: OverlayModelField,
	category: string,
	presets: CompanionPresetDefinitions,
): void {
	presets[`set_${model.id}_${field.id}`] = {
		type: 'button',
		category,
		name: `Set: ${field.title}`,
		style: {
			text: `Set ${field.title}`,
			size: '14',
			color: COLOR.white,
			bgcolor: COLOR.surface,
			show_topbar: false,
			alignment: 'center:center',
		},
		steps: [
			{
				down: [
					{
						actionId: 'set_overlay_content_field',
						options: {
							overlayId: model.id,
							fieldId: field.id,
							[fieldSetOption(field).optionId]: fieldSetOption(field).value,
						},
					},
				],
				up: [],
			},
		],
		feedbacks: [],
	}
}

// A read-only button showing the field's live value
function buildValuePreset(
	model: OverlayModel,
	field: OverlayModelField,
	category: string,
	presets: CompanionPresetDefinitions,
): void {
	const varId = `overlay_${sanitizeName(model.name)}_${sanitizeName(field.id)}`

	presets[`value_${model.id}_${field.id}`] = {
		type: 'button',
		category,
		name: `${field.title}: Value`,
		style: {
			text: `Current ${field.title}\\n$(overlaysuno-control:${varId})`,
			size: '14',
			color: COLOR.white,
			bgcolor: COLOR.ink,
			show_topbar: false,
		},
		steps: [],
		feedbacks: [],
	}
}

function buildNumberPresets(
	model: OverlayModel,
	field: OverlayModelField,
	category: string,
	presets: CompanionPresetDefinitions,
): void {
	presets[`inc_${model.id}_${field.id}`] = {
		type: 'button',
		category,
		name: `${field.title} +1`,
		style: {
			text: field.title,
			size: '14',
			color: COLOR.white,
			bgcolor: COLOR.surface,
			show_topbar: false,
			alignment: 'center:bottom',
			png64: ICON_ADD_1,
			pngalignment: 'center:top',
		},
		steps: [
			{
				down: [
					{
						actionId: 'adjust_overlay_content_field',
						options: {
							overlayId: model.id,
							fieldId: field.id,
							direction: 'increment',
							value: '1',
						},
					},
				],
				up: [],
			},
		],
		feedbacks: [],
	}

	// Sits between the +1 and -1 buttons, so a number field reads as a natural triple.
	buildValuePreset(model, field, category, presets)

	presets[`dec_${model.id}_${field.id}`] = {
		type: 'button',
		category,
		name: `${field.title} -1`,
		style: {
			text: field.title,
			size: '14',
			color: COLOR.white,
			bgcolor: COLOR.surface,
			show_topbar: false,
			alignment: 'center:bottom',
			png64: ICON_MINUS_1,
			pngalignment: 'center:top',
		},
		steps: [
			{
				down: [
					{
						actionId: 'adjust_overlay_content_field',
						options: {
							overlayId: model.id,
							fieldId: field.id,
							direction: 'decrement',
							value: '1',
						},
					},
				],
				up: [],
			},
		],
		feedbacks: [],
	}
}

function buildCheckboxPreset(
	model: OverlayModel,
	field: OverlayModelField,
	category: string,
	presets: CompanionPresetDefinitions,
): void {
	presets[`toggle_${model.id}_${field.id}`] = {
		type: 'button',
		category,
		name: `Toggle: ${field.title}`,
		style: {
			text: `Toggle\\n${field.title}`,
			size: '14',
			color: COLOR.white,
			bgcolor: COLOR.surface,
			show_topbar: false,
			alignment: 'center:center',
		},
		steps: [
			{
				down: [
					{
						actionId: 'toggle_overlay_content_field',
						options: {
							overlayId: model.id,
							fieldId: field.id,
						},
					},
				],
				up: [],
			},
		],
		// Light the button while the field is on, so the toggle shows its own state.
		feedbacks: [
			{
				feedbackId: 'overlay_content_field',
				options: { overlayId: model.id, fieldId: field.id, value_boolean: true },
				style: {
					bgcolor: COLOR.amber,
					color: COLOR.ink,
				},
			},
		],
	}
}

function buildButtonPreset(
	model: OverlayModel,
	field: OverlayModelField,
	category: string,
	presets: CompanionPresetDefinitions,
): void {
	presets[`exec_${model.id}_${field.id}`] = {
		type: 'button',
		category,
		name: `Execute: ${field.title}`,
		style: {
			text: `Execute\\n${field.title}`,
			size: '14',
			color: COLOR.white,
			bgcolor: COLOR.surface,
			show_topbar: false,
			alignment: 'center:bottom',
		},
		steps: [
			{
				down: [
					{
						actionId: 'exec_overlay_content_field',
						options: {
							overlayId: model.id,
							fieldId: field.id,
							value: 'execute',
						},
					},
				],
				up: [],
			},
		],
		feedbacks: [],
	}
}

function buildTimeControlPresets(
	model: OverlayModel,
	field: OverlayModelField,
	category: string,
	presets: CompanionPresetDefinitions,
): void {
	const timeActions: { suffix: string; label: string; value: string; icon: string }[] = [
		{ suffix: 'play', label: 'Play', value: 'play', icon: ICON_PLAY_TIME },
		{ suffix: 'pause', label: 'Pause', value: 'pause', icon: ICON_PAUSE_TIME },
		{ suffix: 'reset', label: 'Reset', value: 'reset', icon: ICON_RESET },
		{ suffix: 'start', label: 'Start', value: 'start', icon: ICON_RESTORE_TIME },
	]

	for (const ta of timeActions) {
		presets[`${ta.suffix}_${model.id}_${field.id}`] = {
			type: 'button',
			category,
			name: `${field.title}: ${ta.label}`,
			style: {
				text: `${field.title}\\n${ta.label}`,
				size: '14',
				color: COLOR.white,
				bgcolor: COLOR.surface,
				show_topbar: false,
				alignment: 'center:bottom',
				png64: ta.icon,
				pngalignment: 'center:top',
			},
			steps: [
				{
					down: [
						{
							actionId: 'exec_overlay_content_field',
							options: {
								overlayId: model.id,
								fieldId: field.id,
								value: ta.value,
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}
	}
}
