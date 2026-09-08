---
name: cep-react-panel
description: Maps open-source React/UI/debug skills onto this Bolt CEP panel (React 19, Vite, dual brand Gal/Spunkram, After Effects + Premiere). Use when writing or reviewing panel UI, host apply, packs, brands, release, or MotionFlow SDK calls.
---

# CEP React panel (this repo)

Adobe CEP extension. Not Next.js. Not a website.

Stack: React 19 + Vite + Sass, Bolt CEP, `evalTS` only inside `src/js/sdk/` and `src/js/lib/utils/bolt.ts`. Brands: `gal` | `spunkram` from `brands.config.ts`.

## Which open skill to load

| Task | Skill |
|------|--------|
| New/changed React, grids, previews, bundle, rerenders | `vercel-react-best-practices` |
| God context, boolean props, compound components, React 19 APIs | `vercel-composition-patterns` |
| Visual polish of panel chrome (keep brand tokens) | `frontend-design` |
| A11y / UX audit of existing screens | `web-design-guidelines` |
| Bug, silent apply, host mismatch | `systematic-debugging` |
| Before "done" / "fixed" | `verification-before-completion` |
| Multi-file feature | `writing-plans` |
| After a non-trivial diff | `requesting-code-review` |
| Vite preview of panel HTML (`npm run serve`) | `webapp-testing` |

Read the matching skill's `SKILL.md` (and its `rules/` if present) before editing.

## Adapt Vercel React rules to CEP

Apply: waterfalls, bundle size, client fetch, **rerender-***, **rendering-*** (lists/grids), **js-***.

Skip unless the file is actually a Next server: `server-*`, RSC, `cookies()`, `after()`, hydration-only Next rules, `deploy-to-vercel`.

Hot paths here: `footage-grid`, pack preview, caption style push, host identity. Measure before micro-opts (see `.cursor/rules/optimization.mdc`).

## Host and SDK

1. Panel and author scripts call **only** `MotionFlow.*` / `Motionflow.*`. Never raw `evalTS` / ExtendScript from UI.
2. New host method: JSX in `src/jsx/aeft/` and/or `src/jsx/ppro/` → wrapper in `src/js/sdk/` returning `MfResult<T>` → list in `docs/MOTIONFLOW_SDK.md` and `docs/sdk/INVENTORY.md`. Cookbook: `docs/sdk/AUTHOR_COOKBOOK.md`.
3. One host-id probe. AE 24–25 must not take the Premiere path. Do not add a fourth helper.
4. Do not treat empty/dropped `evalScript` as success. Commit optimistic caches (`lastPushedProps` and similar) **after** host ack.

Grep gate after UI work: `evalTS(` only under `src/js/sdk/` and `src/js/lib/utils/bolt.ts`.

## Brands and persistence

- UI strings, pack ext, bins, storage: `BRAND` / `storageKey()` from `brands.config.ts`.
- Vite panel HTML is one folder deep (`src/js/gal/index.html`, `src/js/spunkram/index.html`) — plugin rewrites assets to `../assets/`.
- Do not write new `aitools-cep-*` keys or raw `localStorage` for prefs. Use branded `panelStore`.
- Caption Font is a **plain string** Source Text param named exactly `Caption Font`. Never JSON / font-menu objects. See `.cursor/rules/caption-font.mdc`.

## Push vs release

These words are not interchangeable. Follow `.cursor/rules/push-vs-release.mdc`.

- Push/commit: git only. No version bump, ZXP, tag, CDN.
- Release: `npm run release:*` (patch/minor/major/beta/all/gal/spunkram).

## Verify

CEP host (AE/PPro) is the real runtime. Browser tools cover Vite preview of panel HTML only — they cannot prove `evalScript`, mogrt params, or pack apply.

Before claiming done: typecheck/build that matches the change (`npm run build` / `tsc -p tsconfig-build.json` when TS/JSX moved), plus the original symptom if it was a bug.
