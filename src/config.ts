import { type SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	apiToken: string
	pollInterval: number
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'Information',
			value:
				'Open the overlay you want to control in your browser and select "Copy UNO Token", and paste it here to get started.',
		},
		{
			type: 'textinput',
			id: 'apiToken',
			label: 'UNO Token',
			width: 12,
			required: true,
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Poll Interval (seconds)',
			tooltip: 'How often to refresh overlay data from the API',
			width: 4,
			min: 10,
			max: 3600,
			default: 60,
		},
	]
}
