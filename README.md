# Follow Sync: Your GitHub Network Manager

![Follow Sync Preview](/public/imgs/preview.jpg)

**Follow Sync** is a modern GitHub network manager designed for power users. It helps you discover non-mutual connections, identify "ghost" accounts, and analyze your network efficiently.

## Features

- **Comprehensive Network Analysis:** Get a clear picture of who you follow that doesn't follow you back, and vice-versa.
- **Ghost Account Detection & Removal:** Identify "ghost" connections—deleted or suspended accounts that still linger in your following list. Ghosts are detected for free by diffing GitHub's GraphQL following list (which still lists them) against the REST list (which drops them), and can be removed in one click via the REST unfollow endpoint—even though they no longer resolve on GitHub.
- **Organization Awareness:** Organizations you follow are surfaced with a badge and excluded from non-mutual analysis (they can't follow you back). GitHub's GraphQL API omits organizations entirely, so they are recovered from the REST API.
- **Single-Click Follow/Unfollow:** Manage your network directly from the Follow Sync interface with optimistic UI updates for a seamless experience.
- **Adaptive Caching:** Utilizes your own GitHub Gists as a database, with an intelligent caching mechanism to respect GitHub's API rate limits while keeping your data fresh.
- **Secure & Private:** All your network data is stored in a private Gist that you own. Follow Sync never stores your data on its servers.
- **Bulk Actions:** Select a page or every matching account and follow/unfollow/remove them sequentially, after a confirmation, with progress tracking and a Cancel button. Failed accounts are listed when the run ends.
- **Rate-Limit Aware:** GitHub's `Retry-After` / `X-RateLimit-*` headers are honored. Short throttles pause syncs and bulk actions; long ones stop them cleanly with a "try again in N minutes" message instead of a pile of errors.
- **Search, Sort & Export:** Filter every list by login or name, sort by followers/following/name, and export the current view as CSV (spreadsheet-safe) or JSON.
- **Undo:** Single follow/unfollow actions can be undone from the confirmation toast.
- **Ignore List:** Mark accounts you never want suggested (from a card's ⋯ menu or Settings). Ignored accounts are hidden from the One-Way lists by default and never bulk-selected. Stored in your cache gist.
- **Changes Since Last Sync:** After a refresh, a dismissible summary shows new followers, who unfollowed you, and follows changed outside the app.
- **Filters:** Hide organizations or ignored accounts in any list.
- **Guided Start:** A short, dismissible tour explains each dashboard tab on your first visit.
- **Large Networks:** The cache uses a compact format (~3-4x smaller than plain JSON) and is read past the Gist API's 1 MB inline limit, so networks with tens of thousands of connections load from cache instead of re-syncing.
- **Customizable Settings:** Tailor your experience with settings for pagination, avatar display, and cache lifetime.

## Technology Stack

- **Framework:** [Next.js](https://nextjs.org/) 15+ (App Router)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **State Management:** [TanStack Query (React Query)](https://tanstack.com/query/latest) for server state and [Zustand](https://github.com/pmndrs/zustand) for client state.
- **Authentication:** [NextAuth.js](https://next-auth.js.org/) with GitHub OAuth
- **API:** [GitHub GraphQL](https://docs.github.com/en/graphql) + [REST](https://docs.github.com/en/rest) APIs, proxied server-side
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Hosting:** [Vercel](https://vercel.com/)

## Architecture Overview

Follow Sync employs a **GitHub-as-Infrastructure** architecture, leveraging GitHub's own systems for authentication, data, and persistence — while keeping your access token server-side.

1. **Authentication:** You authorize the Follow Sync GitHub OAuth App, granting it limited, user-scoped permissions (`read:user user:follow gist`).
2. **Data Fetching (server-proxied):** The browser never holds your GitHub token. It calls same-origin proxy routes (`/api/gh/graphql` and `/api/gh/rest/*`) that inject the access token server-side and forward to GitHub's GraphQL and REST APIs. The REST following/followers lists are diffed against GraphQL to recover organizations and detect ghosts.
3. **Analysis & Caching:** The data is analyzed client-side to find non-mutuals. The results are stored in a private GitHub Gist owned by you, which acts as a cache for subsequent loads.
4. **UI:** The interface loads from the Gist cache and triggers background refreshes based on the age and size of your network data.

## Project Status & Roadmap

This project is currently in active development.

- [x] **Phase 1:** Authentication & App Shell
- [x] **Phase 2:** Core Data Pipeline (GraphQL)
- [x] **Phase 3:** Adaptive Gist Caching
- [x] **Phase 4:** Ghost-Detection Pipeline
- [x] **Phase 5:** Follow/Unfollow Operations
- [x] **Phase 6:** UI/UX Polish & Onboarding
- [x] **Phase 7:** Performance Improvements & Testing
- [x] **Phase 8:** User Settings

## Scripts

| Command          | What it does                                       |
| ---------------- | -------------------------------------------------- |
| `pnpm dev`       | Start the dev server (Turbopack) on port 3000      |
| `pnpm build`     | Production build (`AUTH_SECRET` must be set)       |
| `pnpm start`     | Serve the production build                         |
| `pnpm lint`      | ESLint (Next.js + TanStack Query rules)            |
| `pnpm typecheck` | `tsc --noEmit`                                     |
| `pnpm test`      | Vitest (unit + hook tests, jsdom where needed)     |
| `pnpm format`    | Prettier write (`pnpm format:check` to verify, CI) |
| `pnpm codegen`   | Regenerate GraphQL types (needs `GITHUB_PAT`)      |

## Getting Started for Local Development

To run this project locally, you first need to create and configure a GitHub OAuth App.

### 1. Create a GitHub OAuth App

1. Go to **Settings** > **Developer settings** > **OAuth Apps** and click **New OAuth App**.
2. Fill in the required application details:
   - **Application name:** `Follow Sync (local)`
   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** `http://localhost:3000/api/auth/callback/github`
3. Click **Register application**.
4. On the next page, generate a **client secret** and copy it.

### 2. Configure Environment Variables

Create a file named `.env.local` in the project root. You will need the **Client ID** and the **Client secret** from your GitHub App settings page.

```bash
# .env.local

# Get these from your GitHub App page
AUTH_GITHUB_ID="YOUR_CLIENT_ID"
AUTH_GITHUB_SECRET="YOUR_CLIENT_SECRET"

# A random string for signing tokens.
# You can generate one with: openssl rand -hex 32
AUTH_SECRET="YOUR_AUTH_SECRET"

# Personal Access Token (only for `pnpm codegen`, not used at runtime)
GITHUB_PAT="YOUR_GITHUB_PAT"

# Public domain used for canonical URLs, Open Graph, sitemap and robots.
# Optional: falls back to Vercel's VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL,
# then to http://localhost:3000.
NEXT_PUBLIC_DOMAIN="follow-sync.vercel.app"
```

Nothing else is configured server-side: there is no database. Your network
cache lives in a secret gist in your own GitHub account (keyed by your login);
signing out clears the app's account-scoped browser storage.

### 3. Install Dependencies & Run

Once your `.env.local` file is configured, you can install the dependencies and start the development server.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
