# Privacy Policy

Effective Date: **September 21, 2025**

Follow Sync respects your privacy. This policy explains what data we access, how it is used, and your rights.

## Data Access

- We use GitHub OAuth to authenticate you.
- With your consent, the app is granted access to:
  - Your followers and following lists.
  - Permission to create and update a GitHub Gist in your account for caching your network data.

## Data Storage

- Follow Sync does **not** run its own database or servers.
- All network analysis data is stored in a private GitHub Gist owned by you.
- No personal data is stored on Follow Sync infrastructure. Requests to GitHub pass through Follow Sync's serverless API routes, which forward them without logging or keeping their contents.

## Data Usage

- Fetched data is used to calculate:
  - Non-mutual followers and following.
  - Ghost or unavailable accounts.
  - Network statistics and analysis.
- Your GitHub token is kept in an encrypted, httpOnly session cookie that browser scripts cannot read; only Follow Sync's API routes decrypt it to call GitHub on your behalf, over HTTPS. The session lasts up to 30 days of inactivity, and signing out removes it.

## Third-Party Services

- GitHub is the only third-party service involved.
- Follow Sync interacts with GitHub APIs and Gists to function.

## User Control

- You may revoke GitHub OAuth permissions at any time from your GitHub settings.
- You may delete the GitHub Gist used for caching at any time.
- Removing permissions or deleting the cache fully erases your data from Follow Sync.

## Contact

For privacy-related inquiries, contact: [magedfaiz98@gmail.com](mailto:magedfaiz98@gmail.com).
