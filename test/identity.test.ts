import { describe, expect, it } from "vitest";
import { identityHash, normalizeEmail } from "../src/index";
import vectors from "./fixtures/identity-hash-vectors.json" with {
	type: "json",
};

describe("identity hash vectors", () => {
	for (const item of vectors.cases) {
		it(item.name, async () => {
			expect(normalizeEmail(item.email)).toBe(item.normalized_email);
			expect(await identityHash(item.email, vectors.identity_secret)).toBe(
				item.user_hash,
			);
		});
	}
});

describe("normalizeEmail()", () => {
	it("trims the six characters of PHP trim() at both ends", () => {
		expect(normalizeEmail(" \t\n\r\0\x0Bjane@example.com\x0B\0\r\n\t ")).toBe(
			"jane@example.com",
		);
	});

	it("keeps other white space, like PHP", () => {
		// A form feed and a no-break space are not in the PHP trim list.
		const email = `\fjane@example.com${String.fromCharCode(0xa0)}`;

		expect(normalizeEmail(email)).toBe(email);
	});

	it("keeps the characters inside the email", () => {
		expect(normalizeEmail(" A B@C.D ")).toBe("a b@c.d");
	});

	it("does not change letters that are not ASCII", () => {
		expect(normalizeEmail("ÉLODIE.İ@EXAMPLE.COM")).toBe("Élodie.İ@example.com");
	});
});

describe("identityHash()", () => {
	it("gives a lowercase hex digest of 64 characters", async () => {
		expect(await identityHash("jane@example.com", "secret")).toMatch(
			/^[0-9a-f]{64}$/,
		);
	});

	it("rejects an empty secret", async () => {
		await expect(identityHash("jane@example.com", "")).rejects.toThrow(
			/identitySecret/,
		);
	});

	it("rejects an email that is not a string", async () => {
		await expect(
			identityHash(undefined as unknown as string, "secret"),
		).rejects.toThrow(/email/);
	});
});
