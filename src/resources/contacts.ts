import { id } from "../core/query";
import type { RequestOptions, Transport } from "../core/transport";
import { type PageParams, type PagePromise, paginate } from "../pagination";
import type { Contact, SortDirection } from "../types";

/** The filters of `contacts.list()`. */
export type ContactListParams = PageParams & {
	/** Returns only the contacts with this text in the name or the email. */
	search?: string;
	/** Returns only the contacts with a tag that has this exact title. */
	tag?: string;
	/** The default is `created_at`. */
	sort_by?: "created_at" | "updated_at" | "name" | "email" | "mrr" | "ltv";
	/** The default is `desc`. */
	sort_direction?: SortDirection;
};

/**
 * The fields of `contacts.upsert()`. Each field that is not named here is a
 * custom field of the contact. The custom fields can have 50 keys, 3 levels
 * and 16 KB at most. A key cannot start with `pilgrim_`.
 */
export type ContactUpsertParams = {
	name: string;
	email: string;
	/** The URL of an image. */
	avatar?: string;
	/** Monthly recurring revenue. */
	mrr?: number;
	/** Lifetime value. */
	ltv?: number;
	/** The IDs of tags of the client. This list replaces all the tags. */
	tags?: number[];
	/** Custom fields. The app merges them with the other custom fields. */
	metadata?: Record<string, unknown>;
	[customField: string]: unknown;
};

/**
 * The fields of `contacts.update()`. This call does not change custom fields:
 * use `contacts.upsert()` with the email of the contact for them.
 */
export type ContactUpdateParams = {
	name?: string;
	/** Unique in the client. */
	email?: string;
	avatar?: string;
	mrr?: number;
	ltv?: number;
	/** The IDs of tags of the client. This list replaces all the tags. */
	tags?: number[];
};

const PATH = "/api/public/v1/contacts";

/** `/api/public/v1/contacts`: the customers of the client. */
export class Contacts {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists the contacts with their tags, votes and custom fields. */
	list(
		params: ContactListParams = {},
		options: RequestOptions = {},
	): PagePromise<Contact> {
		return paginate<Contact>(this.#transport, PATH, params, options);
	}

	/** Reads one contact with its tags, votes and custom fields. */
	get(contactId: number, options: RequestOptions = {}): Promise<Contact> {
		return this.#transport.request<Contact>(
			{ method: "GET", path: `${PATH}/${id(contactId)}` },
			options,
		);
	}

	/**
	 * Creates a contact, or updates the contact of the client with the same
	 * email. The app merges the new custom fields with the old ones.
	 */
	upsert(
		params: ContactUpsertParams,
		options: RequestOptions = {},
	): Promise<Contact> {
		return this.#transport.request<Contact>(
			{
				method: "POST",
				path: PATH,
				json: params,
				// The email is the key: a repeat updates the same contact.
				idempotent: true,
			},
			options,
		);
	}

	/** Changes the fields that you send. */
	update(
		contactId: number,
		params: ContactUpdateParams,
		options: RequestOptions = {},
	): Promise<Contact> {
		return this.#transport.request<Contact>(
			{
				method: "PATCH",
				path: `${PATH}/${id(contactId)}`,
				json: params,
				idempotent: true,
			},
			options,
		);
	}
}
