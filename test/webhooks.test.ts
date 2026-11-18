import { describe, expect, it } from "vitest";
import {
	verifyWebhook,
	verifyWebhookSignature,
	WEBHOOK_HEADERS,
	WebhookVerificationError,
} from "../src/index";
import vectors from "./fixtures/webhook-signature-vectors.json" with {
	type: "json",
};
import legacy from "./fixtures/webhook-signature-vectors-legacy.json" with {
	type: "json",
};

const DELIVERY_ID = "0b8f2c4e-6a1d-4e3b-9c7f-1a2b3c4d5e6f";
const VALID = vectors.cases.find((item) => item.valid);

if (VALID === undefined) {
	throw new Error("The vectors have no valid case.");
}

const NOW = new Date(Number(VALID.timestamp) * 1000);

function headersOf(item: {
	event: string;
	timestamp: string;
	signature: string;
}): Record<string, string> {
	return {
		"X-FeedbackPilgrim-Event": item.event,
		"X-FeedbackPilgrim-Delivery": DELIVERY_ID,
		"X-FeedbackPilgrim-Timestamp": item.timestamp,
		"X-FeedbackPilgrim-Signature-V2": item.signature,
		"X-FeedbackPilgrim-Signature": "deprecated",
	};
}

async function failure(
	promise: Promise<unknown>,
): Promise<WebhookVerificationError> {
	const error = await promise.then(
		() => {
			throw new Error("The verification did not fail.");
		},
		(error: unknown) => error,
	);

	expect(error).toBeInstanceOf(WebhookVerificationError);

	return error as WebhookVerificationError;
}

describe("signature vectors", () => {
	for (const item of vectors.cases) {
		it(`${item.valid ? "accepts" : "rejects"}: ${item.name}`, async () => {
			const now = new Date(Number(item.timestamp) * 1000);

			expect(
				await verifyWebhookSignature({
					body: item.body,
					signature: item.signature,
					timestamp: item.timestamp,
					secret: vectors.secret,
					tolerance: vectors.tolerance_seconds,
					now,
				}),
			).toBe(item.valid);

			const verify = verifyWebhook({
				body: item.body,
				headers: headersOf(item),
				secret: vectors.secret,
				now,
			});

			if (item.valid) {
				const parsed = JSON.parse(item.body);
				expect(await verify).toEqual({
					deliveryId: DELIVERY_ID,
					timestamp: Number(item.timestamp),
					event: item.event,
					data: parsed.data,
				});
				return;
			}

			expect((await failure(verify)).reason).toBe("signature");
		});
	}

	it("rejects each signature of the deprecated header", async () => {
		for (const item of legacy.cases) {
			expect(
				await verifyWebhookSignature({
					body: item.body,
					signature: item.signature,
					timestamp: VALID.timestamp,
					secret: legacy.secret,
					now: NOW,
				}),
			).toBe(false);
		}
	});
});

describe("verifyWebhookSignature()", () => {
	const valid = {
		body: VALID.body,
		signature: VALID.signature,
		timestamp: VALID.timestamp,
		secret: vectors.secret,
	};
	const at = (offset: number) =>
		new Date((Number(VALID.timestamp) + offset) * 1000);

	it("accepts a timestamp 300 seconds before or after now", async () => {
		expect(await verifyWebhookSignature({ ...valid, now: at(300) })).toBe(true);
		expect(await verifyWebhookSignature({ ...valid, now: at(-300) })).toBe(
			true,
		);
	});

	it("rejects a timestamp 301 seconds before or after now", async () => {
		expect(await verifyWebhookSignature({ ...valid, now: at(301) })).toBe(
			false,
		);
		expect(await verifyWebhookSignature({ ...valid, now: at(-301) })).toBe(
			false,
		);
	});

	it("takes the tolerance as a parameter", async () => {
		expect(
			await verifyWebhookSignature({ ...valid, now: at(60), tolerance: 30 }),
		).toBe(false);
		expect(
			await verifyWebhookSignature({ ...valid, now: at(900), tolerance: 900 }),
		).toBe(true);
	});

	it("uses the current time by default", async () => {
		expect(await verifyWebhookSignature(valid)).toBe(false);
	});

	it("accepts the body as bytes or an ArrayBuffer", async () => {
		const bytes = new TextEncoder().encode(VALID.body);

		expect(
			await verifyWebhookSignature({ ...valid, body: bytes, now: NOW }),
		).toBe(true);
		expect(
			await verifyWebhookSignature({
				...valid,
				body: bytes.buffer as ArrayBuffer,
				now: NOW,
			}),
		).toBe(true);
	});

	it("accepts an uppercase signature and white space around it", async () => {
		expect(
			await verifyWebhookSignature({
				...valid,
				signature: ` ${VALID.signature.toUpperCase()} `,
				now: NOW,
			}),
		).toBe(true);
	});

	it("rejects a missing or malformed signature", async () => {
		for (const signature of [
			undefined,
			null,
			"",
			`sha256=${VALID.signature}`,
			VALID.signature.slice(1),
		]) {
			expect(
				await verifyWebhookSignature({ ...valid, signature, now: NOW }),
			).toBe(false);
		}
	});

	it("rejects a missing or malformed timestamp", async () => {
		for (const timestamp of [undefined, null, "", "abc", "-1763456789"]) {
			expect(
				await verifyWebhookSignature({ ...valid, timestamp, now: NOW }),
			).toBe(false);
		}
	});

	it("rejects a wrong secret", async () => {
		expect(
			await verifyWebhookSignature({ ...valid, secret: "other", now: NOW }),
		).toBe(false);
	});

	it("throws for an empty secret or a tolerance that is not valid", async () => {
		await expect(
			verifyWebhookSignature({ ...valid, secret: "" }),
		).rejects.toThrow(TypeError);
		await expect(
			verifyWebhookSignature({ ...valid, tolerance: Number.NaN }),
		).rejects.toThrow(/tolerance/);
		await expect(
			verifyWebhookSignature({ ...valid, tolerance: -1 }),
		).rejects.toThrow(/tolerance/);
	});
});

describe("verifyWebhook()", () => {
	const valid = {
		body: VALID.body,
		headers: headersOf(VALID),
		secret: vectors.secret,
		now: NOW,
	};

	it("exposes the delivery ID", async () => {
		const event = await verifyWebhook(valid);

		expect(event.deliveryId).toBe(DELIVERY_ID);
		expect(event.event).toBe("post.created");
		expect(event.data).toMatchObject({ id: 42, title: "Add dark mode" });
	});

	it("reads a Headers object", async () => {
		const event = await verifyWebhook({
			...valid,
			headers: new Headers(headersOf(VALID)),
		});

		expect(event.deliveryId).toBe(DELIVERY_ID);
	});

	it("reads lowercase Node.js headers and the first value of an array", async () => {
		const event = await verifyWebhook({
			...valid,
			headers: {
				[WEBHOOK_HEADERS.delivery]: [DELIVERY_ID, "other"],
				[WEBHOOK_HEADERS.timestamp]: VALID.timestamp,
				[WEBHOOK_HEADERS.signature]: VALID.signature,
				host: undefined,
			},
		});

		expect(event.deliveryId).toBe(DELIVERY_ID);
	});

	it("reads the event from the signed body, not from the header", async () => {
		const event = await verifyWebhook({
			...valid,
			headers: {
				...headersOf(VALID),
				"X-FeedbackPilgrim-Event": "post.completed",
			},
		});

		expect(event.event).toBe("post.created");
	});

	it("throws reason timestamp for an old delivery", async () => {
		const error = await failure(
			verifyWebhook({ ...valid, now: new Date(NOW.getTime() + 301_000) }),
		);

		expect(error.reason).toBe("timestamp");
		expect(error.code).toBe("webhook_verification_error");
	});

	it("takes the tolerance as a parameter", async () => {
		const event = await verifyWebhook({
			...valid,
			now: new Date(NOW.getTime() + 600_000),
			tolerance: 600,
		});

		expect(event.deliveryId).toBe(DELIVERY_ID);
	});

	it("throws reason signature when the V2 header is missing", async () => {
		const { "X-FeedbackPilgrim-Signature-V2": _, ...headers } =
			headersOf(VALID);

		expect((await failure(verifyWebhook({ ...valid, headers }))).reason).toBe(
			"signature",
		);
	});

	it("throws reason timestamp when the timestamp header is missing", async () => {
		const { "X-FeedbackPilgrim-Timestamp": _, ...headers } = headersOf(VALID);

		expect((await failure(verifyWebhook({ ...valid, headers }))).reason).toBe(
			"timestamp",
		);
	});

	it("throws reason delivery when the delivery header is missing", async () => {
		const { "X-FeedbackPilgrim-Delivery": _, ...headers } = headersOf(VALID);

		expect((await failure(verifyWebhook({ ...valid, headers }))).reason).toBe(
			"delivery",
		);
	});
});
