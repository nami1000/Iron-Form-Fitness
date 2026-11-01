// Iron Form Fitness: hash router & bootstrap.
import { load } from './store.js';
import { renderOnboarding } from './ui/onboarding.js';
import { renderHome, renderSessionPreview } from './ui/home.js';
import { renderPlayer } from './ui/player.js';
import { renderSummary } from './ui/summary.js';
import { renderProgress } from './ui/progress.js';
import { renderLibrary } from './ui/library.js';
import { renderSettings } from './ui/settings.js';
import { stopPreview } from './ui/musicpicker.js';
import { currentPath, onNavigate, initialPath, go } from './nav.js';
import { connectCloud } from './store.js';

const root = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
let cleanup = null;

function route() {
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  document.getElementById('modal-root').innerHTML = '';
  stopPreview();
  const st = load();
  const [path, qs] = currentPath().split('?');
  const query = new URLSearchParams(qs || '');
  const parts = path.split('/').filter(Boolean);
  const onboarded = !!(st.profile && st.plan);
  window.scrollTo(0, 0);

  if (!onboarded) { tabbar.hidden = true; renderOnboarding(root); return; }
  const page = parts[0] || 'home';
  tabbar.hidden = page === 'player' || page === 'edit';
  tabbar.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.tab === page));

  switch (page) {
    case 'session': renderSessionPreview(root, query); break;
    case 'player': cleanup = renderPlayer(root, query); break;
    case 'summary': renderSummary(root, parts[1]); break;
    case 'progress': renderProgress(root); break;
    case 'library': renderLibrary(root); break;
    case 'settings': renderSettings(root); break;
    case 'edit': renderOnboarding(root, { editing: true }); break;
    default: renderHome(root);
  }
}

onNavigate(route);
go(initialPath());
// Durable backup: when hosted with a per-user database, sync state to it.
connectCloud(() => { if (!currentPath().startsWith('/player')) route(); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
