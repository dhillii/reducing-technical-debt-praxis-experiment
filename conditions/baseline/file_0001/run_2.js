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

type HttpMethod = 'DELETE' | 'GET' | 'POST' | 'PUT';

type ImagePayload = {url: string; altText?: string};

type PaginatedResponse = {next: string | null};

const BASE_PATH = '.ghost/activitypub';

const buildUrl = (base: URL, path: string, next?: string): URL => {
    const url = new URL(path, base);
    if (next) {
        url.searchParams.set('next', next);
    }
    return url;
};

const extractNextPage = (json: object): string | null =>
    'next' in json && typeof (json as {next: unknown}).next === 'string'
        ? (json as {next: string}).next
        : null;

const extractArray = <T>(json: object, key: string): T[] => {
    const record = json as Record<string, unknown>;
    return key in record && Array.isArray(record[key]) ? (record[key] as T[]) : [];
};

const emptyPaginated = <K extends string, T>(key: K): Record<K, T[]> & PaginatedResponse =>
    ({[key]: [], next: null} as Record<K, T[]> & PaginatedResponse);

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
        const headers: Record<string, string> = this.buildAuthHeaders(token);
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
            throw await this.parseErrorResponse(response);
        }

        return response.json();
    }

    private buildActionUrl(action: string, id?: string): URL {
        const encoded = id ? encodeURIComponent(id) : '';
        const path = encoded
            ? `${BASE_PATH}/v1/actions/${action}/${encoded}`
            : `${BASE_PATH}/v1/actions/${action}`;
        return new URL(path, this.apiUrl);
    }

    private async performAction(action: string, id?: string): Promise<true> {
        await this.fetchJSON(this.buildActionUrl(action, id), 'POST');
        return true;
    }

    async blockDomain(domain: URL): Promise<boolean> {
        return this.performAction('block/domain', domain.href);
    }

    async unblockDomain(domain: URL): Promise<boolean> {
        return this.performAction('unblock/domain', domain.href);
    }

    async block(id: URL): Promise<boolean> {
        return this.performAction('block', id.href);
    }

    async unblock(id: URL): Promise<boolean> {
        return this.performAction('unblock', id.href);
    }

    async follow(username: string): Promise<Actor> {
        return this.fetchJSON(this.buildActionUrl('follow', username), 'POST') as Promise<Actor>;
    }

    async unfollow(username: string): Promise<Actor> {
        return this.fetchJSON(this.buildActionUrl('unfollow', username), 'POST') as Promise<Actor>;
    }

    async like(id: string): Promise<void> {
        await this.fetchJSON(this.buildActionUrl('like', id), 'POST');
    }

    async unlike(id: string): Promise<void> {
        await this.fetchJSON(this.buildActionUrl('unlike', id), 'POST');
    }

    async repost(id: string): Promise<void> {
        await this.fetchJSON(this.buildActionUrl('repost', id), 'POST');
    }

    async derepost(id: string): Promise<void> {
        await this.fetchJSON(this.buildActionUrl('derepost', id), 'POST');
    }

    private buildContentBody(content: string, image?: ImagePayload): {content: string; image?: ImagePayload} {
        return image ? {content, image} : {content};
    }

    async reply(id: string, content: string, image?: ImagePayload): Promise<Activity> {
        const url = this.buildActionUrl('reply', id);
        return this.fetchJSON(url, 'POST', this.buildContentBody(content, image));
    }

    async note(content: string, image?: ImagePayload): Promise<Post> {
        const url = new URL(`${BASE_PATH}/v1/actions/note`, this.apiUrl);
        const response = await this.fetchJSON(url, 'POST', this.buildContentBody(content, image));
        return (response as {post: Post}).post;
    }

    async delete(id: string): Promise<void> {
        const url = new URL(`${BASE_PATH}/v1/post/${encodeURIComponent(id)}`, this.apiUrl);
        await this.fetchJSON(url, 'DELETE');
    }

    get userApiUrl(): URL {
        return new URL(`${BASE_PATH}/users/${this.handle}`, this.apiUrl);
    }

    async getUser(): Promise<ActorProperties> {
        return this.fetchJSON(this.userApiUrl) as Promise<ActorProperties>;
    }

    get searchApiUrl(): URL {
        return new URL(`${BASE_PATH}/v1/actions/search`, this.apiUrl);
    }

    async search(query: string): Promise<SearchResults> {
        const url = this.searchApiUrl;
        url.searchParams.set('query', query);
        const json = await this.fetchJSON(url);
        return (json && 'accounts' in json) ? json as SearchResults : {accounts: []};
    }

    async getThread(id: string): Promise<Thread> {
        const url = new URL(`${BASE_PATH}/v1/thread/${encodeURIComponent(id)}`, this.apiUrl);
        return this.fetchJSON(url) as Promise<Thread>;
    }

    async getAccount(handle: string): Promise<GetAccountResponse> {
        const url = new URL(`${BASE_PATH}/v1/account/${handle}`, this.apiUrl);
        return this.fetchJSON(url) as Promise<GetAccountResponse>;
    }

    async getAccountFollows(handle: string, type: AccountFollowsType, next?: string): Promise<GetAccountFollowsResponse> {
        const url = buildUrl(this.apiUrl, `${BASE_PATH}/v1/account/${handle}/follows/${type}`, next);
        const json = await this.fetchJSON(url);

        if (!json || !('accounts' in json)) {
            return emptyPaginated('accounts') as GetAccountFollowsResponse;
        }

        return {
            accounts: extractArray<FollowAccount>(json, 'accounts'),
            next: extractNextPage(json)
        };
    }

    async getFeed(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts(`${BASE_PATH}/v1/feed/notes`, next);
    }

    async getInbox(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts(`${BASE_PATH}/v1/feed/reader`, next);
    }

    async getDiscoveryFeed(topic: string, next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts(`${BASE_PATH}/v1/feed/discover/${topic}`, next);
    }

    async getExploreAccounts(topic: string, next?: string): Promise<PaginatedExploreAccountsResponse> {
        return this.getPaginatedExploreAccounts(`${BASE_PATH}/v1/explore/${topic}`, next);
    }

    async getTopics(): Promise<GetTopicsResponse> {
        const url = new URL(`${BASE_PATH}/v1/topics`, this.apiUrl);
        const json = await this.fetchJSON(url);
        return {
            topics: json ? extractArray<TopicData>(json, 'topics') : []
        };
    }

    async getRecommendations(limit?: number): Promise<GetRecommendationsResponse> {
        const url = new URL(`${BASE_PATH}/v1/recommendations`, this.apiUrl);
        if (limit) {
            url.searchParams.set('limit', limit.toString());
        }
        const json = await this.fetchJSON(url);
        return {
            accounts: json ? extractArray<ExploreAccount>(json, 'accounts') : []
        };
    }

    async getPostsByAccount(handle: string, next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts(`${BASE_PATH}/v1/posts/${handle}`, next);
    }

    async getPostsLikedByAccount(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts(`${BASE_PATH}/v1/posts/me/liked`, next);
    }

    private async getPaginatedPosts(endpoint: string, next?: string): Promise<PaginatedPostsResponse> {
        const url = buildUrl(this.apiUrl, endpoint, next);
        const json = await this.fetchJSON(url);

        if (!json || !('posts' in json)) {
            return emptyPaginated('posts') as PaginatedPostsResponse;
        }

        return {
            posts: extractArray<Post>(json, 'posts'),
            next: extractNextPage(json)
        };
    }

    async getNotifications(next?: string): Promise<GetNotificationsResponse> {
        const url = buildUrl(this.apiUrl, `${BASE_PATH}/v1/notifications`, next);
        const json = await this.fetchJSON(url);

        if (!json || !('notifications' in json)) {
            return emptyPaginated('notifications') as GetNotificationsResponse;
        }

        return {
            notifications: extractArray<Notification>(json, 'notifications'),
            next: extractNextPage(json)
        };
    }

    async getNotificationsCount(): Promise<GetNotificationsCountResponse> {
        const url = new URL(`${BASE_PATH}/v1/notifications/unread/count`, this.apiUrl);
        const json = await this.fetchJSON(url);
        const count = json && typeof (json as Record<string, unknown>).count === 'number'
            ? (json as {count: number}).count
            : 0;
        return {count};
    }

    async resetNotificationsCount(): Promise<true> {
        const url = new URL(`${BASE_PATH}/v1/notifications/unread/reset`, this.apiUrl);
        await this.fetchJSON(url, 'PUT');
        return true;
    }

    async getBlockedAccounts(next?: string): Promise<GetBlockedAccountsResponse> {
        const url = buildUrl(this.apiUrl, `${BASE_PATH}/v1/blocks/accounts`, next);
        const json = await this.fetchJSON(url);

        if (!json) {
            return emptyPaginated('accounts') as GetBlockedAccountsResponse;
        }

        return {
            accounts: extractArray<Account>(json, 'blocked_accounts'),
            next: extractNextPage(json)
        };
    }

    async getBlockedDomains(next?: string): Promise<GetBlockedDomainsResponse> {
        const url = buildUrl(this.apiUrl, `${BASE_PATH}/v1/blocks/domains`, next);
        const json = await this.fetchJSON(url);

        if (!json) {
            return emptyPaginated('domains') as GetBlockedDomainsResponse;
        }

        return {
            domains: extractArray<Account>(json, 'blocked_domains'),
            next: extractNextPage(json)
        };
    }

    private async getPaginatedExploreAccounts(endpoint: string, next?: string): Promise<PaginatedExploreAccountsResponse> {
        const url = buildUrl(this.apiUrl, endpoint, next);
        const json = await this.fetchJSON(url);

        if (!json || !('accounts' in json)) {
            return emptyPaginated('accounts') as PaginatedExploreAccountsResponse;
        }

        return {
            accounts: extractArray<ExploreAccount>(json, 'accounts'),
            next: extractNextPage(json)
        };
    }

    async getPost(id: string): Promise<Post> {
        const url = new URL(`${BASE_PATH}/v1/post/${encodeURIComponent(id)}`, this.apiUrl);
        return this.fetchJSON(url) as Promise<Post>;
    }

    async getReplies(postApId: string, next?: string): Promise<ReplyChainResponse> {
        const url = buildUrl(this.apiUrl, `${BASE_PATH}/v1/replies/${encodeURIComponent(postApId)}`, next);
        return this.fetchJSON(url) as Promise<ReplyChainResponse>;
    }

    async updateAccount({name, username, bio, avatarUrl, bannerImageUrl}: {
        name: string;
        username: string;
        bio: string;
        avatarUrl: string;
        bannerImageUrl: string;
    }): Promise<void> {
        const url = new URL(`${BASE_PATH}/v1/account`, this.apiUrl);
        await this.fetchJSON(url, 'PUT', {name, username, bio, avatarUrl, bannerImageUrl});
    }

    async upload(file: File): Promise<string> {
        const url = new URL(`${BASE_PATH}/v1/upload/image`, this.apiUrl);
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
        await this.fetchJSON(new URL(`${BASE_PATH}/v2/actions/bluesky/enable`, this.apiUrl), 'POST');
    }

    async disableBluesky(): Promise<void> {
        await this.fetchJSON(new URL(`${BASE_PATH}/v2/actions/bluesky/disable`, this.apiUrl), 'POST');
    }

    async confirmBlueskyHandle(): Promise<string> {
        const url = new URL(`${BASE_PATH}/v2/actions/bluesky/confirm-handle`, this.apiUrl);
        const json = await this.fetchJSON(url, 'POST');

        if (!json || !('handle' in json) || typeof (json as {handle: unknown}).handle !== 'string') {
            return '';
        }

        return (json as {handle: string}).handle;
    }
}
```

Key refactoring improvements:

1. **Extracted shared types**: `Attachment`, `NotificationActor`, `NotificationPost`, `NotificationInReplyTo`, and `AccountAuthor` reduce inline repetition across `Post`, `Notification`, etc.

2. **Introduced helper functions**: `buildUrl`, `extractNextPage`, `extractArray`, and `emptyPaginated` eliminate repeated null-checking and array-extraction patterns across all paginated methods.

3. **Extracted `BASE_PATH` constant**: Removes the repeated `.ghost/activitypub` string literal throughout the class.

4. **Introduced `buildActionUrl` and `performAction`**: Consolidates the repeated URL-building and POST pattern used by `block`, `unblock`, `like`, `unlike`, `repost`, `derepost`, etc.

5. **Extracted `buildAuthHeaders` and `parseErrorResponse`**: Breaks `fetchJSON` into smaller, focused private methods.

6. **Extracted `buildContentBody`**: Removes duplicated image-payload construction in `reply` and `note`.

7. **Introduced `HttpMethod` and `ImagePayload` type aliases**: Improves readability and reuse.

8. **Simplified boolean returns**: `performAction` returns `true` directly, removing redundant `return true` statements.