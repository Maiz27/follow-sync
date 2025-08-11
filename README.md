# FollowSync: Your GitHub Network Manager

**FollowSync** is a modern GitHub network manager designed for power users. It helps you discover non-mutual connections, identify "ghost" accounts, and analyze your network efficiently.

## Features

- **Comprehensive Network Analysis:** Get a clear picture of who you follow that doesn't follow you back, and vice-versa.
- **Ghost Account Detection:** Identify "ghost" connections—accounts that have been deleted or suspended but still appear in your network lists. This provides a more accurate understanding of your active network, as these connections cannot be removed through the API.
- **Single-Click Follow/Unfollow:** Manage your network directly from the FollowSync interface with optimistic UI updates for a seamless experience.
- **Adaptive Caching:** Utilizes your own GitHub Gists as a database, with an intelligent caching mechanism to respect GitHub's API rate limits while keeping your data fresh.
- **Secure & Private:** All your network data is stored in a private Gist that you own. FollowSync never stores your data on its servers.
- **Bulk Actions:** (Coming Soon) Perform follow and unfollow operations on multiple users at once.

## Technology Stack

- **Framework:** [Next.js](https://nextjs.org/) 15+ (App Router)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **State Management:** [TanStack Query (React Query)](https://tanstack.com/query/latest)
- **Authentication:** [NextAuth.js](https://next-auth.js.org/) with GitHub App OAuth
- **API:** [GitHub GraphQL API](https://docs.github.com/en/graphql)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Hosting:** [Vercel](https://vercel.com/)

## Architecture Overview

FollowSync employs a **client-heavy, GitHub-as-Infrastructure** architecture. It leverages GitHub's own systems for authentication, data fetching, and even data persistence.

1. **Authentication:** You install the FollowSync GitHub App, granting it limited, user-scoped permissions.
2. **Data Fetching:** The app calls the GitHub GraphQL API to fetch your follower and following lists.
3. **Analysis & Caching:** The data is analyzed in the client to find non-mutuals. The results are then stored in a private GitHub Gist owned by you. This Gist acts as a cache for all subsequent loads.
4. **UI:** The interface is built with React Server Components and loads instantly from the Gist cache, triggering background refreshes based on the age and size of your network data.

## Project Status & Roadmap

This project is currently in active development.

- [x] **Phase 1:** Authentication & App Shell
- [x] **Phase 2:** Core Data Pipeline (GraphQL)
- [x] **Phase 3:** Adaptive Gist Caching
- [x] **Phase 4:** Ghost-Detection Pipeline
- [ ] **Phase 5:** Follow/Unfollow Operations
- [ ] **Phase 6:** UI Components & Polish
- [ ] **Phase 7:** Performance, Monitoring & Testing

## Getting Started for Local Development

To run this project locally, you first need to create and configure a GitHub App.

### 1. Create a GitHub App

1. Go to **Settings** > **Developer settings** > **GitHub Apps** and click **New GitHub App**.
2. Fill in the required application details:
   - **Homepage URL:** `http://localhost:3000`
   - **Callback URL:** `http://localhost:3000/api/auth/callback/github`
3. Under **Permissions**, go to **Account permissions** and set the following:
   - **Followers:** `Read and write`
   - **Gists:** `Read and write`
4. Create the app. On the next page, generate a **client secret** and copy it.

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
yarn install
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
