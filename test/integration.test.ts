import { describe, expect, it } from "vitest";
import { FeedbackPilgrim } from "../src/index";

// These tests call a real instance. They run only when both variables are
// set. They only read data: they list posts and tags.
const baseUrl = process.env.FEEDBACKPILGRIM_TEST_URL;
const token = process.env.FEEDBACKPILGRIM_TEST_TOKEN;
const enabled =
	baseUrl !== undefined &&
	baseUrl !== "" &&
	token !== undefined &&
	token !== "";

// Vitest runs the body of a skipped `describe`, so make the client only
// inside a test. In CI, a secret that is not set is an empty string.
function client(): FeedbackPilgrim {
	return new FeedbackPilgrim({
		baseUrl: baseUrl ?? "",
		token: token ?? "",
		maxRetries: 1,
	});
}

describe.skipIf(!enabled)("integration", () => {
	it("lists posts", async () => {
		const page = await client().posts.list({ per_page: 5 });

		expect(Array.isArray(page.data)).toBe(true);
		expect(page.per_page).toBe(5);
		expect(page.current_page).toBe(1);
		expect(typeof page.last_page).toBe("number");

		for (const post of page.data) {
			expect(typeof post.id).toBe("number");
			expect(typeof post.title).toBe("string");
		}
	}, 30_000);

	it("lists tags", async () => {
		const page = await client().tags.list({ per_page: 5 });

		expect(Array.isArray(page.data)).toBe(true);

		for (const tag of page.data) {
			expect(typeof tag.title).toBe("string");
			expect(typeof tag.posts_count).toBe("number");
		}
	}, 30_000);
});
