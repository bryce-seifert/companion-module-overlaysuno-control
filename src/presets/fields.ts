import type { CompanionButtonPresetDefinition, CompanionPresetDefinitions, InputValue } from '@companion-module/base'
import type { OverlayModel, OverlayModelField } from '../api.js'
import { fieldSetOption } from '../fields.js'
import { ICON_ADD_1, ICON_MINUS_1, ICON_PAUSE_TIME, ICON_PLAY_TIME, ICON_RESET, ICON_RESTORE_TIME } from '../icons.js'
import { COLOR } from '../style.js'
import { FieldType, NUMERIC_FIELD_TYPES } from '../types.js'
import { sanitizeName } from '../variables.js'
import { addDivider, orderFieldsByGroups } from './layout.js'

type PresetKind = 'set' | 'value' | 'inc' | 'dec' | 'rotary' | 'toggle' | 'exec' | 'play' | 'pause' | 'reset' | 'start'

export interface FieldPresetConfig {
	category: string
	dividerKey: (sectionIndex: number, title: string) => string
	presetKey: (kind: PresetKind, field: OverlayModelField) => string
	actionIds: {
		set: string
		adjust: string
		toggle: string
		execute: string
	}
	targetOptions: Record<string, InputValue>
	variableId: (field: OverlayModelField) => string
	setText: (field: OverlayModelField, variableReference: string) => string
	showValueForNonNumeric: boolean
	valuePrefixCurrent: boolean
	valueBgcolor: number
	checkboxFeedbacks: (field: OverlayModelField) => CompanionButtonPresetDefinition['feedbacks']
}

const TIME_ACTIONS = [
	{ kind: 'play' as const, label: 'Play', value: 'play', icon: ICON_PLAY_TIME },
	{ kind: 'pause' as const, label: 'Pause', value: 'pause', icon: ICON_PAUSE_TIME },
	{ kind: 'reset' as const, label: 'Reset', value: 'reset', icon: ICON_RESET },
	{ kind: 'start' as const, label: 'Start', value: 'start', icon: ICON_RESTORE_TIME },
]

export function buildFieldPresets(
	model: OverlayModel,
	presets: CompanionPresetDefinitions,
	config: FieldPresetConfig,
): void {
	orderFieldsByGroups(model).forEach((section, sectionIndex) => {
		if (section.title) {
			addDivider(presets, config.category, config.dividerKey(sectionIndex, section.title), section.title)
		}
		for (const field of section.fields) {
			buildFieldPreset(field, presets, config)
		}
	})
}

function buildFieldPreset(
	field: OverlayModelField,
	presets: CompanionPresetDefinitions,
	config: FieldPresetConfig,
): void {
	const type = field.type.toLowerCase()

	if (config.showValueForNonNumeric && type !== FieldType.Button && !NUMERIC_FIELD_TYPES.has(type)) {
		buildValuePreset(field, presets, config)
	}

	if (NUMERIC_FIELD_TYPES.has(type)) {
		buildNumberPresets(field, presets, config)
	} else if (type === FieldType.Checkbox) {
		buildCheckboxPreset(field, presets, config)
	} else if (type === FieldType.Button) {
		buildExecutePreset(field, presets, config)
	} else if (type === FieldType.TimeControl) {
		buildTimeControlPresets(field, presets, config)
	} else {
		buildSetPreset(field, presets, config)
	}
}

function variableReference(config: FieldPresetConfig, field: OverlayModelField): string {
	return `$(overlaysuno-control:${config.variableId(field)})`
}

function actionOptions(
	config: FieldPresetConfig,
	field: OverlayModelField,
	extra: Record<string, InputValue> = {},
): Record<string, InputValue> {
	return { ...config.targetOptions, fieldId: field.id, ...extra }
}

function buildSetPreset(
	field: OverlayModelField,
	presets: CompanionPresetDefinitions,
	config: FieldPresetConfig,
): void {
	const setOption = fieldSetOption(field)
	presets[config.presetKey('set', field)] = {
		type: 'button',
		category: config.category,
		name: `Set: ${field.title}`,
		style: {
			text: config.setText(field, variableReference(config, field)),
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
						actionId: config.actionIds.set,
						options: actionOptions(config, field, { [setOption.optionId]: setOption.value }),
					},
				],
				up: [],
			},
		],
		feedbacks: [],
	}
}

function buildValuePreset(
	field: OverlayModelField,
	presets: CompanionPresetDefinitions,
	config: FieldPresetConfig,
): void {
	presets[config.presetKey('value', field)] = {
		type: 'button',
		category: config.category,
		name: `${field.title}: Value`,
		style: {
			text: `${config.valuePrefixCurrent ? 'Current ' : ''}${field.title}\\n${variableReference(config, field)}`,
			size: '14',
			color: COLOR.white,
			bgcolor: config.valueBgcolor,
			show_topbar: false,
		},
		steps: [],
		feedbacks: [],
	}
}

function buildNumberPresets(
	field: OverlayModelField,
	presets: CompanionPresetDefinitions,
	config: FieldPresetConfig,
): void {
	buildAdjustPreset(field, presets, config, 'inc', 'increment', ICON_ADD_1, '+1')
	buildValuePreset(field, presets, config)
	buildAdjustPreset(field, presets, config, 'dec', 'decrement', ICON_MINUS_1, '-1')
	buildRotaryPreset(field, presets, config)
}

function buildRotaryPreset(
	field: OverlayModelField,
	presets: CompanionPresetDefinitions,
	config: FieldPresetConfig,
): void {
	presets[config.presetKey('rotary', field)] = {
		type: 'button',
		category: config.category,
		name: `${field.title}: Rotary`,
		style: {
			text: `${field.title}\\n${variableReference(config, field)}`,
			size: '14',
			color: COLOR.white,
			bgcolor: COLOR.surface,
			show_topbar: false,
			alignment: 'center:center',
		},
		previewStyle: {
			text: `${field.title}\\nRotary`,
			size: '14',
			color: COLOR.white,
			bgcolor: COLOR.surface,
			show_topbar: false,
			alignment: 'center:center',
		},
		options: {
			rotaryActions: true,
		},
		steps: [
			{
				down: [],
				up: [],
				rotate_left: [
					{
						actionId: config.actionIds.adjust,
						options: actionOptions(config, field, { direction: 'decrement', value: '1' }),
					},
				],
				rotate_right: [
					{
						actionId: config.actionIds.adjust,
						options: actionOptions(config, field, { direction: 'increment', value: '1' }),
					},
				],
			},
		],
		feedbacks: [],
	}
}

function buildAdjustPreset(
	field: OverlayModelField,
	presets: CompanionPresetDefinitions,
	config: FieldPresetConfig,
	kind: 'inc' | 'dec',
	direction: 'increment' | 'decrement',
	icon: string,
	suffix: string,
): void {
	presets[config.presetKey(kind, field)] = {
		type: 'button',
		category: config.category,
		name: `${field.title} ${suffix}`,
		style: {
			text: field.title,
			size: '14',
			color: COLOR.white,
			bgcolor: COLOR.surface,
			show_topbar: false,
			alignment: 'center:bottom',
			png64: icon,
			pngalignment: 'center:top',
		},
		steps: [
			{
				down: [
					{
						actionId: config.actionIds.adjust,
						options: actionOptions(config, field, { direction, value: '1' }),
					},
				],
				up: [],
			},
		],
		feedbacks: [],
	}
}

function buildCheckboxPreset(
	field: OverlayModelField,
	presets: CompanionPresetDefinitions,
	config: FieldPresetConfig,
): void {
	presets[config.presetKey('toggle', field)] = {
		type: 'button',
		category: config.category,
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
				down: [{ actionId: config.actionIds.toggle, options: actionOptions(config, field) }],
				up: [],
			},
		],
		feedbacks: config.checkboxFeedbacks(field),
	}
}

function buildExecutePreset(
	field: OverlayModelField,
	presets: CompanionPresetDefinitions,
	config: FieldPresetConfig,
): void {
	presets[config.presetKey('exec', field)] = {
		type: 'button',
		category: config.category,
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
						actionId: config.actionIds.execute,
						options: actionOptions(config, field, { value: 'execute' }),
					},
				],
				up: [],
			},
		],
		feedbacks: [],
	}
}

function buildTimeControlPresets(
	field: OverlayModelField,
	presets: CompanionPresetDefinitions,
	config: FieldPresetConfig,
): void {
	for (const action of TIME_ACTIONS) {
		presets[config.presetKey(action.kind, field)] = {
			type: 'button',
			category: config.category,
			name: `${field.title}: ${action.label}`,
			style: {
				text: `${field.title}\\n${action.label}`,
				size: '14',
				color: COLOR.white,
				bgcolor: COLOR.surface,
				show_topbar: false,
				alignment: 'center:bottom',
				png64: action.icon,
				pngalignment: 'center:top',
			},
			steps: [
				{
					down: [
						{
							actionId: config.actionIds.execute,
							options: actionOptions(config, field, { value: action.value }),
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}
	}
}

export function fieldVariableId(prefix: string, field: OverlayModelField): string {
	return `${prefix}${sanitizeName(field.id)}`
}
