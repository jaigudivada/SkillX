import { STORAGE_KEYS, readText, writeText } from '../storage/localStorageStore.js';

function getSavedTheme() {
  return readText(STORAGE_KEYS.theme, 'light');
}

function setTheme(theme = 'light') {
  const resolved = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;

  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.classList.toggle('light', resolved === 'light');
  const icon = document.getElementById('theme-icon');
  if (icon) icon.className = resolved === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';

  writeText(STORAGE_KEYS.theme, resolved);
}

function toggleTheme() {
  const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  setTheme(current === 'dark' ? 'light' : 'dark');
}

export { getSavedTheme, setTheme, toggleTheme };
