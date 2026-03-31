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

function findCommentInTree(
    comments: Comment[],
    targetId: string,
    callback: (comment: Comment, isReply: boolean) => Comment | null
): Comment[] {
    return comments
        .map(comment => {
            if (comment.id === targetId) {
                return callback(comment, false);
            }

            const updatedReplies = comment.replies
                .map(reply => {
                    if (reply.id === targetId) {
                        return callback(reply, true);
                    }
                    return reply;
                })
                .filter(Boolean);

            if (updatedReplies.length !== comment.replies.length) {
                return {...comment, replies: updatedReplies};
            }

            return comment;
        })
        .filter(Boolean);
}

function updateCommentInTree(
    comments: Comment[],
    targetId: string,
    updater: (comment: Comment) => Comment
): Comment[] {
    return comments.map(comment => {
        if (comment.id === targetId) {
            return updater(comment);
        }

        return {
            ...comment,
            replies: comment.replies.map(reply => {
                if (reply.id === targetId) {
                    return updater(reply);
                }
                return reply;
            })
        };
    });
}

// ============================================================================
// COMMENT LOADING ACTIONS
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
    const afterReplyId =
        comment.replies?.length > 0
            ? comment.replies[comment.replies.length - 1]?.id
            : undefined;

    const allComments = await (limit === 'all'
        ? loadAllReplies(state, api, comment.id, afterReplyId, isReply)
        : loadLimitedReplies(state, api, comment.id, afterReplyId, limit as number, isReply));

    return {
        comments: state.comments.map(c =>
            c.id === comment.id
                ? {...comment, replies: [...comment.replies, ...allComments]}
                : c
        )
    };
}

async function loadAllReplies(
    state: EditableAppContext,
    api: GhostApi,
    commentId: string,
    initialAfterId: string | undefined,
    isReply: boolean
): Promise<Comment[]> {
    const allComments: Comment[] = [];
    let afterReplyId = initialAfterId;
    let hasMore = true;

    while (hasMore) {
        const data = await fetchReplies(state, api, {
            commentId,
            afterReplyId,
            limit: 100
        }, isReply);

        allComments.push(...data.comments);
        hasMore = !!data.meta.pagination.next;

        if (data.comments?.length > 0) {
            afterReplyId = data.comments[data.comments.length - 1]?.id;
        } else {
            hasMore = false;
        }
    }

    return allComments;
}

async function loadLimitedReplies(
    state: EditableAppContext,
    api: GhostApi,
    commentId: string,
    afterReplyId: string | undefined,
    limit: number,
    isReply: boolean
): Promise<Comment[]> {
    const data = await fetchReplies(state, api, {
        commentId,
        afterReplyId,
        limit: limit || 100
    }, isReply);

    return data.comments;
}

// ============================================================================
// COMMENT CRUD ACTIONS
// ============================================================================

async function addComment({
    state,
    api,
    data: comment
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: AddComment;
}) {
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
}) {
    const commentToAdd = {...reply, parent_id: parent.id};
    const data = await api.comments.add({comment: commentToAdd});
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

async function editComment({
    state,
    api,
    data: {comment, parent}
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {comment: Partial<Comment> & {id: string}; parent?: Comment};
}) {
    const data = await api.comments.edit({comment});
    const updatedComment = data.comments[0];

    return {
        comments: state.comments.map(c => {
            if (parent?.id === c.id) {
                return {
                    ...c,
                    replies: c.replies.map(r =>
                        r.id === updatedComment.id ? updatedComment : r
                    )
                };
            }
            return c.id === updatedComment.id ? updatedComment : c;
        })
    };
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
}) {
    await api.comments.edit({
        comment: {
            id: comment.id,
            status: 'deleted'
        }
    });

    const commentToDelete = state.comments.find(c => c.id === comment.id);
    const hasNoReplies = !commentToDelete?.replies?.length;

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
                const deletedReplyCount =
                    topLevelComment.replies.length - updatedReplies.length;

                return {
                    ...topLevelComment,
                    replies: updatedReplies,
                    ...(deletedReplyCount > 0 &&
                        topLevelComment.count?.replies && {
                        count: {
                            ...topLevelComment.count,
                            replies: topLevelComment.count.replies - deletedReplyCount
                        }
                    })
                };
            })
            .filter(Boolean),
        commentCount: state.commentCount - 1
    };
}

// ============================================================================
// COMMENT VISIBILITY ACTIONS
// ============================================================================

async function hideComment({
    state,
    data: comment
}: {
    state: EditableAppContext;
    adminApi: any;
    data: {id: string};
}) {
    if (state.adminApi) {
        await state.adminApi.hideComment(comment.id);
    }

    return {
        comments: findCommentInTree(state.comments, comment.id, () => ({
            ...comment,
            status: 'hidden'
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
}) {
    if (state.adminApi) {
        await state.adminApi.showComment({id: comment.id});
    }

    const data = await browseComments(state, api, {
        page: 1,
        postId: '',
        order: state.order
    });

    const updatedComment = data.comments[0];

    return {
        comments: findCommentInTree(state.comments, comment.id, () => updatedComment),
        commentCount: state.commentCount + 1
    };
}

// ============================================================================
// COMMENT INTERACTION ACTIONS
// ============================================================================

async function updateCommentLikeState({
    state,
    data: comment
}: {
    state: EditableAppContext;
    data: {id: string; liked: boolean};
}) {
    const likesDelta = comment.liked ? 1 : -1;

    return {
        comments: updateCommentInTree(state.comments, comment.id, c => ({
            ...c,
            liked: comment.liked,
            count: {
                ...c.count,
                likes: c.count.likes + likesDelta
            }
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
}) {
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
    state: EditableAppContext;
    api: GhostApi;
    data: {id: string};
    dispatchAction: DispatchActionType;
}) {
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
}) {
    await api.comments.report({comment});
    return {};
}

// ============================================================================
// MEMBER ACTIONS
// ============================================================================

async function updateMember({
    data,
    state,
    api
}: {
    data: {name: string; expertise: string};
    state: EditableAppContext;
    api: GhostApi;
}) {
    const patchData: {name?: string; expertise?: string} = {};

    if (data.name && state?.member?.name !== data.name) {
        patchData.name = data.name;
    }

    if (
        data.expertise !== undefined &&
        state?.member?.expertise !== data.expertise
    ) {
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

// ============================================================================
// UI STATE ACTIONS
// ============================================================================

function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {commentsIsLoading: isLoading};
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
}) {
    dispatchAction('setCommentsIsLoading', true);

    try {
        const data = await browseComments(state, api, {
            page: 1,
            postId: options.postId,
            order
        });

        return {
            comments: [...data.comments],
            pagination: data.meta.pagination,
            order,
            commentsIsLoading: false
        };
    } catch (error) {
        console.error('Failed to set order:', error);
        return {commentsIsLoading: false};
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
}) {
    let otherStateChanges = {};

    const topLevelCommentId = newForm.parent_id || newForm.id;
    const isReplyFormForNewComment =
        newForm.type === 'reply' &&
        !state.openComment