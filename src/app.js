const localTime = new Intl.DateTimeFormat(undefined, {
  day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',
  hourCycle:'h23',timeZoneName:'short'
});
for (const time of document.querySelectorAll('time[datetime]')) {
  const date = new Date(time.dateTime);
  if (Number.isFinite(date.getTime())) time.textContent = localTime.format(date);
}

const buttons = [...document.querySelectorAll('[data-view]')];
if (buttons.length) {
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
}
