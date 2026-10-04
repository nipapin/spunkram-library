# Spunkram Library (CEP) Changelog

All notable changes to the Spunkram Adobe CEP extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Captions Styles: apply `controls.json` `init[]` to Essential Graphics by name on caption create and style change
- Captions Styles: Save as New writes a local `user-styles/{id}/controls.json` (parent dump + sliders, caption chunks cleared)
- Captions Styles: re-fetch `controls.json` on apply when local `Base/manifest.json` is older than R2
- Captions: write Segment Type by name as 0-based (Words=0, Custom=1); Lines / caption → Line Count; Characters / line → Chars Per Line
- Styles: `font-menu` is a family + weight picker (not a slider), with OS font catalog like Figma/Adobe

### Fixed

- Captions Styles: write `Caption Font` from `controls.json` (plain string) instead of overwriting it with the master clip font
- Captions: Premiere places the caption mogrt on the last free video track and trims it to In/Out, so the ~1h template no longer overwrites the edit
- Styles: Premiere delta-apply maps duplicate leaf names (e.g. Animated Fill) by definition `leafIndex`, not first match
- Styles sliders with ranges ≤1 use step `0.01` so values like Pause Gap `0.35` keep thumb and fill aligned
- Captions packer: spacing is empty text (`wordIndex: -1`); a space character was packed as a word
- Captions Transcribe: show progress immediately, wait for host JSX, and don't let toasts steal clicks from the button
- Captions: CEP uploads MP3 via XHR FormData (fetch + Authorization dropped the multipart boundary)

### Changed

- Captions Styles: catalog slider edits stay on the current mogrt/comp only; apply always uses the original CDN `init`
- Captions Styles: catalog (non-user) apply uses `controls.json` `init` when present; otherwise Padding=350 / Scale=200
- Captions CEP writes v4 lookup tables + offset batches into `captions_batch_01`…`15` (same codec as `captions.jsx`). Legacy `text~start~end~~` still reads back.
- Captions: match Base Simple mogrt — `Store hidden` / `Bridge hidden`, spacing as empty string (`wordIndex: -1`), do not treat `Captions_Raw_Data` as a CEP-written field. Pause Gap / Hold Duration are user style (Global).
- Captions: hide RE-SEGMENT UI; add rounded content panel under Transcribe/Styles tabs
- Captions Styles: expand all collapse groups by default; compact Adjust Position X/Y inputs
- Chapters: rename hub/shell to “Chapters”; hide welcome card when history exists; circular back without tooltip; normalize tags as `#tag1 #tag2`
- Voiceover: history only in IconButton modal; fixed Generate button (Captions Transcribe styles); ScrubNumber + Y-resizable Script; unified 12px body type

## [0.10.8] - 2026-10-04

### Fixed

- Pack access: synchronize the admin Free/Purchased/Subscribed switch with Market and disk scan permissions, and ignore stale subscription coverage after the subscription becomes inactive.
- Pack access: recheck subscriptions on panel focus, once a minute, and at the renewal deadline; missing or invalid catalog prices no longer grant free access.
- Account testing: hide the real subscription renewal date in Free and Purchased modes.

### Changed

- Market: clicking Switch opens the selected pack in Editing.

## [0.9.25] - 2026-10-04 (Gal Toolkit MAX)

### Fixed

- After Effects: preserve group resize, placement and other composer overrides, and honor group `individual_comp` and `aep_file_name` source paths.
- Premiere on macOS: extract the bundled Motionflow helpers into Application Support and use the actual bundle parent when applying full projects.
- API and previews: bound stalled connections and disk reads, and keep poster queues moving after interrupted or abandoned requests.

## [1.0.3] - 2026-10-04 (Odin Pro)

### Fixed

- After Effects: preserve group resize, placement and other composer overrides, and honor group `individual_comp` and `aep_file_name` source paths.
- Premiere on macOS: extract the bundled Motionflow helpers into Application Support and use the actual bundle parent when applying full projects.
- API and previews: bound stalled connections and disk reads, and keep poster queues moving after interrupted or abandoned requests.

## [0.10.7] - 2026-10-04

### Fixed

- After Effects titles: pass the group's resize override to Motionflow SDK, so `FIT_TO_COMP` scales the layer instead of falling back to a pack setting that crops the source composition.
- After Effects pack options: preserve group placement, label, duplication, footage resize and engine overrides while keeping item layer settings in `custom_args`.
- After Effects source paths: honor group `individual_comp` and `aep_file_name` when selecting the `.aep` file.

## [0.10.6] - 2026-10-04

### Added

- Premiere on macOS: Install Bridge button for missing Motionflow native helpers, with restart and Control Surface setup instructions.

### Fixed

- macOS transitions: extract the bundled native helpers into Application Support and pass the actual Motionflow.bundle parent to the host.
- API and preview loading: bound stalled connections, interrupted responses and disk reads so they cannot hold the loading queues indefinitely.
- Poster loading: keep the queue moving when a closed consumer throws during notification.

## [0.9.21] - 2026-09-09

### Fixed

- In-panel update from 0.9.16/0.9.17: the ZXP includes `main/index.html` and `ui/spunkram/index.html` (plus stubs at old hashed JS names) so overlay + reload actually leaves the old panel
- Native update leftovers (`Motionflow.dll.update-old`, stacked `.old`) are stored in `_mf_old/` instead of growing the filename until Windows MAX_PATH fails

## [0.9.19] - 2026-09-09

### Fixed

- Sign-in: at the account device limit, the panel asks which device to disconnect instead of staying on “Waiting for confirmation…”

## [0.7.0] - 2026-08-10

### Fixed

- Honor per-group `custom_source_type` when resolving apply sources (MOGRT groups like Titles/Elegant no longer look for a missing `.prproj`)
- Place Premiere MOGRT / footage / audio on the lowest free track at the playhead (Beta transition track search), instead of always creating a top track

### Changed

- Prompt for a packages install folder when none is set in Settings (before Market/local install)
- File System settings: remove “use custom path” toggles; packages/assets paths are plain required fields (prompted on pack install / footage download). “Use project location” only overrides footage download and does not clear the assets path
- Install shows an in-panel dialog to choose the packages folder (saved to Settings); packs no longer fall back to a silent `_ABS` path

## [0.6.2] - 2026-08-09

### Fixed

- Keep AE and Premiere packs strictly host-separated (list, open, install, apply, active pack)
- Market Remove button: stop ghosting installed state from finished download jobs

### Changed

- New installs land under host subfolders (`_ABS/AE`, `_ABS/PR`); active pack keys are host-scoped

## [0.6.1] - 2026-08-09

### Fixed

- Match installed packs to Market catalog by `marketId`, normalized host (AE/PR), and fuzzy pack labels
- Persist catalog `marketId` onto installed pack prefs after install

### Changed

- Market panel / footage grid install UX refinements (Details, ownership, progress)

## [0.6.0] - 2026-08-08

### Fixed

- Stop auto-deleting installed packs when Market catalog mismatches on reload
- Pack install respects Settings → custom packages path
- Prefer simplified pack folders `Assets` / `Previews` / `Fonts` (legacy brand / pack-name folders still work)
- FULL_PROJECT media relink: native Windows paths, recursive search under `_Assets`, fallback when insertion bin is empty

### Changed

- Market cards no longer show redundant "by Spunkram" author line

### Added

- Install pack `Fonts` into the OS user fonts folder on install (Beta `fonts.js` parity)

## [0.5.1] - 2026-08-08

### Fixed

- Market pack install: accept composer `contents` tree, stream large zips, copy `Assets`/`Previews` bundles
- FULL_PROJECT apply uses plaintext `.prproj` (removed `.atomxasset` / `.mgasset`); `$._copyPasteSystem` / customChain unchanged
- Ship `Motionflow.dll` + Premiere bridge natives in extension `bin/win` on every build

### Added

- Download manager with pack-cache retry; install logging for pack failures

## [0.4.4-beta.3] - 2026-08-02

### What's new

- Faster help when something breaks: if a critical error stops your work, Spunkram can notify our support team with the details needed to investigate
- Manage several Motionflow accounts in the panel and switch between them without signing in again each time

### Improvements

- Clearer messages when a pack item can't be applied (for example, when a source file is missing)
- Smoother account and tutorials experience in the panel

## [0.0.1] - 2026-08-02

### Added

- Initial Spunkram Library CEP panel (AE + Premiere): market, packs, captions / chapters / voiceover AI tools, device-code auth via Motionflow
