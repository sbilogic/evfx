const maxNotes = 2;
const versionPattern = /\b\d+\.\d+\.\d+(?:-(?:dev|alpha|beta|rc|preview)[\w.-]*)?/i;
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function cleanNote(value) {
  if (typeof value !== 'string') return '';
  let text = value.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[\s>*+\-]+/, '').replace(/[`*_~]/g, '').replace(/\s+/g, ' ').trim();
  if (!text || /(?:https?:\/\/|[A-Z]:[\\/]|\b(?:user['’]s|client)\b|<!--|<script)/i.test(text)) return '';
  if (text.length > 240) {
    const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
    let short = '';
    const preferred=sentences.filter(sentence=>/\b(?:now|adds?|fixed?|improv(?:e|es|ed)|correct(?:s|ed)?|prevents?|supports?|reduces?|replaces?)\b/i.test(sentence));
    for (const sentence of preferred.length?preferred:sentences) {
      if ((short + ' ' + sentence).trim().length > 240) break;
      short += (short?' ':'') + sentence;
    }
    text = short.trim() || text.slice(0, 237).replace(/\s+\S*$/, '') + '…';
  }
  return text;
}

export function normalizeNotes(notes) {
  return Array.isArray(notes) ? notes.map(cleanNote).filter(Boolean).slice(0,maxNotes) : [];
}

function paragraphs(lines) {
  const blocks=[];
  let current='', fenced=false;
  const flush=()=>{if(current)blocks.push(current);current='';};
  for(const line of lines){
    if(/^\s*```/.test(line)){flush();fenced=!fenced;continue;}
    if(fenced)continue;
    if(/^\s*(?:#{1,6}\s|<!--|---\s*$)/.test(line)){flush();continue;}
    if(!line.trim()){flush();continue;}
    if(/^\s*[-*+]\s+/.test(line)){flush();current=line;continue;}
    current+=(current?' ':'')+line.trim();
  }
  flush();
  return normalizeNotes(blocks);
}

export function versionNotes(content, version) {
  if(typeof content!=='string'||!version)return [];
  const lines=content.replace(/\r\n?/g,'\n').split('\n');
  const target=new RegExp(`(^|[^0-9.])${escapeRegex(version)}(?![0-9.])`,'i');
  const start=lines.findIndex(line=>/^#{1,6}\s/.test(line)&&target.test(line));
  if(start<0)return [];
  const level=(lines[start].match(/^#+/)||[''])[0].length;
  let end=lines.length;
  for(let i=start+1;i<lines.length;i++){
    const heading=lines[i].match(/^(#{1,6})\s+(.+)/);
    if(heading&&(heading[1].length<=level||versionPattern.test(heading[2])&&!target.test(heading[2]))){end=i;break;}
  }
  return paragraphs(lines.slice(start+1,end));
}

function bodyNotes(body) {
  if(typeof body!=='string')return [];
  const lines=body.replace(/\r\n?/g,'\n').split('\n');
  const start=lines.findIndex(line=>/^#{2,4}\s+(?:changes|change notes|release notes|what['’]?s new|highlights)\s*$/i.test(line));
  if(start<0)return [];
  const level=(lines[start].match(/^#+/)||[''])[0].length;
  let end=lines.length;
  for(let i=start+1;i<lines.length;i++){
    const heading=lines[i].match(/^(#{1,6})\s/);
    if(heading&&heading[1].length<=level){end=i;break;}
  }
  return paragraphs(lines.slice(start+1,end));
}

export function mergeHistory(...histories) {
  const ordered=histories.flat().sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||String(b.tag).localeCompare(String(a.tag)));
  const result=[];
  for(const item of ordered){
    if(item.version&&result.some(old=>old.version===item.version&&(old.build===undefined||item.build===undefined||old.build===item.build)))continue;
    result.push(item);
    if(result.length===3)break;
  }
  return result;
}

export function releaseHistory(candidates, backfill={}, limit=3) {
  const ordered=[...candidates].sort((a,b)=>Date.parse(b.release.published_at)-Date.parse(a.release.published_at)||String(b.release.tag_name).localeCompare(String(a.release.tag_name)));
  const result=[];
  for(const {release,meta} of ordered){
    const version=meta.version??null, build=meta.build;
    if(version&&result.some(item=>item.version===version&&(item.build===undefined||build===undefined||item.build===build)))continue;
    const primary=meta.files?.find(file=>file.primary);
    const asset=primary&&release.assets?.find(item=>item.name===primary.name&&item.state==='uploaded');
    const notes=bodyNotes(release.body);
    result.push({version,...(build!==undefined?{build}:{}),tag:release.tag_name,releaseUrl:release.html_url,
      publishedAt:asset?.created_at||release.published_at,...(asset?.created_at?{uploaded:true}:{}),prerelease:!!release.prerelease,
      notes:notes.length?notes:normalizeNotes(meta.releaseNotes).length?normalizeNotes(meta.releaseNotes):normalizeNotes(backfill[release.tag_name])});
    if(result.length>=limit)break;
  }
  return result;
}
