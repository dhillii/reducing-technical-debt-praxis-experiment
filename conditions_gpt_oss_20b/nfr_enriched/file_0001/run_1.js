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

type GetAccountResponse = Account

export type FollowAccount = Pick<Account, 'id' | 'name' | 'handle' | 'avatarUrl' | 'blockedByMe' | 'domainBlockedByMe'> & {isFollowing: true};

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
    },
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
        attachments?: {
            type: string;
            mediaType: string;
            name: string;
            url: string;
        }[];
    },
    inReplyTo: null | {
        id: string;
        type: 'article' | 'note';
        title: string | null;
        content: string;
        url: string;
    },
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
    attachments: {
        type: string;
        mediaType: string;
        name: string;
        url: string;
    }[];
    author: Pick<Account, 'id' | 'handle' | 'avatarUrl' | 'name' | 'url' | 'followedByMe'>;
    authoredByMe: boolean;
    repostCount: number;
    repostedByMe: boolean;
    repostedBy: Pick<
        Account,
        'id' | 'handle' | 'avatarUrl' | 'name' | 'url' | 'followedByMe'
    > | null;
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
        typeof error.statusCode === 'number' &&
        typeof error.message === 'string'
    );
};

/**
 * Custom error class that extends the native Error object.
 * Includes statusCode and optional code properties to match the ApiError interface.
 */
class ApiErrorInstance extends Error implements ApiError {
    statusCode: number;
    code?: string;
    constructor(message: string, statusCode: number, code?: string) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        if (code) {
            this.code = code;
        }
    }
}

export class ActivityPubAPI {
    constructor(
        private readonly apiUrl: URL,
        private readonly authApiUrl: URL,
        private readonly handle: string,
        private readonly fetch: (resource: URL, init?: RequestInit) => Promise<Response> = window.fetch.bind(window)
    ) {}

    /**
     * Retrieves an authentication token from the auth API.
     */
    private async getToken(): Promise<string | null> {
        try {
            const response = await this.fetch(this.authApiUrl);
            const json = await response.json();
            return json?.identities?.[0]?.token || null;
        } catch {
            return null;
        }
    }

    /**
     * Builds a URL relative to the base API URL.
     */
    private buildUrl(path: string, params?: Record<string, string>): URL {
        const url = new URL(path, this.apiUrl);
        if (params) {
            Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
        }
        return url;
    }

    /**
     * Performs a JSON request and returns the parsed response or null.
     * Throws an ApiErrorInstance on HTTP errors.
     */
    private async fetchJSON(url: URL, method: 'DELETE' | 'GET' | 'POST' | 'PUT' = 'GET', body?: object): Promise<object | null> {
        const token = await this.getToken();
        const options: RequestInit = {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/activity+json'
            }
        };
        if (body) {
            options.body = JSON.stringify(body);
            (options.headers! as Record<string, string>)['Content-Type'] = 'application/json';
        }
        const response = await this.fetch(url, options);

        if (response.status === 204 || response.status === 202) {
            return null;
        }

        if (!response.ok) {
            const error = new ApiErrorInstance('Something went wrong, please try again.', response.status);
            try {
                const json = await response.json();
                const message = json.message || json.error;
                if (message) {
                    error.message = message;
                }
                if (json.code) {
                    error.code = json.code;
                }
            } catch {
                // leave default message
            }
            throw error;
        }

        return await response.json();
    }

    /**
     * Parses a paginated JSON response.
     */
    private parsePaginated<T>(json: any, key: string): {items: T[], next: string | null} {
        if (!json || typeof json !== 'object') {
            return {items: [], next: null};
        }
        const items = Array.isArray(json[key]) ? json[key] : [];
        const next = typeof json.next === 'string' ? json.next : null;
        return {items, next};
    }

    async blockDomain(domain: URL): Promise<boolean> {
        const url = this.buildUrl(`.ghost/activitypub/v1/actions/block/domain/${encodeURIComponent(domain.href)}`);
        await this.fetchJSON(url, 'POST');
        return true;
    }

    async unblockDomain(domain: URL): Promise<boolean> {
        const url = this.buildUrl(`.ghost/activitypub/v1/actions/unblock/domain/${encodeURIComponent(domain.href)}`);
        await this.fetchJSON(url, 'POST');
        return true;
    }

    async block(id: URL): Promise<boolean> {
        const url = this.buildUrl(`.ghost/activitypub/v1/actions/block/${encodeURIComponent(id.href)}`);
        await this.fetchJSON(url, 'POST');
        return true;
    }

    async unblock(id: URL): Promise<boolean> {
        const url = this.buildUrl(`.ghost/activitypub/v1/actions/unblock/${encodeURIComponent(id.href)}`);
        await this.fetchJSON(url, 'POST');
        return true;
    }

    async follow(username: string): Promise<Actor> {
        const url = this.buildUrl(`.ghost/activitypub/v1/actions/follow/${username}`);
        const json = await this.fetchJSON(url, 'POST');
        return json as Actor;
    }

    async unfollow(username: string): Promise<Actor> {
        const url = this.buildUrl(`.ghost/activitypub/v1/actions/unfollow/${username}`);
        const json = await this.fetchJSON(url, 'POST');
        return json as Actor;
    }

    async like(id: string): Promise<void> {
        const url = this.buildUrl(`.ghost/activitypub/v1/actions/like/${encodeURIComponent(id)}`);
        await this.fetchJSON(url, 'POST');
    }

    async unlike(id: string): Promise<void> {
        const url = this.buildUrl(`.ghost/activitypub/v1/actions/unlike/${encodeURIComponent(id)}`);
        await this.fetchJSON(url, 'POST');
    }

    async repost(id: string): Promise<void> {
        const url = this.buildUrl(`.ghost/activitypub/v1/actions/repost/${encodeURIComponent(id)}`);
        await this.fetchJSON(url, 'POST');
    }

    async derepost(id: string): Promise<void> {
        const url = this.buildUrl(`.ghost/activitypub/v1/actions/derepost/${encodeURIComponent(id)}`);
        await this.fetchJSON(url, 'POST');
    }

    async reply(id: string, content: string, image?: {url: string; altText?: string}): Promise<Activity> {
        const url = this.buildUrl(`.ghost/activitypub/v1/actions/reply/${encodeURIComponent(id)}`);
        const body: {content: string; image?: {url: string; altText?: string}} = {content};
        if (image) {
            body.image = image;
        }
        const response = await this.fetchJSON(url, 'POST', body);
        return response as Activity;
    }

    async note(content: string, image?: {url: string; altText?: string}): Promise<Post> {
        const url = this.buildUrl('.ghost/activitypub/v1/actions/note');
        const body: {content: string; image?: {url: string; altText?: string}} = {content};
        if (image) {
            body.image = image;
        }
        const response = await this.fetchJSON(url, 'POST', body);
        return (response as {post: Post}).post;
    }

    async delete(id: string): Promise<void> {
        const url = this.buildUrl(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`);
        await this.fetchJSON(url, 'DELETE');
    }

    get userApiUrl(): URL {
        return new URL(`.ghost/activitypub/users/${this.handle}`, this.apiUrl);
    }

    async getUser(): Promise<ActorProperties> {
        const json = await this.fetchJSON(this.userApiUrl);
        return json as ActorProperties;
    }

    get searchApiUrl(): URL {
        return new URL('.ghost/activitypub/v1/actions/search', this.apiUrl);
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
        const url = this.buildUrl(`.ghost/activitypub/v1/account/${handle}/follows/${type}`, next ? {next} : undefined);
        const json = await this.fetchJSON(url);
        const {items, next: nextPage} = this.parsePaginated(json, 'accounts');
        return {accounts: items as FollowAccount[], next: nextPage};
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
            topics: (json && 'topics' in json && Array.isArray(json.topics)) ? json.topics : []
        };
    }

    async getRecommendations(limit?: number): Promise<GetRecommendationsResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/recommendations', limit ? {limit: limit.toString()} : undefined);
        const json = await this.fetchJSON(url);
        return {
            accounts: (json && 'accounts' in json && Array.isArray(json.accounts)) ? json.accounts : []
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
        const {items, next: nextPage} = this.parsePaginated(json, 'posts');
        return {posts: items as Post[], next: nextPage};
    }

    async getNotifications(next?: string): Promise<GetNotificationsResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/notifications', next ? {next} : undefined);
        const json = await this.fetchJSON(url);
        const {items, next: nextPage} = this.parsePaginated(json, 'notifications');
        return {notifications: items as Notification[], next: nextPage};
    }

    async getNotificationsCount(): Promise<GetNotificationsCountResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/notifications/unread/count');
        const json = await this.fetchJSON(url);
        const count = typeof (json as Record<string, unknown>).count === 'number'
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
        const {items, next: nextPage} = this.parsePaginated(json, 'blocked_accounts');
        return {accounts: items as Account[], next: nextPage};
    }

    async getBlockedDomains(next?: string): Promise<GetBlockedDomainsResponse> {
        const url = this.buildUrl('.ghost/activitypub/v1/blocks/domains', next ? {next} : undefined);
        const json = await this.fetchJSON(url);
        const {items, next: nextPage} = this.parsePaginated(json, 'blocked_domains');
        return {domains: items as Account[], next: nextPage};
    }

    private async getPaginatedExploreAccounts(endpoint: string, next?: string): Promise<PaginatedExploreAccountsResponse> {
        const url = this.buildUrl(endpoint, next ? {next} : undefined);
        const json = await this.fetchJSON(url);
        const {items, next: nextPage} = this.parsePaginated(json, 'accounts');
        return {accounts: items as ExploreAccount[], next: nextPage};
    }

    async getPost(id: string): Promise<Post> {
        const url = this.buildUrl(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`);
        const json = await this.fetchJSON(url);
        return json as Post;
    }

    async getReplies(postApId: string, next?: string): Promise<ReplyChainResponse> {
        const url = this.buildUrl(`.ghost/activitypub/v1/replies/${encodeURIComponent(postApId)}`, next ? {next} : undefined);
        const json = await this.fetchJSON(url);
        return json as ReplyChainResponse;
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

    async upload(file: File): Promise<string> {
        const url = this.buildUrl('.ghost/activitypub/v1/upload/image');
        const formData = new FormData();
        formData.append('file', file);
        const token = await this.getToken();
        const response = await this.fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`
            },
            body: formData
        });
        if (!response.ok) {
            throw new ApiErrorInstance('Upload failed', response.status);
        }
        const json = await response.json();
        return json.fileUrl;
    }

    async enableBluesky(): Promise<void> {
        const url = this.buildUrl('.ghost/activitypub/v2/actions/bluesky/enable');
        await this.fetchJSON(url, 'POST');
    }

    async disableBluesky(): Promise<void> {
        const url = this.buildUrl('.ghost/activitypub/v2/actions/bluesky/disable');
        await this.fetchJSON(url, 'POST');
    }

    async confirmBlueskyHandle(): Promise<string> {
        const url = this.buildUrl('.ghost/activitypub/v2/actions/bluesky/confirm-handle');
        const json = await this.fetchJSON(url, 'POST');
        if (json && 'handle' in json && typeof json.handle === 'string') {
            return json.handle;
        }
        return '';
    }
}