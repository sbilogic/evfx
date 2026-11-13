import { normalizeNotes } from './release-history.mjs';

export function privateHistory(previous,current,notes=[]) {
  const history=Array.isArray(previous?.history)?previous.history:
    previous?.buildSha?[{version:previous.version,buildSha:previous.buildSha,uploadedAt:previous.uploadedAt,notes:[]}]:[];
  const existing=history.find(item=>item.buildSha===current.buildSha);
  const next={version:current.version,buildSha:current.buildSha,uploadedAt:current.uploadedAt,
    notes:normalizeNotes(notes).length?normalizeNotes(notes):normalizeNotes(existing?.notes)};
  return [next,...history.filter(item=>item.buildSha!==current.buildSha)].slice(0,3);
}
