import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?: string}): Promise<Partial<EditableAppContext>> {
    const page = (state.pagination?.page ?? 0) + 1;

    const data = state.admin && state.adminApi
        ? await state.adminApi.browse({page, postId: options.postId, order: order || state.order, memberUuid: state.member?.uuid})
        : await api.comments.browse({page, postId: options.postId, order: order || state.order});

    const updatedComments = [...state.comments, ...data.comments];
    const dedupedComments = updatedComments.filter((comment, index, self) => self.findIndex(c => c.id === comment.id) === index);

    // Note: we store the comments from new to old, and show them in reverse order
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
        const data = state.admin && state.adminApi
            ? await state.adminApi.browse({page: 1, postId: options.postId, order, memberUuid: state.member?.uuid})
            : await api.comments.browse({page: 1, postId: options.postId, order});

        return {
            comments: [...data.comments],
            pagination: data.meta.pagination,
            order,
            commentsIsLoading: false
        };
    } catch (error) {
        console.error('Failed to set order:', error); // eslint-disable-line no-console
        state.commentsIsLoading = false;
        throw error;
    }
}

async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const fetchReplies = async (afterReplyId: string | undefined, requestLimit: number) => {
        if (state.admin && state.adminApi && !isReply) {
            return await state.adminApi.replies({commentId: comment.id, afterReplyId, limit: requestLimit, memberUuid: state.member?.uuid});
        }
        return await api.comments.replies({commentId: comment.id, afterReplyId, limit: requestLimit});
    };

    const afterReplyId = comment.replies?.length > 0
        ? comment.replies[comment.replies.length - 1]?.id
        : undefined;

    let allComments: Comment[] = [];

    if (limit === 'all') {
        let hasMore = true;
        let nextAfterReplyId = afterReplyId;

        while (hasMore) {
            const data = await fetchReplies(nextAfterReplyId, 100);
            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next;

            if (data.comments?.length) {
                nextAfterReplyId = data.comments[data.comments.length - 1]?.id;
            } else {
                hasMore = false;
            }
        }
    } else {
        const data = await fetchReplies(afterReplyId, limit as number || 100);
        allComments = data.comments;
    }

    // Note: we store the comments from new to old, and show them in reverse order
    return {
        comments: state.comments.map(c => c.id === comment.id ? {...comment, replies: [...comment.replies, ...allComments]} : c)
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
        comments: state.comments.map(c => c.id === parent.id ? {
            ...parent,
            replies: [...parent.replies, comment],
            count: {...parent.count, replies: parent.count.replies + 1}
        } : c),
        commentCount: state.commentCount + 1
    };
}

async function hideComment({state, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.hideComment(comment.id);
    }
    return {
        comments: state.comments.map(c => {
            const replies = c.replies.map(r => r.id === comment.id ? {...r, status: 'hidden'} : r);
            return c.id === comment.id ? {...c, status: 'hidden', replies} : {...c, replies};
        }),
        commentCount: state.commentCount - 1
    };
}

async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.showComment({id: comment.id});
    }

    const data = state.admin && state.adminApi
        ? await state.adminApi.read({commentId: comment.id, memberUuid: state.member?.uuid})
        : await api.comments.read(comment.id);

    const updatedComment = data.comments[0];

    return {
        comments: state.comments.map(c => {
            const replies = c.replies.map(r => r.id === comment.id ? updatedComment : r);
            return c.id === comment.id ? updatedComment : {...c, replies};
        }),
        commentCount: state.commentCount + 1
    };
}

async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: state.comments.map(c => {
            const replies = c.replies.map(r => r.id === comment.id ? {
                ...r,
                liked: comment.liked,
                count: {...r.count, likes: comment.liked ? r.count.likes + 1 : r.count.likes - 1}
            } : r);

            return c.id === comment.id ? {
                ...c,
                liked: comment.liked,
                replies,
                count: {...c.count, likes: comment.liked ? c.count.likes + 1 : c.count.likes - 1}
            } : {...c, replies};
        })
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

async function deleteComment({state, api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    await api.comments.edit({comment: {id: comment.id, status: 'deleted'}});

    const commentToDelete = state.comments.find(c => c.id === comment.id);
    if (commentToDelete?.replies?.length === 0) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    return {
        comments: state.comments.map(topLevelComment => {
            if (topLevelComment.id === comment.id) {
                return topLevelComment.replies?.length > 0
                    ? {...topLevelComment, status: 'deleted'}
                    : null;
            }

            const originalLength = topLevelComment.replies?.length ?? 0;
            const updatedReplies = topLevelComment.replies.filter(reply => reply.id !== comment.id);
            const hasDeletedReply = originalLength !== updatedReplies.length;

            if (hasDeletedReply && topLevelComment.count?.replies) {
                topLevelComment.count.replies -= 1;
            }

            return {...topLevelComment, replies: updatedReplies};
        }).filter(Boolean),
        commentCount: state.commentCount - 1
    };
}

async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const data = await api.comments.edit({comment});
    comment = data.comments[0];

    return {
        comments: state.comments.map(c => {
            if (parent?.id === c.id) {
                return {...c, replies: c.replies.map(r => r.id === comment.id ? comment : r)};
            }
            return c.id === comment.id ? comment : c;
        })
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
            return {member, success: true};
        } catch (err) {
            return {success: false, error: err};
        }
    }
    return null;
}

function openPopup({data}: {data: Page}) {
    return {popup: data};
}

function closePopup() {
    return {popup: null};
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
    }
    return {openCommentForms: [...openFormsAfterAutoclose, newForm], ...otherStateChanges};
}

function setHighlightComment({data: commentId}: {data: string | null}) {
    return {commentIdToHighlight: commentId};
}

function highlightComment({data: {commentId}, dispatchAction}: {data: {commentId: string | null}; state: EditableAppContext; dispatchAction: DispatchActionType}) {
    setTimeout(() => {
        dispatchAction('setHighlightComment', null);
    }, 3000);
    return {commentIdToHighlight: commentId};
}

function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string, hasUnsavedChanges: boolean}, state: EditableAppContext}) {
    const updatedForms = state.openCommentForms.map(f => f.id === id ? {...f, hasUnsavedChanges} : {...f});
    return {openCommentForms: updatedForms};
}

function closeCommentForm({data: id, state}: {data: string, state: EditableAppContext}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

function setScrollTarget({data: commentId}: {data: string | null}) {
    return {commentIdToScrollTo: commentId};
}

// Sync actions make use of setState((currentState) => newState), to avoid 'race' conditions
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

/** Handle actions in the App, returns updated state */
export async function ActionHandler({action, data, state, api, adminApi, options, dispatchAction}: {action: ActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi, dispatchAction: DispatchActionType}): Promise<Partial<EditableAppContext>> {
    const handler = Actions[action];
    if (handler) {
        return await handler({data, state, api, adminApi, options, dispatchAction} as any) || {};
    }
    return {};
}

/** Handle actions in the App, returns updated state */
export function SyncActionHandler({action, data, state, api, adminApi, options}: {action: SyncActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    if (handler) {
        return handler({data, state, api, adminApi, options} as any) || {};
    }
    return {};
}