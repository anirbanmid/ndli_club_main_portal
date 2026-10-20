/**
 * Route resolution shared by the client entry and the build-time prerender
 * (M3-7). One source of truth for the URL -> view mapping:
 *
 *   /                     -> home (landing)
 *   /verify/  (?id=…)     -> verify   (canonical QR target)
 *   /directory/           -> directory
 *   ?tab=verify&certId=…  -> verify   (legacy compat)
 */
export interface AppRoute {
  tab: string;
  certId: string;
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

  if (path === '/verify' || tabParam === 'verify') {
    return { tab: 'verify', certId: idParam ?? certIdParam ?? '' };
  }
  if (path === '/directory') {
    return { tab: 'directory', certId: '' };
  }
  return { tab: 'home', certId: '' };
}
