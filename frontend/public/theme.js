// Applies the saved theme before the first paint. Kept out of index.html so that the
// Content-Security-Policy can forbid inline scripts.
try {
  // Preserve the theme saved before the product rename.
  const theme = localStorage.getItem('sureau-theme') ?? localStorage.getItem('sentinel-theme');
  const dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
} catch { /* Keep the default theme when browser storage is unavailable. */ }
