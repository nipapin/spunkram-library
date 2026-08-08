# Spunkram Library (CEP) Changelog

All notable changes to the Spunkram Adobe CEP extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
