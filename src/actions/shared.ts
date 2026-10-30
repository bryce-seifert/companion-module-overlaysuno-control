import type { OverlayModel } from '../api.js'
import type { ModuleInstance } from '../main.js'
import type { DropdownChoice } from '../types.js'

/** Overlays the visibility action and feedback target. Single-overlay apps get one choice, addressed with ''. */
export function graphicChoices(self: ModuleInstance): DropdownChoice[] {
	const { graphics } = self.shape
	if (graphics.length === 0) return [{ id: '', label: 'No overlays loaded' }]
	return graphics.map((graphic) => ({ id: graphic.id, label: graphic.name }))
}

/** Dropdown choices for a set of overlay models, or a placeholder when there are none. */
export function modelChoices(models: OverlayModel[]): DropdownChoice[] {
	if (models.length === 0) return [{ id: '', label: 'No overlays loaded' }]
	return models.map((model) => ({ id: model.id, label: model.name }))
}

export const EXECUTE_FUNCTION_CHOICES: DropdownChoice[] = [
	{ id: 'execute', label: 'Execute' },
	{ id: 'play', label: 'Play' },
	{ id: 'pause', label: 'Pause' },
	{ id: 'reset', label: 'Reset' },
	{ id: 'start', label: 'Start' },
]
