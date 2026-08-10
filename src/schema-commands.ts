import type { InputValue, SomeCompanionActionInputField } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import type { CommandArgument } from './api.js'
import { isCommandEntry, isGroupEntry } from './api.js'
import { FieldType, type DropdownChoice, type JsonValue } from './types.js'
import { asOptionString, toFiniteNumber } from './util.js'

/**
 * Commands already backed by dedicated actions/presets — never expose these as
 * generated schema actions (would duplicate the hand-written UI).
 */
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
	/** Schema group the command belongs to (e.g. "Timer"), or null if ungrouped. */
	group: string | null
	arguments: CommandArgument[]
}

/** Title-case a command label, e.g. "set timer" -> "Set Timer". */
export function titleCase(s: string): string {
	return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

/** App-specific schema commands that still need generated actions/presets. */
export function collectSchemaCommands(self: ModuleInstance): SchemaCommand[] {
	const commands: SchemaCommand[] = []
	let currentGroup: string | null = null

	for (const entry of self.commandSchema) {
		if (isGroupEntry(entry)) {
			currentGroup = entry.group
			continue
		}
		if (!isCommandEntry(entry)) continue
		if (HANDLED_COMMANDS.has(entry.command)) continue
		// Discovery Get* commands are never useful as user-facing actions.
		if (entry.command.startsWith('Get')) continue

		commands.push({
			command: entry.command,
			title: entry.title ?? entry.command,
			group: currentGroup,
			arguments: entry.arguments ?? [],
		})
	}

	return commands
}

function isNumericArgType(type: string): boolean {
	return type === FieldType.Number || type === FieldType.Counter || type === FieldType.NormalizedNumber
}

function isBooleanArgType(type: string): boolean {
	return type === FieldType.Checkbox || type === FieldType.Boolean
}

function isJsonArgType(type: string): boolean {
	return type === FieldType.Json || type === 'JSON'
}

/**
 * Build the Companion option input for a single command argument.
 * `overlayChoices` seeds the dropdown for `overlaySelection` arguments.
 */
export function argInput(arg: CommandArgument, overlayChoices: DropdownChoice[]): SomeCompanionActionInputField {
	const label = arg.title || arg.id

	if (isNumericArgType(arg.type)) {
		return {
			id: arg.id,
			type: 'number',
			label,
			default: toFiniteNumber(arg.default, 0),
			min: toFiniteNumber(arg.min, 0),
			// min/max are visual hints only; fall back to the widest safe range.
			max: toFiniteNumber(arg.max, Number.MAX_SAFE_INTEGER),
		}
	}

	if (isJsonArgType(arg.type)) {
		return { id: arg.id, type: 'textinput', label, default: arg.default ?? '{}', useVariables: true }
	}

	if (isBooleanArgType(arg.type)) {
		return { id: arg.id, type: 'checkbox', label, default: arg.default === 'true' }
	}

	if (arg.type === FieldType.Selection) {
		return {
			id: arg.id,
			type: 'dropdown',
			label,
			choices: (arg.selections ?? []).map((s) => ({ id: s.id, label: s.title })),
			default: arg.default ?? arg.selections?.[0]?.id ?? '',
			allowCustom: true,
		}
	}

	if (arg.type === FieldType.OverlaySelection) {
		return {
			id: arg.id,
			type: 'dropdown',
			label,
			choices: overlayChoices,
			default: overlayChoices[0]?.id ?? '',
			allowCustom: true,
		}
	}

	return { id: arg.id, type: 'textinput', label, default: arg.default ?? '', useVariables: true }
}

/** Default option value for a command argument, used to seed generated presets. */
export function argDefault(arg: CommandArgument): InputValue {
	if (isNumericArgType(arg.type)) return toFiniteNumber(arg.default, 0)
	if (isBooleanArgType(arg.type)) return arg.default === 'true'
	if (arg.type === FieldType.Selection) return arg.default ?? arg.selections?.[0]?.id ?? ''
	return arg.default ?? ''
}

/** Resolve a submitted option value into the payload value the API expects. */
export function resolveArg(arg: CommandArgument, raw: unknown): JsonValue {
	if (isNumericArgType(arg.type)) return toFiniteNumber(raw, 0)
	if (isJsonArgType(arg.type)) return JSON.parse(asOptionString(raw)) as JsonValue
	if (isBooleanArgType(arg.type)) return raw === true
	return asOptionString(raw)
}
