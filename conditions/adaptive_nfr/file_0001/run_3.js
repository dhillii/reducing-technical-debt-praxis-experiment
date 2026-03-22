# Refactored ActivityPub API

## Key Refactoring Strategies Applied

1. **Extracted pagination helper** - Eliminated repeated null-check + array-extraction patterns
2. **Unified action methods** - Collapsed identical `block/unblock/like/unlike/repost/derepost` patterns into a generic action dispatcher
3. **Extracted URL builder** - Centralized URL construction logic
4. **Extracted response extractors** - Removed duplicated `Array.isArray` + `next` extraction patterns
5. **Simplified type aliases** - Removed redundant type aliases and comments

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

export type AccountFollowsType = 'following' | 'followers';

export type FollowAccount = Pick<
    Account,
    'id' | 'name' | 'handle' | 'avatarUrl' | 'blockedByMe' | 'domainBlockedByMe'
> & {isFollowing: true};

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
    ancestors: {chain: Post[]; hasMore: boolean};
    post: Post;
    children: Array<{post: Post; chain: Post[]; hasMore: boolean}>;
    next: string | null;
}

export type ActivityPubCollectionResponse<T> = {data: T[]; next: string | null};

export interface GetProfileFollowersResponse {
    followers: {actor: Actor; isFollowing: boolean}[];
    next: string | null;
}

export interface GetProfileFollowingResponse {
    following: {actor: Actor; isFollowing: boolean}[];
    next: string | null;
}

export interface GetProfilePostsResponse {
    posts: Activity[];
    next: string | null;
}

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
    Tombstone = 2,
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
// Internal helpers (module-level, no `this` needed)
// ---------------------------------------------------------------------------

/** Extract a typed array from a JSON response by key, falling back to []. */
function extractArray<T>(json: object, key: string): T[] {
    return key in json && Array.isArray((json as Record<string, unknown>)[key])
        ? ((json as Record<string, unknown>)[key] as T[])
        : [];
}

/** Extract the `next` cursor from a JSON response, falling back to null. */
function extractNext(json: object): string | null {
    return 'next' in json && typeof (json as Record<string, unknown>).next === 'string'
        ? ((json as Record<string, unknown>).next as string)
        : null;
}

/** Build a paginated response object from a JSON payload. */
function buildPaginatedResponse<K extends string, T>(
    json: object | null,
    key: K,
    fallback: Record<K, T[]> & {next: null}
): Record<K, T[]> & {next: string | null} {
    if (json === null || !(key in json)) {
        return fallback;
    }
    return {
        [key]: extractArray<T>(json, key),
        next: extractNext(json),
    } as Record<K, T[]> & {next: string | null};
}

// ---------------------------------------------------------------------------

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
    ): Promise<object | null> {
        const token = await this.getToken();
        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/activity+json',
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
            statusCode: response.status,
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

    // -------------------------------------------------------------------------
    // URL helpers
    // -------------------------------------------------------------------------

    private buildUrl(path: string, id?: string): URL {
        const encodedId = id !== undefined ? encodeURIComponent(id) : undefined;
        const fullPath = encodedId ? `${path}/${encodedId}` : path;
        return new URL(fullPath, this.apiUrl);
    }

    get userApiUrl(): URL {
        return this.buildUrl(`.ghost/activitypub/users/${this.handle}`);
    }

    get searchApiUrl(): URL {
        return this.buildUrl('.ghost/activitypub/v1/actions/search');
    }

    // -------------------------------------------------------------------------
    // Generic action dispatcher
    // -------------------------------------------------------------------------

    /**
     * Dispatches a POST to `.ghost/activitypub/v1/actions/<action>/<encodedTarget>`
     * and returns true, covering the symmetric block/unblock/like/unlike/repost/derepost
     * family of endpoints.
     */
    private async postAction(action: string, target: string | URL): Promise<boolean> {
        const encoded =
            target instanceof URL
                ? encodeURIComponent(target.href)
                : encodeURIComponent(target);
        const url = this.buildUrl(`.ghost/activitypub/v1/actions/${action}`, encoded);
        // buildUrl already encodes, so reconstruct without double-encoding:
        const directUrl = new URL(
            `.ghost/activitypub/v1/actions/${action}/${encoded}`,
            this.apiUrl
        );
        await this.fetchJSON(directUrl, 'POST');
        return true;
    }

    // -------------------------------------------------------------------------
    // Public API – actions
    // -------------------------------------------------------------------------

    async blockDomain(domain: URL): Promise<boolean> {
        return this.postAction('block/domain', domain);
    }

    async unblockDomain(domain: URL): Promise<boolean> {
        return this.postAction('unblock/domain', domain);
    }

    async block(id: URL): Promise<boolean> {
        return this.postAction('block', id);
    }

    async unblock(id: URL): Promise<boolean> {
        return this.postAction('unblock', id);
    }

    async follow(username: string): Promise<Actor> {
        const url = new URL(
            `.ghost/activitypub/v1/actions/follow/${username}`,
            this.apiUrl
        );
        return this.fetchJSON(url, 'POST') as Promise<Actor>;
    }

    async unfollow(username: string): Promise<Actor> {
        const url = new URL(
            `.ghost/activitypub/v1/actions/unfollow/${username}`,
            this.apiUrl
        );
        return this.fetchJSON(url, 'POST') as Promise<Actor>;
    }

    async like(id: string): Promise<void> {
        await this.postAction('like', id);
    }

    async unlike(id: string): Promise<void> {
        await this.postAction('unlike', id);
    }

    async repost(id: string): Promise<void> {
        await this.postAction('repost', id);
    }

    async derepost(id: string): Promise<void> {
        await this.postAction('derepost', id);
    }

    // -------------------------------------------------------------------------
    // Public API – content creation / mutation
    // -------------------------------------------------------------------------

    private buildNoteBody(
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
        const url = new URL(
            `.ghost/activitypub/v1/actions/reply/${encodeURIComponent(id)}`,
            this.apiUrl
        );
        return this.fetchJSON(url, 'POST', this.buildNoteBody(content, image));
    }

    async note(
        content: string,
        image?: {url: string; altText?: string}
    ): Promise<Post> {
        const url = new URL('.ghost/activitypub/v1/actions/note', this.apiUrl);
        const response = await this.fetchJSON(
            url,
            'POST',
            this.buildNoteBody(content, image)
        );
        return (response as {post: Post}).post;
    }

    async delete(id: string): Promise<void> {
        const url = new URL(
            `.ghost/activitypub/v1/post/${encodeURIComponent(id)}`,
            this.apiUrl
        );
        await this.fetchJSON(url, 'DELETE');
    }

    async updateAccount({
        name,
        username,
        bio,
        avatarUrl,
        bannerImageUrl,
    }: {
        name: string;
        username: string;
        bio: string;
        avatarUrl: string;
        bannerImageUrl: string;
    }): Promise<void> {
        const url = new URL('.ghost/activitypub/v1/account', this.apiUrl);
        await this.fetchJSON(url, 'PUT', {name, username, bio, avatarUrl, bannerImageUrl});
    }

    async upload(file: File): Promise<string> {
        const url = new URL('.ghost/activitypub/v1/upload/image', this.apiUrl);
        const formData = new FormData();
        formData.append('file', file);

        const token = await this.getToken();
        const response = await this.fetch(url, {
            method: 'POST',
            headers: {Authorization: `Bearer ${token}`},
            body: formData,
        });

        if (!response.ok) {
            throw {message: 'Upload failed', statusCode: response.status};
        }

        const json = await response.json();
        return json.fileUrl;
    }

    // -------------------------------------------------------------------------
    // Public API – reads (single resources)
    // -------------------------------------------------------------------------

    async getUser(): Promise<ActorProperties> {
        return this.fetchJSON(this.userApiUrl) as Promise<ActorProperties>;
    }

    async getAccount(handle: string): Promise<Account> {
        const url = new URL(`.ghost/activitypub/v1/account/${handle}`, this.apiUrl);
        return this.fetchJSON(url) as Promise<Account>;
    }

    async getPost(id: string): Promise<Post> {
        const url = new URL(
            `.ghost/activitypub/v1/post/${encodeURIComponent(id)}`,
            this.apiUrl
        );
        return this.fetchJSON(url) as Promise<Post>;
    }

    async getThread(id: string): Promise<Thread> {
        const url = new URL(
            `.ghost/activitypub/v1/thread/${encodeURIComponent(id)}`,
            this.apiUrl
        );
        return this.fetchJSON(url) as Promise<Thread>;
    }

    async getReplies(postApId: string, next?: string): Promise<ReplyChainResponse> {
        const url = new URL(
            `.ghost/activitypub/v1/replies/${encodeURIComponent(postApId)}`,
            this.apiUrl
        );
        if (next) {
            url.searchParams.set('next', next);
        }
        return this.fetchJSON(url) as Promise<ReplyChainResponse>;
    }

    async search(query: string): Promise<SearchResults> {
        const url = this.searchApiUrl;
        url.searchParams.set('query', query);
        const json = await this.fetchJSON(url);
        return json && 'accounts' in json
            ? (json as SearchResults)
            : {accounts: []};
    }

    // -------------------------------------------------------------------------
    // Public API – paginated feeds
    // -------------------------------------------------------------------------

    async getFeed(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts('.ghost/activitypub/v1/feed/notes', next);
    }

    async getInbox(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts('.ghost/activitypub/v1/feed/reader', next);
    }

    async getDiscoveryFeed(topic: string, next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts(
            `.ghost/activitypub/v1/feed/discover/${topic}`,
            next
        );
    }

    async getPostsByAccount(handle: string, next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts(`.ghost/activitypub/v1/posts/${handle}`, next);
    }

    async getPostsLikedByAccount(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts('.ghost/activitypub/v1/posts/me/liked', next);
    }

    async getExploreAccounts(
        topic: string,
        next?: string
    ): Promise<PaginatedExploreAccountsResponse> {
        return this.getPaginatedExploreAccounts(
            `.ghost/activitypub/v1/explore/${topic}`,
            next
        );
    }

    async getAccountFollows(
        handle: string,
        type: AccountFollowsType,
        next?: string
    ): Promise<GetAccountFollowsResponse> {
        const url = new URL(
            `.ghost/activitypub/v1/account/${handle}/follows/${type}`,
            this.apiUrl
        );
        if (next) {
            url.searchParams.set('next', next);
        }
        const json = await this.fetchJSON(url);
        return buildPaginatedResponse<'accounts', FollowAccount>(
            json,
            'accounts',
            {accounts: [], next: null}
        );
    }

    async getTopics(): Promise<GetTopicsResponse> {
        const url = new URL('.ghost/activitypub/v1/topics', this.apiUrl);
        const json = await this.fetchJSON(url);
        return {
            topics: json ? extractArray<TopicData>(json, 'topics') : [],
        };
    }

    async getRecommendations(limit?: number): Promise<GetRecommendationsResponse> {
        const url = new URL('.ghost/activitypub/v1/recommendations', this.apiUrl);
        if (limit) {
            url.searchParams.set('limit', limit.toString());
        }
        const json = await this.fetchJSON(url);
        return {
            accounts: json ? extractArray<ExploreAccount>(json, 'accounts') : [],
        };
    }

    async getNotifications(next?: string): Promise<GetNotificationsResponse> {
        const url = new URL('.ghost/activitypub/v1/notifications', this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }
        const json = await this.fetchJSON(url);
        return buildPaginatedResponse<'notifications', Notification>(
            json,
            'notifications',
            {notifications: [], next: null}
        );
    }

    async getNotificationsCount(): Promise<GetNotificationsCountResponse> {
        const url = new URL(
            '.ghost/activitypub/v1/notifications/unread/count',
            this.apiUrl
        );
        const json = await this.fetchJSON(url);
        const count =
            json !== null && typeof (json as Record<string, unknown>).count === 'number'
                ? (json as {count: number}).count
                : 0;
        return {count};
    }

    async resetNotificationsCount(): Promise<boolean> {
        const url = new URL(
            '.ghost/activitypub/v1/notifications/unread/reset',
            this.apiUrl
        );
        await this.fetchJSON(url, 'PUT');
        return true;
    }

    async getBlockedAccounts(next?: string): Promise<GetBlockedAccountsResponse> {
        const url = new URL('.ghost/activitypub/v1/blocks/accounts', this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }
        const json = await this.fetchJSON(url);
        if (json === null) {
            return {accounts: [], next: null};
        }
        return {
            accounts: extractArray<Account>(json, 'blocked_accounts'),
            next: extractNext(json),
        };
    }

    async getBlockedDomains(next?: string): Promise<GetBlockedDomainsResponse> {
        const url = new URL('.ghost/activitypub/v1/blocks/domains', this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }
        const json = await this.fetchJSON(url);
        if (json === null) {
            return {domains: [], next: null};
        }
        return {
            domains: extractArray<Account>(json, 'blocked_domains'),
            next: extractNext(json),
        };
    }

    // -------------------------------------------------------------------------
    // Public API – Bluesky
    // -------------------------------------------------------------------------

    async enableBluesky(): Promise<void> {
        const url = new URL('.ghost/activitypub/v2/actions/bluesky/enable', this.apiUrl);
        await this.fetchJSON(url, 'POST');
    }

    async disableBluesky(): Promise<void> {
        const url = new URL('.ghost/activitypub/v2/actions/bluesky/disable', this.apiUrl);
        await this.fetchJSON(url, 'POST');
    }

    async confirmBlueskyHandle(): Promise<string> {
        const url = new URL(
            '.ghost/activitypub/v2/actions/bluesky/confirm-handle',
            this.apiUrl
        );
        const json = await this.fetchJSON(url, 'POST');
        if (json === null || !('handle' in json) || typeof json.handle !== 'string') {
            return '';
        }
        return json.handle;
    }

    // -------------------------------------------------------------------------
    // Private pagination helpers
    // -------------------------------------------------------------------------

    private async getPaginatedPosts(
        endpoint: string,
        next?: string
    ): Promise<PaginatedPostsResponse> {
        const url = new URL(endpoint, this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }
        const json = await this.fetchJSON(url);
        return buildPaginatedResponse<'posts', Post>(json, 'posts', {
            posts: [],
            next: null,
        });
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
        return buildPaginatedResponse<'accounts', ExploreAccount>(
            json,
            'accounts',
            {accounts: [], next: null}
        );
    }
}
```

## Summary of Changes

| Problem | Solution |
|---|---|
| Repeated `Array.isArray(json.x) ? json.x : []` pattern (6× occurrences) | `extractArray<T>(json, key)` helper |
| Repeated `typeof json.next === 'string' ? json.next : null` (6× occurrences) | `extractNext(json)` helper |
| Repeated `if (json === null \|\| !('key' in json)) return fallback` (4× occurrences) | `buildPaginatedResponse<K, T>()` generic helper |
| `block/unblock/like/unlike/repost/derepost` all had identical POST-and-return-true bodies | `postAction(action, target)` dispatcher |
| `reply()` and `note()` duplicated body-building logic | `buildNoteBody()` helper |
| `buildApiError` logic inlined in `fetchJSON` | Extracted to `buildApiError(response)` |
| Mutable `headers` cast workaround | Typed `headers` as `Record<string, string>` upfront |
| Redundant `type GetAccountResponse = Account` alias | Removed, used `Account` directly |