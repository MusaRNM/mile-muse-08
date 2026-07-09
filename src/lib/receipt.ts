/**
 * Heuristic parser that extracts fuel-receipt fields from raw OCR text.
 * OCR is imperfect, so every field is best-effort and the UI always allows
 * manual correction before saving.
 */
export interface ParsedReceipt {
  date?: number;
  station?: string;
  totalPrice?: number;
  gallons?: number;
  pricePerGallon?: number;
}

const STATIONS = [
  "shell",
  "chevron",
  "exxon",
  "mobil",
  "bp",
  "texaco",
  "arco",
  "costco",
  "sunoco",
  "valero",
  "marathon",
  "citgo",
  "phillips 66",
  "conoco",
  "76",
  "circle k",
  "sinclair",
  "speedway",
  "wawa",
  "quiktrip",
  "sheetz",
  "kwik trip",
  "murphy",
  "sam's club",
  "loves",
  "pilot",
  "flying j",
];

export function parseReceipt(text: string): ParsedReceipt {
  const raw = text.replace(/\r/g, "");
  const lower = raw.toLowerCase();
  const result: ParsedReceipt = {};

  // Station: match known brand names.
  for (const name of STATIONS) {
    if (lower.includes(name)) {
      result.station = name.replace(/\b\w/g, (c) => c.toUpperCase());
      break;
    }
  }

  // Date: match several common formats.
  const dateMatch =
    raw.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/) ||
    raw.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (dateMatch) {
    const d = parseDate(dateMatch[0]);
    if (d) result.date = d;
  }

  const numbers = (re: RegExp) => {
    const out: number[] = [];
    let m: RegExpExecArray | null;
    const g = new RegExp(re.source, "gi");
    while ((m = g.exec(lower))) {
      const n = parseFloat(m[1]);
      if (!Number.isNaN(n)) out.push(n);
    }
    return out;
  };

  // Gallons: number preceding "gal" or "gallons".
  const gal = numbers(/(\d{1,3}\.\d{1,3})\s*(?:gal|gallons|g\b)/);
  if (gal.length) result.gallons = gal[0];

  // Price per gallon: values like "$3.499" or number near "/gal" or "price/gal".
  const ppg =
    numbers(/(?:\$|price\/gal[^\d]*|per gal[^\d]*|@\s*)(\d\.\d{2,3})\s*(?:\/?\s*gal)?/) ;
  const ppgCandidate = ppg.find((n) => n > 1 && n < 12);
  if (ppgCandidate) result.pricePerGallon = ppgCandidate;

  // Total: value near "total", else the largest dollar amount.
  const totalLine = lower
    .split("\n")
    .find((l) => /total|amount|sale|due/.test(l) && /\d/.test(l));
  let total: number | undefined;
  if (totalLine) {
    const t = totalLine.match(/(\d{1,4}\.\d{2})/);
    if (t) total = parseFloat(t[1]);
  }
  if (total === undefined) {
    const all = numbers(/\$?\s*(\d{1,4}\.\d{2})/).filter((n) => n < 1000);
    if (all.length) total = Math.max(...all);
  }
  if (total !== undefined) result.totalPrice = total;

  // Derive the missing field where possible.
  if (result.totalPrice && result.gallons && !result.pricePerGallon) {
    result.pricePerGallon = +(result.totalPrice / result.gallons).toFixed(3);
  } else if (result.totalPrice && result.pricePerGallon && !result.gallons) {
    result.gallons = +(result.totalPrice / result.pricePerGallon).toFixed(3);
  }

  return result;
}

function parseDate(s: string): number | undefined {
  const parts = s.split(/[/-]/).map(Number);
  let y: number, mo: number, d: number;
  if (parts[0] > 31) {
    [y, mo, d] = parts;
  } else {
    [mo, d, y] = parts;
    if (y < 100) y += 2000;
  }
  const date = new Date(y, mo - 1, d);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}
