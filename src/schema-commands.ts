import type { InputValue, SomeCompanionActionInputField } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import type { CommandArgument } from './api.js'

// Commands backed by dedicated actions/presets, never expose these as schema actions
const HANDLED_COMMANDS = new Set([
	'ShowOverlay',
	'HideOverlay',
	'ToggleOverlay',
	'ShowAllOverlays',
	'HideAllOverlays',
	'GetOverlayVisibility',
	'GetOverlays',
	'GetOverlayModel',
	'GetOverlayModels',
	'GetOverlayContent',
	'SetOverlayContent',
	'ChangeOverlayField',
	'SetOverlayContentField',
	'IncrementOverlayContentField',
	'DecrementOverlayContentField',
	'ToggleOverlayContentField',
	'ExecuteOverlayContentField',
	'TakeOverlayFirstSlot',
	'TakeOverlayNextSlot',
	'TakeOverlayPreviousSlot',
	'TakeOverlayLastSlot',
	'TakeOverlaySlotName',
	'TakeOverlaySlotNumber',
	'SetCustomization',
	'SetCustomizationField',
	'SetCustomizationContent',
	'ChangeCustomizationField',
	'IncrementCustomizationField',
	'DecrementCustomizationField',
	'ToggleCustomizationField',
	'ExecuteCustomizationField',
	'GetCustomization',
	'GetCustomizationModel',
])

export interface SchemaCommand {
	command: string
	title: string
	// Schema group the command belongs to (e.g. "Timer"), or null if ungrouped.
	group: string | null
	arguments: CommandArgument[]
}

// Title-case a command label, e.g. "set timer" -> "Set Timer".
export function titleCase(s: string): string {
	return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

// Return the app-specific commands with their own actions/presets
export function collectSchemaCommands(self: ModuleInstance): SchemaCommand[] {
	const commands: SchemaCommand[] = []
	let group: string | null = null

	for (const entry of self.commandSchema) {
		if ('group' in entry) {
			group = entry.group
			continue
		}
		if (HANDLED_COMMANDS.has(entry.command)) continue
		if (entry.command.startsWith('Get')) continue

		commands.push({
			command: entry.command,
			title: entry.title ?? entry.command,
			group,
			arguments: entry.arguments ?? [],
		})
	}

	return commands
}

function toNumber(value: unknown, fallback: number): number {
	const n = Number(value)
	return Number.isFinite(n) ? n : fallback
}

// Coerce an option value to a string without Object stringification.
function asString(value: unknown): string {
	if (typeof value === 'string') return value
	if (typeof value === 'number' || typeof value === 'boolean') return String(value)
	return ''
}

// Build the action option input for a single command argument, typed by its schema type.
// `overlayChoices` seeds the dropdown for `overlaySelection` arguments.
export function argInput(
	arg: CommandArgument,
	overlayChoices: { id: string; label: string }[],
): SomeCompanionActionInputField {
	const label = arg.title || arg.id

	switch (arg.type) {
		case 'number':
		case 'counter':
		case 'normalizednumber':
			return {
				id: arg.id,
				type: 'number',
				label,
				default: toNumber(arg.default, 0),
				min: toNumber(arg.min, 0),
				// min/max are visual hints only; fall back to the widest safe range rather
				max: toNumber(arg.max, Number.MAX_SAFE_INTEGER),
			}
		case 'json':
		case 'JSON':
			return { id: arg.id, type: 'textinput', label, default: arg.default ?? '{}', useVariables: true }
		case 'checkbox':
		case 'boolean':
			return { id: arg.id, type: 'checkbox', label, default: arg.default === 'true' }
		case 'selection':
			return {
				id: arg.id,
				type: 'dropdown',
				label,
				choices: (arg.selections ?? []).map((s) => ({ id: s.id, label: s.title })),
				default: arg.default ?? arg.selections?.[0]?.id ?? '',
				allowCustom: true,
			}
		case 'overlaySelection':
			return {
				id: arg.id,
				type: 'dropdown',
				label,
				choices: overlayChoices,
				default: overlayChoices[0]?.id ?? '',
				allowCustom: true,
			}
		default:
			return { id: arg.id, type: 'textinput', label, default: arg.default ?? '', useVariables: true }
	}
}

// Default option value for a command argument, used to seed generated presets.
export function argDefault(arg: CommandArgument): InputValue {
	switch (arg.type) {
		case 'number':
		case 'counter':
		case 'normalizednumber':
			return toNumber(arg.default, 0)
		case 'checkbox':
		case 'boolean':
			return arg.default === 'true'
		case 'selection':
			return arg.default ?? arg.selections?.[0]?.id ?? ''
		default:
			return arg.default ?? ''
	}
}

// Resolve a submitted option value into the payload value the API expects for this argument.
export function resolveArg(arg: CommandArgument, raw: unknown): unknown {
	switch (arg.type) {
		case 'number':
		case 'counter':
		case 'normalizednumber':
			return toNumber(raw, 0)
		case 'json':
		case 'JSON':
			return JSON.parse(asString(raw))
		case 'checkbox':
		case 'boolean':
			return raw === true
		default:
			return asString(raw)
	}
}
