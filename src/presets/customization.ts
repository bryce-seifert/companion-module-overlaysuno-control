import type { CompanionPresetDefinitions } from '@companion-module/base'
import type { OverlayModel } from '../api.js'
import { COLOR } from '../style.js'
import { sanitizeName } from '../variables.js'
import { buildFieldPresets, fieldVariableId } from './fields.js'

export function buildCustomizationPresets(model: OverlayModel, presets: CompanionPresetDefinitions): void {
	buildFieldPresets(model, presets, {
		category: 'Customization',
		dividerKey: (sectionIndex, title) => `customize_group_${sectionIndex}_${sanitizeName(title)}`,
		presetKey: (kind, field) => `customize_${kind}_${field.id}`,
		actionIds: {
			set: 'set_customization_field',
			adjust: 'adjust_customization_field',
			toggle: 'toggle_customization_field',
			execute: 'exec_customization_field',
		},
		targetOptions: {},
		variableId: (field) => fieldVariableId('customize_', field),
		setText: (label, variableReference) => (variableReference ? `Set ${label}\\n${variableReference}` : `Set ${label}`),
		checkboxFeedbacks: (field) => [
			{
				feedbackId: 'customization_field',
				options: { fieldId: field.id, value_boolean: true },
				style: {
					bgcolor: COLOR.amber,
					color: COLOR.ink,
				},
			},
		],
	})
}
