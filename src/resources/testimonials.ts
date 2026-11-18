import { id } from "../core/query";
import type { RequestOptions, Transport } from "../core/transport";
import { type PageParams, type PagePromise, paginate } from "../pagination";
import type { SortDirection, Testimonial } from "../types";

/** The filters of `testimonials.list()`. */
export type TestimonialListParams = PageParams & {
	/** Returns only the testimonials with this text in the description or the username. */
	search?: string;
	/**
	 * `true` returns only approved testimonials. `false` returns only pending
	 * testimonials. Without it, the list has only the pending testimonials.
	 */
	approved?: boolean;
	/** Returns only the testimonials with this rating: 1 to 5. */
	rating?: number;
	/** The default is `created_at`. */
	sort_by?: "created_at" | "updated_at" | "rating" | "approved_at";
	/** The default is `desc`. */
	sort_direction?: SortDirection;
};

/** The fields of `testimonials.create()`. */
export type TestimonialCreateParams = {
	description: string;
	username: string;
	/** 1 to 5. */
	rating?: number;
	/** The ID of a contact of the client. */
	contact_id?: number;
};

/** The fields of `testimonials.update()`. */
export type TestimonialUpdateParams = {
	description?: string;
	username?: string;
	/** 1 to 5. */
	rating?: number;
	/** The approval date. Set it to approve the testimonial. */
	approved_at?: Date | string;
};

const PATH = "/api/public/v1/testimonials";

/** `/api/public/v1/testimonials`: customer testimonials. */
export class Testimonials {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists the testimonials with their contact, votes and comments. */
	list(
		params: TestimonialListParams = {},
		options: RequestOptions = {},
	): PagePromise<Testimonial> {
		return paginate<Testimonial>(this.#transport, PATH, params, options);
	}

	/** Reads one testimonial with its contact, votes and comments. */
	get(
		testimonialId: number,
		options: RequestOptions = {},
	): Promise<Testimonial> {
		return this.#transport.request<Testimonial>(
			{ method: "GET", path: `${PATH}/${id(testimonialId)}` },
			options,
		);
	}

	/** Creates a pending testimonial. */
	create(
		params: TestimonialCreateParams,
		options: RequestOptions = {},
	): Promise<Testimonial> {
		return this.#transport.request<Testimonial>(
			{ method: "POST", path: PATH, json: params },
			options,
		);
	}

	/** Changes the fields that you send. */
	update(
		testimonialId: number,
		params: TestimonialUpdateParams,
		options: RequestOptions = {},
	): Promise<Testimonial> {
		return this.#transport.request<Testimonial>(
			{
				method: "PATCH",
				path: `${PATH}/${id(testimonialId)}`,
				json: params,
				idempotent: true,
			},
			options,
		);
	}

	/** Approves a testimonial. The approval date is `at`, or now. */
	approve(
		testimonialId: number,
		at: Date = new Date(),
		options: RequestOptions = {},
	): Promise<Testimonial> {
		return this.update(testimonialId, { approved_at: at }, options);
	}
}
