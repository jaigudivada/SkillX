import { state } from '../state/appState.js';
import { readJson, STORAGE_KEYS, writeJson, removeKey } from '../storage/localStorageStore.js';
import { escapeHtml, relativeTime } from '../utils/format.js';
import { showToast } from './toast.js';

function getReports() { return readJson(STORAGE_KEYS.reports, []); }
function saveReports(reports) { return writeJson(STORAGE_KEYS.reports, reports); }
function getAdminLogs() { return readJson(STORAGE_KEYS.adminLogs, []); }
function saveAdminLogs(logs) { return writeJson(STORAGE_KEYS.adminLogs, logs); }
function getBannedUsers() { return readJson(STORAGE_KEYS.bannedUsers, {}); }
function saveBannedUsers(users) { return writeJson(STORAGE_KEYS.bannedUsers, users); }
function getSuspendedUsers() { return readJson(STORAGE_KEYS.suspendedUsers, {}); }
function saveSuspendedUsers(users) { return writeJson(STORAGE_KEYS.suspendedUsers, users); }
function getAdminSettings() { return readJson(STORAGE_KEYS.adminSettings, { maintenanceMode: false, registrationsEnabled: true }); }
function saveAdminSettings(settings) { return writeJson(STORAGE_KEYS.adminSettings, settings); }

function logAdminAction(action, details, affectedUser = null, affectedPost = null) {
  const logs = getAdminLogs();
  logs.unshift({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    action,
    details,
    adminUser: 'admin',
    affectedUser,
    affectedPost,
    timestamp: Date.now(),
  });
  saveAdminLogs(logs);
}

function renderAdminDashboard() {
  const users = readJson(STORAGE_KEYS.users, {});
  const userKeys = Object.keys(users).filter((user) => user !== 'admin');
  const banned = getBannedUsers();
  const reports = getReports();
  const pendingReports = reports.filter((report) => report.status === 'pending');
  const handledReports = reports.filter((report) => report.status !== 'pending');
  const logs = getAdminLogs();

  const statUsers = document.getElementById('admin-stat-users');
  const statPosts = document.getElementById('admin-stat-posts');
  const statReports = document.getElementById('admin-stat-reports');
  const statBanned = document.getElementById('admin-stat-banned');
  const statHandled = document.getElementById('admin-stat-reports-handled');
  const statActive = document.getElementById('admin-stat-active');
  const statMatches = document.getElementById('admin-stat-matches');

  if (statUsers) statUsers.textContent = String(userKeys.length);
  if (statPosts) statPosts.textContent = String(state.posts.length);
  if (statReports) statReports.textContent = String(pendingReports.length);
  if (statBanned) statBanned.textContent = String(Object.keys(banned).length);
  if (statHandled) statHandled.textContent = String(handledReports.length);

  const activeUsers = new Set(state.posts.map((post) => post.userId).filter((userId) => userId && userId !== 'admin'));
  if (statActive) statActive.textContent = String(activeUsers.size);
  if (statMatches) statMatches.textContent = String(activeUsers.size);

  const overview = document.getElementById('admin-overview-list');
  if (overview) {
    overview.innerHTML = `
      <div class="flex justify-between"><span>Registered Users</span><strong style="color:var(--blue);">${userKeys.length}</strong></div>
      <div class="flex justify-between"><span>Total Skills Posted</span><strong style="color:var(--green);">${state.posts.length}</strong></div>
      <div class="flex justify-between"><span>Admin Actions Logged</span><strong style="color:var(--orange);">${logs.length}</strong></div>
      <div class="flex justify-between"><span>Pending Reports</span><strong style="color:${pendingReports.length > 0 ? 'var(--danger)' : 'var(--green)'};">${pendingReports.length}</strong></div>
    `;
  }

  const counts = {};
  state.posts.forEach((post) => {
    counts[post.category] = (counts[post.category] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const maxCount = sorted.length > 0 ? sorted[0][1] : 1;
  const container = document.getElementById('admin-top-categories');
  if (container) {
    const palette = ['var(--blue)', 'var(--green)', 'var(--pink)', 'var(--orange)', 'var(--yellow)', 'var(--purple)', 'var(--red)'];
    container.innerHTML = sorted.length === 0
      ? '<div class="text-xs" style="color:var(--ink-4);">No posts yet.</div>'
      : sorted.map(([category, count], index) => `
          <div class="admin-cat-bar-wrap">
            <span class="admin-cat-bar-label">${escapeHtml(category)}</span>
            <div class="admin-cat-bar">
              <div class="admin-cat-bar-fill" style="width:${(count / maxCount) * 100}%; background:${palette[index % palette.length]};"></div>
            </div>
            <span class="text-xs font-bold" style="color:var(--ink-3); min-width:24px;">${count}</span>
          </div>`).join('');
  }
}

function renderAdminUsers() {
  const users = readJson(STORAGE_KEYS.users, {});
  const banned = getBannedUsers();
  const suspended = getSuspendedUsers();
  const query = (document.getElementById('admin-user-search')?.value || '').toLowerCase();
  const tbody = document.getElementById('admin-users-tbody');
  const empty = document.getElementById('admin-users-empty');

  let userList = Object.keys(users).filter((user) => user !== 'admin');
  if (query) userList = userList.filter((user) => user.toLowerCase().includes(query));

  if (userList.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }

  if (empty) empty.classList.add('hidden');
  tbody.innerHTML = userList.map((user) => {
    const isBanned = banned[user];
    const isSuspended = suspended[user];
    let status = 'Active';
    let statusClass = 'admin-badge-active';
    if (isBanned) { status = 'Banned'; statusClass = 'admin-badge-banned'; }
    else if (isSuspended) { status = 'Suspended'; statusClass = 'admin-badge-suspended'; }

    const userPosts = state.posts.filter((post) => post.userId === user).length;
    const joined = users[user]?.joined ? new Date(users[user].joined).toLocaleDateString() : 'Unknown';

    return `
      <tr>
        <td><span class="font-bold text-xs" style="color:var(--ink-1);">${escapeHtml(user)}</span></td>
        <td><span class="admin-badge ${statusClass}">${status}</span></td>
        <td><span class="admin-badge ${user === 'admin' ? 'admin-badge-admin' : 'admin-badge-user'}">${user === 'admin' ? 'Admin' : 'User'}</span></td>
        <td><span class="text-xs font-bold" style="color:var(--ink-3);">${userPosts}</span></td>
        <td><span class="text-xs" style="color:var(--ink-4);">${joined}</span></td>
        <td>
          <div class="flex gap-1 flex-wrap">
            ${!isBanned ? `<button class="admin-action-btn admin-action-btn-ban" onclick="adminBanUser('${escapeHtml(user)}')">Ban</button>` : `<button class="admin-action-btn admin-action-btn-ok" onclick="adminUnbanUser('${escapeHtml(user)}')">Unban</button>`}
            ${!isSuspended ? `<button class="admin-action-btn admin-action-btn-suspend" onclick="adminSuspendUser('${escapeHtml(user)}')">Suspend</button>` : `<button class="admin-action-btn admin-action-btn-ok" onclick="adminUnsuspendUser('${escapeHtml(user)}')">Unsuspend</button>`}
            <button class="admin-action-btn admin-action-btn-delete" onclick="adminDeleteUser('${escapeHtml(user)}')">Delete</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function renderAdminPosts() {
  const tbody = document.getElementById('admin-posts-tbody');
  const empty = document.getElementById('admin-posts-empty');
  const reports = getReports();
  const filter = document.getElementById('admin-post-filter')?.value || 'all';
  const query = (document.getElementById('admin-post-search')?.value || '').toLowerCase();

  let filtered = state.posts;
  if (filter !== 'all') filtered = filtered.filter((post) => post.type === filter);
  if (query) filtered = filtered.filter((post) => post.skill.toLowerCase().includes(query) || post.userId.toLowerCase().includes(query) || post.category.toLowerCase().includes(query));

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }

  if (empty) empty.classList.add('hidden');
  tbody.innerHTML = filtered.map((post) => {
    const reportCount = reports.filter((report) => report.type === 'skill' && report.targetId === post.id && report.status === 'pending').length;
    const isFeatured = post._featured;
    const isSpam = post._spam;

    let statusText = 'Normal';
    let statusClass = 'admin-badge-normal';
    if (isFeatured) { statusText = 'Featured'; statusClass = 'admin-badge-featured'; }
    if (isSpam) { statusText = 'Spam'; statusClass = 'admin-badge-spam'; }

    return `
      <tr>
        <td><span class="text-xs font-semibold" style="color:var(--ink-1);">${escapeHtml(post.skill)}</span></td>
        <td><span class="admin-badge ${post.type === 'offer' ? 'admin-badge-active' : 'admin-badge-normal'}">${post.type.toUpperCase()}</span></td>
        <td><span class="text-xs" style="color:var(--ink-3);">${escapeHtml(post.userId)}</span></td>
        <td><span class="text-xs" style="color:var(--ink-4);">${escapeHtml(post.category)}</span></td>
        <td><span class="text-xs font-bold" style="color:${reportCount > 0 ? 'var(--danger)' : 'var(--ink-4)'};">${reportCount}</span></td>
        <td><span class="admin-badge ${statusClass}">${statusText}</span></td>
        <td>
          <div class="flex gap-1 flex-wrap">
            <button class="admin-action-btn admin-action-btn-delete" onclick="adminDeletePost('${post.id}')">Delete</button>
            <button class="admin-action-btn admin-action-btn-warn" onclick="adminToggleFeatured('${post.id}')">${isFeatured ? 'Unfeature' : 'Feature'}</button>
            <button class="admin-action-btn ${isSpam ? 'admin-action-btn-ok' : 'admin-action-btn-ban'}" onclick="adminToggleSpam('${post.id}')">${isSpam ? 'Not Spam' : 'Spam'}</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function renderAdminReports() {
  const container = document.getElementById('admin-reports-container');
  const empty = document.getElementById('admin-reports-empty');
  const filter = document.getElementById('admin-report-filter')?.value || 'pending';
  const reports = getReports().filter((report) => filter === 'all' ? true : report.status === filter).sort((a, b) => Number(a.priority === 'high' ? -1 : 1) || b.timestamp - a.timestamp);
  const badge = document.getElementById('admin-reports-count-badge');
  if (badge) badge.textContent = String(reports.length);

  if (reports.length === 0) {
    if (container) container.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }

  if (empty) empty.classList.add('hidden');
  if (container) {
    container.innerHTML = reports.map((report) => {
      const palette = {
        user: { bg: 'var(--orange-soft)', border: 'var(--orange)', icon: 'fa-user' },
        skill: { bg: 'var(--yellow-soft)', border: 'var(--yellow)', icon: 'fa-newspaper' },
        chat: { bg: 'var(--pink-soft)', border: 'var(--pink)', icon: 'fa-comment-dots' }
      };
      const tone = palette[report.type] || palette.user;
      return `
        <div class="admin-report-card" style="border-left:4px solid ${tone.border};">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="admin-badge" style="background:${tone.bg}; color:${tone.border}; border-color:${tone.border};">${report.type.toUpperCase()}</span>
              <span class="text-2xs font-semibold" style="color:var(--ink-4);">${relativeTime(report.timestamp)} · ${escapeHtml(report.status)}</span>
            </div>
            <div class="text-xs font-semibold mb-1" style="color:var(--ink-1);">Target: ${escapeHtml(report.targetName || report.targetId)}</div>
            <div class="text-xs" style="color:var(--ink-3);">Reported by: ${escapeHtml(report.reportedBy)}</div>
            <div class="text-xs mt-1" style="color:var(--ink-4);">Reason: "${escapeHtml(report.reason)}"</div>
          </div>
          <div class="flex gap-1.5 flex-shrink-0">
            ${report.status === 'pending' ? `<button class="admin-action-btn admin-action-btn-suspend" onclick="adminSetReportStatus('${report.id}','investigating')">Investigate</button>` : ''}
            <button class="admin-action-btn admin-action-btn-warn" onclick="adminDismissReport('${report.id}')">Dismiss</button>
            <button class="admin-action-btn admin-action-btn-ban" onclick="adminTakeActionReport('${report.id}')">Take Action</button>
          </div>
        </div>`;
    }).join('');
  }
}

function renderAdminAnalytics() {
  const users = readJson(STORAGE_KEYS.users, {});
  const userKeys = Object.keys(users).filter((user) => user !== 'admin');
  const banned = getBannedUsers();
  const reports = getReports();

  const engagement = document.getElementById('admin-analytics-engagement');
  if (engagement) {
    engagement.innerHTML = `
      <div class="flex justify-between"><span>Total Posts</span><strong style="color:var(--green);">${state.posts.length}</strong></div>
      <div class="flex justify-between"><span>Reports Filed</span><strong style="color:${reports.length > 0 ? 'var(--orange)' : 'var(--green)'};">${reports.length}</strong></div>`;
  }

  const catCounts = {};
  state.posts.forEach((post) => {
    catCounts[post.category] = (catCounts[post.category] || 0) + 1;
  });
  const sorted = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  const maxCount = sorted.length > 0 ? sorted[0][1] : 1;
  const categoriesEl = document.getElementById('admin-analytics-categories');
  if (categoriesEl) {
    const palette = ['var(--blue)', 'var(--green)', 'var(--pink)', 'var(--orange)', 'var(--yellow)', 'var(--purple)', 'var(--red)'];
    categoriesEl.innerHTML = sorted.length === 0
      ? '<div class="text-xs" style="color:var(--ink-4);">No data yet.</div>'
      : sorted.map(([category, count], index) => `
          <div class="admin-cat-bar-wrap">
            <span class="admin-cat-bar-label" style="min-width:100px;">${escapeHtml(category)}</span>
            <div class="admin-cat-bar">
              <div class="admin-cat-bar-fill" style="width:${(count / maxCount) * 100}%; background:${palette[index % palette.length]};"></div>
            </div>
            <span class="text-xs font-bold" style="color:var(--ink-3); min-width:20px;">${count}</span>
          </div>`).join('');
  }

  const usersEl = document.getElementById('admin-analytics-users');
  if (usersEl) {
    const offerCount = state.posts.filter((post) => post.type === 'offer').length;
    const seekCount = state.posts.filter((post) => post.type === 'seek').length;
    usersEl.innerHTML = `
      <div class="flex justify-between"><span>Registered Users</span><strong style="color:var(--blue);">${userKeys.length}</strong></div>
      <div class="flex justify-between"><span>Banned Users</span><strong style="color:var(--danger);">${Object.keys(banned).length}</strong></div>
      <div class="flex justify-between"><span>Offers / Seeks Ratio</span><strong style="color:var(--ink-3);">${offerCount}:${seekCount}</strong></div>
      <div class="flex justify-between"><span>Posts per User (avg)</span><strong style="color:var(--ink-3);">${userKeys.length > 0 ? (state.posts.length / userKeys.length).toFixed(1) : 0}</strong></div>`;
  }

  const contentEl = document.getElementById('admin-analytics-content');
  if (contentEl) {
    const levelCounts = {};
    state.posts.forEach((post) => {
      levelCounts[post.level] = (levelCounts[post.level] || 0) + 1;
    });
    const levels = Object.entries(levelCounts).sort((a, b) => b[1] - a[1]);
    contentEl.innerHTML = `
      <div class="flex justify-between"><span>Offers to Teach</span><strong style="color:var(--blue);">${state.posts.filter((post) => post.type === 'offer').length}</strong></div>
      <div class="flex justify-between"><span>Requests to Learn</span><strong style="color:var(--green);">${state.posts.filter((post) => post.type === 'seek').length}</strong></div>
      <div class="flex justify-between"><span>Total Categories</span><strong style="color:var(--purple);">${Object.keys(catCounts).length}</strong></div>
      <div class="flex justify-between"><span>Most Posts by Level</span><strong style="color:var(--ink-3);">${levels.length > 0 ? escapeHtml(levels[0][0]) : 'N/A'}</strong></div>`;
  }

  const chart = document.getElementById('admin-kpi-chart');
  if (chart) {
    const pending = reports.filter((report) => report.status === 'pending').length;
    const resolved = reports.filter((report) => report.status === 'resolved').length;
    const stats = [
      { label: 'Users', value: userKeys.length },
      { label: 'Posts', value: state.posts.length },
      { label: 'Pending', value: pending },
      { label: 'Resolved', value: resolved }
    ];
    const max = Math.max(1, ...stats.map((stat) => stat.value));
    chart.innerHTML = stats.map((stat) => `
      <div class="mini-chart-row">
        <span class="text-xs" style="color:var(--ink-3);">${stat.label}</span>
        <div class="mini-chart-bar"><span class="mini-chart-fill" style="width:${(stat.value / max) * 100}%;"></span></div>
        <span class="text-xs font-bold" style="color:var(--ink-2);">${stat.value}</span>
      </div>`).join('');
  }

  const timeline = document.getElementById('admin-timeline');
  if (timeline) {
    const logs = getAdminLogs().slice(0, 8);
    timeline.innerHTML = logs.length
      ? logs.map((log) => `<div class="flex items-center justify-between rounded-xl px-3 py-2" style="background:var(--paper-2); border:1px solid var(--line-dim);"><span style="color:var(--ink-3);">${escapeHtml(log.details)}</span><span style="color:var(--ink-4);">${relativeTime(log.timestamp)}</span></div>`).join('')
      : '<div class="text-xs" style="color:var(--ink-4);">No moderation history yet.</div>';
  }
}

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
  tbody.innerHTML = logs.slice(0, 100).map((log) => {
    const actionClass = {
      ban: 'admin-log-action-ban', unban: 'admin-log-action-ok', suspend: 'admin-log-action-mod', unsuspend: 'admin-log-action-ok',
      delete_user: 'admin-log-action-delete', delete_post: 'admin-log-action-delete', feature: 'admin-log-action-ok', unfeature: 'admin-log-action-mod',
      mark_spam: 'admin-log-action-mod', unmark_spam: 'admin-log-action-ok', dismiss: 'admin-log-action-ok', resolve: 'admin-log-action-ok'
    }[log.action] || 'admin-log-action-ok';

    return `
      <tr class="admin-log-row">
        <td class="text-2xs" style="color:var(--ink-4); white-space:nowrap;">${new Date(log.timestamp).toLocaleString()}</td>
        <td><span class="admin-log-action ${actionClass}">${escapeHtml(log.action.replace(/_/g, ' '))}</span></td>
        <td class="text-xs" style="color:var(--ink-3);">${escapeHtml(log.details)}</td>
        <td class="text-xs" style="color:var(--ink-4);">${log.affectedUser ? escapeHtml(log.affectedUser) : '—'}</td>
      </tr>`;
  }).join('');
}

function renderAdminSettings() {
  const settings = getAdminSettings();
  const maintenance = document.getElementById('admin-toggle-maintenance');
  const registrations = document.getElementById('admin-toggle-registrations');
  if (maintenance) {
    maintenance.textContent = settings.maintenanceMode ? 'ON' : 'OFF';
    maintenance.className = 'admin-toggle-btn' + (settings.maintenanceMode ? ' admin-toggle-on' : '');
  }
  if (registrations) {
    registrations.textContent = settings.registrationsEnabled ? 'ON' : 'OFF';
    registrations.className = 'admin-toggle-btn' + (settings.registrationsEnabled ? ' admin-toggle-on' : '');
  }
}

function adminBanUser(username) {
  const banned = getBannedUsers();
  banned[username] = true;
  saveBannedUsers(banned);
  const suspended = getSuspendedUsers();
  delete suspended[username];
  saveSuspendedUsers(suspended);
  logAdminAction('ban', `Banned user: ${username}`, username);
  renderAdminUsers();
  renderAdminDashboard();
  showToast(`User "${username}" banned.`);
}

function adminUnbanUser(username) {
  const banned = getBannedUsers();
  delete banned[username];
  saveBannedUsers(banned);
  logAdminAction('unban', `Unbanned user: ${username}`, username);
  renderAdminUsers();
  renderAdminDashboard();
  showToast(`User "${username}" unbanned.`);
}

function adminSuspendUser(username) {
  const suspended = getSuspendedUsers();
  suspended[username] = { reason: 'Suspended by admin', timestamp: Date.now(), suspendedBy: 'admin' };
  saveSuspendedUsers(suspended);
  logAdminAction('suspend', `Suspended user: ${username}`, username);
  renderAdminUsers();
  renderAdminDashboard();
  showToast(`User "${username}" suspended.`);
}

function adminUnsuspendUser(username) {
  const suspended = getSuspendedUsers();
  delete suspended[username];
  saveSuspendedUsers(suspended);
  logAdminAction('unsuspend', `Unsuspended user: ${username}`, username);
  renderAdminUsers();
  showToast(`User "${username}" unsuspended.`);
}

function adminDeleteUser(username) {
  const users = readJson(STORAGE_KEYS.users, {});
  delete users[username];
  writeJson(STORAGE_KEYS.users, users);
  state.posts = state.posts.filter((post) => post.userId !== username);
  writeJson(STORAGE_KEYS.posts, state.posts);
  const banned = getBannedUsers();
  delete banned[username];
  saveBannedUsers(banned);
  const suspended = getSuspendedUsers();
  delete suspended[username];
  saveSuspendedUsers(suspended);
  logAdminAction('delete_user', `Deleted user: ${username}`, username);
  renderAdminUsers();
  renderAdminDashboard();
  showToast(`User "${username}" deleted.`);
}

function adminDeletePost(postId) {
  const post = state.posts.find((entry) => entry.id === postId);
  state.posts = state.posts.filter((entry) => entry.id !== postId);
  writeJson(STORAGE_KEYS.posts, state.posts);
  logAdminAction('delete_post', `Deleted post: "${post?.skill || 'unknown'}"`, post?.userId || null, postId);
  renderAdminPosts();
  renderAdminDashboard();
  showToast('Post deleted.');
}

function adminToggleFeatured(postId) {
  const post = state.posts.find((entry) => entry.id === postId);
  if (!post) return;
  post._featured = !post._featured;
  writeJson(STORAGE_KEYS.posts, state.posts);
  logAdminAction(post._featured ? 'feature' : 'unfeature', `${post._featured ? 'Featured' : 'Unfeatured'} post: "${post.skill}"`, post.userId, postId);
  renderAdminPosts();
  showToast(post._featured ? 'Post featured!' : 'Post unfeatured.');
}

function adminToggleSpam(postId) {
  const post = state.posts.find((entry) => entry.id === postId);
  if (!post) return;
  post._spam = !post._spam;
  writeJson(STORAGE_KEYS.posts, state.posts);
  logAdminAction(post._spam ? 'mark_spam' : 'unmark_spam', `${post._spam ? 'Marked as spam' : 'Removed spam flag'}: "${post.skill}"`, post.userId, postId);
  renderAdminPosts();
  showToast(post._spam ? 'Post marked as spam.' : 'Spam flag removed.');
}

function adminSetReportStatus(reportId, status) {
  const reports = getReports();
  const report = reports.find((entry) => entry.id === reportId);
  if (!report) return;
  report.status = status;
  report.reviewedAt = Date.now();
  saveReports(reports);
  logAdminAction('report_status', `Set report ${report.id} to ${status}`, report.targetId);
  renderAdminReports();
  showToast(`Report marked as ${status}.`);
}

function adminDismissReport(reportId) {
  const reports = getReports();
  const report = reports.find((entry) => entry.id === reportId);
  if (!report) return;
  report.status = 'dismissed';
  saveReports(reports);
  logAdminAction('dismiss', `Dismissed report: ${report.reason}`, report.targetId);
  renderAdminReports();
  renderAdminDashboard();
  showToast('Report dismissed.');
}

function adminTakeActionReport(reportId) {
  const reports = getReports();
  const report = reports.find((entry) => entry.id === reportId);
  if (!report) return;
  report.status = 'resolved';
  saveReports(reports);
  logAdminAction('resolve', `Resolved report: ${report.reason}`, report.targetId);

  if (report.type === 'user') {
    const banned = getBannedUsers();
    banned[report.targetId] = true;
    saveBannedUsers(banned);
  }

  if (report.type === 'skill') {
    state.posts = state.posts.filter((post) => post.id !== report.targetId);
    writeJson(STORAGE_KEYS.posts, state.posts);
  }

  renderAdminReports();
  renderAdminDashboard();
  renderAdminPosts();
  renderAdminUsers();
  showToast('Action taken. Report resolved.');
}

function toggleAdminSetting(key) {
  const settings = getAdminSettings();
  settings[key] = !settings[key];
  saveAdminSettings(settings);
  renderAdminSettings();
  logAdminAction('settings', `Toggled ${key} to ${settings[key]}`);
  showToast(`${key} set to ${settings[key] ? 'enabled' : 'disabled'}.`);
}

function clearAdminLogs() {
  saveAdminLogs([]);
  renderAdminLogs();
  showToast('Logs cleared.');
}

function exportAdminData() {
  const data = {
    users: readJson(STORAGE_KEYS.users, {}),
    posts: state.posts,
    reports: getReports(),
    logs: getAdminLogs(),
    banned: getBannedUsers(),
    suspended: getSuspendedUsers(),
    settings: getAdminSettings(),
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `SkillX_Admin_Export_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('Data exported!');
}

function resetAnalytics() {
  saveAdminLogs([]);
  removeKey(STORAGE_KEYS.reports);
  renderAdminDashboard();
  renderAdminLogs();
  renderAdminAnalytics();
  showToast('Analytics reset.');
}

function clearAllAdminData() {
  removeKey(STORAGE_KEYS.reports);
  removeKey(STORAGE_KEYS.adminLogs);
  removeKey(STORAGE_KEYS.bannedUsers);
  removeKey(STORAGE_KEYS.suspendedUsers);
  removeKey(STORAGE_KEYS.adminSettings);
  renderAdminDashboard();
  renderAdminLogs();
  renderAdminAnalytics();
  renderAdminSettings();
  showToast('All admin data cleared.');
}

export {
  renderAdminDashboard,
  renderAdminUsers,
  renderAdminPosts,
  renderAdminReports,
  renderAdminAnalytics,
  renderAdminLogs,
  renderAdminSettings,
  adminBanUser,
  adminUnbanUser,
  adminSuspendUser,
  adminUnsuspendUser,
  adminDeleteUser,
  adminDeletePost,
  adminToggleFeatured,
  adminToggleSpam,
  adminSetReportStatus,
  adminDismissReport,
  adminTakeActionReport,
  toggleAdminSetting,
  clearAdminLogs,
  exportAdminData,
  resetAnalytics,
  clearAllAdminData,
};
