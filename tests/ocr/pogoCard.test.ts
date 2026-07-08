import { describe, expect, it } from 'vitest';
import { parsePogoCard, stripJunkTokens } from '../../src/lib/ocr/pogoCard';

// Verbatim tesseract.js output for the reference screenshot (IMG_4616):
// note the missing "708 m (17 min)" line, the missing "Start point:" label,
// and icon glyphs OCR'd as junk tokens. The parser must survive all of it.
const REAL_OCR = `20:41 7 all 56 @
C 4
MG Second Ponds Creek Mini Walk
J

The Ponds, NSW, Australia

This walking route follows the paved shared

path through The Ponds Parklands along

Second Ponds Creek. Pass multiple public

landmarks, including the Steel Treehouse public

artwork and The Ponds Parklands wayfinding

sign.

wp The Ponds Parklands Walking

N- Trail Sign

End point:
Co) Steel Treehouse on Second
= (PF) Ponds Creek
» This Route can be © in reverse.
`;

// The same card as a cleaner OCR pass would render it (all lines present).
const IDEAL_OCR = `20:41
'S'econd Ponds Creek Mini Walk
708 m (17 min)
12 m away
FOLLOW
REVERSE DIRECTION
The Ponds, NSW, Australia
ABOUT THIS ROUTE
This walking route follows the paved shared
path through The Ponds Parklands along
Second Ponds Creek.
Start point: 39 m away
The Ponds Parklands Walking
Trail Sign
End point:
Steel Treehouse on Second
Ponds Creek
This Route can be followed in reverse.
`;

describe('stripJunkTokens', () => {
  it('removes leading icon noise', () => {
    expect(stripJunkTokens('MG Second Ponds Creek Mini Walk')).toBe('Second Ponds Creek Mini Walk');
    expect(stripJunkTokens('wp The Ponds Parklands Walking')).toBe('The Ponds Parklands Walking');
    expect(stripJunkTokens('Co) Steel Treehouse on Second')).toBe('Steel Treehouse on Second');
    expect(stripJunkTokens('= (PF) Ponds Creek')).toBe('Ponds Creek');
    expect(stripJunkTokens('N- Trail Sign')).toBe('Trail Sign');
  });

  it('keeps legitimate short place-name words', () => {
    expect(stripJunkTokens('St Kilda Pier')).toBe('St Kilda Pier');
    expect(stripJunkTokens('Mt Dandenong Lookout')).toBe('Mt Dandenong Lookout');
  });

  it('leaves clean lines alone', () => {
    expect(stripJunkTokens('The Ponds Parklands')).toBe('The Ponds Parklands');
  });
});

describe('parsePogoCard on real (degraded) OCR output', () => {
  const p = parsePogoCard(REAL_OCR);

  it('recovers the route name minus icon noise', () => {
    expect(p.name).toBe('Second Ponds Creek Mini Walk');
  });

  it('finds the locality line', () => {
    expect(p.locality).toBe('The Ponds, NSW, Australia');
  });

  it('reports the missed distance as unknown, not wrong', () => {
    expect(p.distanceMeters).toBeNull();
    expect(p.durationMin).toBeNull();
  });

  it('recovers the start name despite the missing label', () => {
    expect(p.startName).toBe('The Ponds Parklands Walking Trail Sign');
  });

  it('recovers the end name across noisy lines', () => {
    expect(p.endName).toBe('Steel Treehouse on Second Ponds Creek');
  });

  it('captures the description without swallowing the point names', () => {
    expect(p.description).toMatch(/^This walking route follows/);
    expect(p.description).toMatch(/wayfinding\s+sign\.$/);
    expect(p.description).not.toContain('Trail Sign');
  });
});

describe('parsePogoCard on clean OCR output', () => {
  const p = parsePogoCard(IDEAL_OCR);

  it('parses all fields', () => {
    expect(p.name).toBe("'S'econd Ponds Creek Mini Walk");
    expect(p.distanceMeters).toBe(708);
    expect(p.durationMin).toBe(17);
    expect(p.locality).toBe('The Ponds, NSW, Australia');
    expect(p.startName).toBe('The Ponds Parklands Walking Trail Sign');
    expect(p.endName).toBe('Steel Treehouse on Second Ponds Creek');
    expect(p.description).toMatch(/^This walking route follows/);
  });

  it('does not leak "m away" fragments into names', () => {
    expect(p.startName).not.toMatch(/away/i);
  });
});

describe('parsePogoCard variants and garbage', () => {
  it('parses km distances with decimal comma', () => {
    const p = parsePogoCard('My Walk\n1,2 km (25 min)\nBerlin, BE, Germany\nEnd point:\nSomewhere');
    expect(p.distanceMeters).toBe(1200);
    expect(p.durationMin).toBe(25);
  });

  it('returns nulls for unrelated text', () => {
    const p = parsePogoCard('a shopping list\nmilk\neggs\nbread');
    expect(p.locality).toBeNull();
    expect(p.startName).toBeNull();
    expect(p.endName).toBeNull();
    expect(p.distanceMeters).toBeNull();
  });

  it('handles empty input', () => {
    const p = parsePogoCard('');
    expect(p.name).toBeNull();
    expect(p.description).toBe('');
  });
});
