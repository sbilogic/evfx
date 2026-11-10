const localTime = new Intl.DateTimeFormat(undefined, {
  day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',
  hourCycle:'h23',timeZoneName:'short'
});
for (const time of document.querySelectorAll('time[datetime]')) {
  const date = new Date(time.dateTime);
  if (Number.isFinite(date.getTime())) time.textContent = localTime.format(date);
}

const tools = [...document.querySelectorAll('.tool')];
for (const [index, tool] of tools.entries()) {
  tool.querySelector('.no').textContent = String(index + 1).padStart(2, '0');
}
function applyHash() {
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  const library = document.querySelector('#collection');
  if (!library) return;
  if (library.dataset.retired?.split(' ').includes(id)) {
    history.replaceState(null, '', '#collection');
    library.scrollIntoView();
    return;
  }
  const target = document.getElementById(id) || tools.find(tool => tool.dataset.aliases?.split(' ').includes(id));
  if (target?.matches('details')) target.open = true;
  target?.scrollIntoView();
}
window.addEventListener('pageshow', applyHash);
window.addEventListener('hashchange', applyHash);
