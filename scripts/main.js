import { STORAGE_KEYS, readJson, writeJson, removeKey, readText, writeText } from './storage/localStorageStore.js';
import { showToast as uiShowToast } from './ui/toast.js';
import { setTheme as setAppTheme, toggleTheme as toggleAppTheme } from './ui/theme.js';

// app.js — SkillX (Complete rewrite, AI-free)
// ──────────────────────────────────────────────────────

// ═══ STATE ═══
let currentUserId = null;
let posts = [];
let currentBrowseTab = 0;     // 0=offers, 1=seeks
let selectedPostType = 0;     // 0=offer, 1=seek
let authMode = 'user';
let activeCategoryFilter = null;
let adminUIUserMode = false;  // true = admin is browsing as normal user
let browseSortMode = 'recent';
let reportDraftTarget = null;
let lastOpenedSkillPost = null;
let onboardingStep = 0;

const categories = [
  'Programming & Tech', 'Design & Creative', 'Languages & Communication',
  'Academic & Research', 'Soft Skills', 'Music & Arts', 'Other'
];

// ═══ STORAGE ═══
const LS = STORAGE_KEYS;

function savePosts() { writeJson(LS.posts, posts); }
function normalizePostResource(post) {
  if (!post || typeof post !== 'object') return post;
  const normalized = (post.resourceLink || post.resource || '').trim();
  post.resourceLink = normalized;
  post.resource = normalized;
  return post;
}
function getPostResourceLink(post) {
  return (post?.resourceLink || post?.resource || '').trim();
}
function loadPosts() {
  posts = readJson(LS.posts, []);
  let updated = false;
  posts = posts.map(p => {
    const beforeResource = (p?.resource || '').trim();
    const beforeResourceLink = (p?.resourceLink || '').trim();
    const normalized = normalizePostResource(p);
    if (beforeResource !== normalized.resource || beforeResourceLink !== normalized.resourceLink) {
      updated = true;
    }
    return normalized;
  });
  if (updated) savePosts();
}
function getUsers() { return readJson(LS.users, {}); }
function saveUsers(u) { writeJson(LS.users, u); }

// ═══ ADMIN HELPERS ═══
function isAdmin() { return currentUserId === 'admin'; }

function getReports() { return readJson(LS.reports, []); }
function saveReports(r) { writeJson(LS.reports, r); }

function getAdminLogs() { return readJson(LS.adminLogs, []); }
function saveAdminLogs(l) { writeJson(LS.adminLogs, l); }

function getBannedUsers() { return readJson(LS.bannedUsers, {}); }
function saveBannedUsers(b) { writeJson(LS.bannedUsers, b); }

function getSuspendedUsers() { return readJson(LS.suspendedUsers, {}); }
function saveSuspendedUsers(s) { writeJson(LS.suspendedUsers, s); }

function getAdminSettings() { return readJson(LS.adminSettings, { maintenanceMode: false, registrationsEnabled: true }); }
function saveAdminSettings(s) { writeJson(LS.adminSettings, s); }
function getBookmarks() { return readJson(LS.bookmarks, {}); }
function saveBookmarks(b) { writeJson(LS.bookmarks, b); }
function getBlockedUsers() { return readJson(LS.blockedUsers, {}); }
function saveBlockedUsers(b) { writeJson(LS.blockedUsers, b); }

function logAdminAction(action, details, affectedUser, affectedPost) {
  const logs = getAdminLogs();
  logs.unshift({
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    action, details, adminUser: 'admin',
    affectedUser: affectedUser || null,
    affectedPost: affectedPost || null,
    timestamp: Date.now()
  });
  saveAdminLogs(logs);
}

// ═══ UTILITIES ═══
function relativeTime(ts) {
  const d = Date.now() - ts, m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function anonName(userId, currentUserId) {
  if (!userId) return 'Anonymous';
  if (currentUserId && userId === currentUserId) return 'You';
  const suffix = String(userId).slice(-4).toUpperCase();
  return `Anon#${suffix}`;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeResourceHref(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch (_) { /* invalid URL */ }
  return '';
}

const BROWSE_EMPTY_DEFAULT = 'No skills found here yet.';

function restoreBrowseEmptyMessage() {
  const p = document.getElementById('browse-empty')?.querySelector('p');
  if (p) p.textContent = BROWSE_EMPTY_DEFAULT;
}

function getVisiblePosts() {
  const blocked = getBlockedUsers()[currentUserId] || {};
  return posts.filter(p => !blocked[p.userId] && !p._spam);
}

function computeMatchCount() {
  if (!currentUserId) return 0;
  const visiblePosts = getVisiblePosts();
  const mySeeks = visiblePosts.filter(p => p.userId === currentUserId && p.type === 'seek');
  const myOffers = visiblePosts.filter(p => p.userId === currentUserId && p.type === 'offer');
  const matches = [];
  mySeeks.forEach(seek => {
    visiblePosts
      .filter(p => p.type === 'offer' && p.userId !== currentUserId && p.category === seek.category)
      .slice(0, 2)
      .forEach(offer => matches.push({ seek, offer }));
  });
  myOffers.forEach(offer => {
    visiblePosts
      .filter(p => p.type === 'seek' && p.userId !== currentUserId && p.category === offer.category)
      .slice(0, 2)
      .forEach(seek => matches.push({ offer, seek }));
  });
  return Math.min(matches.length, 10);
}

function computePlatformMatchCount() {
  const visible = posts.filter(p => !p._spam);
  let count = 0;
  visible.filter(p => p.type === 'seek').forEach(seek => {
    count += visible.filter(
      p => p.type === 'offer' && p.userId !== seek.userId && p.category === seek.category
    ).length;
  });
  return count;
}

function isUserAccessBlocked(username) {
  if (!username || username === 'admin') return null;
  if (getBannedUsers()[username]) return 'Your account has been banned.';
  if (getSuspendedUsers()[username]) return 'Your account is suspended.';
  return null;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function showToast(msg, type = 'success') {
  uiShowToast(msg, type);
}

// ═══ AUTH ═══
function showAuth() {
  const authScreen = document.getElementById('auth-screen');
  if (authScreen) authScreen.style.display = 'flex';
}

function hideAuth() {
  const authScreen = document.getElementById('auth-screen');
  if (authScreen) authScreen.style.display = 'none';
}

function setAuthSubmitting(isSubmitting, customText = '') {
  const authBtn = document.getElementById('submitButton');
  if (!authBtn) return;
  authBtn.disabled = isSubmitting;
  const btnText = authBtn.querySelector('.auth-btn-text');
  const target = btnText || authBtn;
  if (isSubmitting) {
    target.textContent = customText || 'Signing in...';
    return;
  }
  target.textContent = authMode === 'user' ? 'Continue as User' : 'Admin Login';
}

function switchAuth(mode) {
  authMode = mode;
  const isUserMode = mode === 'user';
  const isAdminMode = mode === 'admin';

  const userTab = document.getElementById('user-toggle');
  const adminTab = document.getElementById('admin-toggle');
  const authBtn = document.getElementById('submitButton');
  const msgEl = document.getElementById('auth-message');
  const track = document.getElementById('auth-track');

  userTab?.classList.toggle('active', isUserMode);
  adminTab?.classList.toggle('active', isAdminMode);
  userTab?.setAttribute('aria-pressed', String(isUserMode));
  adminTab?.setAttribute('aria-pressed', String(isAdminMode));

  // Slide the toggle track
  if (track) {
    track.classList.toggle('admin-active', isAdminMode);
  }

  // Button text & style
  if (authBtn) {
    const btnText = authBtn.querySelector('.auth-btn-text');
    if (btnText) {
      btnText.textContent = isUserMode ? 'Continue as User' : 'Admin Login';
    } else {
      authBtn.textContent = isUserMode ? 'Continue as User' : 'Admin Login';
    }
    authBtn.classList.toggle('admin-mode', isAdminMode);
  }

  // Username field label and placeholder management
  const usernameInput = document.getElementById('username');
  const usernameRow = document.getElementById('username-row');
  const labelText = document.getElementById('username-label-text');

  if (usernameRow) usernameRow.style.display = ''; // Always visible

  if (usernameInput) {
    if (isAdminMode) {
      if (labelText) labelText.textContent = 'Admin Name';
      usernameInput.placeholder = 'Enter admin name';
      if (usernameInput.value !== 'admin') {
        usernameInput.value = '';
      }
    } else {
      if (labelText) labelText.textContent = 'Username';
      usernameInput.placeholder = 'Enter your username';
      if (usernameInput.value === 'admin') {
        usernameInput.value = '';
      }
    }
  }

  // Password field visibility
  const passwordInput = document.getElementById('password');
  const pwRow = document.querySelector('.auth-password-row');
  const confirmEl = document.getElementById('confirm-password');

  if (pwRow) pwRow.style.display = isAdminMode ? '' : 'none';
  if (confirmEl) confirmEl.style.display = 'none';

  // Toggle required attribute on password field
  if (passwordInput) passwordInput.required = isAdminMode;
  if (passwordInput && isUserMode) {
    passwordInput.value = '';
    passwordInput.type = 'password';
    const eye = document.getElementById('pw-eye');
    if (eye) eye.className = 'fa-solid fa-eye';
  }

  if (msgEl) {
    msgEl.textContent = '';
    msgEl.style.color = 'var(--danger)';
  }
  setAuthSubmitting(false);
}

function handleAuth(event) {
  event.preventDefault();
  setAuthSubmitting(true, authMode === 'user' ? 'Continuing...' : 'Verifying Admin...');

  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const msgEl = document.getElementById('auth-message');
  if (!usernameInput || !passwordInput || !msgEl) {
    setAuthSubmitting(false);
    return;
  }

  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  const setMsg = (text, isError = true) => {
    msgEl.textContent = text;
    msgEl.style.color = isError ? 'var(--danger)' : 'var(--accent)';
  };

  if (!username) { setMsg('Please enter a username'); setAuthSubmitting(false); return; }

  const users = getUsers();
  const adminSettings = getAdminSettings();

  if (adminSettings.maintenanceMode && authMode !== 'admin') {
    setMsg('Platform is in maintenance mode. Please try later.');
    setAuthSubmitting(false);
    return;
  }

  // Ensure admin user always exists
  if (!users['admin']) {
    users['admin'] = { password: 'admin123', joined: new Date().toISOString(), isAdmin: true };
    saveUsers(users);
  }

  // ══ USER ACCESS MODE (no password) ══
  if (authMode === 'user') {
    if (!adminSettings.registrationsEnabled && !users[username]) {
      setMsg('New registrations are temporarily disabled');
      setAuthSubmitting(false);
      return;
    }
    if (username === 'admin') { setMsg('Admin must use Admin Login tab'); setAuthSubmitting(false); return; }

    const accessBlock = isUserAccessBlocked(username);
    if (accessBlock) { setMsg(accessBlock); setAuthSubmitting(false); return; }

    // Auto-register if new user
    if (!users[username]) {
      users[username] = { joined: new Date().toISOString() };
      saveUsers(users);
    }

    currentUserId = username;
    writeText(LS.currentUser, username);
    hideAuth();
    updateUserDisplay();
    renderHome();
    showToast(`Welcome, ${username}!`);
    setAuthSubmitting(false);
    return;
  }

  // ══ ADMIN LOGIN MODE (requires password) ══
  if (authMode === 'admin') {
    if (!password) { setMsg('Please enter admin password'); setAuthSubmitting(false); return; }
    if (username !== 'admin') { setMsg('Invalid admin credentials'); setAuthSubmitting(false); return; }
    if (!users['admin'] || users['admin'].password !== password) {
      setMsg('Invalid admin credentials');
      setAuthSubmitting(false);
      return;
    }

    currentUserId = 'admin';
    adminUIUserMode = false;
    writeText(LS.currentUser, 'admin');
    hideAuth();
    updateUserDisplay();
    renderAdminNavItem();
    // Automatically open Admin Panel — not Home
    navigateTo('admin');
    showToast('Welcome, Admin! Dashboard ready.', 'info');
    setAuthSubmitting(false);
    return;
  }

  setAuthSubmitting(false);
}

function togglePassword() {
  const pw = document.getElementById('password');
  const icon = document.getElementById('pw-eye');
  if (!pw || !icon) return;
  const isHidden = pw.type === 'password';
  pw.type = isHidden ? 'text' : 'password';
  icon.className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
}

function updateAdminUIToggle() {
  // Kept for backwards compatibility (legacy toggle). No longer used by the two separate buttons.
}




/**
 * Toggles visibility of user-specific UI elements based on admin mode.
 * In admin panel mode (adminUIUserMode=false): hide user nav items & search bar.
 * In user interface mode (adminUIUserMode=true): show user nav items & search bar.
 */
function applyAdminUIModeVisibility() {
  if (!isAdmin()) return;

  const showUserNav = adminUIUserMode; // true = user interface visible

  // User sidebar navigation items to hide/show
  const userNavIds = ['nav-home', 'nav-browse', 'nav-post', 'nav-matches', 'nav-my-posts', 'nav-bookmarks'];
  userNavIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = showUserNav ? 'flex' : 'none';
  });

  // Admin sidebar navigation: show when in admin panel mode, hide in user interface mode
  const adminSidebarNav = document.getElementById('admin-sidebar-nav');
  if (adminSidebarNav) adminSidebarNav.style.display = showUserNav ? 'none' : 'block';

  // Search bar in topbar
  const searchWrap = document.getElementById('search-wrapper');
  if (searchWrap) searchWrap.style.display = showUserNav ? '' : 'none';

  // Toggle admin-panel-mode class on body for expanded layout
  document.body.classList.toggle('admin-panel-mode', !showUserNav);
  updateMobileBottomNavVisibility();
}

/**
 * Shows mobile bottom nav in user mode; hides it in admin panel mode.
 * Regular (non-admin) users always get user mode.
 */
function updateMobileBottomNavVisibility() {
  const nav = document.getElementById('mobile-bottom-nav');
  if (!nav) return;

  const adminPanelActive = isAdmin() && !adminUIUserMode;
  nav.setAttribute('aria-hidden', String(adminPanelActive));
}



function switchToAdminPanel() {
  if (!isAdmin()) return;
  adminUIUserMode = false;
  updateAdminUIToggle();
  applyAdminUIModeVisibility();

  // Ensure admin-only sections are shown
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('section-admin');
  if (el) el.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('nav-admin')?.classList.add('active');



  const ca = document.getElementById('content-area');
  if (ca) ca.style.overflow = 'auto';
  closeSidebar();
  renderAdminDashboard();
  renderAdminReports();
  renderAdminNavItem();
  showToast('Admin Panel', 'info');
}

function switchToUserInterface() {
  if (!isAdmin()) return;
  adminUIUserMode = true;
  updateAdminUIToggle();
  applyAdminUIModeVisibility();

  // Ensure user sections are shown (Home as default)
  navigateTo('home');

  // Hide admin nav active state
  document.getElementById('nav-admin')?.classList.remove('active');
  // Remove active from the admin-panel-switch button (if active)
  document.getElementById('nav-admin-panel-switch')?.classList.remove('active');
  // Mark the User Interface button as active to show the current mode
  document.getElementById('nav-user-interface')?.classList.add('active');

  showToast('User Interface', 'info');
}


function logout() {
  if (!confirm('Log out?')) return;
  currentUserId = null;
  adminUIUserMode = false;
  removeKey(LS.currentUser);
  updateUserDisplay();
  showAuth();
  // Hide admin nav
  const adminNav = document.getElementById('nav-admin');
  if (adminNav) adminNav.style.display = 'none';
  // Hide admin UI toggle
  const toggleEl = document.getElementById('nav-admin-ui-toggle');
  if (toggleEl) toggleEl.style.display = 'none';
  // Hide admin sidebar nav
  const adminSidebarNav = document.getElementById('admin-sidebar-nav');
  if (adminSidebarNav) adminSidebarNav.style.display = 'none';
  // Restore user nav items visibility for next login
  const userNavIds = ['nav-home', 'nav-browse', 'nav-post', 'nav-matches', 'nav-my-posts', 'nav-bookmarks'];
  userNavIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  });
  const searchWrap = document.getElementById('search-wrapper');
  if (searchWrap) searchWrap.style.display = '';
  // Remove admin-panel-mode class from body
  document.body.classList.remove('admin-panel-mode');
  updateMobileBottomNavVisibility();
}

function updateUserDisplay() {
  const name = currentUserId || 'Anonymous';
  setText('sidebar-username', name);
  setText('top-user-id', name);

  // Update admin-only switch buttons visibility (separate, no shared toggle behavior)
  const userInterfaceBtn = document.getElementById('nav-user-interface');
  const adminPanelBtn = document.getElementById('nav-admin-panel-switch');

  if (isAdmin()) {
    const showUserInterface = adminUIUserMode === true;
    // Always show exactly one: the button that switches to the *other* mode.
    if (userInterfaceBtn) userInterfaceBtn.style.display = showUserInterface ? 'none' : 'flex';
    if (adminPanelBtn) adminPanelBtn.style.display = showUserInterface ? 'flex' : 'none';
  } else {
    if (userInterfaceBtn) userInterfaceBtn.style.display = 'none';
    if (adminPanelBtn) adminPanelBtn.style.display = 'none';
  }
}



function getAllRegisteredUsers() {
  return Object.keys(getUsers()).filter(u => u !== currentUserId);
}

// ═══ NAVIGATION ═══
function navigateTo(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(`section-${section}`);
  if (el) el.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navEl = document.getElementById(`nav-${section}`);
  if (navEl) navEl.classList.add('active');

  const ca = document.getElementById('content-area');
  if (ca) ca.style.overflow = 'auto';

  if (section === 'home') renderHome();
  if (section === 'browse') renderBrowse();
  if (section === 'matches') renderMatches();
  if (section === 'my-posts') renderMyPosts();
  if (section === 'bookmarks') renderBookmarks();

  closeSidebar();
}

// ═══ SIDEBAR (mobile) ═══
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('visible');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}

// ═══ THEME ═══
function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  setTheme(isDark ? 'light' : 'dark');
}

function setTheme(theme) {
  setAppTheme(theme);
  writeText(LS.theme, theme);
  hideSettingsModal();
}

// ═══ HOME ═══
function renderHome() {
  try {
    const visiblePosts = getVisiblePosts();
    const offers = visiblePosts.filter(p => p.type === 'offer').length;
    const seeks = visiblePosts.filter(p => p.type === 'seek').length;
    setText('stat-offers', offers);
    setText('stat-seeks', seeks);
    setText('stat-posts', visiblePosts.length);
    setText('stat-users', (1800 + visiblePosts.length * 3).toLocaleString());
    setText('stat-matches', computeMatchCount());

    const grid = document.getElementById('featured-grid');
    const empty = document.getElementById('featured-empty');

    if (visiblePosts.length === 0) {
      if (grid) grid.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    if (grid) grid.innerHTML = visiblePosts.slice(0, 8).map(p => skillCardHTML(p)).join('');
    renderTrendingAndRecommended();
  } catch (err) {
    console.error('renderHome error:', err);
  }
}

function renderTrendingAndRecommended() {
  try {
    const visiblePosts = getVisiblePosts();
    const trending = document.getElementById('trending-skills');
    const recommended = document.getElementById('recommended-skills');
    if (!trending || !recommended) return;
    const ranked = visiblePosts
      .map(p => {
        const freshness = Math.max(1, (Date.now() - p.timestamp) / 3600000);
        const reportPenalty = getReports().filter(r => r.targetId === p.id && r.status === 'pending').length * 5;
        const score = Math.round(((p._featured ? 20 : 0) + (p.tags?.length || 0) * 2 + 40 / freshness) - reportPenalty);
        return { ...p, score };
      })
      .sort((a, b) => b.score - a.score);
    const top = ranked.slice(0, 5);
    trending.innerHTML = top.length ? top.map(p => `<div class="flex items-center justify-between text-xs"><span style="color:var(--ink-2);">${esc(p.skill)}</span><span class="badge badge-featured">🔥 ${p.score}</span></div>`).join('') : '<div class="text-xs" style="color:var(--ink-4);">No trending data yet.</div>';
    const mine = visiblePosts.filter(p => p.userId === currentUserId);
    const myCats = new Set(mine.map(p => p.category));
    const recs = ranked.filter(p => p.userId !== currentUserId && (myCats.has(p.category) || p.type === 'offer')).slice(0, 5);
    recommended.innerHTML = recs.length ? recs.map(p => `<div class="flex items-center justify-between text-xs"><span style="color:var(--ink-2);">${esc(p.skill)}</span><button class="premium-chip" onclick="openSkillModalById('${esc(p.id)}')">View</button></div>`).join('') : '<div class="text-xs" style="color:var(--ink-4);">Post more skills to improve recommendations.</div>';
  } catch (err) {
    console.error('renderTrendingAndRecommended error:', err);
  }
}

// ═══ SKILL CARD HTML ═══
function skillCardHTML(post) {
  const isOffer = post.type === 'offer';
  const popularity = Math.max(1, Math.round(100 / Math.max(1, (Date.now() - post.timestamp) / 3600000)));
  const tagHTML = (post.tags || []).slice(0, 3).map(t => `<span class="premium-chip">${esc(t)}</span>`).join('');
  const resourceLink = getPostResourceLink(post);
  const safeHref = safeResourceHref(resourceLink);
  const hasLink = safeHref !== '';
  const safeLink = hasLink ? esc(safeHref) : '';

  // Build the resource link row
  let resourceHTML;
  if (hasLink) {
    resourceHTML = `
      <a href="${safeLink}" target="_blank" rel="noopener noreferrer"
         class="skill-card-resource-link"
         onclick="event.stopPropagation();">
        <i class="fa-solid fa-arrow-up-right-from-square"></i>
        <span>Open</span>
      </a>`;
  } else {
    resourceHTML = `<span class="skill-card-no-link">No resource link</span>`;
  }

  return `
    <div class="skill-card p-5" data-post-id="${esc(post.id)}">
      <div class="flex items-center justify-between mb-4">
        <span class="badge ${isOffer ? 'badge-offer' : 'badge-seek'}">${isOffer ? 'OFFER' : 'SEEK'}</span>
        <span class="text-xs" style="color:var(--ink-4);">${relativeTime(post.timestamp)}</span>
      </div>
      <h3 class="font-semibold text-sm leading-snug mb-1" style="color:var(--ink-1);">${esc(post.skill)}</h3>
      <div class="text-xs mb-3" style="color:var(--ink-4);">${esc(post.category)} · ${esc(post.level)}</div>
      <p class="text-xs line-clamp-3" style="color:var(--ink-3); line-height:1.6;">${esc(post.description)}</p>
      <div class="flex flex-wrap gap-1.5 mt-2">${tagHTML}</div>
      <div class="skill-card-footer">
        <span class="text-xs font-mono" style="color:var(--ink-4);">${anonName(post.userId)}</span>
        <div class="flex items-center gap-2">
          ${resourceHTML}
          <span class="badge badge-featured">★ ${popularity}</span>
        </div>
      </div>
    </div>`;
}

function openSkillModalById(postId) {
  const post = posts.find(p => p.id === postId);
  if (post) openSkillModal(post);
}

// ═══ BROWSE ═══
function renderBrowse() {
  renderCategoryFilters();
  renderBrowseGrid();
}

function renderCategoryFilters() {
  const container = document.getElementById('category-filters');
  if (!container) return;
  try {
    const visiblePosts = getVisiblePosts();
    const allCount = visiblePosts.length;
    container.innerHTML =
      `<button class="cat-btn ${!activeCategoryFilter ? 'active' : ''}" onclick="filterByCategory(null)">
         <span>All</span><span class="count-pill">${allCount}</span>
       </button>` +
      categories.map(cat => {
        const count = visiblePosts.filter(p => p.category === cat).length;
        const isActive = activeCategoryFilter === cat;
        return `<button class="cat-btn ${isActive ? 'active' : ''}"
                        onclick="filterByCategory('${esc(cat)}')">
                  <span>${esc(cat)}</span><span class="count-pill">${count}</span>
                </button>`;
      }).join('');
  } catch (err) {
    console.error('renderCategoryFilters error:', err);
  }
}

function filterByCategory(cat) {
  activeCategoryFilter = cat;
  renderCategoryFilters();
  renderBrowseGrid();
}

function renderBrowseGrid() {
  const container = document.getElementById('browse-grid');
  const empty = document.getElementById('browse-empty');
  const skeleton = document.getElementById('browse-skeleton');
  if (skeleton) skeleton.classList.remove('hidden');
  try {
    let filtered = activeCategoryFilter
      ? getVisiblePosts().filter(p => p.category === activeCategoryFilter)
      : getVisiblePosts();
    const display = currentBrowseTab === 0
      ? filtered.filter(p => p.type === 'offer')
      : filtered.filter(p => p.type === 'seek');
    if (browseSortMode === 'popular') display.sort((a, b) => (b.tags?.length || 0) - (a.tags?.length || 0));
    if (browseSortMode === 'match') {
      const myCats = new Set(posts.filter(p => p.userId === currentUserId).map(p => p.category));
      display.sort((a, b) => Number(myCats.has(b.category)) - Number(myCats.has(a.category)));
    }
    if (browseSortMode === 'recent') display.sort((a, b) => b.timestamp - a.timestamp);

    if (display.length === 0) {
      if (container) container.innerHTML = '';
      if (empty) {
        restoreBrowseEmptyMessage();
        empty.classList.remove('hidden');
      }
      if (skeleton) skeleton.classList.add('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    if (container) container.innerHTML = display.map(p => skillCardHTML(p)).join('');
  } catch (err) {
    console.error('renderBrowseGrid error:', err);
    if (container) container.innerHTML = '<div class="text-center py-8" style="color:var(--ink-4);"><p class="text-xs">Something went wrong. Try refreshing.</p></div>';
  }
  if (skeleton) skeleton.classList.add('hidden');
}

function switchBrowseTab(tab) {
  currentBrowseTab = tab;
  document.getElementById('tab-offers').classList.toggle('active', tab === 0);
  document.getElementById('tab-seeks').classList.toggle('active', tab === 1);
  renderBrowseGrid();
}

function setBrowseSort(mode) {
  browseSortMode = mode;
  ['recent', 'popular', 'match'].forEach(k => {
    document.getElementById(`sort-${k}`)?.classList.toggle('active', k === mode);
  });
  renderBrowseGrid();
}

function resetBrowseFilters() {
  activeCategoryFilter = null;
  browseSortMode = 'recent';
  renderCategoryFilters();
  setBrowseSort('recent');
}

// ═══ MATCHES ═══
function renderMatches() {
  const container = document.getElementById('matches-container');
  const empty = document.getElementById('matches-empty');
  if (!container || !empty) return;

  try {
    const visiblePosts = getVisiblePosts();
    const mySeeks = visiblePosts.filter(p => p.userId === currentUserId && p.type === 'seek');
    const myOffers = visiblePosts.filter(p => p.userId === currentUserId && p.type === 'offer');
    const matches = [];

    mySeeks.forEach(seek => {
      visiblePosts
        .filter(p => p.type === 'offer' && p.userId !== currentUserId && p.category === seek.category)
        .slice(0, 2)
        .forEach(offer => matches.push({ seek, offer }));
    });
    myOffers.forEach(offer => {
      visiblePosts
        .filter(p => p.type === 'seek' && p.userId !== currentUserId && p.category === offer.category)
        .slice(0, 2)
        .forEach(seek => matches.push({ offer, seek }));
    });

    const unique = matches.slice(0, 10);
    const matchCount = unique.length;
    setText('match-count-badge', matchCount);
    setText('stat-matches', matchCount);

    if (unique.length === 0) {
      container.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    container.innerHTML = unique.map(({ seek, offer }) => {
      const primary = seek || offer;
      const partner = offer || seek;
      return `
        <div class="match-card">
          <div class="flex items-start gap-4">
            <div class="text-3xl flex-shrink-0">🔄</div>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-bold mb-1.5" style="color:var(--accent); letter-spacing:0.08em;">SKILL MATCH</div>
              <h3 class="font-semibold text-sm" style="color:var(--ink-1);">${esc(primary.skill)}</h3>
              <p class="text-xs mt-1" style="color:var(--ink-3);">
                ${anonName(partner.userId)} ${partner.type === 'offer' ? 'offers' : 'seeks'}
                <strong style="color:var(--ink-1);">${esc(partner.skill)}</strong>
              </p>
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    console.error('renderMatches error:', err);
    container.innerHTML = '';
    empty.classList.remove('hidden');
  }
}

function refreshMatches() { renderMatches(); showToast('Matches refreshed!'); }

// ═══ MY ACTIVITY ═══
function renderMyPosts() {
  const mine = posts.filter(p => p.userId === currentUserId);
  const offers = mine.filter(p => p.type === 'offer');
  const seeks = mine.filter(p => p.type === 'seek');

  const myCard = post => `
    <div class="chunky-card" style="padding:16px;">
      <div class="flex items-start justify-between gap-2 mb-2">
        <h4 class="font-semibold text-sm leading-snug" style="color:var(--ink-1);">${esc(post.skill)}</h4>
        <span class="badge ${post.type === 'offer' ? 'badge-offer' : 'badge-seek'} flex-shrink-0">${post.type.toUpperCase()}</span>
      </div>
      <div class="text-xs mb-2" style="color:var(--ink-4);">${esc(post.category)} · ${esc(post.level)}</div>
      <p class="text-xs line-clamp-2 mb-3" style="color:var(--ink-3); line-height:1.55;">${esc(post.description)}</p>
      <button onclick="deletePost('${esc(post.id)}')"
              class="w-full py-1.5 text-xs rounded-lg transition-colors"
              style="border:3px solid var(--danger-dim); color:var(--danger); background:transparent; cursor:pointer;">
        <i class="fa-solid fa-trash-can mr-1"></i> Delete
      </button>
    </div>`;

  const offersList = document.getElementById('my-offers-list');
  const seeksList = document.getElementById('my-seeks-list');

  offersList.innerHTML = offers.length
    ? offers.map(myCard).join('')
    : `<div class="text-center py-10" style="color:var(--ink-4);">
         <i class="fa-solid fa-hand-holding-heart text-2xl mb-3 block opacity-30"></i>
         <p class="text-xs font-medium">No offers yet</p>
       </div>`;

  seeksList.innerHTML = seeks.length
    ? seeks.map(myCard).join('')
    : `<div class="text-center py-10" style="color:var(--ink-4);">
         <i class="fa-solid fa-lightbulb text-2xl mb-3 block opacity-30"></i>
         <p class="text-xs font-medium">No seeks yet</p>
       </div>`;

  // Update profile counts
  setText('profile-offers-count', offers.length);
  setText('profile-seeks-count', seeks.length);
}

// ═══ POST FORM ═══
function setPostType(type) {
  selectedPostType = type;
  const offerBtn = document.getElementById('post-type-offer');
  const seekBtn = document.getElementById('post-type-seek');
  offerBtn.classList.toggle('is-active', type === 0);
  seekBtn.classList.toggle('is-active', type === 1);
  offerBtn.style.color = type === 0 ? '#ffffff' : 'var(--ink-4)';
  seekBtn.style.color = type === 1 ? '#ffffff' : 'var(--ink-4)';
}

function toggleDropdown(menuId) {
  const menu = document.getElementById(menuId);
  const isOpen = menu.style.display === 'block';
  document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
  if (!isOpen) menu.style.display = 'block';
}

function selectOption(text, targetId, menuId) {
  document.getElementById(targetId).textContent = text;
  document.getElementById(menuId).style.display = 'none';
}

function handlePostSubmit(event) {
  const suspended = getSuspendedUsers();
  const banned = getBannedUsers();
  if (banned[currentUserId]) { showToast('Your account is banned from posting.', 'error'); return; }
  if (suspended[currentUserId]) { showToast('Your account is suspended from posting.', 'error'); return; }
  event.preventDefault();
  const skill = document.getElementById('post-skill').value.trim();
  const desc = document.getElementById('post-desc').value.trim();
  const level = document.getElementById('levelText').textContent.trim();
  const category = document.getElementById('categoryText').textContent.trim();
  const format = document.getElementById('formatText').textContent.trim();
  const linkRaw = document.getElementById('resource-link').value.trim();
  let link = '';
  if (linkRaw) {
    link = safeResourceHref(linkRaw);
    if (!link) { showToast('Resource link must start with http:// or https://', 'error'); return; }
  }
  const tagsRaw = document.getElementById('post-tags')?.value.trim() || '';
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean).slice(0, 8) : [];

  if (!skill) { showToast('Please add a Skill Title', 'error'); return; }
  if (!desc) { showToast('Please add a Description', 'error'); return; }

  const post = {
    id: 'post_' + Date.now() + Math.random().toString(36).slice(2, 7),
    userId: currentUserId || ('anon_' + Math.random().toString(36).slice(2, 8)),
    type: selectedPostType === 0 ? 'offer' : 'seek',
    level, category, format,
    skill, description: desc,
    resourceLink: link,
    resource: link,
    tags,
    impressions: 0,
    timestamp: Date.now()
  };

  posts.unshift(post);
  savePosts();

  // Reset form
  document.getElementById('post-form').reset();
  document.getElementById('levelText').textContent = 'Intermediate';
  document.getElementById('categoryText').textContent = 'Programming & Tech';
  document.getElementById('formatText').textContent = '🎥 Video';
  const tagsEl = document.getElementById('post-tags');
  if (tagsEl) tagsEl.value = '';
  selectedPostType = 0; setPostType(0);

  closeAllModals();
  document.getElementById('success-modal').classList.remove('hidden');
  lockBodyScroll();
}

// ═══ MODAL CLEANUP — ensure only ONE modal visible at a time ═══
const MODAL_IDS = [
  'skill-modal',
  'settings-modal',
  'profile-modal',
  'success-modal',
  'admin-confirm-modal',
  'admin-report-modal',
  'report-modal',
  'onboarding-modal',
  'command-palette-modal'
];

function closeAllModals() {
  MODAL_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  // Remove body scroll lock
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
}

function lockBodyScroll() {
  document.body.classList.add('modal-open');
  document.body.style.overflow = 'hidden';
}

function ensureSkillModalResourceSection() {
  const modal = document.getElementById('skill-modal');
  if (!modal) return null;
  let linkEl = document.getElementById('modal-resource-link');
  let openWrap = document.getElementById('modal-resource-open-wrap');
  let openBtn = document.getElementById('modal-resource-open');
  if (linkEl && openWrap && openBtn) return { linkEl, openWrap, openBtn };

  const stack = modal.querySelector('.space-y-4');
  const formatEl = document.getElementById('modal-format');
  if (!stack || !formatEl) return null;

  const formatBlock = formatEl.closest('div');
  if (!formatBlock) return null;

  const resourceBlock = document.createElement('div');
  resourceBlock.className = 'skill-resource';
  resourceBlock.innerHTML = `
    <div class="form-label mb-1.5">Resource Link</div>
    <a id="modal-resource-link"
       class="resource-link text-sm font-medium"
       href="#"
       target="_blank"
       rel="noopener noreferrer"
       aria-disabled="true">Not provided</a>
  `;

  const resourceOpenWrap = document.createElement('div');
  resourceOpenWrap.id = 'modal-resource-open-wrap';
  resourceOpenWrap.className = 'flex items-center';
  resourceOpenWrap.style.display = 'none';
  resourceOpenWrap.innerHTML = `
    <a id="modal-resource-open"
       class="btn btn-accent text-xs rounded-xl px-4 py-2 inline-flex items-center gap-2"
       href="#"
       target="_blank"
       rel="noopener noreferrer">
      <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Resource
    </a>
  `;

  if (formatBlock.nextSibling) {
    stack.insertBefore(resourceBlock, formatBlock.nextSibling);
    stack.insertBefore(resourceOpenWrap, resourceBlock.nextSibling);
  } else {
    stack.appendChild(resourceBlock);
    stack.appendChild(resourceOpenWrap);
  }

  linkEl = document.getElementById('modal-resource-link');
  openWrap = document.getElementById('modal-resource-open-wrap');
  openBtn = document.getElementById('modal-resource-open');
  return { linkEl, openWrap, openBtn };
}

// ═══ MODALS ═══
function openSkillModal(post) {
  closeAllModals();
  if (typeof post === 'string') { try { post = JSON.parse(post); } catch (e) { return; } }
  lastOpenedSkillPost = post;
  post.impressions = (post.impressions || 0) + 1;
  savePosts();
  const isOffer = post.type === 'offer';

  setText('modal-user', anonName(post.userId));
  setText('modal-title', post.skill);
  document.getElementById('modal-type-level').innerHTML = `
    <span class="badge ${isOffer ? 'badge-offer' : 'badge-seek'}">${isOffer ? 'OFFER' : 'SEEK'}</span>
    <span class="badge badge-level">${esc(post.level)}</span>`;
  setText('modal-description', post.description);
  setText('modal-format', post.format || 'Not specified');
  updateSkillModalActions();

  // Resource link rendering
  const link = safeResourceHref(getPostResourceLink(post));
  const resourceNodes = ensureSkillModalResourceSection();
  const linkEl = resourceNodes?.linkEl || null;
  const openWrap = resourceNodes?.openWrap || null;
  const openBtn = resourceNodes?.openBtn || null;

  if (linkEl) {
    if (link) {
      linkEl.textContent = link;
      linkEl.href = link;
      linkEl.style.color = 'var(--blue)';
      linkEl.style.pointerEvents = 'auto';
      linkEl.setAttribute('aria-disabled', 'false');
      linkEl.setAttribute('aria-label', `Open resource: ${link}`);
      if (openBtn) {
        openBtn.href = link;
        openBtn.style.display = 'inline-flex';
        openBtn.style.pointerEvents = 'auto';
      }
      if (openWrap) openWrap.style.display = '';
    } else {
      linkEl.textContent = 'Not provided';
      linkEl.removeAttribute('href');
      linkEl.removeAttribute('aria-label');
      linkEl.style.color = 'var(--ink-4)';
      linkEl.style.pointerEvents = 'none';
      linkEl.setAttribute('aria-disabled', 'true');
      if (openBtn) {
        openBtn.href = '#';
        openBtn.style.display = 'none';
      }
      if (openWrap) openWrap.style.display = 'none';
    }
  }

  document.getElementById('skill-modal').classList.remove('hidden');
  lockBodyScroll();
}
function closeSkillModal() { closeAllModals(); }

function updateSkillModalActions() {
  if (!lastOpenedSkillPost) return;
  const bookmarks = getBookmarks();
  const isSaved = !!bookmarks[currentUserId]?.[lastOpenedSkillPost.id];
  const saveBtn = document.getElementById('modal-bookmark-btn');
  if (saveBtn) saveBtn.innerHTML = `<i class="fa-solid fa-bookmark"></i> ${isSaved ? 'Saved' : 'Save'}`;
  const blockBtn = document.getElementById('modal-block-btn');
  if (blockBtn) blockBtn.style.display = lastOpenedSkillPost.userId === currentUserId ? 'none' : '';
}

function toggleBookmarkFromModal() {
  if (!lastOpenedSkillPost) return;
  const bookmarks = getBookmarks();
  bookmarks[currentUserId] = bookmarks[currentUserId] || {};
  if (bookmarks[currentUserId][lastOpenedSkillPost.id]) {
    delete bookmarks[currentUserId][lastOpenedSkillPost.id];
    showToast('Removed from saved skills', 'info');
  } else {
    bookmarks[currentUserId][lastOpenedSkillPost.id] = true;
    showToast('Saved to bookmarks');
  }
  saveBookmarks(bookmarks);
  updateSkillModalActions();
}

function renderBookmarks() {
  const grid = document.getElementById('bookmarks-grid');
  const empty = document.getElementById('bookmarks-empty');
  if (!grid || !empty) return;
  const ids = Object.keys(getBookmarks()[currentUserId] || {});
  const savedPosts = posts.filter(p => ids.includes(p.id));
  if (!savedPosts.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  grid.innerHTML = savedPosts.map(p => skillCardHTML(p)).join('');
}

function openReportModalFromSkill() {
  if (!lastOpenedSkillPost) return;
  reportDraftTarget = { type: 'skill', id: lastOpenedSkillPost.id, userId: lastOpenedSkillPost.userId, name: lastOpenedSkillPost.skill };
  document.getElementById('report-modal')?.classList.remove('hidden');
  lockBodyScroll();
}

function hideReportModal() {
  document.getElementById('report-modal')?.classList.add('hidden');
  closeAllModals();
}

const ONBOARDING_STEPS = [
  { title: 'Post anonymously', body: 'Share what you can teach or learn without exposing your identity.' },
  { title: 'Browse and bookmark', body: 'Discover skills, save useful posts, and find relevant peers faster.' },
  { title: 'Report and block safely', body: 'Use built-in moderation tools to keep the community healthy.' }
];

function renderOnboardingStep() {
  const el = document.getElementById('onboarding-content');
  if (!el) return;
  const step = ONBOARDING_STEPS[onboardingStep];
  el.innerHTML = `<div class="text-2xs font-black uppercase tracking-widest" style="color:var(--blue);">Step ${onboardingStep + 1} of ${ONBOARDING_STEPS.length}</div><h4 class="font-display font-black text-base" style="color:var(--ink-1);">${esc(step.title)}</h4><p class="text-xs" style="color:var(--ink-3);">${esc(step.body)}</p>`;
}

function showOnboarding() {
  closeAllModals();
  onboardingStep = 0;
  renderOnboardingStep();
  document.getElementById('onboarding-modal')?.classList.remove('hidden');
  lockBodyScroll();
}

function hideOnboarding() {
  closeAllModals();
}

function nextOnboardingStep() {
  if (onboardingStep < ONBOARDING_STEPS.length - 1) {
    onboardingStep += 1;
    renderOnboardingStep();
    return;
  }
  localStorage.setItem('lbn_onboarding_done', '1');
  hideOnboarding();
}

function prevOnboardingStep() {
  if (onboardingStep > 0) onboardingStep -= 1;
  renderOnboardingStep();
}

const COMMANDS = [
  { id: 'go-home', label: 'Go to Home', run: () => navigateTo('home') },
  { id: 'go-browse', label: 'Go to Browse', run: () => navigateTo('browse') },
  { id: 'go-post', label: 'Go to Post Skill', run: () => navigateTo('post') },
  { id: 'go-matches', label: 'Go to Matches', run: () => navigateTo('matches') },
  { id: 'go-bookmarks', label: 'Go to Saved Skills', run: () => navigateTo('bookmarks') },
  { id: 'open-settings', label: 'Open Settings', run: () => showSettingsModal() },
  { id: 'toggle-theme', label: 'Toggle Theme', run: () => toggleTheme() },
  { id: 'start-onboarding', label: 'Show Onboarding', run: () => showOnboarding() }
];

function showCommandPalette() {
  closeAllModals();
  document.getElementById('command-palette-modal')?.classList.remove('hidden');
  lockBodyScroll();
  const search = document.getElementById('command-palette-search');
  if (search) {
    search.value = '';
    search.focus();
  }
  renderCommandPalette();
}

function hideCommandPalette() {
  closeAllModals();
}

function runCommand(commandId) {
  const cmd = COMMANDS.find(c => c.id === commandId);
  if (!cmd) return;
  hideCommandPalette();
  cmd.run();
}

function renderCommandPalette() {
  const query = (document.getElementById('command-palette-search')?.value || '').toLowerCase().trim();
  const container = document.getElementById('command-palette-results');
  if (!container) return;
  const list = COMMANDS.filter(c => !query || c.label.toLowerCase().includes(query));
  container.innerHTML = list.length
    ? list.map(c => `<button class="w-full text-left px-3 py-2 rounded-xl transition-all" style="border:1px solid var(--line-dim); background:var(--paper-2); color:var(--ink-2);" onclick="runCommand('${c.id}')">${esc(c.label)}</button>`).join('')
    : `<div class="text-xs px-3 py-3" style="color:var(--ink-4);">No commands found.</div>`;
}

function submitReport() {
  if (!reportDraftTarget) return;
  const reason = document.getElementById('report-reason')?.value || 'other';
  const details = document.getElementById('report-details')?.value.trim() || '';
  const reports = getReports();
  const duplicate = reports.find(r =>
    r.targetId === reportDraftTarget.id &&
    r.reportedBy === currentUserId &&
    (Date.now() - r.timestamp) < 3600000
  );
  if (duplicate) {
    showToast('You already reported this recently.', 'info');
    return;
  }
  reports.unshift({
    id: 'report_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    type: reportDraftTarget.type,
    targetId: reportDraftTarget.id,
    targetName: reportDraftTarget.name,
    reportedBy: currentUserId,
    reason: `${reason}${details ? `: ${details}` : ''}`,
    status: 'pending',
    priority: reason === 'harassment' || reason === 'adult' ? 'high' : 'normal',
    timestamp: Date.now()
  });
  saveReports(reports);
  renderAdminNavItem();
  hideReportModal();
  showToast('Report submitted. Thanks for helping keep SkillX safe.');
}

function blockUser(userId) {
  if (!userId || userId === currentUserId) return;
  const blocked = getBlockedUsers();
  blocked[currentUserId] = blocked[currentUserId] || {};
  blocked[currentUserId][userId] = true;
  saveBlockedUsers(blocked);
  closeSkillModal();
  renderBrowse();
  showToast(`Blocked ${anonName(userId)} from your feed`, 'info');
}

function blockCurrentSkillUser() {
  if (!lastOpenedSkillPost) return;
  blockUser(lastOpenedSkillPost.userId);
}

function showSettingsModal() {
  closeAllModals();
  document.getElementById('settings-modal').classList.remove('hidden');
  lockBodyScroll();
}
function hideSettingsModal() { closeAllModals(); }

function showProfileModal() {
  closeAllModals();
  const user = currentUserId || 'Not logged in';
  const users = getUsers();
  const joined = users[user]?.joined;

  setText('profile-user-id', user);
  setText('profile-joined-date',
    joined ? new Date(joined).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Today');

  const mine = posts.filter(p => p.userId === currentUserId);
  setText('profile-offers-count', mine.filter(p => p.type === 'offer').length);
  setText('profile-seeks-count', mine.filter(p => p.type === 'seek').length);

  document.getElementById('profile-modal').classList.remove('hidden');
  lockBodyScroll();
}
function hideProfileModal() { closeAllModals(); }

function hideSuccessModal() {
  closeAllModals();
  navigateTo('browse');
}

// ═══ DELETE / CLEAR ═══
function deletePost(id) {
  if (!confirm('Delete this post permanently?')) return;
  posts = posts.filter(p => p.id !== id);
  savePosts();
  renderMyPosts();
  showToast('Post deleted');
}

function deleteAccount() {
  if (isAdmin()) { showToast('Admin accounts cannot be deleted here', 'info'); return; }
  if (!confirm('Delete your account permanently? This cannot be undone.')) return;
  const users = getUsers();
  delete users[currentUserId];
  saveUsers(users);
  removeKey(LS.currentUser);
  posts = posts.filter(p => p.userId !== currentUserId);
  savePosts();
  currentUserId = null;
  hideProfileModal();
  updateUserDisplay();
  showAuth();
  showToast('Account deleted. Goodbye!', 'info');
}

function clearAllData() {
  if (!confirm('Delete all local data and reset the app?')) return;
  localStorage.clear();
  location.reload();
}

// ═══ GLOBAL SEARCH ═══
function performGlobalSearch() {
  const q = document.getElementById('global-search').value.toLowerCase().trim();
  if (!q) {
    navigateTo('browse');
    renderBrowseGrid();
    return;
  }
  activeCategoryFilter = null;
  navigateTo('browse');

  setTimeout(() => {
    const container = document.getElementById('browse-grid');
    const empty = document.getElementById('browse-empty');
    let results = getVisiblePosts().filter(p =>
      p.skill.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      (p.tags || []).join(' ').toLowerCase().includes(q)
    );
    results = currentBrowseTab === 0
      ? results.filter(p => p.type === 'offer')
      : results.filter(p => p.type === 'seek');

    if (results.length === 0) {
      if (container) container.innerHTML = '';
      if (empty) {
        empty.classList.remove('hidden');
        const p = empty.querySelector('p');
        if (p) p.textContent = `No results for "${q}"`;
      }
      return;
    }
    if (empty) empty.classList.add('hidden');
    if (container) container.innerHTML = results.map(p => skillCardHTML(p)).join('');
    showToast(`${results.length} result${results.length !== 1 ? 's' : ''} for "${q}"`);
  }, 50);
}

// ════════════════════════════════════════════════
// ADMIN PANEL — Full Dashboard Implementation
// ════════════════════════════════════════════════

// Admin nav item renderer
function renderAdminNavItem() {
  const nav = document.getElementById('nav-admin');
  const toggleEl = document.getElementById('nav-admin-ui-toggle');
  if (!nav) return;
  if (isAdmin()) {
    nav.style.display = 'flex';
    if (toggleEl) toggleEl.style.display = 'flex';

    // Update toggle text/icon based on current mode (do NOT reset adminUIUserMode)
    updateAdminUIToggle();

    const reports = getReports().filter(r => r.status === 'pending').length;
    const badge = document.getElementById('admin-report-badge');
    if (badge) {
      badge.textContent = reports;
      badge.style.display = reports > 0 ? 'inline' : 'none';
    }
  } else {
    nav.style.display = 'none';
    if (toggleEl) toggleEl.style.display = 'none';
  }
}

// Update navigateTo to handle admin
const _origNavigateTo = navigateTo;
navigateTo = function (section) {
  if (section === 'admin') {
    if (!isAdmin()) { showToast('Access denied. Admin only.', 'error'); return; }
    // Ensure adminUIUserMode is false when navigating to admin panel
    if (adminUIUserMode) {
      adminUIUserMode = false;
      updateAdminUIToggle();
    }
    // Hide user nav items & search bar when entering admin panel
    applyAdminUIModeVisibility();
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('section-admin');
    if (el) el.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navEl = document.getElementById('nav-admin');
    if (navEl) navEl.classList.add('active');
    const ca = document.getElementById('content-area');
    if (ca) ca.style.overflow = 'auto';
    closeSidebar();
    renderAdminDashboard();
    renderAdminReports();
    return;
  }
  _origNavigateTo(section);
};

// Admin sub-navigation
function adminNavigateTo(section) {
  if (!isAdmin()) return;
  document.querySelectorAll('.admin-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
  const pane = document.getElementById('admin-' + section);
  if (pane) pane.classList.add('active');
  const btn = document.querySelector(`.admin-nav-btn[data-section="${section}"]`);
  if (btn) btn.classList.add('active');

  switch (section) {
    case 'dashboard': renderAdminDashboard(); break;
    case 'users': renderAdminUsers(); break;
    case 'posts': renderAdminPosts(); break;
    case 'reports': renderAdminReports(); break;
    case 'analytics': renderAdminAnalytics(); break;
    case 'logs': renderAdminLogs(); break;
    case 'settings': renderAdminSettings(); break;
  }
}

// ═══ DASHBOARD ═══
function renderAdminDashboard() {
  const users = getUsers();
  const userKeys = Object.keys(users).filter(u => u !== 'admin');
  const banned = getBannedUsers();
  const suspended = getSuspendedUsers();
  const reports = getReports();
  const pendingReports = reports.filter(r => r.status === 'pending');
  const handledReports = reports.filter(r => r.status !== 'pending');
  const logs = getAdminLogs();

  setText('admin-stat-users', userKeys.length);
  setText('admin-stat-posts', posts.length);
  setText('admin-stat-reports', pendingReports.length);
  setText('admin-stat-banned', Object.keys(banned).length);
  setText('admin-stat-reports-handled', handledReports.length);

  // Active users (users with posts)
  const activeUsers = new Set(posts.map(p => p.userId).filter(u => u && u !== 'admin'));
  setText('admin-stat-active', activeUsers.size);

  setText('admin-stat-matches', computePlatformMatchCount());

  // Platform overview list
  const overview = document.getElementById('admin-overview-list');
  if (overview) {
    overview.innerHTML = `
      <div class="flex justify-between"><span>Registered Users</span><strong style="color:var(--blue);">${userKeys.length}</strong></div>
      <div class="flex justify-between"><span>Total Skills Posted</span><strong style="color:var(--green);">${posts.length}</strong></div>
      <div class="flex justify-between"><span>Admin Actions Logged</span><strong style="color:var(--orange);">${logs.length}</strong></div>
      <div class="flex justify-between"><span>Pending Reports</span><strong style="color:${pendingReports.length > 0 ? 'var(--danger)' : 'var(--green)'};">${pendingReports.length}</strong></div>
    `;
  }

  // Top categories
  const catCounts = {};
  posts.forEach(p => { catCounts[p.category] = (catCounts[p.category] || 0) + 1; });
  const sorted = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  const maxCount = sorted.length > 0 ? sorted[0][1] : 1;
  const catContainer = document.getElementById('admin-top-categories');
  if (catContainer) {
    const colors = ['var(--blue)', 'var(--green)', 'var(--pink)', 'var(--orange)', 'var(--yellow)', 'var(--purple)', 'var(--red)'];
    catContainer.innerHTML = sorted.length === 0
      ? '<div class="text-xs" style="color:var(--ink-4);">No posts yet.</div>'
      : sorted.map(([cat, count], i) => `
        <div class="admin-cat-bar-wrap">
          <span class="admin-cat-bar-label">${esc(cat)}</span>
          <div class="admin-cat-bar">
            <div class="admin-cat-bar-fill" style="width:${(count / maxCount) * 100}%; background:${colors[i % colors.length]};"></div>
          </div>
          <span class="text-xs font-bold" style="color:var(--ink-3); min-width:24px;">${count}</span>
        </div>
      `).join('');
  }
}

// ═══ USER MANAGEMENT ═══
function renderAdminUsers() {
  const users = getUsers();
  const banned = getBannedUsers();
  const suspended = getSuspendedUsers();
  const query = (document.getElementById('admin-user-search')?.value || '').toLowerCase();
  const tbody = document.getElementById('admin-users-tbody');
  const empty = document.getElementById('admin-users-empty');

  let userList = Object.keys(users).filter(u => u !== 'admin');
  if (query) userList = userList.filter(u => u.toLowerCase().includes(query));

  if (userList.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  tbody.innerHTML = userList.map(u => {
    const isBanned = banned[u];
    const isSuspended = suspended[u];
    let status = 'Active';
    let statusClass = 'admin-badge-active';
    if (isBanned) { status = 'Banned'; statusClass = 'admin-badge-banned'; }
    else if (isSuspended) { status = 'Suspended'; statusClass = 'admin-badge-suspended'; }

    const userPosts = posts.filter(p => p.userId === u).length;
    const joined = users[u]?.joined ? new Date(users[u].joined).toLocaleDateString() : 'Unknown';

    return `
      <tr>
        <td><span class="font-bold text-xs" style="color:var(--ink-1);">${esc(u)}</span></td>
        <td><span class="admin-badge ${statusClass}">${status}</span></td>
        <td><span class="admin-badge ${u === 'admin' ? 'admin-badge-admin' : 'admin-badge-user'}">${u === 'admin' ? 'Admin' : 'User'}</span></td>
        <td><span class="text-xs font-bold" style="color:var(--ink-3);">${userPosts}</span></td>
        <td><span class="text-xs" style="color:var(--ink-4);">${joined}</span></td>
        <td>
          <div class="flex gap-1 flex-wrap">
            ${!isBanned ? `<button class="admin-action-btn admin-action-btn-ban" onclick="adminBanUser('${esc(u)}')">Ban</button>` : `<button class="admin-action-btn admin-action-btn-ok" onclick="adminUnbanUser('${esc(u)}')">Unban</button>`}
            ${!isSuspended ? `<button class="admin-action-btn admin-action-btn-suspend" onclick="adminSuspendUser('${esc(u)}')">Suspend</button>` : `<button class="admin-action-btn admin-action-btn-ok" onclick="adminUnsuspendUser('${esc(u)}')">Unsuspend</button>`}
            <button class="admin-action-btn admin-action-btn-delete" onclick="adminDeleteUser('${esc(u)}')">Delete</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function adminBanUser(username) {
  if (!isAdmin()) return;
  showAdminConfirm('Ban User', `Ban "${username}" from the platform?`, () => {
    const banned = getBannedUsers();
    banned[username] = true;
    saveBannedUsers(banned);
    const suspended = getSuspendedUsers();
    delete suspended[username];
    saveSuspendedUsers(suspended);
    logAdminAction('ban', `Banned user: ${username}`, username);
    renderAdminUsers();
    renderAdminDashboard();
    renderAdminNavItem();
    showToast(`User "${username}" banned.`);
  }, 'danger');
}

function adminUnbanUser(username) {
  if (!isAdmin()) return;
  const banned = getBannedUsers();
  delete banned[username];
  saveBannedUsers(banned);
  logAdminAction('unban', `Unbanned user: ${username}`, username);
  renderAdminUsers();
  renderAdminDashboard();
  renderAdminNavItem();
  showToast(`User "${username}" unbanned.`);
}

function adminSuspendUser(username) {
  if (!isAdmin()) return;
  showAdminConfirm('Suspend User', `Suspend "${username}" temporarily?`, () => {
    const suspended = getSuspendedUsers();
    suspended[username] = { reason: 'Suspended by admin', timestamp: Date.now(), suspendedBy: 'admin' };
    saveSuspendedUsers(suspended);
    logAdminAction('suspend', `Suspended user: ${username}`, username);
    renderAdminUsers();
    renderAdminDashboard();
    showToast(`User "${username}" suspended.`);
  }, 'warning');
}

function adminUnsuspendUser(username) {
  if (!isAdmin()) return;
  const suspended = getSuspendedUsers();
  delete suspended[username];
  saveSuspendedUsers(suspended);
  logAdminAction('unsuspend', `Unsuspended user: ${username}`, username);
  renderAdminUsers();
  showToast(`User "${username}" unsuspended.`);
}

function adminDeleteUser(username) {
  if (!isAdmin()) return;
  showAdminConfirm('Delete User', `Delete "${username}" and all their data? This cannot be undone.`, () => {
    const users = getUsers();
    delete users[username];
    saveUsers(users);
    posts = posts.filter(p => p.userId !== username);
    savePosts();
    const banned = getBannedUsers();
    delete banned[username];
    saveBannedUsers(banned);
    const suspended = getSuspendedUsers();
    delete suspended[username];
    saveSuspendedUsers(suspended);
    logAdminAction('delete_user', `Deleted user: ${username}`, username);
    renderAdminUsers();
    renderAdminDashboard();
    renderAdminNavItem();
    showToast(`User "${username}" deleted.`);
  }, 'danger');
}

// ═══ POST MODERATION ═══
function renderAdminPosts() {
  const tbody = document.getElementById('admin-posts-tbody');
  const empty = document.getElementById('admin-posts-empty');
  const filter = document.getElementById('admin-post-filter')?.value || 'all';
  const query = (document.getElementById('admin-post-search')?.value || '').toLowerCase();
  const reports = getReports();

  let filtered = posts;
  if (filter !== 'all') filtered = filtered.filter(p => p.type === filter);
  if (query) filtered = filtered.filter(p =>
    p.skill.toLowerCase().includes(query) ||
    p.userId.toLowerCase().includes(query) ||
    p.category.toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  tbody.innerHTML = filtered.map(p => {
    const reportCount = reports.filter(r => r.type === 'skill' && r.targetId === p.id && r.status === 'pending').length;
    const isFeatured = p._featured;
    const isSpam = p._spam;
    let statusBadge = 'admin-badge-normal';
    let statusText = 'Normal';
    if (isFeatured) { statusBadge = 'admin-badge-featured'; statusText = 'Featured'; }
    if (isSpam) { statusBadge = 'admin-badge-spam'; statusText = 'Spam'; }

    return `
      <tr>
        <td><span class="text-xs font-semibold" style="color:var(--ink-1);">${esc(p.skill)}</span></td>
        <td><span class="admin-badge ${p.type === 'offer' ? 'admin-badge-active' : 'admin-badge-normal'}">${p.type.toUpperCase()}</span></td>
        <td><span class="text-xs" style="color:var(--ink-3);">${esc(anonName(p.userId))}</span></td>
        <td><span class="text-xs" style="color:var(--ink-4);">${esc(p.category)}</span></td>
        <td><span class="text-xs font-bold" style="color:${reportCount > 0 ? 'var(--danger)' : 'var(--ink-4)'};">${reportCount}</span></td>
        <td><span class="admin-badge ${statusBadge}">${statusText}</span></td>
        <td>
          <div class="flex gap-1 flex-wrap">
            <button class="admin-action-btn admin-action-btn-delete" onclick="adminDeletePost('${esc(p.id)}')">Delete</button>
            <button class="admin-action-btn admin-action-btn-warn" onclick="adminToggleFeatured('${esc(p.id)}')">${isFeatured ? 'Unfeature' : 'Feature'}</button>
            <button class="admin-action-btn ${isSpam ? 'admin-action-btn-ok' : 'admin-action-btn-ban'}" onclick="adminToggleSpam('${esc(p.id)}')">${isSpam ? 'Not Spam' : 'Spam'}</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function adminDeletePost(postId) {
  if (!isAdmin()) return;
  showAdminConfirm('Delete Post', 'Delete this post permanently?', () => {
    const post = posts.find(p => p.id === postId);
    posts = posts.filter(p => p.id !== postId);
    savePosts();
    logAdminAction('delete_post', `Deleted post: "${post ? post.skill : 'unknown'}"`, post ? post.userId : null, postId);
    renderAdminPosts();
    renderAdminDashboard();
    showToast('Post deleted.');
  }, 'danger');
}

function adminToggleFeatured(postId) {
  if (!isAdmin()) return;
  const post = posts.find(p => p.id === postId);
  if (!post) return;
  post._featured = !post._featured;
  if (!post._featured) delete post._featured;
  savePosts();
  logAdminAction(post._featured ? 'feature' : 'unfeature', `${post._featured ? 'Featured' : 'Unfeatured'} post: "${post.skill}"`, post.userId, postId);
  renderAdminPosts();
  showToast(post._featured ? 'Post featured!' : 'Post unfeatured.');
}

function adminToggleSpam(postId) {
  if (!isAdmin()) return;
  const post = posts.find(p => p.id === postId);
  if (!post) return;
  post._spam = !post._spam;
  if (!post._spam) delete post._spam;
  savePosts();
  logAdminAction(post._spam ? 'mark_spam' : 'unmark_spam', `${post._spam ? 'Marked as spam' : 'Removed spam flag'}: "${post.skill}"`, post.userId, postId);
  renderAdminPosts();
  showToast(post._spam ? 'Post marked as spam.' : 'Spam flag removed.');
}

// ═══ REPORTS ═══
function renderAdminReports() {
  const container = document.getElementById('admin-reports-container');
  const empty = document.getElementById('admin-reports-empty');
  const selected = document.getElementById('admin-report-filter')?.value || 'pending';
  const reports = getReports()
    .filter(r => selected === 'all' ? true : r.status === selected)
    .sort((a, b) => {
      const aPri = a.priority === 'high' ? 0 : 1;
      const bPri = b.priority === 'high' ? 0 : 1;
      if (aPri !== bPri) return aPri - bPri;
      return b.timestamp - a.timestamp;
    });

  // Update badge
  const badge = document.getElementById('admin-reports-count-badge');
  if (badge) badge.textContent = reports.length;

  if (reports.length === 0) {
    if (container) container.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  if (container) {
    container.innerHTML = reports.map(r => {
      const typeColors = {
        user: { bg: 'var(--orange-soft)', border: 'var(--orange)', icon: 'fa-user' },
        skill: { bg: 'var(--yellow-soft)', border: 'var(--yellow)', icon: 'fa-newspaper' },
        chat: { bg: 'var(--pink-soft)', border: 'var(--pink)', icon: 'fa-comment-dots' }
      };
      const tc = typeColors[r.type] || typeColors.user;
      return `
        <div class="admin-report-card" style="border-left:4px solid ${tc.border};">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="admin-badge" style="background:${tc.bg}; color:${tc.border}; border-color:${tc.border};">${r.type.toUpperCase()}</span>
              <span class="text-2xs font-semibold" style="color:var(--ink-4);">${relativeTime(r.timestamp)} · ${esc(r.status)}</span>
            </div>
            <div class="text-xs font-semibold mb-1" style="color:var(--ink-1);">Target: ${esc(r.targetName || r.targetId)}</div>
            <div class="text-xs" style="color:var(--ink-3);">Reported by: ${esc(r.reportedBy)}</div>
            <div class="text-xs mt-1" style="color:var(--ink-4);">Reason: "${esc(r.reason)}"</div>
          </div>
          <div class="flex gap-1.5 flex-shrink-0">
            ${r.status === 'pending' ? `<button class="admin-action-btn admin-action-btn-suspend" onclick="adminSetReportStatus('${esc(r.id)}','investigating')">Investigate</button>` : ''}
            <button class="admin-action-btn admin-action-btn-warn" onclick="adminDismissReport('${esc(r.id)}')">Dismiss</button>
            <button class="admin-action-btn admin-action-btn-ban" onclick="adminTakeActionReport('${esc(r.id)}')">Take Action</button>
          </div>
        </div>`;
    }).join('');
  }
}

function adminSetReportStatus(reportId, status) {
  if (!isAdmin()) return;
  const reports = getReports();
  const report = reports.find(r => r.id === reportId);
  if (!report) return;
  report.status = status;
  report.reviewedAt = Date.now();
  saveReports(reports);
  logAdminAction('report_status', `Set report ${report.id} to ${status}`, report.targetId);
  renderAdminReports();
  showToast(`Report marked as ${status}.`, 'info');
}

function adminDismissReport(reportId) {
  if (!isAdmin()) return;
  const reports = getReports();
  const report = reports.find(r => r.id === reportId);
  if (!report) return;
  report.status = 'dismissed';
  saveReports(reports);
  logAdminAction('dismiss', `Dismissed report: ${report.reason}`, report.targetId);
  renderAdminReports();
  renderAdminDashboard();
  renderAdminNavItem();
  showToast('Report dismissed.');
}

function adminTakeActionReport(reportId) {
  if (!isAdmin()) return;
  const reports = getReports();
  const report = reports.find(r => r.id === reportId);
  if (!report) return;

  showAdminConfirm('Take Action', `Take action on report against "${report.targetId}"?`, () => {
    report.status = 'resolved';
    saveReports(reports);
    logAdminAction('resolve', `Resolved report: ${report.reason}`, report.targetId);

    // If it's a user report, ban the user
    if (report.type === 'user') {
      const banned = getBannedUsers();
      banned[report.targetId] = true;
      saveBannedUsers(banned);
      logAdminAction('ban', `Banned user from report: ${report.targetId}`, report.targetId);
    }
    // If it's a skill post, delete it
    if (report.type === 'skill') {
      posts = posts.filter(p => p.id !== report.targetId);
      savePosts();
      logAdminAction('delete_post', `Deleted post from report: ${report.targetName}`, report.targetId, report.targetId);
    }

    renderAdminReports();
    renderAdminDashboard();
    renderAdminNavItem();
    renderAdminUsers();
    renderAdminPosts();
    showToast('Action taken. Report resolved.');
  }, 'danger');
}

function clearAllReports() {
  if (!isAdmin()) return;
  showAdminConfirm('Clear All Reports', 'Delete all reports permanently?', () => {
    localStorage.removeItem(LS.reports);
    renderAdminReports();
    renderAdminDashboard();
    renderAdminNavItem();
    showToast('All reports cleared.');
  }, 'danger');
}

// ═══ ANALYTICS ═══
function renderAdminAnalytics() {
  const users = getUsers();
  const userKeys = Object.keys(users).filter(u => u !== 'admin');
  const banned = getBannedUsers();
  const reports = getReports();

  // Engagement
  const engagement = document.getElementById('admin-analytics-engagement');
  if (engagement) {
    engagement.innerHTML = `
      <div class="flex justify-between"><span>Total Posts</span><strong style="color:var(--green);">${posts.length}</strong></div>
      <div class="flex justify-between"><span>Reports Filed</span><strong style="color:${reports.length > 0 ? 'var(--orange)' : 'var(--green)'};">${reports.length}</strong></div>
    `;
  }

  // Category distribution
  const catCounts = {};
  posts.forEach(p => { catCounts[p.category] = (catCounts[p.category] || 0) + 1; });
  const sorted = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  const maxCount = sorted.length > 0 ? sorted[0][1] : 1;
  const catEl = document.getElementById('admin-analytics-categories');
  if (catEl) {
    const colors = ['var(--blue)', 'var(--green)', 'var(--pink)', 'var(--orange)', 'var(--yellow)', 'var(--purple)', 'var(--red)'];
    catEl.innerHTML = sorted.length === 0
      ? '<div class="text-xs" style="color:var(--ink-4);">No data yet.</div>'
      : sorted.map(([cat, count], i) => `
        <div class="admin-cat-bar-wrap">
          <span class="admin-cat-bar-label" style="min-width:100px;">${esc(cat)}</span>
          <div class="admin-cat-bar">
            <div class="admin-cat-bar-fill" style="width:${(count / maxCount) * 100}%; background:${colors[i % colors.length]};"></div>
          </div>
          <span class="text-xs font-bold" style="color:var(--ink-3); min-width:20px;">${count}</span>
        </div>
      `).join('');
  }

  // User stats
  const userEl = document.getElementById('admin-analytics-users');
  if (userEl) {
    const offerCount = posts.filter(p => p.type === 'offer').length;
    const seekCount = posts.filter(p => p.type === 'seek').length;
    userEl.innerHTML = `
      <div class="flex justify-between"><span>Registered Users</span><strong style="color:var(--blue);">${userKeys.length}</strong></div>
      <div class="flex justify-between"><span>Banned Users</span><strong style="color:var(--danger);">${Object.keys(banned).length}</strong></div>
      <div class="flex justify-between"><span>Offers / Seeks Ratio</span><strong style="color:var(--ink-3);">${offerCount}:${seekCount}</strong></div>
      <div class="flex justify-between"><span>Posts per User (avg)</span><strong style="color:var(--ink-3);">${userKeys.length > 0 ? (posts.length / userKeys.length).toFixed(1) : 0}</strong></div>
    `;
  }

  // Content stats
  const contentEl = document.getElementById('admin-analytics-content');
  if (contentEl) {
    const levelCounts = {};
    posts.forEach(p => { levelCounts[p.level] = (levelCounts[p.level] || 0) + 1; });
    const levels = Object.entries(levelCounts).sort((a, b) => b[1] - a[1]);
    contentEl.innerHTML = `
      <div class="flex justify-between"><span>Offers to Teach</span><strong style="color:var(--blue);">${posts.filter(p => p.type === 'offer').length}</strong></div>
      <div class="flex justify-between"><span>Requests to Learn</span><strong style="color:var(--green);">${posts.filter(p => p.type === 'seek').length}</strong></div>
      <div class="flex justify-between"><span>Total Categories</span><strong style="color:var(--purple);">${Object.keys(catCounts).length}</strong></div>
      <div class="flex justify-between"><span>Most Posts by Level</span><strong style="color:var(--ink-3);">${levels.length > 0 ? esc(levels[0][0]) : 'N/A'}</strong></div>
    `;
  }

  const kpiEl = document.getElementById('admin-kpi-chart');
  if (kpiEl) {
    const pending = reports.filter(r => r.status === 'pending').length;
    const resolved = reports.filter(r => r.status === 'resolved').length;
    const stats = [
      { label: 'Users', value: userKeys.length },
      { label: 'Posts', value: posts.length },
      { label: 'Pending', value: pending },
      { label: 'Resolved', value: resolved }
    ];
    const max = Math.max(1, ...stats.map(s => s.value));
    kpiEl.innerHTML = stats.map(s => `
      <div class="mini-chart-row">
        <span class="text-xs" style="color:var(--ink-3);">${s.label}</span>
        <div class="mini-chart-bar"><span class="mini-chart-fill" style="width:${(s.value / max) * 100}%;"></span></div>
        <span class="text-xs font-bold" style="color:var(--ink-2);">${s.value}</span>
      </div>`).join('');
  }

  const timelineEl = document.getElementById('admin-timeline');
  if (timelineEl) {
    const logs = getAdminLogs().slice(0, 8);
    timelineEl.innerHTML = logs.length
      ? logs.map(log => `<div class="flex items-center justify-between rounded-xl px-3 py-2" style="background:var(--paper-2); border:1px solid var(--line-dim);"><span style="color:var(--ink-3);">${esc(log.details)}</span><span style="color:var(--ink-4);">${relativeTime(log.timestamp)}</span></div>`).join('')
      : '<div class="text-xs" style="color:var(--ink-4);">No moderation history yet.</div>';
  }
}

// ═══ ACTIVITY LOGS ═══
function renderAdminLogs() {
  const tbody = document.getElementById('admin-logs-tbody');
  const empty = document.getElementById('admin-logs-empty');
  const logs = getAdminLogs();

  if (logs.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  const actionColors = {
    ban: 'admin-log-action-ban', unban: 'admin-log-action-ok',
    suspend: 'admin-log-action-mod', unsuspend: 'admin-log-action-ok',
    delete_user: 'admin-log-action-delete', delete_post: 'admin-log-action-delete',
    feature: 'admin-log-action-ok', unfeature: 'admin-log-action-mod',
    mark_spam: 'admin-log-action-mod', unmark_spam: 'admin-log-action-ok',
    dismiss: 'admin-log-action-ok', resolve: 'admin-log-action-ok',
  };
  const rowColors = {
    ban: 'admin-log-row-ban', delete_user: 'admin-log-row-delete', delete_post: 'admin-log-row-delete',
    suspend: 'admin-log-row-mod', mark_spam: 'admin-log-row-mod',
    feature: 'admin-log-row-ok', dismiss: 'admin-log-row-ok', resolve: 'admin-log-row-ok',
  };

  tbody.innerHTML = logs.slice(0, 100).map(log => {
    const actClass = actionColors[log.action] || 'admin-log-action-ok';
    const rowClass = rowColors[log.action] || '';
    return `
      <tr class="admin-log-row ${rowClass}">
        <td class="text-2xs" style="color:var(--ink-4); white-space:nowrap;">${new Date(log.timestamp).toLocaleString()}</td>
        <td><span class="admin-log-action ${actClass}">${esc(log.action.replace(/_/g, ' '))}</span></td>
        <td class="text-xs" style="color:var(--ink-3);">${esc(log.details)}</td>
        <td class="text-xs" style="color:var(--ink-4);">${log.affectedUser ? esc(log.affectedUser) : '—'}</td>
      </tr>`;
  }).join('');
}

function clearAdminLogs() {
  if (!isAdmin()) return;
  showAdminConfirm('Clear Logs', 'Delete all activity logs?', () => {
    saveAdminLogs([]);
    renderAdminLogs();
    showToast('Logs cleared.');
  }, 'danger');
}

// ═══ ADMIN SETTINGS ═══
function renderAdminSettings() {
  const settings = getAdminSettings();
  const maintBtn = document.getElementById('admin-toggle-maintenance');
  const regBtn = document.getElementById('admin-toggle-registrations');
  if (maintBtn) {
    maintBtn.textContent = settings.maintenanceMode ? 'ON' : 'OFF';
    maintBtn.className = 'admin-toggle-btn' + (settings.maintenanceMode ? ' admin-toggle-on' : '');
  }
  if (regBtn) {
    regBtn.textContent = settings.registrationsEnabled ? 'ON' : 'OFF';
    regBtn.className = 'admin-toggle-btn' + (settings.registrationsEnabled ? ' admin-toggle-on' : '');
  }
}

function toggleAdminSetting(key) {
  if (!isAdmin()) return;
  const settings = getAdminSettings();
  settings[key] = !settings[key];
  saveAdminSettings(settings);
  renderAdminSettings();
  logAdminAction('settings', `Toggled ${key} to ${settings[key]}`);
  showToast(`${key} set to ${settings[key] ? 'enabled' : 'disabled'}.`);
}

function exportAdminData() {
  if (!isAdmin()) return;
  const data = {
    users: getUsers(),
    posts,
    reports: getReports(),
    logs: getAdminLogs(),
    banned: getBannedUsers(),
    suspended: getSuspendedUsers(),
    settings: getAdminSettings(),
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SkillX_Admin_Export_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported!');
}

function resetAnalytics() {
  if (!isAdmin()) return;
  showAdminConfirm('Reset Analytics', 'This will clear all reports and logs. Continue?', () => {
    saveAdminLogs([]);
    localStorage.removeItem(LS.reports);
    renderAdminDashboard();
    renderAdminLogs();
    renderAdminAnalytics();
    renderAdminNavItem();
    showToast('Analytics reset.');
  }, 'warning');
}

function clearAllAdminData() {
  if (!isAdmin()) return;
  showAdminConfirm('Clear Admin Data', 'Delete all reports, logs, bans, and settings? Users and posts will remain.', () => {
    localStorage.removeItem(LS.reports);
    localStorage.removeItem(LS.adminLogs);
    localStorage.removeItem(LS.bannedUsers);
    localStorage.removeItem(LS.suspendedUsers);
    localStorage.removeItem(LS.adminSettings);
    renderAdminDashboard();
    renderAdminLogs();
    renderAdminAnalytics();
    renderAdminSettings();
    renderAdminNavItem();
    renderAdminUsers();
    renderAdminPosts();
    showToast('All admin data cleared.');
  }, 'danger');
}

// ═══ ADMIN CONFIRMATION MODAL ═══
let _adminConfirmCallback = null;

function showAdminConfirm(title, message, callback, type = 'danger') {
  closeAllModals();
  const modal = document.getElementById('admin-confirm-modal');
  if (!modal) return;
  document.getElementById('admin-confirm-title').textContent = title;
  document.getElementById('admin-confirm-message').textContent = message;
  const icon = document.getElementById('admin-confirm-icon');
  const proceedBtn = document.getElementById('admin-confirm-proceed');
  if (icon) {
    if (type === 'danger') {
      icon.style.background = 'var(--red-soft)';
      icon.style.borderColor = 'var(--danger)';
      icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--danger);"></i>';
    } else {
      icon.style.background = 'var(--yellow-soft)';
      icon.style.borderColor = 'var(--yellow)';
      icon.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:var(--yellow);"></i>';
    }
  }
  if (proceedBtn) {
    proceedBtn.style.borderColor = type === 'danger' ? 'var(--danger)' : 'var(--yellow)';
    proceedBtn.style.color = type === 'danger' ? 'var(--danger)' : 'var(--yellow)';
    proceedBtn.style.background = type === 'danger' ? 'var(--red-soft)' : 'var(--yellow-soft)';
  }
  _adminConfirmCallback = callback;
  modal.classList.remove('hidden');
  lockBodyScroll();
}

function hideAdminConfirm() {
  const modal = document.getElementById('admin-confirm-modal');
  if (modal) modal.classList.add('hidden');
  _adminConfirmCallback = null;
  closeAllModals();
}

function proceedAdminConfirm() {
  if (_adminConfirmCallback) _adminConfirmCallback();
  hideAdminConfirm();
}

function hideAdminReportModal() {
  document.getElementById('admin-report-modal')?.classList.add('hidden');
  closeAllModals();
}
// ═══ END ADMIN PANEL ═══

// ═══ SEED DATA ═══
function seedDemoData() {
  const demoPosts = [
    {
      id: 'demo_1', userId: 'anon_4e2a', type: 'offer',
      skill: 'Python for Data Science',
      category: 'Programming & Tech', level: 'Intermediate', format: '🎥 Video',
      description: 'Learn pandas, numpy, and matplotlib through hands-on projects. Cover EDA, data cleaning, and visualization. No experience needed beyond basic Python.',
      resourceLink: 'https://www.coursera.org/learn/python-for-applied-data-science-ai', resource: 'https://www.coursera.org/learn/python-for-applied-data-science-ai', timestamp: Date.now() - 3600000
    },
    {
      id: 'demo_2', userId: 'anon_9f1c', type: 'seek',
      skill: 'Spanish Conversation Practice',
      category: 'Languages & Communication', level: 'Beginner', format: '💬 Live Session',
      description: 'Looking for a patient conversation partner to practice basic Spanish. I know grammar but struggle with real-world conversation. Happy to exchange another skill!',
      resourceLink: 'https://www.fluentin3months.com/spanish-conversation-practice/', resource: 'https://www.fluentin3months.com/spanish-conversation-practice/', timestamp: Date.now() - 7200000
    },
    {
      id: 'demo_3', userId: 'anon_b3d7', type: 'offer',
      skill: 'UI/UX Design with Figma',
      category: 'Design & Creative', level: 'Intermediate', format: '📄 Document',
      description: 'I can teach Figma fundamentals, wireframing, prototyping, and building design systems from scratch. Portfolio-ready projects included.',
      resourceLink: 'https://www.figma.com/resource-library/design-basics/', resource: 'https://www.figma.com/resource-library/design-basics/', timestamp: Date.now() - 10800000
    },
    {
      id: 'demo_4', userId: 'anon_7k2m', type: 'seek',
      skill: 'Machine Learning Foundations',
      category: 'Programming & Tech', level: 'Beginner', format: '🎥 Video',
      description: 'Seeking a mentor to guide me through core ML concepts — regression, classification, clustering. Comfortable with Python and basic statistics.',
      resourceLink: 'https://www.coursera.org/specializations/machine-learning-introduction', resource: 'https://www.coursera.org/specializations/machine-learning-introduction', timestamp: Date.now() - 14400000
    },
    {
      id: 'demo_5', userId: 'anon_x5p9', type: 'offer',
      skill: 'Academic Essay Writing',
      category: 'Academic & Research', level: 'Advanced', format: '📄 Document',
      description: 'Help with structure, argument development, citations (APA/MLA), and academic tone. Strong in literature, history, and social sciences.',
      resourceLink: 'https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/index.html', resource: 'https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/index.html', timestamp: Date.now() - 18000000
    },
    {
      id: 'demo_6', userId: 'anon_r1q6', type: 'offer',
      skill: 'Guitar for Absolute Beginners',
      category: 'Music & Arts', level: 'Beginner', format: '🎥 Video',
      description: 'Teaching basic chords, strumming patterns, and 10 beginner songs. Acoustic or electric — your choice. Patient and encouraging teaching style.',
      resourceLink: 'https://www.justinguitar.com/classes/beginner-guitar-course-grade-1', resource: 'https://www.justinguitar.com/classes/beginner-guitar-course-grade-1', timestamp: Date.now() - 21600000
    },
    {
      id: 'demo_7', userId: 'anon_v2z8', type: 'seek',
      skill: 'Public Speaking & Presentation Skills',
      category: 'Soft Skills', level: 'Beginner', format: '💬 Live Session',
      description: 'Terrified of public speaking. Looking for someone to practice mock presentations with and give constructive feedback. Even 30-min sessions help!',
      resourceLink: 'https://www.toastmasters.org/resources/public-speaking-tips', resource: 'https://www.toastmasters.org/resources/public-speaking-tips', timestamp: Date.now() - 25200000
    },
    {
      id: 'demo_8', userId: 'anon_h4w0', type: 'offer',
      skill: 'Digital Photography Basics',
      category: 'Design & Creative', level: 'Beginner', format: '🔗 External Link',
      description: 'Teaching camera settings, composition rules, natural lighting, and light editing in Lightroom. You only need a smartphone to start!',
      resourceLink: 'https://www.creativelive.com/photography-for-beginners', resource: 'https://www.creativelive.com/photography-for-beginners', timestamp: Date.now() - 28800000
    },
  ];

  if (posts.length === 0) {
    posts = demoPosts;
    savePosts();
  } else {
    let updated = false;
    posts.forEach(p => {
      if (p.id && p.id.startsWith('demo_')) {
        const matchingDemo = demoPosts.find(d => d.id === p.id);
        if (matchingDemo && !getPostResourceLink(p)) {
          p.resourceLink = matchingDemo.resourceLink;
          p.resource = matchingDemo.resource;
          updated = true;
        }
        normalizePostResource(p);
      }
    });
    if (updated) {
      savePosts();
    }
  }
}

// ═══ CLOSE DROPDOWNS ON OUTSIDE CLICK ═══
document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown-wrap')) {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
  }
});

// ═══ SKILL CARD CLICK DELEGATION ═══
document.addEventListener('click', e => {
  // Don't intercept clicks on links inside cards
  if (e.target.closest('a[href]')) return;
  const card = e.target.closest('.skill-card[data-post-id]');
  if (!card) return;
  const postId = card.getAttribute('data-post-id');
  const post = posts.find(p => p.id === postId);
  if (post) openSkillModal(post);
});

// ═══ KEYBOARD SHORTCUTS ═══
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    if (document.getElementById('command-palette-modal')?.classList.contains('hidden')) {
      showCommandPalette();
    } else {
      hideCommandPalette();
    }
  }
  if (e.key === 'Escape') {
    closeAllModals();
    document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
  }
});

// ═══ INIT ═══
function initializeApp() {
  loadPosts();
  seedDemoData();
  loadPosts(); // reload after seed (in case seed ran)

  // Theme
  const savedTheme = localStorage.getItem(LS.theme) || 'light';
  const isDark = savedTheme === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : savedTheme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.classList.toggle('light', !isDark);
  const themeIcon = document.getElementById('theme-icon');
  if (themeIcon) themeIcon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';

  // Auto-login if session exists
  const savedUser = readText(LS.currentUser, '');
  if (savedUser) {
    const users = getUsers();
    const accessBlock = savedUser === 'admin' ? null : isUserAccessBlocked(savedUser);
    if (savedUser !== 'admin' && !users[savedUser]) {
      removeKey(LS.currentUser);
      showAuth();
      switchAuth('user');
    } else if (accessBlock) {
      removeKey(LS.currentUser);
      showAuth();
      switchAuth('user');
      setTimeout(() => showToast(accessBlock, 'error'), 200);
    } else {
      currentUserId = savedUser;
      hideAuth();
      updateUserDisplay();
    }
  } else {
    // Ensure password field is hidden on initial load (User Access tab)
    switchAuth('user');
  }

  // Show admin nav if admin is logged in BEFORE deciding where to navigate
  if (isAdmin()) {
    adminUIUserMode = false;
    renderAdminNavItem();
    // Apply admin UI visibility: hide user nav items & search bar
    applyAdminUIModeVisibility();
    navigateTo('admin');
  } else {
    renderHome();
    updateMobileBottomNavVisibility();
  }

  setTimeout(() => showToast('Welcome to SkillX!'), 900);
  if (!localStorage.getItem('lbn_onboarding_done')) {
    setTimeout(() => showOnboarding(), 1200);
  }
  registerServiceWorker();
}

Object.assign(window, {
  showAuth,
  hideAuth,
  switchAuth,
  handleAuth,
  togglePassword,
  switchToAdminPanel,
  switchToUserInterface,
  logout,
  navigateTo,
  openSidebar,
  closeSidebar,
  toggleTheme,
  setTheme,
  renderHome,
  openSkillModal,
  openSkillModalById,
  renderBrowse,
  filterByCategory,
  switchBrowseTab,
  setBrowseSort,
  resetBrowseFilters,
  renderMatches,
  refreshMatches,
  renderMyPosts,
  setPostType,
  toggleDropdown,
  selectOption,
  handlePostSubmit,
  closeAllModals,
  lockBodyScroll,
  closeSkillModal,
  updateSkillModalActions,
  toggleBookmarkFromModal,
  renderBookmarks,
  openReportModalFromSkill,
  hideReportModal,
  renderOnboardingStep,
  showOnboarding,
  hideOnboarding,
  nextOnboardingStep,
  prevOnboardingStep,
  showCommandPalette,
  hideCommandPalette,
  renderCommandPalette,
  runCommand,
  showToast,
  submitReport,
  blockUser,
  blockCurrentSkillUser,
  showSettingsModal,
  hideSettingsModal,
  showProfileModal,
  hideProfileModal,
  hideSuccessModal,
  deletePost,
  deleteAccount,
  clearAllData,
  performGlobalSearch,
  renderAdminNavItem,
  adminNavigateTo,
  renderAdminDashboard,
  renderAdminUsers,
  adminBanUser,
  adminUnbanUser,
  adminSuspendUser,
  adminUnsuspendUser,
  adminDeleteUser,
  renderAdminPosts,
  adminDeletePost,
  adminToggleFeatured,
  adminToggleSpam,
  renderAdminReports,
  adminSetReportStatus,
  adminDismissReport,
  adminTakeActionReport,
  clearAllReports,
  renderAdminAnalytics,
  resetAnalytics,
  clearAllAdminData,
  showAdminConfirm,
  hideAdminConfirm,
  proceedAdminConfirm,
  hideAdminReportModal,
  clearAdminLogs,
  toggleAdminSetting,
  exportAdminData,
});

document.addEventListener('DOMContentLoaded', initializeApp);

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const isLocalDevHost = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
  if (isLocalDevHost) {
    navigator.serviceWorker.getRegistrations()
      .then(regs => Promise.all(regs.map(r => r.unregister())))
      .then(() => caches.keys())
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .catch(() => { });
    return;
  }
  navigator.serviceWorker.register('./service-worker.js')
    .then(reg => reg.update())
    .catch(() => { });
}