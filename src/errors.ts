/** The `code` of each error class. Use it in a `switch` to narrow the error. */
export type FeedbackPilgrimErrorCode =
	| "authentication_error"
	| "authorization_error"
	| "not_found"
	| "method_not_allowed"
	| "validation_error"
	| "rate_limit"
	| "server_error"
	| "api_error"
	| "connection_error"
	| "timeout"
	| "webhook_verification_error";

/**
 * The base class of every error that the SDK throws. An abort from your own
 * `AbortSignal` is not wrapped: the SDK throws the reason of the signal.
 */
export abstract class FeedbackPilgrimError extends Error {
	abstract readonly code: FeedbackPilgrimErrorCode;
	override name = "FeedbackPilgrimError";
}

/** The `code` of each error that has an HTTP response. */
export type ApiErrorCode = Exclude<
	FeedbackPilgrimErrorCode,
	"connection_error" | "timeout" | "webhook_verification_error"
>;

/** The server sent a response with an error status. */
export class ApiError extends FeedbackPilgrimError {
	readonly code: ApiErrorCode = "api_error";
	override name = "ApiError";
	/** The HTTP status code. */
	readonly status: number;
	/** The parsed JSON body, or the text body when it is not JSON. */
	readonly body: unknown;
	/** The response headers. */
	readonly headers: Headers;

	constructor(status: number, body: unknown, headers: Headers) {
		super(messageOf(status, body));
		this.status = status;
		this.body = body;
		this.headers = headers;
	}
}

/**
 * 401: the token is missing or wrong, the user is deactivated, or the user is
 * no longer a member of the client of the token.
 */
export class AuthenticationError extends ApiError {
	override readonly code = "authentication_error" as const;
	override name = "AuthenticationError";
}

/** 403: the token cannot do this action. The REST API does not send it today. */
export class AuthorizationError extends ApiError {
	override readonly code = "authorization_error" as const;
	override name = "AuthorizationError";
}

/** 404: the client of the token has no record with this ID. */
export class NotFoundError extends ApiError {
	override readonly code = "not_found" as const;
	override name = "NotFoundError";
}

/** 405: the API does not support this operation. */
export class MethodNotAllowedError extends ApiError {
	override readonly code = "method_not_allowed" as const;
	override name = "MethodNotAllowedError";
}

/** 422: the server rejected one or more fields. */
export class ValidationError extends ApiError {
	override readonly code = "validation_error" as const;
	override name = "ValidationError";
	/** The messages for each field, for example `{ title: ['The title field is required.'] }`. */
	readonly errors: Readonly<Record<string, readonly string[]>>;

	constructor(status: number, body: unknown, headers: Headers) {
		super(status, body, headers);
		this.errors = fieldErrorsOf(body);
	}
}

/** 429: the user made more than 120 requests in one minute. */
export class RateLimitError extends ApiError {
	override readonly code = "rate_limit" as const;
	override name = "RateLimitError";
	/** The number of seconds from the `Retry-After` header, when the server sent it. */
	readonly retryAfter: number | undefined;

	constructor(status: number, body: unknown, headers: Headers) {
		super(status, body, headers);
		this.retryAfter = parseRetryAfter(headers.get("retry-after"));
	}
}

/** 5xx: the server failed. */
export class ServerError extends ApiError {
	override readonly code = "server_error" as const;
	override name = "ServerError";
}

/** The request did not get a response: DNS, TLS, a refused or reset connection. */
export class ConnectionError extends FeedbackPilgrimError {
	readonly code = "connection_error" as const;
	override name = "ConnectionError";
	/**
	 * `true` when the SDK knows that the server did not receive the request,
	 * for example when the connection was refused. Then a retry is safe.
	 */
	readonly beforeSend: boolean;

	constructor(message: string, options: { cause: unknown }) {
		super(message, options);
		this.beforeSend = isBeforeSend(options.cause);
	}
}

/** One attempt took more time than the `timeout` setting. */
export class TimeoutError extends FeedbackPilgrimError {
	readonly code = "timeout" as const;
	override name = "TimeoutError";
}

/** The part of a webhook delivery that failed the check. */
export type WebhookFailureReason = "signature" | "timestamp" | "delivery";

/**
 * `verifyWebhook()` refused a delivery. Answer with a 400 status and do not
 * process the body.
 */
export class WebhookVerificationError extends FeedbackPilgrimError {
	readonly code = "webhook_verification_error" as const;
	override name = "WebhookVerificationError";
	/**
	 * `signature`: the signature header is missing or does not match the body.
	 * `timestamp`: the timestamp header is missing or outside the tolerance.
	 * `delivery`: the delivery header is missing.
	 */
	readonly reason: WebhookFailureReason;

	constructor(reason: WebhookFailureReason, message: string) {
		super(message);
		this.reason = reason;
	}
}

/** Makes the error class that matches an HTTP status. */
export function createApiError(
	status: number,
	body: unknown,
	headers: Headers,
): ApiError {
	switch (status) {
		case 401:
			return new AuthenticationError(status, body, headers);
		case 403:
			return new AuthorizationError(status, body, headers);
		case 404:
			return new NotFoundError(status, body, headers);
		case 405:
			return new MethodNotAllowedError(status, body, headers);
		case 422:
			return new ValidationError(status, body, headers);
		case 429:
			return new RateLimitError(status, body, headers);
		default:
			return status >= 500
				? new ServerError(status, body, headers)
				: new ApiError(status, body, headers);
	}
}

/** Reads a `Retry-After` value (seconds or an HTTP date) as seconds. */
export function parseRetryAfter(
	value: string | null,
	now: number = Date.now(),
): number | undefined {
	if (value === null) {
		return undefined;
	}

	const trimmed = value.trim();

	if (/^\d+$/.test(trimmed)) {
		return Number(trimmed);
	}

	const date = Date.parse(trimmed);

	return Number.isNaN(date) ? undefined : Math.max(0, (date - now) / 1000);
}

// The codes that a runtime gives when the connection never opened. Node
// (undici) puts them on `cause.code`. Bun puts them on `code`.
const BEFORE_SEND_CODES = new Set([
	"ECONNREFUSED",
	"ENOTFOUND",
	"EAI_AGAIN",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"UND_ERR_CONNECT_TIMEOUT",
	"ConnectionRefused",
	"FailedToOpenSocket",
]);

function isBeforeSend(error: unknown): boolean {
	for (
		let current = error, depth = 0;
		isRecord(current) && depth < 4;
		depth++
	) {
		if (
			typeof current.code === "string" &&
			BEFORE_SEND_CODES.has(current.code)
		) {
			return true;
		}

		current = current.cause;
	}

	return false;
}

// Most errors have `message`. The API client check sends `error` for a bad token.
function messageOf(status: number, body: unknown): string {
	return (
		stringField(body, "message") ??
		stringField(body, "error") ??
		(typeof body === "string" && body.length > 0 && body.length <= 200
			? body
			: `HTTP ${status}`)
	);
}

function fieldErrorsOf(body: unknown): Record<string, readonly string[]> {
	const errors = isRecord(body) ? body.errors : undefined;
	const result: Record<string, readonly string[]> = {};

	if (!isRecord(errors)) {
		return result;
	}

	for (const [field, messages] of Object.entries(errors)) {
		result[field] = Array.isArray(messages)
			? messages.filter(
					(message): message is string => typeof message === "string",
				)
			: typeof messages === "string"
				? [messages]
				: [];
	}

	return result;
}

function stringField(body: unknown, field: string): string | undefined {
	const value = isRecord(body) ? body[field] : undefined;

	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * Each error that the SDK throws, as a discriminated union on `code`. A
 * `switch (error.code)` narrows the union to one class.
 */
export type AnyFeedbackPilgrimError =
	| AuthenticationError
	| AuthorizationError
	| NotFoundError
	| MethodNotAllowedError
	| ValidationError
	| RateLimitError
	| ServerError
	| (ApiError & { readonly code: "api_error" })
	| ConnectionError
	| TimeoutError
	| WebhookVerificationError;

/**
 * Returns `true` for each error that the SDK throws. Use it in a `catch`
 * block, then narrow the error with `switch (error.code)`.
 */
export function isFeedbackPilgrimError(
	error: unknown,
): error is AnyFeedbackPilgrimError {
	return error instanceof FeedbackPilgrimError;
}
