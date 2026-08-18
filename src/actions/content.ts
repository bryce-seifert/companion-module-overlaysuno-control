import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import { parseJsonObject } from '../util.js'
import { buildFieldActions } from './fields.js'
import { overlayChoices } from './shared.js'

export function getContentActions(self: ModuleInstance): CompanionActionDefinitions {
	const choices = overlayChoices(self)
	const contentFields = self.overlayModels.flatMap((m) => m.model)
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
				{
					id: 'overlayId',
					type: 'dropdown',
					label: 'Overlay',
					choices,
					default: choices[0]?.id ?? '',
					allowCustom: false,
				},
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
					self.log('error', `SetOverlayContent: invalid JSON - ${parsed.error}`)
					return
				}
				await self.sendAndRefresh({
					command: 'SetOverlayContent',
					id: String(event.options.overlayId),
					content: parsed.value,
				})
			},
			learn: async (event) => {
				const content = await self.fetchLiveContent(String(event.options.overlayId))
				if (!content) return undefined
				return { ...event.options, content: JSON.stringify(content, null, 2) }
			},
		},
		...buildFieldActions(self, {
			fields: contentFields,
			targetOptions: [overlayOption],
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
			commands: {
				set: 'SetOverlayContentField',
				increment: 'IncrementOverlayContentField',
				decrement: 'DecrementOverlayContentField',
				toggle: 'ToggleOverlayContentField',
				execute: 'ExecuteOverlayContentField',
			},
			payloadFor: (options) => ({ command: '', id: String(options.overlayId) }),
			fetchValues: async (options) => self.fetchLiveContent(String(options.overlayId)),
		}),
	}
}
