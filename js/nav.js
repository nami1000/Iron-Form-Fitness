// In-page navigation. Routes live in memory (not the URL) so the app also
// works inside sandboxed hosts that don't pass #/paths through. On normal
// hosting the route is mirrored to a plain #name hash for back/refresh.
let current = '/';
let handler = () => {};
const SAFE = /^[a-z0-9-]+$/;

export function currentPath() { return current; }
export function onNavigate(fn) { handler = fn; }

export function go(path) {
  current = String(path).replace(/^#/, '') || '/';
  const name = current.split(/[/?]/).filter(Boolean)[0];
  try {
    const mirror = name && SAFE.test(name) && ['home', 'progress', 'library'].includes(name) ? `#${name}` : '';
    if (location.hash !== mirror) history.replaceState(null, '', mirror || location.pathname + location.search);
  } catch { /* sandboxed frame */ }
  handler();
}

export function initialPath() {
  const h = (location.hash || '').replace(/^#\/?/, '');
  return ['home', 'progress', 'library'].includes(h) ? `/${h}` : '/';
}

// Intercept in-app links like <a href="#/session">.
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href^="#/"]');
  if (!a) return;
  e.preventDefault();
  go(a.getAttribute('href'));
});
