import {
	type FetchLike,
	type RequestOptions,
	Transport,
} from "./core/transport";
import { Contacts } from "./resources/contacts";
import { Posts } from "./resources/posts";
import { ReleaseNotes } from "./resources/release-notes";
import { Tags } from "./resources/tags";
import { Testimonials } from "./resources/testimonials";

/** The settings of a `FeedbackPilgrim` client. */
export interface FeedbackPilgrimOptions {
	/**
	 * The root URL of your Feedback Pilgrim instance (its `APP_URL`), for
	 * example `https://feedback.example.com`.
	 */
	baseUrl: string | URL;
	/** An API token from Settings, API Tokens. It belongs to one client. */
	token: string;
	/** The time limit for one attempt, in milliseconds. The default is 30000. */
	timeout?: number;
	/** The maximum number of retries after the first attempt. The default is 2. Use 0 to stop retries. */
	maxRetries?: number;
	/** A `fetch` function for tests or a proxy. The global `fetch` is the default. */
	fetch?: FetchLike;
}

/** The parameters of `signInUrl()`. */
export interface SignInUrlParams {
	/** The email of the signed-in user of your app. It finds or creates the contact. */
	email: string;
	name?: string;
	/** Monthly recurring revenue. */
	mrr?: number;
	/** Lifetime value. */
	ltv?: number;
	/** The URL of an image. */
	avatar?: string;
	/** Custom fields of the contact. For a contact that exists, they replace the custom fields. */
	customFields?: Record<string, unknown>;
}

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_RETRIES = 2;

/**
 * A client for one Feedback Pilgrim instance. Use it only on the server: the
 * token gives full access to the data of its client.
 *
 * @example
 * const pilgrim = new FeedbackPilgrim({ baseUrl: 'https://feedback.example.com', token: process.env.FEEDBACKPILGRIM_TOKEN })
 * const post = await pilgrim.posts.create({ title: 'Add dark mode', content: 'Please add a dark theme.' })
 */
export class FeedbackPilgrim {
	/** `/api/public/v1/posts`. */
	readonly posts: Posts;
	/** `/api/public/v1/release-notes`. */
	readonly releaseNotes: ReleaseNotes;
	/** `/api/public/v1/contacts`. */
	readonly contacts: Contacts;
	/** `/api/public/v1/testimonials`. */
	readonly testimonials: Testimonials;
	/** `/api/public/v1/tags`. */
	readonly tags: Tags;
	readonly #transport: Transport;

	constructor(options: FeedbackPilgrimOptions) {
		if (typeof options.token !== "string" || options.token.trim() === "") {
			throw new TypeError("`token` must be an API token that is not empty.");
		}

		this.#transport = new Transport({
			baseUrl: options.baseUrl,
			token: options.token,
			timeout: positive("timeout", options.timeout ?? DEFAULT_TIMEOUT),
			maxRetries: positive(
				"maxRetries",
				options.maxRetries ?? DEFAULT_MAX_RETRIES,
				true,
			),
			fetch: options.fetch,
		});

		this.posts = new Posts(this.#transport);
		this.releaseNotes = new ReleaseNotes(this.#transport);
		this.contacts = new Contacts(this.#transport);
		this.testimonials = new Testimonials(this.#transport);
		this.tags = new Tags(this.#transport);
	}

	/**
	 * Creates or updates the contact with this email and returns a sign-in link
	 * for the public site. The link is valid for 24 hours. Send it only to that
	 * contact. `POST /api/public/v1/init`.
	 *
	 * Returns `null` when the app sends no link, for example for an empty email.
	 */
	async signInUrl(
		params: SignInUrlParams,
		options: RequestOptions = {},
	): Promise<string | null> {
		const { customFields, ...known } = params;
		const contact = { ...customFields, ...definedFields(known) };
		const body = await this.#transport.request<{ auth_url?: unknown } | []>(
			{ method: "POST", path: "/api/public/v1/init", json: { contact } },
			options,
		);

		// The app sends `[]`, not an object, when the request has no contact email.
		return !Array.isArray(body) && typeof body?.auth_url === "string"
			? body.auth_url
			: null;
	}
}

function definedFields(fields: object): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(fields).filter(([, value]) => value !== undefined),
	);
}

function positive(name: string, value: number, allowZero = false): number {
	const valid = Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);

	if (!valid) {
		throw new TypeError(
			`\`${name}\` must be a ${allowZero ? "number that is 0 or more" : "positive number"}.`,
		);
	}

	return value;
}
