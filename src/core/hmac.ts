/** Imports a secret as an HMAC-SHA256 key for Web Crypto. */
export function hmacKey(
	secret: string,
	usage: "sign" | "verify",
): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		[usage],
	);
}

/** Checks that a secret is a string that is not empty. */
export function requireSecret(secret: unknown, name: string): void {
	if (typeof secret !== "string" || secret === "") {
		throw new TypeError(`\`${name}\` must be a string that is not empty.`);
	}
}
