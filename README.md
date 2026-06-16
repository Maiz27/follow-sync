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
- **Bulk Actions:** Select multiple users and perform follow/unfollow operations on them sequentially with progress tracking.
- **Customizable Settings:** Tailor your experience with settings for pagination, avatar display, and more.

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

# Personal Access Token (for graphql code generation)
GITHUB_PAT="YOUR_GITHUB_PAT"

# Domain
NEXT_PUBLIC_DOMAIN="follow-sync.vercel.app"
```

### 3. Install Dependencies & Run

Once your `.env.local` file is configured, you can install the dependencies and start the development server.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
