import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedbackPilgrim } from "../src/index";
import { callOf, client, empty, json, mockFetch, page } from "./helpers";

afterEach(() => {
	vi.useRealTimers();
});

interface Case {
	name: string;
	call: (pilgrim: FeedbackPilgrim) => PromiseLike<unknown>;
	reply: Response;
	method: string;
	path: string;
	query?: Record<string, string>;
	body?: unknown;
}

const RECORD = { id: 1, title: "Add dark mode" };

const cases: Case[] = [
	// Posts
	{
		name: "posts.list() with filters",
		call: (pilgrim) =>
			pilgrim.posts.list({
				search: "dark mode",
				status: "pending",
				board_id: 2,
				tag: "feature",
				published: false,
				sort_by: "title",
				sort_direction: "asc",
				per_page: 50,
			}),
		reply: json(200, page([RECORD])),
		method: "GET",
		path: "/api/public/v1/posts",
		query: {
			search: "dark mode",
			status: "pending",
			board_id: "2",
			tag: "feature",
			published: "false",
			sort_by: "title",
			sort_direction: "asc",
			per_page: "50",
			page: "1",
		},
	},
	{
		name: "posts.get()",
		call: (pilgrim) => pilgrim.posts.get(1),
		reply: json(200, RECORD),
		method: "GET",
		path: "/api/public/v1/posts/1",
	},
	{
		name: "posts.create()",
		call: (pilgrim) =>
			pilgrim.posts.create({
				title: "Add dark mode",
				content: "Please add a dark theme.",
				status: "pending",
				board_id: 1,
				tags: [1, 2],
			}),
		reply: json(201, RECORD),
		method: "POST",
		path: "/api/public/v1/posts",
		body: {
			title: "Add dark mode",
			content: "Please add a dark theme.",
			status: "pending",
			board_id: 1,
			tags: [1, 2],
		},
	},
	{
		name: "posts.update() uses PATCH",
		call: (pilgrim) => pilgrim.posts.update(1, { status: "in_progress" }),
		reply: json(200, RECORD),
		method: "PATCH",
		path: "/api/public/v1/posts/1",
		body: { status: "in_progress" },
	},
	// Release notes
	{
		name: "releaseNotes.list() with filters",
		call: (pilgrim) =>
			pilgrim.releaseNotes.list({
				published: true,
				tag: "launch",
				sort_by: "published_at",
			}),
		reply: json(200, page([RECORD])),
		method: "GET",
		path: "/api/public/v1/release-notes",
		query: {
			published: "true",
			tag: "launch",
			sort_by: "published_at",
			page: "1",
		},
	},
	{
		name: "releaseNotes.get()",
		call: (pilgrim) => pilgrim.releaseNotes.get(3),
		reply: json(200, RECORD),
		method: "GET",
		path: "/api/public/v1/release-notes/3",
	},
	{
		name: "releaseNotes.create()",
		call: (pilgrim) =>
			pilgrim.releaseNotes.create({
				title: "Version 2.1.0",
				content: "## New\n\n- Dark mode",
				published: true,
				tags: [4],
			}),
		reply: json(201, RECORD),
		method: "POST",
		path: "/api/public/v1/release-notes",
		body: {
			title: "Version 2.1.0",
			content: "## New\n\n- Dark mode",
			published: true,
			tags: [4],
		},
	},
	{
		name: "releaseNotes.update() uses PATCH",
		call: (pilgrim) => pilgrim.releaseNotes.update(3, { published: false }),
		reply: json(200, RECORD),
		method: "PATCH",
		path: "/api/public/v1/release-notes/3",
		body: { published: false },
	},
	// Contacts
	{
		name: "contacts.list() with filters",
		call: (pilgrim) =>
			pilgrim.contacts.list({ search: "jane", sort_by: "mrr", page: 2 }),
		reply: json(200, page([RECORD], 2, 2)),
		method: "GET",
		path: "/api/public/v1/contacts",
		query: { search: "jane", sort_by: "mrr", page: "2" },
	},
	{
		name: "contacts.get()",
		call: (pilgrim) => pilgrim.contacts.get(7),
		reply: json(200, RECORD),
		method: "GET",
		path: "/api/public/v1/contacts/7",
	},
	{
		name: "contacts.upsert() sends custom fields at the top level",
		call: (pilgrim) =>
			pilgrim.contacts.upsert({
				name: "Jane Smith",
				email: "jane@example.com",
				mrr: 149.99,
				plan: "pro",
				metadata: { company: "Acme" },
			}),
		reply: json(201, RECORD),
		method: "POST",
		path: "/api/public/v1/contacts",
		body: {
			name: "Jane Smith",
			email: "jane@example.com",
			mrr: 149.99,
			plan: "pro",
			metadata: { company: "Acme" },
		},
	},
	{
		name: "contacts.update() uses PATCH",
		call: (pilgrim) => pilgrim.contacts.update(7, { name: "Jane Doe" }),
		reply: json(200, RECORD),
		method: "PATCH",
		path: "/api/public/v1/contacts/7",
		body: { name: "Jane Doe" },
	},
	// Testimonials
	{
		name: "testimonials.list() with filters",
		call: (pilgrim) => pilgrim.testimonials.list({ approved: true, rating: 5 }),
		reply: json(200, page([RECORD])),
		method: "GET",
		path: "/api/public/v1/testimonials",
		query: { approved: "true", rating: "5", page: "1" },
	},
	{
		name: "testimonials.get()",
		call: (pilgrim) => pilgrim.testimonials.get(9),
		reply: json(200, RECORD),
		method: "GET",
		path: "/api/public/v1/testimonials/9",
	},
	{
		name: "testimonials.create()",
		call: (pilgrim) =>
			pilgrim.testimonials.create({
				description: "The roadmap keeps our customers in the loop.",
				username: "jane_doe",
				rating: 5,
				contact_id: 7,
			}),
		reply: json(201, RECORD),
		method: "POST",
		path: "/api/public/v1/testimonials",
		body: {
			description: "The roadmap keeps our customers in the loop.",
			username: "jane_doe",
			rating: 5,
			contact_id: 7,
		},
	},
	{
		name: "testimonials.update() sends a Date as ISO 8601",
		call: (pilgrim) =>
			pilgrim.testimonials.update(9, {
				rating: 4,
				approved_at: new Date("2026-06-01T09:00:00Z"),
			}),
		reply: json(200, RECORD),
		method: "PATCH",
		path: "/api/public/v1/testimonials/9",
		body: { rating: 4, approved_at: "2026-06-01T09:00:00.000Z" },
	},
	{
		name: "testimonials.approve() with a date",
		call: (pilgrim) =>
			pilgrim.testimonials.approve(9, new Date("2026-06-02T10:00:00Z")),
		reply: json(200, RECORD),
		method: "PATCH",
		path: "/api/public/v1/testimonials/9",
		body: { approved_at: "2026-06-02T10:00:00.000Z" },
	},
	// Tags
	{
		name: "tags.list() with filters",
		call: (pilgrim) =>
			pilgrim.tags.list({
				search: "feat",
				sort_by: "created_at",
				sort_direction: "desc",
			}),
		reply: json(200, page([RECORD])),
		method: "GET",
		path: "/api/public/v1/tags",
		query: {
			search: "feat",
			sort_by: "created_at",
			sort_direction: "desc",
			page: "1",
		},
	},
	{
		name: "tags.create()",
		call: (pilgrim) => pilgrim.tags.create({ title: "feature" }),
		reply: json(201, RECORD),
		method: "POST",
		path: "/api/public/v1/tags",
		body: { title: "feature" },
	},
	{
		name: "tags.update() uses PATCH",
		call: (pilgrim) => pilgrim.tags.update(4, { title: "enhancement" }),
		reply: json(200, RECORD),
		method: "PATCH",
		path: "/api/public/v1/tags/4",
		body: { title: "enhancement" },
	},
	{
		name: "tags.delete()",
		call: (pilgrim) => pilgrim.tags.delete(4),
		reply: empty(204),
		method: "DELETE",
		path: "/api/public/v1/tags/4",
	},
];

describe.each(cases)("$name", (item) => {
	it("sends the method, the path, the query and the body", async () => {
		const fetch = mockFetch(item.reply);

		await item.call(client(fetch));

		const call = callOf(fetch);
		expect(call.method).toBe(item.method);
		expect(call.url.pathname).toBe(item.path);
		expect(Object.fromEntries(call.url.searchParams)).toEqual(item.query ?? {});
		expect(call.body).toEqual(item.body);
	});
});

describe("responses", () => {
	it("returns the body of a single record", async () => {
		const fetch = mockFetch(json(200, RECORD));

		expect(await client(fetch).posts.get(1)).toEqual(RECORD);
	});

	it("returns the paginator body of a list", async () => {
		const body = page([RECORD]);
		const fetch = mockFetch(json(200, body));

		expect(await client(fetch).posts.list()).toEqual(body);
	});

	it("keeps the custom fields of a contact", async () => {
		const contact = { id: 7, email: "jane@example.com", plan: "pro" };
		const fetch = mockFetch(json(200, contact));

		const result = await client(fetch).contacts.get(7);

		expect(result.plan).toBe("pro");
	});

	it("returns nothing for tags.delete()", async () => {
		const fetch = mockFetch(empty(204));

		expect(await client(fetch).tags.delete(4)).toBeUndefined();
	});

	it("approves a testimonial with the current time by default", async () => {
		vi.useFakeTimers({ now: new Date("2026-11-18T12:00:00Z") });
		const fetch = mockFetch(json(200, RECORD));

		await client(fetch).testimonials.approve(9);

		expect(callOf(fetch).body).toEqual({
			approved_at: "2026-11-18T12:00:00.000Z",
		});
	});
});

describe("unsupported operations", () => {
	it("has no delete for posts, release notes, contacts and testimonials", () => {
		const pilgrim = client(mockFetch());

		for (const resource of [
			pilgrim.posts,
			pilgrim.releaseNotes,
			pilgrim.contacts,
			pilgrim.testimonials,
		]) {
			expect("delete" in resource).toBe(false);
		}
	});
});
