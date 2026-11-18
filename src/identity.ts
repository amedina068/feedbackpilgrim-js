import { hmacKey, requireSecret } from "./core/hmac";

/**
 * Makes the `user_hash` that proves the email of a signed-in user to the
 * widget: the HMAC-SHA256 hex digest of the normalized email, with the
 * identity secret of the client as the key.
 *
 * Call it only on the server. The identity secret must never reach a browser.
 *
 * @example
 * const userHash = await identityHash(user.email, process.env.FEEDBACKPILGRIM_IDENTITY_SECRET)
 */
export async function identityHash(
	email: string,
	identitySecret: string,
): Promise<string> {
	if (typeof email !== "string") {
		throw new TypeError("`email` must be a string.");
	}

	requireSecret(identitySecret, "identitySecret");

	const key = await hmacKey(identitySecret, "sign");
	const digest = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(normalizeEmail(email)),
	);

	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

// PHP `trim()` removes only these characters.
const PHP_TRIM = " \t\n\r\0\x0B";

/**
 * Normalizes an email like PHP `strtolower(trim($email))`. `String#trim()` and
 * `toLowerCase()` change more characters than PHP, and then the hash does not
 * match the hash of the app.
 */
export function normalizeEmail(email: string): string {
	let start = 0;
	let end = email.length;

	while (start < end && PHP_TRIM.includes(email.charAt(start))) {
		start++;
	}

	while (end > start && PHP_TRIM.includes(email.charAt(end - 1))) {
		end--;
	}

	// PHP 8 `strtolower()` changes only the ASCII letters A to Z.
	return email
		.slice(start, end)
		.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}
