import type { JsonObject, JsonValue } from './types.js'

/** Coerce an unknown thrown value into a message suitable for logging/status. */
export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

/** Mask an API token for debug logs (keeps first/last 4 chars when long enough). */
export function maskApiToken(token: string): string {
	if (token.length <= 8) return '****'
	return `${token.slice(0, 4)}…${token.slice(-4)}`
}

/**
 * Parse a JSON object from a string option.
 * Returns a Result so callers can log without try/catch nesting.
 */
export function parseJsonObject(raw: string): { ok: true; value: JsonObject } | { ok: false; error: string } {
	try {
		const parsed: unknown = JSON.parse(raw)
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			return { ok: false, error: 'expected a JSON object' }
		}
		return { ok: true, value: parsed as JsonObject }
	} catch (error) {
		return { ok: false, error: errorMessage(error) }
	}
}

/** Best-effort parse: JSON when valid, otherwise the original string. */
export function parseJsonValueOrString(raw: string): JsonValue | string {
	try {
		return JSON.parse(raw) as JsonValue
	} catch {
		return raw
	}
}

/** Narrow unknown to a plain object (not null/array). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Coerce unknown to a finite number, or return the fallback. */
export function toFiniteNumber(value: unknown, fallback: number): number {
	const n = Number(value)
	return Number.isFinite(n) ? n : fallback
}

/** Coerce an option value to a string without Object stringification. */
export function asOptionString(value: unknown): string {
	if (typeof value === 'string') return value
	if (typeof value === 'number' || typeof value === 'boolean') return String(value)
	return ''
}
