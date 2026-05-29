# SkillX — Anonymous Skill Exchange

**SkillX** is a client-side web app for college students to share what they can teach (**offers**) and what they want to learn (**seeks**) without exposing real names. Usernames are pseudonymous, posts use anonymous display labels, and all data stays in the browser via **localStorage**—no backend or account email required.

---

## Table of contents

- [What SkillX does](#what-skillx-does)
- [Features](#features)
- [How the website was built](#how-the-website-was-built)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [How to use SkillX](#how-to-use-skillx)
- [Admin panel](#admin-panel)
- [Matching system](#matching-system)
- [Data & privacy](#data--privacy)
- [Development](#development)
- [Browser support](#browser-support)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [License](#license)

---

## What SkillX does

SkillX helps peers discover complementary skills on campus:

1. **Post** an offer (“I can teach Python”) or a seek (“I want to learn UI design”).
2. **Browse** the feed, filter by category, sort by recency or popularity.
3. **Get matched** when your offer/seek shares a category with someone else’s opposite post.
4. **Bookmark**, **report**, and **block** content to keep your feed useful and safe.

Everything runs in the browser. Refreshing the page keeps your session and posts on the same device (same browser profile).

---

## Features

| Area | Capability |
|------|------------|
| **Authentication** | Username-only login for users (no password). Separate admin login with password. |
| **Skill posts** | Offer or seek, with title, description, level, category, format, optional tags, optional resource link. |
| **Browse** | Tabs for offers vs seeks, category chips, sort (recent / popular). |
| **Matches** | Automatic pairing when your posts align by category with others’ opposite type. |
| **Saved skills** | Bookmark posts from the skill detail modal. |
| **Moderation (user)** | Report posts, block users from your feed. |
| **Admin** | Dashboard, user/post management, reports, analytics, audit logs, platform settings. |
| **UX** | Light/dark theme, onboarding tour, command palette, toast notifications, mobile sidebar & bottom nav. |
| **PWA** | Web app manifest + service worker for offline-friendly static assets. |
| **Demo content** | Eight sample posts seed automatically on first visit. |

---

## How the website was built

### Architecture

SkillX is a **single-page application (SPA)** with no React/Vue/Angular and **no server**:

```
┌─────────────────────────────────────────────────────────┐
│  index.html          All pages, modals, layout (HTML)   │
├─────────────────────────────────────────────────────────┤
│  dist/tailwind-output.css   Utility classes (built)     │
│  styles/main.css            Design tokens & components  │
├─────────────────────────────────────────────────────────┤
│  scripts/main.js     App logic (ES modules, ~2400 LOC)  │
│  scripts/storage/    localStorage read/write helpers    │
│  scripts/ui/         Theme, toasts, shared UI bits      │
├─────────────────────────────────────────────────────────┤
│  Browser localStorage   Posts, users, session, settings │
└─────────────────────────────────────────────────────────┘
```

On load, `scripts/main.js` bootstraps the app: loads posts, seeds demo data if empty, restores theme and session, registers the service worker, and wires global functions onto `window` for inline `onclick` handlers in HTML.

### Tech stack

| Layer | Technology |
|-------|------------|
| **Markup** | Semantic HTML5 in `index.html` |
| **Styling** | [Tailwind CSS v3](https://tailwindcss.com/) (CLI build) + custom CSS variables in `styles/main.css` |
| **Scripting** | Vanilla JavaScript (ES modules) |
| **Icons** | Font Awesome (bundled locally under `fontawesome/`) |
| **Fonts** | Plus Jakarta Sans & Space Grotesk (local under `assets/fonts/`) |
| **Persistence** | `localStorage` via `scripts/storage/localStorageStore.js` |
| **Dev server** | [live-server](https://www.npmjs.com/package/live-server) |
| **Offline** | `service-worker.js` + `manifest.webmanifest` |

### Design approach

- **“Chunky” tactile UI**: thick borders, soft shadows, and CSS custom properties (`--ink-1`, `--accent`, etc.) for consistent light/dark theming.
- **Progressive enhancement**: works by opening `index.html` directly; live-server and PWA features are optional.
- **Modular JS where it helps**: storage keys, theme, and toasts are split into small modules; most UI and admin logic lives in `main.js` for simplicity.

### Build pipeline (CSS only)

Tailwind scans `index.html` (see `tailwind.config.js`) and compiles `src/tailwind-input.css` into `dist/tailwind-output.css`. JavaScript is **not** bundled—you edit modules and refresh the browser.

```bash
npm run build:css   # one-off compile
npm run watch       # recompile on change
```

---

## Project structure

```
SkillX/
├── index.html                 # Main app shell, auth screen, all views & modals
├── manifest.webmanifest       # PWA metadata
├── service-worker.js          # Static asset caching
├── package.json               # npm scripts & devDependencies
├── tailwind.config.js         # Tailwind content paths & theme extensions
├── src/
│   └── tailwind-input.css     # @tailwind directives (source for CSS build)
├── dist/
│   └── tailwind-output.css    # Generated Tailwind (committed / used at runtime)
├── styles/
│   └── main.css               # Component styles, variables, animations
├── scripts/
│   ├── main.js                # Core application logic
│   ├── storage/
│   │   └── localStorageStore.js
│   ├── state/
│   │   └── appState.js        # Shared state constants (used by some UI modules)
│   ├── ui/
│   │   ├── theme.js
│   │   ├── toast.js
│   │   ├── admin.js           # Supplementary admin helpers
│   │   └── renderer.js
│   └── utils/
│       └── format.js
├── assets/
│   ├── images/                # Logo, etc.
│   └── fonts/                 # Self-hosted web fonts
└── fontawesome/               # Local Font Awesome build
```

---

## Getting started

### Option 1 — Open directly (simplest)

1. Clone or download this repository.
2. Open `index.html` in a modern browser (Chrome, Edge, Firefox, or Safari).

No install required. Tailwind output is already in `dist/tailwind-output.css`.

### Option 2 — Development server (recommended for daily work)

```bash
npm install
npm run dev
```

This starts **live-server** on port **3000** and opens `index.html`. File changes reload automatically.

### Option 3 — Rebuild styles after editing Tailwind classes

If you add new Tailwind classes in HTML, regenerate CSS:

```bash
npm install
npm run build:css
# or, while developing:
npm run watch
```

---

## How to use SkillX

### 1. Sign in as a user

1. Open the app. After the loading screen, you’ll see the **auth** screen.
2. Stay on **User Access** (default tab).
3. Enter any **username** (letters/numbers; avoid using `admin` here).
4. Click **Continue as User**.

- **New username** → account is created automatically (stored locally).
- **Returning username** → same browser profile restores your session.
- **No email or password** for regular users.

Trust badges on the login screen reflect the product goal: no email, pseudonymous use, no third-party tracking in-app.

### 2. First-time tour

A short **onboarding** modal appears once per browser:

1. Post anonymously  
2. Browse and bookmark  
3. Report and block safely  

You can reopen it anytime via the command palette (see [Keyboard shortcuts](#keyboard-shortcuts)).

### 3. Home

- View stats (offers, seeks, matches).
- See **featured** skill cards, **trending** list, and **recommended** skills based on your categories.
- Use the top **search** bar and press **Enter** to jump to Browse with that query.

### 4. Browse skills

- Switch **Offers** / **Seeks** tabs.
- Filter by **category** (Programming, Design, Languages, Academic, Soft Skills, Music & Arts, Other).
- Change **sort** (recent or popular).
- Click a card to open the **skill detail** modal.

### 5. Post a skill

1. Go to **Post a Skill** in the sidebar (or mobile bottom nav).
2. Choose **Offer** (you teach) or **Seek** (you want to learn).
3. Fill in title, description, level, category, format, optional comma-separated **tags**, and optional **resource link** (`http://` or `https://` only).
4. Submit. A success modal confirms the post; it appears in **My Activity** and the public feed.

Banned or suspended users cannot post (set by admin).

### 6. Matches

Open **Matches** to see up to **10** pairings where:

- Your **seek** matches someone else’s **offer** in the same category, or  
- Your **offer** matches someone else’s **seek** in the same category.

Other users appear as anonymous labels like `Anon#2A4E` (derived from the last four characters of their internal id). Use **Refresh** to recompute the list.

### 7. My Activity

View and **delete** your own offers and seeks. Profile stats update from here.

### 8. Saved skills

Bookmark posts from the skill modal (**Saved Skills** in the nav). Remove bookmarks from the same modal or the saved list.

### 9. Skill detail modal actions

From any skill card:

- Open external **resource** link (if provided).
- **Bookmark** / remove bookmark.
- **Report** (spam, harassment, adult content, misleading, other + optional details).
- **Block user** — hides their posts from your feed.

### 10. Settings & profile

- **Settings** (sidebar): theme preference (light / dark / system).
- **Profile** (top bar): view your pseudonym and post counts.

### 11. Log out

**Log Out** clears the current session key; your posts remain in localStorage for that username if you sign in again.

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `Cmd+K` | Open or close **command palette** (quick navigation & actions) |
| `Escape` | Close modals and dropdowns |

Command palette examples: “Go to Browse”, “Toggle Theme”, “Show Onboarding”.

---

## Admin panel

### Login

1. On the auth screen, switch to **Admin Login**.
2. Username: `admin`
3. Default password: `admin123` (created automatically on first admin login attempt)

> **Change the default password** before any real deployment by editing stored user data or extending the app—credentials live in plain text in localStorage.

### Admin capabilities

After login you land in the **Admin Panel** with:

| Section | Purpose |
|---------|---------|
| **Dashboard** | User/post/report counts, category breakdown |
| **Users** | View users, ban, suspend, unban |
| **Skills/Posts** | Review, feature, mark spam, delete posts |
| **Reports** | Resolve pending user reports |
| **Analytics** | Platform activity summaries |
| **Logs** | Audit trail of admin actions |
| **Settings** | Maintenance mode, enable/disable new registrations |

Admins can switch to **User Interface** to use the app as a normal user (sidebar shows both modes).

### Platform settings

- **Maintenance mode** — blocks non-admin user login.
- **Registrations disabled** — existing users can sign in; new usernames cannot register.

---

## Matching system

Matching is **category-based** and **client-side**:

1. Collect your posts (offers and seeks).
2. For each of your seeks, find up to **2** offers from other users in the **same category**.
3. For each of your offers, find up to **2** seeks from other users in the **same category**.
4. Cap the displayed list at **10** matches.

Blocked users and spam-flagged posts are excluded from your visible feed. Matches are suggestions to explore complementary skills—not automatic chat rooms.

---

## Data & privacy

### Where data lives

All persistence is in the browser **`localStorage`** under keys prefixed with `lbn_`:

| Key | Contents |
|-----|----------|
| `lbn_posts` | All skill posts |
| `lbn_users` | User records (including admin password) |
| `lbn_current_user` | Active session username |
| `lbn_theme` | Theme preference |
| `lbn_reports` | User-submitted reports |
| `lbn_admin_logs` | Admin audit log |
| `lbn_banned_users` | Banned usernames |
| `lbn_suspended_users` | Suspended usernames |
| `lbn_admin_settings` | Maintenance & registration flags |
| `lbn_bookmarks` | Per-user bookmarked post IDs |
| `lbn_blocked_users` | Per-user block lists |
| `lbn_onboarding_done` | Onboarding completion flag |

### Privacy notes

- No server means **no central database**—data does not leave the device unless you export it manually (not built in).
- Clearing site data in the browser **deletes all posts and users** for that origin.
- Usernames are **pseudonymous**, not verified identities.
- Resource links open external sites; only `http`/`https` URLs are accepted on posts.

### Security notes

- Do not commit `.env` files or real secrets (see `.gitignore`).
- Admin password is stored **in plain text** in localStorage—suitable for demos/local use only.
- This project is **not** production-hardened; there is no server-side validation or encryption.

---

## Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Start live-server on port 3000 |
| `npm run preview` | Same as `dev` |
| `npm run build` | Alias for `build:css` |
| `npm run build:css` | Compile Tailwind → `dist/tailwind-output.css` |
| `npm run watch` | Watch Tailwind source and rebuild CSS |

### Service worker

`service-worker.js` caches the app shell (HTML, CSS, JS, fonts, manifest) for faster repeat visits. After changing core files, bump `CACHE_NAME` in the service worker or hard-refresh to pick up updates.

### Adding categories or copy

- Categories array: `scripts/main.js` (`categories` constant).
- Demo posts: `seedDemoData()` in the same file.

---

## Browser support

- Chrome / Edge 90+
- Firefox 88+
- Safari 14+

Requires JavaScript, ES modules, and `localStorage`.

---

## Limitations

Understanding these boundaries helps set expectations:

- **Single-device** — data is not synced across phones, laptops, or browsers.
- **No real-time chat** — connect outside the app using resource links or your own channels.
- **No true anonymity against admins** — admins see internal user IDs on posts and reports.
- **Demo / local-first** — no API, no email verification, no password for regular users.
- **User count on home** — “active users” stat includes a decorative baseline for empty states.

---

## Contributing

1. Fork the repository.  
2. Create a feature branch (`git checkout -b feature/my-change`).  
3. Make focused changes; match existing style in `main.js` and `styles/main.css`.  
4. Run `npm run build:css` if you changed Tailwind classes in HTML.  
5. Test in `npm run dev` and by opening `index.html` directly.  
6. Open a pull request with a clear description and test steps.

---

## Deploy on Vercel

SkillX is a static site (HTML + CSS + JS at the repo root). `vercel.json` configures the deploy.

### npm warnings vs real errors

| Log line | Type | Blocks deploy? |
|----------|------|----------------|
| `npm warn deprecated urix`, `opn`, `uuid@3`, … | **Warning** (old transitive deps) | **No** |
| `No Output Directory named "public" found` | **Error** (build/output mismatch) | **Yes** |

SkillX does **not** use `live-server` (the usual source of `urix` / `opn` / `uuid@3` warnings). Vercel runs `npm install --omit=dev`, which installs only Tailwind, PostCSS, and Autoprefixer (~88 packages).

**Do not** add `live-server` to fix warnings — that reintroduces deprecated packages.

### Vercel project settings

| Setting | Value |
|---------|--------|
| **Framework Preset** | Other |
| **Root Directory** | `.` (default) |
| **Build Command** | `npm run build` *(or leave empty — `vercel.json` sets this)* |
| **Output Directory** | `public` |
| **Install Command** | *(leave empty — `vercel.json` sets install)* |

`npm run build` compiles Tailwind, then copies the app into `public/` (see `scripts/prepare-public.cjs`).

**Important:** Turn **off** dashboard overrides that conflict with the table (e.g. Output = `.` while the build writes `public/`).

### Before you deploy

1. Push the **full project** to GitHub (`index.html`, `scripts/`, `dist/`, `assets/`, `fontawesome/`, etc.).
2. Connect the repo at [vercel.com/new](https://vercel.com/new).
3. Redeploy with **Clear build cache** if you still see old `live-server` warnings from a previous deploy.

### If the build fails

- **`tailwindcss: command not found`** — Pull latest `package.json` (Tailwind is in `dependencies`).
- **No Output Directory named "public"** — Ensure `npm run build` runs (creates `public/`). Output Directory must be `public`.
- **Blank page** — Output must be `public`, not `dist`.
- **Only README on GitHub** — `git add .`, commit, `git push`.

---

## License

Copyright © 2026 **Jai Gudivada**. All rights reserved under the [MIT License](LICENSE).

You may use, copy, modify, merge, publish, distribute, sublicense, and sell copies of this software, provided the copyright notice and license text are included in all copies or substantial portions of the Software.

---

**SkillX** — *Share skills anonymously. No names, no bias.*
