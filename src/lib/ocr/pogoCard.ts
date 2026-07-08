// Parser for OCR text of the Pokémon GO route-info card (DESIGN.md §7.9).
// Pure module, unit-tested against real OCR output — which is messy: icon
// glyphs OCR as junk tokens ("MG", "wp", "Co)"), faint lines (the distance,
// the "Start point:" label) are often missed entirely. Anchors, in order of
// reliability: the locality line, "End point:", the About paragraph.

export interface PogoCardParse {
  name: string | null;
  distanceMeters: number | null;
  durationMin: number | null;
  locality: string | null;
  description: string;
  startName: string | null;
  endName: string | null;
}

/** Legitimate vowel-less short words that must survive junk-stripping. */
const SHORT_WORD_WHITELIST = new Set(['st', 'mt', 'dr', 'la', 'de', 'el', 'du', 'da', 'van', 'von', 'mc', 'ln', 'rd']);

/** Strip leading OCR icon noise ("MG", "wp", "Co)", "= (PF)") from a line. */
export function stripJunkTokens(line: string): string {
  const tokens = line.trim().split(/\s+/);
  let i = 0;
  while (i < tokens.length && i < 3) {
    const t = tokens[i]!;
    const letters = t.replace(/[^a-zA-Z]/g, '');
    const lower = letters.toLowerCase();
    const hasVowel = /[aeiouy]/i.test(letters);
    const symbolic = /[()=»«@©®™|\\/_~*•·§]/.test(t);
    const junk =
      symbolic ||
      letters.length === 0 ||
      (!hasVowel && letters.length <= 3 && !SHORT_WORD_WHITELIST.has(lower));
    if (!junk) break;
    i++;
  }
  return tokens.slice(i).join(' ');
}

function cleanName(s: string): string {
  return s
    .replace(/\d+(?:\.\d+)?\s*(?:m|km)\s*away/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:;,.!?]+|[\s\-–—:;,]+$/g, '')
    .trim();
}

function isNameCandidate(line: string): boolean {
  if (/\bmin\s*\)|m away|follow|reverse direction|about this route/i.test(line)) return false;
  const stripped = stripJunkTokens(line);
  const words = stripped.split(/\s+/).filter((w) => /[a-zA-Z]{2,}/.test(w));
  return words.length >= 2;
}

const LOCALITY_RE = /^[A-Za-z'’ .\-&]+,\s*[A-Z]{2,4},?\s+[A-Za-z .'’]+$/;

export function parsePogoCard(text: string): PogoCardParse {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const findIdx = (re: RegExp) => lines.findIndex((l) => re.test(l));
  const localityIdx = findIdx(LOCALITY_RE);
  const aboutIdx = findIdx(/about\s*this\s*route/i);
  const startIdx = findIdx(/start\s*point/i);
  const endIdx = findIdx(/end\s*point/i);
  const stopRe = /this route|in reverse|follow\b|^\W*$/i;

  // Distance + duration, e.g. "708 m (17 min)" or "1.2 km (25 min)".
  const dm = text.match(/(\d+(?:[.,]\d+)?)\s*(km|m)\b\s*\(\s*(\d+)\s*min/i);
  let distanceMeters: number | null = null;
  let durationMin: number | null = null;
  if (dm) {
    const value = Number(dm[1]!.replace(',', '.'));
    distanceMeters = Math.round(dm[2]!.toLowerCase() === 'km' ? value * 1000 : value);
    durationMin = Number(dm[3]);
  }

  // Route name: best candidate above the locality line (or in the top of the
  // card if no locality was read).
  const nameRegionEnd = localityIdx >= 0 ? localityIdx : Math.min(8, lines.length);
  let name: string | null = null;
  for (let i = 0; i < nameRegionEnd; i++) {
    if (isNameCandidate(lines[i]!)) {
      name = cleanName(stripJunkTokens(lines[i]!));
      break;
    }
  }

  const locality = localityIdx >= 0 ? lines[localityIdx]! : null;

  // Start point name. With the label present: lines between the labels.
  // Without it (faint text — common): walk back from "End point:", taking up
  // to 3 non-sentence lines; the About paragraph ends with a full stop, the
  // POI name lines don't.
  let startName: string | null = null;
  let startBlockBegin = -1;
  if (startIdx >= 0) {
    const regionEnd = endIdx >= 0 ? endIdx : Math.min(startIdx + 4, lines.length);
    const parts: string[] = [];
    const labelRemainder = lines[startIdx]!.replace(/.*start\s*point:?/i, '');
    if (labelRemainder.trim()) parts.push(labelRemainder);
    for (let i = startIdx + 1; i < regionEnd; i++) parts.push(stripJunkTokens(lines[i]!));
    startName = cleanName(parts.join(' ')) || null;
    startBlockBegin = startIdx;
  } else if (endIdx > 0) {
    const collected: string[] = [];
    let i = endIdx - 1;
    const floor = Math.max(aboutIdx, localityIdx, 0);
    while (i > floor && collected.length < 3) {
      const line = lines[i]!;
      if (/[.!?]$/.test(line) || LOCALITY_RE.test(line)) break;
      const stripped = stripJunkTokens(line);
      if (!stripped) break;
      collected.unshift(stripped);
      i--;
    }
    if (collected.length > 0) {
      startName = cleanName(collected.join(' ')) || null;
      startBlockBegin = i + 1;
    }
  }

  // End point name: remainder of the label line, then up to 3 lines until a
  // footer phrase.
  let endName: string | null = null;
  if (endIdx >= 0) {
    const parts: string[] = [];
    const labelRemainder = lines[endIdx]!.replace(/.*end\s*point:?/i, '');
    if (labelRemainder.trim()) parts.push(labelRemainder);
    for (let i = endIdx + 1; i < Math.min(endIdx + 4, lines.length); i++) {
      if (stopRe.test(lines[i]!)) break;
      parts.push(stripJunkTokens(lines[i]!));
    }
    endName = cleanName(parts.join(' ')) || null;
  }

  // Description: between "ABOUT THIS ROUTE" (or the locality line) and the
  // start-point block.
  let description = '';
  const descBegin = aboutIdx >= 0 ? aboutIdx + 1 : localityIdx >= 0 ? localityIdx + 1 : -1;
  if (descBegin >= 0) {
    const descEnd =
      startBlockBegin >= 0 ? startBlockBegin : endIdx >= 0 ? endIdx : lines.length;
    description = lines
      .slice(descBegin, descEnd)
      .filter((l) => !/m away|start\s*point|about\s*this\s*route/i.test(l))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return { name, distanceMeters, durationMin, locality, description, startName, endName };
}
