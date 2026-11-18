import {
	ConnectionError,
	createApiError,
	type FeedbackPilgrimError,
	FeedbackPilgrimError as FeedbackPilgrimErrorClass,
	RateLimitError,
	ServerError,
	TimeoutError,
} from "../errors";
import { appendQuery, type QueryParams } from "./query";

/** A `fetch` function. The global `fetch` is the default. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** The settings of one call. Each field overrides the client setting. */
export interface RequestOptions {
	/** Cancels the call, also during a retry delay. */
	signal?: AbortSignal;
	/** The time limit for one attempt, in milliseconds. */
	timeout?: number;
	/** The maximum number of retries after the first attempt. */
	maxRetries?: number;
}

export interface TransportOptions {
	baseUrl: string | URL;
	token: string;
	timeout: number;
	maxRetries: number;
	fetch: FetchLike | undefined;
}

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface RequestSpec {
	method: HttpMethod;
	/** The path from the instance root, for example `/api/public/v1/posts`. */
	path: string;
	query?: QueryParams;
	/** A JSON body. */
	json?: unknown;
	/**
	 * `true` when a repeat of the request has no extra effect. The default is
	 * `true` for GET and DELETE, and `false` for POST and PATCH.
	 */
	idempotent?: boolean;
}

const INITIAL_RETRY_DELAY = 500;
const MAX_RETRY_DELAY = 8000;
/** The SDK does not wait longer than this for a `Retry-After` value. */
const MAX_RETRY_AFTER = 60_000;

/** Sends requests to one Feedback Pilgrim instance, with time limits and retries. */
export class Transport {
	readonly #root: string;
	readonly #token: string;
	readonly #timeout: number;
	readonly #maxRetries: number;
	readonly #fetch: FetchLike;

	constructor(options: TransportOptions) {
		this.#root = instanceRoot(options.baseUrl);
		this.#token = options.token;
		this.#timeout = options.timeout;
		this.#maxRetries = options.maxRetries;
		// Resolve the global `fetch` on each call. A runtime can replace it after
		// the client exists, and a detached `fetch` throws in some runtimes.
		this.#fetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
	}

	/** Sends one request and returns the parsed body. */
	async request<T>(
		spec: RequestSpec,
		options: RequestOptions = {},
	): Promise<T> {
		const url = this.#url(spec);
		const init = this.#init(spec);
		const maxRetries = options.maxRetries ?? this.#maxRetries;
		const idempotent =
			spec.idempotent ?? (spec.method === "GET" || spec.method === "DELETE");

		for (let attempt = 0; ; attempt++) {
			let failure: FeedbackPilgrimError;

			try {
				return (await this.#attempt(url, init, spec, options)) as T;
			} catch (error) {
				if (!(error instanceof FeedbackPilgrimErrorClass)) {
					throw error;
				}

				failure = error;
			}

			const delay =
				attempt < maxRetries
					? retryDelay(failure, attempt, idempotent)
					: undefined;

			if (delay === undefined) {
				throw failure;
			}

			await sleep(delay, options.signal);
		}
	}

	async #attempt(
		url: string,
		init: RequestInit,
		spec: RequestSpec,
		options: RequestOptions,
	): Promise<unknown> {
		const { signal } = options;
		signal?.throwIfAborted();

		const controller = new AbortController();
		const abort = (): void => controller.abort(signal?.reason);
		signal?.addEventListener("abort", abort, { once: true });

		let timedOut = false;
		const timeout = options.timeout ?? this.#timeout;
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, timeout);

		try {
			const response = await this.#fetch(url, {
				...init,
				signal: controller.signal,
			});
			const raw = await response.text();

			if (!response.ok) {
				throw createApiError(response.status, parseBody(raw), response.headers);
			}

			return raw === "" ? undefined : parseJson(raw, response);
		} catch (error) {
			if (error instanceof FeedbackPilgrimErrorClass) {
				throw error;
			}

			if (signal?.aborted === true) {
				throw signal.reason;
			}

			if (timedOut) {
				throw new TimeoutError(`The request took more than ${timeout} ms.`, {
					cause: error,
				});
			}

			throw new ConnectionError(
				`The request to ${spec.method} ${spec.path} failed: ${describe(error)}`,
				{ cause: error },
			);
		} finally {
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
		}
	}

	#url(spec: RequestSpec): string {
		const url = new URL(this.#root + spec.path);

		if (spec.query !== undefined) {
			appendQuery(url.searchParams, spec.query);
		}

		return url.href;
	}

	#init(spec: RequestSpec): RequestInit {
		// Without `Accept: application/json`, Laravel sends an error as a
		// redirect to `/login` or as an HTML page.
		const headers: Record<string, string> = {
			accept: "application/json",
			authorization: `Bearer ${this.#token}`,
		};

		if (spec.json === undefined) {
			return { method: spec.method, headers };
		}

		headers["content-type"] = "application/json";

		return { method: spec.method, headers, body: JSON.stringify(spec.json) };
	}
}

/**
 * Returns the delay before the next attempt, or `undefined` when the SDK must
 * not retry. A request that is not idempotent gets a retry only when the
 * server did not process it: a 429, or a connection that never opened.
 */
export function retryDelay(
	failure: FeedbackPilgrimError,
	attempt: number,
	idempotent: boolean,
	random: () => number = Math.random,
): number | undefined {
	const retryable =
		failure instanceof RateLimitError ||
		(failure instanceof ConnectionError &&
			(idempotent || failure.beforeSend)) ||
		(idempotent &&
			(failure instanceof ServerError || failure instanceof TimeoutError));

	if (!retryable) {
		return undefined;
	}

	const retryAfter = retryAfterOf(failure);

	if (retryAfter !== undefined) {
		return retryAfter <= MAX_RETRY_AFTER ? retryAfter : undefined;
	}

	const base = Math.min(MAX_RETRY_DELAY, INITIAL_RETRY_DELAY * 2 ** attempt);

	// Equal jitter: half of the delay is fixed, the other half is random.
	return base / 2 + random() * (base / 2);
}

function retryAfterOf(failure: FeedbackPilgrimError): number | undefined {
	if (failure instanceof RateLimitError) {
		return failure.retryAfter === undefined
			? undefined
			: Math.ceil(failure.retryAfter * 1000);
	}

	if (failure instanceof ServerError) {
		const header = failure.headers.get("retry-after")?.trim();

		return header !== undefined && /^\d+$/.test(header)
			? Number(header) * 1000
			: undefined;
	}

	return undefined;
}

/** Waits `ms` milliseconds. An abort of `signal` rejects with the reason of the signal. */
export function sleep(
	ms: number,
	signal: AbortSignal | undefined,
): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted === true) {
			reject(signal.reason);
			return;
		}

		const onAbort = (): void => {
			clearTimeout(timer);
			reject(signal?.reason);
		};

		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);

		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

function instanceRoot(baseUrl: string | URL): string {
	let url: URL;

	try {
		url = new URL(baseUrl);
	} catch {
		throw new TypeError(
			"`baseUrl` must be an absolute URL, for example `https://feedback.example.com`.",
		);
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new TypeError("`baseUrl` must use http or https.");
	}

	return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function parseBody(raw: string): unknown {
	if (raw === "") {
		return undefined;
	}

	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

function parseJson(raw: string, response: Response): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		throw createApiError(
			response.status,
			{
				message:
					"The server sent a body that is not JSON. Make sure that `baseUrl` is the root URL of the instance.",
			},
			response.headers,
		);
	}
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
