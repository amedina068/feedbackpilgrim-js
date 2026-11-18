import type { QueryParams } from "./core/query";
import type { RequestOptions, Transport } from "./core/transport";
import type { Page } from "./types";

/** The parameters that each list accepts. */
export type PageParams = {
	/** The number of records on each page: 1 to 100. The default is 15. */
	per_page?: number;
	/** The first page to read. The default is 1. */
	page?: number;
};

/**
 * Makes a `PagePromise` for a list endpoint. The SDK asks for the next page
 * by number, with the same filters. It does not follow `next_page_url`,
 * because that URL uses the `APP_URL` of the instance, not `baseUrl`.
 */
export function paginate<TItem>(
	transport: Transport,
	path: string,
	query: QueryParams & PageParams,
	options: RequestOptions,
): PagePromise<TItem> {
	return new PagePromise(
		(page) =>
			transport.request<Page<TItem>>(
				{ method: "GET", path, query: { ...query, page } },
				options,
			),
		query.page ?? 1,
	);
}

/**
 * The result of a list call. Use `await` to get the first page. Use
 * `for await` to get each item of each page. The SDK loads a page only when
 * the loop needs it.
 *
 * @example
 * const page = await pilgrim.posts.list()
 * for await (const post of pilgrim.posts.list({ status: 'pending' })) {
 * 	console.log(post.title)
 * }
 */
export class PagePromise<TItem>
	implements PromiseLike<Page<TItem>>, AsyncIterable<TItem>
{
	readonly #load: (page: number) => Promise<Page<TItem>>;
	readonly #start: number;
	#first: Promise<Page<TItem>> | undefined;

	constructor(load: (page: number) => Promise<Page<TItem>>, start = 1) {
		this.#load = load;
		this.#start = start;
	}

	// biome-ignore lint/suspicious/noThenProperty: The class is awaitable on purpose.
	then<TResult1 = Page<TItem>, TResult2 = never>(
		onfulfilled?:
			| ((page: Page<TItem>) => TResult1 | PromiseLike<TResult1>)
			| null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2> {
		return this.#firstPage().then(onfulfilled, onrejected);
	}

	/** Yields each page, from the first page to the last page. */
	async *pages(): AsyncGenerator<Page<TItem>, void, undefined> {
		let page = await this.#firstPage();

		while (true) {
			yield page;

			if (page.current_page >= page.last_page) {
				return;
			}

			page = await this.#load(page.current_page + 1);
		}
	}

	/** Yields each item of each page. */
	async *[Symbol.asyncIterator](): AsyncGenerator<TItem, void, undefined> {
		for await (const page of this.pages()) {
			yield* page.data;
		}
	}

	/** Loads every item into one array. Use it only for short lists. */
	async toArray(): Promise<TItem[]> {
		const items: TItem[] = [];

		for await (const item of this) {
			items.push(item);
		}

		return items;
	}

	#firstPage(): Promise<Page<TItem>> {
		this.#first ??= this.#load(this.#start);

		return this.#first;
	}
}
