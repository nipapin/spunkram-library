# Spunkram Library (CEP) Changelog

All notable changes to the Spunkram Adobe CEP extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **MotionFlow SDK** (`src/js/sdk`): UI calls `MotionFlow.AE.*` / `MotionFlow.PPRO.*` instead of raw `evalTS`
- Beta ExtendScript port under `src/jsx/legacy/` (engine, composers, presets, undo, stock, …)
- Host methods: `createComp`, `createText`, `addResponsiveBackground`, `addMogrt`, `importSequence`, undo groups
- Docs: `docs/MOTIONFLOW_SDK.md`, `docs/sdk/INVENTORY.md`, `PARITY.md`, `AUTHOR_COOKBOOK.md`

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
