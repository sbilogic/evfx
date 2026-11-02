# EVFX

Plugins and tools for After Effects, Blender, and Windows.

[Site](https://sbilogic.github.io/evfx/) · [Downloads](https://github.com/sbilogic/evfx/releases) · [Support](https://buymeacoffee.com/eclipsevfx)

Static HTML, CSS, SVG and JavaScript. No runtime dependencies, external fonts, tracking, database or paid hosting. GitHub Pages serves the page; release assets carry the downloads.

## Automatic local sync

Sync runs as a finite step after packaging, then exits. There is no file watcher, login helper, service, scheduled task, recurring scan, or idle Node process. Unchanged builds make no GitHub requests.

One-shot hooks cover native CMake Release builds, PowerShell packaging, Blender add-on packaging, and JSX build scripts. The installer discovers supported commands in both EVFX roots, preserves backups, and appends an owned block after the successful build path. It runs again during publication to connect newly found projects. `build-hooks.json` supplies additional known entry points; `.local/build-hooks.json` records the complete installed set. Failed publication warns without failing the build and retries on the next build.

Native builds report their actual AEX output. If a previously packaged ZIP is older, the publisher replaces its binary and matching companion scripts while retaining install files, presets and licences. A newly packaged ZIP takes precedence again. Debug builds do not publish. A new native hash remains unverified until its own runtime review; the last complete release stays in the default view.

`sync.config.json` lists roots relative to this checkout: the EVFX Collection folder and its parent Dev folder. Only immediate EVFX-prefixed projects and the collection's plugin subfolders are inspected. Release/dist packages and native Release AEX/JSX files are supported. Source/reference archives, generated dependency trees and empty projects are excluded. Smart Denoise and Match Grain are explicitly excluded and cannot be rediscovered.

An active worktree can be configured as a root with a `projects` allow-list. PixelPicker follows its selected redesign worktree rather than its legacy main folder. Native AE versions and build numbers come from the compiled PiPL resource; release metadata records the AEX hash separately from the ZIP hash.

Each one-shot sync discovers new plugins and updated builds in both roots. New plugins get their name and description from the project folder and README. Existing curated descriptions stay in place unless project release metadata supplies a replacement. `catalog.json`, `sources.json` and `releases.lock.json` are generated; new plugin/version entries do not require website edits. Folders are inspected only when a connected build or manual sync runs.

The helper streams uploads, verifies SHA-256 digests, validates ZIP integrity, and reuses prior checks for identical files. It never builds a plugin, launches an installer or AE, uploads whole project folders, or changes private repository visibility. It skips publication while site code is being edited. Failed or deferred publications can retry on the next connected build or manual sync; existing downloads remain available.

GitHub Actions deploys repository pushes, with no scheduled rebuilds. The publisher explicitly dispatches a deployment for metadata-only release changes that need no commit, avoiding duplicate builds for the same publication. Hosting the site consumes no local PC resources.

## Complete and development builds

The site defaults to complete, reviewed builds. The **Development** view lists the newest incomplete, experimental and unverified builds, each with a visible warning. If a newer build is unverified, the last reviewed download stays in the default view.

A version number or ZIP filename does not establish completeness. Existing reviews apply to exact release tags. A plugin's normal test/package process can write `evfx-release.json` at the project root:

```json
{
  "description": "Process alpha masks.",
  "readiness": {
    "state": "complete",
    "runtimeVerified": true,
    "sha256": "SHA256_OF_THE_PRIMARY_PACKAGE"
  }
}
```

The declaration must match the uploaded package, or the single AEX/JSX payload being wrapped, and record completed runtime verification. Prerelease versions remain development builds. A declaration without the matching hash and verification cannot promote a build. Known problems can be declared with a readiness state such as `incomplete` and a `note`. This is build metadata maintained by the plugin's packaging process, not a website entry.

## Detail pages

The library is grouped by host. Utility Collection discovers its tools from the actual panel tabs and production source modules, including normal shared-source includes. Its build generates the completed-build `collection` record in `evfx-release.json`; no hand-maintained tool registry is used. Website discovery accepts that record only when its SHA-256 matches the selected JSX. Inferred standalone script identities and old names are consolidated under the collection with redirects. Shared source folders stay on disk; full native plugins and tools for other hosts remain independent.

Published releases retain their own member lists, so the site describes the tools included in the actual download. Adding source and a panel tab, then running the normal collection build, updates the list, legacy redirects and duplicate suppression together. Unbuilt or mismatched manifests defer publication. Retired tools' existing explanation data can remain archived behind their redirects.

Renames and removals replace the current included-tool list on the next normal build. The build automatically carries former identities in an optional `collection.retired` alias list, used only for redirects and duplicate suppression. Removed names never appear as included tools, even if old standalone distributions remain on disk. Re-adding a name reclaims it automatically; an empty collection says it contains no tools. Native plugins remain independent of both active and retired script aliases.

Each released tool listed in `explain.json` gets a page at `/evfx/<id>/` with its processing steps and limits. Keep the text to what the tool actually does, sourced from the project's own docs. Development builds have no page.

## Local controls

Requires Node 22+, Python 3, Git and cached GitHub authentication through Git Credential Manager, or a session-only `GH_TOKEN`. No credentials are stored by the hooks.

```sh
node scripts/install-build-hooks.mjs
node scripts/install-build-hooks.mjs --uninstall
node scripts/sync-after-build.mjs
node scripts/auto-sync.mjs --status
```

New EVFX project setup must run `node <path-to-EVFX-Site>/scripts/install-build-hooks.mjs` before its first release build. The Dev workspace's EVFX instructions require agents to do this during setup. An arbitrary new build command cannot trigger publication until its hook is connected. Supported CMake, PowerShell, Python add-on and JSX builders are discovered automatically; other build systems can call `node <path-to-EVFX-Site>/scripts/sync-after-build.mjs` after successful packaging. Native CMake callbacks also pass `--project <project-root> --artifact <built-aex>`. Status, bounded logs, original script backups and locks are under ignored `.local/`. The retired auto-start installer only supports removing an old installation.

The normal build/package command publishes automatically; running sync manually is not part of the release workflow. `Sync EVFX.cmd` remains an optional repair command for direct edits without a build. `node scripts/discover.mjs` previews discovery without uploading. `node scripts/publish.mjs --prepare-only` prepares and checks packages without publishing. `--only=smart-grain,blurry` limits a manual publication.

## Preview and verification

```sh
node scripts/check.mjs
node --test
node scripts/build.mjs
node scripts/serve.mjs
```

Open http://127.0.0.1:4173/evfx/ . All paths support a GitHub project-site base path. The build reports raw and gzip size. Complete downloads work without JavaScript; the Development view needs JavaScript.

GitHub Actions checks and deploys pushes and explicit publisher dispatches. Metadata is resolved at build time, including a separate last-complete download. The browser makes no GitHub API calls. Credentials stay in process memory and never enter the site, release notes, or repository.

Each download shows its GitHub asset upload date and time, including the timezone. The browser formats it in the visitor's local timezone; without JavaScript, the static UTC time remains visible. Older metadata without an asset timestamp is labelled Published using the release date. Site rebuilds and release-note edits do not reset upload times.

CSS and JavaScript URLs include content hashes so new display code loads after a deployment while unchanged assets stay cached.

## Support

`support.json` points header and footer support actions to the public creator page. Monthly support appears only if its own URL is configured. `.github/FUNDING.yml` configures the repository Sponsor button. These are direct links, with no embedded widgets or download gates. The creator's payout setup is required before the support page can receive payments.

## Distribution notes

Native AEX builds are Windows x64; scripts and add-ons have their own requirements. Corridor Key is an online installer requiring compatible NVIDIA hardware, runtime/model downloads and the upstream noncommercial licence. OnlyScreens has no public package yet. Each download retains its own licences and notices; this site does not relicense binaries or dependencies.
