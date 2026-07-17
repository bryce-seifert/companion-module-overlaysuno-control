const BASE_URL = 'https://app.overlays.uno/apiv2/controlapps'

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface ApiPayload {
	command: string
	id?: string
	fieldId?: string
	value?: string | number | boolean | Record<string, unknown>
	content?: Record<string, unknown>
	// Schema-defined commands (see schema-commands.ts) send arbitrary argument ids as extra keys.
	[argId: string]: unknown
}

export interface OverlayInfo {
	id: string
	name: string
	visible: boolean
}

export interface OverlayFieldSelection {
	id: string | number
	title: string
}

export interface OverlayModelField {
	defaultValue: unknown
	id: string
	immediateUpdate: boolean
	index: number
	resetValue: unknown
	title: string
	// Field editor type, e.g. 'text', 'number', 'checkbox', 'selection', 'color', 'metricfont'.
	type: string
	// Present when type is 'selection' - the allowed enum values.
	selections?: OverlayFieldSelection[]
}

export interface OverlayModelGroup {
	id: string
	title: string
	// Field ids belonging to this group, in display order.
	childIds: string[]
	toolTip?: string
	width?: string
}

export interface OverlayModel {
	// Same overlay identifier as OverlayInfo.id - see the note there.
	id: string
	name: string
	model: OverlayModelField[]
	groups: OverlayModelGroup[]
	hasSlots: boolean
}

export interface ApiResponse {
	status: number
	result: string
	payload?: unknown
}

export interface ControlSubComposition {
	subCompositionId: string
	subCompositionName: string
	// True for the app-level composition, whose payload holds the customization values.
	mainComposition: boolean
	// Animation state. 'In' means on air; anything else ('Out1', ...) means hidden.
	state: string
	payload?: Record<string, unknown>
}

// Whether a subcomposition is currently on air.
export function isSubCompositionVisible(sub: ControlSubComposition): boolean {
	return sub.state === 'In'
}

// Whether a subcomposition carries data of its own
export function hasPayload(sub: ControlSubComposition): boolean {
	return Object.keys(sub.payload ?? {}).length > 0
}

// ----------------------------------------------------------------
// Discovery types (from GET /api/json)
// ----------------------------------------------------------------

export interface AppInfo {
	name: string
	thumbnail: string
	datastoreId: string
}

export interface CommandArgument {
	id: string
	title: string
	type: string
	default?: string
	required?: boolean
	min?: number
	max?: number
	// Present when type is 'selection' - the allowed enum values.
	selections?: OverlayFieldSelection[]
}

export interface CommandEntry {
	command: string
	title?: string
	arguments?: CommandArgument[]
}

export interface GroupEntry {
	group: string
}

export type ApiCommandEntry = CommandEntry | GroupEntry

// ----------------------------------------------------------------
// Error class
// ----------------------------------------------------------------

export class ApiError extends Error {
	constructor(
		public statusCode: number,
		message: string,
		// Seconds to wait before retrying, from the Retry-After header. Only set on 429s.
		public retryAfter?: number,
	) {
		super(message)
		this.name = 'ApiError'
	}
}

// The API rejected the request because we're over its rate limit - a transient condition.
export function isRateLimitError(e: unknown): e is ApiError {
	return e instanceof ApiError && e.statusCode === 429
}

// The app doesn't implement this command at all - a permanent condition for this token.
export function isUnsupportedCommandError(e: unknown): e is ApiError {
	return e instanceof ApiError && e.statusCode === 400
}

// ----------------------------------------------------------------
// Core request function
// ----------------------------------------------------------------

export async function sendCommand(apiToken: string, payload: ApiPayload): Promise<ApiResponse> {
	const url = `${BASE_URL}/${apiToken}/api`

	const response = await fetch(url, {
		method: 'PUT',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify(payload),
	})

	if (!response.ok) {
		// Read the response body to get the actual error detail from the API
		let errorBody = ''
		try {
			errorBody = await response.text()
		} catch {
			// ignore if we can't read the body
		}

		const detail = errorBody ? ` - ${errorBody}` : ''

		if (response.status === 429) {
			// The body just restates "Rate limit exceeded" - callers render their own guidance,
			// so keep the message clean rather than echoing the raw JSON back into the log.
			const retryAfter = Number(response.headers.get('retry-after'))
			throw new ApiError(
				429,
				`Rate limit exceeded for ${payload.command}`,
				Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
			)
		}
		if (response.status === 404) {
			throw new ApiError(404, `Resource not found - check your API token${detail}`)
		}
		throw new ApiError(
			response.status,
			`HTTP ${response.status} for ${payload.command}${payload.id ? ` (id: ${payload.id})` : ''}${detail}`,
		)
	}

	try {
		const data = (await response.json()) as ApiResponse
		return data
	} catch {
		// Some commands may return empty responses on success
		return { status: response.status, result: 'ok' }
	}
}

// ----------------------------------------------------------------
// Convenience helpers
// ----------------------------------------------------------------

export async function getOverlays(apiToken: string): Promise<OverlayInfo[]> {
	const res = await sendCommand(apiToken, { command: 'GetOverlays' })
	return (res.payload as OverlayInfo[]) ?? []
}

export async function getOverlayModels(apiToken: string): Promise<OverlayModel[]> {
	const res = await sendCommand(apiToken, { command: 'GetOverlayModels' })
	return (res.payload as OverlayModel[]) ?? []
}

export async function getCustomizationModel(apiToken: string): Promise<OverlayModel | null> {
	const res = await sendCommand(apiToken, { command: 'GetCustomizationModel' })
	return (res.payload as OverlayModel) ?? null
}

// ----------------------------------------------------------------
// Discovery helpers (GET endpoints)
// ----------------------------------------------------------------

export async function getAppInfo(apiToken: string): Promise<AppInfo> {
	const url = `${BASE_URL}/${apiToken}`

	const response = await fetch(url, {
		method: 'GET',
		redirect: 'follow',
	})

	if (!response.ok) {
		let errorBody = ''
		try {
			errorBody = await response.text()
		} catch {
			// ignore
		}
		throw new ApiError(
			response.status,
			`Failed to validate token: HTTP ${response.status}${errorBody ? ` - ${errorBody}` : ''}`,
		)
	}

	const json = (await response.json()) as AppInfo
	return json
}

// Normalize the thumbnail URL from AppInfo
export function normalizeThumbnailUrl(thumbnail: string): string {
	if (!thumbnail) return ''
	let url = thumbnail.trim()
	if (url.startsWith('//')) {
		url = `https:${url}`
	} else if (!/^https?:\/\//i.test(url)) {
		url = `https://${url}`
	}
	return url.replace('fit-in/150x150', 'fit-in/288x288')
}

// Fetch the app thumbnail and return it as a base64 data URI suitable for a button's
// `png64`. Returns null if there is no thumbnail or the fetch fails.
export async function fetchThumbnailDataUri(thumbnail: string): Promise<string | null> {
	const url = normalizeThumbnailUrl(thumbnail)
	if (!url) return null

	const response = await fetch(url, { method: 'GET', redirect: 'follow' })
	if (!response.ok) {
		throw new ApiError(response.status, `Failed to fetch thumbnail: HTTP ${response.status}`)
	}

	const contentType = response.headers.get('content-type') ?? 'image/png'
	const buffer = Buffer.from(await response.arrayBuffer())
	return `data:${contentType};base64,${buffer.toString('base64')}`
}

// Fetch the app's live datastore
export async function getControlState(apiToken: string): Promise<ControlSubComposition[]> {
	const url = `${BASE_URL}/${apiToken}/control`

	const response = await fetch(url, { method: 'GET', redirect: 'follow' })

	if (!response.ok) {
		let errorBody = ''
		try {
			errorBody = await response.text()
		} catch {
			// ignore
		}
		if (response.status === 429) {
			const retryAfter = Number(response.headers.get('retry-after'))
			throw new ApiError(
				429,
				`Rate limit exceeded for /control`,
				Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
			)
		}
		throw new ApiError(
			response.status,
			`Failed to fetch control state: HTTP ${response.status}${errorBody ? ` - ${errorBody}` : ''}`,
		)
	}

	const json = (await response.json()) as ControlSubComposition[]
	return Array.isArray(json) ? json : []
}

export async function getApiSchema(apiToken: string): Promise<ApiCommandEntry[]> {
	const url = `${BASE_URL}/${apiToken}/api/json`

	const response = await fetch(url, {
		method: 'GET',
		redirect: 'follow',
	})

	if (!response.ok) {
		let errorBody = ''
		try {
			errorBody = await response.text()
		} catch {
			// ignore
		}
		throw new ApiError(
			response.status,
			`Failed to fetch API schema: HTTP ${response.status}${errorBody ? ` - ${errorBody}` : ''}`,
		)
	}

	const json = (await response.json()) as ApiCommandEntry[]
	return json
}

// Extract the set of command names from an API schema.
export function getAvailableCommands(schema: ApiCommandEntry[]): Set<string> {
	const commands = new Set<string>()
	for (const entry of schema) {
		if ('command' in entry) {
			commands.add(entry.command)
		}
	}
	return commands
}
