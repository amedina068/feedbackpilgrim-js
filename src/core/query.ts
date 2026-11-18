/** A query value. `undefined` and `null` are left out. */
export type QueryValue = string | number | boolean | null | undefined;

export type QueryParams = Readonly<Record<string, QueryValue>>;

/** Appends each parameter that has a value. A boolean becomes `true` or `false`. */
export function appendQuery(
	search: URLSearchParams,
	params: QueryParams,
): void {
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== null) {
			search.append(key, String(value));
		}
	}
}

/**
 * Checks a record ID for a path. The IDs are positive integers. Another value
 * changes the route, or the server answers with a 500.
 */
export function id(value: number): string {
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new TypeError(
			`An ID must be a positive integer. Received ${String(value)}.`,
		);
	}

	return String(value);
}
