import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import type { ApiPayload } from '../api.js'
import { collectSchemaCommands, argInput, resolveArg, titleCase } from '../schema-commands.js'
import { overlayChoices } from './shared.js'

export function getSchemaActions(self: ModuleInstance): CompanionActionDefinitions {
	const actions: CompanionActionDefinitions = {}
	const choices = overlayChoices(self)

	for (const cmd of collectSchemaCommands(self)) {
		const label = titleCase(cmd.title)
		actions[`schema_${cmd.command}`] = {
			name: cmd.group ? `${cmd.group} - ${label}` : label,
			options: cmd.arguments.map((arg) => argInput(arg, choices)),
			callback: async (event) => {
				const payload: ApiPayload = { command: cmd.command }
				try {
					for (const arg of cmd.arguments) {
						payload[arg.id] = resolveArg(arg, event.options[arg.id])
					}
				} catch (e) {
					self.log('error', `${cmd.command}: invalid option value - ${e}`)
					return
				}
				await self.sendAndRefresh(payload)
			},
		}
	}

	return actions
}
