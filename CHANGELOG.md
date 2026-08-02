# Spunkram Library (CEP) Changelog

All notable changes to the Spunkram Adobe CEP extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Extension auto-update: panel checks `GET /api/cep/update`, downloads ZXP from CDN, unpacks over the userdata install path, and reloads
- On-demand ffmpeg download from public CDN into userdata (`%APPDATA%/Spunkram/bin` / macOS Application Support) so the ZXP stays small

### Changed

- Removed bundled ffmpeg / ffplay / ffprobe from the extension package (~300 MB)

## [0.0.1] - 2026-08-02

### Added

- Initial Spunkram Library CEP panel (AE + Premiere): market, packs, captions / chapters / voiceover AI tools, device-code auth via Motionflow
