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

export class ActivityPubAPI {
    constructor(
        private readonly apiUrl: URL,
        private readonly authApiUrl: URL,
        private readonly handle: string,
        private readonly fetch: (resource: URL, init?: RequestInit) => Promise<Response> = window.fetch.bind(window)
    ) {}

    /** Retrieve an authentication token from the auth API. */
    private async getToken(): Promise<string | null> {
        try {
            const response = await this.fetch(this.authApiUrl);
            const json = await response.json();
            return json?.identities?.[0]?.token || null;
        } catch {
            // TODO: Ping sentry?
            return null;
        }
    }

    /** Perform a JSON request with the appropriate headers and error handling. */
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

            throw error;
        }

        return await response.json();
    }

    /** Helper to perform an action that returns a JSON payload. */
    private async performAction<T>(endpoint: string, method: 'POST' | 'DELETE' | 'PUT', body?: object): Promise<T | null> {
        const url = new URL(endpoint, this.apiUrl);
        return this.fetchJSON<T>(url, method, body) as Promise<T | null>;
    }

    /** Helper to fetch paginated data. */
    private async getPaginated<T>(endpoint: string, next?: string, key: string): Promise<{items: T[], next: string | null}> {
        const url = new URL(endpoint, this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }
        const json = await this.fetchJSON(url);
        if (!json) {
            return {items: [], next: null};
        }
        const items = Array.isArray(json[key]) ? json[key] : [];
        const nextPage = typeof json.next === 'string' ? json.next : null;
        return {items, next: nextPage};
    }

    async blockDomain(domain: URL): Promise<boolean> {
        await this.performAction<void>(`.ghost/activitypub/v1/actions/block/domain/${encodeURIComponent(domain.href)}`, 'POST');
        return true;
    }

    async unblockDomain(domain: URL): Promise<boolean> {
        await this.performAction<void>(`.ghost/activitypub/v1/actions/unblock/domain/${encodeURIComponent(domain.href)}`, 'POST');
        return true;
    }

    async block(id: URL): Promise<boolean> {
        await this.performAction<void>(`.ghost/activitypub/v1/actions/block/${encodeURIComponent(id.href)}`, 'POST');
        return true;
    }

    async unblock(id: URL): Promise<boolean> {
        await this.performAction<void>(`.ghost/activitypub/v1/actions/unblock/${encodeURIComponent(id.href)}`, 'POST');
        return true;
    }

    async follow(username: string): Promise<Actor> {
        const json = await this.performAction<Actor>(`.ghost/activitypub/v1/actions/follow/${username}`, 'POST');
        return json as Actor;
    }

    async unfollow(username: string): Promise<Actor> {
        const json = await this.performAction<Actor>(`.ghost/activitypub/v1/actions/unfollow/${username}`, 'POST');
        return json as Actor;
    }

    async like(id: string): Promise<void> {
        await this.performAction<void>(`.ghost/activitypub/v1/actions/like/${encodeURIComponent(id)}`, 'POST');
    }

    async unlike(id: string): Promise<void> {
        await this.performAction<void>(`.ghost/activitypub/v1/actions/unlike/${encodeURIComponent(id)}`, 'POST');
    }

    async repost(id: string): Promise<void> {
        await this.performAction<void>(`.ghost/activitypub/v1/actions/repost/${encodeURIComponent(id)}`, 'POST');
    }

    async derepost(id: string): Promise<void> {
        await this.performAction<void>(`.ghost/activitypub/v1/actions/derepost/${encodeURIComponent(id)}`, 'POST');
    }

    async reply(id: string, content: string, image?: {url: string, altText?: string}): Promise<Activity> {
        const body: {content: string, image?: {url: string, altText?: string}} = {content};
        if (image) {
            body.image = image;
        }
        const json = await this.performAction<Activity>(`.ghost/activitypub/v1/actions/reply/${encodeURIComponent(id)}`, 'POST', body);
        return json as Activity;
    }

    async note(content: string, image?: {url: string, altText?: string}): Promise<Post> {
        const body: {content: string, image?: {url: string, altText?: string}} = {content};
        if (image) {
            body.image = image;
        }
        const json = await this.performAction<{post: Post}>(`.ghost/activitypub/v1/actions/note`, 'POST', body);
        return (json as {post: Post}).post;
    }

    async delete(id: string): Promise<void> {
        await this.performAction<void>(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`, 'DELETE');
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
        const json = await this.fetchJSON(url);
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
        const endpoint = `.ghost/activitypub/v1/account/${handle}/follows/${type}`;
        const {items, next: nextPage} = await this.getPaginated<FollowAccount>(endpoint, next, 'accounts');
        return {accounts: items, next: nextPage};
    }

    async getFeed(next?: string): Promise<PaginatedPostsResponse> {
        const {items, next: nextPage} = await this.getPaginated<Post>('.ghost/activitypub/v1/feed/notes', next, 'posts');
        return {posts: items, next: nextPage};
    }

    async getInbox(next?: string): Promise<PaginatedPostsResponse> {
        const {items, next: nextPage} = await this.getPaginated<Post>('.ghost/activitypub/v1/feed/reader', next, 'posts');
        return {posts: items, next: nextPage};
    }

    async getDiscoveryFeed(topic: string, next?: string): Promise<PaginatedPostsResponse> {
        const endpoint = `.ghost/activitypub/v1/feed/discover/${topic}`;
        const {items, next: nextPage} = await this.getPaginated<Post>(endpoint, next, 'posts');
        return {posts: items, next: nextPage};
    }

    async getExploreAccounts(topic: string, next?: string): Promise<PaginatedExploreAccountsResponse> {
        const endpoint = `.ghost/activitypub/v1/explore/${topic}`;
        const {items, next: nextPage} = await this.getPaginated<ExploreAccount>(endpoint, next, 'accounts');
        return {accounts: items, next: nextPage};
    }

    async getTopics(): Promise<GetTopicsResponse> {
        const url = new URL('.ghost/activitypub/v1/topics', this.apiUrl);
        const json = await this.fetchJSON(url);
        const topics = (json && 'topics' in json && Array.isArray(json.topics)) ? json.topics : [];
        return {topics};
    }

    async getRecommendations(limit?: number): Promise<GetRecommendationsResponse> {
        const url = new URL('.ghost/activitypub/v1/recommendations', this.apiUrl);
        if (limit) {
            url.searchParams.set('limit', limit.toString());
        }
        const json = await this.fetchJSON(url);
        const accounts = (json && 'accounts' in json && Array.isArray(json.accounts)) ? json.accounts : [];
        return {accounts};
    }

    async getPostsByAccount(handle: string, next?: string): Promise<PaginatedPostsResponse> {
        const endpoint = `.ghost/activitypub/v1/posts/${handle}`;
        const {items, next: nextPage} = await this.getPaginated<Post>(endpoint, next, 'posts');
        return {posts: items, next: nextPage};
    }

    async getPostsLikedByAccount(next?: string): Promise<PaginatedPostsResponse> {
        const endpoint = `.ghost/activitypub/v1/posts/me/liked`;
        const {items, next: nextPage} = await this.getPaginated<Post>(endpoint, next, 'posts');
        return {posts: items, next: nextPage};
    }

    async getNotifications(next?: string): Promise<GetNotificationsResponse> {
        const endpoint = `.ghost/activitypub/v1/notifications`;
        const {items, next: nextPage} = await this.getPaginated<Notification>(endpoint, next, 'notifications');
        return {notifications: items, next: nextPage};
    }

    async getNotificationsCount(): Promise<GetNotificationsCountResponse> {
        const url = new URL('.ghost/activitypub/v1/notifications/unread/count', this.apiUrl);
        const json = await this.fetchJSON(url);
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
        const endpoint = `.ghost/activitypub/v1/blocks/accounts`;
        const {items, next: nextPage} = await this.getPaginated<Account>(endpoint, next, 'blocked_accounts');
        return {accounts: items, next: nextPage};
    }

    async getBlockedDomains(next?: string): Promise<GetBlockedDomainsResponse> {
        const endpoint = `.ghost/activitypub/v1/blocks/domains`;
        const {items, next: nextPage} = await this.getPaginated<Account>(endpoint, next, 'blocked_domains');
        return {domains: items, next: nextPage};
    }

    async getPost(id: string): Promise<Post> {
        const url = new URL(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`, this.apiUrl);
        const json = await this.fetchJSON(url);
        return json as Post;
    }

    async getReplies(postApId: string, next?: string): Promise<ReplyChainResponse> {
        const url = new URL(`.ghost/activitypub/v1/replies/${encodeURIComponent(postApId)}`, this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }
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
        await this.performAction<void>(`.ghost/activitypub/v1/account`, 'PUT', {
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
            throw {
                message: 'Upload failed',
                statusCode: response.status
            };
        }

        const json = await response.json();
        return json.fileUrl;
    }

    async enableBluesky() {
        await this.performAction<void>(`.ghost/activitypub/v2/actions/bluesky/enable`, 'POST');
    }

    async disableBluesky() {
        await this.performAction<void>(`.ghost/activitypub/v2/actions/bluesky/disable`, 'POST');
    }

    async confirmBlueskyHandle(): Promise<string> {
        const json = await this.performAction<{handle?: string}>(`.ghost/activitypub/v2/actions/bluesky/confirm-handle`, 'POST');
        if (json && typeof json.handle === 'string') {
            return json.handle;
        }
        return '';
    }
}