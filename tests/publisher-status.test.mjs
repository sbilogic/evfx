import test from 'node:test';
import assert from 'node:assert/strict';
import { editedSourcePaths } from '../scripts/publisher.mjs';

test('generated files never count as site edits, even when trimmed output drops the first status space', () => {
  assert.deepEqual(editedSourcePaths('M catalog.json'), []);
  assert.deepEqual(editedSourcePaths(' M catalog.json\0 M sources.json\0'), []);
  assert.deepEqual(editedSourcePaths('M  releases.lock.json\0MM catalog.json\0'), []);
  assert.deepEqual(editedSourcePaths(' M mobile-releases.json'), []);
});

test('source edits are still detected in every status position', () => {
  assert.deepEqual(editedSourcePaths('M scripts/publisher.mjs'), ['scripts/publisher.mjs']);
  assert.deepEqual(editedSourcePaths('M catalog.json\0?? src/new.js\0 D README.md\0'), ['src/new.js', 'README.md']);
  assert.deepEqual(editedSourcePaths('M M file'), ['M file']);
});
