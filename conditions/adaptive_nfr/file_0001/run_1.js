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

/** Validates if response has expected status codes that return no content */
const isNoContentStatus = (status: number): boolean => {
    return status === 204 || status === 202;
};

/** Extracts error message from response JSON */
const extractErrorMessage = (json: unknown): string | null => {
    if (typeof json !== 'object' || json === null) {
        return null;
    }
    const record = json as Record<string, unknown>;
    return typeof record.message === 'string' ? record.message : 
           typeof record.error === 'string' ? record.error : null;
};

/** Extracts error code from response JSON */
const extractErrorCode = (json: unknown): string | undefined => {
    if (typeof json !== 'object' || json === null) {
        return undefined;
    }
    const record = json as Record<string, unknown>;
    return typeof record.code === 'string' ? record.code : undefined;
};

/** Validates if JSON response contains expected property */
const hasProperty = (json: unknown, property: string): boolean => {
    return typeof json === 'object' && json !== null && property in json;
};

/** Safely extracts array from JSON response */
const extractArray = (json: unknown, property: string): unknown[] => {
    if (!hasProperty(json, property)) {
        return [];
    }
    const record = json as Record<string, unknown>;
    return Array.isArray(record[property]) ? record[property] as unknown[] : [];
};

/** Safely extracts next page token from JSON response */
const extractNextPage = (json: unknown): string | null => {
    if (!hasProperty(json, 'next')) {
        return null;
    }
    const record = json as Record<string, unknown>;
    return typeof record.next === 'string' ? record.next : null;
};

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
            return json?.identities?.[0]?.token || null;
        } catch {
            // TODO: Ping sentry?
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

        if (isNoContentStatus(response.status)) {
            return null;
        }

        if (!response.ok) {
            const error: ApiError = {
                message: 'Something went wrong, please try again.',
                statusCode: response.status
            };

            try {
                const json = await response.json();
                const errorMessage = extractErrorMessage(json);

                if (errorMessage) {
                    error.message = errorMessage;
                }

                const errorCode = extractErrorCode(json);
                if (errorCode) {
                    error.code = errorCode;
                }
            } catch {
                // Leave the default message
            }

            throw error;
        }

        return await response.json();
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

        if (hasProperty(json, 'accounts')) {
            return json as SearchResults;
        }

        return {
            accounts: []
        };
    }

    async getThread(id: string): Promise<Thread> {
        const url = new URL(`.ghost/activitypub/v1/thread/${encodeURIComponent(id)}`, this.apiUrl);
        const json = await this.fetchJSON(url);
        return json as Thread;
    }

    async getAccount(handle: string): Promise<GetAccountResponse> {
        const url = new URL(`.ghost/activitypub/v1/account/${handle}`, this.apiUrl);