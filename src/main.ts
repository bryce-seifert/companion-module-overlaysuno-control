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
	private lastCustomizationFingerprint = ''

	private pollTimer: ReturnType<typeof setInterval> | undefined
	private pollRetryTimer: ReturnType<typeof setTimeout> | undefined
	private reconnectTimer: ReturnType<typeof setTimeout> | undefined
	private refreshTimer: ReturnType<typeof setTimeout> | undefined
	private refreshInFlight = false
	private refreshPending = false
	// Shared in-flight GET /control so poll, post-action refresh, and Learn don't overlap.
	private controlStateInFlight: Promise<ControlSubComposition[]> | null = null
	// Bumped on destroy / reconnect so in-flight work ignores stale results.
	private connectionEpoch = 0

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
		this.connectionEpoch++
		this.controlStateInFlight = null
		this.stopPolling()
		this.clearPollRetry()
		this.clearReconnect()
		this.clearRefresh()
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.startConnection()
	}

	private startConnection(): void {
		const epoch = ++this.connectionEpoch
		this.controlStateInFlight = null
		this.stopPolling()
		this.clearPollRetry()
		this.clearReconnect()
		this.clearRefresh()

		this.initConnection(epoch).catch((e) => {
			if (epoch !== this.connectionEpoch) return
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
		this.lastCustomizationFingerprint = ''
	}

	async initConnection(epoch: number): Promise<void> {
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
			const appInfo = await getAppInfo(this.config.apiToken)
			if (epoch !== this.connectionEpoch) return
			this.appInfo = appInfo

			// For now, the thumbnail is static for the lifetime of a connection - fetch it once here
			if (this.appInfo.thumbnail) {
				try {
					const thumbnail = await fetchThumbnailDataUri(this.appInfo.thumbnail)
					if (epoch !== this.connectionEpoch) return
					this.appThumbnailPng64 = thumbnail
				} catch (e) {
					this.log('debug', `Failed to fetch app thumbnail: ${e}`)
				}
			}

			// Discover available commands
			const commandSchema = await getApiSchema(this.config.apiToken)
			if (epoch !== this.connectionEpoch) return
			this.commandSchema = commandSchema
			this.availableCommands = getAvailableCommands(this.commandSchema)
			this.log('debug', `Discovered ${this.availableCommands.size} available command(s)`)
			this.log('debug', `API schema for "${this.appInfo.name}":\n${JSON.stringify(this.commandSchema, null, 2)}`)

			// Overlay list and field models are static for the life of the connection
			await this.discoverStructure(epoch)
			if (epoch !== this.connectionEpoch) return

			// Poll data based on available commands
			await this.pollData()
			if (epoch !== this.connectionEpoch) return

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
			if (epoch !== this.connectionEpoch) return
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
		const epoch = this.connectionEpoch
		try {
			await this.runPollCycle(epoch)
		} catch (e) {
			if (epoch !== this.connectionEpoch) return
			if (isRateLimitError(e)) {
				this.onRateLimited(e)
				return
			}
			throw e
		}

		if (epoch !== this.connectionEpoch) return
		this.onPollSucceeded()
	}

	private onRateLimited(e: ApiError): void {
		const retryIn = e.retryAfter ?? (this.config.pollInterval || 60)

		// Stop the normal interval and wait for Retry-After before the next poll.
		this.stopPolling()
		this.schedulePollRetry(retryIn)

		// Only announce the transition into the rate-limited state.
		if (this.rateLimited) return
		this.rateLimited = true

		this.updateStatus(InstanceStatus.UnknownWarning, 'API Rate Limit Exceeded')
		this.log('warn', `Overlays.uno API rate limit exceeded. Will retry in ${retryIn}s.`)
	}

	private onPollSucceeded(): void {
		if (!this.rateLimited) return
		this.rateLimited = false
		this.clearPollRetry()
		this.updateStatus(InstanceStatus.Ok)
		this.log('info', 'Overlays.uno API rate limit cleared, normal operation resumed')
		// Resume the normal interval (also covers an early recovery via post-action refresh).
		this.startPolling()
	}

	// Fetch one piece of the app's structure via a Get* command
	private async fetchStructure<T>(
		epoch: number,
		command: string,
		fetch: () => Promise<T>,
		apply: (result: T) => void,
	): Promise<void> {
		try {
			const result = await fetch()
			if (epoch !== this.connectionEpoch) return
			apply(result)
		} catch (e) {
			if (epoch !== this.connectionEpoch) return
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
	private async discoverStructure(epoch: number): Promise<void> {
		await this.fetchStructure(
			epoch,
			'GetOverlays',
			async () => getOverlays(this.config.apiToken),
			(overlays) => {
				this.overlayList = overlays
			},
		)
		await this.fetchStructure(
			epoch,
			'GetOverlayModels',
			async () => getOverlayModels(this.config.apiToken),
			(models) => {
				this.overlayModels = models
			},
		)
		await this.fetchStructure(
			epoch,
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

	// Shared GET /control - concurrent readers join the same request. A post-action refresh
	// waits for an older request to finish, then starts a fresh request so it cannot publish
	// state captured before the mutation.
	private async fetchControlState(forceFresh = false): Promise<ControlSubComposition[]> {
		if (this.controlStateInFlight && !forceFresh) return this.controlStateInFlight

		while (forceFresh && this.controlStateInFlight) {
			try {
				await this.controlStateInFlight
			} catch {
				// The fresh request below should still be attempted.
			}
		}

		const request = getControlState(this.config.apiToken).finally(() => {
			if (this.controlStateInFlight === request) {
				this.controlStateInFlight = null
			}
		})
		this.controlStateInFlight = request
		return request
	}

	// One GET returns visibility + content for every subcomposition
	private async runPollCycle(epoch: number): Promise<void> {
		const subs = await this.fetchControlState()
		if (epoch !== this.connectionEpoch) return

		this.applyControlState(subs)

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

		const customization = JSON.stringify(this.customizationValues)
		if (force || customization !== this.lastCustomizationFingerprint) {
			this.lastCustomizationFingerprint = customization
			this.checkFeedbacks('customization_field')
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
		const epoch = this.connectionEpoch
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = undefined
			if (epoch !== this.connectionEpoch) return
			this.startConnection()
		}, seconds * 1000)
	}

	private clearReconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = undefined
		}
	}

	// After a 429, wait before the next poll instead of hammering on pollInterval.
	private schedulePollRetry(seconds: number): void {
		this.clearPollRetry()
		const epoch = this.connectionEpoch
		this.pollRetryTimer = setTimeout(() => {
			this.pollRetryTimer = undefined
			if (epoch !== this.connectionEpoch) return

			this.pollData()
				.then(() => {
					if (epoch !== this.connectionEpoch) return
					// onPollSucceeded already restarted polling if the limit cleared;
					// if still limited, onRateLimited scheduled another retry.
					if (!this.rateLimited) this.startPolling()
				})
				.catch((e) => {
					if (epoch !== this.connectionEpoch) return
					this.log('warn', `Poll retry failed: ${e}`)
					if (this.rateLimited) {
						this.schedulePollRetry(this.config.pollInterval || 60)
					} else {
						this.startPolling()
					}
				})
		}, seconds * 1000)
	}

	private clearPollRetry(): void {
		if (this.pollRetryTimer) {
			clearTimeout(this.pollRetryTimer)
			this.pollRetryTimer = undefined
		}
	}

	private startPolling(): void {
		this.stopPolling()
		// While backing off a 429, schedulePollRetry owns the next attempt.
		if (this.rateLimited) return

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

	// Resolve an action's overlayId to a /control subcomposition id. Single-overlay apps
	// pass '' (or 'global' for visibility), which never matches a real subCompositionId.
	private resolveContentOverlayId(overlayId: string, subs: ControlSubComposition[]): string | undefined {
		if (overlayId && overlayId !== 'global') return overlayId

		const only = subs.filter((s) => !s.mainComposition)
		if (only.length === 1) return only[0].subCompositionId
		return undefined
	}

	private findContentPayload(overlayId: string, subs: ControlSubComposition[]): Record<string, unknown> | undefined {
		const id = this.resolveContentOverlayId(overlayId, subs)
		if (!id) return undefined
		return subs.find((s) => s.subCompositionId === id)?.payload
	}

	private cachedContentPayload(overlayId: string): Record<string, unknown> | undefined {
		if (overlayId && overlayId !== 'global') {
			return this.overlayContent.get(overlayId)
		}
		if (this.overlayContent.size === 1) {
			return [...this.overlayContent.values()][0]
		}
		const only = this.controlState.filter((s) => !s.mainComposition)
		if (only.length === 1) return this.overlayContent.get(only[0].subCompositionId)
		return undefined
	}

	// Live content payload for one overlay, for the action Learn callbacks
	async fetchLiveContent(overlayId: string): Promise<Record<string, unknown> | undefined> {
		try {
			const subs = await this.fetchControlState()
			const payload = this.findContentPayload(overlayId, subs)
			if (payload !== undefined) return payload
		} catch (e) {
			this.log('warn', `Learn: could not fetch live state, falling back to last poll - ${e}`)
		}
		return this.cachedContentPayload(overlayId)
	}

	// Live customization values, for the customization Learn callbacks. Same contract as
	// fetchLiveContent() - the customization values live on the app-level composition.
	async fetchLiveCustomization(): Promise<Record<string, unknown> | undefined> {
		try {
			const subs = await this.fetchControlState()
			const main = subs.find((s) => s.mainComposition)
			if (main) return main.payload ?? {}
		} catch (e) {
			this.log('warn', `Learn: could not fetch live state, falling back to last poll - ${e}`)
		}
		return this.customizationValues
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
		const epoch = this.connectionEpoch
		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = undefined
			if (epoch !== this.connectionEpoch) return
			void this.runRefresh()
		}, ACTION_REFRESH_DEBOUNCE_MS)
	}

	private clearRefresh(): void {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer)
			this.refreshTimer = undefined
		}
		this.refreshPending = false
	}

	private async runRefresh(): Promise<void> {
		if (this.refreshInFlight) {
			this.refreshPending = true
			return
		}
		this.refreshInFlight = true
		const epoch = this.connectionEpoch

		try {
			const subs = await this.fetchControlState(true)
			if (epoch !== this.connectionEpoch) return
			this.applyControlState(subs)
			this.syncValuesAndFeedbacks(false)
			this.onPollSucceeded()
		} catch (e) {
			if (epoch !== this.connectionEpoch) return
			if (isRateLimitError(e)) {
				this.onRateLimited(e)
			} else {
				this.log('warn', `Failed to refresh state after action: ${e}`)
			}
		} finally {
			this.refreshInFlight = false
			if (this.refreshPending && epoch === this.connectionEpoch) {
				this.refreshPending = false
				void this.runRefresh()
			} else {
				this.refreshPending = false
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
