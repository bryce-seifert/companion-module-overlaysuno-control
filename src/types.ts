/**
 * Shared domain types and constants used across the module.
 * Kept free of Companion UI concerns so API/state code can import them safely.
 */

/** JSON-compatible scalar values. */
export type JsonPrimitive = string | number | boolean | null

/** Recursive JSON value as returned by the Overlays.uno datastore. */
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

/** JSON object map — preferred over `Record<string, unknown>` for API payloads. */
export type JsonObject = { [key: string]: JsonValue }

/** Companion dropdown choice shape used throughout actions/feedbacks/presets. */
export interface DropdownChoice {
	id: string
	label: string
}

/**
 * Sentinel overlay id for single-overlay apps that don't expose GetOverlays.
 * Visibility and content lookups treat empty/`global` as this case.
 */
export const GLOBAL_OVERLAY_ID = 'global'

/** Fallback reconnect delay when a connect-time 429 has no Retry-After header. */
export const CONNECT_RETRY_SECONDS = 30

/**
 * Debounce window before refreshing /control after a mutating action whose response can't be applied directly.
 * /control can briefly lag behind a command, so don't read it back immediately.
 */
export const ACTION_REFRESH_DEBOUNCE_MS = 500

/** HTTP statuses we branch on from the Overlays.uno API. */
export const HttpStatus = {
	BadRequest: 400,
	NotFound: 404,
	TooManyRequests: 429,
	InternalServerError: 500,
} as const

/**
 * Known overlay field editor types from GetOverlayModels.
 * Using a const object (not a string enum) keeps values as plain strings for API interop.
 */
export const FieldType = {
	Text: 'text',
	Number: 'number',
	Counter: 'counter',
	NormalizedNumber: 'normalizednumber',
	Checkbox: 'checkbox',
	Selection: 'selection',
	Color: 'color',
	MetricFont: 'metricfont',
	Button: 'button',
	TimeControl: 'timecontrol',
	Json: 'json',
	Boolean: 'boolean',
	OverlaySelection: 'overlayselection',
	/** Read-only text shown in the control app; never written. */
	InfoText: 'infotext',
} as const

export type FieldTypeName = (typeof FieldType)[keyof typeof FieldType]

/** Field types that support numeric increment/decrement commands. */
export const NUMERIC_FIELD_TYPES: ReadonlySet<string> = new Set([
	FieldType.Number,
	FieldType.Counter,
	FieldType.NormalizedNumber,
])

/**
 * Field types that are triggered via Execute* commands rather than Set*.
 * Button runs a one-shot action; TimeControl exposes play/pause/reset/start.
 */
export const ACTION_FIELD_TYPES: ReadonlySet<string> = new Set([FieldType.Button, FieldType.TimeControl])

/** Field types the Toggle* commands can flip. */
export const TOGGLE_FIELD_TYPES: ReadonlySet<string> = new Set([FieldType.Checkbox, FieldType.Boolean])

/**
 * Control-node types the module does not surface.
 * Dropped when a model is loaded, so they never become actions, feedbacks, presets, or variables.
 * Add a type here to exclude it the same way.
 */
export const EXCLUDED_FIELD_TYPES: ReadonlySet<string> = new Set([FieldType.MetricFont])

/** True for a control node the module should leave out. Casing matches the API, which is not consistent. */
export function isExcludedFieldType(type: string): boolean {
	return EXCLUDED_FIELD_TYPES.has(type.toLowerCase())
}

/** Subcomposition animation state that means "on air". */
export const VISIBLE_SUBCOMPOSITION_STATE = 'In'

/** Animation state /control reports for a subcomposition that is off air. */
export const HIDDEN_SUBCOMPOSITION_STATE = 'Out1'

/** State to PATCH for "animate out": the default out animation (/control then reports it as 'Out1'). */
export const ANIMATE_OUT_STATE = 'Out'

/**
 * Content flag some single-overlay apps (e.g. Spin the Wheel) use as their real on-air state;
 * their subcompositions can all read off air while the overlay is shown.
 */
export const GLOBAL_VISIBILITY_FIELD = 'ShowOverlay'
