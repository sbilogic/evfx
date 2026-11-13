import test from 'node:test';
import assert from 'node:assert/strict';
import { privateHistory } from '../scripts/private-history.mjs';

test('private history keeps three builds and preserves notes for an unchanged build', () => {
  const old={version:'1.0',buildSha:'a',uploadedAt:'2026-11-01',history:[
    {version:'1.0',buildSha:'a',uploadedAt:'2026-11-01',notes:['First build.']}
  ]};
  assert.deepEqual(privateHistory(old,old,[]),old.history);
  const newer={version:'1.1',buildSha:'b',uploadedAt:'2026-11-02'};
  const history=privateHistory(old,newer,['New feature.']);
  assert.deepEqual(history.map(item=>item.version),['1.1','1.0']);
  assert.deepEqual(history[0].notes,['New feature.']);
  assert.equal(privateHistory({history}, {version:'1.2',buildSha:'c',uploadedAt:'2026-11-03'}, []).length,3);
});
