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

type GetAccountResponse = Account;

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
    };
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
    };
    inReplyTo: null | {
        id: string;
        type: 'article' | 'note';
        title: string | null;
        content: string;
        url: string;
    };
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
        typeof (error as ApiError).statusCode === 'number' &&
        typeof (error as ApiError).message === 'string'
    );
};

type ImagePayload = {url: string; altText?: string};
type ContentPayload = {content: string; image?: ImagePayload};
type HttpMethod = 'DELETE' | 'GET' | 'POST' | 'PUT';

const GHOST_AP_BASE = '.ghost/activitypub';

function extractNextPage(json: object): string | null {
    return 'next' in json && typeof (json as Record<string, unknown>).next === 'string'
        ? (json as {next: string}).next
        : null;
}

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

    private buildUrl(path: string): URL {
        return new URL(path, this.apiUrl);
    }

    private async fetchJSON(url: URL, method: HttpMethod = 'GET', body?: object): Promise<object | null> {
        const token = await this.getToken();
        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/activity+json'
        };

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
            throw await this.buildApiError(response);
        }

        return response.json();
    }

    private async buildApiError(response: Response): Promise<ApiError> {
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

    private async postAction(path: string): Promise<boolean> {
        const url = this.buildUrl(path);
        await this.fetchJSON(url, 'POST');
        return true;
    }

    private buildContentPayload(content: string, image?: ImagePayload): ContentPayload {
        const body: ContentPayload = {content};
        if (image) {
            body.image = image;
        }
        return body;
    }

    async blockDomain(domain: URL): Promise<boolean> {
        return this.postAction(`${GHOST_AP_BASE}/v1/actions/block/domain/${encodeURIComponent(domain.href)}`);
    }

    async unblockDomain(domain: URL): Promise<boolean> {
        return this.postAction(`${GHOST_AP_BASE}/v1/actions/unblock/domain/${encodeURIComponent(domain.href)}`);
    }

    async block(id: URL): Promise<boolean> {
        return this.postAction(`${GHOST_AP_BASE}/v1/actions/block/${encodeURIComponent(id.href)}`);
    }

    async unblock(id: URL): Promise<boolean> {
        return this.postAction(`${GHOST_AP_BASE}/v1/actions/unblock/${encodeURIComponent(id.href)}`);
    }

    async follow(username: string): Promise<Actor> {
        const url = this.buildUrl(`${GHOST_AP_BASE}/v1/actions/follow/${username}`);
        return this.fetchJSON(url, 'POST') as Promise<Actor>;
    }

    async unfollow(username: string): Promise<Actor> {
        const url = this.buildUrl(`${GHOST_AP_BASE}/v1/actions/unfollow/${username}`);
        return this.fetchJSON(url, 'POST') as Promise<Actor>;
    }

    async like(id: string): Promise<void> {
        await this.postAction(`${GHOST_AP_BASE}/v1/actions/like/${encodeURIComponent(id)}`);
    }

    async unlike(id: string): Promise<void> {
        await this.postAction(`${GHOST_AP_BASE}/v1/actions/unlike/${encodeURIComponent(id)}`);
    }

    async repost(id: string): Promise<void> {
        await this.postAction(`${GHOST_AP_BASE}/v1/actions/repost/${encodeURIComponent(id)}`);
    }

    async derepost(id: string): Promise<void> {
        await this.postAction(`${GHOST_AP_BASE}/v1/actions/derepost/${encodeURIComponent(id)}`);
    }

    async reply(id: string, content: string, image?: ImagePayload): Promise<Activity> {
        const url = this.buildUrl(`${GHOST_AP_BASE}/v1/actions/reply/${encodeURIComponent(id)}`);
        return this.fetchJSON(url, 'POST', this.buildContentPayload(content, image));
    }

    async note(content: string, image?: ImagePayload): Promise<Post> {
        const url = this.buildUrl(`${GHOST_AP_BASE}/v1/actions/note`);
        const response = await this.fetchJSON(url, 'POST', this.buildContentPayload(content, image));
        return (response as {post: Post}).post;
    }

    async delete(id: string): Promise<void> {
        const url = this.buildUrl(`${GHOST_AP_BASE}/v1/post/${encodeURIComponent(id)}`);
        await this.fetchJSON(url, 'DELETE');
    }

    get userApiUrl(): URL {
        return this.buildUrl(`${GHOST_AP_BASE}/users/${this.handle}`);
    }

    async getUser(): Promise<ActorProperties> {
        const json = await this.fetchJSON(this.userApiUrl);
        return json as ActorProperties;
    }

    get searchApiUrl(): URL {
        return this.buildUrl(`${GHOST_AP_BASE}/v1/actions/search`);
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
        const url = this.buildUrl(`${GHOST_AP_BASE}/v1/thread/${encodeURIComponent(id)}`);
        return this.fetchJSON(url) as Promise<Thread>;
    }

    async getAccount(handle: string): Promise<GetAccountResponse> {
        const url = this.buildUrl(`${GHOST_AP_BASE}/v1/account/${handle}`);
        return this.fetchJSON(url) as Promise<GetAccountResponse>;
    }

    async getAccountFollows(handle: string, type: AccountFollowsType, next?: string): Promise<GetAccountFollowsResponse> {
        const url = this.buildUrl(`${GHOST_AP_BASE}/v1/account/${handle}/follows/${type}`);
        if (next) {
            url.searchParams.set('next', next);
        }

        const json = await this.fetchJSON(url);
        const empty: GetAccountFollowsResponse = {accounts: [], next: null};

        if (!json || !('accounts' in json)) {
            return empty;
        }

        return {
            accounts: extractArray<FollowAccount>(json, 'accounts'),
            next: extractNextPage(json)
        };
    }

    async getFeed(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts(`${GHOST_AP_BASE}/v1/feed/notes`, next);
    }

    async getInbox(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts(`${GHOST_AP_BASE}/v1/feed/reader`, next);
    }

    async getDiscoveryFeed(topic: string, next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts(`${GHOST_AP_BASE}/v1/feed/discover/${topic}`, next);
    }

    async getExploreAccounts(topic: string, next?: string): Promise<PaginatedExploreAccountsResponse> {
        return this.getPaginatedExploreAccounts(`${GHOST_AP_BASE}/v1/explore/${topic}`, next);
    }

    async get