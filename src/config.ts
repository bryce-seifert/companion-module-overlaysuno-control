import { type SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	info: string
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
	]
}
