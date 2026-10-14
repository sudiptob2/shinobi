// Name and institution tokens, shared by the SerpApi, OpenAlex and NSF lookups.
const GENERIC = ["university", "department", "school", "college", "institute", "professor"];

/** Lowercase words without accents or punctuation; initials dropped. */
export const words = (s?: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);

/** The words of an institution name that identify it ("Western University" -> ["western"]). */
export const schoolWords = (s?: string) => words(s).filter((w) => w.length > 3 && !GENERIC.includes(w));
