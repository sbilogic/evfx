import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseHistory, mergeHistory, versionNotes } from '../scripts/release-history.mjs';

const candidate = (version, date, {build, tag=version, body='', notes}={}) => ({
  release:{tag_name:tag,published_at:date,html_url:`https://github.com/example/evfx/releases/tag/${tag}`,body,prerelease:false,assets:[]},
  meta:{version,...(build===undefined?{}:{build}),...(notes?{releaseNotes:notes}:{}),files:[]}
});

test('history shows the three newest distinct versions and keeps identifiable builds', () => {
  const candidates=[
    candidate('2.6.7','2026-11-05',{tag:'packaged'}),
    candidate('2.6.7','2026-11-04',{tag:'same-version',build:1}),
    candidate('2.6.6','2026-11-03'),
    candidate('2.6.5','2026-11-02'),
    candidate('2.6.4','2026-11-01')
  ];
  assert.deepEqual(releaseHistory(candidates).map(item=>item.tag),['packaged','2.6.6','2.6.5']);
  const builds=[candidate('2.1.0','2026-11-03',{build:2,tag:'build2'}),candidate('2.1.0','2026-11-02',{build:1,tag:'build1'})];
  assert.deepEqual(releaseHistory(builds).map(item=>item.tag),['build2','build1']);
});

test('history uses real version notes and never treats a generic description as changes', () => {
  const noNotes=candidate('1.0.0','2026-11-02',{body:'A general product description.\n\n### Installation\nCopy the file.'});
  const withNotes=candidate('1.1.0','2026-11-03',{body:'### Changes\n- Fixed playback.\n- Improved export.\n\n### Installation\nCopy the file.'});
  const result=releaseHistory([noNotes,withNotes],{'1.0.0':['A verified package note.']});
  assert.deepEqual(result[0].notes,['Fixed playback.','Improved export.']);
  assert.deepEqual(result[1].notes,['A verified package note.']);
  assert.deepEqual(releaseHistory([noNotes])[0].notes,[]);
});

test('a versioned changelog returns only the selected version', () => {
  const text='# Plugin 1.1.2\n\nUnreleased change.\n\n# Plugin 1.1.1\n\nFixed coarse noise.\n\n- Faster preview.\n\n# Plugin 1.1.0\n\nOlder change.';
  assert.deepEqual(versionNotes(text,'1.1.1'),['Fixed coarse noise.','Faster preview.']);
  assert.deepEqual(versionNotes(text,'1.2.0'),[]);
});

test('long release notes prioritize the actual change over the old problem', () => {
  const prior='The previous output had a visible dark border and could make the image look substantially worse. '.repeat(5);
  const text=`# Tool 1.0.0\n\n${prior}The renderer now preserves the background near the matte edge. Additional validation is pending.`;
  const notes=versionNotes(text,'1.0.0');
  assert.match(notes[0],/now preserves the background/);
  assert(notes[0].length<=240);
});

test('publishing a new build retains the previous version history', () => {
  const old=releaseHistory([candidate('1.1.0','2026-11-02'),candidate('1.0.0','2026-11-01')]);
  const current=releaseHistory([candidate('1.2.0','2026-11-03',{notes:['New tool.']})]);
  assert.deepEqual(mergeHistory(current,old).map(item=>item.version),['1.2.0','1.1.0','1.0.0']);
});
