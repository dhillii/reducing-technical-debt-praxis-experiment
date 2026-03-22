# Refactored ActivityPub API

## Key Refactoring Strategies Applied

1. **Extracted helper methods** to eliminate repeated pagination patterns
2. **Unified action methods** using a generic `performAction` helper
3. **Consolidated URL building** into a dedicated method
4. **Extracted response parsing** utilities to reduce duplication
5. **Simplified null-check patterns** with a reusable helper

```typescript
import {ActorProperties} from '@tryghost/admin-x-framework/api/activitypub';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Actor = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Activity = any;

export interface Account {
    id: string;
    apId: string;
    name: string;
    handle: string;
    bio: string;
    url: string;
    avatarUrl: string;
    bannerImageUrl: string | null;
    customFields: Record<string, string>;
    postCount: number;
    likedCount: number;
    followingCount: number;
    followerCount: number;
    followsMe: boolean;
    followedByMe: boolean;
    blockedByMe: boolean;
    domainBlockedByMe: boolean;
    attachment: { name: string; value: string }[];
    blueskyEnabled?: boolean;
    blueskyHandleConfirmed?: boolean;
    blueskyHandle?: string | null;
}

export type AccountSearchResult = Pick<
    Account,
    'id' | 'name' | 'handle' | 'avatarUrl' | 'followedByMe' | 'blockedByMe' | 'domainBlockedByMe'
>;

export type ExploreAccount = Pick<
    Account,
    'id' | 'name' | 'handle' | 'avatarUrl' | 'bio' | 'url' | 'followedByMe'
>;

export interface TopicData {
    slug: string;
    name: string;
}

export interface GetTopicsResponse {
    topics: TopicData[];
}

export interface GetRecommendationsResponse {
    accounts: ExploreAccount[];
}

export interface SearchResults {
    accounts: AccountSearchResult[];
}

export interface Thread {
    posts: Post[];
}

export interface ReplyChainResponse {
    ancestors: {
        chain: Post[];
        hasMore: boolean;
    };
    post: Post;
    children: Array<{
        post: Post;
        chain: Post[];
        hasMore: boolean;
    }>;
    next: string | null;
}

export type ActivityPubCollectionResponse<T> = {data: T[], next: string | null};

export interface GetProfileFollowersResponse {
    followers: {
        actor: Actor;
        isFollowing: boolean;
    }[];
    next: string | null;
}

export interface GetProfileFollowingResponse {
    following: {
        actor: Actor;
        isFollowing: boolean;
    }[];
    next: string | null;
}

export interface GetProfilePostsResponse {
    posts: Activity[];
    next: string | null;
}

export type AccountFollowsType = 'following' | 'followers';

type GetAccountResponse = Account;

export type FollowAccount = Pick<
    Account,
    'id' | 'name' | 'handle' | 'avatarUrl' | 'blockedByMe' | 'domainBlockedByMe'
> & {isFollowing: true};

export interface GetAccountFollowsResponse {
    accounts: FollowAccount[];
    next: string | null;
}

export interface Notification {
    id: string;
    type: 'like' | 'reply' | 'repost' | 'follow' | 'mention';
    actor: {
        id: string;
        name: string;
        url: string;
        handle: string;
        avatarUrl: string | null;
        followedByMe?: boolean;
    };
    post: null | {
        id: string;
        type: 'article' | 'note';
        title: string | null;
        content: string;
        url: string;
        likeCount: number;
        likedByMe: boolean;
        repostCount: number;
        repostedByMe: boolean;
        replyCount: number;
        attachments?: Attachment[];
    };
    inReplyTo: null | {
        id: string;
        type: 'article' | 'note';
        title: string | null;
        content: string;
        url: string;
    };
    createdAt: string;
}

export interface Attachment {
    type: string;
    mediaType: string;
    name: string;
    url: string;
}

export interface GetNotificationsResponse {
    notifications: Notification[];
    next: string | null;
}

export interface GetNotificationsCountResponse {
    count: number;
}

export interface GetBlockedAccountsResponse {
    accounts: Account[];
    next: string | null;
}

export interface GetBlockedDomainsResponse {
    domains: Account[];
    next: string | null;
}

export enum PostType {
    Note = 0,
    Article = 1,
    Tombstone = 2
}

export type PostAuthor = Pick<Account, 'id' | 'handle' | 'avatarUrl' | 'name' | 'url' | 'followedByMe'>;

export interface Post {
    id: string;
    type: PostType;
    title: string;
    excerpt: string;
    summary: string | null;
    content: string;
    url: string;
    featureImageUrl: string | null;
    publishedAt: string;
    likeCount: number;
    likedByMe: boolean;
    replyCount: number;
    readingTimeMinutes: number;
    attachments: Attachment[];
    author: PostAuthor;
    authoredByMe: boolean;
    repostCount: number;
    repostedByMe: boolean;
    repostedBy: PostAuthor | null;
    metadata?: {
        ghostAuthors?: Array<{
            name: string;
            profile_image: string;
        }>;
    };
}

export interface PaginatedPostsResponse {
    posts: Post[];
    next: string | null;
}

export interface PaginatedAccountsResponse {
    accounts: Account[];
    next: string | null;
}

export interface PaginatedExploreAccountsResponse {
    accounts: ExploreAccount[];
    next: string | null;
}

export type ApiError = {
    message: string;
    statusCode: number;
    code?: string;
};

export const isApiError = (error: unknown): error is ApiError => {
    return (
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        'message' in error &&
        typeof (error as ApiError).statusCode === 'number' &&
        typeof (error as ApiError).message === 'string'
    );
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type JsonObject = Record<string, unknown>;

/** Safely extract a string `next` cursor from a JSON response. */
function extractNextCursor(json: JsonObject): string | null {
    return typeof json.next === 'string' ? json.next : null;
}

/** Safely extract an array from a JSON response by key. */
function extractArray<T>(json: JsonObject, key: string): T[] {
    return Array.isArray(json[key]) ? (json[key] as T[]) : [];
}

/** Build a paginated response object with a typed array and next cursor. */
function buildPaginatedResponse<K extends string, T>(
    key: K,
    json: JsonObject | null,
    fallback: Record<K, T[]> & {next: null}
): Record<K, T[]> & {next: string | null} {
    if (json === null || !(key in json)) {
        return fallback;
    }
    return {
        [key]: extractArray<T>(json, key),
        next: extractNextCursor(json)
    } as Record<K, T[]> & {next: string | null};
}

// ---------------------------------------------------------------------------

export class ActivityPubAPI {
    constructor(
        private readonly apiUrl: URL,
        private readonly authApiUrl: URL,
        private readonly handle: string,
        private readonly fetch: (resource: URL, init?: RequestInit) => Promise<Response> = window.fetch.bind(window)
    ) {}

    // -------------------------------------------------------------------------
    // Auth / low-level fetch
    // -------------------------------------------------------------------------

    private async getToken(): Promise<string | null> {
        try {
            const response = await this.fetch(this.authApiUrl);
            const json = await response.json();
            return json?.identities?.[0]?.token ?? null;
        } catch {
            return null;
        }
    }

    private async fetchJSON(
        url: URL,
        method: 'DELETE' | 'GET' | 'POST' | 'PUT' = 'GET',
        body?: object
    ): Promise<JsonObject | null> {
        const token = await this.getToken();
        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/activity+json'
        };

        const options: RequestInit = {method, headers};

        if (body) {
            options.body = JSON.stringify(body);
            headers['Content-Type'] = 'application/json';
        }

        const response = await this.fetch(url, options);

        if (response.status === 204 || response.status === 202) {
            return null;
        }

        if (!response.ok) {
            throw await this.buildApiError(response);
        }

        return response.json() as Promise<JsonObject>;
    }

    private async buildApiError(response: Response): Promise<ApiError> {
        const error: ApiError = {
            message: 'Something went wrong, please try again.',
            statusCode: response.status
        };

        try {
            const json = await response.json();
            const errorMessage = json.message || json.error;
            if (errorMessage) {
                error.message = errorMessage;
            }
            if (json.code) {
                error.code = json.code;
            }
        } catch {
            // Keep the default message
        }

        return error;
    }

    // -------------------------------------------------------------------------
    // URL helpers
    // -------------------------------------------------------------------------

    private buildUrl(path: string, params?: Record<string, string>): URL {
        const url = new URL(path, this.apiUrl);
        if (params) {
            Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
        }
        return url;
    }

    private buildActionUrl(action: string, id?: string): URL {
        const encoded = id ? encodeURIComponent(id) : '';
        const path = encoded
            ? `.ghost/activitypub/v1/actions/${action}/${encoded}`
            : `.ghost/activitypub/v1/actions/${action}`;
        return this.buildUrl(path);
    }

    get userApiUrl(): URL {
        return this.buildUrl(`.ghost/activitypub/users/${this.handle}`);
    }

    get searchApiUrl(): URL {
        return this.buildUrl('.ghost/activitypub/v1/actions/search');
    }

    // -------------------------------------------------------------------------
    // Simple POST actions (block / unblock / like / unlike / repost / derepost)
    // -------------------------------------------------------------------------

    private async performAction(action: string, id?: string): Promise<void> {
        await this.fetchJSON(this.buildActionUrl(action, id), 'POST');
    }

    async blockDomain(domain: URL): Promise<boolean> {
        await this.performAction('block/domain', domain.href);
        return true;
    }

    async unblockDomain(domain: URL): Promise<boolean> {
        await this.performAction('unblock/domain', domain.href);
        return true;
    }

    async block(id: URL): Promise<boolean> {
        await this.performAction('block', id.href);
        return true;
    }

    async unblock(id: URL): Promise<boolean> {
        await this.performAction('unblock', id.href);
        return true;
    }

    async like(id: string): Promise<void> {
        await this.performAction('like', id);
    }

    async unlike(id: string): Promise<void> {
        await this.performAction('unlike', id);
    }

    async repost(id: string): Promise<void> {
        await this.performAction('repost', id);
    }

    async derepost(id: string): Promise<void> {
        await this.performAction('derepost', id);
    }

    // -------------------------------------------------------------------------
    // Social graph
    // -------------------------------------------------------------------------

    async follow(username: string): Promise<Actor> {
        return this.fetchJSON(this.buildActionUrl('follow', username), 'POST') as Promise<Actor>;
    }

    async unfollow(username: string): Promise<Actor> {
        return this.fetchJSON(this.buildActionUrl('unfollow', username), 'POST') as Promise<Actor>;
    }

    // -------------------------------------------------------------------------
    // Content creation
    // -------------------------------------------------------------------------

    private buildContentBody(
        content: string,
        image?: {url: string; altText?: string}
    ): {content: string; image?: {url: string; altText?: string}} {
        return image ? {content, image} : {content};
    }

    async reply(
        id: string,
        content: string,
        image?: {url: string; altText?: string}
    ): Promise<Activity> {
        const url = this.buildActionUrl('reply', id);
        return this.fetchJSON(url, 'POST', this.buildContentBody(content, image));
    }

    async note(content: string, image?: {url: string; altText?: string}): Promise<Post> {
        const url = this.buildUrl('.ghost/activitypub/v1/actions/note');
        const response = await this.fetchJSON(url, 'POST', this.buildContentBody(content, image));
        return (response as {post: Post}).post;
    }

    async delete(id: string): Promise<void> {
        const url = this.buildUrl(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`);
        await this.fetchJSON(url, 'DELETE');
    }

    // -------------------------------------------------------------------------
    // User / account
    // -------------------------------------------------------------------------

    async getUser(): Promise<ActorProperties> {
        return this.fetchJSON(this.userApiUrl) as Promise<ActorProperties>;
    }

    async search(query: string): Promise<SearchResults> {
        const url = this.searchApiUrl;
        url.searchParams.set('query', query);
        const json = await this.fetchJSON(url);
        return (json && 'accounts' in json ? json : {accounts: []}) as SearchResults;
    }

    async getAccount(handle: string): Promise<GetAccountResponse> {
        const url = this.buildUrl(`.ghost/activitypub/v1/account/${handle}`);
        return this.fetchJSON(url) as Promise<GetAccountResponse>;
    }

    async getAccountFollows(
        handle: string,
        type: AccountFollowsType,
        next?: string
    ): Promise<GetAccountFollowsResponse> {
        const url = this.buildUrl(
            `.ghost/activitypub/v1/account/${handle}/follows/${type}`,
            next ? {next} : undefined
        );
        const json = await this.fetchJSON(url);
        return buildPaginatedResponse('accounts', json, {accounts: [], next: null}) as GetAccountFollowsResponse;
    }

    async updateAccount({name, username, bio, avatarUrl, bannerImageUrl}: {
        name: string;
        username: string;
        bio: string;
        avatarUrl: string;
        bannerImageUrl: string;
    }): Promise<void> {
        const url = this.buildUrl('.ghost/activitypub/v1/account');
        await this.fetchJSON(url, 'PUT', {name, username, bio, avatarUrl, bannerImageUrl});
    }

    // -------------------------------------------------------------------------
    // Posts / feeds
    // -------------------------------------------------------------------------

    async getThread(id: string): Promise<Thread> {
        const url = this.buildUrl(`.ghost/activitypub/v1/thread/${encodeURIComponent(id)}`);
        return this.fetchJSON(url) as Promise<Thread>;
    }

    async getPost(id: string): Promise<Post> {
        const url = this.buildUrl(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`);
        return this.fetchJSON(url) as Promise<Post>;
    }

    async getReplies(postApId: string, next?: string): Promise<ReplyChainResponse> {
        const url = this.buildUrl(
            `.ghost/activitypub/v1/replies/${encodeURIComponent(postApId)}`,
            next ? {next} : undefined
        );
        return this.fetchJSON(url) as Promise<ReplyChainResponse>;
    }

    async getFeed(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts('.ghost/activitypub/v1/feed/notes', next);
    }

    async getInbox(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts('.ghost/activitypub/v1/feed/reader', next);
    }

    async getDiscoveryFeed(topic: string, next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts(`.ghost/activitypub/v1/feed/discover/${topic}`, next);
    }

    async getPostsByAccount(handle: string, next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts(`.ghost/activitypub/v1/posts/${handle}`, next);
    }

    async getPostsLikedByAccount(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts('.ghost/activitypub/v1/posts/me/liked', next);
    }

    private async getPaginatedPosts(endpoint: string, next?: string): Promise<PaginatedPostsResponse> {
        const url = this.buildUrl(endpoint, next ? {next} : undefined);
        const json = await this.fetchJSON(url);
        return buildPaginatedResponse('posts', json, {posts: [], next: null}) as PaginatedPostsResponse;
    }

    // -------------------------------------------------------------------------
    // Explore
    // -------------------------------------------------------------------------

    async getExploreAccounts(topic: string, next?: string): Promise<PaginatedExploreAccountsResponse> {
        return this.getPaginatedExploreAccounts(`.ghost/activitypub/v1/explore/${topic}`, next);
    }

    async getTopics(): Promise<GetTopicsResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/topics');
        const json = await this.fetchJSON(url);
        return {
            topics: (json && 'topics' in json && Array.isArray(json.topics)) ? json.topics as TopicData[] : []
        };
    }

    async getRecommendations(limit?: number): Promise<GetRecommendationsResponse> {
        const url = this.buildUrl(
            '.ghost/activitypub/v1/recommendations',
            limit ? {limit: limit.toString()} : undefined
        );
        const json = await this.fetchJSON(url);
        return buildPaginatedResponse('accounts', json, {accounts: [], next: null}) as GetRecommendationsResponse;
    }

    private async getPaginatedExploreAccounts(
        endpoint: string,
        next?: string
    ): Promise<PaginatedExploreAccountsResponse> {
        const url = this.buildUrl(endpoint, next ? {next} : undefined);
        const json = await this.fetchJSON(url);
        return buildPaginatedResponse('accounts', json, {accounts: [], next: null}) as PaginatedExploreAccountsResponse;
    }

    // -------------------------------------------------------------------------
    // Notifications
    // -------------------------------------------------------------------------

    async getNotifications(next?: string): Promise<GetNotificationsResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/notifications', next ? {next} : undefined);
        const json = await this.fetchJSON(url);
        return buildPaginatedResponse('notifications', json, {notifications: [], next: null}) as GetNotificationsResponse;
    }

    async getNotificationsCount(): Promise<GetNotificationsCountResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/notifications/unread/count');
        const json = await this.fetchJSON(url);
        const count = typeof (json as JsonObject | null)?.count === 'number'
            ? (json as {count: number}).count
            : 0;
        return {count};
    }

    async resetNotificationsCount(): Promise<boolean> {
        const url = this.buildUrl('.ghost/activitypub/v1/notifications/unread/reset');
        await this.fetchJSON(url, 'PUT');
        return true;
    }

    // -------------------------------------------------------------------------
    // Blocks
    // -------------------------------------------------------------------------

    async getBlockedAccounts(next?: string): Promise<GetBlockedAccountsResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/blocks/accounts', next ? {next} : undefined);
        const json = await this.fetchJSON(url);

        if (json === null) {
            return {accounts: [], next: null};
        }

        return {
            accounts: extractArray<Account>(json, 'blocked_accounts'),
            next: extractNextCursor(json)
        };
    }

    async getBlockedDomains(next?: string): Promise<GetBlockedDomainsResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/blocks/domains', next ? {next} : undefined);
        const json = await this.fetchJSON(url);

        if (json === null) {
            return {domains: [], next: null};
        }

        return {
            domains: extractArray<Account>(json, 'blocked_domains'),
            next: extractNextCursor(json)
        };
    }

    // -------------------------------------------------------------------------
    // Media upload
    // -------------------------------------------------------------------------

    async upload(file: File): Promise<string> {
        const url = this.buildUrl('.ghost/activitypub/v1/upload/image');
        const formData = new FormData();
        formData.append('file', file);

        const token = await this.getToken();
        const response = await this.fetch(url, {
            method: 'POST',
            headers: {Authorization: `Bearer ${token}`},
            body: formData
        });

        if (!response.ok) {
            throw {message: 'Upload failed', statusCode: response.status} satisfies ApiError;
        }

        const json = await response.json();
        return json.fileUrl as string;
    }

    // -------------------------------------------------------------------------
    // Bluesky integration
    // -------------------------------------------------------------------------

    async enableBluesky(): Promise<void> {
        await this.fetchJSON(this.buildUrl('.ghost/activitypub/v2/actions/bluesky/enable'), 'POST');
    }

    async disableBluesky(): Promise<void> {
        await this.fetchJSON(this.buildUrl('.ghost/activitypub/v2/actions/bluesky/disable'), 'POST');
    }

    async confirmBlueskyHandle(): Promise<string> {
        const url = this.buildUrl('.ghost/activitypub/v2/actions/bluesky/confirm-handle');
        const json = await this.fetchJSON(url, 'POST');

        if (json === null || typeof json.handle !== 'string') {
            return '';
        }

        return json.handle;
    }
}
```

## Summary of Changes

| Area | Before | After |
|---|---|---|
| **URL construction** | `new URL(path, this.apiUrl)` repeated everywhere | `buildUrl(path, params?)` centralises construction and query-param setting |
| **Action endpoints** | Duplicated URL + `fetchJSON` call per action | `performAction(action, id?)` + `buildActionUrl()` shared by 8 methods |
| **Pagination** | 4 near-identical `if (json === null) … extractArray … extractNextCursor` blocks | `buildPaginatedResponse()`, `extractArray()`, `extractNextCursor()` helpers used throughout |
| **Content body** | Duplicated `{content, image?}` construction in `reply` and `note` | `buildContentBody()` helper |
| **Error building** | Inline try/catch inside `fetchJSON` | Extracted to `buildApiError()` |
| **Shared types** | `Attachment` and `PostAuthor` inlined in multiple places | Promoted to named exported types |
| **`fetchJSON` headers** | Cast `options.headers!` to add `Content-Type` | Typed as `Record<string, string>` from the start |