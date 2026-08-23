{
    "get": (function () {
        "use strict";

        // Shared across get() calls in one isolate. Premiere often will not
        // share this between expressions — that is why Captions_Data writes a
        // compact frame string and everyone else only reads that layer.
        var cache = {
            frameText: null,
            frame: null
        };

        var FRAME_VERSION = "v3";
        var FRAME_SEP = "|||CAPTION_FRAME|||";
        var MS = 1000;
        var LUT_SECONDS = 1800;
        var MAX_LUT_SEC = 14 * LUT_SECONDS;
        var MAX_OVERLAP_SEC = 5;
        var LUT_HOLD_PAD = 1;
        var INDEXED_LOOKUP_PREFIX = "v4lut~";
        var INDEXED_BATCH_PREFIX = "v4~";
        var BATCH_SEP = "|||";
        var CODE_SEMI = 59;
        var CODE_COMMA = 44;
        var CODE_PIPE = 124;
        var CODE_TILDE = 126;
        var CODE_AT = 64;
        var CODE_DASH = 45;
        var CODE_ZERO = 48;

        var sdkInstance = null;

        function parseIntRange(source, start, end) {
            if (start >= end) return NaN;
            var i = start;
            var sign = 1;
            var value = 0;
            var code;
            if (source.charCodeAt(i) === CODE_DASH) {
                sign = -1;
                i++;
            }
            if (i >= end) return NaN;
            for (; i < end; i++) {
                code = source.charCodeAt(i) - CODE_ZERO;
                if (code < 0 || code > 9) return NaN;
                value = value * 10 + code;
            }
            return value * sign;
        }

        function parseIndexListRange(source, start, end) {
            var parsed = [];
            if (start >= end) return parsed;
            var tokenStart = start;
            var i, n;
            for (i = start; i <= end; i++) {
                if (i === end || source.charCodeAt(i) === CODE_COMMA) {
                    if (i > tokenStart) {
                        n = parseIntRange(source, tokenStart, i);
                        if (isFinite(n)) parsed.push(n);
                    }
                    tokenStart = i + 1;
                }
            }
            return parsed;
        }

        var lookupScan = { raw: null, start: -1, nextIndex: 0, nextPos: 0 };

        function findLookupEntryRange(source, start, entryIndex) {
            if (entryIndex < 0) return null;
            var currentEntryStart;
            var currentEntryIndex;
            var i;
            if (lookupScan.raw === source && lookupScan.start === start && entryIndex >= lookupScan.nextIndex) {
                currentEntryStart = lookupScan.nextPos;
                currentEntryIndex = lookupScan.nextIndex;
                i = currentEntryStart;
            } else {
                currentEntryStart = start;
                currentEntryIndex = 0;
                i = start;
            }
            for (; i <= source.length; i++) {
                if (i === source.length || source.charCodeAt(i) === CODE_SEMI) {
                    if (currentEntryIndex === entryIndex) {
                        lookupScan.raw = source;
                        lookupScan.start = start;
                        lookupScan.nextIndex = entryIndex + 1;
                        lookupScan.nextPos = i + 1;
                        return { start: currentEntryStart, end: i };
                    }
                    currentEntryIndex++;
                    currentEntryStart = i + 1;
                }
            }
            return null;
        }

        function findCharCode(source, code, start, end) {
            var i;
            for (i = start; i < end; i++) {
                if (source.charCodeAt(i) === code) return i;
            }
            return -1;
        }

        function isIndexedLookup(text) {
            return !!(text && text.indexOf(INDEXED_LOOKUP_PREFIX) === 0);
        }

        function escapeRowText(text) {
            if (!text) return "";
            var s = "" + text;
            if (s.indexOf("\\") === -1 && s.indexOf("~") === -1 && s.indexOf("@") === -1) {
                return s;
            }
            var out = "";
            var i, ch;
            for (i = 0; i < s.length; i++) {
                ch = s.charAt(i);
                if (ch === "\\") out += "\\0";
                else if (ch === "~") out += "\\1";
                else if (ch === "@") out += "\\2";
                else out += ch;
            }
            return out;
        }

        function unescapeRowText(text) {
            if (!text || text.indexOf("\\") === -1) return text || "";
            var result = "";
            var i, ch, code;
            for (i = 0; i < text.length; i++) {
                ch = text.charAt(i);
                if (ch !== "\\" || i + 1 >= text.length) {
                    result += ch;
                    continue;
                }
                code = text.charAt(i + 1);
                i++;
                if (code === "0") result += "\\";
                else if (code === "1") result += "~";
                else if (code === "2") result += "@";
                else result += code;
            }
            return result;
        }

        function parseV4LookupHeader(raw) {
            if (!isIndexedLookup(raw)) return null;
            var sep = raw.indexOf(";;;");
            if (sep < 0) return null;
            var p = INDEXED_LOOKUP_PREFIX.length;
            var tilde = findCharCode(raw, CODE_TILDE, p, sep);
            var maxCaption;
            var lutCount;
            if (tilde < 0) {
                maxCaption = parseIntRange(raw, p, sep);
                lutCount = 1;
            } else {
                maxCaption = parseIntRange(raw, p, tilde);
                lutCount = parseIntRange(raw, tilde + 1, sep);
            }
            if (!isFinite(maxCaption) || maxCaption < 0) maxCaption = 0;
            if (!isFinite(lutCount) || lutCount < 1) lutCount = 1;
            return {
                maxCaption: maxCaption,
                lutCount: lutCount,
                entriesStart: sep + 3,
                raw: raw
            };
        }

        function parseV4LookupEntry(raw, entriesStart, localSecond) {
            var empty = { lastStarted: -1, captionIndexes: [] };
            var range = findLookupEntryRange(raw, entriesStart, localSecond);
            if (!range || range.start >= range.end) return empty;
            var pipe = findCharCode(raw, CODE_PIPE, range.start, range.end);
            if (pipe < 0) {
                return {
                    lastStarted: -1,
                    captionIndexes: parseIndexListRange(raw, range.start, range.end)
                };
            }
            var lastStarted = parseIntRange(raw, range.start, pipe);
            return {
                lastStarted: isFinite(lastStarted) ? lastStarted : -1,
                captionIndexes: parseIndexListRange(raw, pipe + 1, range.end)
            };
        }

        function parseV4Batch(raw) {
            if (!raw || raw.indexOf(INDEXED_BATCH_PREFIX) !== 0) return null;
            var sep = raw.indexOf(BATCH_SEP);
            if (sep < 0) return null;
            var tilde = findCharCode(raw, CODE_TILDE, INDEXED_BATCH_PREFIX.length, sep);
            if (tilde < 0) return null;
            var startIndex = parseIntRange(raw, INDEXED_BATCH_PREFIX.length, tilde);
            var offsets = parseIndexListRange(raw, tilde + 1, sep);
            if (!isFinite(startIndex)) return null;
            return {
                startIndex: startIndex,
                offsets: offsets,
                payloadStart: sep + BATCH_SEP.length,
                raw: raw
            };
        }

        function parseV4Row(source, start, end) {
            var t1 = findCharCode(source, CODE_TILDE, start, end);
            var t2 = t1 >= 0 ? findCharCode(source, CODE_TILDE, t1 + 1, end) : -1;
            var t3 = t2 >= 0 ? findCharCode(source, CODE_TILDE, t2 + 1, end) : -1;
            if (t1 < 0 || t2 < 0 || t3 < 0) {
                return { text: "", start: 0, end: 0, wordIndex: -1, type: "spacing" };
            }
            var text = unescapeRowText(source.substring(t3 + 1, end));
            return {
                text: text,
                start: toSeconds(parseIntRange(source, start, t1)),
                end: toSeconds(parseIntRange(source, t1 + 1, t2)),
                wordIndex: parseIntRange(source, t2 + 1, t3),
                type: text === "" ? "spacing" : "word"
            };
        }

        function toMs(seconds) {
            var n = Number(seconds);
            if (!isFinite(n)) return 0;
            return Math.round(n * MS);
        }

        function toSeconds(ms) {
            var n = Number(ms);
            if (!isFinite(n)) return 0;
            return n / MS;
        }

        function numKey(v) {
            var n = Number(v);
            if (!isFinite(n)) return 0;
            return Math.round(n * 10000) / 10000;
        }

        function emptyFrame() {
            return {
                hasSeg: false,
                segIndex: -1,
                segStart: -1,
                segEnd: -1,
                wordIndex: -1,
                lastWordIndex: -1,
                wordStart: -1,
                wordEnd: -1,
                segType: 1,
                from: 0,
                len: 0,
                wordStarts: [],
                text: "",
                bounceAmp: 100,
                bounceFreq: 0,
                bounceDecay: 8,
                bounceSpeed: 1,
                bounceEnabled: 1
            };
        }

        function escapeFrameText(text) {
            if (!text) return "";
            var s = "" + text;
            if (s.indexOf("\\") === -1 && s.indexOf("|") === -1 && s.indexOf("\r") === -1 && s.indexOf("\n") === -1) {
                return s;
            }
            var out = "";
            var i, ch;
            for (i = 0; i < s.length; i++) {
                ch = s.charAt(i);
                if (ch === "\\") out += "\\0";
                else if (ch === "|") out += "\\1";
                else if (ch === "\r") out += "\\r";
                else if (ch === "\n") out += "\\n";
                else out += ch;
            }
            return out;
        }

        function unescapeFrameText(text) {
            if (!text || text.indexOf("\\") === -1) return text || "";
            var result = "";
            var i, ch, code;
            for (i = 0; i < text.length; i++) {
                ch = text.charAt(i);
                if (ch !== "\\" || i + 1 >= text.length) {
                    result += ch;
                    continue;
                }
                code = text.charAt(i + 1);
                i++;
                if (code === "0") result += "\\";
                else if (code === "1") result += "|";
                else if (code === "r") result += "\r";
                else if (code === "n") result += "\n";
                else result += code;
            }
            return result;
        }

        function parseMsList(source) {
            var out = [];
            if (!source) return out;
            var start = 0;
            var i, n;
            for (i = 0; i <= source.length; i++) {
                if (i === source.length || source.charAt(i) === ",") {
                    if (i > start) {
                        n = parseInt(source.substring(start, i), 10);
                        if (isFinite(n)) out.push(n / MS);
                    }
                    start = i + 1;
                }
            }
            return out;
        }

        // Half-open [start, end): the word is on for the frame at `start`.
        function isActiveAt(t, start, end) {
            return t >= start && t < end;
        }

        function holdExtend(spokenEnd, holdDur, silenceDur, nextStart) {
            var available = silenceDur;
            if (!(available > 0)) {
                if (nextStart != null && isFinite(nextStart)) available = nextStart - spokenEnd;
                else available = holdDur;
            }
            if (available < 0) available = 0;
            var hold = holdDur < available ? holdDur : available;
            var eff = spokenEnd + hold;
            if (nextStart != null && isFinite(nextStart) && eff > nextStart) eff = nextStart;
            return eff;
        }

        function createSDK() {
            var sdk = {
                SegmentType: { WORDS: 1, CUSTOM: 2 },
                TextCase: { CAPITALIZE: 3, UPPERCASE: 2, LOWERCASE: 1 }
            };

            function clamp(v, min, max) {
                if (v < min) return min;
                if (v > max) return max;
                return v;
            }

            sdk.CHUNK_COUNT = 15;
            sdk.CHUNK_PREFIX = "captions_batch_";
            sdk.DATA_LAYER = "Captions_Data";
            sdk.SETTINGS_LAYER = "Captions_Settings";
            sdk.LUT_SECONDS = LUT_SECONDS;
            sdk.INDEXED_LOOKUP_PREFIX = INDEXED_LOOKUP_PREFIX;

            sdk.chunkLayerName = function (index) {
                return sdk.CHUNK_PREFIX + (index < 10 ? "0" + index : "" + index);
            };

            function isUsefulText(s) {
                return typeof s === "string" && s !== "" && s.indexOf("[object ") !== 0;
            }

            function coerceLayerText(src, depth) {
                if (src == null) return "";
                if (typeof src === "string") return src;
                if (typeof src === "number" || typeof src === "boolean") return String(src);
                if (depth == null) depth = 0;
                if (depth > 2) return "";

                var t;
                try {
                    t = src + "";
                    if (isUsefulText(t)) return t;
                } catch (ePlus) {}

                try {
                    t = src.text;
                    if (isUsefulText(t)) return t;
                } catch (eText) {}

                try {
                    if (src.value != null && src.value !== src) {
                        t = coerceLayerText(src.value, depth + 1);
                        if (isUsefulText(t)) return t;
                    }
                } catch (eVal) {}

                return "";
            }

            sdk.layerText = function (comp, layerName) {
                var layer = comp.layer(layerName);
                var src = layer.text.sourceText;
                if (src == null) return "";
                if (typeof src === "string") return src;
                try {
                    var t = src.text;
                    if (typeof t === "string") return t;
                } catch (eText) {}
                return src + "";
                // try {

                //     var src = null;
                //     try { src = layer.text.sourceText; } catch (eSrc) {}
                //     var out = coerceLayerText(src);
                //     if (out) return out;
                //     try { src = layer.sourceText; } catch (eAlt) { src = null; }
                //     return coerceLayerText(src);
                // } catch (e) {
                //     return "";
                // }
            };

            sdk.readChunkParts = function (comp) {
                var parts = [];
                var i, text;
                for (i = 1; i <= sdk.CHUNK_COUNT; i++) {
                    text = sdk.layerText(comp, sdk.chunkLayerName(i));
                    parts.push(text);
                }
                return parts;
            };

            sdk.packToChunkLayers = function (captions) {
                captions = captions || [];
                var n = captions.length;
                var rows = [];
                var starts = [];
                var ends = [];
                var isWord = [];
                var i, text, startMs, endMs, word, wordIndex, wcount, row, sec;
                wcount = 0;
                var lastSec = 0;

                for (i = 0; i < n; i++) {
                    text = captions[i].text == null ? "" : String(captions[i].text);
                    if (captions[i].type === "spacing") text = "";
                    startMs = toMs(captions[i].start);
                    endMs = toMs(captions[i].end);
                    word = text !== "";
                    wordIndex = word ? wcount : -1;
                    if (word) wcount++;
                    row = startMs + "~" + endMs + "~" + wordIndex + "~" + escapeRowText(text);
                    rows.push(row);
                    starts.push(startMs);
                    ends.push(endMs);
                    isWord.push(word);
                    sec = Math.floor(startMs / MS);
                    if (sec > lastSec) lastSec = sec;
                    sec = Math.floor(endMs / MS + LUT_HOLD_PAD);
                    if (sec > lastSec) lastSec = sec;
                }
                if (lastSec < 0) lastSec = 0;
                if (lastSec > MAX_LUT_SEC - 1) lastSec = MAX_LUT_SEC - 1;
                var secCount = n ? lastSec + 1 : 0;

                var lutCount = secCount ? Math.ceil(secCount / LUT_SECONDS) || 1 : 1;
                if (lutCount < 1) lutCount = 1;
                if (lutCount > sdk.CHUNK_COUNT - 1) lutCount = sdk.CHUNK_COUNT - 1;
                var dataCount = sdk.CHUNK_COUNT - lutCount;

                var overlaps = [];
                var lastAt = [];
                for (i = 0; i < secCount; i++) {
                    overlaps.push([]);
                    lastAt.push(-1);
                }
                var last = -1;
                var capI = 0;
                var s, limit, a, b;
                for (s = 0; s < secCount; s++) {
                    limit = (s + 1) * MS - 1;
                    while (capI < n && starts[capI] <= limit) {
                        last = capI;
                        capI++;
                    }
                    lastAt[s] = last;
                }
                for (i = 0; i < n; i++) {
                    if (!isWord[i]) continue;
                    a = Math.floor(starts[i] / MS);
                    b = Math.floor(ends[i] / MS + LUT_HOLD_PAD);
                    if (a < 0) a = 0;
                    if (a >= secCount) continue;
                    if (b > a + MAX_OVERLAP_SEC) b = a + MAX_OVERLAP_SEC;
                    if (b >= secCount) b = secCount - 1;
                    if (b < a) continue;
                    for (s = a; s <= b; s++) overlaps[s].push(i);
                }

                var chunks = [];
                var from, to, lutParts, lutBody, j;
                for (i = 0; i < lutCount; i++) {
                    from = i * LUT_SECONDS;
                    to = i === lutCount - 1 ? secCount : from + LUT_SECONDS;
                    if (to > secCount) to = secCount;
                    lutParts = [];
                    for (j = from; j < to; j++) {
                        lutParts.push(overlaps[j].length
                            ? lastAt[j] + "|" + overlaps[j].join(",")
                            : lastAt[j] + "|");
                    }
                    lutBody = lutParts.join(";");
                    if (i === 0) {
                        chunks.push(INDEXED_LOOKUP_PREFIX + n + "~" + lutCount + ";;;" + lutBody);
                    } else {
                        chunks.push(INDEXED_LOOKUP_PREFIX + n + ";;;" + lutBody);
                    }
                }

                var per = Math.ceil(n / dataCount) || 1;
                var startIndex, endIndex, offsets, slice, off, bIdx;
                for (bIdx = 0; bIdx < dataCount; bIdx++) {
                    startIndex = bIdx * per;
                    if (startIndex >= n) {
                        chunks.push("");
                        continue;
                    }
                    endIndex = startIndex + per;
                    if (endIndex > n) endIndex = n;
                    slice = rows.slice(startIndex, endIndex);
                    offsets = [];
                    off = 0;
                    for (i = 0; i < slice.length; i++) {
                        offsets.push(off);
                        off += slice[i].length + (i < slice.length - 1 ? 1 : 0);
                    }
                    chunks.push(INDEXED_BATCH_PREFIX + startIndex + "~" + offsets.join(",") + BATCH_SEP + slice.join("@"));
                }

                while (chunks.length < sdk.CHUNK_COUNT) chunks.push("");
                return chunks;
            };

            sdk.isIndexedPack = function (compOrText) {
                var text = typeof compOrText === "string"
                    ? compOrText
                    : sdk.layerText(compOrText, sdk.chunkLayerName(1));
                return isIndexedLookup(text);
            };

            sdk.raw = function (comp) {
                var lookupRaw = sdk.layerText(comp, sdk.chunkLayerName(1));
                if (!isIndexedLookup(lookupRaw)) return [];
                return decodeIndexedCaptions(comp, lookupRaw);
            };

            function ctrlValue(comp, layerName, effectName) {
                return comp.layer(layerName).effect(effectName)(1);
            }

            function isWordBreak(ch) {
                return ch === " " || ch === "\r" || ch === "\n" || ch === "\t";
            }

            sdk.applyTextCase = function (text, mode) {
                text = String(text == null ? "" : text);
                if (!text || mode == null || mode === "") return text;
                var n = mode;
                if (n == sdk.TextCase.UPPERCASE) return text.toUpperCase();
                if (n == sdk.TextCase.LOWERCASE) return text.toLowerCase();
                return text[0].toUpperCase() + text.slice(1).toLowerCase();
            };

            sdk.ctrl = function (comp, name, fallback) {
                var v = ctrlValue(comp, sdk.SETTINGS_LAYER, name);
                return v === undefined ? fallback : v;
            };

            sdk.segmentType = function (comp) {
                return sdk.ctrl(comp, "Segment Type", sdk.SegmentType.WORDS);
            };

            sdk.settings = function (comp) {
                return {
                    segmentType: sdk.segmentType(comp),
                    pauseGap: sdk.ctrl(comp, "Pause Gap", 0.35),
                    holdDur: sdk.ctrl(comp, "Hold Duration", 0.4),
                    lineCount: sdk.ctrl(comp, "Line Count", 2),
                    charsPerLine: sdk.ctrl(comp, "Chars Per Line", 20),
                    bounceEnabled: sdk.ctrl(comp, "Enable Bounce", 1) == 1,
                    bounceAmp: sdk.ctrl(comp, "Bounce Amp", 100),
                    bounceFreq: sdk.ctrl(comp, "Bounce Freq", 0),
                    bounceDecay: sdk.ctrl(comp, "Bounce Decay", 8),
                    bounceSpeed: sdk.ctrl(comp, "Bounce Speed", 1),
                    textCase: sdk.ctrl(comp, "Case", 1)
                };
            };

            sdk.decayAmount = function (elapsed, opts) {
                opts = opts || {};
                var amp = opts.amp != null ? opts.amp : 100;
                var freq = opts.freq != null ? opts.freq : 0;
                var decay = opts.decay != null ? opts.decay : 8;
                var speed = opts.speed != null ? opts.speed : 1;
                var rest = opts.rest != null ? opts.rest : 100;
                var t = elapsed * speed;
                if (t < 0) return rest;
                var env = Math.exp(-decay * t);
                var osc = freq ? Math.cos(freq * t * 2 * Math.PI) : 1;
                return rest - amp * (1 - osc * env);
            };

            sdk.decayFromFrame = function (elapsed, frame) {
                frame = frame || {};
                return sdk.decayAmount(elapsed, {
                    amp: frame.bounceAmp != null ? frame.bounceAmp : 100,
                    freq: (frame.bounceFreq || 0) * Number(frame.bounceEnabled == null ? 1 : frame.bounceEnabled),
                    decay: frame.bounceDecay != null ? frame.bounceDecay : 8,
                    speed: frame.bounceSpeed != null ? frame.bounceSpeed : 1
                });
            };

            sdk.decayFromSettings = function (elapsed, comp) {
                return sdk.decayFromFrame(elapsed, sdk.frame(comp));
            };

            sdk.readFrameState = function (text) {
                if (cache.frameText === text && cache.frame) return cache.frame;
                var frame = emptyFrame();
                if (!text) {
                    cache.frameText = text;
                    cache.frame = frame;
                    return frame;
                }
                var sep = text.indexOf(FRAME_SEP);
                var header = sep >= 0 ? text.substring(0, sep) : text;
                var body = sep >= 0 ? text.substring(sep + FRAME_SEP.length) : "";
                var parts = header.split("|");
                if (parts[0] !== FRAME_VERSION) {
                    cache.frameText = text;
                    cache.frame = frame;
                    return frame;
                }
                if (parts.length > 13) frame.bounceAmp = Number(parts[13]);
                if (parts.length > 14) frame.bounceFreq = Number(parts[14]);
                if (parts.length > 15) frame.bounceDecay = Number(parts[15]);
                if (parts.length > 16) frame.bounceSpeed = Number(parts[16]);
                if (parts.length > 17) frame.bounceEnabled = Number(parts[17]);
                if (!isFinite(frame.bounceAmp)) frame.bounceAmp = 100;
                if (!isFinite(frame.bounceFreq)) frame.bounceFreq = 0;
                if (!isFinite(frame.bounceDecay)) frame.bounceDecay = 8;
                if (!isFinite(frame.bounceSpeed)) frame.bounceSpeed = 1;
                if (!isFinite(frame.bounceEnabled)) frame.bounceEnabled = 1;
                if (parts[1] === "1") {
                    frame.hasSeg = true;
                    frame.segIndex = parseInt(parts[2], 10);
                    frame.segStart = toSeconds(parts[3]);
                    frame.segEnd = toSeconds(parts[4]);
                    frame.wordIndex = parseInt(parts[5], 10);
                    frame.lastWordIndex = parseInt(parts[6], 10);
                    frame.wordStart = toSeconds(parts[7]);
                    frame.wordEnd = toSeconds(parts[8]);
                    frame.segType = parts[9];
                    frame.from = parseInt(parts[10], 10) || 0;
                    frame.len = parseInt(parts[11], 10) || 0;
                    frame.wordStarts = parseMsList(parts[12] || "");
                    frame.text = unescapeFrameText(body);
                    if (!isFinite(frame.segIndex)) frame.segIndex = -1;
                    if (!isFinite(frame.wordIndex)) frame.wordIndex = -1;
                    if (!isFinite(frame.lastWordIndex)) frame.lastWordIndex = -1;
                }
                cache.frameText = text;
                cache.frame = frame;
                return frame;
            };

            sdk.frame = function (comp) {
                return sdk.readFrameState(sdk.layerText(comp, sdk.DATA_LAYER));
            };

            function indexedState(comp, lookupRaw) {
                var header = parseV4LookupHeader(lookupRaw);
                if (!header) return null;
                var lutCount = header.lutCount;
                if (lutCount > sdk.CHUNK_COUNT - 1) lutCount = sdk.CHUNK_COUNT - 1;
                var dataCount = sdk.CHUNK_COUNT - lutCount;
                return {
                    maxCaption: header.maxCaption,
                    lutCount: lutCount,
                    dataCount: dataCount,
                    captionsPerBatch: Math.ceil(header.maxCaption / dataCount) || 1,
                    lookup0: header,
                    capCache: {},
                    batchCache: {}
                };
            }

            function lookupChunkRaw(comp, state, lutIndex) {
                if (lutIndex <= 0) return state.lookup0.raw;
                return sdk.layerText(comp, sdk.chunkLayerName(lutIndex + 1));
            }

            function lookupEntriesStart(raw, fallbackStart) {
                var sep = raw.indexOf(";;;");
                return sep >= 0 ? sep + 3 : fallbackStart;
            }

            function readLookupEntry(comp, state, timeSec) {
                var empty = { lastStarted: -1, captionIndexes: [] };
                if (timeSec < 0) return empty;
                var lutIndex = Math.floor(timeSec / LUT_SECONDS);
                if (lutIndex >= state.lutCount) lutIndex = state.lutCount - 1;
                if (lutIndex < 0) lutIndex = 0;
                var raw = lookupChunkRaw(comp, state, lutIndex);
                if (!raw) return empty;
                var localSecond = Math.floor(timeSec) - lutIndex * LUT_SECONDS;
                if (localSecond < 0) localSecond = 0;
                return parseV4LookupEntry(raw, lookupEntriesStart(raw, 0), localSecond);
            }

            function getDataBatch(comp, state, slot) {
                if (state.batchCache[slot] !== undefined) return state.batchCache[slot];
                var layerIndex = state.lutCount + slot + 1;
                var parsed = null;
                if (layerIndex >= 1 && layerIndex <= sdk.CHUNK_COUNT) {
                    parsed = parseV4Batch(sdk.layerText(comp, sdk.chunkLayerName(layerIndex)));
                }
                state.batchCache[slot] = parsed;
                return parsed;
            }

            function captionAt(comp, state, captionIndex) {
                if (captionIndex < 0 || captionIndex >= state.maxCaption) return null;
                if (state.capCache[captionIndex]) return state.capCache[captionIndex];
                var slot = Math.floor(captionIndex / state.captionsPerBatch);
                var batch = getDataBatch(comp, state, slot);
                if (!batch) return null;
                var local = captionIndex - batch.startIndex;
                if (local < 0 || local >= batch.offsets.length) return null;
                var rowStart = batch.payloadStart + batch.offsets[local];
                var rowEnd = local + 1 < batch.offsets.length
                    ? batch.payloadStart + batch.offsets[local + 1] - 1
                    : batch.raw.length;
                var cap = parseV4Row(batch.raw, rowStart, rowEnd);
                cap.index = captionIndex;
                state.capCache[captionIndex] = cap;
                return cap;
            }

            function nextWordCaption(comp, state, fromIndex) {
                var j, cap;
                for (j = fromIndex; j < state.maxCaption; j++) {
                    cap = captionAt(comp, state, j);
                    if (cap && cap.text !== "") return cap;
                }
                return null;
            }

            function prevWordCaptionIndex(comp, state, captionIndex) {
                var j, cap;
                for (j = captionIndex - 1; j >= 0; j--) {
                    cap = captionAt(comp, state, j);
                    if (cap && cap.text !== "") return j;
                }
                return -1;
            }

            function wordView(comp, state, captionIndex, pauseGap, holdDur) {
                var cap = captionAt(comp, state, captionIndex);
                if (!cap || cap.text === "") return null;
                var spokenEnd = cap.end;
                var silenceEnd = spokenEnd;
                var j = cap.index + 1;
                var nxtCap;
                while (j < state.maxCaption) {
                    nxtCap = captionAt(comp, state, j);
                    if (!nxtCap || nxtCap.text !== "") break;
                    if (nxtCap.end > silenceEnd) silenceEnd = nxtCap.end;
                    j++;
                }
                var nxt = nextWordCaption(comp, state, j);
                var silenceDur = silenceEnd - spokenEnd;
                if (silenceDur < 0) silenceDur = 0;
                var nextStart = nxt ? nxt.start : null;
                var untilNext = nxt ? nextStart - spokenEnd : silenceDur;
                var pauseAfter = untilNext >= pauseGap;
                return {
                    index: cap.index,
                    text: cap.text,
                    start: cap.start,
                    end: holdExtend(spokenEnd, holdDur, silenceDur, nextStart),
                    pauseAfter: pauseAfter,
                    wordIndex: cap.wordIndex
                };
            }

            var customSegCache = {
                raw: null,
                key: "",
                segs: [],
                nextIdx: -2,
                done: false,
                work: null
            };

            function customSettingsKey(s) {
                return String(s.pauseGap) + "|" + String(s.holdDur) + "|" + String(s.lineCount) + "|" + String(s.charsPerLine);
            }

            function resetCustomSegCache() {
                customSegCache.segs = [];
                customSegCache.nextIdx = -2;
                customSegCache.done = false;
                customSegCache.work = { segWords: [], lines: [] };
            }

            function appendCustomWork(work, word, txt) {
                var lines = work.lines;
                var li = lines.length - 1;
                if (li < 0) lines.push(txt);
                else if (lines[li].length === 0) lines[li] = txt;
                else lines[li] = lines[li] + " " + txt;
                work.segWords.push(word);
            }

            function flushCustomWork(work) {
                if (!work.segWords.length) return;
                customSegCache.segs.push({
                    firstIndex: work.segWords[0].index,
                    lastIndex: work.segWords[work.segWords.length - 1].index,
                    words: work.segWords.slice(0),
                    text: work.lines.join("\r"),
                    segIndex: work.segWords[0].wordIndex
                });
                work.segWords = [];
                work.lines = [];
            }

            function customSegContains(seg, needIndex) {
                return needIndex >= seg.firstIndex && needIndex <= seg.lastIndex;
            }

            function ensureCustomSegs(comp, state, s, needIndex) {
                var raw = state.lookup0 ? state.lookup0.raw : "";
                var key = customSettingsKey(s);
                if (customSegCache.raw !== raw || customSegCache.key !== key) {
                    customSegCache.raw = raw;
                    customSegCache.key = key;
                    resetCustomSegCache();
                }
                if (customSegCache.done) return;
                var segs = customSegCache.segs;
                if (segs.length && customSegContains(segs[segs.length - 1], needIndex)) return;
                var work = customSegCache.work;
                if (!work) {
                    customSegCache.work = { segWords: [], lines: [] };
                    work = customSegCache.work;
                }
                var idx = customSegCache.nextIdx;
                if (idx === -2) {
                    var first = nextWordCaption(comp, state, 0);
                    idx = first ? first.index : -1;
                }
                var lineCount = s.lineCount;
                var cpl = s.charsPerLine;
                var w, wText, cur, nxt;
                while (idx >= 0) {
                    if (segs.length && customSegContains(segs[segs.length - 1], needIndex)) {
                        customSegCache.nextIdx = idx;
                        return;
                    }
                    w = wordView(comp, state, idx, s.pauseGap, s.holdDur);
                    if (!w) break;
                    wText = w.text.replace(/^\s+|\s+$/g, "");
                    if (!wText) {
                        nxt = nextWordCaption(comp, state, w.index + 1);
                        idx = nxt ? nxt.index : -1;
                        continue;
                    }
                    if (!work.lines.length) {
                        appendCustomWork(work, w, wText);
                    } else {
                        cur = work.lines[work.lines.length - 1];
                        if (fitsOnLine(cur, wText, cpl)) {
                            appendCustomWork(work, w, wText);
                        } else if (work.lines.length < lineCount) {
                            work.lines.push("");
                            appendCustomWork(work, w, wText);
                        } else {
                            flushCustomWork(work);
                            appendCustomWork(work, w, wText);
                        }
                    }
                    if (w.pauseAfter) flushCustomWork(work);
                    nxt = nextWordCaption(comp, state, w.index + 1);
                    idx = nxt ? nxt.index : -1;
                }
                flushCustomWork(work);
                customSegCache.nextIdx = -1;
                customSegCache.done = true;
            }

            function findCachedCustomSeg(needIndex) {
                var segs = customSegCache.segs;
                var lo = 0;
                var hi = segs.length - 1;
                var mid, g;
                while (lo <= hi) {
                    mid = (lo + hi) >> 1;
                    g = segs[mid];
                    if (needIndex < g.firstIndex) hi = mid - 1;
                    else if (needIndex > g.lastIndex) lo = mid + 1;
                    else return g;
                }
                return null;
            }

            function paragraphStartIndex(comp, state, wv, pauseGap, holdDur) {
                var idx = wv.index;
                var prevIdx, prev;
                while (true) {
                    prevIdx = prevWordCaptionIndex(comp, state, idx);
                    if (prevIdx < 0) return idx;
                    prev = wordView(comp, state, prevIdx, pauseGap, holdDur);
                    if (!prev || prev.pauseAfter) return idx;
                    idx = prevIdx;
                }
            }

            function fitsOnLine(line, wordText, cpl) {
                if (!line || line.length === 0) return true;
                return (line.length + 1 + wordText.length) <= cpl;
            }

            function collectCustom(comp, state, paraStart, activeIndex, lineCount, cpl, pauseGap, holdDur) {
                var segWords = [];
                var lines = [];
                var result = null;
                var idx = paraStart;
                var w, wText, cur, nxt;

                function flush() {
                    if (!segWords.length) return;
                    var copy = segWords.slice(0);
                    var contains = false;
                    var k;
                    for (k = 0; k < copy.length; k++) {
                        if (copy[k].index === activeIndex) contains = true;
                    }
                    if (contains) {
                        result = { words: copy, text: lines.join("\r") };
                    }
                    segWords = [];
                    lines = [];
                }

                function appendWord(word, txt) {
                    var li = lines.length - 1;
                    if (li < 0) lines.push(txt);
                    else if (lines[li].length === 0) lines[li] = txt;
                    else lines[li] = lines[li] + " " + txt;
                    segWords.push(word);
                }

                while (idx >= 0 && !result) {
                    w = wordView(comp, state, idx, pauseGap, holdDur);
                    if (!w) break;
                    wText = w.text.replace(/^\s+|\s+$/g, "");
                    if (!wText) {
                        nxt = nextWordCaption(comp, state, w.index + 1);
                        idx = nxt ? nxt.index : -1;
                        continue;
                    }
                    if (!lines.length) {
                        appendWord(w, wText);
                    } else {
                        cur = lines[lines.length - 1];
                        if (fitsOnLine(cur, wText, cpl)) {
                            appendWord(w, wText);
                        } else if (lines.length < lineCount) {
                            lines.push("");
                            appendWord(w, wText);
                        } else {
                            flush();
                            appendWord(w, wText);
                        }
                    }
                    if (w.pauseAfter) flush();
                    nxt = nextWordCaption(comp, state, w.index + 1);
                    idx = nxt ? nxt.index : -1;
                }
                if (!result) flush();
                return result;
            }

            function buildIndexedSegment(comp, state, wv, segType, s) {
                if (segType == sdk.SegmentType.WORDS) {
                    return { words: [wv], text: wv.text, segIndex: wv.wordIndex };
                }
                ensureCustomSegs(comp, state, s, wv.index);
                var hit = findCachedCustomSeg(wv.index);
                if (hit) {
                    return { words: hit.words, text: hit.text, segIndex: hit.segIndex };
                }
                var para = paragraphStartIndex(comp, state, wv, s.pauseGap, s.holdDur);
                var custom = collectCustom(
                    comp, state, para, wv.index,
                    s.lineCount, s.charsPerLine, s.pauseGap, s.holdDur
                );
                if (!custom) return { words: [wv], text: wv.text, segIndex: wv.wordIndex };
                return {
                    words: custom.words,
                    text: custom.text,
                    segIndex: custom.words.length ? custom.words[0].wordIndex : wv.wordIndex
                };
            }

            function activeRangeInText(words, activeIndex, text) {
                var from = 0;
                var len = 0;
                var i, piece, pos;
                if (words.length === 1) {
                    return { from: 0, len: text.length };
                }
                for (i = 0; i < words.length; i++) {
                    piece = words[i].text.replace(/^\s+|\s+$/g, "");
                    pos = text.indexOf(piece, from);
                    if (pos < 0) pos = from;
                    if (words[i].index === activeIndex) {
                        from = pos;
                        len = piece.length;
                        break;
                    }
                    from = pos + piece.length;
                }
                return { from: from, len: len };
            }

            function formatFrameState(hasSeg, segIndex, segStart, segEnd, wordIndex, lastWordIndex, wordStart, wordEnd, segType, from, len, wordStarts, text, bounce) {
                var starts = "";
                var i;
                for (i = 0; i < wordStarts.length; i++) {
                    if (i) starts += ",";
                    starts += toMs(wordStarts[i]);
                }
                var header = [
                    FRAME_VERSION,
                    hasSeg ? "1" : "0",
                    String(hasSeg ? segIndex : -1),
                    String(toMs(segStart)),
                    String(toMs(segEnd)),
                    String(wordIndex),
                    String(lastWordIndex),
                    String(toMs(wordStart)),
                    String(toMs(wordEnd)),
                    String(segType),
                    String(from || 0),
                    String(len || 0),
                    starts,
                    bounce ? numKey(bounce.amp) : 100,
                    bounce ? numKey(bounce.freq) : 0,
                    bounce ? numKey(bounce.decay) : 8,
                    bounce ? numKey(bounce.speed) : 1,
                    bounce && bounce.enabled ? 1 : (bounce ? 0 : 1)
                ].join("|");
                if (!hasSeg) return header + FRAME_SEP;
                return header + FRAME_SEP + escapeFrameText(text || "");
            }

            function wordStats(words, t, activeIndex) {
                var wordIndex = -1;
                var lastWordIndex = -1;
                var word = null;
                var i;
                for (i = 0; i < words.length; i++) {
                    if (t >= words[i].end) lastWordIndex = i;
                    if (words[i].index === activeIndex && isActiveAt(t, words[i].start, words[i].end)) {
                        wordIndex = i;
                        word = words[i];
                    } else if (wordIndex < 0 && isActiveAt(t, words[i].start, words[i].end)) {
                        wordIndex = i;
                        word = words[i];
                    }
                }
                return { wordIndex: wordIndex, lastWordIndex: lastWordIndex, word: word };
            }

            function startsOf(words) {
                var out = [];
                var i;
                for (i = 0; i < words.length; i++) out.push(words[i].start);
                return out;
            }

            function findActiveWordView(comp, state, entry, t, pauseGap, holdDur) {
                var i, idx, wv;
                for (i = entry.captionIndexes.length - 1; i >= 0; i--) {
                    idx = entry.captionIndexes[i];
                    wv = wordView(comp, state, idx, pauseGap, holdDur);
                    if (!wv && idx > 0) wv = wordView(comp, state, idx - 1, pauseGap, holdDur);
                    if (wv && isActiveAt(t, wv.start, wv.end)) return wv;
                }
                return null;
            }

            var framePackCache = { t: null, raw: null, out: null };

            function serializeIndexedFrame(comp, lookupRaw, t) {
                var tKey = Math.floor(Number(t) * 1000);
                if (framePackCache.t === tKey && framePackCache.raw === lookupRaw && framePackCache.out != null) return framePackCache.out;
                var s = sdk.settings(comp);
                function remember(out) {
                    framePackCache.t = tKey;
                    framePackCache.raw = lookupRaw;
                    framePackCache.out = out;
                    return out;
                }
                var bounce = {
                    amp: s.bounceAmp,
                    freq: s.bounceFreq,
                    decay: s.bounceDecay,
                    speed: s.bounceSpeed,
                    enabled: s.bounceEnabled
                };
                var state = indexedState(comp, lookupRaw);
                if (!state || !state.maxCaption) {
                    return remember(formatFrameState(false, -1, 0, 0, -1, -1, 0, 0, s.segmentType, 0, 0, [], "", bounce));
                }
                var segType = s.segmentType;
                var entry = readLookupEntry(comp, state, t);
                var wv = findActiveWordView(comp, state, entry, t, s.pauseGap, s.holdDur);
                var lastWv = null;
                if (entry.lastStarted >= 0) {
                    lastWv = wordView(comp, state, entry.lastStarted, s.pauseGap, s.holdDur);
                    if (!lastWv) lastWv = wordView(comp, state, prevWordCaptionIndex(comp, state, entry.lastStarted + 1), s.pauseGap, s.holdDur);
                }

                var source = wv || lastWv;
                if (!source) {
                    return remember(formatFrameState(false, -1, 0, 0, -1, -1, 0, 0, segType, 0, 0, [], "", bounce));
                }

                var built = buildIndexedSegment(comp, state, source, segType, s);
                var stats = wordStats(built.words, t, source.index);
                var range = activeRangeInText(built.words, source.index, built.text);
                var wordStarts = segType == sdk.SegmentType.WORDS
                    ? [source.start]
                    : startsOf(built.words);
                var segStart = built.words.length ? built.words[0].start : 0;
                var segEnd = built.words.length ? built.words[built.words.length - 1].end : 0;
                var hasSeg = built.words.length ? isActiveAt(t, segStart, segEnd) : false;

                if (!hasSeg) {
                    return remember(formatFrameState(
                        false, -1, 0, 0,
                        stats.wordIndex, stats.lastWordIndex,
                        0, 0, segType, 0, 0, wordStarts, "", bounce
                    ));
                }

                if (!stats.word && stats.lastWordIndex >= 0 && built.words[stats.lastWordIndex]) {
                    stats.word = built.words[stats.lastWordIndex];
                    if (stats.wordIndex < 0) stats.wordIndex = stats.lastWordIndex;
                    range = activeRangeInText(built.words, stats.word.index, built.text);
                }

                return remember(formatFrameState(
                    true,
                    built.segIndex,
                    segStart,
                    segEnd,
                    stats.wordIndex,
                    stats.lastWordIndex,
                    stats.word ? stats.word.start : 0,
                    stats.word ? stats.word.end : 0,
                    segType,
                    range.from,
                    range.len,
                    wordStarts,
                    sdk.applyTextCase(built.text, s.textCase),
                    bounce
                ));
            }

            function decodeIndexedCaptions(comp, lookupRaw) {
                var state = indexedState(comp, lookupRaw);
                if (!state) return [];
                var out = [];
                var i, cap;
                for (i = 0; i < state.maxCaption; i++) {
                    cap = captionAt(comp, state, i);
                    if (!cap) continue;
                    out.push({
                        text: cap.text,
                        start: cap.start,
                        end: cap.end,
                        type: cap.type
                    });
                }
                return out;
            }

            sdk.serializeFrameState = function (comp, t) {
                try {
                    posterizeTime(1 / comp.frameDuration);
                } catch (ePost) {}
                var lookupRaw = sdk.layerText(comp, sdk.chunkLayerName(1));
                if (!isIndexedLookup(lookupRaw)) {
                    var s = sdk.settings(comp);
                    return formatFrameState(
                        false, -1, 0, 0, -1, -1, 0, 0, s.segmentType, 0, 0, [], "", {
                        amp: s.bounceAmp,
                        freq: s.bounceFreq,
                        decay: s.bounceDecay,
                        speed: s.bounceSpeed,
                        enabled: s.bounceEnabled
                    }
                    );
                }
                return serializeIndexedFrame(comp, lookupRaw, t);
            };

            sdk.styleFromFrame = function (style, comp) {
                var f = sdk.frame(comp);
                if (!f.hasSeg) return "";
                return style.setText(f.text);
            };

            sdk.animatorWordStartFromFrame = function (comp, textIndex) {
                var f = sdk.frame(comp);
                if (f.segType == sdk.SegmentType.WORDS) {
                    return f.wordStarts.length ? f.wordStarts[0] : 0;
                }
                if (!f.wordStarts.length) return 0;
                var i = clamp(textIndex, 1, f.wordStarts.length) - 1;
                return f.wordStarts[i];
            };

            sdk.replayTimeFromFrame = function (t, comp) {
                var f = sdk.frame(comp);
                if (!f.hasSeg) return 0;
                if (t == null) t = 0;
                return t - f.segStart;
            };

            return sdk;
        }

        return function () {
            if (!sdkInstance) sdkInstance = createSDK();
            return sdkInstance;
        };
    })()
}
