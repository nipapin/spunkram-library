import { fs, path } from "../lib/cep/node";
import { csi } from "../lib/utils/bolt";

// Бандленный аудио-пресет экспорта для Premiere Pro (WAV mono 16 кГц 16 бит —
// тот же формат, что Adobe использует для собственной транскрипции).
// Лежит рядом с ffmpeg в js/lib/bin (копируется в dist через copyAssets).
// AE игнорирует параметр пресета, так что путь можно передавать всегда.
export function getBundledAudioPresetPath(): string | null {
  const extRoot = csi.getSystemPath("extension");
  const presetPath = path.join(extRoot, "js", "lib", "bin", "audio-export.epr");
  return fs.existsSync(presetPath) ? presetPath : null;
}
