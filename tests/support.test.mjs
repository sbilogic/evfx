import test from 'node:test';
import assert from 'node:assert/strict';
import { supportUrl,renderSupport } from '../scripts/support.mjs';

test('an unconfigured payment destination cannot produce a dead support button',()=>{
  assert.deepEqual(renderSupport({url:null,monthlyUrl:null}),{nav:'',section:''});
});
test('payment links require HTTPS and cannot contain credentials',()=>{
  for(const value of ['javascript:alert(1)','http://example.com/creator','https://user:secret@example.com/creator','https://buymeacoffee.com/']){
    assert.throws(()=>supportUrl(value));
  }
});
test('support actions point directly to the configured page without embeds',()=>{
  const url='https://example.com/creator';
  const result=renderSupport({url,monthlyUrl:null});
  assert(result.nav.includes(`href="${url}"`));
  assert(result.section.includes(`href="${url}"`));
  assert(!result.section.includes('<script'));
  assert(!result.section.includes('<iframe'));
  assert(!result.section.includes('Monthly support'));
});
test('monthly support appears only with an explicitly configured destination',()=>{
  assert.throws(()=>renderSupport({url:null,monthlyUrl:'https://example.com/monthly'}));
  assert(renderSupport({url:'https://example.com/creator',monthlyUrl:'https://example.com/monthly'}).section.includes('Monthly support'));
});
