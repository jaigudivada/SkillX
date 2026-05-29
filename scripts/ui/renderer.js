import { state, categories } from '../state/appState.js';
import { readJson, STORAGE_KEYS, writeJson } from '../storage/localStorageStore.js';
import { anonName, escapeHtml, relativeTime } from '../utils/format.js';
import { showToast } from './toast.js';

function getVisiblePosts() {
  const blocked = readJson(STORAGE_KEYS.blockedUsers, {});
  const blockedByCurrent = blocked[state.currentUserId] || {};
  return state.posts.filter((post) => !blockedByCurrent[post.userId]);
}

function skillCardHTML(post) {
  const isOffer = post.type === 'offer';
  const popularity = Math.max(1, Math.round(100 / Math.max(1, (Date.now() - post.timestamp) / 3600000)));
  const tags = (post.tags || []).slice(0, 3).map((tag) => `<span class="premium-chip">${escapeHtml(tag)}</span>`).join('');

  return `
    <div class="skill-card p-5" onclick="openSkillModal(${escapeHtml(JSON.stringify(post))})">
      <div class="flex items-center justify-between mb-4">
        <span class="badge ${isOffer ? 'badge-offer' : 'badge-seek'}">${isOffer ? 'OFFER' : 'SEEK'}</span>
        <span class="text-xs" style="color:var(--ink-4);">${relativeTime(post.timestamp)}</span>
      </div>
      <h3 class="font-semibold text-sm leading-snug mb-1" style="color:var(--ink-1);">${escapeHtml(post.skill)}</h3>
      <div class="text-xs mb-3" style="color:var(--ink-4);">${escapeHtml(post.category)} · ${escapeHtml(post.level)}</div>
      <p class="text-xs line-clamp-3" style="color:var(--ink-3); line-height:1.6;">${escapeHtml(post.description)}</p>
      <div class="flex flex-wrap gap-1.5 mt-2">${tags}</div>
      <div class="flex items-center justify-between mt-4 pt-4" style="border-top:3px solid var(--line-dim);">
        <span class="text-xs font-mono" style="color:var(--ink-4);">${anonName(post.userId, state.currentUserId)}</span>
        <div class="flex items-center gap-2">
          ${post.resourceLink && post.resourceLink.trim() !== '' ? `
            <a href="${escapeHtml(post.resourceLink.trim())}" target="_blank" rel="noopener noreferrer" 
               class="btn-open-link text-3xs font-black uppercase tracking-wider py-1 px-2.5 rounded-lg flex items-center gap-1"
               onclick="event.stopPropagation();"
               style="background:var(--blue-soft); color:var(--blue); border:2px solid var(--line-thick); box-shadow:2px 2px 0 var(--line-thick); transition: transform 0.1s ease, box-shadow 0.1s ease;">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Link
            </a>
          ` : ''}
          <span class="badge badge-featured">★ ${popularity}</span>
        </div>
      </div>
    </div>`;
}

function renderTrendingAndRecommended() {
  const visiblePosts = getVisiblePosts();
  const trending = document.getElementById('trending-skills');
  const recommended = document.getElementById('recommended-skills');
  if (!trending || !recommended) return;

  const ranked = visiblePosts
    .map((post) => {
      const freshness = Math.max(1, (Date.now() - post.timestamp) / 3600000);
      const reportPenalty = readJson(STORAGE_KEYS.reports, []).filter((report) => report.targetId === post.id && report.status === 'pending').length * 5;
      const score = Math.round(((post._featured ? 20 : 0) + (post.tags?.length || 0) * 2 + 40 / freshness) - reportPenalty);
      return { ...post, score };
    })
    .sort((a, b) => b.score - a.score);

  const top = ranked.slice(0, 5);
  trending.innerHTML = top.length
    ? top.map((post) => `<div class="flex items-center justify-between text-xs"><span style="color:var(--ink-2);">${escapeHtml(post.skill)}</span><span class="badge badge-featured">🔥 ${post.score}</span></div>`).join('')
    : '<div class="text-xs" style="color:var(--ink-4);">No trending data yet.</div>';

  const mine = visiblePosts.filter((post) => post.userId === state.currentUserId);
  const myCats = new Set(mine.map((post) => post.category));
  const recs = ranked.filter((post) => post.userId !== state.currentUserId && (myCats.has(post.category) || post.type === 'offer')).slice(0, 5);
  recommended.innerHTML = recs.length
    ? recs.map((post) => `<div class="flex items-center justify-between text-xs"><span style="color:var(--ink-2);">${escapeHtml(post.skill)}</span><button class="premium-chip" onclick="openSkillModalById('${post.id}')">View</button></div>`).join('')
    : '<div class="text-xs" style="color:var(--ink-4);">Post more skills to improve recommendations.</div>';
}

function renderHome() {
  const visiblePosts = getVisiblePosts();
  const offers = visiblePosts.filter((post) => post.type === 'offer').length;
  const seeks = visiblePosts.filter((post) => post.type === 'seek').length;

  const statOffers = document.getElementById('stat-offers');
  const statSeeks = document.getElementById('stat-seeks');
  const statPosts = document.getElementById('stat-posts');
  const statUsers = document.getElementById('stat-users');

  if (statOffers) statOffers.textContent = String(offers);
  if (statSeeks) statSeeks.textContent = String(seeks);
  if (statPosts) statPosts.textContent = String(visiblePosts.length);
  if (statUsers) statUsers.textContent = (1800 + visiblePosts.length * 3).toLocaleString();

  const grid = document.getElementById('featured-grid');
  const empty = document.getElementById('featured-empty');
  if (!grid || !empty) return;

  if (visiblePosts.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = visiblePosts.slice(0, 8).map((post) => skillCardHTML(post)).join('');
  renderTrendingAndRecommended();
}

function renderCategoryFilters() {
  const container = document.getElementById('category-filters');
  if (!container) return;
  const visiblePosts = getVisiblePosts();
  const allCount = visiblePosts.length;

  container.innerHTML = [`
    <button class="cat-btn ${!state.activeCategoryFilter ? 'active' : ''}" onclick="filterByCategory(null)">
      <span>All</span><span class="count-pill">${allCount}</span>
    </button>`
  ].concat(categories.map((category) => {
    const count = visiblePosts.filter((post) => post.category === category).length;
    return `<button class="cat-btn ${state.activeCategoryFilter === category ? 'active' : ''}" onclick="filterByCategory('${escapeHtml(category)}')">
      <span>${escapeHtml(category)}</span><span class="count-pill">${count}</span>
    </button>`;
  })).join('');
}

function filterByCategory(category) {
  state.activeCategoryFilter = category || null;
  renderCategoryFilters();
  renderBrowseGrid();
}

function setBrowseSort(mode) {
  state.browseSortMode = mode;
  ['recent', 'popular', 'match'].forEach((key) => {
    document.getElementById(`sort-${key}`)?.classList.toggle('active', key === mode);
  });
  renderBrowseGrid();
}

function switchBrowseTab(tab) {
  state.currentBrowseTab = tab;
  document.getElementById('tab-offers')?.classList.toggle('active', tab === 0);
  document.getElementById('tab-seeks')?.classList.toggle('active', tab === 1);
  renderBrowseGrid();
}

function resetBrowseFilters() {
  state.activeCategoryFilter = null;
  state.browseSortMode = 'recent';
  renderCategoryFilters();
  setBrowseSort('recent');
}

function renderBrowseGrid() {
  const container = document.getElementById('browse-grid');
  const empty = document.getElementById('browse-empty');
  const skeleton = document.getElementById('browse-skeleton');
  if (!container || !empty) return;

  if (skeleton) skeleton.classList.remove('hidden');

  let filtered = state.activeCategoryFilter
    ? getVisiblePosts().filter((post) => post.category === state.activeCategoryFilter)
    : getVisiblePosts();

  const display = state.currentBrowseTab === 0
    ? filtered.filter((post) => post.type === 'offer')
    : filtered.filter((post) => post.type === 'seek');

  if (state.browseSortMode === 'popular') display.sort((a, b) => (b.tags?.length || 0) - (a.tags?.length || 0));
  if (state.browseSortMode === 'match') {
    const myCats = new Set(state.posts.filter((post) => post.userId === state.currentUserId).map((post) => post.category));
    display.sort((a, b) => Number(myCats.has(b.category)) - Number(myCats.has(a.category)));
  }
  if (state.browseSortMode === 'recent') display.sort((a, b) => b.timestamp - a.timestamp);

  if (display.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    if (skeleton) skeleton.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  container.innerHTML = display.map((post) => skillCardHTML(post)).join('');
  if (skeleton) skeleton.classList.add('hidden');
}

function renderBrowse() {
  renderCategoryFilters();
  renderBrowseGrid();
}

function renderMatches() {
  const container = document.getElementById('matches-container');
  const empty = document.getElementById('matches-empty');
  if (!container || !empty) return;

  const visiblePosts = getVisiblePosts();
  const mySeeks = visiblePosts.filter((post) => post.userId === state.currentUserId && post.type === 'seek');
  const myOffers = visiblePosts.filter((post) => post.userId === state.currentUserId && post.type === 'offer');
  const matches = [];

  mySeeks.forEach((seek) => {
    visiblePosts.filter((post) => post.type === 'offer' && post.userId !== state.currentUserId && post.category === seek.category).slice(0, 2).forEach((offer) => matches.push({ seek, offer }));
  });
  myOffers.forEach((offer) => {
    visiblePosts.filter((post) => post.type === 'seek' && post.userId !== state.currentUserId && post.category === offer.category).slice(0, 2).forEach((seek) => matches.push({ offer, seek }));
  });

  const uniqueMatches = matches.slice(0, 10);
  const badge = document.getElementById('match-count-badge');
  if (badge) badge.textContent = String(uniqueMatches.length);

  if (uniqueMatches.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  container.innerHTML = uniqueMatches.map(({ seek, offer }) => {
    const primary = seek || offer;
    const partner = offer || seek;
    return `
      <div class="match-card">
        <div class="flex items-start gap-4">
          <div class="text-3xl flex-shrink-0">🔄</div>
          <div class="flex-1 min-w-0">
            <div class="text-xs font-bold mb-1.5" style="color:var(--accent); letter-spacing:0.08em;">SKILL MATCH</div>
            <h3 class="font-semibold text-sm" style="color:var(--ink-1);">${escapeHtml(primary.skill)}</h3>
            <p class="text-xs mt-1" style="color:var(--ink-3);">
              ${anonName(partner.userId, state.currentUserId)} ${partner.type === 'offer' ? 'offers' : 'seeks'}
              <strong style="color:var(--ink-1);">${escapeHtml(partner.skill)}</strong>
            </p>
          </div>
        </div>
      </div>`;
  }).join('');
}

function renderBookmarks() {
  const grid = document.getElementById('bookmarks-grid');
  const empty = document.getElementById('bookmarks-empty');
  if (!grid || !empty) return;

  const bookmarks = readJson(STORAGE_KEYS.bookmarks, {});
  const ids = Object.keys(bookmarks[state.currentUserId] || {});
  const savedPosts = state.posts.filter((post) => ids.includes(post.id));

  if (!savedPosts.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = savedPosts.map((post) => skillCardHTML(post)).join('');
}

function renderMyPosts() {
  const mine = state.posts.filter((post) => post.userId === state.currentUserId);
  const offers = mine.filter((post) => post.type === 'offer');
  const seeks = mine.filter((post) => post.type === 'seek');

  const myCard = (post) => `
    <div class="chunky-card" style="padding:16px;">
      <div class="flex items-start justify-between gap-2 mb-2">
        <h4 class="font-semibold text-sm leading-snug" style="color:var(--ink-1);">${escapeHtml(post.skill)}</h4>
        <span class="badge ${post.type === 'offer' ? 'badge-offer' : 'badge-seek'} flex-shrink-0">${post.type.toUpperCase()}</span>
      </div>
      <div class="text-xs mb-2" style="color:var(--ink-4);">${escapeHtml(post.category)} · ${escapeHtml(post.level)}</div>
      <p class="text-xs line-clamp-2 mb-3" style="color:var(--ink-3); line-height:1.55;">${escapeHtml(post.description)}</p>
      <button onclick="deletePost('${post.id}')" class="w-full py-1.5 text-xs rounded-lg transition-colors" style="border:3px solid var(--danger-dim); color:var(--danger); background:transparent; cursor:pointer;">
        <i class="fa-solid fa-trash-can mr-1"></i> Delete
      </button>
    </div>`;

  const offersList = document.getElementById('my-offers-list');
  const seeksList = document.getElementById('my-seeks-list');
  if (offersList) {
    offersList.innerHTML = offers.length
      ? offers.map((post) => myCard(post)).join('')
      : '<div class="text-center py-10" style="color:var(--ink-4);"><i class="fa-solid fa-hand-holding-heart text-2xl mb-3 block opacity-30"></i><p class="text-xs font-medium">No offers yet</p></div>';
  }

  if (seeksList) {
    seeksList.innerHTML = seeks.length
      ? seeks.map((post) => myCard(post)).join('')
      : '<div class="text-center py-10" style="color:var(--ink-4);"><i class="fa-solid fa-lightbulb text-2xl mb-3 block opacity-30"></i><p class="text-xs font-medium">No seeks yet</p></div>';
  }

  const profileOffersCount = document.getElementById('profile-offers-count');
  const profileSeeksCount = document.getElementById('profile-seeks-count');
  if (profileOffersCount) profileOffersCount.textContent = String(offers.length);
  if (profileSeeksCount) profileSeeksCount.textContent = String(seeks.length);
}

function performGlobalSearch() {
  const input = document.getElementById('global-search');
  if (!input) return;

  const query = input.value.toLowerCase().trim();
  if (!query) return;

  state.activeCategoryFilter = null;
  window.navigateTo('browse');

  setTimeout(() => {
    const container = document.getElementById('browse-grid');
    const empty = document.getElementById('browse-empty');
    if (!container || !empty) return;

    const results = getVisiblePosts().filter((post) =>
      post.skill.toLowerCase().includes(query) ||
      post.category.toLowerCase().includes(query) ||
      post.description.toLowerCase().includes(query) ||
      (post.tags || []).join(' ').toLowerCase().includes(query)
    );

    if (results.length === 0) {
      container.innerHTML = '';
      empty.classList.remove('hidden');
      const label = empty.querySelector('p');
      if (label) label.textContent = `No results for "${query}"`;
      return;
    }

    empty.classList.add('hidden');
    container.innerHTML = results.map((post) => skillCardHTML(post)).join('');
    showToast(`${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"`);
  }, 50);
}

export {
  renderHome,
  renderBrowse,
  renderMatches,
  renderBookmarks,
  renderMyPosts,
  performGlobalSearch,
  skillCardHTML,
  filterByCategory,
  setBrowseSort,
  switchBrowseTab,
  resetBrowseFilters,
  renderTrendingAndRecommended,
  getVisiblePosts,
};
