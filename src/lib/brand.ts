// Single source of truth for the brand logo.
//
// To swap the logo, EITHER:
//   1. Drop a new file into `public/` and point LOGO_SRC at it (e.g.
//      "/styla-logo-2.png"), or
//   2. Keep this path and just overwrite `public/styla-logo.png` with the new
//      image (same filename) — no code change needed.
//
// All logo <img> tags across the app read from LOGO_SRC, so changing it here
// updates the header and every public share/profile page at once.
export const LOGO_SRC = "/styla-logo.png";

// Alt text for the logo image (kept empty where the logo sits next to the
// "Styla" wordmark to avoid duplicate announcements; set per-usage if needed).
export const LOGO_ALT = "";
