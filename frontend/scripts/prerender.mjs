/**
 * Build-time pre-render (M3-7): writes prerendered index.html files for the
 * three public routes into dist/ after `vite build` + the SSR bundle build.
 *
 *   dist/index.html            <- /
 *   dist/verify/index.html     <- /verify/
 *   dist/directory/index.html  <- /directory/
 *
 * The HTML template is the client build's dist/index.html (same asset tags);
 * only the #root payload differs. Django serves these files per route and
 * falls back to the landing shell for unknown SPA paths (M3-A6).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(here, '..');
const dist = join(frontendDir, 'dist');

const { render } = await import(pathToFileURL(join(dist, '..', 'dist-ssr', 'entry-server.js')).href);

const template = readFileSync(join(dist, 'index.html'), 'utf8');
const rootMarker = '<div id="root"></div>';
if (!template.includes(rootMarker)) {
  console.error('prerender: <div id="root"></div> marker missing from dist/index.html');
  process.exit(1);
}

const routes = [
  { path: '/', file: join(dist, 'index.html') },
  { path: '/verify/', file: join(dist, 'verify', 'index.html') },
  { path: '/directory/', file: join(dist, 'directory', 'index.html') },
];

for (const route of routes) {
  const appHtml = render(route.path);
  const html = template.replace(rootMarker, `<div id="root">${appHtml}</div>`);
  mkdirSync(dirname(route.file), { recursive: true });
  writeFileSync(route.file, html);
  console.log(`prerender: wrote ${route.file} (${appHtml.length} bytes of app HTML)`);
}
