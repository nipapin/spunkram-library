# Legacy Beta ExtendScript

Exact copies of Spunkram Beta `jsx/*.jsx`, loaded at runtime after Bolt `jsx/index.js`
(see `src/js/sdk/legacy-loader.ts`).

Public API for authors/UI is **MotionFlow** (`src/js/sdk`), not `$._AtomExt_*`.
`$._MotionFlow.*` aliases are installed after load for gradual rename.

`FULL_PROJECT` / native binaries: shipped under `src/bin/` → extension `bin/`.
See `src/bin/README.txt` and `docs/sdk/INVENTORY.md`.
