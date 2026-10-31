import test from 'node:test';
import assert from 'node:assert/strict';
import { getReadiness,warningMarkdown } from '../scripts/readiness.mjs';
const reviewed={id:'example',readiness:{state:'reviewed',releaseTag:'example-v1.0.0-original'}};
const original={tag:'example-v1.0.0-original',version:'1.0.0',prerelease:false};

test('a readiness review applies only to its exact build',()=>{
  assert.equal(getReadiness(reviewed,original).state,'reviewed');
  const replaced=getReadiness(reviewed,{...original,tag:'example-v1.0.0-replaced'});
  assert.equal(replaced.state,'unverified');
  assert.match(replaced.note,/older build/);
});
test('new tools default to a warning until reviewed',()=>{
  const readiness=getReadiness({id:'new-tool'},original);
  assert.equal(readiness.state,'unverified');
  assert.match(readiness.note,/no recorded readiness review/);
});
test('a GitHub prerelease label forces a warning even for a reviewed tag',()=>{
  const readiness=getReadiness(reviewed,{...original,prerelease:true});
  assert.equal(readiness.state,'unverified');
  assert.match(readiness.note,/prerelease on GitHub/);
});
test('publishing a newer build cannot clear known incomplete features',()=>{
  const tool={id:'crop',readiness:{state:'incomplete',releaseTag:'old',note:'Mask bypass is not implemented.'}};
  const readiness=getReadiness(tool,{tag:'new'});
  assert.equal(readiness.state,'incomplete');
  assert.match(readiness.note,/Mask bypass/);
  assert.match(readiness.note,/newer build/);
});
test('GitHub release notes show warnings before installation content',()=>{
  const warning=warningMarkdown({id:'experimental',readiness:{state:'experimental',releaseTag:'tag',note:'Host loading is unverified.'}},{tag:'tag'});
  assert.match(warning,/> \[!WARNING\]/);
  assert.match(warning,/may be unstable/);
  assert.match(warning,/Host loading is unverified/);
  assert.equal(warningMarkdown(reviewed,original),'');
});
