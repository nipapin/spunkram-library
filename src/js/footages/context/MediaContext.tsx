import { createContext, useContext, useState } from "react";
import { MediaItem } from "../types";

type MediaContextType = {
  media: MediaItem[];
  setMedia: (media: MediaItem[] | ((prev: MediaItem[]) => MediaItem[])) => void;
  page: number;
  setPage: (page: number | ((prev: number) => number)) => void;
  totalPages: number;
  setTotalPages: (totalPages: number) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
};

/** Survive Vite HMR: Fast Refresh recreates the module and a fresh createContext()
 * would disconnect Provider from consumers until a full page reload. */
const MEDIA_CONTEXT_KEY = "__spunkram_media_context__";
type MediaGlobal = typeof globalThis & {
  [MEDIA_CONTEXT_KEY]?: ReturnType<typeof createContext<MediaContextType | null>>;
};

const MediaContext =
  (globalThis as MediaGlobal)[MEDIA_CONTEXT_KEY] ??
  createContext<MediaContextType | null>(null);
(globalThis as MediaGlobal)[MEDIA_CONTEXT_KEY] = MediaContext;

export const MediaProvider = ({ children }: { children: React.ReactNode }) => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  return (
    <MediaContext.Provider
      value={{
        media, setMedia,
        page, setPage,
        totalPages, setTotalPages,
        loading, setLoading,
      }}
    >
      {children}
    </MediaContext.Provider>
  );
};

export const useMediaContext = () => {
  const context = useContext(MediaContext);
  if (!context) {
    throw new Error("useMediaContext must be used within a MediaProvider");
  }
  return context;
};
