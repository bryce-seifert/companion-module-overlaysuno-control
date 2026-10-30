import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import { parseJsonObject } from '../util.js'
import { contentWriter } from '../writers.js'
import { buildFieldActions } from './fields.js'
import { modelChoices } from './shared.js'

export function getContentActions(self: ModuleInstance): CompanionActionDefinitions {
	const writer = contentWriter(self)
	if (!writer) return {}

	const models = self.shape.contentModels
	const choices = modelChoices(models)
	const overlayOption = {
		id: 'overlayId',
		type: 'dropdown' as const,
		label: 'Overlay',
		choices,
		default: choices[0]?.id ?? '',
		allowCustom: false,
	}

	return {
		set_overlay_content: {
			name: 'Overlays - Set Content (JSON)',
			options: [
				overlayOption,
				{
					id: 'content',
					type: 'textinput',
					label: 'Content (JSON)',
					default: '{}',
					useVariables: true,
				},
			],
			callback: async (event) => {
				const parsed = parseJsonObject(String(event.options.content))
				if (!parsed.ok) {
					self.log('error', `Set Content: invalid JSON - ${parsed.error}`)
					return
				}
				await writer.setAll(String(event.options.overlayId), parsed.value)
			},
			learn: async (event) => {
				const content = await writer.fetchValues(String(event.options.overlayId))
				if (!content) return undefined
				return { ...event.options, content: JSON.stringify(content, null, 2) }
			},
		},
		...buildFieldActions({
			fields: models.flatMap((m) => m.model),
			targetOptions: [overlayOption],
			targetOf: (options) => String(options.overlayId),
			writer,
			actionIds: {
				set: 'set_overlay_content_field',
				toggle: 'toggle_overlay_content_field',
				execute: 'exec_overlay_content_field',
			},
			names: {
				set: 'Overlays - Set Content Field',
				toggle: 'Overlays - Toggle Content Field',
				execute: 'Overlays - Execute Content Field',
			},
		}),
	}
}
