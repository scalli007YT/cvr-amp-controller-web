/**
 * colors.js
 *
 * CommonJS export for colors used in Electron and HTML.
 */

const COLORS = {
  // Limiter threshold line colors (for chart visualization)
  RMS_LIMITER: "#facc15", // yellow-400
  PEAK_LIMITER: "#f97316", // orange-500

  // Electron window background
  WINDOW_BG: "#121212",

  // Splash screen colors (consumed by electron/splash.html via query params)
  SPLASH_BG: "#121212",
  SPLASH_TEXT: "#ececec",
  SPLASH_BORDER: "#2b2b2b",
  SPLASH_BORDER_TOP: "#686868"
};

module.exports = { COLORS };
