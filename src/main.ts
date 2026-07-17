import { InstanceBase, runEntrypoint, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions, UpdateVariableValues, type VariableValue } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import {
	ApiError,
	isRateLimitError,
	isUnsupportedCommandError,
	getAppInfo,
	fetchThumbnailDataUri,
	getApiSchema,
	getAvailableCommands,
	getOverlays,
	getOverlayModels,
	getCustomizationModel,
	getControlState,
	isSubCompositionVisible,
	sendCommand,
	type ApiPayload,
	type AppInfo,
	type ApiCommandEntry,
	type OverlayInfo,
	type OverlayModel,
	type ControlSubComposition,
} from './api.js'

export interface OverlayChoice {
	id: string
	label: string
}

// Fallback delay before retrying a connect that a rate limit blocked, when the API sends no Retry-After.
const CONNECT_RETRY_SECONDS = 30

// How long to wait after the last action before refreshing state
const ACTION_REFRESH_DEBOUNCE_MS = 250

export class ModuleInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig // Setup in init()

	// Connection State
	appInfo: AppInfo | null = null
	appThumbnailPng64: string | null = null
	commandSchema: ApiCommandEntry[] = []
	availableCommands: Set<string> = new Set()
	// Get* commands confirmed unavailable at runtime (via a 400 response)
	unsupportedCommands: Set<string> = new Set()
	// True while the API is rate limiting us, so the condition is logged once per streak.
	private rateLimited = false

	// Overlay State
	overlayList: OverlayInfo[] = []
	overlayModels: OverlayModel[] = []
	customizationModel: OverlayModel | null = null
	overlayVisibility: Map<string, boolean> = new Map()
	overlayContent: Map<string, Record<string, unknown>> = new Map()
	customizationValues: Record<string, unknown> = {}
	// Live datastore from GET /control - the source for visibility, content and customization values.
	controlState: ControlSubComposition[] = []

	// Overlay dropdown choices, derived from overlayList.
	get overlayChoices(): OverlayChoice[] {
		return this.overlayList.map((o) => ({ id: o.id, label: o.name }))
	}

	// Last values pushed to Companion, so each poll only sends what actually moved.
	lastVariableValues: Record<string, VariableValue | undefined> = {}
	private lastDefinitionsFingerprint = ''
	private lastVisibilityFingerprint = ''
	private lastContentFingerprint = ''

	private pollTimer: ReturnType<typeof setInterval> | undefined
	private reconnectTimer: ReturnType<typeof setTimeout> | undefined
	private refreshTimer: ReturnType<typeof setTimeout> | undefined
	private refreshInFlight = false
	private refreshPending = false

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.updateVariableDefinitions()

		// Start connection in the background
		this.startConnection()
	}

	async destroy(): Promise<void> {
		this.stopPolling()
		this.clearReconnect()
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer)
			this.refreshTimer = undefined
		}
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.stopPolling()
		this.clearReconnect()
		this.startConnection()
	}

	private startConnection(): void {
		this.initConnection().catch((e) => {
			const message = e instanceof Error ? e.message : String(e)
			this.updateStatus(InstanceStatus.ConnectionFailure, message)
			this.log('error', `Connection failed: ${message}`)
		})
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	// ----------------------------------------------------------------
	// Connection & polling
	// ----------------------------------------------------------------

	// Check if a given command is advertised by the app's schema. Only trustworthy for the
	// mutating visibility commands (ShowOverlay/HideOverlay/ToggleOverlay) - see the callers
	// in presets/visibility.ts for why Get* commands aren't gated this way.
	hasCommand(command: string): boolean {
		return this.availableCommands.has(command)
	}

	clearState(): void {
		this.appInfo = null
		this.appThumbnailPng64 = null
		this.commandSchema = []
		this.availableCommands.clear()
		this.unsupportedCommands.clear()
		this.rateLimited = false

		this.overlayList = []
		this.overlayModels = []
		this.customizationModel = null
		this.overlayVisibility.clear()
		this.overlayContent.clear()
		this.customizationValues = {}
		this.controlState = []

		// Force a full re-register and re-push on the next poll
		this.lastVariableValues = {}
		this.lastDefinitionsFingerprint = ''
		this.lastVisibilityFingerprint = ''
		this.lastContentFingerprint = ''
	}

	async initConnection(): Promise<void> {
		this.clearState()

		if (!this.config.apiToken) {
			this.updateStatus(InstanceStatus.BadConfig, 'API Token is required')
			return
		}

		const maskedToken =
			this.config.apiToken.length > 8 ? `${this.config.apiToken.slice(0, 4)}…${this.config.apiToken.slice(-4)}` : '****'
		this.log('debug', `Connecting with token ${maskedToken}`)
		this.updateStatus(InstanceStatus.Connecting)

		try {
			// Validate token via GET endpoint
			this.appInfo = await getAppInfo(this.config.apiToken)

			// For now, the thumbnail is static for the lifetime of a connection - fetch it once here
			if (this.appInfo.thumbnail) {
				try {
					this.appThumbnailPng64 = await fetchThumbnailDataUri(this.appInfo.thumbnail)
				} catch (e) {
					this.log('debug', `Failed to fetch app thumbnail: ${e}`)
				}
			}

			// Discover available commands
			this.commandSchema = await getApiSchema(this.config.apiToken)
			this.availableCommands = getAvailableCommands(this.commandSchema)
			this.log('debug', `Discovered ${this.availableCommands.size} available command(s)`)
			this.log('debug', `API schema for "${this.appInfo.name}":\n${JSON.stringify(this.commandSchema, null, 2)}`)

			// Overlay list and field models are static for the life of the connection
			await this.discoverStructure()

			// Poll data based on available commands
			await this.pollData()

			if (this.overlayModels.length > 0) {
				this.log('debug', `Overlay models:\n${JSON.stringify(this.overlayModels, null, 2)}`)
			}
			if (this.customizationModel) {
				this.log('debug', `Customization model:\n${JSON.stringify(this.customizationModel, null, 2)}`)
			}

			this.log('info', `Connected to Overlays.uno - "${this.appInfo.name}"`)
			// pollData() handles a 429 internally and has already set the status
			if (!this.rateLimited) {
				this.updateStatus(InstanceStatus.Ok)
			}
			this.startPolling()
		} catch (e) {
			if (isRateLimitError(e)) {
				// Rate Limited State
				const retryIn = e.retryAfter ?? CONNECT_RETRY_SECONDS
				this.updateStatus(InstanceStatus.UnknownWarning, 'API Rate Limit Exceeded')
				this.log('warn', `Overlays.uno rate limit exceeded. Retrying in ${retryIn}s. `)
				this.scheduleReconnect(retryIn)
			} else {
				const message = e instanceof Error ? e.message : String(e)
				this.updateStatus(InstanceStatus.ConnectionFailure, message)
				this.log('error', `Connection failed: ${message}`)
			}
		}
	}

	// Run one poll cycle. A 429 anywhere inside aborts the rest of the cycle
	async pollData(): Promise<void> {
		try {
			await this.runPollCycle()
		} catch (e) {
			if (isRateLimitError(e)) {
				this.onRateLimited(e)
				return
			}
			throw e
		}

		this.onPollSucceeded()
	}

	private onRateLimited(e: ApiError): void {
		// Only announce the transition into the rate-limited state.
		if (this.rateLimited) return
		this.rateLimited = true

		const retryIn = e.retryAfter ?? (this.config.pollInterval || 60)

		this.updateStatus(InstanceStatus.UnknownWarning, 'API Rate Limit Exceeded')
		this.log('warn', `Overlays.uno API rate limit exceeded. Will retry in ${retryIn}s.`)
	}

	private onPollSucceeded(): void {
		if (!this.rateLimited) return
		this.rateLimited = false
		this.updateStatus(InstanceStatus.Ok)
		this.log('info', 'Overlays.uno API rate limit cleared, normal operation resumed')
	}

	// Fetch one piece of the app's structure via a Get* command
	private async fetchStructure<T>(command: string, fetch: () => Promise<T>, apply: (result: T) => void): Promise<void> {
		try {
			apply(await fetch())
		} catch (e) {
			if (isRateLimitError(e)) throw e
			if (isUnsupportedCommandError(e)) {
				this.unsupportedCommands.add(command)
				this.log('debug', `${command} is not supported by this control app`)
			} else {
				this.log('warn', `${command} failed: ${e}`)
			}
		}
	}

	// Fetch the app's structure - the overlay list and the field models behind it
	private async discoverStructure(): Promise<void> {
		await this.fetchStructure(
			'GetOverlays',
			async () => getOverlays(this.config.apiToken),
			(overlays) => {
				this.overlayList = overlays
			},
		)
		await this.fetchStructure(
			'GetOverlayModels',
			async () => getOverlayModels(this.config.apiToken),
			(models) => {
				this.overlayModels = models
			},
		)
		await this.fetchStructure(
			'GetCustomizationModel',
			async () => getCustomizationModel(this.config.apiToken),
			(model) => {
				this.customizationModel = model
			},
		)
	}

	// Fold a /control response into the state the rest of the module reads
	private applyControlState(subs: ControlSubComposition[]): void {
		this.controlState = subs
		this.overlayVisibility.clear()
		this.overlayContent.clear()

		for (const sub of subs) {
			if (sub.mainComposition) {
				this.customizationValues = sub.payload ?? {}
				continue
			}
			this.overlayVisibility.set(sub.subCompositionId, isSubCompositionVisible(sub))
			this.overlayContent.set(sub.subCompositionId, sub.payload ?? {})
		}

		// Single-overlay apps key their visibility under 'global'
		if (this.overlayList.length === 0) {
			const only = subs.filter((s) => !s.mainComposition)
			if (only.length === 1) {
				this.overlayVisibility.set('global', isSubCompositionVisible(only[0]))
			}
		}
	}

	// One GET returns visibility + content for every subcomposition
	private async runPollCycle(): Promise<void> {
		this.applyControlState(await getControlState(this.config.apiToken))

		// Definitions derive from the app's *shape* (overlays, models, schema)
		const definitionsChanged = this.refreshDefinitionsIfChanged()
		this.syncValuesAndFeedbacks(definitionsChanged)
	}

	// Push whatever moved: changed variable values, and the feedbacks whose inputs shifted.
	// The two feedback groups are gated separately so an idle poll re-evaluates neither.
	private syncValuesAndFeedbacks(force: boolean): void {
		UpdateVariableValues(this, force)

		const visibility = JSON.stringify([...this.overlayVisibility.entries()].sort())
		if (force || visibility !== this.lastVisibilityFingerprint) {
			this.lastVisibilityFingerprint = visibility
			this.checkFeedbacks('overlay_visible', 'app_thumbnail')
		}

		const content = JSON.stringify([...this.overlayContent.entries()].sort((a, b) => a[0].localeCompare(b[0])))
		if (force || content !== this.lastContentFingerprint) {
			this.lastContentFingerprint = content
			this.checkFeedbacks('overlay_content_field')
		}
	}

	// Fingerprint of the state for action/feedback/preset/variable definitions
	private definitionsFingerprint(): string {
		return JSON.stringify({
			app: this.appInfo?.name ?? null,
			thumbnail: this.appThumbnailPng64 !== null,
			commands: [...this.availableCommands].sort(),
			unsupported: [...this.unsupportedCommands].sort(),
			overlays: this.overlayList.map((o) => [o.id, o.name]),
			models: this.overlayModels.map((m) => [m.id, m.name, m.hasSlots, m.model.map((f) => f.id)]),
			customization: this.customizationModel?.model.map((f) => f.id) ?? null,
			// Bespoke apps have no models - their variables are defined by the datastore keys
			control: this.controlState.map((s) => [
				s.subCompositionId,
				s.subCompositionName,
				Object.keys(s.payload ?? {}).sort(),
			]),
		})
	}

	// Re-register definitions only if the app's shape changed
	private refreshDefinitionsIfChanged(): boolean {
		const fingerprint = this.definitionsFingerprint()
		if (fingerprint === this.lastDefinitionsFingerprint) return false
		this.lastDefinitionsFingerprint = fingerprint

		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.updateVariableDefinitions()
		return true
	}

	// Retry the initial connect once, after a rate limit blocked it
	private scheduleReconnect(seconds: number): void {
		this.clearReconnect()
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = undefined
			this.startConnection()
		}, seconds * 1000)
	}

	private clearReconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = undefined
		}
	}

	private startPolling(): void {
		this.stopPolling()
		const interval = (this.config.pollInterval || 60) * 1000
		this.pollTimer = setInterval(() => {
			this.pollData().catch((e) => {
				this.log('warn', `Poll failed: ${e}`)
			})
		}, interval)
	}

	private stopPolling(): void {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = undefined
		}
	}

	// ----------------------------------------------------------------
	// Immediate Feedback Helpers
	// ----------------------------------------------------------------

	// Live content payload for one overlay, for the action Learn callbacks
	async fetchLiveContent(overlayId: string): Promise<Record<string, unknown> | undefined> {
		try {
			const subs = await getControlState(this.config.apiToken)
			return subs.find((s) => s.subCompositionId === overlayId)?.payload
		} catch (e) {
			this.log('warn', `Learn: could not fetch live state, falling back to last poll - ${e}`)
			return this.overlayContent.get(overlayId)
		}
	}

	// Live customization values, for the customization Learn callbacks. Same contract as
	// fetchLiveContent() - the customization values live on the app-level composition.
	async fetchLiveCustomization(): Promise<Record<string, unknown> | undefined> {
		try {
			const subs = await getControlState(this.config.apiToken)
			return subs.find((s) => s.mainComposition)?.payload
		} catch (e) {
			this.log('warn', `Learn: could not fetch live state, falling back to last poll - ${e}`)
			return this.customizationValues
		}
	}

	// Send a mutating command, then refresh state from /control so variables and feedbacks
	// reflect it immediately rather than sitting stale until the next poll
	async sendAndRefresh(payload: ApiPayload): Promise<void> {
		try {
			await sendCommand(this.config.apiToken, payload)
			this.refreshAfterAction()
		} catch (e) {
			this.log('error', `${payload.command} failed: ${e}`)
		}
	}

	// Queue a post-action state refresh, debounced
	refreshAfterAction(): void {
		if (this.refreshTimer) clearTimeout(this.refreshTimer)
		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = undefined
			void this.runRefresh()
		}, ACTION_REFRESH_DEBOUNCE_MS)
	}

	private async runRefresh(): Promise<void> {
		if (this.refreshInFlight) {
			this.refreshPending = true
			return
		}
		this.refreshInFlight = true

		try {
			this.applyControlState(await getControlState(this.config.apiToken))
			this.syncValuesAndFeedbacks(false)
			this.onPollSucceeded()
		} catch (e) {
			if (isRateLimitError(e)) {
				this.onRateLimited(e)
			} else {
				this.log('warn', `Failed to refresh state after action: ${e}`)
			}
		} finally {
			this.refreshInFlight = false
			if (this.refreshPending) {
				this.refreshPending = false
				void this.runRefresh()
			}
		}
	}

	// ----------------------------------------------------------------
	// Companion Definition updates
	// ----------------------------------------------------------------

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)
