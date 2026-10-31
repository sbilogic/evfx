import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
let token;
export function githubToken() {
  if(token)return token;
  token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;
  if(!token){
    const result=spawnSync(process.env.EVFX_GIT||'git',['credential','fill'],{
      input:'protocol=https\nhost=github.com\nusername=sbilogic\n\n',encoding:'utf8',
      env:{...process.env,GCM_INTERACTIVE:'Never'},timeout:30000,windowsHide:true
    });
    token=result.stdout?.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9);
  }
  if(!token)throw new Error('GitHub authentication is unavailable. Sign in with Git Credential Manager or set GH_TOKEN in this session.');
  return token;
}

export async function github(path,{method='GET',body,raw,filePath,headers={},allow404=false}={}){
  const url=path.startsWith('https://')?path:`https://api.github.com${path}`;
  // Credentials are restricted to GitHub API/upload hosts and never logged.
  if(!['api.github.com','uploads.github.com'].includes(new URL(url).hostname))throw new Error('Unexpected API host');
  if(filePath)headers={...headers,'Content-Length':String((await stat(filePath)).size)};
  const response=await fetch(url,{
    method,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'EVFX-release-publisher',Authorization:`Bearer ${githubToken()}`,...(body?{'Content-Type':'application/json'}:{}),...headers},
    body:filePath?Readable.toWeb(createReadStream(filePath)):raw??(body?JSON.stringify(body):undefined),...(filePath?{duplex:'half'}:{}),signal:AbortSignal.timeout(raw||filePath?600000:45000),redirect:'error'
  });
  if(allow404&&response.status===404)return null;
  if(!response.ok){
    if(response.status===401)token=undefined;
    const data=await response.json().catch(()=>({}));
    throw new Error(`GitHub ${method} ${new URL(url).pathname}: ${response.status} ${data.message||response.statusText}`);
  }
  if(response.status===204)return null;
  return response.json();
}

export async function allReleases(repository){
  const releases=[];
  for(let page=1;page<=50;page++){
    const batch=await github(`/repos/${repository}/releases?per_page=100&page=${page}`);
    releases.push(...batch);
    if(batch.length<100)return releases;
  }
  throw new Error('Too many releases to safely refresh the catalog.');
}

export function metadataFromRelease(release){
  const match=release.body?.match(/<!-- evfx-release\s+([\s\S]*?)\s+-->/);
  if(!match)return null;
  try{return JSON.parse(match[1]);}catch{return null;}
}

export function lockFromRelease(release,meta){
  const downloads=meta.files.map(file=>{
    const asset=release.assets.find(a=>a.name===file.name&&a.state==='uploaded');
    if(!asset)throw new Error(`Release ${release.tag_name} is missing ${file.name}`);
    if(asset.size!==file.bytes)throw new Error(`Release ${release.tag_name}: asset size differs from its manifest`);
    if(asset.digest&&asset.digest!==`sha256:${file.sha256}`)throw new Error(`Release ${release.tag_name}: SHA-256 mismatch`);
    if(!/^[a-f0-9]{64}$/.test(file.sha256))throw new Error('Invalid asset checksum');
    return {name:asset.name,url:asset.browser_download_url,bytes:asset.size,sha256:file.sha256,primary:!!file.primary};
  });
  return {version:meta.version??null,...(meta.build!==undefined?{build:meta.build}:{}),...(meta.aeVersion?{aeVersion:meta.aeVersion}:{}),...(meta.binary?{binary:meta.binary}:{}),publishedAt:release.published_at,releaseUrl:release.html_url,tag:release.tag_name,prerelease:!!release.prerelease,...(meta.readiness?{review:meta.readiness}:{}),downloads};
}
