const buttons = [...document.querySelectorAll('[data-view]')];
const tools = [...document.querySelectorAll('.tool')];
const banner = document.querySelector('#dev-banner');
const status = document.querySelector('#results-count');
let view = 'complete';

function show(next) {
  view = next;
  let visible = 0;
  for (const tool of tools) {
    tool.hidden = tool.dataset.variant !== view;
    if (!tool.hidden) tool.querySelector('.no').textContent = String(++visible).padStart(2, '0');
  }
  for (const button of buttons) {
    button.hidden = false;
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  }
  banner.hidden = view !== 'development';
  status.textContent = `${visible} ${view === 'development' ? 'development' : 'released'} ${visible === 1 ? 'tool' : 'tools'}`;
}
for (const button of buttons) button.addEventListener('click', () => show(button.dataset.view));
function applyHash() {
  let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  const target = document.getElementById(id);
  if (target?.dataset.variant) { show(target.dataset.variant); target.scrollIntoView(); }
}
window.addEventListener('pageshow', () => { show(view); applyHash(); });
window.addEventListener('hashchange', applyHash);
show(view);
