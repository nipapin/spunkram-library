import { RefreshCw, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { useConfiguration } from "../../context/ConfigurationWrapper";
import type { StylePreset } from "../styles";
import "./PresetGrid.scss";

const CaptionCard = ({
  p,
  selected,
  onSelect,
  onToggleFavorite,
}: {
  p: StylePreset;
  selected: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) => {
  const [hover, setHover] = useState(false);
  const thumb = p.previewImageUrl;
  const video = p.previewVideoUrl;
  const category =
    p.tags?.[0] || (p.source === "user" ? "Custom" : p.categoryName) || null;

  return (
    <div
      className={`preset-grid__card ${selected ? "preset-grid__card--active" : ""}`}
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        className={`preset-grid__fav ${p.favorite ? "preset-grid__fav--on" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
      >
        <Star size={14} fill={p.favorite ? "currentColor" : "none"} />
      </button>

      <div className="preset-grid__media">
        {hover && video ? (
          <video
            className="preset-grid__video"
            src={video}
            muted
            loop
            playsInline
            autoPlay
            poster={thumb || undefined}
          />
        ) : thumb ? (
          <img className="preset-grid__thumb" src={thumb} alt="" draggable={false} />
        ) : (
          <div className="preset-grid__swatch">Aa</div>
        )}
        {category && <span className="preset-grid__chip">{category}</span>}
        <div className="preset-grid__name">{p.name}</div>
      </div>
    </div>
  );
};

export const PresetGrid = () => {
  const {
    presets,
    selectedPresetId,
    selectPreset,
    toggleFavorite,
    stylesStatus,
    stylesError,
    refreshingStyles,
    refreshStyles,
  } = useConfiguration();
  const [search, setSearch] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of presets) {
      const tags = p.tags?.length ? p.tags : p.categoryName ? [p.categoryName] : [];
      for (const t of tags) set.add(t);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [presets]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return presets.filter((p) => {
      if (favOnly && !p.favorite) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (tagFilter) {
        const tags = p.tags?.length ? p.tags : p.categoryName ? [p.categoryName] : [];
        if (!tags.includes(tagFilter)) return false;
      }
      return true;
    });
  }, [presets, search, favOnly, tagFilter]);

  const sections = useMemo(() => {
    const byName = (a: StylePreset, b: StylePreset) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    const map = new Map<string, StylePreset[]>();
    for (const p of visible) {
      const key = p.source === "user" ? "Custom" : p.categoryName || "Other";
      const list = map.get(key) || [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([category, items]) => [category, [...items].sort(byName)] as const)
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [visible]);

  const loading = stylesStatus === "loading" || stylesStatus === "idle";

  return (
    <div className="preset-grid">
      <div className="preset-grid__toolbar">
        <div className="chip preset-grid__search">
          <Search size={14} />
          <input
            className="preset-grid__search-input"
            placeholder="Search captions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          className={`preset-grid__icon-btn ${favOnly ? "preset-grid__icon-btn--active" : ""}`}
          data-tooltip="Favorites only"
          onClick={() => setFavOnly((v) => !v)}
        >
          <Star size={16} fill={favOnly ? "currentColor" : "none"} color="currentColor" />
        </button>
        <button
          type="button"
          className="preset-grid__icon-btn"
          data-tooltip="Refresh catalog"
          onClick={() => void refreshStyles()}
          disabled={refreshingStyles}
          aria-label="Refresh catalog"
        >
          <RefreshCw size={15} className={refreshingStyles ? "preset-grid__spin" : undefined} />
        </button>
      </div>

      {allTags.length > 0 && (
        <div className="preset-grid__tags">
          <button
            type="button"
            className={`preset-grid__tag-chip ${!tagFilter ? "preset-grid__tag-chip--active" : ""}`}
            onClick={() => setTagFilter(null)}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`preset-grid__tag-chip ${tagFilter === tag ? "preset-grid__tag-chip--active" : ""}`}
              onClick={() => setTagFilter((cur) => (cur === tag ? null : tag))}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <p className="preset-grid__count">
        CAPTIONS · {loading ? "…" : visible.length}
      </p>

      {loading && (
        <div className="preset-grid__state">
          <span className="spinner" />
          Loading captions…
        </div>
      )}

      {!loading && stylesError && presets.length === 0 && (
        <div className="preset-grid__state preset-grid__state--error">
          <p>Couldn’t reach captions server.</p>
          <p className="preset-grid__state-hint">{stylesError}</p>
          <button type="button" className="btn btn--ghost" onClick={() => void refreshStyles()}>
            Retry
          </button>
        </div>
      )}

      {!loading && !stylesError && presets.length === 0 && (
        <div className="preset-grid__state">
          <p>No captions available.</p>
          <p className="preset-grid__state-hint">Check CAPTIONS_ROOT on motionflow.pro.</p>
        </div>
      )}

      {!loading && sections.length > 0 && (
        <div className="preset-grid__sections thin-scroll">
          {sections.map(([category, items]) => (
            <section key={category} className="preset-grid__section">
              <h3 className="preset-grid__section-title">{category}</h3>
              <div className="preset-grid__grid">
                {items.map((p) => (
                  <CaptionCard
                    key={p.id}
                    p={p}
                    selected={p.id === selectedPresetId}
                    onSelect={() => selectPreset(p.id)}
                    onToggleFavorite={() => toggleFavorite(p.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
