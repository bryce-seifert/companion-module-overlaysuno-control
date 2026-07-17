import type { CompanionPresetDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import { COLOR } from '../style.js'
import { addDivider } from './layout.js'
import { ICON_SHOW_OVERLAY, ICON_HIDE_OVERLAY, ICON_TOGGLE_OVERLAY } from '../icons.js'

export function buildVisibilityPresets(self: ModuleInstance, presets: CompanionPresetDefinitions): void {
	if (self.overlayList.length === 0) {
		presets[`show_global_overlay`] = {
			type: 'button',
			category: `Overlays - Visibility`,
			name: `Show Overlay`,
			style: {
				text: `Show\\nOverlay`,
				size: '14',
				color: COLOR.white,
				bgcolor: COLOR.surface,
				show_topbar: false,
				alignment: 'center:bottom',
				png64: ICON_SHOW_OVERLAY,
				pngalignment: 'center:top',
			},
			steps: [
				{
					down: [{ actionId: 'overlay_visibility', options: { action: 'show', overlayId: '' } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'overlay_visible',
					options: { overlayId: '' },
					style: {
						bgcolor: COLOR.amber,
						color: COLOR.ink,
					},
				},
			],
		}

		presets[`hide_global_overlay`] = {
			type: 'button',
			category: `Overlays - Visibility`,
			name: `Hide Overlay`,
			style: {
				text: `Hide\\nOverlay`,
				size: '14',
				color: COLOR.white,
				bgcolor: COLOR.surface,
				show_topbar: false,
				alignment: 'center:bottom',
				png64: ICON_HIDE_OVERLAY,
				pngalignment: 'center:top',
			},
			steps: [
				{
					down: [{ actionId: 'overlay_visibility', options: { action: 'hide', overlayId: '' } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'overlay_visible',
					isInverted: true,
					options: { overlayId: '' },
					style: {
						png64: ICON_HIDE_OVERLAY,
						bgcolor: COLOR.amber,
						color: COLOR.ink,
					},
				},
			],
		}

		presets[`toggle_global_overlay`] = {
			type: 'button',
			category: `Overlays - Visibility`,
			name: `Toggle Overlay`,
			style: {
				text: `Toggle\\nOverlay`,
				size: '14',
				color: COLOR.white,
				bgcolor: COLOR.surface,
				show_topbar: false,
				alignment: 'center:bottom',
				png64: ICON_TOGGLE_OVERLAY,
				pngalignment: 'center:top',
			},
			steps: [
				{
					down: [{ actionId: 'overlay_visibility', options: { action: 'toggle', overlayId: '' } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'overlay_visible',
					options: { overlayId: '' },
					style: {
						png64: ICON_HIDE_OVERLAY,
						bgcolor: COLOR.amber,
						color: COLOR.ink,
					},
				},
			],
		}

		return
	}

	for (const overlay of self.overlayList) {
		addDivider(presets, `Overlays - Visibility`, `vis_header_${overlay.id}`, overlay.name)

		presets[`show_${overlay.id}`] = {
			type: 'button',
			category: `Overlays - Visibility`,
			name: `Show: ${overlay.name}`,
			style: {
				text: `Show\\n${overlay.name}`,
				size: '14',
				color: COLOR.white,
				bgcolor: COLOR.surface,
				show_topbar: false,
				alignment: 'center:bottom',
				png64: ICON_SHOW_OVERLAY,
				pngalignment: 'center:top',
			},
			steps: [
				{
					down: [{ actionId: 'overlay_visibility', options: { action: 'show', overlayId: overlay.id } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'overlay_visible',
					options: { overlayId: overlay.id },
					style: {
						bgcolor: COLOR.amber,
						color: COLOR.ink,
					},
				},
			],
		}

		presets[`hide_${overlay.id}`] = {
			type: 'button',
			category: `Overlays - Visibility`,
			name: `Hide: ${overlay.name}`,
			style: {
				text: `Hide\\n${overlay.name}`,
				size: '14',
				color: COLOR.white,
				bgcolor: COLOR.surface,
				show_topbar: false,
				alignment: 'center:bottom',
				png64: ICON_HIDE_OVERLAY,
				pngalignment: 'center:top',
			},
			steps: [
				{
					down: [{ actionId: 'overlay_visibility', options: { action: 'hide', overlayId: overlay.id } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'overlay_visible',
					isInverted: true,
					options: { overlayId: overlay.id },
					style: {
						bgcolor: COLOR.amber,
						color: COLOR.ink,
					},
				},
			],
		}

		presets[`toggle_${overlay.id}`] = {
			type: 'button',
			category: `Overlays - Visibility`,
			name: `Toggle: ${overlay.name}`,
			style: {
				text: `Toggle\\n${overlay.name}`,
				size: '14',
				color: COLOR.white,
				bgcolor: COLOR.surface,
				show_topbar: false,
				alignment: 'center:bottom',
				png64: ICON_TOGGLE_OVERLAY,
				pngalignment: 'center:top',
			},
			steps: [
				{
					down: [{ actionId: 'overlay_visibility', options: { action: 'toggle', overlayId: overlay.id } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'overlay_visible',
					options: { overlayId: overlay.id },
					style: {
						png64: ICON_HIDE_OVERLAY,
					},
				},
			],
		}
	}

	// Global show/hide all
	addDivider(presets, `Overlays - Visibility`, `vis_header_all`, 'All Overlays')

	presets['show_all_overlays'] = {
		type: 'button',
		category: `Overlays - Visibility`,
		name: 'Show All Overlays',
		style: {
			text: 'Show\\nAll',
			size: '14',
			color: COLOR.white,
			bgcolor: COLOR.surface,
			show_topbar: false,
			alignment: 'center:bottom',
			png64: ICON_SHOW_OVERLAY,
			pngalignment: 'center:top',
		},
		steps: [{ down: [{ actionId: 'overlay_visibility', options: { action: 'show_all' } }], up: [] }],
		feedbacks: [],
	}

	presets['hide_all_overlays'] = {
		type: 'button',
		category: `Overlays - Visibility`,
		name: 'Hide All Overlays',
		style: {
			text: 'Hide\\nAll',
			size: '14',
			color: COLOR.white,
			bgcolor: COLOR.surface,
			show_topbar: false,
			alignment: 'center:bottom',
			png64: ICON_HIDE_OVERLAY,
			pngalignment: 'center:top',
		},
		steps: [{ down: [{ actionId: 'overlay_visibility', options: { action: 'hide_all' } }], up: [] }],
		feedbacks: [],
	}
}
