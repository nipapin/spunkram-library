# Odin Pro brand

Odin has its own library shell, profile, and package setup screen, with shared library components, devices, and settings. There is no Market screen. Its logo, dark/lime palette, Inter font, author (`Premiere Basics`), `.odin` extension, and preference product (`Odin Pro Extension`) come from the legacy Odin Pro Beta extension.

Files keep the `.odin` extension but contain plain UTF-8 JSON with `settings` and a category tree (`structure`, `contents`, or `content`). Encoded/binary legacy containers are not supported; published packs must use the JSON format.

AI Tools, Footages, generation counters, ffmpeg prefetch, Motionflow telemetry, remote notifications, and extension auto-updates are disabled for this brand. Package categories come from installed `.odin` files. Package downloads and updates use full archives from the existing Odin service.

```sh
npm run dev -- --author=odin
npm run build -- --author=odin
npm run build -- --author=odin --format=zxp
```

Entry: `src/js/odin/index.html`. Development URL: `http://localhost:4020/odin/`. Preview port: 5020. Extension ID: `com.odinpro.cep`. Build output: `dist/cep-odin`. The legacy Odin Pro Beta installation is separate.

Authentication and registration use `https://odin-pro.com/cep/login`, with backend changes in the sibling `ione-premiere-basics` project. Before production use, follow that project's `CEP_ODIN.md` to apply the new database migration and deploy its CEP routes. Building the panel alone does not activate these routes on the public site.

The existing `release.mjs` uploader remains specific to the Motionflow-hosted brands. Use `npm run build -- --author=odin --format=zxp` for an Odin package; do not use `release -- --author=all` to publish Odin.

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

`BRANDS.odin.devPack` configures a local plain-JSON `.odin` file and its Adobe host.
It is currently set to the supplied Premiere Pro 1.2.0 Test Mode file. During
`npm run dev -- --author=odin`, it opens without a subscription, without registering
an install or starting a package download. In a browser, Vite serves only that
configured file at `/__odin-dev-pack.json`; CEP reads it from disk. Release builds
disable the loader and do not expose that development endpoint. Clear `devPack`
to return development to the normal package workflow. Preview media and project
assets are separate files; the JSON alone provides the category/item structure.

The package setup selects one package for the current Adobe host and account
edition. Free accounts automatically install Demo; subscribed accounts are offered
the full pack. Existing matching installations are reused. Demo catalog entries
and archive metadata must have `version: "DEMO"`; Demo and full installations are
kept separate even when their names match. Failed subscription verification does
not trigger an automatic download.

The current website backend exposes full packs only and requires a subscription
for downloads. Demo installation therefore remains unavailable until its JSON
archive source is supplied and the backend exposes a free Demo catalog entry and
download route. The old AtomX binary Demo must not be reintroduced.

The third toolbar button opens **Observer / Portal**, a folder-shortcut view
inside the library shell. It supports folder picking and drops in CEP, search,
rename, shortcut removal, drag ordering, Ctrl/Cmd multi-selection and sharing
between AE and Premiere. It reads the original `cards.json` in the
`Premiere Basics/Odin Pro Extension` application-data folder. Removing a shortcut
does not delete its folder. Native filesystem actions require Adobe CEP.

Set `BRANDS.odin.tutorialsUrl` in `brands.config.ts` to the tutorials page or
playlist URL. It is intentionally empty; Odin does not request the AtomX
tutorial catalog. Rebuild the Odin panel after setting the URL.

Composer tools call existing MotionFlow SDK methods. Preset-manager markers,
alignment and stagger controls retain the original UI but have no host call
until the SDK exposes those operations. No new ExtendScript is introduced.
