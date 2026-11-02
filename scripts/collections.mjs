const id=/^[a-z][a-z0-9-]+$/;

export function validateCollection(value){
  if(value?.schema!==1||typeof value.artifact!=='string'||!/^[a-f0-9]{64}$/.test(value.sha256||'')||!Array.isArray(value.members)||!Array.isArray(value.retired??[]))throw new Error('Invalid completed collection manifest');
  const claimed=new Set();
  for(const member of value.members){
    if(typeof member.id!=='string'||!id.test(member.id)||typeof member.name!=='string'||!member.name.trim()||typeof member.tab!=='string'||!member.tab.trim()||!Array.isArray(member.replaces??[]))throw new Error('Invalid collection member');
    for(const alias of [member.id,...(member.replaces||[])]){
      if(typeof alias!=='string'||!id.test(alias)||claimed.has(alias))throw new Error(`Conflicting collection member: ${alias}`);
      claimed.add(alias);
    }
  }
  for(const alias of value.retired||[]){
    if(typeof alias!=='string'||!id.test(alias)||claimed.has(alias))throw new Error('Conflicting retired collection alias: '+alias);
    claimed.add(alias);
  }
  return structuredClone(value);
}

export const collectionIds=collection=>[...collection.members.flatMap(member=>[member.id,...(member.replaces||[])]),...(collection.retired||[])];
export const collectionDescription=collection=>collection.members.map(member=>member.name).join(' · ')||'No tools in this build.';
