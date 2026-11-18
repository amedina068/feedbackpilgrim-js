import { id } from "../core/query";
import type { RequestOptions, Transport } from "../core/transport";
import { type PageParams, type PagePromise, paginate } from "../pagination";
import type { Post, PostStatus, SortDirection } from "../types";

/** The filters of `posts.list()`. */
export type PostListParams = PageParams & {
	/** Returns only the posts with this text in the title or the content. */
	search?: string;
	status?: PostStatus;
	board_id?: number;
	/** Returns only the posts with a tag that has this exact title. */
	tag?: string;
	/** `true` returns only published posts. `false` returns only drafts. */
	published?: boolean;
	/** The default is `created_at`. */
	sort_by?: "created_at" | "updated_at" | "title" | "status" | "published_at";
	/** The default is `desc`. */
	sort_direction?: SortDirection;
};

/** The fields of `posts.create()`. */
export type PostCreateParams = {
	title: string;
	content: string;
	/** The default is `pending`. The status sets the stage of the post. */
	status?: PostStatus;
	/** The default is the first board of the client. */
	board_id?: number;
	/** The IDs of tags of the client. */
	tags?: number[];
};

/** The fields of `posts.update()`. `tags` replaces all the tags of the post. */
export type PostUpdateParams = Partial<PostCreateParams>;

const PATH = "/api/public/v1/posts";

/** `/api/public/v1/posts`: feature requests and other feedback. */
export class Posts {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists the posts with their contact, tags and votes. */
	list(
		params: PostListParams = {},
		options: RequestOptions = {},
	): PagePromise<Post> {
		return paginate<Post>(this.#transport, PATH, params, options);
	}

	/** Reads one post with its contact, tags, votes and comments. */
	get(postId: number, options: RequestOptions = {}): Promise<Post> {
		return this.#transport.request<Post>(
			{ method: "GET", path: `${PATH}/${id(postId)}` },
			options,
		);
	}

	/** Creates a post. The app sends the `post.created` webhook. */
	create(
		params: PostCreateParams,
		options: RequestOptions = {},
	): Promise<Post> {
		return this.#transport.request<Post>(
			{ method: "POST", path: PATH, json: params },
			options,
		);
	}

	/**
	 * Changes the fields that you send. A new status moves the post to the
	 * first stage of that type, and the app sends the same emails and webhooks
	 * as a stage change in the dashboard.
	 */
	update(
		postId: number,
		params: PostUpdateParams,
		options: RequestOptions = {},
	): Promise<Post> {
		return this.#transport.request<Post>(
			{
				method: "PATCH",
				path: `${PATH}/${id(postId)}`,
				json: params,
				// The app sends the emails only when the status changes, so a
				// repeat of the same update sends nothing more.
				idempotent: true,
			},
			options,
		);
	}
}
