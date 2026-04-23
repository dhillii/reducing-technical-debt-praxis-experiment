```javascript
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
 * Handles API requests and responses.
 */
export class ActivityPubAPI {
    private readonly apiUrl: URL;
    private readonly authApiUrl: URL;
    private readonly handle: string;
    private readonly fetch: (resource: URL, init?: RequestInit) => Promise<Response>;

    /**
     * Initializes the API client.
     * @param apiUrl The base URL of the API.
     * @param authApiUrl The URL of the authentication API.
     * @param handle The handle of the user.
     * @param fetch The fetch function to use for requests.
     */
    constructor(
        apiUrl: URL,
        authApiUrl: URL,
        handle: string,
        fetch: (resource: URL, init?: RequestInit) => Promise<Response> = window.fetch.bind(window)
    ) {
        this.apiUrl = apiUrl;
        this.authApiUrl = authApiUrl;
        this.handle = handle;
        this.fetch = fetch;
    }

    /**
     * Gets the authentication token.
     * @returns The authentication token or null if it could not be obtained.
     */
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

    /**
     * Fetches JSON data from the API.
     * @param url The URL of the API endpoint.
     * @param method The HTTP method to use.
     * @param body The request body.
     * @returns The response data or null if the response was not OK.
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

    /**
     * Blocks a domain.
     * @param domain The domain to block.
     * @returns True if the domain was blocked successfully.
     */
    async blockDomain(domain: URL): Promise<boolean> {
        const url = new URL(
            `.ghost/activitypub/v1/actions/block/domain/${encodeURIComponent(domain.href)}`,
            this.apiUrl
        );
        await this.fetchJSON(url, 'POST');
        return true;
    }

    /**
     * Unblocks a domain.
     * @param domain The domain to unblock.
     * @returns True if the domain was unblocked successfully.
     */
    async unblockDomain(domain: URL): Promise<boolean> {
        const url = new URL(
            `.ghost/activitypub/v1/actions/unblock/domain/${encodeURIComponent(domain.href)}`,
            this.apiUrl
        );
        await this.fetchJSON(url, 'POST');
        return true;
    }

    /**
     * Blocks an account.
     * @param id The ID of the account to block.
     * @returns True if the account was blocked successfully.
     */
    async block(id: URL): Promise<boolean> {
        const url = new URL(
            `.ghost/activitypub/v1/actions/block/${encodeURIComponent(id.href)}`,
            this.apiUrl
        );
        await this.fetchJSON(url, 'POST');
        return true;
    }

    /**
     * Unblocks an account.
     * @param id The ID of the account to unblock.
     * @returns True if the account was unblocked successfully.
     */
    async unblock(id: URL): Promise<boolean> {
        const url = new URL(
            `.ghost/activitypub/v1/actions/unblock/${encodeURIComponent(id.href)}`,
            this.apiUrl
        );
        await this.fetchJSON(url, 'POST');
        return true;
    }

    /**
     * Follows an account.
     * @param username The username of the account to follow.
     * @returns The followed account.
     */
    async follow(username: string): Promise<Actor> {
        const url = new URL(`.ghost/activitypub/v1/actions/follow/${username}`, this.apiUrl);
        const json = await this.fetchJSON(url, 'POST');
        return json as Actor;
    }

    /**
     * Unfollows an account.
     * @param username The username of the account to unfollow.
     * @returns The unfollowed account.
     */
    async unfollow(username: string): Promise<Actor> {
        const url = new URL(`.ghost/activitypub/v1/actions/unfollow/${username}`, this.apiUrl);
        const json = await this.fetchJSON(url, 'POST');
        return json as Actor;
    }

    /**
     * Likes a post.
     * @param id The ID of the post to like.
     * @returns Void.
     */
    async like(id: string): Promise<void> {
        const url = new URL(`.ghost/activitypub/v1/actions/like/${encodeURIComponent(id)}`, this.apiUrl);
        await this.fetchJSON(url, 'POST');
    }

    /**
     * Unlikes a post.
     * @param id The ID of the post to unlike.
     * @returns Void.
     */
    async unlike(id: string): Promise<void> {
        const url = new URL(`.ghost/activitypub/v1/actions/unlike/${encodeURIComponent(id)}`, this.apiUrl);
        await this.fetchJSON(url, 'POST');
    }

    /**
     * Reposts a post.
     * @param id The ID of the post to repost.
     * @returns Void.
     */
    async repost(id: string): Promise<void> {
        const url = new URL(`.ghost/activitypub/v1/actions/repost/${encodeURIComponent(id)}`, this.apiUrl);
        await this.fetchJSON(url, 'POST');
    }

    /**
     * Dereposts a post.
     * @param id The ID of the post to derepost.
     * @returns Void.
     */
    async derepost(id: string): Promise<void> {
        const url = new URL(`.ghost/activitypub/v1/actions/derepost/${encodeURIComponent(id)}`, this.apiUrl);
        await this.fetchJSON(url, 'POST');
    }

    /**
     * Replies to a post.
     * @param id The ID of the post to reply to.
     * @param content The content of the reply.
     * @param image The image to attach to the reply.
     * @returns The reply.
     */
    async reply(id: string, content: string, image?: {url: string, altText?: string}): Promise<Activity> {
        const url = new URL(`.ghost/activitypub/v1/actions/reply/${encodeURIComponent(id)}`, this.apiUrl);
        const body: {content: string, image?: {url: string, altText?: string}} = {content};
        if (image) {
            body.image = image;
        }
        const response = await this.fetchJSON(url, 'POST', body);
        return response;
    }

    /**
     * Creates a new note.
     * @param content The content of the note.
     * @param image The image to attach to the note.
     * @returns The created note.
     */
    async note(content: string, image?: {url: string, altText?: string}): Promise<Post> {
        const url = new URL('.ghost/activitypub/v1/actions/note', this.apiUrl);
        const body: {content: string, image?: {url: string, altText?: string}} = {content};
        if (image) {
            body.image = image;
        }
        const response = await this.fetchJSON(url, 'POST', body);
        return (response as {post: Post}).post;
    }

    /**
     * Deletes a post.
     * @param id The ID of the post to delete.
     * @returns Void.
     */
    async delete(id: string): Promise<void> {
        const url = new URL(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`, this.apiUrl);
        await this.fetchJSON(url, 'DELETE');
    }

    /**
     * Gets the user's API URL.
     * @returns The user's API URL.
     */
    get userApiUrl(): URL {
        return new URL(`.ghost/activitypub/users/${this.handle}`, this.apiUrl);
    }

    /**
     * Gets the user's data.
     * @returns The user's data.
     */
    async getUser(): Promise<ActorProperties> {
        const json = await this.fetchJSON(this.userApiUrl);
        return json as ActorProperties;
    }

    /**
     * Gets the search API URL.
     * @returns The search API URL.
     */
    get searchApiUrl(): URL {
        return new URL('.ghost/activitypub/v1/actions/search', this.apiUrl);
    }

    /**
     * Searches for accounts.
     * @param query The search query.
     * @returns The search results.
     */
    async search(query: string): Promise<SearchResults> {
        const url = this.searchApiUrl;

        url.searchParams.set('query', query);

        const json = await this.fetchJSON(url, 'GET');

        if (json && 'accounts' in json) {
            return json as SearchResults;
        }

        return {
            accounts: []
        };
    }

    /**
     * Gets a thread.
     * @param id The ID of the thread.
     * @returns The thread.
     */
    async getThread(id: string): Promise<Thread> {
        const url = new URL(`.ghost/activitypub/v1/thread/${encodeURIComponent(id)}`, this.apiUrl);
        const json = await this.fetchJSON(url);
        return json as Thread;
    }

    /**
     * Gets an account.
     * @param handle The handle of the account.
     * @returns The account.
     */
    async getAccount(handle: string): Promise<GetAccountResponse> {
        const url = new URL(`.ghost/activitypub/v1/account/${handle}`, this.apiUrl);
        const json = await this.fetchJSON(url);

        return json as GetAccountResponse;
    }

    /**
     * Gets an account's follows.
     * @param handle The handle of the account.
     * @param type The type of follows to get.
     * @param next The next page token.
     * @returns The account's follows.
     */
    async getAccountFollows(handle: string, type: AccountFollowsType, next?: string): Promise<GetAccountFollowsResponse> {
        const url = new URL(`.ghost/activitypub/v1/account/${handle}/follows/${type}`, this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);

        if (json === null) {
            return {
                accounts: [],
                next: null
            };
        }

        if (!('accounts' in json)) {
            return {
                accounts: [],
                next: null
            };
        }

        const accounts = Array.isArray(json.accounts) ? json.accounts : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return {
            accounts,
            next: nextPage
        };
    }

    /**
     * Gets the feed.
     * @param next The next page token.
     * @returns The feed.
     */
    async getFeed(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts('.ghost/activitypub/v1/feed/notes', next);
    }

    /**
     * Gets the inbox.
     * @param next The next page token.
     * @returns The inbox.
     */
    async getInbox(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts('.ghost/activitypub/v1/feed/reader', next);
    }

    /**
     * Gets the discovery feed.
     * @param topic The topic to get the feed for.
     * @param next The next page token.
     * @returns The discovery feed.
     */
    async getDiscoveryFeed(topic: string, next?: string): Promise<PaginatedPostsResponse> {
        const endpoint = `.ghost/activitypub/v1/feed/discover/${topic}`;
        return this.getPaginatedPosts(endpoint, next);
    }

    /**
     * Gets the explore accounts.
     * @param topic The topic to get the accounts for.
     * @param next The next page token.
     * @returns The explore accounts.
     */
    async getExploreAccounts(topic: string, next?: string): Promise<PaginatedExploreAccountsResponse> {
        const endpoint = `.ghost/activitypub/v1/explore/${topic}`;
        return this.getPaginatedExploreAccounts(endpoint, next);
    }

    /**
     * Gets the topics.
     * @returns The topics.
     */
    async getTopics(): Promise<GetTopicsResponse> {
        const url = new URL('.ghost/activitypub/v1/topics', this.apiUrl);
        const json = await this.fetchJSON(url);
        return {
            topics: (json && 'topics' in json && Array.isArray(json.topics)) ? json.topics : []
        };
    }

    /**
     * Gets the recommendations.
     * @param limit The limit of recommendations to get.
     * @returns The recommendations.
     */
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

    /**
     * Gets the posts by account.
     * @param handle The handle of the account.
     * @param next The next page token.
     * @returns The posts.
     */
    async getPostsByAccount(handle: string, next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts(`.ghost/activitypub/v1/posts/${handle}`, next);
    }

    /**
     * Gets the posts liked by account.
     * @param next The next page token.
     * @returns The posts.
     */
    async getPostsLikedByAccount(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts(`.ghost/activitypub/v1/posts/me/liked`, next);
    }

    /**
     * Gets the paginated posts.
     * @param endpoint The endpoint to get the posts from.
     * @param next The next page token.
     * @returns The paginated posts.
     */
    private async getPaginatedPosts(endpoint: string, next?: string): Promise<PaginatedPostsResponse> {
        const url = new URL(endpoint, this.apiUrl);

        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);

        if (json === null || !('posts' in json)) {
            return {
                posts: [],
                next: null
            };
        }

        const posts = Array.isArray(json.posts) ? json.posts : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return {
            posts,
            next: nextPage
        };
    }

    /**
     * Gets the notifications.
     * @param next The next page token.
     * @returns The notifications.
     */
    async getNotifications(next?: string): Promise<GetNotificationsResponse> {
        const url = new URL('.ghost/activitypub/v1/notifications', this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);

        if (json === null) {
            return {
                notifications: [],
                next: null
            };
        }

        if (!('notifications' in json)) {
            return {
                notifications: [],
                next: null
            };
        }

        const notifications = Array.isArray(json.notifications) ? json.notifications : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return {
            notifications,
            next: nextPage
        };
    }

    /**
     * Gets the notifications count.
     * @returns The notifications count.
     */
    async getNotificationsCount(): Promise<GetNotificationsCountResponse> {
        const url = new URL('.ghost/activitypub/v1/notifications/unread/count', this.apiUrl);

        const json = await this.fetchJSON(url);

        if (json === null) {
            return {
                count: 0
            };
        }

        const count = typeof (json as Record<string, unknown>).count === 'number'
            ? (json as {count: number}).count
            : 0;

        return {count};
    }

    /**
     * Resets the notifications count.
     * @returns True if the count was reset successfully.
     */
    async resetNotificationsCount() {
        const url = new URL('.ghost/activitypub/v1/notifications/unread/reset', this.apiUrl);

        await this.fetchJSON(url, 'PUT');

        return true;
    }

    /**
     * Gets the blocked accounts.
     * @param next The next page token.
     * @returns The blocked accounts.
     */
    async getBlockedAccounts(next?: string): Promise<GetBlockedAccountsResponse> {
        const url = new URL('.ghost/activitypub/v1/blocks/accounts', this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);

        if (json === null) {
            return {
                accounts: [],
                next: null
            };
        }

        const accounts = ('blocked_accounts' in json && Array.isArray(json.blocked_accounts))
            ? json.blocked_accounts as Account[]
            : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return {
            accounts,
            next: nextPage
        };
    }

    /**
     * Gets the blocked domains.
     * @param next The next page token.
     * @returns The blocked domains.
     */
    async getBlockedDomains(next?: string): Promise<GetBlockedDomainsResponse> {
        const url = new URL('.ghost/activitypub/v1/blocks/domains', this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);

        if (json === null) {
            return {
                domains: [],
                next: null
            };
        }

        const domains = ('blocked_domains' in json && Array.isArray(json.blocked_domains))
            ? json.blocked_domains as Account[]
            : [];

        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return {
            domains,
            next: nextPage
        };
    }

    /**
     * Gets the paginated explore accounts.
     * @param endpoint The endpoint to get the accounts from.
     * @param next The next page token.
     * @returns The paginated explore accounts.
     */
    private async getPaginatedExploreAccounts(endpoint: string, next?: string): Promise<PaginatedExploreAccountsResponse> {
        const url = new URL(endpoint, this.apiUrl);

        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);

        if (json === null || !('accounts' in json)) {
            return {
                accounts: [],
                next: null
            };
        }

        const accounts = Array.isArray(json.accounts) ? json.accounts : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return {
            accounts,
            next: nextPage
        };
    }

    /**
     * Gets a post.
     * @param id The ID of the post.
     * @returns The post.
     */
    async getPost(id: string): Promise<Post> {
        const url = new URL(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`, this.apiUrl);
        const json = await this.fetchJSON(url);
        return json as Post;
    }

    /**
     * Gets the replies to a post.
     * @param postApId The ID of the post.
     * @param next The next page token.
     * @returns The replies.
     */
    async getReplies(postApId: string, next?: string): Promise<ReplyChainResponse> {
        const url = new URL(`.ghost/activitypub/v1/replies/${encodeURIComponent(postApId)}`, this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }
        const json = await this.fetchJSON(url);
        return json as ReplyChainResponse;
    }

    /**
     * Updates an account.
     * @param data The data to update the account with.
     * @returns Void.
     */
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

    /**
     * Uploads an image.
     * @param file The file to upload.
     * @returns The URL of the uploaded image.
     */
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

    /**
     * Enables Bluesky.
     * @returns Void.
     */
    async enableBluesky() {
        const url = new URL('.ghost/activitypub/v2/actions/bluesky/enable', this.apiUrl);

        await this.fetchJSON(url, 'POST');
    }

    /**
     * Disables Bluesky.
     * @returns Void.
     */
    async disableBluesky() {
        const url = new URL('.ghost/activitypub/v2/actions/bluesky/disable', this.apiUrl);

        await this.fetchJSON(url, 'POST');
    }

    /**
     * Confirms the Bluesky handle.
     * @returns The confirmed handle.
     */
    async confirmBlueskyHandle(): Promise<string> {
        const url = new URL('.ghost/activitypub/v2/actions/bluesky/confirm-handle', this.apiUrl);

        const json = await this.fetchJSON(url, 'POST');

        if (json === null || !('handle' in json) || typeof json.handle !== 'string') {
            return '';
        }

        return String(json.handle);
    }
}
```