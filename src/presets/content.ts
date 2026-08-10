import type { CompanionPresetDefinitions } from '@companion-module/base'
import type { OverlayModel } from '../api.js'
import { COLOR } from '../style.js'
import { sanitizeName } from '../variables.js'
import { buildFieldPresets, fieldVariableId } from './fields.js'

export function buildContentFieldPresets(model: OverlayModel, presets: CompanionPresetDefinitions): void {
	buildFieldPresets(model, presets, {
		category: `Overlay - ${model.name} - Content`,
		dividerKey: (sectionIndex, title) => `content_${model.id}_group_${sectionIndex}_${sanitizeName(title)}`,
		presetKey: (kind, field) => `${kind}_${model.id}_${field.id}`,
		actionIds: {
			set: 'set_overlay_content_field',
			adjust: 'adjust_overlay_content_field',
			toggle: 'toggle_overlay_content_field',
			execute: 'exec_overlay_content_field',
		},
		targetOptions: { overlayId: model.id },
		variableId: (field) => fieldVariableId(`overlay_${sanitizeName(model.name)}_`, field),
		setText: (label) => `Set ${label}`,
		showValueForNonNumeric: true,
		valuePrefixCurrent: true,
		valueBgcolor: COLOR.ink,
		checkboxFeedbacks: (field) => [
			{
				feedbackId: 'overlay_content_field',
				options: { overlayId: model.id, fieldId: field.id, value_boolean: true },
				style: {
					bgcolor: COLOR.amber,
					color: COLOR.ink,
				},
			},
		],
	})
}
