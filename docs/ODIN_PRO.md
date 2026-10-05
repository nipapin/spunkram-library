# Odin Pro brand

Odin has its own library shell, profile, and package setup screen, with shared library components, devices, and settings. There is no Market screen. Its logo, dark/lime palette, Inter font, author (`Premiere Basics`), `.odin` extension, and preference product (`Odin Pro Extension`) come from the legacy Odin Pro Beta extension.

Files keep the `.odin` extension but contain plain UTF-8 JSON with `settings` and a category tree (`structure`, `contents`, or `content`). Encoded/binary legacy containers are not supported; published packs must use the JSON format.

AI Tools are available in the Odin toolbar. Footages, ffmpeg prefetch, Motionflow telemetry, remote notifications, and extension auto-updates are disabled for this brand. Package categories come from installed `.odin` files. Package downloads and updates use full archives from the existing Odin service.

Subscribed Odin accounts receive 100 AI generations per calendar month (UTC);
free accounts receive zero. AI balance, transcription and chapters use
`https://motionflow.pro`, which verifies the Odin device token and current
subscription against `https://odin-pro.com/api/cep/me`. Odin user IDs and usage
remain separate from Motionflow/Gal/Spunkram accounts. Captions and Silence
Remover charge one generation per started 10 minutes; the combined
Captions/Chapters flow uses the existing signed receipt to avoid a second charge.
Observer remains free. Deploy the `next-app` changes (`lib/odin-ai.ts` and AI
auth/metering routes) and the Odin `/me` entitlement change before distributing
the new panel. The AI ledger is created on first use, as with other Motionflow
ledgers; SQL is also in `next-app/db/migrations/2026_10_05_odin_ai_generations.sql`.

```sh
npm run dev -- --author=odin
npm run build -- --author=odin
npm run build -- --author=odin --format=zxp
npm run release -- --author=odin --type=patch
npm run release -- --author=odin --beta
```

Entry: `src/js/odin/index.html`. Development URL: `http://localhost:4020/odin/`. Preview port: 5020. Extension ID: `com.odinpro.cep`. Build output: `dist/cep-odin`. The legacy Odin Pro Beta installation is separate.

Authentication and registration use `https://odin-pro.com/cep/login`, with backend changes in the sibling `ione-premiere-basics` project. Before production use, follow that project's `CEP_ODIN.md` to apply the new database migration and deploy its CEP routes. Building the panel alone does not activate these routes on the public site.

Odin uses the same `release.mjs` pipeline as Spunkram and Gal: version bump, signed ZXP build, commit/push, `odin-{version}` tag, and upload through the sibling `next-app/scripts/upload-spunkram-zxp.mjs`. `--author=all` includes all three brands. Odin artifacts use `public/downloads/odin/{version}/odin.zxp` and `public/downloads/odin/latest.json` (stable) or `beta.json`. Use `--dry-run` to preview or `--no-upload` for a local release. Publication requires `next-app/.env` with the existing public R2 credentials; `NEXT_APP_ROOT` overrides that project's location. Deploy the next-app webhook/notify changes before relying on server-side GitHub imports or Odin-tagged notifications. Extension auto-updates in the Odin panel remain disabled; the Odin website API does not yet expose the update endpoints.

Checks:

```sh
npx tsc -p tsconfig-build.json
npm run assert:brands
node scripts/test-shared-auth-session.mjs
node scripts/test-odin-observer.mjs
node scripts/test-odin-packages.mjs
```

Odin mounts its own `src/js/ui/odin/OdinApp.tsx`. The header, tools, library,
footer and profile follow Odin Pro Beta. Button icons use Lucide; the existing
Odin logo is the only image in the shell. Gal and Spunkram keep their own shells.

Toolbar and nested tool buttons use small Lucide icons with tooltips positioned
within the window. Shared settings use Odin's neutral palette. The profile shows
the host-specific catalog artwork, with `BRANDS.odin.packagePreviews` as a fallback.

Odin has no configured development packs or local pack-serving endpoint.
Development and release panels use the same authenticated Full/Demo package
workflow; the Adobe host is resolved from the host application.

The package setup selects one package for the current Adobe host and account
edition. Free accounts automatically install Demo; subscribed accounts automatically
install the full pack. Existing matching installations are reused. Demo catalog entries
and archive metadata must have `version: "DEMO"`; Demo and full installations are
kept separate even when their names match. Failed subscription verification does
not trigger an automatic download.

The website backend exposes Full and Demo packs for AE and PR from Motionflow's
private R2 bucket. When the subscription ends, the panel switches to Demo behind
a blocking full-screen setup progress display. Current catalog configuration:
`../next-app/docs/odin-connected-2026-10-01.md`.

**AI Tools → Observer** opens the folder-shortcut view. Observer is available
without AI generations or a subscription. It supports folder picking and drops in CEP, search,
rename, shortcut removal, drag ordering, Ctrl/Cmd multi-selection and sharing
between AE and Premiere. It reads the original `cards.json` in the
`Premiere Basics/Odin Pro Extension` application-data folder. Removing a shortcut
does not delete its folder. Native filesystem actions require Adobe CEP.

The library toolbar has Toolbar, Favorites, and AI Tools. Tutorials have been removed.

Composer tools call existing MotionFlow SDK methods. Preset-manager markers,
alignment and stagger controls retain the original UI but have no host call
until the SDK exposes those operations. No new ExtendScript is introduced.
