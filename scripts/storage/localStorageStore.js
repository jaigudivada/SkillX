const STORAGE_KEYS = Object.freeze({
  posts: 'lbn_posts',
  users: 'lbn_users',
  currentUser: 'lbn_current_user',
  theme: 'lbn_theme',
  reports: 'lbn_reports',
  adminLogs: 'lbn_admin_logs',
  bannedUsers: 'lbn_banned_users',
  suspendedUsers: 'lbn_suspended_users',
  adminSettings: 'lbn_admin_settings',
  bookmarks: 'lbn_bookmarks',
  blockedUsers: 'lbn_blocked_users',
  onboarding: 'lbn_onboarding_done'
});

function readJson(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  return value;
}

function readText(key, fallback = '') {
  return localStorage.getItem(key) ?? fallback;
}

function writeText(key, value) {
  localStorage.setItem(key, value);
  return value;
}

function removeKey(key) {
  localStorage.removeItem(key);
}

export {
  STORAGE_KEYS,
  readJson,
  writeJson,
  readText,
  writeText,
  removeKey,
};
