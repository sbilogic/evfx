const filters = [...document.querySelectorAll('[data-filter]')];
const tools = [...document.querySelectorAll('.tool')];
const search = document.querySelector('#tool-search');
const development = document.querySelector('#show-development');
const status = document.querySelector('#results-count');
const hasDevelopment = new Set(tools.filter(t=>t.dataset.variant==='development').map(t=>t.dataset.product));
let currentFilter = 'all';
development.checked = false;

function updateCollection() {
  const query = search.value.trim().toLocaleLowerCase();
  const selected = tools.filter(tool=>development.checked && hasDevelopment.has(tool.dataset.product)
    ? tool.dataset.variant==='development' : tool.dataset.variant==='complete');
  const categories = new Set(selected.map(t=>t.dataset.category));
  if(currentFilter!=='all'&&!categories.has(currentFilter))currentFilter='all';
  for(const button of filters){
    button.hidden=button.dataset.filter!=='all'&&!categories.has(button.dataset.filter);
    button.setAttribute('aria-pressed',String(button.dataset.filter===currentFilter));
  }
  document.querySelector('#tools-total').textContent=String(selected.length);
  let visible = 0;
  for (const tool of tools) {
    const matches = selected.includes(tool) && (currentFilter==='all'||tool.dataset.category===currentFilter)
      && (!query||tool.dataset.search.includes(query));
    tool.hidden = !matches;
    if(matches){visible++;const number=tool.querySelector('.tool-number');if(number)number.textContent=String(visible).padStart(2,'0');}
  }
  document.querySelector('#empty-state').hidden=visible!==0;
  document.querySelector('#show-development-results').hidden=development.checked||!tools.some(t=>t.dataset.variant==='development'&&(currentFilter==='all'||t.dataset.category===currentFilter)&&(!query||t.dataset.search.includes(query)));
  status.textContent=`${visible} ${visible===1?'tool':'tools'}${query?` matching “${search.value.trim()}”`:''}`;
}
for(const button of filters)button.addEventListener('click',()=>{currentFilter=button.dataset.filter;updateCollection();});
search.addEventListener('input',updateCollection);
development.addEventListener('change',updateCollection);
document.querySelector('#show-development-results').addEventListener('click',()=>{development.checked=true;updateCollection();});
document.querySelector('#reset-filters').addEventListener('click',()=>{search.value='';development.checked=false;currentFilter='all';updateCollection();search.focus();});
function applyHash(){
  let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}
  const target=document.getElementById(id);
  if(target?.dataset.variant==='development'){development.checked=true;updateCollection();target.scrollIntoView();}
}
window.addEventListener('pageshow',()=>{updateCollection();applyHash();});
window.addEventListener('hashchange',applyHash);
updateCollection();
