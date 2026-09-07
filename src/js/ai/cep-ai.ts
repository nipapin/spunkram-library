import { createAiTools, type AiRuntime } from "motionflow-ai";
import { fs } from "../lib/cep/node";
import { API_BASE } from "../api/config";
import { getUserIdentity } from "../api/user";
import { getBundledCaptionsJsxPath } from "../utils/captionsJsx";

function readAudioFile(filePath: string): Uint8Array {
  return Uint8Array.from(fs.readFileSync(filePath));
}

export function createCepAiRuntime(): AiRuntime {
  return {
    apiBase: API_BASE,
    readAudioFile,
    getIdentity: () => {
      const user = getUserIdentity();
      return { id: user.id, email: user.email, token: user.token };
    },
    captionsJsxPath: () => getBundledCaptionsJsxPath(),
  };
}

/** Side-effect: bind CEP adapters before any transcribe / chapters call. */
export const ai = createAiTools(createCepAiRuntime());
