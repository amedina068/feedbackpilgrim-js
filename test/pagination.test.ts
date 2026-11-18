import { describe, expect, it } from "vitest";
import { type Page, PagePromise } from "../src/index";
import { callOf, client, json, mockFetch, page } from "./helpers";

describe("PagePromise", () => {
	it("gives the first page with await", async () => {
		const fetch = mockFetch(json(200, page([{ id: 1 }], 1, 3)));

		const first = await client(fetch).posts.list();

		expect(first.current_page).toBe(1);
		expect(first.last_page).toBe(3);
		expect(first.data).toEqual([{ id: 1 }]);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("reads each item of each page with for await", async () => {
		const fetch = mockFetch(
			json(200, page([{ id: 1 }, { id: 2 }], 1, 3, 2)),
			json(200, page([{ id: 3 }, { id: 4 }], 2, 3, 2)),
			json(200, page([{ id: 5 }], 3, 3, 2)),
		);
		const ids: number[] = [];

		for await (const post of client(fetch).posts.list({
			status: "pending",
			per_page: 2,
		})) {
			ids.push(post.id);
		}

		expect(ids).toEqual([1, 2, 3, 4, 5]);
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(
			fetch.mock.calls.map((_, index) =>
				Object.fromEntries(callOf(fetch, index).url.searchParams),
			),
		).toEqual([
			{ status: "pending", per_page: "2", page: "1" },
			{ status: "pending", per_page: "2", page: "2" },
			{ status: "pending", per_page: "2", page: "3" },
		]);
	});

	it("asks for the next page on baseUrl, not on next_page_url", async () => {
		const body = {
			...page([{ id: 1 }], 1, 2),
			next_page_url: "http://localhost/api/public/v1/tags?page=2",
		};
		const fetch = mockFetch(
			json(200, body),
			json(200, page([{ id: 2 }], 2, 2)),
		);

		await client(fetch).tags.list().toArray();

		expect(callOf(fetch, 1).url.origin).toBe("https://feedback.test");
	});

	it("starts at the page of the parameters", async () => {
		const fetch = mockFetch(
			json(200, page([{ id: 3 }], 2, 3)),
			json(200, page([{ id: 4 }], 3, 3)),
		);

		expect(await client(fetch).contacts.list({ page: 2 }).toArray()).toEqual([
			{ id: 3 },
			{ id: 4 },
		]);
		expect(callOf(fetch, 0).url.searchParams.get("page")).toBe("2");
	});

	it("stops after one empty page", async () => {
		const fetch = mockFetch(json(200, page([], 1, 1)));

		expect(await client(fetch).testimonials.list().toArray()).toEqual([]);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("yields each page with pages()", async () => {
		const fetch = mockFetch(
			json(200, page([{ id: 1 }], 1, 2)),
			json(200, page([{ id: 2 }], 2, 2)),
		);
		const numbers: number[] = [];

		for await (const each of client(fetch).releaseNotes.list().pages()) {
			numbers.push(each.current_page);
		}

		expect(numbers).toEqual([1, 2]);
	});

	it("loads the first page one time for await and for await", async () => {
		const fetch = mockFetch(json(200, page([{ id: 1 }], 1, 1)));
		const list = client(fetch).posts.list();

		await list;
		expect(await list.toArray()).toEqual([{ id: 1 }]);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("loads nothing before the first await", () => {
		const fetch = mockFetch();

		client(fetch).posts.list();

		expect(fetch).not.toHaveBeenCalled();
	});

	it("rejects the await when the first page fails", async () => {
		const fetch = mockFetch(json(401, { message: "Unauthenticated." }));

		await expect(client(fetch).posts.list()).rejects.toMatchObject({
			code: "authentication_error",
		});
	});

	it("works with a custom loader", async () => {
		const list = new PagePromise<number>(
			async (number) => page([number], number, 2) as unknown as Page<number>,
		);

		expect(await list.toArray()).toEqual([1, 2]);
	});
});
