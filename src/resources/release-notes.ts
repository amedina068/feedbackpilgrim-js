import { id } from "../core/query";
import type { RequestOptions, Transport } from "../core/transport";
import { type PageParams, type PagePromise, paginate } from "../pagination";
import type { ReleaseNote, SortDirection } from "../types";

/** The filters of `releaseNotes.list()`. */
export type ReleaseNoteListParams = PageParams & {
	/** Returns only the notes with this text in the title or the content. */
	search?: string;
	/** `true` returns only published notes. `false` returns only drafts. */
	published?: boolean;
	/** Returns only the notes with a tag that has this exact title. */
	tag?: string;
	/** The default is `created_at`. */
	sort_by?: "created_at" | "updated_at" | "title" | "published_at";
	/** The default is `desc`. */
	sort_direction?: SortDirection;
};

/** The fields of `releaseNotes.create()`. */
export type ReleaseNoteCreateParams = {
	title: string;
	/** Markdown. */
	content: string;
	/** `true` publishes the note now. The default is a draft. */
	published?: boolean;
	/** The IDs of tags of the client. */
	tags?: number[];
};

/**
 * The fields of `releaseNotes.update()`. `published: true` keeps a
 * publication date that exists. `published: false` clears it. `tags`
 * replaces all the tags of the note.
 */
export type ReleaseNoteUpdateParams = Partial<ReleaseNoteCreateParams>;

const PATH = "/api/public/v1/release-notes";

/** `/api/public/v1/release-notes`: changelog entries. */
export class ReleaseNotes {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists the release notes with their tags, votes and comments. */
	list(
		params: ReleaseNoteListParams = {},
		options: RequestOptions = {},
	): PagePromise<ReleaseNote> {
		return paginate<ReleaseNote>(this.#transport, PATH, params, options);
	}

	/** Reads one release note with its tags, votes and comments. */
	get(
		releaseNoteId: number,
		options: RequestOptions = {},
	): Promise<ReleaseNote> {
		return this.#transport.request<ReleaseNote>(
			{ method: "GET", path: `${PATH}/${id(releaseNoteId)}` },
			options,
		);
	}

	/** Creates a release note. The user of the API token becomes the author. */
	create(
		params: ReleaseNoteCreateParams,
		options: RequestOptions = {},
	): Promise<ReleaseNote> {
		return this.#transport.request<ReleaseNote>(
			{ method: "POST", path: PATH, json: params },
			options,
		);
	}

	/** Changes the fields that you send. */
	update(
		releaseNoteId: number,
		params: ReleaseNoteUpdateParams,
		options: RequestOptions = {},
	): Promise<ReleaseNote> {
		return this.#transport.request<ReleaseNote>(
			{
				method: "PATCH",
				path: `${PATH}/${id(releaseNoteId)}`,
				json: params,
				idempotent: true,
			},
			options,
		);
	}
}
