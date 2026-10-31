# EVFX

Independent plugins, scripts, and useful oddities for the moving image.

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

`sources.json` is an explicit list of distribution inputs. Change a native plugin’s version and artifact path when its build location or version changes. ZIP/EXE versions are selected from filenames rather than timestamps. Unversioned utilities are labelled snapshots. Changes to a binary with the same version receive a new immutable release tag.

To inspect package preparation without publishing:

```sh
node scripts/publish.mjs --prepare-only
```

To publish a subset, use `--only=smart-grain,blurry`. Public copy, requirements, and status are in `catalog.json`; preview, legacy, and lab labels are explicit. Empty project folders are omitted until there is a described tool or distribution.

## Automatic hosting updates

GitHub Actions rebuilds and deploys on pushes and release changes. A daily reconciliation also refreshes release metadata, so the live page does not rely on an open local computer. The workflow uses GitHub’s built-in token and public-repository runners. It only publishes the small `dist/` folder.

Release downloads are resolved at build time. `refresh.mjs` reads each release’s `evfx-release` manifest, verifies asset presence, byte size, and available SHA-256 digests, then selects the newest published release per tool. Unmarked releases are ignored. Prereleases are accepted only for explicitly preview or legacy tools. To update a tool from GitHub directly, publish a release with a matching manifest; the local publisher writes these automatically. No personal access token is needed in repository secrets.

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
