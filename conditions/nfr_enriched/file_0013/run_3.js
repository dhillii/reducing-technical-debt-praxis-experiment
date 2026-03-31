```typescript
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

// ============================================================================
// Types and Interfaces
// ============================================================================

interface ActionContext {
    state: EditableAppContext;
    api: GhostApi;
    adminApi?: AdminApi;
    options?: CommentsOptions;
    dispatchAction?: DispatchActionType;
}

interface BrowseParams {
    page: number;
    postId: string;
    order: string;
    memberUuid?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

function shouldUseAdminApi(state: EditableAppContext): boolean {
    return !!(state.admin && state.adminApi);
}

function dedupeComments(comments: Comment[]): Comment[] {
    return comments.filter((comment, index, self) => 
        self.findIndex(c => c.id === comment.id) === index
    );
}

function getLastReplyId(replies: Comment[] = []): string | undefined {
    return replies.length > 0 ? replies[replies.length - 1]?.id : undefined;
}

function updateCommentInList(
    comments: Comment[],
    commentId: string,
    updater: (comment: Comment) => Comment
): Comment[] {
    return comments.map(c => c.id === commentId ? updater(c) : c);
}

function updateCommentAndReplies(
    comments: Comment[],
    commentId: string,
    parentId: string | undefined,
    updater: (comment: Comment) => Comment
): Comment[] {
    return comments.map(c => {
        if (parentId && c.id === parentId) {
            return {
                ...c,
                replies: c.replies.map(r => r.id === commentId ? updater(r) : r)
            };
        }
        if (c.id === commentId) {
            return updater(c);
        }
        return c;
    });
}

// ============================================================================
// API Calls
// ============================================================================

async function browseComments(
    api: GhostApi,
    adminApi: AdminApi | undefined,
    params: BrowseParams,
    isAdmin: boolean
) {
    if (isAdmin && adminApi) {
        return await adminApi.browse(params);
    }
    return await api.comments.browse({
        page: params.page,
        postId: params.postId,
        order: params.order
    });
}

async function fetchReplies(
    api: GhostApi,
    adminApi: AdminApi | undefined,
    commentId: string,
    afterReplyId: string | undefined,
    limit: number,
    isAdmin: boolean,
    memberUuid?: string
) {
    if (isAdmin && adminApi) {
        return await adminApi.replies({
            commentId,
            afterReplyId,
            limit,
            memberUuid
        });
    }
    return await api.comments.replies({
        commentId,
        afterReplyId,
        limit
    });
}

// ============================================================================
// Comment Actions
// ============================================================================

async function loadMoreComments({
    state,
    api,
    options,
    order
}: {
    state: EditableAppContext;
    api: GhostApi;
    options: CommentsOptions;
    order?: string;
}): Promise<Partial<EditableAppContext>> {
    const page = (state.pagination?.page ?? 0) + 1;
    const isAdmin = shouldUseAdminApi(state);

    const data = await browseComments(api, state.adminApi, {
        page,
        postId: options.postId,
        order: order || state.order,
        memberUuid: state.member?.uuid
    }, isAdmin);

    const updatedComments = [...state.comments, ...data.comments];
    const dedupedComments = dedupeComments(updatedComments);

    return {
        comments: dedupedComments,
        pagination: data.meta.pagination
    };
}

async function setOrder({
    state,
    data: {order},
    options,
    api,
    dispatchAction
}: {
    state: EditableAppContext;
    data: {order: string};
    options: CommentsOptions;
    api: GhostApi;
    dispatchAction: DispatchActionType;
}): Promise<Partial<EditableAppContext>> {
    dispatchAction('setCommentsIsLoading', true);

    try {
        const isAdmin = shouldUseAdminApi(state);
        const data = await browseComments(api, state.adminApi, {
            page: 1,
            postId: options.postId,
            order,
            memberUuid: state.member?.uuid
        }, isAdmin);

        return {
            comments: data.comments,
            pagination: data.meta.pagination,
            order,
            commentsIsLoading: false
        };
    } catch (error) {
        console.error('Failed to set order:', error);
        throw error;
    }
}

function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {commentsIsLoading: isLoading};
}

// ============================================================================
// Reply Actions
// ============================================================================

async function loadMoreReplies({
    state,
    api,
    data: {comment, limit},
    isReply
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {comment: Comment; limit?: number | 'all'};
    isReply: boolean;
}): Promise<Partial<EditableAppContext>> {
    const isAdmin = shouldUseAdminApi(state);
    let afterReplyId = getLastReplyId(comment.replies);
    const allComments: Comment[] = [];

    if (limit === 'all') {
        let hasMore = true;
        while (hasMore) {
            const data = await fetchReplies(
                api,
                state.adminApi,
                comment.id,
                afterReplyId,
                100,
                isAdmin && !isReply,
                state.member?.uuid
            );

            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next && data.comments.length > 0;

            if (data.comments.length > 0) {
                afterReplyId = data.comments[data.comments.length - 1]?.id;
            }
        }
    } else {
        const data = await fetchReplies(
            api,
            state.adminApi,
            comment.id,
            afterReplyId,
            (limit as number) || 100,
            isAdmin && !isReply,
            state.member?.uuid
        );
        allComments.push(...data.comments);
    }

    return {
        comments: state.comments.map(c =>
            c.id === comment.id
                ? {...c, replies: [...comment.replies, ...allComments]}
                : c
        )
    };
}

async function addComment({
    state,
    api,
    data: comment
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: AddComment;
}): Promise<Partial<EditableAppContext>> {
    const data = await api.comments.add({comment});
    const newComment = data.comments[0];

    return {
        comments: [newComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

async function addReply({
    state,
    api,
    data: {reply, parent}
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {reply: any; parent: any};
}): Promise<Partial<EditableAppContext>> {
    const commentData = {...reply, parent_id: parent.id};
    const data = await api.comments.add({comment: commentData});
    const newComment = data.comments[0];

    return {
        comments: state.comments.map(c =>
            c.id === parent.id
                ? {
                    ...parent,
                    replies: [...parent.replies, newComment],
                    count: {
                        ...parent.count,
                        replies: parent.count.replies + 1
                    }
                }
                : c
        ),
        commentCount: state.commentCount + 1
    };
}

// ============================================================================
// Comment Visibility Actions
// ============================================================================

async function hideComment({
    state,
    data: comment
}: {
    state: EditableAppContext;
    data: {id: string};
}): Promise<Partial<EditableAppContext>> {
    if (state.adminApi) {
        await state.adminApi.hideComment(comment.id);
    }

    return {
        comments: state.comments.map(c => ({
            ...c,
            status: c.id === comment.id ? 'hidden' : c.status,
            replies: c.replies.map(r => ({
                ...r,
                status: r.id === comment.id ? 'hidden' : r.status
            }))
        })),
        commentCount: state.commentCount - 1
    };
}

async function showComment({
    state,
    api,
    data: comment
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {id: string};
}): Promise<Partial<EditableAppContext>> {
    if (state.adminApi) {
        await state.adminApi.showComment({id: comment.id});
    }

    const isAdmin = shouldUseAdminApi(state);
    const data = isAdmin && state.adminApi
        ? await state.adminApi.read({commentId: comment.id, memberUuid: state.member?.uuid})
        : await api.comments.read(comment.id);

    const updatedComment = data.comments[0];

    return {
        comments: state.comments.map(c => ({
            ...c,
            ...( c.id === comment.id && updatedComment),
            replies: c.replies.map(r =>
                r.id === comment.id ? updatedComment : r
            )
        })),
        commentCount: state.commentCount + 1
    };
}

// ============================================================================
// Comment Interaction Actions
// ============================================================================

async function updateCommentLikeState({
    state,
    data: comment
}: {
    state: EditableAppContext;
    data: {id: string; liked: boolean};
}): Promise<Partial<EditableAppContext>> {
    const updateLike = (c: Comment) => ({
        ...c,
        liked: comment.liked,
        count: {
            ...c.count,
            likes: comment.liked ? c.count.likes + 1 : c.count.likes - 1
        }
    });

    return {
        comments: state.comments.map(c => ({
            ...c,
            ...(c.id === comment.id && updateLike(c)),
            replies: c.replies.map(r =>
                r.id === comment.id ? updateLike(r) : r
            )
        }))
    };
}

async function likeComment({
    api,
    data: comment,
    dispatchAction
}: {
    api: GhostApi;
    data: {id: string};
    dispatchAction: DispatchActionType;
}): Promise<Partial<EditableAppContext>> {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    }
    return {};
}

async function unlikeComment({
    api,
    data: comment,
    dispatchAction
}: {
    api: GhostApi;
    data: {id: string};
    dispatchAction: DispatchActionType;
}): Promise<Partial<EditableAppContext>> {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    try {
        await api.comments.unlike({comment});
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    }
    return {};
}

async function reportComment({
    api,
    data: comment
}: {
    api: GhostApi;
    data: {id: string};
}): Promise<Partial<EditableAppContext>> {
    await api.comments.report({comment});
    return {};
}

// ============================================================================
// Comment Modification Actions
// ============================================================================

async function deleteComment({
    state,
    api,
    data: comment,
    dispatchAction
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {id: string};
    dispatchAction: DispatchActionType;
}): Promise<Partial<EditableAppContext> | null> {
    await api.comments.edit({
        comment: {id: comment.id, status: 'deleted'}
    });

    const commentToDelete = state.comments.find(c => c.id === comment.id);
    const hasNoReplies = !commentToDelete?.replies || commentToDelete.replies.length === 0;

    if (commentToDelete && hasNoReplies) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    return {
        comments: state.comments
            .map(topLevelComment => {
                if (topLevelComment.id === comment.id) {
                    return topLevelComment.replies.length > 0
                        ? {...topLevelComment, status: 'deleted'}
                        : null;
                }

                const updatedReplies = topLevelComment.replies.filter(
                    reply => reply.id !== comment.id
                );
                const replyWasDeleted = updatedReplies.length < topLevelComment.replies.length;

                return {
                    ...topLevelComment,
                    replies: updatedReplies,
                    count: replyWasDeleted && topLevelComment.count?.replies
                        ? {...topLevelComment.count, replies: topLevelComment.count.replies - 1}
                        : topLevelComment.count
                };
            })
            .filter(Boolean) as Comment[],
        commentCount: state.commentCount - 1
    };
}

async function editComment({
    state,
    api,
    data: {comment, parent}
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {comment: Partial<Comment> & {id: string}; parent?: Comment};
}): Promise<Partial<EditableAppContext>> {
    const data = await api.comments.edit({comment});
    const updatedComment = data.comments[0];

    return {
        comments: updateCommentAndReplies(
            state.comments,
            updatedComment.id,
            parent?.id,
            () => updatedComment
        )
    };
}

// ============================================================================
// Member Actions
// ============================================================================

async function updateMember({
    data,
    state,
    api
}: {
    data: {name: string; expertise: string};
    state: EditableAppContext;
    api: GhostApi;
}): Promise<Partial<EditableAppContext> | null> {
    const patchData: {name?: string; expertise?: string} = {};

    if (data.name && state?.member?.name !== data.name) {
        patchData.name = data.name;
    }

    if (data.expertise !== undefined && state?.member?.expertise !== data.expertise) {
        patchData.expertise = data.expertise;
    }

    if (Object.keys(patchData).length === 0) {
        return null;
    }

    try {
        const member = await api.member.update(patchData);
        if (!member) {
            throw new Error('Failed to update member');
        }
        return {member, success: true};
    } catch (err) {
        return