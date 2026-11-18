import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retryDelay } from "../src/core/transport";
import {
	ConnectionError,
	MethodNotAllowedError,
	NotFoundError,
	RateLimitError,
	ServerError,
	TimeoutError,
	ValidationError,
} from "../src/index";
import {
	client,
	connectionRefused,
	connectionReset,
	json,
	mockFetch,
} from "./helpers";

const POST = { id: 1, title: "Add dark mode" };

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

/** Starts a call, runs each timer, and returns the result or the error. */
async function settle<T>(promise: Promise<T>): Promise<T | unknown> {
	const result = promise.catch((error: unknown) => error);
	await vi.runAllTimersAsync();

	return result;
}

/** Makes the next call of `fetch` wait until the SDK aborts it. */
function hangOnce(fetch: ReturnType<typeof mockFetch>): void {
	fetch.mockImplementationOnce(
		(_url, init) =>
			new Promise<Response>((_resolve, reject) => {
				init.signal?.addEventListener("abort", () =>
					reject(new Error("aborted")),
				);
			}),
	);
}

describe("retries of an idempotent request", () => {
	it("retries a 5xx and then succeeds", async () => {
		const fetch = mockFetch(
			json(500, { message: "Server Error" }),
			json(503, {}),
			json(200, POST),
		);

		expect(await settle(client(fetch).posts.get(1))).toEqual(POST);
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it("retries a connection error", async () => {
		const fetch = mockFetch(connectionReset(), json(200, POST));

		expect(await settle(client(fetch).posts.get(1))).toEqual(POST);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("retries a timeout", async () => {
		const fetch = mockFetch(json(200, POST));
		hangOnce(fetch);

		expect(await settle(client(fetch, { timeout: 1000 }).posts.get(1))).toEqual(
			POST,
		);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("stops after maxRetries and throws the last error", async () => {
		const fetch = mockFetch(
			json(500, {}),
			json(502, {}),
			json(503, { message: "Down" }),
		);

		const error = await settle(client(fetch, { maxRetries: 2 }).posts.get(1));

		expect(error).toBeInstanceOf(ServerError);
		expect(error).toMatchObject({ status: 503, message: "Down" });
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it("does not retry when maxRetries is 0", async () => {
		const fetch = mockFetch(json(500, {}));

		expect(
			await settle(client(fetch, { maxRetries: 0 }).posts.get(1)),
		).toBeInstanceOf(ServerError);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("lets one call override maxRetries", async () => {
		const fetch = mockFetch(json(500, {}), json(200, POST));

		expect(
			await settle(
				client(fetch, { maxRetries: 0 }).posts.get(1, { maxRetries: 1 }),
			),
		).toEqual(POST);
	});

	it("does not retry a 404, a 405 or a 422", async () => {
		for (const [status, ErrorClass] of [
			[404, NotFoundError],
			[405, MethodNotAllowedError],
			[422, ValidationError],
		] as const) {
			const fetch = mockFetch(json(status, {}));

			expect(await settle(client(fetch).posts.get(1))).toBeInstanceOf(
				ErrorClass,
			);
			expect(fetch).toHaveBeenCalledTimes(1);
		}
	});

	it("retries a PATCH, because an update sets fixed values", async () => {
		const fetch = mockFetch(json(502, {}), json(200, POST));

		expect(
			await settle(client(fetch).posts.update(1, { status: "completed" })),
		).toEqual(POST);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("retries contacts.upsert(), because the email is the key", async () => {
		const fetch = mockFetch(json(500, {}), json(200, { id: 7 }));

		expect(
			await settle(
				client(fetch).contacts.upsert({
					name: "Jane",
					email: "jane@example.com",
				}),
			),
		).toEqual({ id: 7 });
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("retries a DELETE", async () => {
		const fetch = mockFetch(json(500, {}), new Response(null, { status: 204 }));

		await settle(client(fetch).tags.delete(4));

		expect(fetch).toHaveBeenCalledTimes(2);
	});
});

describe("retries of a request that is not idempotent", () => {
	const params = { title: "Add dark mode", content: "Please." };

	it("does not retry a 5xx", async () => {
		const fetch = mockFetch(json(500, {}));

		expect(await settle(client(fetch).posts.create(params))).toBeInstanceOf(
			ServerError,
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("does not retry a reset connection", async () => {
		const fetch = mockFetch(connectionReset());

		expect(await settle(client(fetch).posts.create(params))).toBeInstanceOf(
			ConnectionError,
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("does not retry a timeout", async () => {
		const fetch = mockFetch();
		hangOnce(fetch);

		expect(
			await settle(client(fetch, { timeout: 1000 }).posts.create(params)),
		).toBeInstanceOf(TimeoutError);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("retries a refused connection, because the server did not get the request", async () => {
		const fetch = mockFetch(connectionRefused(), json(201, POST));

		expect(await settle(client(fetch).posts.create(params))).toEqual(POST);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("retries a 429, because the server did not run the request", async () => {
		const fetch = mockFetch(
			json(429, { message: "Too Many Attempts." }),
			json(201, POST),
		);

		expect(await settle(client(fetch).posts.create(params))).toEqual(POST);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("sends the same body on each attempt", async () => {
		const fetch = mockFetch(json(429, {}), json(201, POST));

		await settle(client(fetch).tags.create({ title: "feature" }));

		const bodies = fetch.mock.calls.map(([, init]) => init.body);
		expect(bodies).toEqual([
			JSON.stringify({ title: "feature" }),
			JSON.stringify({ title: "feature" }),
		]);
	});
});

describe("Retry-After", () => {
	it("waits for the time in Retry-After", async () => {
		const fetch = mockFetch(
			json(429, {}, { "retry-after": "3" }),
			json(200, POST),
		);
		const promise = client(fetch).posts.get(1);

		await vi.advanceTimersByTimeAsync(2999);
		expect(fetch).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1);
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(await promise).toEqual(POST);
	});

	it("reads Retry-After on a 503", async () => {
		const fetch = mockFetch(
			json(503, {}, { "retry-after": "2" }),
			json(200, POST),
		);
		const promise = client(fetch).posts.get(1);

		await vi.advanceTimersByTimeAsync(1999);
		expect(fetch).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1);
		expect(await promise).toEqual(POST);
	});

	it("does not wait for a Retry-After of more than 60 seconds", async () => {
		const fetch = mockFetch(json(429, {}, { "retry-after": "120" }));

		const error = await settle(client(fetch).posts.get(1));

		expect(error).toBeInstanceOf(RateLimitError);
		expect((error as RateLimitError).retryAfter).toBe(120);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});

describe("abort", () => {
	it("stops the retry delay when the signal aborts", async () => {
		const fetch = mockFetch(json(500, {}), json(200, POST));
		const controller = new AbortController();
		const promise = client(fetch)
			.posts.get(1, { signal: controller.signal })
			.catch((error: unknown) => error);

		await vi.advanceTimersByTimeAsync(10);
		controller.abort(new Error("stop"));

		expect(await promise).toMatchObject({ message: "stop" });
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});

describe("retryDelay()", () => {
	const serverError = new ServerError(500, {}, new Headers());

	it("doubles the delay on each attempt, up to 8 seconds", () => {
		const max = () => 0.999_999;
		const delays = [0, 1, 2, 3, 4, 5].map((attempt) =>
			Math.round(retryDelay(serverError, attempt, true, max) ?? -1),
		);

		expect(delays).toEqual([500, 1000, 2000, 4000, 8000, 8000]);
	});

	it("adds jitter: half of the delay is random", () => {
		expect(retryDelay(serverError, 1, true, () => 0)).toBe(500);
		expect(retryDelay(serverError, 1, true, () => 0.5)).toBe(750);
	});

	it("gives no delay for an error that must not be retried", () => {
		expect(retryDelay(serverError, 0, false)).toBeUndefined();
		expect(
			retryDelay(new NotFoundError(404, {}, new Headers()), 0, true),
		).toBeUndefined();
	});

	it("uses Retry-After on a 429, also for a request that is not idempotent", () => {
		const rateLimit = new RateLimitError(
			429,
			{},
			new Headers({ "retry-after": "5" }),
		);

		expect(retryDelay(rateLimit, 0, false)).toBe(5000);
	});
});
