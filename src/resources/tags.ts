import { id } from "../core/query";
import type { RequestOptions, Transport } from "../core/transport";
import { type PageParams, type PagePromise, paginate } from "../pagination";
import type { SortDirection, Tag } from "../types";

/** The filters of `tags.list()`. */
export type TagListParams = PageParams & {
	/** Returns only the tags with this text in the title. */
	search?: string;
	/** The default is `title`. */
	sort_by?: "title" | "created_at" | "updated_at";
	/** The default is `asc`. */
	sort_direction?: SortDirection;
};

/** The fields of `tags.create()` and `tags.update()`. */
export type TagParams = {
	/** Unique in the client. */
	title: string;
};

const PATH = "/api/public/v1/tags";

/** `/api/public/v1/tags`: labels for posts, release notes and contacts. */
export class Tags {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists the tags with `posts_count` and `contacts_count`. */
	list(
		params: TagListParams = {},
		options: RequestOptions = {},
	): PagePromise<Tag> {
		return paginate<Tag>(this.#transport, PATH, params, options);
	}

	/** Creates a tag. */
	create(params: TagParams, options: RequestOptions = {}): Promise<Tag> {
		return this.#transport.request<Tag>(
			{ method: "POST", path: PATH, json: params },
			options,
		);
	}

	/** Changes the title of a tag. */
	update(
		tagId: number,
		params: TagParams,
		options: RequestOptions = {},
	): Promise<Tag> {
		return this.#transport.request<Tag>(
			{
				method: "PATCH",
				path: `${PATH}/${id(tagId)}`,
				json: params,
				idempotent: true,
			},
			options,
		);
	}

	/** Removes the tag from each record, then deletes the tag. */
	async delete(tagId: number, options: RequestOptions = {}): Promise<void> {
		await this.#transport.request<undefined>(
			{ method: "DELETE", path: `${PATH}/${id(tagId)}` },
			options,
		);
	}
}
