export {
	FeedbackPilgrim,
	type FeedbackPilgrimOptions,
	type InitContact,
	type InitResult,
} from "./client";
export type { FetchLike, RequestOptions } from "./core/transport";
export {
	type AnyFeedbackPilgrimError,
	ApiError,
	type ApiErrorCode,
	AuthenticationError,
	AuthorizationError,
	ConnectionError,
	FeedbackPilgrimError,
	type FeedbackPilgrimErrorCode,
	isFeedbackPilgrimError,
	MethodNotAllowedError,
	NotFoundError,
	RateLimitError,
	ServerError,
	TimeoutError,
	ValidationError,
	type WebhookFailureReason,
	WebhookVerificationError,
} from "./errors";
export { identityHash, normalizeEmail } from "./identity";
export { type PageParams, PagePromise } from "./pagination";
export type {
	ContactListParams,
	Contacts,
	ContactUpdateParams,
	ContactUpsertParams,
} from "./resources/contacts";
export type {
	PostCreateParams,
	PostListParams,
	Posts,
	PostUpdateParams,
} from "./resources/posts";
export type {
	ReleaseNoteCreateParams,
	ReleaseNoteListParams,
	ReleaseNotes,
	ReleaseNoteUpdateParams,
} from "./resources/release-notes";
export type { TagListParams, TagParams, Tags } from "./resources/tags";
export type {
	TestimonialCreateParams,
	TestimonialListParams,
	Testimonials,
	TestimonialUpdateParams,
} from "./resources/testimonials";
export type * from "./types";
export {
	type VerifyWebhookOptions,
	type VerifyWebhookSignatureOptions,
	verifyWebhook,
	verifyWebhookSignature,
	WEBHOOK_HEADERS,
	type WebhookBody,
	type WebhookEvent,
	type WebhookEventType,
	type WebhookHeaders,
	type WebhookPost,
} from "./webhooks";
