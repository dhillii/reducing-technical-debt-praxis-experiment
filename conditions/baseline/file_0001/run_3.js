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

export type AccountAuthor = Pick<Account, 'id' | 'handle' | 'avatarUrl' | 'name' | 'url' | 'followedByMe'>;

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

export interface NotificationInReplyTo {
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
    inReplyTo: NotificationInReplyTo | null;
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
    author: AccountAuthor;
    authoredByMe: boolean;
    repostCount: number;
    repostedByMe: boolean;
    repostedBy: AccountAuthor | null;
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

// Shared image type for post/reply bodies
interface ImagePayload {
    url: string;
    altText?: string;
}

// Helper to build paginated URL
function buildPaginatedUrl(base: URL, endpoint: string, next?: string): URL {
    const url = new URL(endpoint, base);
    if (next) {
        url.searchParams.set('next', next);
    }
    return url;
}

// Helper to extract next page cursor from JSON
function extractNextPage(json: object): string | null {
    return 'next' in json && typeof (json as Record<string, unknown>).next === 'string'
        ? (json as {next: string}).next
        : null;
}

// Helper to extract an array from JSON by key
function extractArray<T>(json: object, key: string): T[] {
    const value = (json as Record<string, unknown>)[key];
    return Array.isArray(value) ? (value as T[]) : [];
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

    private async fetchJSON(
        url: URL,
        method: 'DELETE' | 'GET' | 'POST' | 'PUT' = 'GET',
        body?: object
    ): Promise<object | null> {
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

    // --- Action helpers ---

    private buildActionUrl(action: string, id?: string): URL {
        const path = id
            ? `.ghost/activitypub/v1/actions/${action}/${encodeURIComponent(id)}`
            : `.ghost/activitypub/v1/actions/${action}`;
        return new URL(path, this.apiUrl);
    }

    private async postAction(action: string, id?: string): Promise<void> {
        await this.fetchJSON(this.buildActionUrl(action, id), 'POST');
    }

    async blockDomain(domain: URL): Promise<boolean> {
        await this.postAction('block/domain', domain.href);
        return true;
    }

    async unblockDomain(domain: URL): Promise<boolean> {
        await this.postAction('unblock/domain', domain.href);
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
        const url = new URL(`.ghost/activitypub/v1/actions/follow/${username}`, this.apiUrl);
        return this.fetchJSON(url, 'POST') as Promise<Actor>;
    }

    async unfollow(username: string): Promise<Actor> {
        const url = new URL(`.ghost/activitypub/v1/actions/unfollow/${username}`, this.apiUrl);
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

    private buildContentBody(content: string, image?: ImagePayload): {content: string; image?: ImagePayload} {
        return image ? {content, image} : {content};
    }

    async reply(id: string, content: string, image?: ImagePayload): Promise<Activity> {
        const url = this.buildActionUrl('reply', id);
        return this.fetchJSON(url, 'POST', this.buildContentBody(content, image));
    }

    async note(content: string, image?: ImagePayload): Promise<Post> {
        const url = new URL('.ghost/activitypub/v1/actions/note', this.apiUrl);
        const response = await this.fetchJSON(url, 'POST', this.buildContentBody(content, image));
        return (response as {post: Post}).post;
    }

    async delete(id: string): Promise<void> {
        const url = new URL(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`, this.apiUrl);
        await this.fetchJSON(url, 'DELETE');
    }

    // --- User ---

    get userApiUrl(): URL {
        return new URL(`.ghost/activitypub/users/${this.handle}`, this.apiUrl);
    }

    async getUser(): Promise<ActorProperties> {
        return this.fetchJSON(this.userApiUrl) as Promise<ActorProperties>;
    }

    // --- Search ---

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

    // --- Posts ---

    async getThread(id: string): Promise<Thread> {
        const url = new URL(`.ghost/activitypub/v1/thread/${encodeURIComponent(id)}`, this.apiUrl);
        return this.fetchJSON(url) as Promise<Thread>;
    }

    async getPost(id: string): Promise<Post> {
        const url = new URL(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`, this.apiUrl);
        return this.fetchJSON(url) as Promise<Post>;
    }

    async getReplies(postApId: string, next?: string): Promise<ReplyChainResponse> {
        const url = buildPaginatedUrl(
            this.apiUrl,
            `.ghost/activitypub/v1/replies/${encodeURIComponent(postApId)}`,
            next
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
        const url = buildPaginatedUrl(this.apiUrl, endpoint, next);
        const json = await this.fetchJSON(url);

        if (json === null || !('posts' in json)) {
            return {posts: [], next: null};
        }

        return {
            posts: extractArray<Post>(json, 'posts'),
            next: extractNextPage(json)
        };
    }

    // --- Accounts ---

    async getAccount(handle: string): Promise<GetAccountResponse> {
        const url = new URL(`.ghost/activitypub/v1/account/${handle}`, this.apiUrl);
        return this.fetchJSON(url) as Promise<GetAccountResponse>;
    }

    async getAccountFollows(handle: string, type: AccountFollowsType, next?: string): Promise<GetAccountFollowsResponse> {
        const url = buildPaginatedUrl(
            this.apiUrl,
            `.ghost/activitypub/v1/account/${handle}/follows/${type}`,
            next
        );
        const json = await this.fetchJSON(url);

        if (json === null || !('accounts' in json)) {
            return {accounts: [], next: null};
        }

        return {
            accounts: extractArray<FollowAccount>(json, 'accounts'),
            next: extractNextPage(json)
        };
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

    // --- Explore ---

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

    private async getPaginatedExploreAccounts(endpoint: string, next?: string): Promise<PaginatedExploreAccountsResponse> {
        const url = buildPaginatedUrl(this.apiUrl, endpoint, next);
        const json = await this.fetchJSON(url);

        if (json === null || !('accounts' in json)) {
            return {accounts: [], next: null};
        }

        return {
            accounts: extractArray<ExploreAccount>(json, 'accounts'),
            next: extractNextPage(json)
        };
    }

    // --- Notifications ---

    async getNotifications(next?: string): Promise<GetNotificationsResponse> {
        const url = buildPaginatedUrl(this.apiUrl, '.ghost/activitypub/v1/notifications', next);
        const json = await this.fetchJSON(url);

        if (json === null || !('notifications' in json)) {
            return {notifications: [], next: null};
        }

        return {
            notifications: extractArray<Notification>(json, 'notifications'),
            next: extractNextPage(json)
        };
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

    // --- Blocks ---

    async getBlockedAccounts(next?: string): Promise<GetBlockedAccountsResponse> {
        const url = buildPaginatedUrl(this.apiUrl, '.ghost/activitypub/v1/blocks/accounts', next);
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
        const url = buildPaginatedUrl(this.apiUrl, '.ghost/activitypub/v1/blocks/domains', next);
        const json = await this.fetchJSON(url);

        if (json === null) {
            return {domains: [], next: null};
        }

        return {
            domains: extractArray<Account>(json, 'blocked_domains'),
            next: extractNextPage(json)
        };
    }

    // --- Upload ---

    async upload(file: File): Promise<string> {
        const url = new URL('.ghost/activitypub/v1/upload/image', this.apiUrl);
        const token = await this.getToken();
        const formData = new FormData();
        formData.append('file', file);

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

    // --- Bluesky ---

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

        if (json === null || !('handle' in json) || typeof (json as Record<string, unknown>).handle !== 'string') {
            return '';
        }

        return (json as {handle: string}).handle;
    }
}
```

Key refactoring improvements:

1. **Extracted shared helper functions** (`buildPaginatedUrl`, `extractNextPage`, `extractArray`) to eliminate repeated pagination/extraction logic across multiple methods.

2. **Extracted `buildAuthHeaders` and `parseErrorResponse`** private methods to break up the monolithic `fetchJSON` method into focused responsibilities.

3. **Extracted `buildActionUrl` and `postAction`** helpers to consolidate the repeated URL-building and POST pattern used by `block`, `unblock`, `like`, `unlike`, `repost`, `derepost`, etc.

4. **Extracted shared types** (`Attachment`, `AccountAuthor`, `ImagePayload`, `NotificationActor`, `NotificationPost`, `NotificationInReplyTo`) to eliminate inline duplication across `Post`, `Notification`, and other interfaces.

5. **Extracted `buildContentBody`** to deduplicate the `reply` and `note` body construction logic.

6. **Grouped methods with comments** for better navigability.

7. **Simplified null-coalescing** (`??` instead of `||` where appropriate).

8. **Removed redundant double-null checks** in `getNotifications` and similar methods by combining conditions.