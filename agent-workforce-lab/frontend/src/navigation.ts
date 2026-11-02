export type View = 'home' | 'sources' | 'learn' | 'people' | 'work';
export type Portal = 'employee' | 'operations';
export type Route = {portal: Portal | null; view: View; objectId: string};

const segments: Record<View, string> = {
  home: '', sources: 'sources', learn: 'learning', people: 'workers', work: 'tasks',
};

export function readRoute(pathname = location.pathname): Route {
  const [root, segment, encodedId] = pathname.split('/').filter(Boolean);
  const portal = root === 'me' ? 'employee' : root === 'ops' ? 'operations' : null;
  const candidate = (Object.entries(segments).find(([, value]) => value === segment)?.[0] || 'home') as View;
  const allowed: View[] = portal === 'employee' ? ['home', 'sources', 'learn', 'people'] :
    portal === 'operations' ? ['home', 'people', 'work'] : ['home'];
  const view = allowed.includes(candidate) ? candidate : 'home';
  let objectId = '';
  try { objectId = decodeURIComponent(encodedId || ''); } catch { /* Invalid IDs stay unselected. */ }
  return {portal, view, objectId: view === 'home' ? '' : objectId};
}

export function routePath(portal: Portal, view: View, objectId = '') {
  const base = portal === 'employee' ? '/me' : '/ops';
  return base + (segments[view] ? '/' + segments[view] : '') +
    (objectId && segments[view] ? '/' + encodeURIComponent(objectId) : '');
}

export function navigate(portal: Portal, view: View, objectId = '') {
  const path = routePath(portal, view, objectId);
  if (path !== location.pathname) history.pushState({}, '', path);
  // pushState does not dispatch popstate. Share one explicit route event with
  // object-list selections and top-level navigation.
  window.dispatchEvent(new Event('awl:navigate'));
}
