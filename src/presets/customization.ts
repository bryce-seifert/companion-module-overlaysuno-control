import type { CompanionPresetDefinitions } from '@companion-module/base'
import type { OverlayModel, OverlayModelField } from '../api.js'
import { sanitizeName } from '../variables.js'
import { fieldSetOption } from '../fields.js'
import { COLOR } from '../style.js'
import { addDivider, orderFieldsByGroups } from './layout.js'
import { ICON_ADD_1, ICON_MINUS_1, ICON_PLAY_TIME, ICON_PAUSE_TIME, ICON_RESET, ICON_RESTORE_TIME } from '../icons.js'

export function buildCustomizationPresets(model: OverlayModel, presets: CompanionPresetDefinitions): void {
	const category = 'Customization'

	orderFieldsByGroups(model).forEach((section, i) => {
		if (section.title) {
			addDivider(presets, category, `customize_group_${i}_${sanitizeName(section.title)}`, section.title)
		}
		for (const field of section.fields) {
			buildCustomizationFieldPreset(field, category, presets)
		}
	})
}

function buildCustomizationFieldPreset(
	field: OverlayModelField,
	category: string,
	presets: CompanionPresetDefinitions,
): void {
	const fieldType = field.type.toLowerCase()
	const safeFieldName = sanitizeName(field.id)

	switch (fieldType) {
		case 'text':
		case 'textarea':
			presets[`customize_set_${field.id}`] = {
				type: 'button',
				category,
				name: `Set: ${field.title}`,
				style: {
					text: `Set ${field.title}\\n$(overlaysuno-control:customize_${safeFieldName})`,
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
								actionId: 'set_customization_field',
								options: { fieldId: field.id, [fieldSetOption(field).optionId]: fieldSetOption(field).value },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			}
			break

		case 'number':
		case 'counter':
		case 'normalizednumber':
			presets[`customize_inc_${field.id}`] = {
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
								actionId: 'adjust_customization_field',
								options: { fieldId: field.id, direction: 'increment', value: '1' },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			}

			presets[`customize_value_${field.id}`] = {
				type: 'button',
				category,
				name: `${field.title}: Value`,
				style: {
					text: `${field.title}\\n$(overlaysuno-control:customize_${safeFieldName})`,
					size: '14',
					color: COLOR.white,
					bgcolor: COLOR.surface,
					show_topbar: false,
				},
				steps: [],
				feedbacks: [],
			}

			presets[`customize_dec_${field.id}`] = {
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
								actionId: 'adjust_customization_field',
								options: { fieldId: field.id, direction: 'decrement', value: '1' },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			}
			break

		case 'checkbox':
			presets[`customize_toggle_${field.id}`] = {
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
								actionId: 'toggle_customization_field',
								options: { fieldId: field.id },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			}
			break

		case 'button':
			presets[`customize_exec_${field.id}`] = {
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
								actionId: 'exec_customization_field',
								options: { fieldId: field.id, value: 'execute' },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			}
			break

		case 'timecontrol': {
			const timeActions = [
				{ suffix: 'play', label: 'Play', value: 'play', icon: ICON_PLAY_TIME },
				{ suffix: 'pause', label: 'Pause', value: 'pause', icon: ICON_PAUSE_TIME },
				{ suffix: 'reset', label: 'Reset', value: 'reset', icon: ICON_RESET },
				{ suffix: 'start', label: 'Start', value: 'start', icon: ICON_RESTORE_TIME },
			]

			for (const ta of timeActions) {
				presets[`customize_${ta.suffix}_${field.id}`] = {
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
									actionId: 'exec_customization_field',
									options: { fieldId: field.id, value: ta.value },
								},
							],
							up: [],
						},
					],
					feedbacks: [],
				}
			}
			break
		}

		default:
			// Generic set field for unknown types
			presets[`customize_set_${field.id}`] = {
				type: 'button',
				category,
				name: `Set: ${field.title}`,
				style: {
					text: `Set\\n${field.title}`,
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
								actionId: 'set_customization_field',
								options: { fieldId: field.id, [fieldSetOption(field).optionId]: fieldSetOption(field).value },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			}
			break
	}
}
