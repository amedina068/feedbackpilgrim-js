import { hmacKey, requireSecret } from "./core/hmac";
import { type WebhookFailureReason, WebhookVerificationError } from "./errors";
import type { PostStatus } from "./types";

/** The raw request body, byte for byte. */
export type WebhookBody = string | Uint8Array | ArrayBuffer;

/**
 * The request headers: a `Headers` object (Fetch API, Next.js) or a plain
 * object (Node.js `IncomingHttpHeaders`, Express).
 */
export type WebhookHeaders =
	| Headers
	| Readonly<Record<string, string | readonly string[] | undefined>>;

/** The names of the headers of a delivery, in lowercase. */
export const WEBHOOK_HEADERS = {
	event: "x-feedbackpilgrim-event",
	delivery: "x-feedbackpilgrim-delivery",
	timestamp: "x-feedbackpilgrim-timestamp",
	signature: "x-feedbackpilgrim-signature-v2",
} as const;

/** The options of `verifyWebhookSignature()`. */
export interface VerifyWebhookSignatureOptions {
	/**
	 * The raw request body. Do not parse the JSON and encode it again: the
	 * app escapes `/` and each character that is not ASCII, so a new encoding
	 * gives other bytes, and the signature fails.
	 */
	body: WebhookBody;
	/** The value of the `X-FeedbackPilgrim-Signature-V2` header. */
	signature: string | null | undefined;
	/** The value of the `X-FeedbackPilgrim-Timestamp` header. */
	timestamp: string | null | undefined;
	/** The signing secret of the webhook. */
	secret: string;
	/** The maximum age of the timestamp, in seconds, before or after now. The default is 300. */
	tolerance?: number;
	/** The current time. Use it in tests. */
	now?: Date;
}

/** The options of `verifyWebhook()`. */
export interface VerifyWebhookOptions {
	/** The raw request body. See `VerifyWebhookSignatureOptions.body`. */
	body: WebhookBody;
	headers: WebhookHeaders;
	/** The signing secret of the webhook. */
	secret: string;
	/** The maximum age of the timestamp, in seconds, before or after now. The default is 300. */
	tolerance?: number;
	/** The current time. Use it in tests. */
	now?: Date;
}

/** The event types of the app today. A new app version can add more. */
export type WebhookEventType =
	| "post.created"
	| "post.status_changed"
	| "post.completed";

/** The post in a webhook payload. */
export interface WebhookPost {
	id: number;
	title: string;
	content: string | null;
	status: PostStatus | null;
	board_id: number | null;
	contact_id: number | null;
	stage: {
		id: number;
		name: string;
		type: "open" | "planned" | "active" | "complete" | "closed";
	} | null;
}

/** A verified webhook delivery. */
export interface WebhookEvent {
	/**
	 * The `X-FeedbackPilgrim-Delivery` UUID. Each retry of a delivery has the
	 * same ID. Store it, and drop a delivery with an ID that you processed.
	 */
	deliveryId: string;
	/** The Unix time of this attempt, in seconds. */
	timestamp: number;
	/** The `event` field of the signed body. Keep a `default` branch for new types. */
	event: WebhookEventType | (string & {});
	/** The post. */
	data: WebhookPost;
}

const DEFAULT_TOLERANCE = 300;

/**
 * Returns `true` when the signature matches the timestamp and the body, and
 * the timestamp is in the tolerance. Call it only on the server.
 *
 * @example
 * const valid = await verifyWebhookSignature({
 * 	body: rawBody,
 * 	signature: request.headers.get('x-feedbackpilgrim-signature-v2'),
 * 	timestamp: request.headers.get('x-feedbackpilgrim-timestamp'),
 * 	secret: process.env.FEEDBACKPILGRIM_WEBHOOK_SECRET,
 * })
 */
export async function verifyWebhookSignature(
	options: VerifyWebhookSignatureOptions,
): Promise<boolean> {
	return (await failureOf(options)) === undefined;
}

/**
 * Verifies a webhook delivery and returns its event and its delivery ID.
 * Throws a `WebhookVerificationError` when a header is missing, the signature
 * does not match, or the timestamp is outside the tolerance.
 *
 * @example
 * const event = await verifyWebhook({
 * 	body: await request.text(),
 * 	headers: request.headers,
 * 	secret: process.env.FEEDBACKPILGRIM_WEBHOOK_SECRET,
 * })
 */
export async function verifyWebhook(
	options: VerifyWebhookOptions,
): Promise<WebhookEvent> {
	const { body, headers } = options;
	const deliveryId = header(headers, WEBHOOK_HEADERS.delivery);
	const timestamp = header(headers, WEBHOOK_HEADERS.timestamp);
	const failure = await failureOf({
		...options,
		signature: header(headers, WEBHOOK_HEADERS.signature),
		timestamp,
	});

	if (failure !== undefined) {
		throw new WebhookVerificationError(failure, MESSAGES[failure]);
	}

	if (deliveryId === undefined || deliveryId === "") {
		throw new WebhookVerificationError("delivery", MESSAGES.delivery);
	}

	// Read the type from the signed body. The event header is not signed.
	const payload = JSON.parse(new TextDecoder().decode(bytesOf(body))) as {
		event: string;
		data: WebhookPost;
	};

	return {
		deliveryId,
		timestamp: Number(timestamp),
		event: payload.event,
		data: payload.data,
	};
}

const MESSAGES: Record<WebhookFailureReason, string> = {
	signature:
		"The X-FeedbackPilgrim-Signature-V2 header is missing or does not match. Check the secret and use the raw body.",
	timestamp:
		"The X-FeedbackPilgrim-Timestamp header is missing, is not a number, or is outside the tolerance.",
	delivery: "The X-FeedbackPilgrim-Delivery header is missing.",
};

async function failureOf(
	options: VerifyWebhookSignatureOptions,
): Promise<"signature" | "timestamp" | undefined> {
	const { secret, tolerance = DEFAULT_TOLERANCE, now = new Date() } = options;
	requireSecret(secret, "secret");

	// A tolerance of NaN makes each age check false, so it turns the replay check off.
	if (!Number.isFinite(tolerance) || tolerance < 0) {
		throw new TypeError(
			"`tolerance` must be a number of seconds that is 0 or more.",
		);
	}

	const timestamp = options.timestamp?.trim();

	if (timestamp === undefined || !/^\d+$/.test(timestamp)) {
		return "timestamp";
	}

	if (!(await signatureMatches(secret, timestamp, options))) {
		return "signature";
	}

	const age = Math.floor(now.getTime() / 1000) - Number(timestamp);

	return Math.abs(age) > tolerance ? "timestamp" : undefined;
}

// The app signs `<timestamp>.<raw body>`. `subtle.verify` compares the
// digests in constant time.
async function signatureMatches(
	secret: string,
	timestamp: string,
	options: VerifyWebhookSignatureOptions,
): Promise<boolean> {
	const signature = options.signature?.trim().toLowerCase();

	if (signature === undefined || !/^[0-9a-f]{64}$/.test(signature)) {
		return false;
	}

	const prefix = new TextEncoder().encode(`${timestamp}.`);
	const body = bytesOf(options.body);
	const message = new Uint8Array(prefix.length + body.length);
	message.set(prefix);
	message.set(body, prefix.length);

	return crypto.subtle.verify(
		"HMAC",
		await hmacKey(secret, "verify"),
		hexBytes(signature),
		message,
	);
}

function header(headers: WebhookHeaders, name: string): string | undefined {
	if (isHeaders(headers)) {
		return headers.get(name) ?? undefined;
	}

	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === name) {
			return typeof value === "string" ? value : value?.[0];
		}
	}

	return undefined;
}

// A duck-type check, because a framework can bring its own `Headers` class.
function isHeaders(headers: WebhookHeaders): headers is Headers {
	return typeof (headers as Headers).get === "function";
}

function bytesOf(body: WebhookBody): Uint8Array {
	if (typeof body === "string") {
		return new TextEncoder().encode(body);
	}

	return body instanceof Uint8Array ? body : new Uint8Array(body);
}

function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(hex.length / 2);

	for (let index = 0; index < bytes.length; index++) {
		bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
	}

	return bytes;
}
