# Spotify Web API — integration rules

> Reference for any Spotify Web API work in Funūn (esp. the Breakthrough
> Benchmarking data source — see docs/breakthrough-benchmarking.md). Follow
> these rules; they come straight from Spotify's developer guidance.

## Source of truth
- **OpenAPI spec:** https://developer.spotify.com/reference/web-api/open-api-schema.yaml
  — use it for ALL endpoint paths, parameters, and response schemas.
  **Do not guess endpoints or field names.**

## Authorization
- **User data → Authorization Code with PKCE**
  (https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow).
  If there's a secure backend, plain **Authorization Code**
  (https://developer.spotify.com/documentation/web-api/tutorials/code-flow) is
  also fine.
- **Public, non-user data only → Client Credentials.**
- **Never use Implicit Grant** (deprecated).

## Redirect URIs
- Always **HTTPS** (except `http://127.0.0.1` for local dev).
- **Never** `http://localhost` and **never** wildcard URIs.
- Reqs: https://developer.spotify.com/documentation/web-api/concepts/redirect_uri

## Scopes
- Request only the **minimum scopes** needed for the feature being built.
  Don't request broad scopes preemptively.
- https://developer.spotify.com/documentation/web-api/concepts/scopes

## Tokens
- Store tokens **securely**. **Never** expose the Client Secret in client-side code.
- Implement **refresh-token** logic
  (https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens);
  re-run authorization when a refresh token expires.

## Rate limits
- On **HTTP 429**: exponential backoff + respect the **`Retry-After`** header.
  Never retry immediately or in tight loops.

## Deprecated endpoints — avoid
- Prefer **`/playlists/{id}/items`** over `/playlists/{id}/tracks`.
- Use **`/me/library`** over the type-specific library endpoints.

## Error handling
- Handle all HTTP error codes documented in the OpenAPI schema; surface the
  returned error message to the user as meaningful feedback.

## Developer Terms of Service (https://developer.spotify.com/terms)
- Don't cache Spotify content beyond what's needed for immediate use.
- Always **attribute** content to Spotify.
- **Do not use the API to train ML models on Spotify data.**
  ⚠️ Relevant to Benchmarking: the aggregated-dataset / "moat" work must be built
  from artists' *own* exported/authorized metrics and Funūn-derived data — **not**
  by training on or warehousing Spotify content in violation of these terms.
