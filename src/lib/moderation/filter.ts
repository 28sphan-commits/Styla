// Profanity / hate-speech filter shared by every server-side text path.
//
// Two tiers:
//   - "severe": slurs and hate terms. These BLOCK the submission and earn a
//     strike (see enforce.ts).
//   - "mild": common curse words. These are CENSORED to **** but allowed
//     through, with no strike.
//
// Matching is done on a leetspeak-normalized copy of the text with word
// boundaries, which dodges the "Scunthorpe problem" (substring false
// positives like "class" → "ass"). Every normalization swap is 1 char → 1
// char, so match indices line up with the original string and we can mask the
// exact characters the user typed.

// NOTE: severe terms are intentionally redacted here as fragments joined at
// runtime, so the source file isn't itself a plaintext slur dump. Extend these
// lists as needed — keep slurs/hate in SEVERE, ordinary profanity in MILD.
const SEVERE_TERMS = [
  "n" + "igger",
  "n" + "igga",
  "f" + "aggot",
  "f" + "ag",
  "r" + "etard",
  "k" + "ike",
  "s" + "pic",
  "ch" + "ink",
  "tr" + "anny",
  "c" + "oon",
  "w" + "etback"
];

const MILD_TERMS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dick",
  "piss",
  "cunt",
  "slut",
  "whore",
  "douche",
  "prick",
  "cock",
  "twat"
];

export type Severity = "none" | "mild" | "severe";

export type ModerationResult = {
  severity: Severity;
  censored: string;
};

// Leetspeak / homoglyph fold. Single-char replacements only, so the result is
// the same length as the input and indices remain valid for masking.
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/!/g, "i");
}

function escapeRegex(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const severeSet = new Set(SEVERE_TERMS);
const allTerms = [...SEVERE_TERMS, ...MILD_TERMS].sort((a, b) => b.length - a.length);
const matcher = new RegExp(`\\b(${allTerms.map(escapeRegex).join("|")})\\b`, "gi");

/**
 * Scans text for profanity. Returns the worst severity found and a copy with
 * every matched term masked to asterisks (same length as the original word).
 */
export function moderateText(input: string | null | undefined): ModerationResult {
  const text = input ?? "";
  if (!text.trim()) {
    return { severity: "none", censored: text };
  }

  const normalized = normalize(text);
  const chars = [...text];
  let severity: Severity = "none";

  matcher.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(normalized)) !== null) {
    const word = match[1].toLowerCase();
    if (severeSet.has(word)) {
      severity = "severe";
    } else if (severity === "none") {
      severity = "mild";
    }
    for (let i = match.index; i < match.index + match[1].length; i += 1) {
      chars[i] = "*";
    }
    // Guard against zero-length matches looping forever.
    if (match.index === matcher.lastIndex) {
      matcher.lastIndex += 1;
    }
  }

  return { severity, censored: chars.join("") };
}

export function hasProfanity(input: string | null | undefined): boolean {
  return moderateText(input).severity !== "none";
}
