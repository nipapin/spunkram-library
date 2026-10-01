import { BRAND } from "@brands";
import { initPackageAsync, loadInstalledPack } from "@/lib/utils/pack";
import type { PackContent, PackInitResult } from "@/lib/utils/pack-types";

/** Reads the configured JSON without registering or copying a test install. */
export async function loadOdinDevPack(): Promise<
  Awaited<ReturnType<typeof loadInstalledPack>>
> {
  if (!import.meta.env.DEV || BRAND.id !== "odin" || !BRAND.devPack?.path) {
    throw new Error("No local development pack configured.");
  }
  const file = BRAND.devPack.path;
  const native = typeof window.cep !== "undefined";
  let pack: PackInitResult;
  if (native) {
    pack = await initPackageAsync(file, { testMode: true });
  } else {
    const response = await fetch("/__odin-dev-pack.json", {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error("Could not read the configured local .odin file.");
    const content = (await response.json()) as PackContent;
    if (!content.settings?.main || !content.structure)
      throw new Error("Invalid local pack JSON.");
    pack = {
      method: "JSON",
      full_content: content,
      settings: content.settings,
      structure: content.structure,
      header_bytes: "",
      pack_hash: "",
    };
  }
  if (pack.settings.main.software_id !== BRAND.devPack.host) {
    throw new Error(
      "Local pack host does not match the brand's devPack setting.",
    );
  }
  const meta = {
    name: pack.settings.main.name,
    version: pack.settings.main.version,
    author: pack.settings.main.cc_author_username || BRAND.authorName,
    appID: pack.settings.main.software_id,
    path: file,
  };
  if (native) return loadInstalledPack(meta);
  return { meta, pack, assetsPath: "" };
}
