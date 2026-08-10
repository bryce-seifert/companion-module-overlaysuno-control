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

/** Default poll interval (seconds) when the config value is missing or zero. */
export const DEFAULT_POLL_INTERVAL_SECONDS = 60

/** Fallback reconnect delay when a connect-time 429 has no Retry-After header. */
export const CONNECT_RETRY_SECONDS = 30

/** Debounce window before refreshing /control after a mutating action. */
export const ACTION_REFRESH_DEBOUNCE_MS = 250

/** HTTP statuses we branch on from the Overlays.uno API. */
export const HttpStatus = {
	BadRequest: 400,
	NotFound: 404,
	TooManyRequests: 429,
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
	OverlaySelection: 'overlaySelection',
} as const

export type FieldTypeName = (typeof FieldType)[keyof typeof FieldType]

/** Field types that support numeric increment/decrement commands. */
export const NUMERIC_FIELD_TYPES: ReadonlySet<string> = new Set([
	FieldType.Number,
	FieldType.Counter,
	FieldType.NormalizedNumber,
])

/**
 * Field types whose live values are structured JSON (e.g. font specs).
 * These are useless as button text — presets should show only the field label.
 */
export const STRUCTURED_FIELD_TYPES: ReadonlySet<string> = new Set([FieldType.MetricFont])

/** Subcomposition animation state that means "on air". */
export const VISIBLE_SUBCOMPOSITION_STATE = 'In'
