// Run before styles and the application bundle, including under the production self-only CSP.
// Only light/dark are explicit overrides; absent, invalid or unavailable storage follows the OS.
(() => {
  let choice;
  try { choice = localStorage.getItem("ieumdoc.theme"); } catch { /* Storage is optional. */ }
  const theme = choice === "light" || choice === "dark" ? choice
    : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  // Theme-aware default canvas until the role stylesheet arrives; no duplicated color values.
  document.documentElement.style.colorScheme = theme;
})();
