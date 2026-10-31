const labels = {
  incomplete: { badge:'Incomplete', title:'Warning — incomplete tool' },
  experimental: { badge:'Experimental', title:'Warning — experimental / may be unstable' },
  unverified: { badge:'Unverified', title:'Warning — runtime stability unverified' },
  legacy: { badge:'Legacy / incomplete', title:'Warning — legacy, incomplete build' },
  development: { badge:'Incomplete', title:'Warning — incomplete / no public release' }
};

export function getReadiness(tool, release) {
  const review=tool.readiness;
  if(!review) return {state:'unverified',...labels.unverified,note:'This tool has no recorded readiness review. Evaluate it in a test project before use.'};
  if(review.state==='reviewed') {
    if(release?.prerelease) {
      return {state:'unverified',...labels.unverified,note:'This release is marked as a prerelease on GitHub. Runtime stability is unverified; evaluate it in a test project and keep a backup.'};
    }
    if(!release||review.releaseTag!==release.tag) {
      return {state:'unverified',...labels.unverified,note:'This build has not been reviewed for runtime readiness. Earlier checks apply to an older build; use a test project and keep a backup.'};
    }
    return {state:'reviewed'};
  }
  const label=labels[review.state]||labels.unverified;
  const newerBuild=release&&review.releaseTag!==release.tag;
  return {state:labels[review.state]?review.state:'unverified',...label,
    note:`${review.note||'Runtime readiness has not been verified.'}${newerBuild?' This newer build has not had its readiness rechecked.':''}`};
}

export function warningMarkdown(tool, release) {
  const readiness=getReadiness(tool,release);
  if(readiness.state==='reviewed')return '';
  return `<!-- evfx-warning-start -->\n> [!WARNING]\n> **${readiness.title}**\n>\n> ${readiness.note}\n>\n> Evaluate this build in a test project. Keep backups before using it in production.\n<!-- evfx-warning-end -->\n\n`;
}
