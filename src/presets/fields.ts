import type { CompanionButtonPresetDefinition, CompanionPresetDefinitions, InputValue } from '@companion-module/base'
import type { OverlayModel, OverlayModelField } from '../api.js'
import { fieldChoiceLabel, fieldSetOption } from '../fields.js'
import { ICON_ADD_1, ICON_MINUS_1, ICON_PAUSE_TIME, ICON_PLAY_TIME, ICON_RESET, ICON_RESTORE_TIME } from '../icons.js'
import { COLOR } from '../style.js'
import { FieldType, NUMERIC_FIELD_TYPES } from '../types.js'
import { addDivider, orderFieldsByGroups } from './layout.js'

type PresetKind = 'set' | 'inc' | 'dec' | 'rotary' | 'toggle' | 'exec' | 'play' | 'pause' | 'reset' | 'start'

export interface FieldPresetConfig {
	category: string
	dividerKey: (sectionIndex: number, title: string) => string
	presetKey: (kind: PresetKind, field: OverlayModelField) => string
	actionIds: {
		set: string
		toggle: string
		execute: string
	}
	targetOptions: Record<string, InputValue>
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
	const label = fieldChoiceLabel(field)
	presets[config.presetKey('set', field)] = {
		type: 'button',
		category: config.category,
		name: `Set: ${label}`,
		style: {
			text: `Set ${label}`,
			size: 15,
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

function buildNumberPresets(
	field: OverlayModelField,
	presets: CompanionPresetDefinitions,
	config: FieldPresetConfig,
): void {
	buildAdjustPreset(field, presets, config, 'inc', 'increment', ICON_ADD_1, '+1')
	buildAdjustPreset(field, presets, config, 'dec', 'decrement', ICON_MINUS_1, '-1')
	buildRotaryPreset(field, presets, config)
}

function adjustAction(
	config: FieldPresetConfig,
	field: OverlayModelField,
	operation: 'increment' | 'decrement',
): { actionId: string; options: Record<string, InputValue> } {
	return {
		actionId: config.actionIds.set,
		options: actionOptions(config, field, { operation, value: '1' }),
	}
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
			text: `${field.title}\\nRotary`,
			size: 15,
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
				rotate_left: [adjustAction(config, field, 'decrement')],
				rotate_right: [adjustAction(config, field, 'increment')],
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
			size: 15,
			color: COLOR.white,
			bgcolor: COLOR.surface,
			show_topbar: false,
			alignment: 'center:bottom',
			png64: icon,
			pngalignment: 'center:top',
		},
		steps: [
			{
				down: [adjustAction(config, field, direction)],
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
			size: 15,
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
			size: 15,
			color: COLOR.white,
			bgcolor: COLOR.surface,
			show_topbar: false,
			alignment: 'center:center',
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
				size: 15,
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
