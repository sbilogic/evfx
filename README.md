# EVFX

Plugins and tools for After Effects, Blender, and Windows.

[Site](https://sbilogic.github.io/evfx/) · [Downloads](https://github.com/sbilogic/evfx/releases) · [Support](https://buymeacoffee.com/eclipsevfx)

Static HTML, CSS, SVG and JavaScript. No runtime dependencies, external fonts, tracking, database or paid hosting. GitHub Pages serves the page; release assets carry the downloads.

## Automatic local sync

The local helper checks EVFX folders every 60 seconds while this Windows user is logged in. It starts at login, waits for build files to settle, then uploads changed distributions and deploys the catalog. Unchanged scans make no GitHub requests. No AI job or subscription is involved.

`sync.config.json` lists roots relative to this checkout: the EVFX Collection folder and its parent Dev folder. Only immediate EVFX-prefixed projects and the collection's plugin subfolders are inspected. Release/dist packages and native Release AEX/JSX files are supported. Source/reference archives, generated dependency trees and empty projects are excluded. Smart Denoise and Match Grain are explicitly excluded and cannot be rediscovered.

New plugins get their name and description from the project folder and README. Existing curated descriptions stay in place unless project release metadata supplies a replacement. `catalog.json`, `sources.json` and `releases.lock.json` are generated; new plugin/version entries do not require website edits.

The helper streams uploads, verifies SHA-256 digests, validates ZIP integrity, and reuses prior checks for identical files. It never builds a plugin, launches an installer or AE, uploads whole project folders, or changes private repository visibility. It pauses publication while site code is being edited. Interrupted publications retry on subsequent checks; existing downloads remain available.

GitHub cannot read folders on an offline PC. The local sync resumes after login; GitHub Actions separately refreshes already published release metadata every day.

## Complete and development builds

The site defaults to complete, reviewed builds. **Show development** includes the newest incomplete, experimental and unverified builds with visible warnings. If a newer build is unverified, the last reviewed download stays in the default view.

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

## Local controls

Requires Node 22+, Python 3, Git and cached GitHub authentication through Git Credential Manager, or a session-only `GH_TOKEN`. The login helper uses the current Windows user and stores no credentials.

```sh
node scripts/install-auto-sync.mjs
node scripts/auto-sync.mjs --status
node scripts/auto-sync.mjs --once --force
node scripts/install-auto-sync.mjs --uninstall
```

Installation creates `EVFX Site Auto Sync.vbs` in the current user's Startup folder and launches a hidden helper. Status, bounded logs and locks are under ignored `.local/`. Uninstall removes only the owned Startup entry and disables the runner; a running publication can finish before it exits.

`Sync EVFX.cmd` remains an optional immediate manual sync. `node scripts/discover.mjs` previews discovery without uploading. `node scripts/publish.mjs --prepare-only` prepares and checks packages without publishing. `--only=smart-grain,blurry` limits a manual publication.

## Preview and verification

```sh
node scripts/check.mjs
node --test
node scripts/build.mjs
node scripts/serve.mjs
```

Open http://127.0.0.1:4173/evfx/ . All paths support a GitHub project-site base path. The build reports raw and gzip size. Complete downloads work without JavaScript; filters and development builds need JavaScript.

GitHub Actions checks and deploys pushes and release changes. Metadata is resolved at build time, including a separate last-complete download. The browser makes no GitHub API calls. Credentials stay in process memory and never enter the site, release notes, or repository.

## Support

`support.json` points header and footer support actions to the public creator page. Monthly support appears only if its own URL is configured. `.github/FUNDING.yml` configures the repository Sponsor button. These are direct links, with no embedded widgets or download gates. The creator's payout setup is required before the support page can receive payments.

## Distribution notes

Native AEX builds are Windows x64; scripts and add-ons have their own requirements. Corridor Key is an online installer requiring compatible NVIDIA hardware, runtime/model downloads and the upstream noncommercial licence. OnlyScreens has no public package yet. Each download retains its own licences and notices; this site does not relicense binaries or dependencies.
