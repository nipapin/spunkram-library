# CEP Asset Grid Optimization Summary (MotionFlow)

## Context

Project: MotionFlow Adobe CEP extension (React + MUI + Bolt CEP + Node.js).

### Current behavior

- Sidebar categories are loaded from JSON.
- Selecting a category loads **all asset posters immediately**.
- Example: `Backgrounds` contains **142 assets**, so the panel starts downloading **142 poster images at once** from Cloudflare R2 through the MotionFlow API.
- Asset files (`.mogrt`, `.aep`, `.jsx`, etc.) are downloaded **only after the user clicks a card**.

### Problem

The panel freezes while scrolling.

Likely bottlenecks inside Adobe CEP (CEF):

- 142 simultaneous image requests.
- Image decoding (`Image Decode`) on scroll.
- Layout recalculations caused by many images appearing simultaneously.
- React re-rendering large grids.

---

# Goals

- Sidebar opens instantly.
- Category grid renders immediately.
- Posters load progressively.
- Smooth scrolling inside Adobe CEP.
- Keep asset files online (no 3–5 GB local download).

---

# Architecture

## Keep three separate layers

### 1. Navigation JSON

Load only category metadata.

```json
{
  "id": "backgrounds",
  "title": "Backgrounds",
  "count": 142
}
```

Very small payload.

### 2. Asset Metadata API

Returns only metadata and poster key.

```json
{
  "id": "bg001",
  "title": "Purple Waves",
  "posterKey": "backgrounds/bg001.webp",
  "tags": ["abstract"]
}
```

Do **not** include heavy preview or asset URLs.

### 3. Asset Download API

Download real template only after click.

```
GET /api/assets/bg001/download
```

---

# Optimization Plan

## Priority 1 — Lazy Poster Loading (Required)

Do not assign `img.src` immediately.

Every card initially renders a skeleton.

Use **one IntersectionObserver** for all cards.

Observer loads poster only when card enters viewport.

Settings:

```ts
rootMargin: "400px";
threshold: 0.01;
```

This preloads images slightly before they become visible.

---

## Priority 2 — Poster Loading Queue (Required)

Never download dozens of posters simultaneously.

Implement a queue.

Configuration:

- Maximum concurrent downloads: **4**
- FIFO queue.
- Ignore duplicate requests.

Pseudo API:

```ts
PosterQueue.enqueue(assetId, posterUrl);
```

Expected result:

Instead of 142 requests, only 4 active downloads.

---

## Priority 3 — Decode Images Before Rendering

Avoid browser decoding during layout.

Use:

```ts
const img = new Image();
img.src = url;
await img.decode();
```

Only after decode finishes, update React state.

This reduces scroll freezes inside CEP.

---

## Priority 4 — Local Thumbnail Cache

Store downloaded posters locally.

Location:

```
AppData/
  MotionFlow/
    cache/
      thumbs/
```

Flow:

1. Check local file.
2. If exists → load local.
3. Otherwise download from R2 and save locally.

Subsequent category opens should use cached thumbnails.

---

## Priority 5 — Stable React State

Do **not** update the entire asset array when one poster loads.

Bad:

```ts
setAssets(prev => prev.map(...));
```

Good:

```ts
Map<assetId, posterUrl>
```

Each card subscribes only to its own poster state.

Only one card re-renders.

---

# Virtualization Strategy

## Avoid Full react-virtual (for now)

Previous attempt caused freezes and layout glitches in Adobe CEP.

Reasons:

- MUI Grid recalculations.
- translateY transforms.
- Dynamic card heights.

## Preferred Strategy

Windowed grid with buffer.

Render approximately:

- Visible cards.
- One viewport above.
- One viewport below.

Expected DOM:

- Visible: ~12 cards.
- Total rendered: 30–40 cards.

Avoid rendering 142 image components simultaneously.

---

# Infinite Scroll

API should support pagination.

```
GET /api/assets?category=backgrounds&page=1&limit=30
```

Load additional pages when scroll approaches bottom.

---

# Poster Format

Use **WebP** thumbnails.

Recommended size:

- Width: 320 px.
- Typical size: 20–60 KB.

Structure:

```
thumbs/
  bg001_320.webp
```

Use MP4 previews only on hover if needed.

---

# Network Cache

Cloudflare R2 headers:

### Thumbnails

```
Cache-Control: public, max-age=31536000, immutable
```

### Metadata API

```
Cache-Control: public, max-age=60
```

### Assets

```
Cache-Control: max-age=0, must-revalidate
```

---

# React Component Structure

```
Sidebar
  CategoryGrid
    AssetCard
      PosterSkeleton
      LazyPoster
```

`LazyPoster` responsibilities:

- Register with shared IntersectionObserver.
- Queue poster download.
- Decode image.
- Cache locally.
- Render skeleton until ready.

---

# CEP-Specific Considerations

- Use a **single IntersectionObserver** instance.
- Avoid creating hundreds of observers.
- Avoid updating parent grid state for every image.
- Avoid loading previews until hover.
- Limit concurrent network activity to reduce CEF freezes.

---

# Expected Result

| Before | After |
|--------|-------|
| 142 poster requests immediately | 4 concurrent poster requests |
| 142 images decoded during scroll | Only nearby images decoded |
| Grid freezes while scrolling | Smooth scrolling |
| Every category re-downloads posters | Local cached posters after first load |
| Large React re-renders | Individual card updates only |

---

# Implementation Order

- [ ] Implement shared `IntersectionObserver`.
- [ ] Implement `PosterQueue` (max 4 concurrent downloads).
- [ ] Replace immediate `img src` loading with skeleton + lazy loading.
- [ ] Decode images using `Image.decode()`.
- [ ] Store posters in local CEP cache (`AppData/MotionFlow/cache/thumbs`).
- [ ] Move poster state into `Map<id, poster>`.
- [ ] Add API pagination (`page` + `limit`).
- [ ] Replace full grid rendering with buffered/windowed grid if necessary.

---

# Debugging Checklist (Adobe CEP DevTools)

Use **Performance** panel while scrolling.

Watch for:

- `Image Decode` → thumbnails are the bottleneck.
- `Recalculate Style` / `Layout` → grid layout issue.
- `Paint` → too many image updates.
- `Scripting` → React re-rendering entire asset list.

Optimize based on whichever dominates the timeline.
## Implementation update (2026-09-11)

The source audit found a 500-poster preload cap and a matching eager-card gate, plus direct HTTPS image loads that ran alongside the disk-cache download queue.

Implemented:
- Disabled boot poster preloading and removed the grid's download-completion gate. Metadata can render immediately.
- First row loads eagerly; remaining posters enter through the existing shared viewport observer and CEP scroll fallback (150 px buffer).
- Added a shared FIFO capped at four complete poster operations, including disk-cache lookup/download, file read, and image decode. Duplicate consumers share one operation and resource.
- Use the existing AppData preview cache before exposing an image URL. Remote fallback also stays inside the queue, avoiding simultaneous browser and disk downloads for each poster.
- Decode before revealing a poster; timeout/error handling releases queue slots. Poster state remains inside each card.
- Cancel queued work with no consumers on category changes; release completed resources after their last consumer leaves.
- Changed queued local preview reads from synchronous to asynchronous Node file reads.
- Batch near-viewport registration checks and remove animated offscreen poster placeholders.

Validation: TypeScript passes. `node --test scripts/test-poster-queue.mjs` covers a 142-poster workload, concurrency, duplicate sharing, queued cancellation, active-request cleanup, failures, and re-subscription.

Still requires an Adobe CEP performance recording to verify scroll frame times on the target machine. Windowing, server pagination, thumbnail resizing/WebP conversion, and server cache headers are not implemented by this client fix. Asset application/download behavior is unchanged.
