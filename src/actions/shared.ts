import type { ModuleInstance } from '../main.js'

export function overlayChoices(self: ModuleInstance): { id: string; label: string }[] {
	if (self.overlayChoices.length > 0) return self.overlayChoices
	// Apps that don't implement GetOverlays are single-overlay - the action targets it with an empty id.
	const label = self.unsupportedCommands.has('GetOverlays') ? 'Default (single overlay)' : 'No overlays loaded'
	return [{ id: '', label }]
}

export const EXECUTE_FUNCTION_CHOICES = [
	{ id: 'execute', label: 'Execute' },
	{ id: 'play', label: 'Play' },
	{ id: 'pause', label: 'Pause' },
	{ id: 'reset', label: 'Reset' },
	{ id: 'start', label: 'Start' },
]
