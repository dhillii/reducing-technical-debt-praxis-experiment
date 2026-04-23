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
 * Handles fetching JSON data from a given URL.
 * @param url The URL to fetch data from.
 * @param method The HTTP method to use (default: 'GET').
 * @param body The request body (optional).
 * @returns The fetched JSON data or null if the response is empty.
 */
async function fetchJsonData(url: URL, method: 'DELETE' | 'GET' | 'POST' | 'PUT' = 'GET', body?: object): Promise<object | null> {
    const response = await fetch(url, {
        method,
        headers: {
            Accept: 'application/activity+json'
        },
        body: body ? JSON.stringify(body) : undefined
    });

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
 * Handles authentication and token retrieval.
 * @returns The authentication token or null if it cannot be retrieved.
 */
async function getAuthToken(): Promise<string | null> {
    try {
        const response = await fetch(new URL('.ghost/activitypub/v1/auth/token', 'https://example.com'));
        const json = await response.json();
        return json.token || null;
    } catch {
        // TODO: Ping sentry?
        return null;
    }
}

/**
 * Handles fetching data with authentication.
 * @param url The URL to fetch data from.
 * @param method The HTTP method to use (default: 'GET').
 * @param body The request body (optional).
 * @returns The fetched JSON data or null if the response is empty.
 */
async function fetchAuthenticatedData(url: URL, method: 'DELETE' | 'GET' | 'POST' | 'PUT' = 'GET', body?: object): Promise<object | null> {
    const token = await getAuthToken();
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/activity+json'
    };

    if (body) {
        headers['Content-Type'] = 'application/json';
    }

    return fetchJsonData(url, method, body);
}

export class ActivityPubAPI {
    private readonly apiUrl: URL;
    private readonly authApiUrl: URL;
    private readonly handle: string;
    private readonly fetch: (resource: URL, init?: RequestInit) => Promise<Response>;

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
     * Blocks a domain.
     * @param domain The domain to block.
     * @returns A promise that resolves to true if the operation is successful.
     */
    async blockDomain(domain: URL): Promise<boolean> {
        const url = new URL(
            `.ghost/activitypub/v1/actions/block/domain/${encodeURIComponent(domain.href)}`,
            this.apiUrl
        );
        await fetchAuthenticatedData(url, 'POST');
        return true;
    }

    /**
     * Unblocks a domain.
     * @param domain The domain to unblock.
     * @returns A promise that resolves to true if the operation is successful.
     */
    async unblockDomain(domain: URL): Promise<boolean> {
        const url = new URL(
            `.ghost/activitypub/v1/actions/unblock/domain/${encodeURIComponent(domain.href)}`,
            this.apiUrl
        );
        await fetchAuthenticatedData(url, 'POST');
        return true;
    }

    /**
     * Blocks an account.
     * @param id The ID of the account to block.
     * @returns A promise that resolves to true if the operation is successful.
     */
    async block(id: URL): Promise<boolean> {
        const url = new URL(
            `.ghost/activitypub/v1/actions/block/${encodeURIComponent(id.href)}`,
            this.apiUrl
        );
        await fetchAuthenticatedData(url, 'POST');
        return true;
    }

    /**
     * Unblocks an account.
     * @param id The ID of the account to unblock.
     * @returns A promise that resolves to true if the operation is successful.
     */
    async unblock(id: URL): Promise<boolean> {
        const url = new URL(
            `.ghost/activitypub/v1/actions/unblock/${encodeURIComponent(id.href)}`,
            this.apiUrl
        );
        await fetchAuthenticatedData(url, 'POST');
        return true;
    }

    /**
     * Follows an account.
     * @param username The username of the account to follow.
     * @returns A promise that resolves to the followed actor.
     */
    async follow(username: string): Promise<Actor> {
        const url = new URL(`.ghost/activitypub/v1/actions/follow/${username}`, this.apiUrl);
        const json = await fetchAuthenticatedData(url, 'POST');
        return json as Actor;
    }

    /**
     * Unfollows an account.
     * @param username The username of the account to unfollow.
     * @returns A promise that resolves to the unfollowed actor.
     */
    async unfollow(username: string): Promise<Actor> {
        const url = new URL(`.ghost/activitypub/v1/actions/unfollow/${username}`, this.apiUrl);
        const json = await fetchAuthenticatedData(url, 'POST');
        return json as Actor;
    }

    /**
     * Likes a post.
     * @param id The ID of the post to like.
     * @returns A promise that resolves when the operation is complete.
     */
    async like(id: string): Promise<void> {
        const url = new URL(`.ghost/activitypub/v1/actions/like/${encodeURIComponent(id)}`, this.apiUrl);
        await fetchAuthenticatedData(url, 'POST');
    }

    /**
     * Unlikes a post.
     * @param id The ID of the post to unlike.
     * @returns A promise that resolves when the operation is complete.
     */
    async unlike(id: string): Promise<void> {
        const url = new URL(`.ghost/activitypub/v1/actions/unlike/${encodeURIComponent(id)}`, this.apiUrl);
        await fetchAuthenticatedData(url, 'POST');
    }

    /**
     * Reposts a post.
     * @param id The ID of the post to repost.
     * @returns A promise that resolves when the operation is complete.
     */
    async repost(id: string): Promise<void> {
        const url = new URL(`.ghost/activitypub/v1/actions/repost/${encodeURIComponent(id)}`, this.apiUrl);
        await fetchAuthenticatedData(url, 'POST');
    }

    /**
     * Dereposts a post.
     * @param id The ID of the post to derepost.
     * @returns A promise that resolves when the operation is complete.
     */
    async derepost(id: string): Promise<void> {
        const url = new URL(`.ghost/activitypub/v1/actions/derepost/${encodeURIComponent(id)}`, this.apiUrl);
        await fetchAuthenticatedData(url, 'POST');
    }

    /**
     * Replies to a post.
     * @param id The ID of the post to reply to.
     * @param content The content of the reply.
     * @param image The image to attach to the reply (optional).
     * @returns A promise that resolves to the created activity.
     */
    async reply(id: string, content: string, image?: {url: string, altText?: string}): Promise<Activity> {
        const url = new URL(`.ghost/activitypub/v1/actions/reply/${encodeURIComponent(id)}`, this.apiUrl);
        const body: {content: string, image?: {url: string, altText?: string}} = {content};
        if (image) {
            body.image = image;
        }
        const response = await fetchAuthenticatedData(url, 'POST', body);
        return response;
    }

    /**
     * Creates a new note.
     * @param content The content of the note.
     * @param image The image to attach to the note (optional).
     * @returns A promise that resolves to the created post.
     */
    async note(content: string, image?: {url: string, altText?: string}): Promise<Post> {
        const url = new URL('.ghost/activitypub/v1/actions/note', this.apiUrl);
        const body: {content: string, image?: {url: string, altText?: string}} = {content};
        if (image) {
            body.image = image;
        }
        const response = await fetchAuthenticatedData(url, 'POST', body);
        return (response as {post: Post}).post;
    }

    /**
     * Deletes a post.
     * @param id The ID of the post to delete.
     * @returns A promise that resolves when the operation is complete.
     */
    async delete(id: string): Promise<void> {
        const url = new URL(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`, this.apiUrl);
        await fetchAuthenticatedData(url, 'DELETE');
    }

    /**
     * Gets the user's profile.
     * @returns A promise that resolves to the user's profile.
     */
    async getUser(): Promise<ActorProperties> {
        const url = new URL(`.ghost/activitypub/users/${this.handle}`, this.apiUrl);
        const json = await fetchAuthenticatedData(url);
        return json as ActorProperties;
    }

    /**
     * Searches for accounts.
     * @param query The search query.
     * @returns A promise that resolves to the search results.
     */
    async search(query: string): Promise<SearchResults> {
        const url = new URL('.ghost/activitypub/v1/actions/search', this.apiUrl);
        url.searchParams.set('query', query);
        const json = await fetchAuthenticatedData(url, 'GET');
        return json as SearchResults;
    }

    /**
     * Gets a thread.
     * @param id The ID of the thread to get.
     * @returns A promise that resolves to the thread.
     */
    async getThread(id: string): Promise<Thread> {
        const url = new URL(`.ghost/activitypub/v1/thread/${encodeURIComponent(id)}`, this.apiUrl);
        const json = await fetchAuthenticatedData(url);
        return json as Thread;
    }

    /**
     * Gets an account.
     * @param handle The handle of the account to get.
     * @returns A promise that resolves to the account.
     */
    async getAccount(handle: string): Promise<GetAccountResponse> {
        const url = new URL(`.ghost/activitypub/v1/account/${handle}`, this.apiUrl);
        const json = await fetchAuthenticatedData(url);
        return json as GetAccountResponse;
    }

    /**
     * Gets an account's follows.
     * @param handle The handle of the account to get follows for.
     * @param type The type of follows to get (following or followers).
     * @param next The next page token (optional).
     * @returns A promise that resolves to the account's follows.
     */
    async getAccountFollows(handle: string, type: AccountFollowsType, next?: string): Promise<GetAccountFollowsResponse> {
        const url = new URL(`.ghost/activitypub/v1/account/${handle}/follows/${type}`, this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }
        const json = await fetchAuthenticatedData(url);
        return json as GetAccountFollowsResponse;
    }

    /**
     * Gets the feed.
     * @param next The next page token (optional).
     * @returns A promise that resolves to the feed.
     */
    async getFeed(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts('.ghost/activitypub/v1/feed/notes', next);
    }

    /**
     * Gets the inbox.
     * @param next The next page token (optional).
     * @returns A promise that resolves to the inbox.
     */
    async getInbox(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts('.ghost/activitypub/v1/feed/reader', next);
    }

    /**
     * Gets the discovery feed.
     * @param topic The topic to get the discovery feed for.
     * @param next The next page token (optional).
     * @returns A promise that resolves to the discovery feed.
     */
    async getDiscoveryFeed(topic: string, next?: string): Promise<PaginatedPostsResponse> {
        const endpoint = `.ghost/activitypub/v1/feed/discover/${topic}`;
        return this.getPaginatedPosts(endpoint, next);
    }

    /**
     * Gets the explore accounts.
     * @param topic The topic to get the explore accounts for.
     * @param next The next page token (optional).
     * @returns A promise that resolves to the explore accounts.
     */
    async getExploreAccounts(topic: string, next?: string): Promise<PaginatedExploreAccountsResponse> {
        const endpoint = `.ghost/activitypub/v1/explore/${topic}`;
        return this.getPaginatedExploreAccounts(endpoint, next);
    }

    /**
     * Gets the topics.
     * @returns A promise that resolves to the topics.
     */
    async getTopics(): Promise<GetTopicsResponse> {
        const url = new URL('.ghost/activitypub/v1/topics', this.apiUrl);
        const json = await fetchAuthenticatedData(url);
        return {
            topics: (json && 'topics' in json && Array.isArray(json.topics)) ? json.topics : []
        };
    }

    /**
     * Gets the recommendations.
     * @param limit The limit of recommendations to get (optional).
     * @returns A promise that resolves to the recommendations.
     */
    async getRecommendations(limit?: number): Promise<GetRecommendationsResponse> {
        const url = new URL('.ghost/activitypub/v1/recommendations', this.apiUrl);
        if (limit) {
            url.searchParams.set('limit', limit.toString());
        }
        const json = await fetchAuthenticatedData(url);
        return {
            accounts: (json && 'accounts' in json && Array.isArray(json.accounts)) ? json.accounts : []
        };
    }

    /**
     * Gets the posts by account.
     * @param handle The handle of the account to get posts for.
     * @param next The next page token (optional).
     * @returns A promise that resolves to the posts.
     */
    async getPostsByAccount(handle: string, next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts(`.ghost/activitypub/v1/posts/${handle}`, next);
    }

    /**
     * Gets the posts liked by account.
     * @param next The next page token (optional).
     * @returns A promise that resolves to the posts.
     */
    async getPostsLikedByAccount(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts(`.ghost/activitypub/v1/posts/me/liked`, next);
    }

    /**
     * Gets the paginated posts.
     * @param endpoint The endpoint to get posts from.
     * @param next The next page token (optional).
     * @returns A promise that resolves to the paginated posts.
     */
    private async getPaginatedPosts(endpoint: string, next?: string): Promise<PaginatedPostsResponse> {
        const url = new URL(endpoint, this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }
        const json = await fetchAuthenticatedData(url);
        return {
            posts: (json && 'posts' in json && Array.isArray(json.posts)) ? json.posts : [],
            next: (json && 'next' in json && typeof json.next === 'string') ? json.next : null
        };
    }

    /**
     * Gets the notifications.
     * @param next The next page token (optional).
     * @returns A promise that resolves to the notifications.
     */
    async getNotifications(next?: string): Promise<GetNotificationsResponse> {
        const url = new URL('.ghost/activitypub/v1/notifications', this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }
        const json = await fetchAuthenticatedData(url);
        return {
            notifications: (json && 'notifications' in json && Array.isArray(json.notifications)) ? json.notifications : [],
            next: (json && 'next' in json && typeof json.next === 'string') ? json.next : null
        };
    }

    /**
     * Gets the notifications count.
     * @returns A promise that resolves to the notifications count.
     */
    async getNotificationsCount(): Promise<GetNotificationsCountResponse> {
        const url = new URL('.ghost/activitypub/v1/notifications/unread/count', this.apiUrl);
        const json = await fetchAuthenticatedData(url);
        return {
            count: (json && 'count' in json && typeof json.count === 'number') ? json.count : 0
        };
    }

    /**
     * Resets the notifications count.
     * @returns A promise that resolves to true if the operation is successful.
     */
    async resetNotificationsCount(): Promise<boolean> {
        const url = new URL('.ghost/activitypub/v1/notifications/unread/reset', this.apiUrl);
        await fetchAuthenticatedData(url, 'PUT');
        return true;
    }

    /**
     * Gets the blocked accounts.
     * @param next The next page token (optional).
     * @returns A promise that resolves to the blocked accounts.
     */
    async getBlockedAccounts(next?: string): Promise<GetBlockedAccountsResponse> {
        const url = new URL('.ghost/activitypub/v1/blocks/accounts', this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }
        const json = await fetchAuthenticatedData(url);
        return {
            accounts: (json && 'blocked_accounts' in json && Array.isArray(json.blocked_accounts)) ? json.blocked_accounts : [],
            next: (json && 'next' in json && typeof json.next === 'string') ? json.next : null
        };
    }

    /**
     * Gets the blocked domains.
     * @param next The next page token (optional).
     * @returns A promise that resolves to the blocked domains.
     */
    async getBlockedDomains(next?: string): Promise<GetBlockedDomainsResponse> {
        const url = new URL('.ghost/activitypub/v1/blocks/domains', this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }
        const json = await fetchAuthenticatedData(url);
        return {
            domains: (json && 'blocked_domains' in json && Array.isArray(json.blocked_domains)) ? json.blocked_domains : [],
            next: (json && 'next' in json && typeof json.next === 'string') ? json.next : null
        };
    }

    /**
     * Gets the paginated explore accounts.
     * @param endpoint The endpoint to get accounts from.
     * @param next The next page token (optional).
     * @returns A promise that resolves to the paginated explore accounts.
     */
    private async getPaginatedExploreAccounts(endpoint: string, next?: string): Promise<PaginatedExploreAccountsResponse> {
        const url = new URL(endpoint, this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }
        const json = await fetchAuthenticatedData(url);
        return {
            accounts: (json && 'accounts' in json && Array.isArray(json.accounts)) ? json.accounts : [],
            next: (json && 'next' in json && typeof json.next === 'string') ? json.next : null
        };
    }

    /**
     * Gets a post.
     * @param id The ID of the post to get.
     * @returns A promise that resolves to the post.
     */
    async getPost(id: string): Promise<Post> {
        const url = new URL(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`, this.apiUrl);
        const json = await fetchAuthenticatedData(url);
        return json as Post;
    }

    /**
     * Gets the replies to a post.
     * @param postApId The ID of the post to get replies for.
     * @param next The next page token (optional).
     * @returns A promise that resolves to the replies.
     */
    async getReplies(postApId: string, next?: string): Promise<ReplyChainResponse> {
        const url = new URL(`.ghost/activitypub/v1/replies/${encodeURIComponent(postApId)}`, this.apiUrl);
        if (next) {
            url.searchParams.set('next', next);
        }
        const json = await fetchAuthenticatedData(url);
        return json as ReplyChainResponse;
    }

    /**
     * Updates an account.
     * @param data The data to update the account with.
     * @returns A promise that resolves when the operation is complete.
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
        await fetchAuthenticatedData(url, 'PUT', {
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
     * @returns A promise that resolves to the URL of the uploaded image.
     */
    async upload(file: File): Promise<string> {
        const url = new URL('.ghost/activitypub/v1/upload/image', this.apiUrl);
        const formData = new FormData();
        formData.append('file', file);

        const token = await getAuthToken();
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
     * @returns A promise that resolves when the operation is complete.
     */
    async enableBluesky() {
        const url = new URL('.ghost/activitypub/v2/actions/bluesky/enable', this.apiUrl);
        await fetchAuthenticatedData(url, 'POST');
    }

    /**
     * Disables Bluesky.
     * @returns A promise that resolves when the operation is complete.
     */
    async disableBluesky() {
        const url = new URL('.ghost/activitypub/v2/actions/bluesky/disable', this.apiUrl);
        await fetchAuthenticatedData(url, 'POST');
    }

    /**
     * Confirms a Bluesky handle.
     * @returns A promise that resolves to the confirmed handle.
     */
    async confirmBlueskyHandle(): Promise<string> {
        const url = new URL('.ghost/activitypub/v2/actions/bluesky/confirm-handle', this.apiUrl);
        const json = await fetchAuthenticatedData(url, 'POST');
        return String(json.handle);
    }
}