import type { CompanionPresetDefinitions } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import { buildSchemaPresets } from './presets/schema.js'
import { buildVisibilityPresets } from './presets/visibility.js'
import { buildContentFieldPresets } from './presets/content.js'
import { buildSlotPresets } from './presets/slots.js'
import { buildCustomizationPresets } from './presets/customization.js'
import { buildThumbnailPresets } from './presets/thumbnail.js'

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions = {}

	buildSchemaPresets(self, presets)

	if (self.hasCommand('ShowOverlay') || self.hasCommand('HideOverlay') || self.hasCommand('ToggleOverlay')) {
		buildVisibilityPresets(self, presets)
	}

	for (const model of self.overlayModels) {
		buildContentFieldPresets(model, presets)

		if (model.hasSlots) {
			buildSlotPresets(model, presets)
		}
	}

	if (self.customizationModel) {
		buildCustomizationPresets(self.customizationModel, presets)
	}

	if (self.appInfo?.thumbnail) {
		buildThumbnailPresets(self, presets)
	}

	self.setPresetDefinitions(presets)
}
