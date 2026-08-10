import type { CompanionPresetDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import { COLOR } from '../style.js'

export function buildThumbnailPresets(self: ModuleInstance, presets: CompanionPresetDefinitions): void {
	const category = 'Thumbnail'
	const appName = self.appInfo?.name ?? 'Overlays Uno'

	presets['app_thumbnail'] = {
		type: 'button',
		category,
		name: `${appName} Thumbnail`,
		style: {
			text: '',
			size: 'auto',
			color: COLOR.white,
			bgcolor: COLOR.ink,
			show_topbar: false,
			...(self.appThumbnailPng64 ? { png64: self.appThumbnailPng64 } : {}),
		},
		steps: [{ down: [], up: [] }],
		feedbacks: [{ feedbackId: 'app_thumbnail', options: {} }],
	}
}
