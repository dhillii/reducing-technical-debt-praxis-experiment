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

export type GetAccountResponse = Account;

export type FollowAccount = Pick<Account, 'id' | 'name' | 'handle' | 'avatarUrl' | 'blockedByMe' | 'domainBlockedByMe'> & {isFollowing: true};

export interface GetAccountFollowsResponse {
    accounts: FollowAccount[];
    next: string | null;
}

export interface NotificationActor {
    id: string;
    name: string;
    url: string;
    handle: string;
    avatarUrl: string | null;
    followedByMe?: boolean;
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
    attachments?: {
        type: string;
        mediaType: string;
        name: string;
        url: string;
    }[];
}

export interface NotificationReference {
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
    inReplyTo: NotificationReference | null;
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

export interface PostAttachment {
    type: string;
    mediaType: string;
    name: string;
    url: string;
}

export interface PostAuthor extends Pick<Account, 'id' | 'handle' | 'avatarUrl' | 'name' | 'url' | 'followedByMe'> {}

export interface PostMetadata {
    ghostAuthors?: Array<{
        name: string;
        profile_image: string;
    }>;
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
    attachments: PostAttachment[];
    author: PostAuthor;
    authoredByMe: boolean;
    repostCount: number;
    repostedByMe: boolean;
    repostedBy: PostAuthor | null;
    metadata?: PostMetadata;
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

interface ImageData {
    url: string;
    altText?: string;
}

interface PaginatedResponse {
    next: string | null;
}

class ActivityPubAPI {
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
            return json?.identities?.[0]?.token || null;
        } catch {
            return null;
        }
    }

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
            throw this.parseErrorResponse(response);
        }

        return await response.json();
    }

    private async parseErrorResponse(response: Response): Promise<never> {
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
            // Use default message
        }

        throw error;
    }

    private buildUrl(endpoint: string, params?: Record<string, string>): URL {
        const url = new URL(endpoint, this.apiUrl);
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                url.searchParams.set(key, value);
            });
        }
        return url;
    }

    private async performAction(endpoint: string, method: 'POST' | 'PUT' | 'DELETE' = 'POST'): Promise<void> {
        const url = this.buildUrl(endpoint);
        await this.fetchJSON(url, method);
    }

    private async performActionWithResult<T>(endpoint: string, method: 'POST' | 'PUT' = 'POST'): Promise<T> {
        const url = this.buildUrl(endpoint);
        const json = await this.fetchJSON(url, method);
        return json as T;
    }

    private extractNextPage(json: unknown): string | null {
        return (json && typeof json === 'object' && 'next' in json && typeof (json as Record<string, unknown>).next === 'string')
            ? (json as {next: string}).next
            : null;
    }

    private extractArrayField<T>(json: unknown, field: string): T[] {
        if (!json || typeof json !== 'object' || !(field in json)) {
            return [];
        }
        const value = (json as Record<string, unknown>)[field];
        return Array.isArray(value) ? value as T[] : [];
    }

    async blockDomain(domain: URL): Promise<boolean> {
        await this.performAction(`.ghost/activitypub/v1/actions/block/domain/${encodeURIComponent(domain.href)}`);
        return true;
    }

    async unblockDomain(domain: URL): Promise<boolean> {
        await this.performAction(`.ghost/activitypub/v1/actions/unblock/domain/${encodeURIComponent(domain.href)}`);
        return true;
    }

    async block(id: URL): Promise<boolean> {
        await this.performAction(`.ghost/activitypub/v1/actions/block/${encodeURIComponent(id.href)}`);
        return true;
    }

    async unblock(id: URL): Promise<boolean> {
        await this.performAction(`.ghost/activitypub/v1/actions/unblock/${encodeURIComponent(id.href)}`);
        return true;
    }

    async follow(username: string): Promise<Actor> {
        return this.performActionWithResult(`.ghost/activitypub/v1/actions/follow/${username}`);
    }

    async unfollow(username: string): Promise<Actor> {
        return this.performActionWithResult(`.ghost/activitypub/v1/actions/unfollow/${username}`);
    }

    async like(id: string): Promise<void> {
        await this.performAction(`.ghost/activitypub/v1/actions/like/${encodeURIComponent(id)}`);
    }

    async unlike(id: string): Promise<void> {
        await this.performAction(`.ghost/activitypub/v1/actions/unlike/${encodeURIComponent(id)}`);
    }

    async repost(id: string): Promise<void> {
        await this.performAction(`.ghost/activitypub/v1/actions/repost/${encodeURIComponent(id)}`);
    }

    async derepost(id: string): Promise<void> {
        await this.performAction(`.ghost/activitypub/v1/actions/derepost/${encodeURIComponent(id)}`);
    }

    async reply(id: string, content: string, image?: ImageData): Promise<Activity> {
        const url = this.buildUrl(`.ghost/activitypub/v1/actions/reply/${encodeURIComponent(id)}`);
        const body: {content: string, image?: ImageData} = {content};
        if (image) {
            body.image = image;
        }
        return this.fetchJSON(url, 'POST', body) as Promise<Activity>;
    }

    async note(content: string, image?: ImageData): Promise<Post> {
        const url = this.buildUrl('.ghost/activitypub/v1/actions/note');
        const body: {content: string, image?: ImageData} = {content};
        if (image) {
            body.image = image;
        }
        const response = await this.fetchJSON(url, 'POST', body);
        return (response as {post: Post}).post;
    }

    async delete(id: string): Promise<void> {
        await this.performAction(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`, 'DELETE');
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

        return {
            accounts: this.extractArrayField<AccountSearchResult>(json, 'accounts')
        };
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

        return {
            accounts: this.extractArrayField<FollowAccount>(json, 'accounts'),
            next: this.extractNextPage(json)
        };
    }

    async getFeed(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts('.ghost/activitypub/v1/feed/notes', next);
    }

    async getInbox(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts('.ghost/activitypub/v1/feed/reader', next);
    }

    async getDiscoveryFeed(topic: string, next?: string): Promise<PaginatedPostsResponse> {
        return this.getP