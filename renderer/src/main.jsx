import { createRoot } from 'react-dom/client';
import { RootApp } from './app/RootApp.jsx';
import { REACT_MIGRATION_PHASE } from './reactReady.js';

if (typeof console !== 'undefined' && console.debug) {
  console.debug(`[nsc-erms] react migration phase ${REACT_MIGRATION_PHASE} (react boot)`);
}

const container = document.getElementById('root');
if (!container) throw new Error('#root container missing from index.html');

createRoot(container).render(<RootApp />);
