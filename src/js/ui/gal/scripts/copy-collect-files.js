import { fs, path } from "@/lib/cep/node";
export async function copyCollectFiles(structure) {
    try {
        if (!structure?.root || !Array.isArray(structure.directories)) {
            return { type: "error", message: "Invalid collect structure" };
        }
        for (const directory of structure.directories) {
            if (!directory.items?.length)
                continue;
            const dirPath = path.join(structure.root, directory.path);
            fs.mkdirSync(dirPath, { recursive: true });
            for (const item of directory.items) {
                await fs.promises.copyFile(item.mediaPath, path.join(dirPath, item.name));
            }
        }
        return { type: "success", message: "Files copied successfully" };
    }
    catch (err) {
        return {
            type: "error",
            message: err instanceof Error ? err.message : String(err),
        };
    }
}
