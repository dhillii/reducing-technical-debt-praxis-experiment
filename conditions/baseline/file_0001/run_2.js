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
    attachments?: PostAttachment[];
}

export interface PostAttachment {
    type: string;
    mediaType: string;
    name: string;
    url: string;
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

export type PostAuthor = Pick<Account, 'id' | 'handle' | 'avatarUrl' | 'name' | 'url' | 'followedByMe'>;

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

type HttpMethod = 'DELETE' | 'GET' | 'POST' | 'PUT';

type JsonResponse = Record<string, unknown>;

const EMPTY_PAGINATED_POSTS: PaginatedPostsResponse = {posts: [], next: null};
const EMPTY_PAGINATED_ACCOUNTS: PaginatedAccountsResponse = {accounts: [], next: null};
const EMPTY_PAGINATED_EXPLORE_ACCOUNTS: PaginatedExploreAccountsResponse = {accounts: [], next: null};

function extractNextPage(json: JsonResponse): string | null {
    return 'next' in json && typeof json.next === 'string' ? json.next : null;
}

function extractArray<T>(json: JsonResponse, key: string): T[] {
    return key in json && Array.isArray(json[key]) ? (json[key] as T[]) : [];
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

    private buildRequestOptions(token: string | null, method: HttpMethod, body?: object): RequestInit {
        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/activity+json'
        };

        const options: RequestInit = {method, headers};

        if (body) {
            options.body = JSON.stringify(body);
            headers['Content-Type'] = 'application/json';
        }

        return options;
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

    private async fetchJSON(url: URL, method: HttpMethod = 'GET', body?: object): Promise<JsonResponse | null> {
        const token = await this.getToken();
        const options = this.buildRequestOptions(token, method, body);
        const response = await this.fetch(url, options);

        if (response.status === 204 || response.status === 202) {
            return null;
        }

        if (!response.ok) {
            throw await this.parseErrorResponse(response);
        }

        return await response.json() as JsonResponse;
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
        await this.fetchJSON(
            this.buildUrl(`.ghost/activitypub/v1/actions/block/${encodeURIComponent(id.href)}`),
            'POST'
        );
        return true;
    }

    async unblock(id: URL): Promise<boolean> {
        await this.fetchJSON(
            this.buildUrl(`.ghost/activitypub/v1/actions/unblock/${encodeURIComponent(id.href)}`),
            'POST'
        );
        return true;
    }

    async follow(username: string): Promise<Actor> {
        return await this.fetchJSON(
            this.buildUrl(`.ghost/activitypub/v1/actions/follow/${username}`),
            'POST'
        ) as Actor;
    }

    async unfollow(username: string): Promise<Actor> {
        return await this.fetchJSON(
            this.buildUrl(`.ghost/activitypub/v1/actions/unfollow/${username}`),
            'POST'
        ) as Actor;
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

    private buildPostBody(content: string, image?: {url: string; altText?: string}) {
        return image ? {content, image} : {content};
    }

    async reply(id: string, content: string, image?: {url: string; altText?: string}): Promise<Activity> {
        const url = this.buildUrl(`.ghost/activitypub/v1/actions/reply/${encodeURIComponent(id)}`);
        return await this.fetchJSON(url, 'POST', this.buildPostBody(content, image));
    }

    async note(content: string, image?: {url: string; altText?: string}): Promise<Post> {
        const url = this.buildUrl('.ghost/activitypub/v1/actions/note');
        const response = await this.fetchJSON(url, 'POST', this.buildPostBody(content, image));
        return (response as {post: Post}).post;
    }

    async delete(id: string): Promise<void> {
        const url = this.buildUrl(`.ghost/activitypub/v1/post/${encodeURIComponent(id)}`);
        await this.fetchJSON(url, 'DELETE');
    }

    get userApiUrl() {
        return this.buildUrl(`.ghost/activitypub/users/${this.handle}`);
    }

    async getUser(): Promise<ActorProperties> {
        const json = await this.fetchJSON(this.userApiUrl);
        return json as ActorProperties;
    }

    get searchApiUrl() {
        return this.buildUrl('.ghost/activitypub/v1/actions/search');
    }

    async search(query: string): Promise<SearchResults> {
        const url = this.searchApiUrl;
        url.searchParams.set('query', query);

        const json = await this.fetchJSON(url, 'GET');

        if (json && 'accounts' in json) {
            return json as unknown as SearchResults;
        }

        return {accounts: []};
    }

    async getThread(id: string): Promise<Thread> {
        const url = this.buildUrl(`.ghost/activitypub/v1/thread/${encodeURIComponent(id)}`);
        const json = await this.fetchJSON(url);
        return json as unknown as Thread;
    }

    async getAccount(handle: string): Promise<GetAccountResponse> {
        const url = this.buildUrl(`.ghost/activitypub/v1/account/${handle}`);
        const json = await this.fetchJSON(url);
        return json as unknown as GetAccountResponse;
    }

    async getAccountFollows(handle: string, type: AccountFollowsType, next?: string): Promise<GetAccountFollowsResponse> {
        const params = next ? {next} : undefined;
        const url = this.buildUrl(`.ghost/activitypub/v1/account/${handle}/follows/${type}`, params);
        const json = await this.fetchJSON(url);

        if (json === null || !('accounts' in json)) {
            return {accounts: [], next: null};
        }

        return {
            accounts: extractArray<FollowAccount>(json, 'accounts'),
            next: extractNextPage(json)
        };
    }

    async getFeed(next?: string): Promise<PaginatedPostsResponse> {
        return this.getPaginatedPosts('.ghost/activitypub/v1/feed/notes', next);
    }

    async getInbox(next?: string):