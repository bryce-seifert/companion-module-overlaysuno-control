import { FieldType, HttpStatus, VISIBLE_SUBCOMPOSITION_STATE, type JsonObject, type JsonValue } from './types.js'
import { isPlainObject } from './util.js'

const BASE_URL = 'https://app.overlays.uno/apiv2/controlapps'

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

/**
 * Command payload sent via PUT /api.
 * Known keys are typed; schema-defined commands may add extra argument ids.
 */
export type ApiPayload = {
	command: string
	id?: string
	fieldId?: string
	value?: JsonValue
	content?: JsonObject
} & Record<string, JsonValue | undefined>

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
	defaultValue: JsonValue
	id: string
	immediateUpdate: boolean
	index: number
	resetValue: JsonValue
	title: string
	/** Field editor type, e.g. 'text', 'number', 'checkbox', 'selection', 'color'. */
	type: string
	/** Present when type is 'selection' — the allowed enum values. */
	selections?: OverlayFieldSelection[]
	/** 'url' when the real selections must be fetched from `sourceUrl`. */
	source?: string
	/** Asset URL holding the real selections; often protocol-relative. */
	sourceUrl?: string
}

export interface OverlayModelGroup {
	id: string
	title: string
	/** Field ids belonging to this group, in display order. */
	childIds: string[]
	toolTip?: string
	width?: string
}

export interface OverlayModel {
	/** Same overlay identifier as OverlayInfo.id. */
	id: string
	name: string
	model: OverlayModelField[]
	groups: OverlayModelGroup[]
	hasSlots: boolean
}

export interface ApiResponse {
	status: number
	result: string
	payload?: JsonValue
}

export interface ControlSubComposition {
	subCompositionId: string
	subCompositionName: string
	/** True for the app-level composition, whose payload holds customization values. */
	mainComposition: boolean
	/** Animation state. 'In' means on air; anything else means hidden. */
	state: string
	payload?: JsonObject
}

/** Whether a subcomposition is currently on air. */
export function isSubCompositionVisible(sub: ControlSubComposition): boolean {
	return sub.state === VISIBLE_SUBCOMPOSITION_STATE
}

/** Whether a subcomposition carries data of its own. */
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
	/** Present when type is 'selection' — the allowed enum values. */
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

export function isCommandEntry(entry: ApiCommandEntry): entry is CommandEntry {
	return 'command' in entry
}

export function isGroupEntry(entry: ApiCommandEntry): entry is GroupEntry {
	return 'group' in entry
}

// ----------------------------------------------------------------
// Error class
// ----------------------------------------------------------------

export class ApiError extends Error {
	constructor(
		public statusCode: number,
		message: string,
		/** Seconds to wait before retrying, from Retry-After. Only set on 429s. */
		public retryAfter?: number,
	) {
		super(message)
		this.name = 'ApiError'
	}
}

/** Transient: the API rejected the request because we're over its rate limit. */
export function isRateLimitError(error: unknown): error is ApiError {
	return error instanceof ApiError && error.statusCode === HttpStatus.TooManyRequests
}

/** Permanent for this token: the app doesn't implement this command. */
export function isUnsupportedCommandError(error: unknown): error is ApiError {
	return error instanceof ApiError && error.statusCode === HttpStatus.BadRequest
}

// ----------------------------------------------------------------
// Response parsers
// ----------------------------------------------------------------

function asArrayPayload<T>(payload: JsonValue | undefined): T[] {
	return Array.isArray(payload) ? (payload as T[]) : []
}

// ----------------------------------------------------------------
// Core request function
// ----------------------------------------------------------------

interface RequestOptions {
	rateLimitTarget: string
	errorPrefix: string
	notFoundMessage?: string
}

function parseRetryAfter(response: Response): number | undefined {
	const value = response.headers.get('retry-after')
	if (!value) return undefined

	const seconds = Number(value)
	if (Number.isFinite(seconds) && seconds > 0) return seconds

	const retryAt = Date.parse(value)
	if (!Number.isFinite(retryAt)) return undefined
	return Math.max(1, Math.ceil((retryAt - Date.now()) / 1000))
}

async function readErrorBody(response: Response): Promise<string> {
	try {
		return await response.text()
	} catch {
		return ''
	}
}

async function request(url: string, init: RequestInit, options: RequestOptions): Promise<Response> {
	const response = await fetch(url, init)
	if (response.ok) return response

	const errorBody = await readErrorBody(response)
	const detail = errorBody ? ` - ${errorBody}` : ''

	if (response.status === HttpStatus.TooManyRequests) {
		throw new ApiError(response.status, `Rate limit exceeded for ${options.rateLimitTarget}`, parseRetryAfter(response))
	}
	if (response.status === HttpStatus.NotFound && options.notFoundMessage) {
		throw new ApiError(response.status, `${options.notFoundMessage}${detail}`)
	}
	throw new ApiError(response.status, `${options.errorPrefix}: HTTP ${response.status}${detail}`)
}

export async function sendCommand(apiToken: string, payload: ApiPayload): Promise<ApiResponse> {
	const url = `${BASE_URL}/${apiToken}/api`

	const response = await request(
		url,
		{
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify(payload),
		},
		{
			rateLimitTarget: payload.command,
			errorPrefix: `${payload.command} failed${payload.id ? ` (id: ${payload.id})` : ''}`,
			notFoundMessage: 'Resource not found - check your API token',
		},
	)

	try {
		return (await response.json()) as ApiResponse
	} catch {
		// Some commands return empty bodies on success.
		return { status: response.status, result: 'ok' }
	}
}

// ----------------------------------------------------------------
// Convenience helpers
// ----------------------------------------------------------------

export async function getOverlays(apiToken: string): Promise<OverlayInfo[]> {
	const res = await sendCommand(apiToken, { command: 'GetOverlays' })
	return asArrayPayload<OverlayInfo>(res.payload)
}

export async function getOverlayModels(apiToken: string): Promise<OverlayModel[]> {
	const res = await sendCommand(apiToken, { command: 'GetOverlayModels' })
	return asArrayPayload<OverlayModel>(res.payload)
}

export async function getCustomizationModel(apiToken: string): Promise<OverlayModel | null> {
	const res = await sendCommand(apiToken, { command: 'GetCustomizationModel' })
	const payload = res.payload
	if (isPlainObject(payload)) return payload as unknown as OverlayModel
	return null
}

// ----------------------------------------------------------------
// Discovery helpers (GET endpoints)
// ----------------------------------------------------------------

export async function getAppInfo(apiToken: string): Promise<AppInfo> {
	const url = `${BASE_URL}/${apiToken}`

	const response = await request(
		url,
		{ method: 'GET', redirect: 'follow' },
		{
			rateLimitTarget: 'token validation',
			errorPrefix: 'Failed to validate token',
		},
	)

	return (await response.json()) as AppInfo
}

/** Add the scheme the API omits on asset URLs (protocol-relative or bare host). */
function normalizeAssetUrl(raw: string): string {
	const url = raw.trim()
	if (!url) return ''
	if (url.startsWith('//')) return `https:${url}`
	if (!/^https?:\/\//i.test(url)) return `https://${url}`
	return url
}

/** Normalize the thumbnail URL from AppInfo (protocol-relative / missing scheme / size). */
export function normalizeThumbnailUrl(thumbnail: string): string {
	return normalizeAssetUrl(thumbnail).replace('fit-in/150x150', 'fit-in/288x288')
}

/**
 * Fetch the app thumbnail as a base64 data URI for button `png64`.
 * Returns null when there is no thumbnail URL.
 */
export async function fetchThumbnailDataUri(thumbnail: string): Promise<string | null> {
	const url = normalizeThumbnailUrl(thumbnail)
	if (!url) return null

	const response = await request(
		url,
		{ method: 'GET', redirect: 'follow' },
		{
			rateLimitTarget: 'thumbnail',
			errorPrefix: 'Failed to fetch thumbnail',
		},
	)

	const contentType = response.headers.get('content-type') ?? 'image/png'
	const buffer = Buffer.from(await response.arrayBuffer())
	return `data:${contentType};base64,${buffer.toString('base64')}`
}

/** Fetch the app's live datastore (visibility + content + customization). */
export async function getControlState(apiToken: string): Promise<ControlSubComposition[]> {
	const url = `${BASE_URL}/${apiToken}/control`

	const response = await request(
		url,
		{ method: 'GET', redirect: 'follow' },
		{
			rateLimitTarget: '/control',
			errorPrefix: 'Failed to fetch control state',
		},
	)

	const json: unknown = await response.json()
	return Array.isArray(json) ? (json as ControlSubComposition[]) : []
}

/**
 * Fields whose selections come from a URL. The model itself only carries
 * placeholders ("id1"/"Title 1"), so the real list has to be fetched separately.
 */
function urlSourcedSelectionFields(models: OverlayModel[]): OverlayModelField[] {
	return models
		.flatMap((model) => model.model)
		.filter((field) => field.type === FieldType.Selection && !!field.sourceUrl)
}

/** Fetch one selection source document, e.g. [{ id: '7', title: 'Slow' }, …]. */
async function getSelectionSource(sourceUrl: string): Promise<OverlayFieldSelection[]> {
	const response = await request(
		normalizeAssetUrl(sourceUrl),
		{ method: 'GET', redirect: 'follow' },
		{
			rateLimitTarget: 'selection options',
			errorPrefix: 'Failed to fetch selection options',
		},
	)

	const json: unknown = await response.json()
	if (!Array.isArray(json)) return []

	const selections: OverlayFieldSelection[] = []
	for (const entry of json) {
		if (!isPlainObject(entry)) continue
		const id = entry.id
		if (typeof id !== 'string' && typeof id !== 'number') continue
		selections.push({ id, title: typeof entry.title === 'string' ? entry.title : String(id) })
	}
	return selections
}

/**
 * Fetch the real selections for every URL-sourced field in the given models,
 * keyed by source URL. Each URL is fetched once; failures are reported and skipped
 * so the rest of the model still loads.
 */
export async function fetchSelectionSources(
	models: OverlayModel[],
	onError: (message: string) => void,
): Promise<Map<string, OverlayFieldSelection[]>> {
	const urls = [...new Set(urlSourcedSelectionFields(models).map((field) => field.sourceUrl as string))]

	const results = await Promise.all(
		urls.map(async (url): Promise<[string, OverlayFieldSelection[]] | null> => {
			try {
				return [url, await getSelectionSource(url)]
			} catch (error) {
				onError(`Could not load selection options from ${url}: ${error}`)
				return null
			}
		}),
	)

	return new Map(results.filter((entry): entry is [string, OverlayFieldSelection[]] => entry !== null))
}

/** Replace placeholder selections with the fetched ones, in place. */
export function applySelectionSources(models: OverlayModel[], sources: Map<string, OverlayFieldSelection[]>): void {
	for (const field of urlSourcedSelectionFields(models)) {
		const selections = sources.get(field.sourceUrl as string)
		if (selections?.length) field.selections = selections
	}
}

export async function getApiSchema(apiToken: string): Promise<ApiCommandEntry[]> {
	const url = `${BASE_URL}/${apiToken}/api/json`

	const response = await request(
		url,
		{ method: 'GET', redirect: 'follow' },
		{
			rateLimitTarget: 'API schema',
			errorPrefix: 'Failed to fetch API schema',
		},
	)

	return (await response.json()) as ApiCommandEntry[]
}

/** Extract the set of command names from an API schema. */
export function getAvailableCommands(schema: ApiCommandEntry[]): Set<string> {
	const commands = new Set<string>()
	for (const entry of schema) {
		if (isCommandEntry(entry)) {
			commands.add(entry.command)
		}
	}
	return commands
}
