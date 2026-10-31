# EVFX

EVFX plugins and tools for After Effects, Blender, and Windows.

**Site:** https://sbilogic.github.io/evfx/  
**Downloads:** https://github.com/sbilogic/evfx/releases

Plain HTML, CSS, inline SVG, and a small progressive-enhancement script. No runtime dependencies, external fonts, tracking, database, paid hosting, or visitor-side GitHub API requests. Every description and download is rendered into HTML, including when JavaScript is disabled. GitHub Pages serves the page; GitHub Releases serves the larger downloads.

## Maintain the collection

This site is a separate repository. It does not publish the private plugin repositories or include the AE SDK, model weights, source footage, or local runtime folders.

With this checkout beside the EVFX project folders, **double-click `Sync EVFX.cmd`** after making new release builds. Or run:

```sh
node scripts/publish.mjs
```

Requires Node 22+, Python 3, Git, and GitHub authentication through Git Credential Manager or a session-only `GH_TOKEN`. Credentials stay in process memory; they are never saved to the repository, release metadata, or a browser bundle. Set `EVFX_COLLECTION_ROOT` if the collection lives somewhere else.

The publisher selects the highest semantic version of packaged builds, prepares the explicitly listed bundles, creates immutable per-tool releases with SHA-256 checksums, verifies GitHub’s uploaded digest when available, updates the release lock, checks and builds the page, and pushes the site. It never compiles, runs an installer, processes footage, uploads entire project folders, or changes existing private repository visibility. Interrupted uploads can be resumed by running it again.

### Readiness warnings

Every tool has an explicit `readiness` record in `catalog.json`, with the exact reviewed release tag and a short evidence note. Incomplete, experimental, unverified, legacy, and unfinished research tools show an always-visible warning explaining what is missing, a warning badge, and a caution beside the download. The download link references its warning for screen readers. These notices work without JavaScript.

`reviewed` records a build-specific evidence review; it is not a universal stability certification. A new release tag, even with the same version number, defaults to **unverified** until that exact build is reviewed. GitHub prerelease flags also force a warning. Known incomplete features remain warnings across new builds. Adding a tool without readiness metadata fails the catalog check.

The publisher writes the same warnings at the top of GitHub release notes and marks builds needing caution as prereleases. To apply edited warnings to already published releases without uploading binaries again, run `node scripts/sync-warnings.mjs`, then `node scripts/refresh.mjs` and commit the catalog and release lock. Release availability never automatically clears a readiness warning.

`sources.json` is an explicit list of distribution inputs. Change a native plugin’s version and artifact path when its build location or version changes. ZIP/EXE versions are selected from filenames rather than timestamps. Unversioned utilities are labelled snapshots. Changes to a binary with the same version receive a new immutable release tag.

To inspect package preparation without publishing:

```sh
node scripts/publish.mjs --prepare-only
```

To publish a subset, use `--only=smart-grain,blurry`. Public copy, requirements, and status are in `catalog.json`; preview, legacy, and lab labels are explicit. Empty project folders are omitted until there is a described tool or distribution.

## Support payments

`support.json` holds the public creator/payment URL and an optional monthly-support URL. The header and bottom of the catalog show a plain **Support EVFX** link once the main URL is configured. Monthly support appears only when its own URL is provided. Links open the payment provider directly; there are no embedded widgets, third-party scripts, download gates, or prompts.

An unset URL renders no payment link. Create the creator account and complete its payout setup first, then add the verified public page URL. `node scripts/check.mjs` validates the configuration. The signup username alone is not treated as a working payment destination.

## Automatic hosting updates

GitHub Actions rebuilds and deploys on pushes and release changes. A daily reconciliation also refreshes release metadata, so the live page does not rely on an open local computer. The workflow uses GitHub’s built-in token and public-repository runners. It only publishes the small `dist/` folder.

Release downloads are resolved at build time. `refresh.mjs` reads each release’s `evfx-release` manifest, verifies asset presence, byte size, and available SHA-256 digests, then selects the highest semantic version per tool, using publication time for revised builds and unversioned snapshots. Unmarked releases are ignored. Known prereleases remain visible with readiness warnings. To update a tool from GitHub directly, publish a release with a matching manifest; the local publisher writes these automatically. No personal access token is needed in repository secrets.

## Preview and check

```sh
node scripts/check.mjs
node scripts/build.mjs
node scripts/serve.mjs
```

Open http://127.0.0.1:4173/evfx/ . All asset paths work under a GitHub project-site base path. `node scripts/refresh.mjs` refreshes from remote releases when authenticated.

The build reports raw and gzip sizes. All artwork is deterministic SVG made in code. The UI has application filters, text search, keyboard-accessible install notes, direct downloads, reduced-motion support, and usable HTML without JavaScript.

## Distribution notes

Most native AEX builds are Windows x64. Scripts and add-ons have their own compatibility notes. Corridor Key is an online installer requiring compatible NVIDIA hardware, substantial model/runtime downloads, and acceptance of the upstream noncommercial licence. Its current package is marked preview. Shot QC is a development build; Match Grain is legacy. OnlyScreens is research with no downloadable package yet.

Third-party components retain their own licences; this website does not relicense the plugin binaries or their dependencies. Review each download’s included notices and requirements.

Hosting references: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [release storage](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).
