# feedbackpilgrim

The TypeScript client for a self-hosted Feedback Pilgrim instance. Feedback Pilgrim keeps the posts, release notes, contacts, testimonials and tags of your product.

One package runs on Node.js, Bun, Deno, Cloudflare Workers and other edge runtimes. The package has no runtime dependencies. It uses the global `fetch` and Web Crypto. It sends no telemetry.

> Status: 0.1.0, not released. The package is not on npm yet.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Resources](#resources)
- [Pagination](#pagination)
- [Identity hash](#identity-hash)
- [Webhooks](#webhooks)
- [Errors](#errors)
- [Retries](#retries)
- [Cancel a call](#cancel-a-call)
- [Framework integration](#framework-integration)
- [Supported runtimes](#supported-runtimes)

## Install

```sh
npm install feedbackpilgrim
```

For Bun, use `bun add feedbackpilgrim`. For Deno, import `npm:feedbackpilgrim`.

## Quick start

```ts
import { FeedbackPilgrim } from "feedbackpilgrim";

const pilgrim = new FeedbackPilgrim({
	baseUrl: "https://feedback.example.com",
	token: process.env.FEEDBACKPILGRIM_TOKEN,
});

const post = await pilgrim.posts.create({
	title: "Add dark mode",
	content: "Please add a dark theme.",
});

for await (const pending of pilgrim.posts.list({ status: "pending" })) {
	console.log(pending.id, pending.title);
}
```

## Configuration

| Option       | Type                               | Default        | Description                                                                                               |
| ------------ | ---------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| `baseUrl`    | `string \| URL`                    | (required)     | The root URL of your instance (its `APP_URL`). Each user runs their own instance, so there is no default. |
| `token`      | `string`                           | (required)     | An API token from **Settings → API Tokens**. The SDK sends it as `Authorization: Bearer`.                 |
| `timeout`    | `number`                           | `30000`        | The time limit for one attempt, in milliseconds.                                                          |
| `maxRetries` | `number`                           | `2`            | The maximum number of retries after the first attempt. Use `0` to stop retries.                           |
| `fetch`      | `(url, init) => Promise<Response>` | global `fetch` | A `fetch` function for tests or a proxy.                                                                  |

Each method also accepts `{ signal, timeout, maxRetries }` as its last argument. These values replace the client values for that call.

The token belongs to one client (one project) of the instance. It has all abilities and does not expire. Keep the token on the server. Do not put the token in a browser bundle.

The SDK sends `Accept: application/json` with each request. Without this header, Laravel sends an error as a redirect to `/login` or as an HTML page.

## Resources

| Property               | Methods                                                | Endpoint                       |
| ---------------------- | ------------------------------------------------------ | ------------------------------ |
| `pilgrim.init()`       | (method)                                               | `/api/public/v1/init`          |
| `pilgrim.posts`        | `list()`, `get()`, `create()`, `update()`              | `/api/public/v1/posts`         |
| `pilgrim.releaseNotes` | `list()`, `get()`, `create()`, `update()`              | `/api/public/v1/release-notes` |
| `pilgrim.contacts`     | `list()`, `get()`, `upsert()`, `update()`              | `/api/public/v1/contacts`      |
| `pilgrim.testimonials` | `list()`, `get()`, `create()`, `update()`, `approve()` | `/api/public/v1/testimonials`  |
| `pilgrim.tags`         | `list()`, `create()`, `update()`, `delete()`           | `/api/public/v1/tags`          |

The request fields and the response fields keep the names of the API (`board_id`, `approved_at`, `sort_by`). Each ID is a positive integer. The SDK throws a `TypeError` for another value, before it sends a request.

Each update uses `PATCH` and changes only the fields that you send. A `tags` list replaces all the tags of the record.

The API has no delete for posts, release notes, contacts and testimonials. It always returns `405` for them, so the SDK does not offer these calls.

### Init

`init()` creates or updates the contact with this email. It returns a sign-in link for the public site. The link is valid for 24 hours. Send it only to that contact.

```ts
const { auth_url } = await pilgrim.init({
	email: "jane@example.com",
	name: "Jane Doe",
	plan: "premium", // a custom field
});
```

The app sends `[]` when the contact has no email. The SDK returns `{}` for it, so `auth_url` is `undefined`.

The widget call `POST /api/v1/init` is not in this SDK. The widget script calls it from the browser with the publishable key. Your server makes only the [identity hash](#identity-hash) for it.

### Posts

```ts
const page = await pilgrim.posts.list({
	status: "in_progress",
	tag: "feature",
	per_page: 50,
});
const post = await pilgrim.posts.get(42);
const created = await pilgrim.posts.create({
	title: "Add dark mode",
	content: "Please add a dark theme.",
	tags: [1],
});
const updated = await pilgrim.posts.update(42, { status: "completed" });
```

The `status` of a post is `pending`, `in_progress` or `completed`. A new status moves the post to the first stage of that type. Then the app sends the same emails, webhooks and Slack message as a stage change in the dashboard.

### Release notes

```ts
const page = await pilgrim.releaseNotes.list({ published: true });
const note = await pilgrim.releaseNotes.get(3);
const created = await pilgrim.releaseNotes.create({
	title: "Version 2.1.0",
	content: "## New\n\n- Dark mode",
	published: true,
});
const draft = await pilgrim.releaseNotes.update(3, { published: false });
```

The content is Markdown. Without `published: true`, a new note is a draft. The user of the API token becomes the author.

### Contacts

```ts
const page = await pilgrim.contacts.list({ search: "jane", sort_by: "mrr" });
const contact = await pilgrim.contacts.get(7);
const saved = await pilgrim.contacts.upsert({
	name: "Jane Smith",
	email: "jane@example.com",
	mrr: 149.99,
	plan: "pro",
});
const renamed = await pilgrim.contacts.update(7, { name: "Jane Doe" });
```

`upsert()` creates a contact. If the client has a contact with the same email, `upsert()` updates that contact. Each field that the SDK does not name is a custom field, for example `plan`. You can also send the custom fields in `metadata`. The app merges new custom fields with the old ones. The custom fields can have 50 keys, 3 levels and 16 KB at most. A key cannot start with `pilgrim_`.

`update()` does not change custom fields. To change them, call `upsert()` with the email of the contact.

A contact from `pilgrim.contacts` has each custom field as a field of the object: `contact.plan`. A contact inside another record, for example `post.contact`, has the custom fields as one JSON string in `metadata`:

```ts
const post = await pilgrim.posts.get(42);
const custom = JSON.parse(post.contact?.metadata ?? "{}");
```

### Testimonials

```ts
const pending = await pilgrim.testimonials.list();
const approved = await pilgrim.testimonials.list({ approved: true, rating: 5 });
const testimonial = await pilgrim.testimonials.get(9);
const created = await pilgrim.testimonials.create({
	description: "The roadmap keeps our customers in the loop.",
	username: "jane_doe",
	rating: 5,
});
const edited = await pilgrim.testimonials.update(9, { rating: 4 });
const live = await pilgrim.testimonials.approve(9);
```

Without `approved`, the list has only the pending testimonials. `approve(id, at)` sets `approved_at` to `at`, or to the current time.

### Tags

```ts
const page = await pilgrim.tags.list({ search: "feat" });
const tag = await pilgrim.tags.create({ title: "feature" });
const renamed = await pilgrim.tags.update(tag.id, { title: "enhancement" });
await pilgrim.tags.delete(tag.id);
```

The title of a tag is unique in the client. `delete()` removes the tag from each post, release note and contact, then deletes the tag. The tag list is in title order by default.

## Pagination

Each `list()` returns a `PagePromise`.

- Use `await` to get one page: the Laravel paginator with `data`, `current_page`, `last_page`, `per_page`, `total` and more.
- Use `for await` to get each item of each page. The SDK loads the next page only when the loop needs it.
- Use `.pages()` to get each page.
- Use `.toArray()` to get all items in one array. Use it only for short lists.

```ts
const first = await pilgrim.tags.list({ per_page: 100 });
console.log(first.total, first.last_page);

for await (const contact of pilgrim.contacts.list({ tag: "beta" })) {
	console.log(contact.email);
}

for await (const page of pilgrim.releaseNotes.list().pages()) {
	console.log(page.current_page, page.data.length);
}

const tags = await pilgrim.tags.list().toArray();
```

`per_page` is 1 to 100. The default is 15. The API uses 100 for a larger value. `page` sets the first page to read.

The SDK asks for the next page by number, with the same filters. It does not follow `next_page_url`, because that URL uses the `APP_URL` of the instance, not `baseUrl`.

## Identity hash

The widget proves the email of the signed-in user with `user_hash`. Make the hash on your server, then give it to the widget as `userHash`.

```ts
import { identityHash } from "feedbackpilgrim";

const userHash = await identityHash(
	user.email,
	process.env.FEEDBACKPILGRIM_IDENTITY_SECRET,
);
```

WARNING: Make the hash only on the server. An identity secret in browser code lets any person sign in as any contact.

The identity secret is in **Settings → Embed Widget**. It is not the API token.

The hash is the HMAC-SHA256 hex digest of the normalized email, with the identity secret as the key. The app normalizes the email with PHP `strtolower(trim($email))`. `normalizeEmail()` does the same:

- It removes only space, `\t`, `\n`, `\r`, `\0` and `\x0B` at both ends.
- It changes only the ASCII letters `A` to `Z` to lowercase.

```ts
import { normalizeEmail } from "feedbackpilgrim";

normalizeEmail("  JOSÉ@Example.com "); // "josÉ@example.com"
```

## Webhooks

The app signs each webhook delivery. It sends `POST` with these headers:

| Header                           | Value                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `X-FeedbackPilgrim-Event`        | `post.created`, `post.status_changed` or `post.completed`                                   |
| `X-FeedbackPilgrim-Delivery`     | The UUID of the delivery. Each retry of a delivery sends the same UUID.                     |
| `X-FeedbackPilgrim-Timestamp`    | The Unix time of the attempt, in seconds. Each retry sends a new timestamp.                 |
| `X-FeedbackPilgrim-Signature-V2` | The HMAC-SHA256 hex digest of `<timestamp>.<raw body>`, with the signing secret as the key. |
| `X-FeedbackPilgrim-Signature`    | Deprecated. The SDK does not read it.                                                       |

`verifyWebhook()` verifies a delivery and returns the event:

```ts
import { verifyWebhook } from "feedbackpilgrim";

const event = await verifyWebhook({
	body: rawBody, // a string, a Uint8Array or an ArrayBuffer
	headers: request.headers,
	secret: process.env.FEEDBACKPILGRIM_WEBHOOK_SECRET,
	tolerance: 300, // seconds, the default
});

event.deliveryId; // "0b8f2c4e-6a1d-4e3b-9c7f-1a2b3c4d5e6f"
event.event; // "post.status_changed"
event.data; // { id, title, content, status, board_id, contact_id, stage }
```

If a header is missing, the signature does not match, or the timestamp is more than `tolerance` seconds from now, `verifyWebhook()` throws a `WebhookVerificationError`. Its `reason` is `signature`, `timestamp` or `delivery`. Answer with a 400 status, and do not process the body.

`verifyWebhookSignature()` returns a boolean. Use it when you read the headers yourself:

```ts
import { verifyWebhookSignature } from "feedbackpilgrim";

const valid = await verifyWebhookSignature({
	body: rawBody,
	signature: request.headers.get("x-feedbackpilgrim-signature-v2"),
	timestamp: request.headers.get("x-feedbackpilgrim-timestamp"),
	secret: process.env.FEEDBACKPILGRIM_WEBHOOK_SECRET,
});
```

Obey these rules:

1. Verify the raw bytes of the body. Do not parse the JSON and encode it again. The app escapes `/` as `\/` and each character that is not ASCII as `\uXXXX`, so a new encoding gives other bytes.
2. Store `deliveryId` after you process a delivery. If a delivery has an ID that you processed, drop it. The SDK does not store IDs.
3. Keep a `default` branch for `event.event`. A new app version can add event types.

The SDK compares the digests in constant time with Web Crypto.

## Errors

Each error that the SDK throws extends `FeedbackPilgrimError` and has a `code`.

| Class                      | `code`                       | Cause                                                                           |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| `AuthenticationError`      | `authentication_error`       | 401: the token is missing or wrong, or the user is deactivated.                 |
| `AuthorizationError`       | `authorization_error`        | 403: the token cannot do this action. The REST API does not send it today.      |
| `NotFoundError`            | `not_found`                  | 404: the client of the token has no record with this ID.                        |
| `MethodNotAllowedError`    | `method_not_allowed`         | 405: the API does not support this operation.                                   |
| `ValidationError`          | `validation_error`           | 422: the server rejected a field. Read `errors` for the messages of each field. |
| `RateLimitError`           | `rate_limit`                 | 429: too many requests. Read `retryAfter`.                                      |
| `ServerError`              | `server_error`               | 5xx: the server failed.                                                         |
| `ApiError`                 | `api_error`                  | Another error status. Each class above extends `ApiError`.                      |
| `ConnectionError`          | `connection_error`           | The request did not get a response.                                             |
| `TimeoutError`             | `timeout`                    | One attempt took more time than `timeout`.                                      |
| `WebhookVerificationError` | `webhook_verification_error` | `verifyWebhook()` refused a delivery. Read `reason`.                            |

Each `ApiError` has `status`, `body` and `headers`. The message comes from the `message` field of the body, or from the `error` field of a 401.

Use `instanceof`, or use `isFeedbackPilgrimError()` and a `switch` on `code`. The `switch` narrows the type:

```ts
import { isFeedbackPilgrimError } from "feedbackpilgrim";

try {
	await pilgrim.tags.create({ title: "feature" });
} catch (error) {
	if (!isFeedbackPilgrimError(error)) throw error;

	switch (error.code) {
		case "validation_error":
			console.error(error.errors.title);
			break;
		case "rate_limit":
			console.error(`Wait ${error.retryAfter} seconds.`);
			break;
		default:
			throw error;
	}
}
```

If you abort a call with your own `AbortSignal`, the SDK throws the reason of the signal. It does not wrap it.

## Retries

The SDK retries a failed call up to `maxRetries` times. The delay doubles on each attempt: 0.5, 1, 2, 4 and 8 seconds at most. Half of each delay is random (jitter). If the server sends `Retry-After`, the SDK waits that time. If `Retry-After` is more than 60 seconds, the SDK does not retry and throws a `RateLimitError`.

| Failure                       | Retry of an idempotent call | Retry of another call                    |
| ----------------------------- | --------------------------- | ---------------------------------------- |
| 429                           | Yes                         | Yes. The server did not run the request. |
| 5xx                           | Yes                         | No                                       |
| Timeout                       | Yes                         | No                                       |
| Connection refused, DNS error | Yes                         | Yes. The server did not get the request. |
| Other connection error        | Yes                         | No                                       |
| Other 4xx                     | No                          | No                                       |

These calls are idempotent: each `list()` and `get()`, each `update()`, `testimonials.approve()`, `contacts.upsert()` and `tags.delete()`. An update sets fields to fixed values, so a repeat changes nothing. The app sends the emails of a status change only when the status changes. `contacts.upsert()` uses the email as the key, so a repeat updates the same contact.

These calls are not idempotent: `init()`, `posts.create()`, `releaseNotes.create()`, `testimonials.create()` and `tags.create()`. A repeat can make a second record.

If the server deleted a tag but the response did not arrive, the retry of `tags.delete()` gets a `NotFoundError`.

### Rate limit

Each user can make 120 requests each minute. All the tokens of one user share this limit. Each response has the headers `X-RateLimit-Limit` and `X-RateLimit-Remaining`. Read them on `error.headers`, or with a custom `fetch`.

## Cancel a call

Each method accepts an `AbortSignal`. The signal also stops a retry delay.

```ts
const page = await pilgrim.posts.list(
	{},
	{ signal: AbortSignal.timeout(5000) },
);
```

## Framework integration

### Next.js

Use the client in a Route Handler, a Server Action or a Server Component. Do not import it in a Client Component, because the token must stay on the server.

```ts
// lib/pilgrim.ts
import "server-only";
import { FeedbackPilgrim } from "feedbackpilgrim";

export const pilgrim = new FeedbackPilgrim({
	baseUrl: process.env.FEEDBACKPILGRIM_URL!,
	token: process.env.FEEDBACKPILGRIM_TOKEN!,
});
```

```ts
// app/actions.ts
"use server";
import { pilgrim } from "@/lib/pilgrim";

export async function sendFeedback(formData: FormData) {
	await pilgrim.posts.create({
		title: String(formData.get("title")),
		content: String(formData.get("content")),
	});
}
```

Make the identity hash in a Server Component. Give only the hash to the widget:

```tsx
// app/layout.tsx
import { identityHash } from "feedbackpilgrim";
import { currentUser } from "@/lib/auth";

export default async function Layout({
	children,
}: {
	children: React.ReactNode;
}) {
	const user = await currentUser();
	const userHash = await identityHash(
		user.email,
		process.env.FEEDBACKPILGRIM_IDENTITY_SECRET!,
	);
	// Escape "<" so that a name cannot close the script tag.
	const widget = JSON.stringify({
		contact: { email: user.email, name: user.name },
		userHash,
	}).replace(/</g, "\\u003c");

	return (
		<html lang="en">
			<body>
				{children}
				<script
					src={`${process.env.FEEDBACKPILGRIM_URL}/pilgrim.js`}
					data-client={process.env.FEEDBACKPILGRIM_PUBLISHABLE_KEY}
				/>
				<script dangerouslySetInnerHTML={{ __html: `pilgrim(${widget})` }} />
			</body>
		</html>
	);
}
```

The publishable `pk_` key is public. The identity secret and the token stay on the server, because the layout is a Server Component.

A Route Handler gets the raw body with `request.text()`:

```ts
// app/api/webhooks/feedbackpilgrim/route.ts
import { verifyWebhook, WebhookVerificationError } from "feedbackpilgrim";
import { db } from "@/lib/db";

export async function POST(request: Request) {
	let event;

	try {
		event = await verifyWebhook({
			body: await request.text(),
			headers: request.headers,
			secret: process.env.FEEDBACKPILGRIM_WEBHOOK_SECRET!,
		});
	} catch (error) {
		if (error instanceof WebhookVerificationError) {
			return new Response(error.message, { status: 400 });
		}
		throw error;
	}

	// Drop a delivery that you processed before.
	if (await db.deliveries.exists(event.deliveryId)) {
		return new Response(null, { status: 204 });
	}

	if (event.event === "post.completed") {
		// Tell your team that the feature shipped.
	}

	await db.deliveries.add(event.deliveryId);

	return new Response(null, { status: 204 });
}
```

### Express

Use `express.raw()` on the webhook route. `express.json()` parses the body, and then the raw bytes are lost.

```ts
import express from "express";
import {
	FeedbackPilgrim,
	identityHash,
	verifyWebhook,
	WebhookVerificationError,
} from "feedbackpilgrim";

const app = express();
const pilgrim = new FeedbackPilgrim({
	baseUrl: process.env.FEEDBACKPILGRIM_URL!,
	token: process.env.FEEDBACKPILGRIM_TOKEN!,
});

app.post(
	"/webhooks/feedbackpilgrim",
	express.raw({ type: "application/json" }),
	async (req, res) => {
		try {
			const event = await verifyWebhook({
				body: req.body, // a Buffer
				headers: req.headers,
				secret: process.env.FEEDBACKPILGRIM_WEBHOOK_SECRET!,
			});
			console.log(event.deliveryId, event.event, event.data.title);
			res.sendStatus(204);
		} catch (error) {
			if (error instanceof WebhookVerificationError) {
				res.status(400).send(error.message);
				return;
			}
			throw error;
		}
	},
);

// Give the widget the hash of the signed-in user.
app.get("/widget-identity", async (req, res) => {
	const email = req.user.email;
	const userHash = await identityHash(
		email,
		process.env.FEEDBACKPILGRIM_IDENTITY_SECRET!,
	);
	res.json({ email, userHash });
});

app.post("/feedback", express.json(), async (req, res) => {
	const post = await pilgrim.posts.create({
		title: req.body.title,
		content: req.body.content,
	});
	res.status(201).json({ id: post.id });
});

app.listen(3000);
```

Express 5 sends a rejected promise of a handler to the error middleware. For Express 4, catch the error in the handler.

### A custom `fetch`

Use the `fetch` option for a proxy, for logs, or for tests:

```ts
const pilgrim = new FeedbackPilgrim({
	baseUrl,
	token,
	fetch: (url, init) => {
		console.log(init.method, url);
		return fetch(url, init);
	},
});
```

## Supported runtimes

| Runtime            | Version              | Test in CI                                            |
| ------------------ | -------------------- | ----------------------------------------------------- |
| Node.js            | 20, 22, 24 and later | Unit tests and smoke test                             |
| Bun                | 1.x                  | Smoke test                                            |
| Deno               | 2.x                  | Smoke test                                            |
| Cloudflare Workers | Current              | None. The SDK uses only Web APIs that Workers supply. |

The package ships ESM (`dist/index.js`) and CommonJS (`dist/index.cjs`), with types for both.

Node.js 20 is out of support since April 2026. The SDK still tests on it.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). To report a security problem, read [SECURITY.md](SECURITY.md).
