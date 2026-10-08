import type { OverlayModel } from '../api.js'
import type { ModuleInstance } from '../main.js'
import type { DropdownChoice } from '../types.js'

export function overlayChoices(self: ModuleInstance): DropdownChoice[] {
	if (self.overlayChoices.length > 0) return self.overlayChoices
	// Apps that don't implement GetOverlays are single-overlay — target with an empty id.
	const label = self.unsupportedCommands.has('GetOverlays') ? 'Default (single overlay)' : 'No overlays loaded'
	return [{ id: '', label }]
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
