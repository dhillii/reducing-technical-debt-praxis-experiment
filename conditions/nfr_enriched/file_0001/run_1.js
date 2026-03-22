Here's the refactored code with reduced complexity through several improvements:

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

export type FollowAccount = Pick<Account, 'id' | 'name' | 'handle' | 'avatarUrl' | 'blockedByMe' | 'domainBlockedByMe'> & {isFollowing: true};

export type AccountFollowsType = 'following' | 'followers';

export interface TopicData {
    slug: string;
    name: string;
}

export interface Attachment {
    type: string;
    mediaType: string;
    name: string;
    url: string;
}

export interface ImageUpload {
    url: string;
    altText?: string;
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
    attachments: Attachment[];
    author: Pick<Account, 'id' | 'handle' | 'avatarUrl' | 'name' | 'url' | 'followedByMe'>;
    authoredByMe: boolean;
    repostCount: number;
    repostedByMe: boolean;
    repostedBy: Pick<Account, 'id' | 'handle' | 'avatarUrl' | 'name' | 'url' | 'followedByMe'> | null;
    metadata?: {
        ghostAuthors?: Array<{
            name: string;
            profile_image: string;
        }>;
    };
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

export type ActivityPubCollectionResponse<T> = {data: T[]; next: string | null};

export enum PostType {
    Note = 0,
    Article = 1,
    Tombstone = 2
}

// Response types
export interface PaginatedResponse {
    next: string | null;
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

export interface GetAccountFollowsResponse extends PaginatedResponse {
    accounts: FollowAccount[];
}

export interface GetNotificationsResponse extends PaginatedResponse {
    notifications: Notification[];
}

export interface GetNotificationsCountResponse {
    count: number;
}

export interface GetBlockedAccountsResponse extends PaginatedResponse {
    accounts: Account[];
}

export interface GetBlockedDomainsResponse extends PaginatedResponse {
    domains: Account[];
}

export interface PaginatedPostsResponse extends PaginatedResponse {
    posts: Post[];
}

export interface PaginatedAccountsResponse extends PaginatedResponse {
    accounts: Account[];
}

export interface PaginatedExploreAccountsResponse extends PaginatedResponse {
    accounts: ExploreAccount[];
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

// Helpers for extracting paginated data
function extractArray<T>(json: object, key: string): T[] {
    return key in json && Array.isArray((json as Record<string, unknown>)[key])
        ? (json as Record<string, unknown>)[key] as T[]
        : [];
}

function extractNextPage(json: object): string | null {
    return 'next' in json && typeof (json as Record<string, unknown>).next === 'string'
        ? (json as {next: string}).next
        : null;
}

function buildPaginatedResponse<K extends string, T>(
    json: object | null,
    key: K,
    altKey?: string
): Record<K, T[]> & {next: string | null} {
    const emptyResult = {[key]: [], next: null} as Record<K, T[]> & {next: string | null};

    if (json === null || !(key in json || (altKey && altKey in json))) {
        return emptyResult;
    }

    const lookupKey = altKey && altKey in json ? altKey : key;
    const items = extractArray<T>(json, lookupKey);
    const next = extractNextPage(json);

    return {[key]: items, next} as Record<K, T[]> & {next: string | null};
}

export class ActivityPubAPI {
    constructor(
        private readonly apiUrl: URL,
        private readonly authApiUrl: URL,
        private readonly handle: string,
        private readonly fetch: (resource: URL, init?: RequestInit) => Promise<Response> = window.fetch.bind(window)
    ) {}

    private async getToken(): Promise<string | null> {
        try {
            const response = await this.fetch(this.authApiUrl);
            const json = await response.json();
            return json?.identities?.[0]?.token ?? null;
        } catch {
            return null;
        }
    }

    private buildHeaders(token: string | null, includeContentType = false): Record<string, string> {
        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/activity+json'
        };
        if (includeContentType) {
            headers['Content-Type'] = 'application/json';
        }
        return headers;
    }

    private async parseErrorResponse(response: Response): Promise<ApiError> {
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

    private async fetchJSON(
        url: URL,
        method: 'DELETE' | 'GET' | 'POST' | 'PUT' = 'GET',
        body?: object
    ): Promise<object | null> {
        const token = await this.getToken();
        const options: RequestInit = {
            method,
            headers: this.buildHeaders(token, Boolean(body))
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await this.fetch(url, options);

        if (response.status === 204 || response.status === 202) {
            return null;
        }

        if (!response.ok) {
            throw await this.parseErrorResponse(response);
        }

        return response.json();
    }

    private buildUrl(path: string, id?: string): URL {
        const encodedId = id ? encodeURIComponent(id) : '';
        return new URL(`${path}${encodedId}`, this.apiUrl);
    }

    private async performAction(action: string, id: string, useHref = false): Promise<void> {
        const encodedId = useHref
            ? encodeURIComponent((id as unknown as URL).href)
            : encodeURIComponent(id);
        const url = new URL(`.ghost/activitypub/v1/actions/${action}/${encodedId}`, this.apiUrl);
        await this.fetchJSON(url, 'POST');
    }

    async blockDomain(domain: URL): Promise<boolean> {
        await this.performAction('block/domain', domain.href, false);
        return true;
    }

    async unblockDomain(domain: URL): Promise<boolean> {
        await this.performAction('unblock/domain', domain.href, false);
        return true;
    }

    async block(id: URL): Promise<boolean> {
        await this.performAction('block', id.href, false);
        return true;
    }

    async unblock(id: URL): Promise<boolean> {
        await this.performAction('unblock', id.href, false);
        return true;
    }

    async follow(username: string): Promise<Actor> {
        const url = new URL(`.ghost/activitypub/v1/actions/follow/${username}`, this.apiUrl);
        return this.fetchJSON(url, 'POST') as Promise<Actor>;
    }

    async unfollow(username: string): Promise<Actor> {
        const url = new URL(`.ghost/activitypub/v1/actions/unfollow/${username}`, this.apiUrl);
        return this.fetchJSON(url, 'POST') as Promise<Actor>;
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

    private buildContentBody(content: string, image?: ImageUpload): {content: string; image?: ImageUpload} {
        return image ? {content, image} : {content};
    }

    async reply(id: string, content: string, image?: ImageUpload): Promise<Activity> {
        const url = new URL(`.ghost/activitypub/v1/actions/reply/${encodeURIComponent(id)}`, this.apiUrl);
        return this.fetchJSON(url, 'POST', this.buildContentBody(content, image));
    }

    async note(content: string, image?: ImageUpload): Promise<Post> {
        const url = new URL('.ghost/activitypub/v1/actions/note', this.apiUrl);
        const response = await this.fetchJSON(url, 'POST', this.buildContentBody(content, image));
        return (response as {post: Post}).post;
    }

    async delete(id: string): Promise<void> {
        const url = new URL(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`, this.apiUrl);
        await this.fetchJSON(url, 'DELETE');
    }

    get userApiUrl(): URL {
        return new URL(`.ghost/activitypub/users/${this.handle}`, this.apiUrl);
    }

    async getUser(): Promise<ActorProperties> {
        return this.fetchJSON(this.userApiUrl) as Promise<ActorProperties>;
    }

    get searchApiUrl(): URL {
        return new URL('.ghost/activitypub/v1/actions/search', this.apiUrl);
    }

    async search(query: string): Promise<SearchResults> {
        const url = this.searchApiUrl;
        url.searchParams.set('query', query);

        const json = await this.fetchJSON(url);

        if (json && 'accounts' in json) {
            return json as SearchResults;
        }

        return {accounts: []};
    }

    async getThread(id: string): Promise<Thread> {
        const url = new URL(`.ghost/activitypub/v1/thread/${encodeURIComponent(id)}`, this.apiUrl);
        return this.fetchJSON(url) as Promise<Thread>;
    }

    async getAccount(handle: string): Promise<Account> {
        const url = new URL(`.ghost/activitypub/v1/account/${handle}`, this.apiUrl);
        return this.fetchJSON(url) as Promise<Account>;
    }

    async getAccountFollows(handle: string, type: AccountFollowsType, next?: string): Promise<GetAccountFollowsResponse> {
        const url = new URL(`.ghost/activitypub/v1/account/${handle}/follows/${type}`, this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);
        return buildPaginatedResponse<'accounts', FollowAccount>(json, 'accounts');
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

    async getExploreAccounts(topic: string, next?: string): Promise<PaginatedExploreAccountsResponse> {
        return this.getPaginatedExploreAccounts(`.ghost/activitypub/v1/explore/${topic}`, next);
    }

    async getTopics(): Promise<GetTopicsResponse> {
        const url = new URL('.ghost/activitypub/v1/topics', this.apiUrl);
        const json = await this.fetchJSON(url);
        return {
            topics: json ? extractArray<TopicData>(json, 'topics') : []
        };
    }

    async getRecommendations(limit?: number): Promise<GetRecommendationsResponse> {
        const url = new URL('.ghost/activitypub/v1/recommendations', this.apiUrl);
        if (limit) {
            url.searchParams.set('limit', limit.toString());
        }
        const json = await this.fetchJSON(url);
        return {
            accounts: json ? extractArray<ExploreAccount>(json, 'accounts') : []
        };
    }

    async getPostsByAccount(handle: string, next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts(`.ghost/activitypub/v1/posts/${handle}`, next);
    }

    async getPostsLikedByAccount(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts('.ghost/activitypub/v1/posts/me/liked', next);
    }

    private async getPaginatedPosts(endpoint: string, next?: string): Promise<PaginatedPostsResponse> {
        const url = new URL(endpoint, this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);
        return buildPaginatedResponse<'posts', Post>(json, 'posts');
    }

    async getNotifications(next?: string): Promise<GetNotificationsResponse> {
        const url = new URL('.ghost/activitypub/v1/notifications', this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);
        return buildPaginatedResponse<'notifications', Notification>(json, 'notifications');
    }

    async getNotificationsCount(): Promise<GetNotificationsCountResponse> {
        const url = new URL('.ghost/activitypub/v1/notifications/unread/count', this.apiUrl);
        const json = await this.fetchJSON(url);

        const count = json !== null && typeof (json as Record<string, unknown>).count === 'number'
            ? (json as {count: number}).count
            : 0;

        return {count};
    }

    async resetNotificationsCount(): Promise<boolean> {
        const url = new URL('.ghost/activitypub/v1/notifications/unread/reset', this.apiUrl);
        await this.fetchJSON(url, 'PUT');
        return true;
    }

    async getBlockedAccounts(next?: string): Promise<GetBlockedAccountsResponse> {
        const url = new URL('.ghost/activitypub/v1/blocks/accounts', this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);
        return buildPaginatedResponse<'accounts', Account>(json, 'accounts', 'blocked_accounts') as GetBlockedAccountsResponse;
    }

    async getBlockedDomains(next?: string): Promise<GetBlockedDomainsResponse> {
        const url = new URL('.ghost/activitypub/v1/blocks/domains', this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);
        return buildPaginatedResponse<'domains', Account>(json, 'domains', 'blocked_domains') as GetBlockedDomainsResponse;
    }

    private async getPaginatedExploreAccounts(endpoint: string, next?: string): Promise<PaginatedExploreAccountsResponse> {
        const url = new URL(endpoint, this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);
        return buildPaginatedResponse<'accounts', ExploreAccount>(json, 'accounts');
    }

    async getPost(id: string): Promise<Post> {
        const url = new URL(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`, this.apiUrl);
        return this.fetchJSON(url) as Promise<Post>;
    }

    async getReplies(postApId: string, next?: string): Promise<ReplyChainResponse> {
        const url = new URL(`.ghost/activitypub/v1/replies/${encodeURIComponent(postApId)}`, this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }
        return this.fetchJSON(url) as Promise<ReplyChainResponse>;
    }

    async updateAccount({name, username, bio, avatarUrl, bannerImageUrl}: {
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
            body: formData
        });

        if (!response.ok) {
            throw {message: 'Upload failed', statusCode: response.status};
        }

        const json = await response.json();
        return json.fileUrl;
    }

    async enableBluesky(): Promise<void> {
        const url = new URL('.ghost/activitypub/v2/actions/bluesky/enable', this.apiUrl);
        await this.fetchJSON(url, 'POST');
    }

    async disableBluesky(): Promise<void> {
        const url = new URL('.ghost/activitypub/v2/actions/bluesky/disable', this.apiUrl);
        await this.fetchJSON(url, 'POST');
    }

    async confirmBlueskyHandle(): Promise<string> {
        const url = new URL('.ghost/activitypub/v2/actions/bluesky/confirm-handle', this.apiUrl);
        const json = await this.fetchJSON(url, 'POST');

        if (json === null || !('handle' in json) || typeof json.handle !== 'string') {
            return '';
        }

        return json.handle;
    }
}
```

Key refactoring improvements:

1. **Extracted shared helper functions** (`extractArray`, `extractNextPage`, `buildPaginatedResponse`) to eliminate repeated null-checking and array-extraction patterns across multiple methods.

2. **Extracted `Attachment` and `ImageUpload` interfaces** to avoid duplicating inline type definitions across `Post`, `Notification`, `reply`, and `note`.

3. **Introduced `PaginatedResponse` base interface** that all paginated response types extend, reducing duplication.

4. **Extracted `buildHeaders` and `parseErrorResponse`** private methods from `fetchJSON` to separate concerns and reduce method length.

5. **Extracted `buildContentBody`** to deduplicate the image-conditional body construction in `reply` and `note`.

6. **Simplified `performAction`** to consolidate the repeated URL-building pattern for action endpoints (`like`, `unlike`, `repost`, `derepost`, `block`, `unblock`).

7. **Removed unnecessary intermediate variables** where `return` could be used directly (e.g., `fetchJSON` calls cast to their return types).

8. **Added explicit return types** to methods that were missing them (`resetNotificationsCount`, `updateAccount`, Bluesky methods).