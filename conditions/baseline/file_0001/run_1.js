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

export type AccountRef = Pick<Account, 'id' | 'handle' | 'avatarUrl' | 'name' | 'url' | 'followedByMe'>;

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

export type FollowAccount = Pick<Account, 'id' | 'name' | 'handle' | 'avatarUrl' | 'blockedByMe' | 'domainBlockedByMe'> & {isFollowing: true};

export interface GetAccountFollowsResponse {
    accounts: FollowAccount[];
    next: string | null;
}

export interface Attachment {
    type: string;
    mediaType: string;
    name: string;
    url: string;
}

export interface NotificationPost {
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
}

export interface NotificationActor {
    id: string;
    name: string;
    url: string;
    handle: string;
    avatarUrl: string | null;
    followedByMe?: boolean;
}

export interface NotificationReplyTarget {
    id: string;
    type: 'article' | 'note';
    title: string | null;
    content: string;
    url: string;
}

export interface Notification {
    id: string;
    type: 'like' | 'reply' | 'repost' | 'follow' | 'mention';
    actor: NotificationActor;
    post: NotificationPost | null;
    inReplyTo: NotificationReplyTarget | null;
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
    Tombstone = 2
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
    author: AccountRef;
    authoredByMe: boolean;
    repostCount: number;
    repostedByMe: boolean;
    repostedBy: AccountRef | null;
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

type HttpMethod = 'DELETE' | 'GET' | 'POST' | 'PUT';

interface ImagePayload {
    url: string;
    altText?: string;
}

interface PaginatedResponse {
    next: string | null;
}

const EMPTY_POSTS_RESPONSE: PaginatedPostsResponse = {posts: [], next: null};
const EMPTY_ACCOUNTS_RESPONSE: GetAccountFollowsResponse = {accounts: [], next: null};
const EMPTY_NOTIFICATIONS_RESPONSE: GetNotificationsResponse = {notifications: [], next: null};

function extractNextPage(json: object): string | null {
    return 'next' in json && typeof (json as Record<string, unknown>).next === 'string'
        ? (json as {next: string}).next
        : null;
}

function extractArray<T>(json: object, key: string): T[] {
    return key in json && Array.isArray((json as Record<string, unknown>)[key])
        ? (json as Record<string, T[]>)[key]
        : [];
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

    private buildAuthHeaders(token: string | null): Record<string, string> {
        return {
            Authorization: `Bearer ${token}`,
            Accept: 'application/activity+json'
        };
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

    private async fetchJSON(url: URL, method: HttpMethod = 'GET', body?: object): Promise<object | null> {
        const token = await this.getToken();
        const headers = this.buildAuthHeaders(token);
        const options: RequestInit = {method, headers};

        if (body) {
            options.body = JSON.stringify(body);
            (headers as Record<string, string>)['Content-Type'] = 'application/json';
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

    private buildUrl(path: string, params?: Record<string, string>): URL {
        const url = new URL(path, this.apiUrl);
        if (params) {
            Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
        }
        return url;
    }

    private buildActionUrl(action: string, id?: string): URL {
        const path = id
            ? `.ghost/activitypub/v1/actions/${action}/${encodeURIComponent(id)}`
            : `.ghost/activitypub/v1/actions/${action}`;
        return this.buildUrl(path);
    }

    private async postAction(action: string, id?: string): Promise<object | null> {
        return this.fetchJSON(this.buildActionUrl(action, id), 'POST');
    }

    async blockDomain(domain: URL): Promise<boolean> {
        await this.fetchJSON(this.buildUrl(`.ghost/activitypub/v1/actions/block/domain/${encodeURIComponent(domain.href)}`), 'POST');
        return true;
    }

    async unblockDomain(domain: URL): Promise<boolean> {
        await this.fetchJSON(this.buildUrl(`.ghost/activitypub/v1/actions/unblock/domain/${encodeURIComponent(domain.href)}`), 'POST');
        return true;
    }

    async block(id: URL): Promise<boolean> {
        await this.postAction('block', id.href);
        return true;
    }

    async unblock(id: URL): Promise<boolean> {
        await this.postAction('unblock', id.href);
        return true;
    }

    async follow(username: string): Promise<Actor> {
        return this.postAction('follow', username);
    }

    async unfollow(username: string): Promise<Actor> {
        return this.postAction('unfollow', username);
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

    private buildContentBody(content: string, image?: ImagePayload): {content: string; image?: ImagePayload} {
        return image ? {content, image} : {content};
    }

    async reply(id: string, content: string, image?: ImagePayload): Promise<Activity> {
        const url = this.buildActionUrl('reply', id);
        return this.fetchJSON(url, 'POST', this.buildContentBody(content, image));
    }

    async note(content: string, image?: ImagePayload): Promise<Post> {
        const url = this.buildUrl('.ghost/activitypub/v1/actions/note');
        const response = await this.fetchJSON(url, 'POST', this.buildContentBody(content, image));
        return (response as {post: Post}).post;
    }

    async delete(id: string): Promise<void> {
        const url = this.buildUrl(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`);
        await this.fetchJSON(url, 'DELETE');
    }

    get userApiUrl(): URL {
        return this.buildUrl(`.ghost/activitypub/users/${this.handle}`);
    }

    async getUser(): Promise<ActorProperties> {
        const json = await this.fetchJSON(this.userApiUrl);
        return json as ActorProperties;
    }

    get searchApiUrl(): URL {
        return this.buildUrl('.ghost/activitypub/v1/actions/search');
    }

    async search(query: string): Promise<SearchResults> {
        const url = this.searchApiUrl;
        url.searchParams.set('query', query);

        const json = await this.fetchJSON(url, 'GET');

        if (json && 'accounts' in json) {
            return json as SearchResults;
        }

        return {accounts: []};
    }

    async getThread(id: string): Promise<Thread> {
        const url = this.buildUrl(`.ghost/activitypub/v1/thread/${encodeURIComponent(id)}`);
        const json = await this.fetchJSON(url);
        return json as Thread;
    }

    async getAccount(handle: string): Promise<GetAccountResponse> {
        const url = this.buildUrl(`.ghost/activitypub/v1/account/${handle}`);
        const json = await this.fetchJSON(url);
        return json as GetAccountResponse;
    }

    async getAccountFollows(handle: string, type: AccountFollowsType, next?: string): Promise<GetAccountFollowsResponse> {
        const url = this.buildUrl(
            `.ghost/activitypub/v1/account/${handle}/follows/${type}`,
            next ? {next} : undefined
        );

        const json = await this.fetchJSON(url);

        if (json === null || !('accounts' in json)) {
            return EMPTY_ACCOUNTS_RESPONSE;
        }

        return {
            accounts: extractArray<FollowAccount>(json, 'accounts'),
            next: extractNextPage(json)
        };
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
        const url = this.buildUrl('.ghost/activitypub/v1/topics');
        const json = await this.fetchJSON(url);
        return {
            topics: json ? extractArray<TopicData>(json, 'topics') : []
        };
    }

    async getRecommendations(limit?: number): Promise<GetRecommendationsResponse> {
        const url = this.buildUrl(
            '.ghost/activitypub/v1/recommendations',
            limit ? {limit: limit.toString()} : undefined
        );
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
        const url = this.buildUrl(endpoint, next ? {next} : undefined);
        const json = await this.fetchJSON(url);

        if (json === null || !('posts' in json)) {
            return EMPTY_POSTS_RESPONSE;
        }

        return {
            posts: extractArray<Post>(json, 'posts'),
            next: extractNextPage(json)
        };
    }

    async getNotifications(next?: string): Promise<GetNotificationsResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/notifications', next ? {next} : undefined);
        const json = await this.fetchJSON(url);

        if (json === null || !('notifications' in json)) {
            return EMPTY_NOTIFICATIONS_RESPONSE;
        }

        return {
            notifications: extractArray<Notification>(json, 'notifications'),
            next: extractNextPage(json)
        };
    }

    async getNotificationsCount(): Promise<GetNotificationsCountResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/notifications/unread/count');
        const json = await this.fetchJSON(url);
        const count = json !== null && typeof (json as Record<string, unknown>).count === 'number'
            ? (json as {count: number}).count
            : 0;
        return {count};
    }

    async resetNotificationsCount(): Promise<boolean> {
        const url = this.buildUrl('.ghost/activitypub/v1/notifications/unread/reset');
        await this.fetchJSON(url, 'PUT');
        return true;
    }

    async getBlockedAccounts(next?: string): Promise<GetBlockedAccountsResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/blocks/accounts', next ? {next} : undefined);
        const json = await this.fetchJSON(url);

        if (json === null) {
            return {accounts: [], next: null};
        }

        return {
            accounts: extractArray<Account>(json, 'blocked_accounts'),
            next: extractNextPage(json)
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
            next: extractNextPage(json)
        };
    }

    private async getPaginatedExploreAccounts(endpoint: string, next?: string): Promise<PaginatedExploreAccountsResponse> {
        const url = this.buildUrl(endpoint, next ? {next} : undefined);
        const json = await this.fetchJSON(url);

        if (json === null || !('accounts' in json)) {
            return {accounts: [], next: null};
        }

        return {
            accounts: extractArray<ExploreAccount>(json, 'accounts'),
            next: extractNextPage(json)
        };
    }

    async getPost(id: string): Promise<Post> {
        const url = this.buildUrl(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`);
        const json = await this.fetchJSON(url);
        return json as Post;
    }

    async getReplies(postApId: string, next?: string): Promise<ReplyChainResponse> {
        const url = this.buildUrl(
            `.ghost/activitypub/v1/replies/${encodeURIComponent(postApId)}`,
            next ? {next} : undefined
        );
        const json = await this.fetchJSON(url);
        return json as ReplyChainResponse;
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

    async upload(file: File): Promise<string> {
        const url = this.buildUrl('.ghost/activitypub/v1/upload/image');
        const token = await this.getToken();
        const formData = new FormData();
        formData.append('file', file);

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

    async enableBluesky(): Promise<void> {
        await this.fetchJSON(this.buildUrl('.ghost/activitypub/v2/actions/bluesky/enable'), 'POST');
    }

    async disableBluesky(): Promise<void> {
        await this.fetchJSON(this.buildUrl('.ghost/activitypub/v2/actions/bluesky/disable'), 'POST');
    }

    async confirmBlueskyHandle(): Promise<string> {
        const url = this.buildUrl('.ghost/activitypub/v2/actions/bluesky/confirm-handle');
        const json = await this.fetchJSON(url, 'POST');

        if (json === null || !('handle' in json) || typeof json.handle !== 'string') {
            return '';
        }

        return json.handle;
    }
}
```

Key refactoring improvements made:

1. **Extracted shared types**: Created `Attachment`, `NotificationActor`, `NotificationPost`, `NotificationReplyTarget`, and `AccountRef` interfaces to eliminate inline type repetition across `Post`, `Notification`, etc.

2. **Introduced helper functions**: `extractNextPage()` and `extractArray()` eliminate the repeated pattern of safely extracting paginated response fields across many methods.

3. **Added `buildUrl()` helper**: Centralises URL construction with optional query params, replacing repeated `new URL(...)` + `searchParams.set()` patterns.

4. **Added `buildActionUrl()` and `postAction()` helpers**: Consolidate the repeated action URL construction and POST pattern used by `like`, `unlike`, `repost`, `derepost`, `follow`, `unfollow`, `block`, `unblock`.

5. **Extracted `buildContentBody()`**: Removes duplicated logic between `reply()` and `note()`.

6. **Extracted `buildAuthHeaders()` and `parseErrorResponse()`**: Breaks `fetchJSON` into smaller, focused private methods.

7. **Added empty response constants**: `EMPTY_POSTS_RESPONSE`, `EMPTY_ACCOUNTS_RESPONSE`, `EMPTY_NOTIFICATIONS_RESPONSE` avoid repeated object literals.

8. **Added `HttpMethod` and `ImagePayload` types**: Improves readability and reuse.

9. **Simplified `getNotifications()`**: Merged the two null/missing-key checks into one guard clause.

10. **Added explicit return types** to methods that were missing them (`resetNotificationsCount`, `updateAccount`, Bluesky methods).