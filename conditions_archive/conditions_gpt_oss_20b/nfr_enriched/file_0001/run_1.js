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
        typeof (error as any).statusCode === 'number' &&
        typeof (error as any).message === 'string'
    );
};

export class ActivityPubAPI {
    constructor(
        private readonly apiUrl: URL,
        private readonly authApiUrl: URL,
        private readonly handle: string,
        private readonly fetch: (resource: URL, init?: RequestInit) => Promise<Response> = window.fetch.bind(window)
    ) {}

    /**
     * Retrieve an authentication token from the auth API.
     */
    private async getToken(): Promise<string | null> {
        try {
            const response = await this.fetch(this.authApiUrl);
            const json = await response.json();
            return json?.identities?.[0]?.token ?? null;
        } catch {
            // TODO: Ping sentry?
            return null;
        }
    }

    /**
     * Perform a fetch request and parse the JSON response.
     * Throws an Error instance on non‑OK responses.
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
            const error = new Error('Something went wrong, please try again.');
            (error as any).statusCode = response.status;
            try {
                const json = await response.json();
                const errorMessage = json.message || json.error;
                if (errorMessage) {
                    error.message = errorMessage;
                }
                if (json.code) {
                    (error as any).code = json.code;
                }
            } catch {
                // Leave the default message
            }
            throw error;
        }

        return await response.json();
    }

    /**
     * Generic helper for paginated GET requests.
     */
    private async fetchPaginated<T>(endpoint: string, next?: string, key: string = 'data'): Promise<{items: T[], next: string | null}> {
        const url = new URL(endpoint, this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }
        const json = await this.fetchJSON(url);
        if (!json || !(key in json)) {
            return {items: [], next: null};
        }
        const items = Array.isArray((json as any)[key]) ? (json as any)[key] : [];
        const nextPage = 'next' in json && typeof (json as any).next === 'string' ? (json as any).next : null;
        return {items, next: nextPage};
    }

    async blockDomain(domain: URL): Promise<boolean> {
        const url = new URL(
            `.ghost/activitypub/v1/actions/block/domain/${encodeURIComponent(domain.href)}`,
            this.apiUrl
        );
        await this.fetchJSON(url, 'POST');
        return true;
    }

    async unblockDomain(domain: URL): Promise<boolean> {
        const url = new URL(
            `.ghost/activitypub/v1/actions/unblock/domain/${encodeURIComponent(domain.href)}`,
            this.apiUrl
        );
        await this.fetchJSON(url, 'POST');
        return true;
    }

    async block(id: URL): Promise<boolean> {
        const url = new URL(
            `.ghost/activitypub/v1/actions/block/${encodeURIComponent(id.href)}`,
            this.apiUrl
        );
        await this.fetchJSON(url, 'POST');
        return true;
    }

    async unblock(id: URL): Promise<boolean> {
        const url = new URL(
            `.ghost/activitypub/v1/actions/unblock/${encodeURIComponent(id.href)}`,
            this.apiUrl
        );
        await this.fetchJSON(url, 'POST');
        return true;
    }

    async follow(username: string): Promise<Actor> {
        const url = new URL(`.ghost/activitypub/v1/actions/follow/${username}`, this.apiUrl);
        const json = await this.fetchJSON(url, 'POST');
        return json as Actor;
    }

    async unfollow(username: string): Promise<Actor> {
        const url = new URL(`.ghost/activitypub/v1/actions/unfollow/${username}`, this.apiUrl);
        const json = await this.fetchJSON(url, 'POST');
        return json as Actor;
    }

    async like(id: string): Promise<void> {
        const url = new URL(`.ghost/activitypub/v1/actions/like/${encodeURIComponent(id)}`, this.apiUrl);
        await this.fetchJSON(url, 'POST');
    }

    async unlike(id: string): Promise<void> {
        const url = new URL(`.ghost/activitypub/v1/actions/unlike/${encodeURIComponent(id)}`, this.apiUrl);
        await this.fetchJSON(url, 'POST');
    }

    async repost(id: string): Promise<void> {
        const url = new URL(`.ghost/activitypub/v1/actions/repost/${encodeURIComponent(id)}`, this.apiUrl);
        await this.fetchJSON(url, 'POST');
    }

    async derepost(id: string): Promise<void> {
        const url = new URL(`.ghost/activitypub/v1/actions/derepost/${encodeURIComponent(id)}`, this.apiUrl);
        await this.fetchJSON(url, 'POST');
    }

    async reply(id: string, content: string, image?: {url: string, altText?: string}): Promise<Activity> {
        const url = new URL(`.ghost/activitypub/v1/actions/reply/${encodeURIComponent(id)}`, this.apiUrl);
        const body: {content: string, image?: {url: string, altText?: string}} = {content};
        if (image) {
            body.image = image;
        }
        const response = await this.fetchJSON(url, 'POST', body);
        return response;
    }

    async note(content: string, image?: {url: string, altText?: string}): Promise<Post> {
        const url = new URL('.ghost/activitypub/v1/actions/note', this.apiUrl);
        const body: {content: string, image?: {url: string, altText?: string}} = {content};
        if (image) {
            body.image = image;
        }
        const response = await this.fetchJSON(url, 'POST', body);
        return (response as {post: Post}).post;
    }

    async delete(id: string): Promise<void> {
        const url = new URL(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`, this.apiUrl);
        await this.fetchJSON(url, 'DELETE');
    }

    get userApiUrl() {
        return new URL(`.ghost/activitypub/users/${this.handle}`, this.apiUrl);
    }

    async getUser() {
        const json = await this.fetchJSON(this.userApiUrl);
        return json as ActorProperties;
    }

    get searchApiUrl() {
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
        const url = new URL(`.ghost/activitypub/v1/thread/${encodeURIComponent(id)}`, this.apiUrl);
        const json = await this.fetchJSON(url);
        return json as Thread;
    }

    async getAccount(handle: string): Promise<GetAccountResponse> {
        const url = new URL(`.ghost/activitypub/v1/account/${handle}`, this.apiUrl);
        const json = await this.fetchJSON(url);
        return json as GetAccountResponse;
    }

    async getAccountFollows(handle: string, type: AccountFollowsType, next?: string): Promise<GetAccountFollowsResponse> {
        const url = new URL(`.ghost/activitypub/v1/account/${handle}/follows/${type}`, this.apiUrl);
        const {items, next: nextPage} = await this.fetchPaginated<FollowAccount>(url.toString(), next, 'accounts');
        return {accounts: items, next: nextPage};
    }

    async getFeed(next?: string): Promise<PaginatedPostsResponse> {
        const {items, next: nextPage} = await this.fetchPaginated<Post>('.ghost/activitypub/v1/feed/notes', next, 'posts');
        return {posts: items, next: nextPage};
    }

    async getInbox(next?: string): Promise<PaginatedPostsResponse> {
        const {items, next: nextPage} = await this.fetchPaginated<Post>('.ghost/activitypub/v1/feed/reader', next, 'posts');
        return {posts: items, next: nextPage};
    }

    async getDiscoveryFeed(topic: string, next?: string): Promise<PaginatedPostsResponse> {
        const endpoint = `.ghost/activitypub/v1/feed/discover/${topic}`;
        const {items, next: nextPage} = await this.fetchPaginated<Post>(endpoint, next, 'posts');
        return {posts: items, next: nextPage};
    }

    async getExploreAccounts(topic: string, next?: string): Promise<PaginatedExploreAccountsResponse> {
        const endpoint = `.ghost/activitypub/v1/explore/${topic}`;
        const {items, next: nextPage} = await this.fetchPaginated<ExploreAccount>(endpoint, next, 'accounts');
        return {accounts: items, next: nextPage};
    }

    async getTopics(): Promise<GetTopicsResponse> {
        const url = new URL('.ghost/activitypub/v1/topics', this.apiUrl);
        const json = await this.fetchJSON(url);
        return {
            topics: (json && 'topics' in json && Array.isArray(json.topics)) ? json.topics : []
        };
    }

    async getRecommendations(limit?: number): Promise<GetRecommendationsResponse> {
        const url = new URL('.ghost/activitypub/v1/recommendations', this.apiUrl);
        if (limit) {
            url.searchParams.set('limit', limit.toString());
        }
        const json = await this.fetchJSON(url);
        return {
            accounts: (json && 'accounts' in json && Array.isArray(json.accounts)) ? json.accounts : []
        };
    }

    async getPostsByAccount(handle: string, next?: string): Promise<PaginatedPostsResponse> {
        const {items, next: nextPage} = await this.fetchPaginated<Post>(`.ghost/activitypub/v1/posts/${handle}`, next, 'posts');
        return {posts: items, next: nextPage};
    }

    async getPostsLikedByAccount(next?: string): Promise<PaginatedPostsResponse> {
        const {items, next: nextPage} = await this.fetchPaginated<Post>(`.ghost/activitypub/v1/posts/me/liked`, next, 'posts');
        return {posts: items, next: nextPage};
    }

    async getNotifications(next?: string): Promise<GetNotificationsResponse> {
        const {items, next: nextPage} = await this.fetchPaginated<Notification>('.ghost/activitypub/v1/notifications', next, 'notifications');
        return {notifications: items, next: nextPage};
    }

    async getNotificationsCount(): Promise<GetNotificationsCountResponse> {
        const url = new URL('.ghost/activitypub/v1/notifications/unread/count', this.apiUrl);
        const json = await this.fetchJSON(url);
        if (json === null) {
            return {count: 0};
        }
        const count = typeof (json as Record<string, unknown>).count === 'number'
            ? (json as {count: number}).count
            : 0;
        return {count};
    }

    async resetNotificationsCount() {
        const url = new URL('.ghost/activitypub/v1/notifications/unread/reset', this.apiUrl);
        await this.fetchJSON(url, 'PUT');
        return true;
    }

    async getBlockedAccounts(next?: string): Promise<GetBlockedAccountsResponse> {
        const {items, next: nextPage} = await this.fetchPaginated<Account>('.ghost/activitypub/v1/blocks/accounts', next, 'blocked_accounts');
        return {accounts: items, next: nextPage};
    }

    async getBlockedDomains(next?: string): Promise<GetBlockedDomainsResponse> {
        const {items, next: nextPage} = await this.fetchPaginated<Account>('.ghost/activitypub/v1/blocks/domains', next, 'blocked_domains');
        return {domains: items, next: nextPage};
    }

    async getPost(id: string): Promise<Post> {
        const url = new URL(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`, this.apiUrl);
        const json = await this.fetchJSON(url);
        return json as Post;
    }

    async getReplies(postApId: string, next?: string): Promise<ReplyChainResponse> {
        const url = new URL(`.ghost/activitypub/v1/replies/${encodeURIComponent(postApId)}`, this.apiUrl);
        const {items, next: nextPage} = await this.fetchPaginated<Post>(url.toString(), next, 'children');
        // The API returns a different shape for replies; we keep the original response.
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
    }) {
        const url = new URL(`.ghost/activitypub/v1/account`, this.apiUrl);
        await this.fetchJSON(url, 'PUT', {
            name,
            username,
            bio,
            avatarUrl,
            bannerImageUrl
        });
    }

    async upload(file: File): Promise<string> {
        const url = new URL('.ghost/activitypub/v1/upload/image', this.apiUrl);
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
            const error = new Error('Upload failed');
            (error as any).statusCode = response.status;
            throw error;
        }

        const json = await response.json();
        return json.fileUrl;
    }

    async enableBluesky() {
        const url = new URL('.ghost/activitypub/v2/actions/bluesky/enable', this.apiUrl);
        await this.fetchJSON(url, 'POST');
    }

    async disableBluesky() {
        const url = new URL('.ghost/activitypub/v2/actions/bluesky/disable', this.apiUrl);
        await this.fetchJSON(url, 'POST');
    }

    async confirmBlueskyHandle(): Promise<string> {
        const url = new URL('.ghost/activitypub/v2/actions/bluesky/confirm-handle', this.apiUrl);
        const json = await this.fetchJSON(url, 'POST');
        if (json === null || !('handle' in json) || typeof json.handle !== 'string') {
            return '';
        }
        return String(json.handle);
    }
}