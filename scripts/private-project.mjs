import { isAbsolute, join, relative, resolve, sep } from 'node:path';

// Keep external dependencies outside the project in place when its folder moves.
export function remapPrivateProject(source, project) {
  if (!source.projectRoot) throw new Error('Private source has no project root');
  const oldRoot = resolve(source.projectRoot), nextRoot = resolve(project);
  const move = value => {
    if (!value) return value;
    const part = relative(oldRoot, resolve(value));
    if (part === '..' || part.startsWith('..' + sep) || isAbsolute(part)) return value;
    return join(nextRoot, part);
  };
  const next = structuredClone(source);
  next.projectRoot = nextRoot;
  next.versionFile = move(next.versionFile);
  next.nameFile = move(next.nameFile);
  for (const file of next.recipe.files || []) file.from = move(file.from);
  for (const directory of next.recipe.directories || []) directory.from = move(directory.from);
  next.recipe.template = move(next.recipe.template);
  if (next.recipe.verification) next.recipe.verification.binary = move(next.recipe.verification.binary);
  return next;
}
