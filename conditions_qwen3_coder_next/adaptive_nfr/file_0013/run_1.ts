import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/**
 * Helper to safely update a comment's replies array with a new reply
 */
function updateCommentReplies(comments: Comment[], parentId: string, newReply: Comment): Comment[] {
    return comments.map((c) => {
        if (c.id === parentId) {
            return {
                ...c,
                replies: [...(c.replies || []), newReply],
                count: {
                    ...c.count,
                    replies: (c.count?.replies || 0) + 1
                }
            };
        }
        return c;
    });
}

/**
 * Helper to update a comment or its reply in the comments tree
 */
function updateCommentOrReply(comments: Comment[], targetId: string, updatedComment: Comment): Comment[] {
    return comments.map((c) => {
        if (c.id === targetId) {
            return updatedComment;
        }

        const updatedReplies = c.replies?.map((r) => {
            if (r.id === targetId) {
                return updatedComment;
            }
            return r;
        });

        return {
            ...c,
            replies: updatedReplies
        };
    });
}

/**
 * Helper to update comment status (hidden/shown) in the comments tree
 */
function updateCommentStatus(comments: Comment[], targetId: string, status: 'hidden' | 'published'): Comment[] {
    return comments.map((c) => {
        const updatedReplies = c.replies?.map((r) => {
            if (r.id === targetId) {
                return {...r, status};
            }
            return r;
        });

        if (c.id === targetId) {
            return {...c, status, replies: updatedReplies};
        }

        return {...c, replies: updatedReplies};
    });
}

/**
 * Helper to update like state for a comment or its reply
 */
function updateLikeState(comments: Comment[], targetId: string, liked: boolean): Comment[] {
    return comments.map((c) => {
        const updatedReplies = c.replies?.map((r) => {
            if (r.id === targetId) {
                return {
                    ...r,
                    liked,
                    count: {
                        ...r.count,
                        likes: liked ? r.count.likes + 1 : r.count.likes - 1
                    }
                };
            }
            return r;
        });

        if (c.id === targetId) {
            return {
                ...c,
                liked,
                replies: updatedReplies,
                count: {
                    ...c.count,
                    likes: liked ? c.count.likes + 1 : c.count.likes - 1
                }
            };
        }

        return {...c, replies: updatedReplies};
    });
}

/**
 * Helper to delete a comment or reply from the comments tree
 */
function deleteCommentFromTree(comments: Comment[], targetId: string): {comments: Comment[], commentCountDelta: number} {
    let commentCountDelta = 0;
    const updatedComments = comments.map((c) => {
        if (c.id === targetId) {
            commentCountDelta = -1;
            return c.replies?.length ? {...c, status: 'deleted'} : null;
        }

        const originalRepliesLength = c.replies?.length || 0;
        const updatedReplies = c.replies?.filter(r => r.id !== targetId);
        const hasDeletedReply = originalRepliesLength !== updatedReplies?.length;

        if (hasDeletedReply && c.count?.replies) {
            c.count.replies = c.count.replies - 1;
        }

        return {...c, replies: updatedReplies};
    }).filter(Boolean) as Comment[];

    return {comments: updatedComments, commentCountDelta};
}

/**
 * Helper to update comment with new content
 */
function replaceCommentInTree(comments: Comment[], targetId: string, updatedComment: Comment, parentId?: string): Comment[] {
    return comments.map((c) => {
        if (parentId && parentId === c.id) {
            return {
                ...c,
                replies: c.replies?.map((r) => {
                    if (r.id === targetId) {
                        return updatedComment;
                    }
                    return r;
                })
            };
        } else if (c.id === targetId) {
            return updatedComment;
        }
        return c;
    });
}

async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?:string}): Promise<Partial<EditableAppContext>> {
    let page = 1;
    if (state.pagination && state.pagination.page) {
        page = state.pagination.page + 1;
    }
    let data;
    if (state.admin && state.adminApi) {
        data = await state.adminApi.browse({page, postId: options.postId, order: order || state.order, memberUuid: state.member?.uuid});
    } else {
        data = await api.comments.browse({page, postId: options.postId, order: order || state.order});
    }

    const updatedComments = [...state.comments, ...data.comments];
    const dedupedComments = updatedComments.filter((comment, index, self) => self.findIndex(c => c.id === comment.id) === index);

    return {
        comments: dedupedComments,
        pagination: data.meta.pagination
    };
}

function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {
        commentsIsLoading: isLoading
    };
}

async function setOrder({state, data: {order}, options, api, dispatchAction}: {state: EditableAppContext, data: {order: string}, options: CommentsOptions, api: GhostApi, dispatchAction: DispatchActionType}) {
    dispatchAction('setCommentsIsLoading', true);

    try {
        let data;
        if (state.admin && state.adminApi) {
            data = await state.adminApi.browse({page: 1, postId: options.postId, order, memberUuid: state.member?.uuid});
        } else {
            data = await api.comments.browse({page: 1, postId: options.postId, order});
        }

        return {
            comments: [...data.comments],
            pagination: data.meta.pagination,
            order,
            commentsIsLoading: false
        };
    } catch (error) {
        console.error('Failed to set order:', error);
        state.commentsIsLoading = false;
        throw error;
    }
}

async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const fetchReplies = async (afterReplyId: string | undefined, requestLimit: number) => {
        if (state.admin && state.adminApi && !isReply) {
            return await state.adminApi.replies({commentId: comment.id, afterReplyId, limit: requestLimit, memberUuid: state.member?.uuid});
        } else {
            return await api.comments.replies({commentId: comment.id, afterReplyId, limit: requestLimit});
        }
    };

    let afterReplyId: string | undefined = comment.replies && comment.replies.length > 0
        ? comment.replies[comment.replies.length - 1]?.id
        : undefined;

    let allComments: Comment[] = [];

    if (limit === 'all') {
        let hasMore = true;

        while (hasMore) {
            const data = await fetchReplies(afterReplyId, 100);
            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next;

            if (data.comments && data.comments.length > 0) {
                afterReplyId = data.comments[data.comments.length - 1]?.id;
            } else {
                hasMore = false;
            }
        }
    } else {
        const data = await fetchReplies(afterReplyId, limit as number || 100);
        allComments = data.comments;
    }

    return {
        comments: state.comments.map((c) => {
            if (c.id === comment.id) {
                return {
                    ...comment,
                    replies: [...(comment.replies || []), ...allComments]
                };
            }
            return c;
        })
    };
}

async function addComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, data: AddComment}) {
    const data = await api.comments.add({comment});
    comment = data.comments[0];

    return {
        comments: [comment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}) {
    let comment = reply;
    comment.parent_id = parent.id;

    const data = await api.comments.add({comment});
    comment = data.comments[0];

    return {
        comments: updateCommentReplies(state.comments, parent.id, comment),
        commentCount: state.commentCount + 1
    };
}

async function hideComment({state, adminApi, data: {id}}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.hideComment(id);
    }
    return {
        comments: updateCommentStatus(state.comments, id, 'hidden'),
        commentCount: state.commentCount - 1
    };
}

async function showComment({state, api, adminApi, data: {id}}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.showComment({id});
    }

    let data;
    if (state.admin && state.adminApi) {
        data = await state.adminApi.read({commentId: id, memberUuid: state.member?.uuid});
    } else {
        data = await api.comments.read(id);
    }

    const updatedComment = data.comments[0];

    return {
        comments: updateCommentOrReply(state.comments, id, updatedComment),
        commentCount: state.commentCount + 1
    };
}

async function updateCommentLikeState({state, data: {id, liked}}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: updateLikeState(state.comments, id, liked)
    };
}

async function likeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    }
}

async function unlikeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});

    try {
        await api.comments.unlike({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    }
}

async function reportComment({api, data: comment}: {api: GhostApi, data: {id: string}}) {
    await api.comments.report({comment});

    return {};
}

async function deleteComment({state, api, data: {id}, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    await api.comments.edit({
        comment: {
            id,
            status: 'deleted'
        }
    });

    const commentToDelete = state.comments.find(c => c.id === id);
    if (commentToDelete && (!commentToDelete.replies || commentToDelete.replies.length === 0)) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    const {comments, commentCountDelta} = deleteCommentFromTree(state.comments, id);

    return {
        comments,
        commentCount: state.commentCount + commentCountDelta
    };
}

async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const data = await api.comments.edit({comment});
    comment = data.comments[0];

    return {
        comments: replaceCommentInTree(state.comments, comment.id, comment, parent?.id)
    };
}

async function updateMember({data, state, api}: {data: {name: string, expertise: string}, state: EditableAppContext, api: GhostApi}) {
    const {name, expertise} = data;
    const patchData: {name?: string, expertise?: string} = {};

    const originalName = state?.member?.name;

    if (name && originalName !== name) {
        patchData.name = name;
    }

    const originalExpertise = state?.member?.expertise;
    if (expertise !== undefined && originalExpertise !== expertise) {
        patchData.expertise = expertise;
    }

    if (Object.keys(patchData).length > 0) {
        try {
            const member = await api.member.update(patchData);
            if (!member) {
                throw new Error('Failed to update member');
            }
            return {
                member,
                success: true
            };
        } catch (err) {
            return {
                success: false,
                error: err
            };
        }
    }
    return null;
}

function openPopup({data}: {data: Page}) {
    return {
        popup: data
    };
}

function closePopup() {
    return {
        popup: null
    };
}

async function openCommentForm({data: newForm, api, state}: {data: OpenCommentForm, api: GhostApi, state: EditableAppContext}) {
    let otherStateChanges = {};

    const topLevelCommentId = newForm.parent_id || newForm.id;
    if (newForm.type === 'reply' && !state.openCommentForms.some(f => f.id === topLevelCommentId || f.parent_id === topLevelCommentId)) {
        const comment = state.comments.find(c => c.id === topLevelCommentId);

        if (comment) {
            const newCommentsState = await loadMoreReplies({state, api, data: {comment, limit: 'all'}, isReply: true});
            otherStateChanges = {...otherStateChanges, ...newCommentsState};
        }
    }

    const openFormsAfterAutoclose = state.openCommentForms.filter(form => form.hasUnsavedChanges);

    const openFormIndexForId = openFormsAfterAutoclose.findIndex(form => form.id === newForm.id);
    if (openFormIndexForId > -1) {
        openFormsAfterAutoclose[openFormIndexForId] = newForm;

        return {openCommentForms: openFormsAfterAutoclose, ...otherStateChanges};
    } else {
        return {openCommentForms: [...openFormsAfterAutoclose, newForm], ...otherStateChanges};
    };
}

function setHighlightComment({data: commentId}: {data: string | null}) {
    return {
        commentIdToHighlight: commentId
    };
}

function highlightComment({
    data: {commentId},
    dispatchAction

}: {
    data: { commentId: string | null };
    state: EditableAppContext;
    dispatchAction: DispatchActionType;
}) {
    setTimeout(() => {
        dispatchAction('setHighlightComment', null);
    }, 3000);
    return {
        commentIdToHighlight: commentId
    };
}

function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string, hasUnsavedChanges: boolean}, state: EditableAppContext}) {
    const updatedForms = state.openCommentForms.map((f) => {
        if (f.id === id) {
            return {...f, hasUnsavedChanges};
        } else {
            return {...f};
        };
    });

    return {openCommentForms: updatedForms};
}

function closeCommentForm({data: id, state}: {data: string, state: EditableAppContext}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
};

function setScrollTarget({data: commentId}: {data: string | null}) {
    return {commentIdToScrollTo: commentId};
}

export const SyncActions = {
    openPopup,
    closePopup,
    closeCommentForm,
    setCommentFormHasUnsavedChanges,
    setScrollTarget
};

export type SyncActionType = keyof typeof SyncActions;

export const Actions = {
    addComment,
    editComment,
    hideComment,
    deleteComment,
    showComment,
    likeComment,
    unlikeComment,
    reportComment,
    addReply,
    loadMoreComments,
    loadMoreReplies,
    updateMember,
    setOrder,
    openCommentForm,
    highlightComment,
    setHighlightComment,
    setCommentsIsLoading,
    updateCommentLikeState
};

export type ActionType = keyof typeof Actions;

export function isSyncAction(action: string): action is SyncActionType {
    return !!(SyncActions as any)[action];
}

export async function ActionHandler({action, data, state, api, adminApi, options, dispatchAction}: {action: ActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi, dispatchAction: DispatchActionType}): Promise<Partial<EditableAppContext>> {
    const handler = Actions[action];
    if (handler) {
        return await handler({data, state, api, adminApi, options, dispatchAction} as any) || {};
    }
    return {};
}

export function SyncActionHandler({action, data, state, api, adminApi, options}: {action: SyncActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    if (handler) {
        return handler({data, state, api, adminApi, options} as any) || {};
    }
    return {};
}