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
            const error = this.createApiError(response);
            throw error;
        }

        return await response.json();
    }

    private createApiError(response: Response): ApiError {
        const error: ApiError = {
            message: 'Something went wrong, please try again.',
            statusCode: response.status
        };

        try {
            const json = response.json();
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

    private async handlePaginatedResponse<T>(
        json: unknown,
        key: string,
        nextKey: string
    ): Promise<{ items: T[]; next: string | null }> {
        if (json === null || !('items' in json)) {
            return { items: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { items, next: nextPage };
    }

    private async handlePaginatedPostsResponse(
        json: unknown
    ): Promise<PaginatedPostsResponse> {
        const result = await this.handlePaginatedResponse<Post>(json, 'posts', 'next');
        return { posts: result.items, next: result.next };
    }

    private async handlePaginatedExploreAccountsResponse(
        json: unknown
    ): Promise<PaginatedExploreAccountsResponse> {
        const result = await this.handlePaginatedResponse<ExploreAccount>(json, 'accounts', 'next');
        return { accounts: result.items, next: result.next };
    }

    private async handlePaginatedAccountsResponse(
        json: unknown
    ): Promise<PaginatedAccountsResponse> {
        const result = await this.handlePaginatedResponse<Account>(json, 'accounts', 'next');
        return { accounts: result.items, next: result.next };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key: string
    ): Promise<PaginatedExploreAccountsResponse> {
        if (json === null || !('items' in json)) {
            return { accounts: [], next: null };
        }

        const items = Array.isArray(json.items) ? json.items : [];
        const nextPage = 'next' in json && typeof json.next === 'string' ? json.next : null;

        return { accounts: items, next: nextPage };
    }

    private async handlePaginatedExploreAccountsResponseWithKey(
        json: unknown,
        key