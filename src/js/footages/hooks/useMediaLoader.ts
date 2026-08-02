import { useCallback, useEffect, useRef, useState } from "react";
import { useFiltersContext } from "../context/FiltersContext";
import { useMediaContext } from "../context/MediaContext";
import { MediaType, PER_PAGE } from "../types";
import { fetchMedia } from "../utils/fetchMedia";

export function useMediaLoader(type: MediaType) {
  const { setType, search, orientation } = useFiltersContext();
  const { setMedia, page, setPage, setTotalPages, setLoading } = useMediaContext();

  const didInitialLoad = useRef(false);
  /** Bumped on effect cleanup so only the latest fetch applies (fixes Strict Mode double-fetch + race). */
  const loadGeneration = useRef(0);
  const [error, setError] = useState(false);

  const loadMedia = useCallback(
    async (currentPage: number) => {
      if (!type) return;
      const generation = ++loadGeneration.current;
      setLoading(true);
      setError(false);

      const query = search || type;
      const result = await fetchMedia({
        type,
        query,
        orientation: orientation || undefined,
        page: currentPage,
        perPage: PER_PAGE,
      });

      if (generation !== loadGeneration.current) return;

      if (result.error) {
        setError(true);
      } else {
        if (currentPage === 1) {
          setMedia(result.results);
          didInitialLoad.current = true;
        } else {
          setMedia((prev) => [...prev, ...result.results]);
        }
        setTotalPages(result.totalPages);
      }
      setLoading(false);
    },
    [type, search, orientation, setMedia, setTotalPages, setLoading],
  );

  useEffect(() => {
    if (!type) return;
    setType(type);
    setPage(1);
    loadMedia(1);
    return () => {
      loadGeneration.current += 1;
    };
  }, [type, search, orientation, loadMedia, setType, setPage]);

  useEffect(() => {
    if (!didInitialLoad.current || page <= 1) return;
    loadMedia(page);
  }, [page, loadMedia]);

  const retry = useCallback(() => {
    loadMedia(page);
  }, [loadMedia, page]);

  return { didInitialLoad: didInitialLoad.current, error, retry };
}
