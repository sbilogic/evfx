const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function supportUrl(value){
  if(value==null||value==='')return null;
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)throw new Error('Support links must be public HTTPS URLs without credentials.');
  if(!url.pathname.replaceAll('/',''))throw new Error('Support links must point to your creator or payment page.');
  return url.href;
}

export function renderSupport(config){
  const url=supportUrl(config.url);
  const monthly=supportUrl(config.monthlyUrl);
  if(!url){
    if(monthly)throw new Error('Configure the main support page before adding monthly support.');
    return {nav:'',section:''};
  }
  return {
    nav:`<a class="support-nav" href="${escape(url)}" target="_blank" rel="noopener noreferrer">Support EVFX ↗</a>`,
    section:`<section id="support" class="support wrap" aria-labelledby="support-title"><h2 id="support-title">Support development</h2><div class="support-links"><a class="support-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer">Support EVFX <span aria-hidden="true">↗</span></a>${monthly?`<a class="support-monthly" href="${escape(monthly)}" target="_blank" rel="noopener noreferrer">Monthly support ↗</a>`:''}</div></section>`
  };
}
