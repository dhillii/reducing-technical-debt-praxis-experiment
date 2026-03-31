```typescript
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

type BrowseParams = {
    page: number;
    postId: string;
    order: string;
    memberUuid?: string;
};

type RepliesParams = {
    commentId: string;
    afterReplyId?: string;
    limit: number;
    memberUuid?: string;
};

async function browseComments(
    state: EditableAppContext,
    api: GhostApi,
    params: BrowseParams
) {
    if (state.admin && state.adminApi) {
        return await state.adminApi.browse({
            ...params,
            memberUuid: state.member?.uuid
        });
    }
    return await api.comments.browse(params);
}

async function fetchReplies(
    state: EditableAppContext,
    api: GhostApi,
    params: RepliesParams,
    isReply: boolean
) {
    if (state.admin && state.adminApi && !isReply) {
        return await state.adminApi.replies({
            ...params,
            memberUuid: state.member?.uuid
        });
    }
    return await api.comments.replies(params);
}

function dedupeComments(comments: Comment[]): Comment[] {
    return comments.filter(
        (comment, index, self) => self.findIndex(c => c.id === comment.id) === index
    );
}

function updateCommentInTree(
    comments: Comment[],
    commentId: string,
    updater: (comment: Comment) => Comment,
    parentId?: string
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
        return {
            ...c,
            replies: c.replies.map(r => r.id === commentId ? updater(r) : r)
        };
    });
}

function findCommentInTree(comments: Comment[], commentId: string): Comment | undefined {
    for (const comment of comments) {
        if (comment.id === commentId) return comment;
        const found = comment.replies?.find(r => r.id === commentId);
        if (found) return found;
    }
    return undefined;
}

// ============================================================================
// ASYNC ACTIONS
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
    const data = await browseComments(state, api, {
        page,
        postId: options.postId,
        order: order || state.order
    });

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
        const data = await browseComments(state, api, {
            page: 1,
            postId: options.postId,
            order
        });

        return {
            comments: data.comments,
            pagination: data.meta.pagination,
            order,
            commentsIsLoading: false
        };
    } catch (error) {
        console.error('Failed to set order:', error);
        dispatchAction('setCommentsIsLoading', false);
        throw error;
    }
}

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
    const allComments: Comment[] = [];
    let afterReplyId = comment.replies?.[comment.replies.length - 1]?.id;

    if (limit === 'all') {
        let hasMore = true;
        while (hasMore) {
            const data = await fetchReplies(state, api, {
                commentId: comment.id,
                afterReplyId,
                limit: 100
            }, isReply);

            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next;

            if (data.comments.length > 0) {
                afterReplyId = data.comments[data.comments.length - 1].id;
            } else {
                hasMore = false;
            }
        }
    } else {
        const data = await fetchReplies(state, api, {
            commentId: comment.id,
            afterReplyId,
            limit: (limit as number) || 100
        }, isReply);
        allComments.push(...data.comments);
    }

    return {
        comments: state.comments.map(c =>
            c.id === comment.id
                ? {...c, replies: [...(c.replies || []), ...allComments]}
                : c
        )
    };
}

async function addComment({
    state,
    api,
    data: commentData
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: AddComment;
}): Promise<Partial<EditableAppContext>> {
    const result = await api.comments.add({comment: commentData});
    const newComment = result.comments[0];

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
    const replyWithParent = {...reply, parent_id: parent.id};
    const result = await api.comments.add({comment: replyWithParent});
    const newReply = result.comments[0];

    return {
        comments: state.comments.map(c =>
            c.id === parent.id
                ? {
                    ...c,
                    replies: [...(c.replies || []), newReply],
                    count: {
                        ...c.count,
                        replies: (c.count?.replies ?? 0) + 1
                    }
                }
                : c
        ),
        commentCount: state.commentCount + 1
    };
}

async function hideComment({
    state,
    data: comment
}: {
    state: EditableAppContext;
    adminApi: any;
    data: {id: string};
}): Promise<Partial<EditableAppContext>> {
    if (state.adminApi) {
        await state.adminApi.hideComment(comment.id);
    }

    return {
        comments: state.comments.map(c => ({
            ...c,
            status: c.id === comment.id ? 'hidden' : c.status,
            replies: (c.replies || []).map(r => ({
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
    adminApi: any;
    data: {id: string};
}): Promise<Partial<EditableAppContext>> {
    if (state.adminApi) {
        await state.adminApi.showComment({id: comment.id});
    }

    const result = await browseComments(state, api, {
        page: 1,
        postId: '', // Not used in read operation
        order: state.order
    });

    const updatedComment = result.comments[0];

    return {
        comments: updateCommentInTree(state.comments, comment.id, () => updatedComment),
        commentCount: state.commentCount + 1
    };
}

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
            likes: comment.liked ? (c.count?.likes ?? 0) + 1 : (c.count?.likes ?? 0) - 1
        }
    });

    return {
        comments: state.comments.map(c => ({
            ...c,
            ...(c.id === comment.id && updateLike(c)),
            replies: (c.replies || []).map(r =>
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
    state: EditableAppContext;
    api: GhostApi;
    data: {id: string};
    dispatchAction: DispatchActionType;
}): Promise<Partial<EditableAppContext>> {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
        return {};
    }
}

async function unlikeComment({
    api,
    data: comment,
    dispatchAction
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {id: string};
    dispatchAction: DispatchActionType;
}): Promise<Partial<EditableAppContext>> {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    try {
        await api.comments.unlike({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
        return {};
    }
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

    const commentToDelete = findCommentInTree(state.comments, comment.id);
    const hasNoReplies = !commentToDelete?.replies || commentToDelete.replies.length === 0;

    if (commentToDelete && hasNoReplies) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    return {
        comments: state.comments
            .map(topLevelComment => {
                if (topLevelComment.id === comment.id) {
                    return topLevelComment.replies?.length
                        ? {...topLevelComment, status: 'deleted'}
                        : null;
                }

                const updatedReplies = (topLevelComment.replies || []).filter(
                    r => r.id !== comment.id
                );
                const replyWasDeleted = updatedReplies.length < (topLevelComment.replies?.length ?? 0);

                return {
                    ...topLevelComment,
                    replies: updatedReplies,
                    count: replyWasDeleted && topLevelComment.count
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
    const result = await api.comments.edit({comment});
    const updatedComment = result.comments[0];

    return {
        comments: state.comments.map(c => {
            if (parent?.id === c.id) {
                return {
                    ...c,
                    replies: (c.replies || []).map(r =>
                        r.id === updatedComment.id ? updatedComment : r
                    )
                };
            }
            return c.id === updatedComment.id ? updatedComment : c;
        })
    };
}

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

    if (data.name && state.member?.name !== data.name) {
        patchData.name = data.name;
    }

    if (data.expertise !== undefined && state.member?.expertise !== data.expertise) {
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
        return {success: false, error: err};
    }
}

async function openCommentForm({
    data: newForm,
    api,
    state
}: {
    data: OpenCommentForm;
    api: GhostApi;
    state: EditableAppContext;
}): Promise<Partial<EditableAppContext>> {
    let otherStateChanges: Partial<EditableAppContext> = {};

    const topLevelCommentId = newForm.parent_id || newForm.id;
    const hasOpenFormForComment = state.openCommentForms.some(
        f => f.id === topLevelCommentId || f.parent_id === topLevelCommentId
    );

    if (newForm.type === 'reply' && !hasOpenFormForComment) {
        const comment = state.comments.find(c => c.id === topLevelCommentId);
        if (comment) {
            const newCommentsState = await loadMoreReplies({
                state,
                api,