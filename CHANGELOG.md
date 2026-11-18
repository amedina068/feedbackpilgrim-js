# Changelog

All notable changes to this project are in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

### Added

- `FeedbackPilgrim` client with `baseUrl`, `token`, `timeout`, `maxRetries` and a custom `fetch`.
- `init()` for `POST /api/public/v1/init`. It returns `{}` when the app sends `[]`.
- Resources for the REST API: `posts`, `releaseNotes`, `contacts`, `testimonials` and `tags`.
- `testimonials.approve()` to set `approved_at`.
- `identityHash()` and `normalizeEmail()` for the `user_hash` of the widget.
- `verifyWebhook()` and `verifyWebhookSignature()` for the `X-FeedbackPilgrim-Signature-V2` header, with a tolerance of 300 seconds by default. `verifyWebhook()` gives the delivery ID.
- `PagePromise` for lists: `await` one page, or `for await` each item.
- Typed errors with a `code` for each case: authentication, authorization, not found, method not allowed, validation, rate limit, server, connection, timeout and webhook verification.
- Retries with exponential backoff and jitter. The SDK obeys `Retry-After` and does not retry a request that is not idempotent.
- `AbortSignal` support on each call.
- ESM and CommonJS builds with types for both.
