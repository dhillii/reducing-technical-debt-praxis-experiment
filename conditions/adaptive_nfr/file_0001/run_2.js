# Refactored ActivityPub API

## Key Refactoring Strategies Applied

1. **Extracted pagination helper** - Eliminated repeated null/array extraction patterns
2. **Unified action methods** - Collapsed identical URL-pattern methods into a single generic
3. **Extracted URL builder** - Centralized URL construction
4. **Simplified type aliases** - Removed redundant type aliases
5. **Extracted error parsing** - Isolated error handling logic

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
    attachment: {name: string; value: string}[];
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

export type FollowAccount = Pick<
    Account,
    'id' | 'name' | 'handle' | 'avatarUrl' | 'blockedByMe' | 'domainBlockedByMe'
> & {isFollowing: true};

export type AccountFollowsType = 'following' | 'followers';

export type ActivityPubCollectionResponse<T> = {data: T[]; next: string | null};

export type ApiError = {
    message: string;
    statusCode: number;
    code?: string;
};

export interface TopicData {
    slug: string;
    name: string;
}

export interface Thread {
    posts: Post[];
}

export interface ReplyChainResponse {
    ancestors: {chain: Post[]; hasMore: boolean};
    post: Post;
    children: Array<{post: Post; chain: Post[]; hasMore: boolean}>;
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
        attachments?: {type: string; mediaType: string; name: string; url: string}[];
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
    attachments: {type: string; mediaType: string; name: string; url: string}[];
    author: Pick<Account, 'id' | 'handle' | 'avatarUrl' | 'name' | 'url' | 'followedByMe'>;
    authoredByMe: boolean;
    repostCount: number;
    repostedByMe: boolean;
    repostedBy: Pick<Account, 'id' | 'handle' | 'avatarUrl' | 'name' | 'url' | 'followedByMe'> | null;
    metadata?: {
        ghostAuthors?: Array<{name: string; profile_image: string}>;
    };
}

export enum PostType {
    Note = 0,
    Article = 1,
    Tombstone = 2
}

// Paginated response interfaces
export interface PaginatedPostsResponse {posts: Post[]; next: string | null}
export interface PaginatedAccountsResponse {accounts: Account[]; next: string | null}
export interface PaginatedExploreAccountsResponse {accounts: ExploreAccount[]; next: string | null}
export interface GetAccountFollowsResponse {accounts: FollowAccount[]; next: string | null}
export interface GetNotificationsResponse {notifications: Notification[]; next: string | null}
export interface GetBlockedAccountsResponse {accounts: Account[]; next: string | null}
export interface GetBlockedDomainsResponse {domains: Account[]; next: string | null}

// Simple response interfaces
export interface SearchResults {accounts: AccountSearchResult[]}
export interface GetTopicsResponse {topics: TopicData[]}
export interface GetRecommendationsResponse {accounts: ExploreAccount[]}
export interface GetNotificationsCountResponse {count: number}

export const isApiError = (error: unknown): error is ApiError =>
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    'message' in error &&
    typeof (error as ApiError).statusCode === 'number' &&
    typeof (error as ApiError).message === 'string';

// ─── Pagination helpers ───────────────────────────────────────────────────────

type JsonObject = Record<string, unknown>;

/**
 * Extracts a typed array from a JSON response, returning [] when absent.
 */
function extractArray<T>(json: object | null, key: string): T[] {
    if (json === null || !(key in json)) {
        return [];
    }
    const value = (json as JsonObject)[key];
    return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Extracts the pagination cursor from a JSON response.
 */
function extractNext(json: object | null): string | null {
    if (json === null || !('next' in json)) {
        return null;
    }
    const value = (json as JsonObject).next;
    return typeof value === 'string' ? value : null;
}

// ─── API class ────────────────────────────────────────────────────────────────

export class ActivityPubAPI {
    constructor(
        private readonly apiUrl: URL,
        private readonly authApiUrl: URL,
        private readonly handle: string,
        private readonly fetch: (
            resource: URL,
            init?: RequestInit
        ) => Promise<Response> = window.fetch.bind(window)
    ) {}

    // ── Auth ──────────────────────────────────────────────────────────────────

    private async getToken(): Promise<string | null> {
        try {
            const response = await this.fetch(this.authApiUrl);
            const json = await response.json();
            return json?.identities?.[0]?.token ?? null;
        } catch {
            return null;
        }
    }

    // ── Core fetch ────────────────────────────────────────────────────────────

    private async fetchJSON(
        url: URL,
        method: 'DELETE' | 'GET' | 'POST' | 'PUT' = 'GET',
        body?: object
    ): Promise<object | null> {
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

        return response.json();
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
            // Leave the default message
        }

        return error;
    }

    // ── URL helpers ───────────────────────────────────────────────────────────

    private buildUrl(path: string, id?: string): URL {
        const encodedId = id ? encodeURIComponent(id) : '';
        return new URL(`${path}${encodedId}`, this.apiUrl);
    }

    get userApiUrl(): URL {
        return this.buildUrl(`.ghost/activitypub/users/${this.handle}`);
    }

    get searchApiUrl(): URL {
        return this.buildUrl('.ghost/activitypub/v1/actions/search');
    }

    // ── Simple action methods (POST to a single URL, return boolean) ──────────

    private async postAction(path: string): Promise<boolean> {
        await this.fetchJSON(new URL(path, this.apiUrl), 'POST');
        return true;
    }

    async blockDomain(domain: URL): Promise<boolean> {
        return this.postAction(
            `.ghost/activitypub/v1/actions/block/domain/${encodeURIComponent(domain.href)}`
        );
    }

    async unblockDomain(domain: URL): Promise<boolean> {
        return this.postAction(
            `.ghost/activitypub/v1/actions/unblock/domain/${encodeURIComponent(domain.href)}`
        );
    }

    async block(id: URL): Promise<boolean> {
        return this.postAction(
            `.ghost/activitypub/v1/actions/block/${encodeURIComponent(id.href)}`
        );
    }

    async unblock(id: URL): Promise<boolean> {
        return this.postAction(
            `.ghost/activitypub/v1/actions/unblock/${encodeURIComponent(id.href)}`
        );
    }

    // ── Social actions ────────────────────────────────────────────────────────

    async follow(username: string): Promise<Actor> {
        return this.fetchJSON(
            this.buildUrl(`.ghost/activitypub/v1/actions/follow/${username}`),
            'POST'
        ) as Promise<Actor>;
    }

    async unfollow(username: string): Promise<Actor> {
        return this.fetchJSON(
            this.buildUrl(`.ghost/activitypub/v1/actions/unfollow/${username}`),
            'POST'
        ) as Promise<Actor>;
    }

    async like(id: string): Promise<void> {
        await this.fetchJSON(
            this.buildUrl('.ghost/activitypub/v1/actions/like/', id),
            'POST'
        );
    }

    async unlike(id: string): Promise<void> {
        await this.fetchJSON(
            this.buildUrl('.ghost/activitypub/v1/actions/unlike/', id),
            'POST'
        );
    }

    async repost(id: string): Promise<void> {
        await this.fetchJSON(
            this.buildUrl('.ghost/activitypub/v1/actions/repost/', id),
            'POST'
        );
    }

    async derepost(id: string): Promise<void> {
        await this.fetchJSON(
            this.buildUrl('.ghost/activitypub/v1/actions/derepost/', id),
            'POST'
        );
    }

    // ── Content creation ──────────────────────────────────────────────────────

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
        const url = this.buildUrl('.ghost/activitypub/v1/actions/reply/', id);
        return this.fetchJSON(url, 'POST', this.buildContentBody(content, image));
    }

    async note(content: string, image?: {url: string; altText?: string}): Promise<Post> {
        const url = this.buildUrl('.ghost/activitypub/v1/actions/note');
        const response = await this.fetchJSON(url, 'POST', this.buildContentBody(content, image));
        return (response as {post: Post}).post;
    }

    async delete(id: string): Promise<void> {
        await this.fetchJSON(
            this.buildUrl('.ghost/activitypub/v1/post/', id),
            'DELETE'
        );
    }

    // ── User / account ────────────────────────────────────────────────────────

    async getUser(): Promise<ActorProperties> {
        return this.fetchJSON(this.userApiUrl) as Promise<ActorProperties>;
    }

    async getAccount(handle: string): Promise<Account> {
        const url = this.buildUrl(`.ghost/activitypub/v1/account/${handle}`);
        return this.fetchJSON(url) as Promise<Account>;
    }

    async updateAccount({
        name,
        username,
        bio,
        avatarUrl,
        bannerImageUrl
    }: {
        name: string;
        username: string;
        bio: string;
        avatarUrl: string;
        bannerImageUrl: string;
    }): Promise<void> {
        const url = this.buildUrl('.ghost/activitypub/v1/account');
        await this.fetchJSON(url, 'PUT', {name, username, bio, avatarUrl, bannerImageUrl});
    }

    async getAccountFollows(
        handle: string,
        type: AccountFollowsType,
        next?: string
    ): Promise<GetAccountFollowsResponse> {
        const url = this.buildUrl(`.ghost/activitypub/v1/account/${handle}/follows/${type}`);
        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);

        return {
            accounts: extractArray<FollowAccount>(json, 'accounts'),
            next: extractNext(json)
        };
    }

    // ── Feed / posts ──────────────────────────────────────────────────────────

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

    async getPost(id: string): Promise<Post> {
        return this.fetchJSON(this.buildUrl('.ghost/activitypub/v1/post/', id)) as Promise<Post>;
    }

    async getThread(id: string): Promise<Thread> {
        return this.fetchJSON(
            this.buildUrl('.ghost/activitypub/v1/thread/', id)
        ) as Promise<Thread>;
    }

    async getReplies(postApId: string, next?: string): Promise<ReplyChainResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/replies/', postApId);
        if (next) {
            url.searchParams.set('next', next);
        }
        return this.fetchJSON(url) as Promise<ReplyChainResponse>;
    }

    private async getPaginatedPosts(
        endpoint: string,
        next?: string
    ): Promise<PaginatedPostsResponse> {
        const url = new URL(endpoint, this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);

        return {
            posts: extractArray<Post>(json, 'posts'),
            next: extractNext(json)
        };
    }

    // ── Explore ───────────────────────────────────────────────────────────────

    async getExploreAccounts(
        topic: string,
        next?: string
    ): Promise<PaginatedExploreAccountsResponse> {
        return this.getPaginatedExploreAccounts(
            `.ghost/activitypub/v1/explore/${topic}`,
            next
        );
    }

    async getTopics(): Promise<GetTopicsResponse> {
        const json = await this.fetchJSON(this.buildUrl('.ghost/activitypub/v1/topics'));
        return {topics: extractArray<TopicData>(json, 'topics')};
    }

    async getRecommendations(limit?: number): Promise<GetRecommendationsResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/recommendations');
        if (limit) {
            url.searchParams.set('limit', limit.toString());
        }
        const json = await this.fetchJSON(url);
        return {accounts: extractArray<ExploreAccount>(json, 'accounts')};
    }

    private async getPaginatedExploreAccounts(
        endpoint: string,
        next?: string
    ): Promise<PaginatedExploreAccountsResponse> {
        const url = new URL(endpoint, this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);

        return {
            accounts: extractArray<ExploreAccount>(json, 'accounts'),
            next: extractNext(json)
        };
    }

    // ── Search ────────────────────────────────────────────────────────────────

    async search(query: string): Promise<SearchResults> {
        const url = this.searchApiUrl;
        url.searchParams.set('query', query);

        const json = await this.fetchJSON(url);

        return {accounts: extractArray<AccountSearchResult>(json, 'accounts')};
    }

    // ── Notifications ─────────────────────────────────────────────────────────

    async getNotifications(next?: string): Promise<GetNotificationsResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/notifications');
        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);

        return {
            notifications: extractArray<Notification>(json, 'notifications'),
            next: extractNext(json)
        };
    }

    async getNotificationsCount(): Promise<GetNotificationsCountResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/notifications/unread/count');
        const json = await this.fetchJSON(url);

        const count =
            json !== null && typeof (json as JsonObject).count === 'number'
                ? (json as {count: number}).count
                : 0;

        return {count};
    }

    async resetNotificationsCount(): Promise<boolean> {
        await this.fetchJSON(
            this.buildUrl('.ghost/activitypub/v1/notifications/unread/reset'),
            'PUT'
        );
        return true;
    }

    // ── Blocks ────────────────────────────────────────────────────────────────

    async getBlockedAccounts(next?: string): Promise<GetBlockedAccountsResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/blocks/accounts');
        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);

        return {
            accounts: extractArray<Account>(json, 'blocked_accounts'),
            next: extractNext(json)
        };
    }

    async getBlockedDomains(next?: string): Promise<GetBlockedDomainsResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/blocks/domains');
        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);

        return {
            domains: extractArray<Account>(json, 'blocked_domains'),
            next: extractNext(json)
        };
    }

    // ── Upload ────────────────────────────────────────────────────────────────

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
        return json.fileUrl;
    }

    // ── Bluesky ───────────────────────────────────────────────────────────────

    async enableBluesky(): Promise<void> {
        await this.fetchJSON(
            this.buildUrl('.ghost/activitypub/v2/actions/bluesky/enable'),
            'POST'
        );
    }

    async disableBluesky(): Promise<void> {
        await this.fetchJSON(
            this.buildUrl('.ghost/activitypub/v2/actions/bluesky/disable'),
            'POST'
        );
    }

    async confirmBlueskyHandle(): Promise<string> {
        const url = this.buildUrl('.ghost/activitypub/v2/actions/bluesky/confirm-handle');
        const json = await this.fetchJSON(url, 'POST');

        if (json === null || !('handle' in json) || typeof (json as JsonObject).handle !== 'string') {
            return '';
        }

        return (json as {handle: string}).handle;
    }
}
```

## Summary of Changes

| Problem | Solution |
|---|---|
| Repeated `null` + `'key' in json` + `Array.isArray` guards | `extractArray<T>(json, key)` helper |
| Repeated `'next' in json && typeof json.next === 'string'` | `extractNext(json)` helper |
| Duplicated `fetchJSON` + `return true` pattern | `postAction(path)` helper |
| Duplicated `{content, image}` body construction | `buildContentBody()` helper |
| Scattered `new URL(path, this.apiUrl)` + `encodeURIComponent` | `buildUrl(path, id?)` helper |
| Inline error parsing inside `fetchJSON` | `buildApiError(response)` method |
| Redundant `GetAccountResponse` alias | Replaced with `Account` directly |
| Inconsistent `headers` mutation | Typed `headers` as `Record<string, string>` upfront |