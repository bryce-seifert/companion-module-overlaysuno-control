import type { CompanionPresetDefinitions, CompanionButtonPresetDefinition, InputValue } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import { COLOR } from '../style.js'
import { collectSchemaCommands, argDefault, titleCase } from '../schema-commands.js'
import { resolveVisibilityField } from '../inferred-model.js'

// State indicator for a generated Show/Hide/Toggle button, when the command can be traced back
// to a boolean field in the datastore. A Hide button lights while the thing is *hidden*, so it
// is the same feedback inverted - matching the hand-written presets in visibility.ts.
function visibilityFeedbacks(self: ModuleInstance, command: string): CompanionButtonPresetDefinition['feedbacks'] {
	const target = resolveVisibilityField(self, command)
	if (!target) return []

	return [
		{
			feedbackId: 'overlay_content_field',
			isInverted: command.startsWith('Hide'),
			options: { overlayId: target.overlayId, fieldId: target.fieldId, value_boolean: true },
			style: {
				bgcolor: COLOR.amber,
				color: COLOR.ink,
			},
		},
	]
}

export function buildSchemaPresets(self: ModuleInstance, presets: CompanionPresetDefinitions): void {
	const appName = self.appInfo?.name ?? 'Overlays Uno'

	for (const cmd of collectSchemaCommands(self)) {
		const category = cmd.group ? `${appName} - ${cmd.group}` : appName
		const displayName = titleCase(cmd.title)

		const options: Record<string, InputValue> = {}
		for (const arg of cmd.arguments) {
			options[arg.id] = argDefault(arg)
		}

		presets[`schema_${cmd.command}`] = {
			type: 'button',
			category,
			name: displayName,
			style: {
				text: displayName.replace(/ /g, '\\n'),
				size: 15,
				color: COLOR.white,
				bgcolor: COLOR.surface,
				show_topbar: false,
				alignment: 'center:center',
			},
			steps: [{ down: [{ actionId: `schema_${cmd.command}`, options }], up: [] }],
			feedbacks: visibilityFeedbacks(self, cmd.command),
		}
	}
}
