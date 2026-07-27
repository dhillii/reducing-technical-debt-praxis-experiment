import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/**
 * Replace a comment (or a reply) inside the comment tree.
 * Handles both top‑level comment updates and reply updates when a parent is provided.
 */
function replaceCommentInTree(comments: Comment[], updated: Comment, parent?: Comment): Comment[] {
    return comments.map(c => {
        if (parent?.id === c.id) {
            return {
                ...c,
                replies: c.replies.map(r => r.id === updated.id ? updated : r)
            };
        }
        return c.id === updated.id ? updated : c;
    });
}

/**
 * Update the status of a comment (or its replies) inside the comment tree.
 */
function updateCommentStatus(comments: Comment[], targetId: string, status: string): Comment[] {
    return comments.map(c => {
        const updatedReplies = c.replies.map(r => r.id === targetId ? {...r, status} : r);
        if (c.id === targetId) {
            return {...c, status, replies: updatedReplies};
        }
        return {...c, replies: updatedReplies};
    });
}

/**
 * Update the like state of a comment (or its replies) inside the comment tree.
 */
function updateCommentLike(comments: Comment[], targetId: string, liked: boolean): Comment[] {
    return comments.map(c => {
        const updatedReplies = c.replies.map(r => {
            if (r.id === targetId) {
                const likesDelta = liked ? 1 : -1;
                return {
                    ...r,
                    liked,
                    count: {...r.count, likes: r.count.likes + likesDelta}
                };
            }
            return r;
        });

        if (c.id === targetId) {
            const likesDelta = liked ? 1 : -1;
            return {
                ...c,
                liked,
                replies: updatedReplies,
                count: {...c.count, likes: c.count.likes + likesDelta}
            };
        }

        return {...c, replies: updatedReplies};
    });
}

/**
 * Remove a comment (or its reply) from the comment tree, adjusting counts as needed.
 */
function removeCommentFromTree(comments: Comment[], targetId: string): Comment[] {
    return comments
        .map(top => {
            if (top.id === targetId) {
                if (top.replies.length > 0) {
                    return {...top, status: 'deleted'};
                }
                return null;
            }

            const originalLength = top.replies.length;
            const filteredReplies = top.replies.filter(r => r.id !== targetId);
            const hasDeletedReply = originalLength !== filteredReplies.length;

            if (hasDeletedReply && top.count?.replies) {
                top.count.replies -= 1;
            }

            return {...top, replies: filteredReplies};
        })
        .filter(Boolean) as Comment[];
}

async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?: string}): Promise<Partial<EditableAppContext>> {
    const page = (state.pagination?.page ?? 0) + 1;
    const data = state.adminApi
        ? await state.adminApi.browse({page, postId: options.postId, order: order || state.order, memberUuid: state.member?.uuid})
        : await api.comments.browse({page, postId: options.postId, order: order || state.order});

    const updatedComments = [...state.comments, ...data.comments];
    const dedupedComments = updatedComments.filter((c, i, self) => self.findIndex(s => s.id === c.id) === i);

    return {
        comments: dedupedComments,
        pagination: data.meta.pagination
    };
}

function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {commentsIsLoading: isLoading};
}

async function setOrder({state, data: {order}, options, api, dispatchAction}: {state: EditableAppContext, data: {order: string}, options: CommentsOptions, api: GhostApi, dispatchAction: DispatchActionType}) {
    dispatchAction('setCommentsIsLoading', true);
    try {
        const data = state.adminApi
            ? await state.adminApi.browse({page: 1, postId: options.postId, order, memberUuid: state.member?.uuid})
            : await api.comments.browse({page: 1, postId: options.postId, order});

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
        if (state.adminApi && !isReply) {
            return await state.adminApi.replies({commentId: comment.id, afterReplyId, limit: requestLimit, memberUuid: state.member?.uuid});
        }
        return await api.comments.replies({commentId: comment.id, afterReplyId, limit: requestLimit});
    };

    let afterReplyId = comment.replies?.length
        ? comment.replies[comment.replies.length - 1]?.id
        : undefined;

    let allComments: Comment[] = [];

    if (limit === 'all') {
        let hasMore = true;
        while (hasMore) {
            const data = await fetchReplies(afterReplyId, 100);
            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next;
            afterReplyId = data.comments?.[data.comments.length - 1]?.id;
        }
    } else {
        const data = await fetchReplies(afterReplyId, (limit as number) ?? 100);
        allComments = data.comments;
    }

    return {
        comments: state.comments.map(c => c.id === comment.id ? {...comment, replies: [...comment.replies, ...allComments]} : c)
    };
}

async function addComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, data: AddComment}) {
    const data = await api.comments.add({comment});
    const newComment = data.comments[0];
    return {
        comments: [newComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}) {
    reply.parent_id = parent.id;
    const data = await api.comments.add({comment: reply});
    const newReply = data.comments[0];

    return {
        comments: state.comments.map(c => c.id === parent.id
            ? {
                ...parent,
                replies: [...parent.replies, newReply],
                count: {...parent.count, replies: parent.count.replies + 1}
            }
            : c),
        commentCount: state.commentCount + 1
    };
}

async function hideComment({state, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.hideComment(comment.id);
    }
    return {
        comments: updateCommentStatus(state.comments, comment.id, 'hidden'),
        commentCount: state.commentCount - 1
    };
}

async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.showComment({id: comment.id});
    }
    const data = state.adminApi
        ? await state.adminApi.read({commentId: comment.id, memberUuid: state.member?.uuid})
        : await api.comments.read(comment.id);
    const updated = data.comments[0];

    return {
        comments: replaceCommentInTree(state.comments, updated),
        commentCount: state.commentCount + 1
    };
}

async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: updateCommentLike(state.comments, comment.id, comment.liked)
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
    const target = state.comments.find(c => c.id === comment.id);
    if (target?.replies?.length === 0) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }
    return {
        comments: removeCommentFromTree(state.comments, comment.id),
        commentCount: state.commentCount - 1
    };
}

async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const resp = await api.comments.edit({comment});
    const updated = resp.comments[0];
    return {
        comments: replaceCommentInTree(state.comments, updated, parent)
    };
}

async function updateMember({data, state, api}: {data: {name: string, expertise: string}, state: EditableAppContext, api: GhostApi}) {
    const {name, expertise} = data;
    const patch: {name?: string; expertise?: string} = {};

    const originalName = state.member?.name;
    if (name && originalName !== name) {
        patch.name = name;
    }

    const originalExpertise = state.member?.expertise;
    if (expertise !== undefined && originalExpertise !== expertise) {
        patch.expertise = expertise;
    }

    if (Object.keys(patch).length) {
        try {
            const member = await api.member.update(patch);
            if (!member) throw new Error('Failed to update member');
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

    const openFormsAfterAutoclose = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const existingIdx = openFormsAfterAutoclose.findIndex(f => f.id === newForm.id);
    if (existingIdx > -1) {
        openFormsAfterAutoclose[existingIdx] = newForm;
        return {openCommentForms: openFormsAfterAutoclose, ...otherStateChanges};
    }
    return {openCommentForms: [...openFormsAfterAutoclose, newForm], ...otherStateChanges};
}

function setHighlightComment({data: commentId}: {data: string | null}) {
    return {commentIdToHighlight: commentId};
}

function highlightComment({data: {commentId}, dispatchAction}: {data: {commentId: string | null}; state: EditableAppContext; dispatchAction: DispatchActionType}) {
    setTimeout(() => dispatchAction('setHighlightComment', null), 3000);
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