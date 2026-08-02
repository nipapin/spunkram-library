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

const MediaContext = createContext<MediaContextType | null>(null);

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
