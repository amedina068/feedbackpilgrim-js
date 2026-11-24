import { vi } from "vitest";
import {
	FeedbackPilgrim,
	type FeedbackPilgrimOptions,
	type FetchLike,
} from "../src/index";

export const BASE_URL = "https://feedback.test";
export const TOKEN = "1|test-token";

/** One mocked reply: a `Response`, or an error that `fetch` throws. */
export type Reply =
	| Response
	| Error
	| (() => Response | Error | Promise<Response>);

/** A JSON response. */
export function json(
	status: number,
	body: unknown,
	headers: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

/** An empty response, like a 204. */
export function empty(status = 204): Response {
	return new Response(null, { status });
}

/** An HTML response. */
export function html(body: string, status = 200): Response {
	return new Response(body, {
		status,
		headers: { "content-type": "text/html; charset=UTF-8" },
	});
}

/** A `fetch` error like the one undici throws when the connection is refused. */
export function connectionRefused(): TypeError {
	return new TypeError("fetch failed", {
		cause: Object.assign(new Error("connect ECONNREFUSED"), {
			code: "ECONNREFUSED",
		}),
	});
}

/** A `fetch` error like the one undici throws when the host name does not resolve. */
export function dnsFailure(): TypeError {
	return new TypeError("fetch failed", {
		cause: Object.assign(new Error("getaddrinfo ENOTFOUND feedback.test"), {
			code: "ENOTFOUND",
		}),
	});
}

/** A `fetch` error like the one undici throws when the connection does not open in time. */
export function connectTimeout(): TypeError {
	return new TypeError("fetch failed", {
		cause: Object.assign(new Error("Connect Timeout Error"), {
			code: "UND_ERR_CONNECT_TIMEOUT",
		}),
	});
}

/** A `fetch` error like the one undici throws when the server resets the connection. */
export function connectionReset(): TypeError {
	return new TypeError("fetch failed", {
		cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
	});
}

/** Makes a mocked `fetch` that gives the replies in order. */
export function mockFetch(...replies: Reply[]) {
	const queue = [...replies];

	return vi.fn<FetchLike>(async () => {
		const next = queue.shift();

		if (next === undefined) {
			throw new Error("The test made more requests than it expected.");
		}

		const reply = typeof next === "function" ? await next() : next;

		if (reply instanceof Error) {
			throw reply;
		}

		return reply;
	});
}

/** Makes a client with a mocked `fetch`. */
export function client(
	fetch: FetchLike,
	options: Partial<FeedbackPilgrimOptions> = {},
): FeedbackPilgrim {
	return new FeedbackPilgrim({
		baseUrl: BASE_URL,
		token: TOKEN,
		fetch,
		...options,
	});
}

/** The details of one call to the mocked `fetch`. */
export interface Call {
	method: string;
	url: URL;
	headers: Headers;
	body: unknown;
}

/** Reads the call with the given index. */
export function callOf(fetch: ReturnType<typeof mockFetch>, index = 0): Call {
	const call = fetch.mock.calls[index];

	if (call === undefined) {
		throw new Error(`fetch has no call ${index}.`);
	}

	const [url, init] = call;
	const body = init.body;

	return {
		method: init.method ?? "GET",
		url: new URL(url),
		headers: new Headers(init.headers),
		body: typeof body === "string" ? JSON.parse(body) : body,
	};
}

/** A Laravel paginator body. */
export function page<T>(
	data: T[],
	currentPage = 1,
	lastPage = 1,
	perPage = 15,
): Record<string, unknown> {
	return {
		current_page: currentPage,
		data,
		first_page_url: `${BASE_URL}/api/public/v1/posts?page=1`,
		from: data.length === 0 ? null : (currentPage - 1) * perPage + 1,
		last_page: lastPage,
		last_page_url: `${BASE_URL}/api/public/v1/posts?page=${lastPage}`,
		links: [],
		next_page_url:
			currentPage < lastPage
				? `${BASE_URL}/api/public/v1/posts?page=${currentPage + 1}`
				: null,
		path: `${BASE_URL}/api/public/v1/posts`,
		per_page: perPage,
		prev_page_url: null,
		to: data.length === 0 ? null : (currentPage - 1) * perPage + data.length,
		total: data.length,
	};
}
