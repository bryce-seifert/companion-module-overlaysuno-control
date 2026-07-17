import type { CompanionPresetDefinitions } from '@companion-module/base'
import type { OverlayModel } from '../api.js'
import { COLOR } from '../style.js'
import { ICON_SLOT_TAKE_FIRST, ICON_SLOT_TAKE_PREVIOUS, ICON_SLOT_TAKE_NEXT, ICON_SLOT_TAKE_LAST } from '../icons.js'

export function buildSlotPresets(model: OverlayModel, presets: CompanionPresetDefinitions): void {
	const category = `Overlay - ${model.name} - Slots`

	const slotActions: { id: string; mode: string; label: string; icon: string }[] = [
		{ id: 'first', mode: 'first', label: 'First Slot', icon: ICON_SLOT_TAKE_FIRST },
		{ id: 'prev', mode: 'previous', label: 'Prev Slot', icon: ICON_SLOT_TAKE_PREVIOUS },
		{ id: 'next', mode: 'next', label: 'Next Slot', icon: ICON_SLOT_TAKE_NEXT },
		{ id: 'last', mode: 'last', label: 'Last Slot', icon: ICON_SLOT_TAKE_LAST },
	]

	for (const sa of slotActions) {
		presets[`slot_${sa.id}_${model.id}`] = {
			type: 'button',
			category,
			name: `Overlay - ${model.name} - ${sa.label}`,
			style: {
				text: `${sa.label}`,
				size: '14',
				color: COLOR.white,
				bgcolor: COLOR.surface,
				show_topbar: false,
				alignment: 'center:bottom',
				png64: sa.icon,
				pngalignment: 'center:top',
			},
			steps: [
				{
					down: [
						{
							actionId: 'take_overlay_slot',
							options: { overlayId: model.id, mode: sa.mode },
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}
	}
}
