// Smoke check for the built package. Each runtime entry point imports the
// package in its own way, then calls `check()` with the module.
const IDENTITY_SECRET = "test-identity-secret-0123456789abcdef";
const USER_HASH =
	"e647c020d03da660c05f059fa16b4dc6386f1d335de6b44cca7db08e9bbdc73d";
const WEBHOOK_SECRET = "test-webhook-secret-0123456789abcdefghij";
const TIMESTAMP = "1763456789";
const BODY =
	'{"event":"post.created","data":{"id":42,"title":"Add dark mode","content":"Users want a dark theme.","status":"pending","board_id":1,"contact_id":null,"stage":null}}';
const SIGNATURE =
	"2d4194d96e8fbc9affc0ff86526ba3a073d622702e09b68608bbf1fc073688e6";

export async function check(sdk, runtime) {
	const hash = await sdk.identityHash(
		"  Jane.Doe@Example.COM ",
		IDENTITY_SECRET,
	);

	if (hash !== USER_HASH) {
		throw new Error(`${runtime}: the identity hash does not match the vector.`);
	}

	const event = await sdk.verifyWebhook({
		body: BODY,
		headers: new Headers({
			"X-FeedbackPilgrim-Delivery": "0b8f2c4e-6a1d-4e3b-9c7f-1a2b3c4d5e6f",
			"X-FeedbackPilgrim-Timestamp": TIMESTAMP,
			"X-FeedbackPilgrim-Signature-V2": SIGNATURE,
		}),
		secret: WEBHOOK_SECRET,
		now: new Date(Number(TIMESTAMP) * 1000),
	});

	if (event.data.id !== 42) {
		throw new Error(`${runtime}: the webhook event does not match the vector.`);
	}

	const pilgrim = new sdk.FeedbackPilgrim({
		baseUrl: "https://feedback.example",
		token: "1|smoke-token",
		maxRetries: 0,
		fetch: async () =>
			new Response(
				JSON.stringify({
					message: "No query results for model [App\\Models\\Post] 999",
				}),
				{ status: 404, headers: { "content-type": "application/json" } },
			),
	});

	try {
		await pilgrim.posts.get(999);
		throw new Error(`${runtime}: the call did not fail.`);
	} catch (error) {
		if (!(error instanceof sdk.NotFoundError) || error.code !== "not_found") {
			throw error;
		}
	}

	console.log(`${runtime}: the smoke check passed.`);
}
