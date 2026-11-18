/** An ISO 8601 date with microseconds, for example `2026-06-01T09:00:00.000000Z`. */
export type Timestamp = string;

/** The status of a post. The stage of the post sets it. */
export type PostStatus = "pending" | "in_progress" | "completed";

/** The direction of a sort. */
export type SortDirection = "asc" | "desc";

/** One page of a list: the flat Laravel paginator. */
export interface Page<T> {
	data: T[];
	current_page: number;
	last_page: number;
	per_page: number;
	total: number;
	/** The number of the first record on the page, or `null` for an empty page. */
	from: number | null;
	/** The number of the last record on the page, or `null` for an empty page. */
	to: number | null;
	path: string;
	first_page_url: string;
	last_page_url: string;
	next_page_url: string | null;
	prev_page_url: string | null;
	links: PageLink[];
}

export interface PageLink {
	url: string | null;
	label: string;
	page: number | null;
	active: boolean;
}

export interface Tag {
	id: number;
	client_id: number;
	title: string;
	created_at: Timestamp;
	updated_at: Timestamp;
	/** Only in `tags.list()`. */
	posts_count?: number;
	/** Only in `tags.list()`. */
	contacts_count?: number;
}

/** A column of the post pipeline. */
export interface Stage {
	id: number;
	client_id: number;
	name: string;
	slug: string;
	color: string;
	type: "open" | "planned" | "active" | "complete" | "closed";
	show_on_roadmap: boolean;
	position: number;
	created_at: Timestamp;
	updated_at: Timestamp;
}

/** A vote of a contact on a post, a release note or a testimonial. */
export interface Vote {
	id: number;
	contact_id: number | null;
	votable_type: string;
	votable_id: number;
	created_at: Timestamp;
	updated_at: Timestamp;
}

/** A comment on a post, a release note or a testimonial. */
export interface Comment {
	id: number;
	contact_id: number | null;
	commentable_type: string;
	commentable_id: number;
	content: string;
	hidden_at: Timestamp | null;
	created_at: Timestamp;
	updated_at: Timestamp;
}

/** The fields that each contact has. */
export interface ContactFields {
	id: number;
	uuid: string;
	/** Set when the contact is the admin contact of a user. */
	user_id: number | null;
	client_id: number;
	name: string | null;
	email: string | null;
	notes: string | null;
	avatar: string | null;
	/** Monthly recurring revenue. */
	mrr: number | null;
	/** Lifetime value. */
	ltv: number | null;
	top_customer: 0 | 1;
	created_at: Timestamp;
	updated_at: Timestamp;
}

/**
 * A contact from `pilgrim.contacts`. Each custom field is a field of the
 * object, next to the fields of `ContactFields`.
 */
export interface Contact extends ContactFields {
	tags?: Tag[];
	/** Only in `contacts.list()` and `contacts.get()`. */
	votes?: Vote[];
	[customField: string]: unknown;
}

/**
 * A contact inside another record, for example the contact of a post. The
 * custom fields are one JSON string in `metadata`.
 */
export interface NestedContact extends ContactFields {
	/** The custom fields as a JSON string. Use `JSON.parse()` to read them. */
	metadata: string | null;
}

export interface Post {
	id: number;
	client_id: number;
	stage_id: number | null;
	board_id: number | null;
	contact_id: number | null;
	title: string;
	content: string | null;
	notes: string | null;
	status: PostStatus | null;
	stage_position: number | null;
	published_at: Timestamp | null;
	archived_at: Timestamp | null;
	created_at: Timestamp;
	updated_at: Timestamp;
	contact?: NestedContact | null;
	/** Only in `posts.create()` and in an update that changes the status. */
	stage?: Stage | null;
	tags?: Tag[];
	/** Only in `posts.list()` and `posts.get()`. */
	votes?: Vote[];
	/** Only in `posts.get()`. */
	comments?: Comment[];
}

export interface ReleaseNote {
	id: number;
	client_id: number;
	/** The user of the API token that made the note. */
	user_id: number;
	title: string;
	/** Markdown. */
	content: string;
	slug: string;
	/** `null` means that the note is a draft. */
	published_at: Timestamp | null;
	created_at: Timestamp;
	updated_at: Timestamp;
	tags?: Tag[];
	/** Only in `releaseNotes.list()` and `releaseNotes.get()`. */
	votes?: Vote[];
	/** Only in `releaseNotes.list()` and `releaseNotes.get()`. */
	comments?: Comment[];
}

export interface Testimonial {
	id: number;
	client_id: number;
	contact_id: number | null;
	title: string | null;
	description: string;
	/** 1 to 5. */
	rating: number | null;
	avatar_image: string | null;
	username: string | null;
	subtitle: string | null;
	/** `null` means that the testimonial is pending. */
	approved_at: Timestamp | null;
	created_at: Timestamp;
	updated_at: Timestamp;
	contact?: NestedContact | null;
	/** Only in `testimonials.list()` and `testimonials.get()`. */
	votes?: Vote[];
	/** Only in `testimonials.list()` and `testimonials.get()`. */
	comments?: Comment[];
}
