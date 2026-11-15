// Faith-aligned: firms whose core business is built around Islamic finance principles (halal investing,
// Sharia-screened funds, riba-free home finance). Activity-based, never a religious ruling.
const KEY = /\b(halal|islamic|shari'?a|shariah|sharia|amana|riba[- ]free|faith[- ]based|muslim)\b/i;
export function faithAligned(x: Record<string, any>): boolean {
  const text = [x.name, x.employer, x.industry, x.why, x.track, x.riba?.note, x.title].filter(Boolean).join(" ");
  return KEY.test(text) && x.riba?.status !== "High direct-involvement concern";
}
