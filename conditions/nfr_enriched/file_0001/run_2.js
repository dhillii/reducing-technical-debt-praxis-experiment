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

export type FollowAccount = Pick<Account, 'id' | 'name' | 'handle' | 'avatarUrl' | 'blockedByMe' | 'domainBlockedByMe'> & {isFollowing: true};

export type AccountFollowsType = 'following' | 'followers';

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

type ImagePayload = {url: string; altText?: string};
type ContentPayload = {content: string; image?: ImagePayload};
type HttpMethod = 'DELETE' | 'GET' | 'POST' | 'PUT';

const EMPTY_PAGINATED_POSTS: PaginatedPostsResponse = {posts: [], next: null};
const EMPTY_PAGINATED_ACCOUNTS: GetAccountFollowsResponse = {accounts: [], next: null};
const EMPTY_NOTIFICATIONS: GetNotificationsResponse = {notifications: [], next: null};
const EMPTY_BLOCKED_ACCOUNTS: GetBlockedAccountsResponse = {accounts: [], next: null};
const EMPTY_BLOCKED_DOMAINS: GetBlockedDomainsResponse = {domains: [], next: null};
const EMPTY_EXPLORE_ACCOUNTS: PaginatedExploreAccountsResponse = {accounts: [], next: null};

function extractNextPage(json: object): string | null {
    return 'next' in json && typeof (json as Record<string, unknown>).next === 'string'
        ? (json as {next: string}).next
        : null;
}

function extractArray<T>(json: object, key: string): T[] {
    const value = (json as Record<string, unknown>)[key];
    return Array.isArray(value) ? value as T[] : [];
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

    private buildUrl(path: string, params?: Record<string, string>): URL {
        const url = new URL(path, this.apiUrl);
        if (params) {
            Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
        }
        return url;
    }

    private buildActionUrl(action: string, id?: string): URL {
        const path = id
            ? `.ghost/activitypub/v1/actions/${action}/${encodeURIComponent(id)}`
            : `.ghost/activitypub/v1/actions/${action}`;
        return this.buildUrl(path);
    }

    private async performAction(action: string, id?: string): Promise<void> {
        await this.fetchJSON(this.buildActionUrl(action, id), 'POST');
    }

    private buildContentBody(content: string, image?: ImagePayload): ContentPayload {
        const body: ContentPayload = {content};
        if (image) {
            body.image = image;
        }
        return body;
    }

    private async getPaginatedResponse<T>(
        endpoint: string,
        arrayKey: string,
        next?: string,
        emptyResult?: {next: string | null} & Record<string, T[]>
    ): Promise<{next: string | null} & Record<string, T[]>> {
        const url = this.buildUrl(endpoint, next ? {next} : undefined);
        const json = await this.fetchJSON(url);

        if (json === null || !(arrayKey in json)) {
            return emptyResult ?? {[arrayKey]: [], next: null} as {next: string | null} & Record<string, T[]>;
        }

        return {
            [arrayKey]: extractArray<T>(json, arrayKey),
            next: extractNextPage(json)
        } as {next: string | null} & Record<string, T[]>;
    }

    private async getPaginatedPosts(endpoint: string, next?: string): Promise<PaginatedPostsResponse> {
        const result = await this.getPaginatedResponse<Post>(endpoint, 'posts', next, EMPTY_PAGINATED_POSTS);
        return result as PaginatedPostsResponse;
    }

    private async getPaginatedExploreAccounts(endpoint: string, next?: string): Promise<PaginatedExploreAccountsResponse> {
        const result = await this.getPaginatedResponse<ExploreAccount>(endpoint, 'accounts', next, EMPTY_EXPLORE_ACCOUNTS);
        return result as PaginatedExploreAccountsResponse;
    }

    async blockDomain(domain: URL): Promise<boolean> {
        await this.fetchJSON(
            this.buildUrl(`.ghost/activitypub/v1/actions/block/domain/${encodeURIComponent(domain.href)}`),
            'POST'
        );
        return true;
    }

    async unblockDomain(domain: URL): Promise<boolean> {
        await this.fetchJSON(
            this.buildUrl(`.ghost/activitypub/v1/actions/unblock/domain/${encodeURIComponent(domain.href)}`),
            'POST'
        );
        return true;
    }

    async block(id: URL): Promise<boolean> {
        await this.performAction('block', id.href);
        return true;
    }

    async unblock(id: URL): Promise<boolean> {
        await this.performAction('unblock', id.href);
        return true;
    }

    async follow(username: string): Promise<Actor> {
        const url = this.buildUrl(`.ghost/activitypub/v1/actions/follow/${username}`);
        return this.fetchJSON(url, 'POST') as Promise<Actor>;
    }

    async unfollow(username: string): Promise<Actor> {
        const url = this.buildUrl(`.ghost/activitypub/v1/actions/unfollow/${username}`);
        return this.fetchJSON(url, 'POST') as Promise<Actor>;
    }

    async like(id: string): Promise<void> {
        await this.performAction('like', id);
    }

    async unlike(id: string): Promise<void> {
        await this.performAction('unlike', id);
    }

    async repost(id: string): Promise<void> {
        await this.performAction('repost', id);
    }

    async derepost(id: string): Promise<void> {
        await this.performAction('derepost', id);
    }

    async reply(id: string, content: string, image?: ImagePayload): Promise<Activity> {
        const url = this.buildActionUrl('reply', id);
        return this.fetchJSON(url, 'POST', this.buildContentBody(content, image));
    }

    async note(content: string, image?: ImagePayload): Promise<Post> {
        const url = this.buildUrl('.ghost/activitypub/v1/actions/note');
        const response = await this.fetchJSON(url, 'POST', this.buildContentBody(content, image));
        return (response as {post: Post}).post;
    }

    async delete(id: string): Promise<void> {
        const url = this.buildUrl(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`);
        await this.fetchJSON(url, 'DELETE');
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

        if (json && 'accounts' in json) {
            return json as SearchResults;
        }

        return {accounts