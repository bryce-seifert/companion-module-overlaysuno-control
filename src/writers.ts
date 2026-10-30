import type { ModuleInstance } from './main.js'
import type { ApiPayload } from './api.js'
import type { VisibilityAction } from './app-shape.js'
import { ANIMATE_OUT_STATE, VISIBLE_SUBCOMPOSITION_STATE, type JsonObject, type JsonValue } from './types.js'
import { toFiniteNumber } from './util.js'

/**
 * Writes one target's fields, whatever the transport. `targetId` is the overlay/subcomposition id
 * (ignored for customization, which has a single target).
 */
export interface FieldWriter {
	setAll(targetId: string, values: JsonObject): Promise<void>
	set(targetId: string, fieldId: string, value: JsonValue): Promise<void>
	adjust(targetId: string, fieldId: string, operation: 'increment' | 'decrement', step: JsonValue): Promise<void>
	toggle(targetId: string, fieldId: string): Promise<void>
	/** Runs a button / time-control function, or null when the transport has no way to. */
	execute: ((targetId: string, fieldId: string, fn: string) => Promise<void>) | null
	/** Last known value, so a written value can keep the field's stored type. */
	stored(targetId: string, fieldId: string): JsonValue | undefined
	/** Live values for Learn. */
	fetchValues(targetId: string): Promise<JsonObject | undefined>
}

interface FieldCommands {
	/** SetOverlayContent takes the values as `content`, SetCustomization as `value`. */
	setAll: { command: string; key: 'content' | 'value' }
	set: string
	increment: string
	decrement: string
	toggle: string
	execute: string
}

function commandFieldWriter(
	self: ModuleInstance,
	commands: FieldCommands,
	target: (targetId: string) => Partial<ApiPayload>,
	values: (targetId: string) => JsonObject | undefined,
	fetchValues: (targetId: string) => Promise<JsonObject | undefined>,
): FieldWriter {
	const send = async (command: string, targetId: string, extra: Partial<ApiPayload>) =>
		self.sendAndRefresh({ ...target(targetId), ...extra, command })

	return {
		setAll: async (targetId, values) => send(commands.setAll.command, targetId, { [commands.setAll.key]: values }),
		set: async (targetId, fieldId, value) => send(commands.set, targetId, { fieldId, value }),
		adjust: async (targetId, fieldId, operation, step) => send(commands[operation], targetId, { fieldId, value: step }),
		toggle: async (targetId, fieldId) => send(commands.toggle, targetId, { fieldId }),
		execute: async (targetId, fieldId, fn) => send(commands.execute, targetId, { fieldId, value: fn }),
		stored: (targetId, fieldId) => values(targetId)?.[fieldId],
		fetchValues,
	}
}

/** PATCH /control has no field commands, so increments and toggles are worked out from the last known value. */
function patchFieldWriter(self: ModuleInstance): FieldWriter {
	const stored = (targetId: string, fieldId: string) => self.contentValues(targetId)?.[fieldId]
	const set = async (targetId: string, fieldId: string, value: JsonValue) =>
		self.sendControlPatch({ subCompositionId: targetId, payload: { [fieldId]: value } })

	return {
		setAll: async (targetId, values) => self.sendControlPatch({ subCompositionId: targetId, payload: values }),
		set,
		adjust: async (targetId, fieldId, operation, step) => {
			const delta = toFiniteNumber(step, 1) * (operation === 'increment' ? 1 : -1)
			await set(targetId, fieldId, toFiniteNumber(stored(targetId, fieldId), 0) + delta)
		},
		toggle: async (targetId, fieldId) => {
			const current = stored(targetId, fieldId)
			// Some apps store the flag as a string.
			await set(targetId, fieldId, !(current === true || current === 'true'))
		},
		execute: null,
		stored,
		fetchValues: async (targetId) => self.fetchLiveContent(targetId),
	}
}

/** Writer for overlay content fields, or null when the app's fields can't be written. */
export function contentWriter(self: ModuleInstance): FieldWriter | null {
	switch (self.shape.contentTransport) {
		case 'commands':
			return commandFieldWriter(
				self,
				{
					setAll: { command: 'SetOverlayContent', key: 'content' },
					set: 'SetOverlayContentField',
					increment: 'IncrementOverlayContentField',
					decrement: 'DecrementOverlayContentField',
					toggle: 'ToggleOverlayContentField',
					execute: 'ExecuteOverlayContentField',
				},
				(targetId) => ({ id: targetId }),
				(targetId) => self.contentValues(targetId),
				async (targetId) => self.fetchLiveContent(targetId),
			)
		case 'patch':
			return patchFieldWriter(self)
		case null:
			return null
	}
}

/** Customization is only described (and written) through commands. */
export function customizationWriter(self: ModuleInstance): FieldWriter {
	return commandFieldWriter(
		self,
		{
			setAll: { command: 'SetCustomization', key: 'value' },
			set: 'SetCustomizationField',
			increment: 'IncrementCustomizationField',
			decrement: 'DecrementCustomizationField',
			toggle: 'ToggleCustomizationField',
			execute: 'ExecuteCustomizationField',
		},
		() => ({}),
		() => self.customizationValues,
		async () => self.fetchLiveCustomization(),
	)
}

/** Show, hide or toggle one graphic (or all, over commands) with the app's visibility transport. */
export async function applyVisibility(
	self: ModuleInstance,
	action: VisibilityAction,
	overlayId: string,
): Promise<void> {
	if (self.shape.visibilityTransport === 'patch') {
		const show = action.id === 'toggle' ? !self.isOverlayVisible(overlayId) : action.id === 'show'
		await self.sendControlPatch({
			subCompositionId: overlayId,
			state: show ? VISIBLE_SUBCOMPOSITION_STATE : ANIMATE_OUT_STATE,
		})
		return
	}

	const payload: ApiPayload = { command: action.command }
	if (!action.bulk && overlayId) payload.id = overlayId
	await self.sendAndRefresh(payload)
}
