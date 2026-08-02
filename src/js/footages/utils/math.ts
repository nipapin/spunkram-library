export const getColumnsFromOrientation = (orientation: string) => {
    if (orientation === "landscape") return 2;
    if (orientation === "portrait") return 3;
    return 3;
};

export const getAspectFromOrientation = (orientation: string) => {
    if (orientation === "landscape") return "16/9";
    if (orientation === "portrait") return "9/16";
    return "1/1";
};

export const getAspectFromDimensions = (width: number, height: number) => {
    const aspectRatio = width / height;
    if (aspectRatio > 1) return "landscape";
    if (aspectRatio < 0.9) return "portrait";
    return "square";
};

export const getWidthFromQuality = (url: string): number | null => {
    try {
        return Number(new URL(url).searchParams.get("w")) || null;
    } catch {
        return null;
    }
};

export const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
};