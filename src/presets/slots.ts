import type { CompanionPresetDefinitions } from '@companion-module/base'
import type { OverlayModel } from '../api.js'
import { iconButtonStyle } from '../style.js'
import { ICON_SLOT_TAKE_FIRST, ICON_SLOT_TAKE_PREVIOUS, ICON_SLOT_TAKE_NEXT, ICON_SLOT_TAKE_LAST } from '../icons.js'

export function buildSlotPresets(model: OverlayModel, presets: CompanionPresetDefinitions): void {
	const category = `${model.name} - Slots`

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
			name: `${model.name} - ${sa.label}`,
			style: iconButtonStyle(`${sa.label}`, sa.icon),
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
