const filters = [...document.querySelectorAll('[data-filter]')];
const tools = [...document.querySelectorAll('.tool')];
const search = document.querySelector('#tool-search');
const status = document.querySelector('#results-count');
let currentFilter = 'all';

function updateCollection() {
  const query = search.value.trim().toLocaleLowerCase();
  let visible = 0;
  for (const tool of tools) {
    const matches = (currentFilter === 'all' || tool.dataset.category === currentFilter)
      && (!query || tool.dataset.search.includes(query));
    tool.hidden = !matches;
    if (matches) visible++;
  }
  document.querySelector('#empty-state').hidden = visible !== 0;
  status.textContent = `${visible} ${visible === 1 ? 'tool' : 'tools'}${query ? ` matching “${search.value.trim()}”` : ''}`;
}

for (const button of filters) {
  button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;
    for (const filter of filters) filter.setAttribute('aria-pressed', String(filter === button));
    updateCollection();
  });
}
search.addEventListener('input', updateCollection);
document.querySelector('#reset-filters').addEventListener('click', () => {
  search.value = '';
  filters[0].click();
  search.focus();
});
// Browser-restored search values should also apply after a back navigation.
window.addEventListener('pageshow', updateCollection);
