# FollowSync: Your GitHub Network Manager

![FollowSync Preview](/public/imgs/preview.jpg)

**FollowSync** is a modern GitHub network manager designed for power users. It helps you discover non-mutual connections, identify "ghost" accounts, and analyze your network efficiently.

## Features

- **Comprehensive Network Analysis:** Get a clear picture of who you follow that doesn't follow you back, and vice-versa.
- **Ghost Account Detection:** Identify "ghost" connections—accounts that have been deleted or suspended but still appear in your network lists. This provides a more accurate understanding of your active network, as these connections cannot be removed through the API.
- **Single-Click Follow/Unfollow:** Manage your network directly from the FollowSync interface with optimistic UI updates for a seamless experience.
- **Adaptive Caching:** Utilizes your own GitHub Gists as a database, with an intelligent caching mechanism to respect GitHub's API rate limits while keeping your data fresh.
- **Secure & Private:** All your network data is stored in a private Gist that you own. FollowSync never stores your data on its servers.
- **Bulk Actions:** Select multiple users and perform follow/unfollow operations on them sequentially with progress tracking.
- **Customizable Settings:** Tailor your experience with settings for pagination, avatar display, and more.

## Technology Stack

- **Framework:** [Next.js](https://nextjs.org/) 15+ (App Router)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **State Management:** [TanStack Query (React Query)](https://tanstack.com/query/latest) for server state and [Zustand](https://github.com/pmndrs/zustand) for client state.
- **Authentication:** [NextAuth.js](https://next-auth.js.org/) with GitHub OAuth
- **API:** [GitHub GraphQL API](https://docs.github.com/en/graphql)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Hosting:** [Vercel](https://vercel.com/)

## Architecture Overview

FollowSync employs a **client-heavy, GitHub-as-Infrastructure** architecture. It leverages GitHub's own systems for authentication, data fetching, and even data persistence.

1. **Authentication:** You authorize the FollowSync GitHub OAuth App, granting it limited, user-scoped permissions.
2. **Data Fetching:** The app calls the GitHub GraphQL API to fetch your follower and following lists.
3. **Analysis & Caching:** The data is analyzed in the client to find non-mutuals. The results are then stored in a private GitHub Gist owned by you. This Gist acts as a cache for all subsequent loads.
4. **UI:** The interface is built with React Server Components and loads instantly from the Gist cache, triggering background refreshes based on the age and size of your network data.

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
   - **Application name:** `FollowSync (local)`
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
yarn install
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
See the [LICENSE](LICENSE) file for details.
