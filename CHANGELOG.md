# Spunkram Library (CEP) Changelog

All notable changes to the Spunkram Adobe CEP extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Styles: Premiere delta-apply maps duplicate leaf names (e.g. Animated Fill) by definition `leafIndex`, not first match
- Styles sliders with ranges ≤1 use step `0.01` so values like Pause Gap `0.35` keep thumb and fill aligned
- Captions packer: spacing is empty text (`wordIndex: -1`); a space character was packed as a word
- Captions Transcribe: show progress immediately, wait for host JSX, and don't let toasts steal clicks from the button
- Captions: CEP uploads MP3 via XHR FormData (fetch + Authorization dropped the multipart boundary)

### Changed

- Captions CEP writes v4 lookup tables + offset batches into `captions_batch_01`…`15` (same codec as `captions.jsx`). Legacy `text~start~end~~` still reads back.
- Captions: match Base Simple mogrt — `Store hidden` / `Bridge hidden`, spacing as empty string (`wordIndex: -1`), do not treat `Captions_Raw_Data` as a CEP-written field. Pause Gap / Hold Duration are user style (Global).
- Captions: hide RE-SEGMENT UI; add rounded content panel under Transcribe/Styles tabs
- Captions Styles: expand all collapse groups by default; compact Adjust Position X/Y inputs
- Chapters: rename hub/shell to “Chapters”; hide welcome card when history exists; circular back without tooltip; normalize tags as `#tag1 #tag2`
- Voiceover: history only in IconButton modal; fixed Generate button (Captions Transcribe styles); ScrubNumber + Y-resizable Script; unified 12px body type

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
