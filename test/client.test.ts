import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackPilgrim } from "../src/index";
import {
	BASE_URL,
	callOf,
	client,
	html,
	json,
	mockFetch,
	TOKEN,
} from "./helpers";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("constructor", () => {
	it("rejects a missing token", () => {
		expect(() => new FeedbackPilgrim({ baseUrl: BASE_URL, token: "" })).toThrow(
			/token/,
		);
		expect(
			() => new FeedbackPilgrim({ baseUrl: BASE_URL, token: "  " }),
		).toThrow(/token/);
	});

	it("rejects a base URL that is not absolute", () => {
		expect(
			() => new FeedbackPilgrim({ baseUrl: "feedback.test", token: TOKEN }),
		).toThrow(/baseUrl/);
	});

	it("rejects a base URL that is not http or https", () => {
		expect(
			() =>
				new FeedbackPilgrim({ baseUrl: "ftp://feedback.test", token: TOKEN }),
		).toThrow(/http/);
	});

	it("rejects a timeout or maxRetries that is not valid", () => {
		const fetch = mockFetch();

		expect(() => client(fetch, { timeout: 0 })).toThrow(/timeout/);
		expect(() => client(fetch, { maxRetries: -1 })).toThrow(/maxRetries/);
		expect(() => client(fetch, { maxRetries: Number.NaN })).toThrow(
			/maxRetries/,
		);
	});
});

describe("requests", () => {
	it("sends the token, Accept: application/json and no body on a GET", async () => {
		const fetch = mockFetch(json(200, { id: 1 }));

		await client(fetch).posts.get(1);

		const call = callOf(fetch);
		expect(call.method).toBe("GET");
		expect(call.url.href).toBe(`${BASE_URL}/api/public/v1/posts/1`);
		expect(call.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
		expect(call.headers.get("accept")).toBe("application/json");
		expect(call.headers.get("content-type")).toBeNull();
		expect(call.body).toBeUndefined();
	});

	it("sends a JSON body with its content type", async () => {
		const fetch = mockFetch(json(201, { id: 1 }));

		await client(fetch).tags.create({ title: "feature" });

		const call = callOf(fetch);
		expect(call.headers.get("content-type")).toBe("application/json");
		expect(call.body).toEqual({ title: "feature" });
	});

	it("keeps a path in the base URL and drops a slash at the end", async () => {
		const fetch = mockFetch(json(200, { id: 1 }));

		await client(fetch, {
			baseUrl: "https://example.test/feedback/",
		}).posts.get(1);

		expect(callOf(fetch).url.href).toBe(
			"https://example.test/feedback/api/public/v1/posts/1",
		);
	});

	it("accepts a URL object as the base URL", async () => {
		const fetch = mockFetch(json(200, { id: 1 }));

		await client(fetch, { baseUrl: new URL(BASE_URL) }).posts.get(1);

		expect(callOf(fetch).url.origin).toBe(BASE_URL);
	});

	it("rejects an ID that is not a positive integer before a request", () => {
		const fetch = mockFetch();
		const pilgrim = client(fetch);

		expect(() => pilgrim.posts.get(0)).toThrow(/positive integer/);
		expect(() => pilgrim.posts.get(1.5)).toThrow(/positive integer/);
		expect(() => pilgrim.contacts.get(Number.NaN)).toThrow(/positive integer/);
		expect(() =>
			pilgrim.tags.update("7" as unknown as number, { title: "x" }),
		).toThrow(/positive integer/);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("throws an ApiError when a 200 body is not JSON", async () => {
		const fetch = mockFetch(html("<html>Login</html>"));

		await expect(client(fetch).posts.get(1)).rejects.toMatchObject({
			code: "api_error",
			message: expect.stringContaining("baseUrl"),
		});
	});

	it("uses the global fetch when no fetch is given", async () => {
		const fetch = mockFetch(json(200, { id: 1 }));
		vi.stubGlobal("fetch", fetch);

		await new FeedbackPilgrim({ baseUrl: BASE_URL, token: TOKEN }).posts.get(1);

		expect(fetch).toHaveBeenCalledOnce();
	});

	it("passes the abort signal of the caller to fetch", async () => {
		const controller = new AbortController();
		const fetch = mockFetch(json(200, { id: 1 }));

		await client(fetch).posts.get(1, { signal: controller.signal });

		expect(fetch.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
	});

	it("throws the reason of an aborted signal without a request", async () => {
		const fetch = mockFetch();
		const reason = new Error("stop");

		await expect(
			client(fetch).posts.get(1, { signal: AbortSignal.abort(reason) }),
		).rejects.toBe(reason);
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe("init", () => {
	it("sends the contact and returns the sign-in link", async () => {
		const authUrl = "https://acme.feedback.test/authenticate/550e8400";
		const fetch = mockFetch(json(200, { auth_url: authUrl }));

		const result = await client(fetch).init({
			email: "jane@example.com",
			name: "Jane Doe",
			plan: "premium",
		});

		const call = callOf(fetch);
		expect(call.method).toBe("POST");
		expect(call.url.pathname).toBe("/api/public/v1/init");
		expect(call.body).toEqual({
			contact: { email: "jane@example.com", name: "Jane Doe", plan: "premium" },
		});
		expect(result).toEqual({ auth_url: authUrl });
	});

	it("returns an empty object when the app sends an empty array", async () => {
		const fetch = mockFetch(json(200, []));

		expect(await client(fetch).init({ email: "" })).toEqual({});
	});

	it("does not retry a 5xx, because init writes the contact", async () => {
		const fetch = mockFetch(json(500, {}));

		await expect(
			client(fetch).init({ email: "jane@example.com" }),
		).rejects.toMatchObject({ code: "server_error" });
		expect(fetch).toHaveBeenCalledOnce();
	});
});

describe("portability", () => {
	const sourceDir = join(import.meta.dirname, "..", "src");
	const files = readdirSync(sourceDir, {
		recursive: true,
		encoding: "utf8",
	}).filter((file) => file.endsWith(".ts"));
	const nodeModules = new Set(builtinModules);

	it.each(files)(
		"%s imports no Node module and reads no Node global",
		(file) => {
			const source = readFileSync(join(sourceDir, file), "utf8");
			const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
				(match) => match[1] ?? "",
			);

			for (const specifier of specifiers) {
				expect(
					specifier.startsWith("node:") || nodeModules.has(specifier),
					specifier,
				).toBe(false);
				expect(
					specifier.startsWith("."),
					`${specifier} is a runtime dependency`,
				).toBe(true);
			}

			const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
			expect(code).not.toMatch(/\b(process|Buffer|require|__dirname)\b/);
		},
	);
});
