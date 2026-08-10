import { type SomeCompanionConfigField } from '@companion-module/base'
import { DEFAULT_POLL_INTERVAL_SECONDS } from './types.js'

export interface ModuleConfig {
	pollInterval: number
}

export interface ModuleSecrets {
	apiToken: string
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'Getting Started',
			value: `Open the overlay you want to control in your browser. Click "Copy UNO Token", and paste it here to get started.`,
		},
		{
			type: 'secret-text',
			id: 'apiToken',
			label: 'UNO Token',
			width: 12,
			required: true,
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Poll Interval',
			tooltip: 'How often, in seconds, to refresh overlay data from the API',
			width: 4,
			min: 10,
			max: 3600,
			default: DEFAULT_POLL_INTERVAL_SECONDS,
		},
	]
}
