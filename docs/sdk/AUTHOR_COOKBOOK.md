# Author cookbook — adding a MotionFlow SDK method

## Rule

UI and author scripts call **only** `MotionFlow.*`. Never `evalTS` / raw ExtendScript from panel code.

## Steps

1. **Host (ExtendScript TS)**  
   Add the function in `src/jsx/aeft/` and/or `src/jsx/ppro/` and export it from `aeft.ts` / `ppro.ts`.  
   If the method is host-specific, add a stub on the other host so `Scripts` intersection typing still works.

2. **JS SDK wrapper**  
   Add `MotionFlow.AE.yourMethod` / `MotionFlow.PPRO.yourMethod` in [`src/js/sdk/ae.ts`](../../src/js/sdk/ae.ts) or [`ppro.ts`](../../src/js/sdk/ppro.ts). Return `MfResult<T>` via `wrap()`.

3. **Docs**  
   List the method in [`docs/MOTIONFLOW_SDK.md`](../MOTIONFLOW_SDK.md) and update [`docs/sdk/INVENTORY.md`](./INVENTORY.md) status.

4. **Legacy Beta**  
   Prefer a clean TS port. If you must reuse Beta code temporarily, put/keep it under `src/jsx/legacy/` and call via `evalES` / `legacyAeCall` / `legacyPpCall` — then schedule a rewrite.

## Example

```ts
// src/jsx/aeft/aeft-sdk.ts
export const createComp = (opts: CreateCompOptions) => { /* ... */ };

// src/js/sdk/ae.ts
async createComp(opts: CreateCompOptions) {
  return wrap(async () => {
    requireHost("AE");
    const r = await evalTS("createComp", opts);
    if (!r?.ok) throw new Error(r?.reason || "failed");
    return { compId: r.compId, name: r.name };
  });
}

// panel
import { MotionFlow } from "@/sdk";
const res = await MotionFlow.AE.createComp({ name: "A", width: 1920, height: 1080 });
if (!res.ok) console.error(res.error);
```

## Grep gate

After UI work, `evalTS(` should appear only under `src/js/sdk/` and `src/js/lib/utils/bolt.ts`.
