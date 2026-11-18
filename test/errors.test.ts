import { describe, expect, it } from "vitest";
import { parseRetryAfter } from "../src/errors";
import {
	ApiError,
	AuthenticationError,
	AuthorizationError,
	ConnectionError,
	FeedbackPilgrimError,
	isFeedbackPilgrimError,
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
	html,
	json,
	mockFetch,
} from "./helpers";

/** Runs one call with no retries and returns the error that it throws. */
async function errorOf(reply: Response | Error): Promise<unknown> {
	const fetch = mockFetch(reply);

	return client(fetch, { maxRetries: 0 })
		.posts.get(1)
		.then(
			() => {
				throw new Error("The call did not fail.");
			},
			(error: unknown) => error,
		);
}

describe("HTTP status codes", () => {
	const cases = [
		[401, AuthenticationError, "authentication_error"],
		[403, AuthorizationError, "authorization_error"],
		[404, NotFoundError, "not_found"],
		[405, MethodNotAllowedError, "method_not_allowed"],
		[422, ValidationError, "validation_error"],
		[429, RateLimitError, "rate_limit"],
		[500, ServerError, "server_error"],
		[503, ServerError, "server_error"],
		[409, ApiError, "api_error"],
	] as const;

	it.each(cases)("maps %i to %O", async (status, ErrorClass, code) => {
		const error = await errorOf(json(status, { message: "Failure." }));

		expect(error).toBeInstanceOf(ErrorClass);
		expect(error).toBeInstanceOf(ApiError);
		expect(error).toBeInstanceOf(FeedbackPilgrimError);
		expect(error).toMatchObject({ code, status, message: "Failure." });
	});
});

describe("ApiError", () => {
	it("reads the message of a Sanctum 401", async () => {
		const error = await errorOf(json(401, { message: "Unauthenticated." }));

		expect(error).toMatchObject({
			name: "AuthenticationError",
			message: "Unauthenticated.",
			body: { message: "Unauthenticated." },
		});
	});

	it("reads the error field of a 401 for a token without a client", async () => {
		const error = await errorOf(json(401, { error: "Invalid API token" }));

		expect(error).toBeInstanceOf(AuthenticationError);
		expect(error).toMatchObject({ message: "Invalid API token" });
	});

	it("reads the message of the 405 of a delete", async () => {
		const error = await errorOf(json(405, { message: "Method not allowed" }));

		expect(error).toMatchObject({
			code: "method_not_allowed",
			message: "Method not allowed",
		});
	});

	it("keeps a short text body as the message", async () => {
		const error = await errorOf(html("Bad Gateway", 502));

		expect(error).toMatchObject({
			code: "server_error",
			message: "Bad Gateway",
			body: "Bad Gateway",
		});
	});

	it("uses the status as the message when the body is empty", async () => {
		const error = await errorOf(new Response(null, { status: 500 }));

		expect(error).toMatchObject({ message: "HTTP 500", body: undefined });
	});

	it("keeps the headers of the response", async () => {
		const error = (await errorOf(
			json(404, {}, { "x-ratelimit-remaining": "119" }),
		)) as ApiError;

		expect(error.headers.get("x-ratelimit-remaining")).toBe("119");
	});
});

describe("ValidationError", () => {
	it("gives the messages of each field", async () => {
		const error = await errorOf(
			json(422, {
				message: "The title field is required. (and 1 more error)",
				errors: {
					title: ["The title field is required."],
					"tags.0": ["The selected tags.0 is invalid."],
				},
			}),
		);

		expect(error).toBeInstanceOf(ValidationError);
		expect((error as ValidationError).errors).toEqual({
			title: ["The title field is required."],
			"tags.0": ["The selected tags.0 is invalid."],
		});
	});

	it("gives an empty object when the body has no errors", async () => {
		const error = await errorOf(json(422, { message: "Invalid." }));

		expect((error as ValidationError).errors).toEqual({});
	});
});

describe("RateLimitError", () => {
	it("reads Retry-After in seconds", async () => {
		const error = await errorOf(
			json(429, { message: "Too Many Attempts." }, { "retry-after": "42" }),
		);

		expect(error).toMatchObject({ code: "rate_limit", retryAfter: 42 });
	});

	it("has no retryAfter without the header", async () => {
		const error = await errorOf(json(429, {}));

		expect((error as RateLimitError).retryAfter).toBeUndefined();
	});

	it("reads an HTTP date in Retry-After", () => {
		const now = Date.parse("2026-11-18T12:00:00Z");

		expect(parseRetryAfter("Wed, 18 Nov 2026 12:00:30 GMT", now)).toBe(30);
		expect(parseRetryAfter("Wed, 18 Nov 2026 11:00:00 GMT", now)).toBe(0);
		expect(parseRetryAfter("soon", now)).toBeUndefined();
	});
});

describe("ConnectionError", () => {
	it("wraps a refused connection and marks it as before send", async () => {
		const error = await errorOf(connectionRefused());

		expect(error).toBeInstanceOf(ConnectionError);
		expect(error).toMatchObject({
			code: "connection_error",
			beforeSend: true,
		});
		expect((error as ConnectionError).cause).toBeInstanceOf(TypeError);
	});

	it("wraps a reset connection and does not mark it as before send", async () => {
		const error = await errorOf(connectionReset());

		expect(error).toMatchObject({
			code: "connection_error",
			beforeSend: false,
		});
	});
});

describe("isFeedbackPilgrimError()", () => {
	it("narrows the error with a switch on code", async () => {
		const error = await errorOf(
			json(422, { message: "Bad.", errors: { title: ["Bad."] } }),
		);

		if (!isFeedbackPilgrimError(error)) {
			throw new Error("The error is not an SDK error.");
		}

		switch (error.code) {
			case "validation_error":
				expect(error.errors.title).toEqual(["Bad."]);
				break;
			default:
				throw new Error(`Unexpected code ${error.code}.`);
		}
	});

	it("returns false for other errors", () => {
		expect(isFeedbackPilgrimError(new Error("x"))).toBe(false);
		expect(isFeedbackPilgrimError("x")).toBe(false);
		expect(isFeedbackPilgrimError(new TimeoutError("x"))).toBe(true);
	});
});
