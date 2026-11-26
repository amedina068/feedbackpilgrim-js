# Changelog

All notable changes to this project are in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

This change breaks the install on Node.js 20:

- Node.js 22.12 or later is required. Node.js 20 reached end of life in April 2026.

## [0.1.0] - 2026-11-25

### Added

- `FeedbackPilgrim` client with `baseUrl`, `token`, `timeout`, `maxRetries` and a custom `fetch`.
- `signInUrl()` for `POST /api/public/v1/init`. It returns `null` when the app sends `[]`.
- Resources for the REST API: `posts`, `releaseNotes`, `contacts`, `testimonials` and `tags`.
- `testimonials.approve()` to set `approved_at`.
- `identityHash()` and `normalizeEmail()` for the `user_hash` of the widget.
- `verifyWebhook()` and `verifyWebhookSignature()` for the `X-FeedbackPilgrim-Signature-V2` header, with a tolerance of 300 seconds by default. `verifyWebhook()` gives the delivery ID.
- `PagePromise` for lists: `await` one page, or `for await` each item.
- Typed errors with a `code` for each case: authentication, authorization, not found, method not allowed, validation, rate limit, server, connection, timeout and webhook verification.
- Retries with exponential backoff and jitter. The SDK obeys `Retry-After` and does not retry a request that is not idempotent.
- `AbortSignal` support on each call.
- The MIT license: `LICENSE` and `"license": "MIT"` in `package.json`.
- A `prepare` script that builds `dist/`. `npm install github:amedina068/feedbackpilgrim-js` now installs working code.

### Changed

The SDK now behaves the same as the PHP, Python and Ruby SDKs. These changes break code that uses version 0.1.0 from git:

- `init()` is now `signInUrl({ email, name, mrr, ltv, avatar, customFields })`. It returns the link as a string, or `null` when the app sends no link. Before, it returned `{ auth_url }` or `{}`.
- `verifyWebhook()` accepts a delivery without the `X-FeedbackPilgrim-Delivery` header. `deliveryId` is then `null`. Before, the SDK threw the reason `delivery`.
- `verifyWebhook()` returns `type` in place of `event`, and adds `payload` (the decoded body).
- `verifyWebhook()` throws the reason `payload` when the body is not a JSON object after a valid signature. Before, it threw a `SyntaxError`. The reason `delivery` is gone.
- The SDK retries a request that is not idempotent only after a connection error before the send: a DNS failure, a refused connection or a connect timeout. `ConnectionError.beforeSend` marks these errors. Before, the list also had an unreachable host or network and a Bun socket error. Now the list is the same in the 4 SDKs.
- The SDK reads an HTTP date in `Retry-After` on a 5xx, as it does on a 429.
- ESM and CommonJS builds with types for both.
