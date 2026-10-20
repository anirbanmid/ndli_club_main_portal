/**
 * SSR entry (M3-7 pre-rendering).
 *
 * Renders the public pages to static HTML strings at BUILD TIME (see
 * scripts/prerender.mjs). The client then takes over with a normal
 * createRoot render — hydration is deliberately NOT used because the
 * `/verify/?id=…` deep link changes the first client render (the input is
 * pre-filled and auto-verified), which would be a hydration mismatch.
 *
 * Low-bandwidth win: the HTML already contains the page content, so users
 * see the UI before (or without) the JS bundle.
 */
import { renderToString } from 'react-dom/server';
import { App } from './App';

/** Render one route to an HTML string. Mirrors the client's route table. */
export function render(pathname: string, search = ''): string {
  return renderToString(<App ssrLocation={{ pathname, search }} />);
}
