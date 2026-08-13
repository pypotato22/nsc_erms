/**
 * Re-exports existing vanilla libs so React features can import from one place.
 * During migration, prefer `@/shared/lib/...` style paths once aliases are added;
 * for now relative imports to `../js/utils` and `../js/api` are fine.
 */
export { canWrite, canManageUsers, isSuperadmin, setCurrentRole, clearCurrentRole, currentRole } from '../js/utils/authz.js';
export { showToast } from '../js/utils/toast.js';
export { escapeHtml, escapeAttr, getEl } from '../js/utils/helpers.js';
export { mountIsland, unmountIsland } from './mountIsland.js';
export { onAppEvent, emitAppEvent } from './appEvents.js';
export { legacyHashTarget, redirectLegacyHash } from './legacyHash.js';
