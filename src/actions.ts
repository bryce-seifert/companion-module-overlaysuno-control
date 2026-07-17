import type { ModuleInstance } from './main.js'
import { getVisibilityActions } from './actions/visibility.js'
import { getContentActions } from './actions/content.js'
import { getSlotActions } from './actions/slots.js'
import { getCustomizationActions } from './actions/customization.js'
import { getSchemaActions } from './actions/schema.js'
import { getCustomActions } from './actions/custom.js'

export function UpdateActions(self: ModuleInstance): void {
	self.setActionDefinitions({
		...getVisibilityActions(self),
		...getContentActions(self),
		...getSlotActions(self),
		...getCustomizationActions(self),
		...getSchemaActions(self),
		...getCustomActions(self),
	})
}
