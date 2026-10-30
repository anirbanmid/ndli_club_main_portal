/**
 * Route resolution shared by the client entry and the build-time prerender
 * (M3-7). One source of truth for the URL -> view mapping:
 *
 *   /                     -> home (landing)
 *   /verify/  (?id=…)     -> verify   (canonical QR target)
 *   /directory/           -> directory
 *   /login/   (?next=…)   -> login    (M5-D1 login door; `next` = interrupted
 *                                      route to return to after re-login)
 *   /onboarding/          -> onboarding (M5-D2: 4-authority resumable wizard;
 *                                      SPA-only — never prerendered)
 *   /clubs/               -> clubs    (M5-D3 club showcase index, public)
 *   /clubs/<slug>/        -> club_detail (M5-D3 showcase page, public;
 *                                      SPA-only — one page per slug, so it can
 *                                      never be enumerated at build time)
 *   /join/    (#t=…)      -> join     (M5-D3 passkey/QR self-join door; the
 *                                      club QR wraps /join#t=<token> — the
 *                                      token rides in the URL FRAGMENT, never
 *                                      the query string (M4 delivery rule),
 *                                      so the client reads it from
 *                                      location.hash on mount)
 *   ?tab=verify&certId=…  -> verify   (legacy compat)
 */
export interface AppRoute {
  tab: string;
  certId: string;
  /** Interrupted route for the login door (`/login/?next=…`), '' when absent. */
  next: string;
  /** Showcase slug for `/clubs/<slug>/`, '' when absent (M5-D3). */
  slug: string;
}

export function resolveRoute(loc: {
  pathname: string;
  search: string;
}): AppRoute {
  const params = new URLSearchParams(loc.search);
  const path = loc.pathname.replace(/\/+$/, '') || '/';
  const tabParam = params.get('tab');
  const certIdParam = params.get('certId');
  const idParam = params.get('id');
  const nextParam = params.get('next');

  if (path === '/verify' || tabParam === 'verify') {
    return { tab: 'verify', certId: idParam ?? certIdParam ?? '', next: '', slug: '' };
  }
  if (path === '/directory') {
    return { tab: 'directory', certId: '', next: '', slug: '' };
  }
  if (path === '/login' || tabParam === 'login') {
    return { tab: 'login', certId: '', next: nextParam ?? '', slug: '' };
  }
  if (path === '/onboarding' || tabParam === 'onboarding') {
    return { tab: 'onboarding', certId: '', next: '', slug: '' };
  }
  if (path === '/clubs') {
    return { tab: 'clubs', certId: '', next: '', slug: '' };
  }
  if (path.startsWith('/clubs/')) {
    return {
      tab: 'club_detail',
      certId: '',
      next: '',
      slug: decodeURIComponent(path.slice('/clubs/'.length)),
    };
  }
  if (path === '/join' || tabParam === 'join') {
    return { tab: 'join', certId: '', next: '', slug: '' };
  }
  if (path === '/employee' || path.startsWith('/employee/') || tabParam === 'employee' || params.get('branch') === 'employee') {
    const parts = path.split('/').filter(Boolean);
    let empSlug = (params.get('emp') || '').trim().toUpperCase();
    if (!empSlug && parts.length >= 2 && parts[0].toLowerCase() === 'employee' && parts[1].toLowerCase() !== 'login') {
      empSlug = decodeURIComponent(parts[1]).trim().toUpperCase();
    }
    return {
      tab: 'employee',
      certId: '',
      next: '',
      slug: empSlug || 'EMP01',
    };
  }
  return { tab: 'home', certId: '', next: '', slug: '' };
}
