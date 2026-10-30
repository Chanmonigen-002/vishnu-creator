# ADR-0007: YouTube Publish via User-Configured OAuth Credentials and Bilingual Khmer/English Metadata Kit

- **Status:** Accepted
- **Date:** 2026-10-30
- **Deciders:** project owner

## Context

Task `T6.3` in Phase 6 requires a YouTube publish step with OAuth authentication and bilingual Khmer + English title, description, and tags (`D3` in `master-plan.md`). Because Vishnu Creator is distributed as a local-first open-source application, shipping a hardcoded Google Cloud OAuth 2.0 `client_secret` in the repository or desktop binary would violate security rules (`AGENTS.md`) and Google API terms.

## Decision

1. **Bring-Your-Own-OAuth (BYOK) Credentials**: Users supply their own Google Cloud OAuth 2.0 credentials (`clientId`, `clientSecret`, and `refreshToken`, or a pre-issued `accessToken`). Credentials are never hardcoded or logged.
2. **Bilingual Khmer + English Metadata Kit (`youtube_publish_kit`)**: Every YouTube publish run produces a structured JSON and Markdown publish kit containing natural spoken Khmer (`km`, no inter-word spaces, proper `។` punctuation) and English (`en`) titles, descriptions with chapter timestamps, hashtags, and YouTube tags, respecting YouTube Data API v3 limits (title ≤ 100 characters, description ≤ 5,000 bytes, total tags ≤ 500 characters).
3. **Official YouTube Data API v3 Resumable Upload**: When OAuth credentials and `uploadToYoutube: true` are provided, the publisher exchanges the refresh token at `https://oauth2.googleapis.com/token`, initiates a resumable upload session at `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` (defaulting `privacyStatus` to `'private'` so videos are never published publicly by accident), streams the video file, and optionally sets the custom thumbnail (`thumbnails/set`). When credentials are missing and live upload is requested, the executor fails honestly with `creator_youtube_oauth_missing` without faking an upload ID.

## Consequences

- Unblocks and completes `T6.3` (Phase 6 reaches 9/9 Done).
- Creators can generate ready-to-copy bilingual Khmer + English YouTube metadata kits offline, and perform direct resumable uploads to YouTube when their Google OAuth 2.0 credentials are configured.
- No OAuth secrets are bundled in the repository or desktop installer.

## Alternatives considered

- **Bundling a shared Google OAuth Client ID and Secret in the desktop binary**: Rejected because desktop binaries can be decompiled and `AGENTS.md` strictly prohibits hardcoded keys.
- **Browser-automation upload via Playwright**: Rejected as fragile and against YouTube terms of service compared to the official YouTube Data API v3 resumable upload protocol.
