import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/**
 * Helper to get the next pagination page.
 */
function getNextPage(state: EditableAppContext): number {
    return (state.pagination?.page ?? 0) + 1;
}

/**
 * Fetch comments using admin API when available, otherwise the public API.
 */
async function fetchComments(state: EditableAppContext, api: GhostApi, params: {page: number; postId: string; order?: string}): Promise<any> {
    return state.adminApi?.browse({
        page: params.page,
        postId: params.postId,
        order: params.order ?? state.order,
        memberUuid: state.member?.uuid
    }) ?? api.comments.browse({
        page: params.page,
        postId: params.postId,
        order: params.order ?? state.order
    });
}

/**
 * Fetch replies using admin API when appropriate.
 */
async function fetchReplies(state: EditableAppContext, api: GhostApi, commentId: string, afterReplyId: string | undefined, limit: number, isReply: boolean): Promise<any> {
    if (state.adminApi && !isReply) {
        return state.adminApi.replies({
            commentId,
            afterReplyId,
            limit,
            memberUuid: state.member?.uuid
        });
    }
    return api.comments.replies({
        commentId,
        afterReplyId,
        limit
    });
}

/**
 * Update a comment (or its reply) within the state tree.
 */
function updateCommentTree(state: EditableAppContext, targetId: string, updater: (c: Comment) => Comment): Comment[] {
    return state.comments.map(c => {
        if (c.id === targetId) {
            return updater(c);
        }
        const updatedReplies = c.replies.map(r => (r.id === targetId ? updater(r) : r));
        return {...c, replies: updatedReplies};
    });
}

/**
 * Load more top‑level comments.
 */
async function loadMoreComments({state, api, options, order}: {state: EditableAppContext; api: GhostApi; options: CommentsOptions; order?: string}): Promise<Partial<EditableAppContext>> {
    const page = getNextPage(state);
    const data = await fetchComments(state, api, {page, postId: options.postId, order});
    const merged = [...state.comments, ...data.comments];
    const deduped = merged.filter((c, i, arr) => arr.findIndex(t => t.id === c.id) === i);
    return {
        comments: deduped,
        pagination: data.meta.pagination
    };
}

/**
 * Set loading flag for comments.
 */
function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {commentsIsLoading: isLoading};
}

/**
 * Change comment ordering.
 */
async function setOrder({state, data: {order}, options, api, dispatchAction}: {state: EditableAppContext; data: {order: string}; options: CommentsOptions; api: GhostApi; dispatchAction: DispatchActionType}) {
    dispatchAction('setCommentsIsLoading', true);
    try {
        const data = await fetchComments(state, api, {page: 1, postId: options.postId, order});
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

/**
 * Load more replies for a comment.
 */
async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext; api: GhostApi; data: {comment: Comment; limit?: number | 'all'}; isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const afterId = comment.replies?.length ? comment.replies[comment.replies.length - 1]?.id : undefined;
    let allReplies: Comment[] = [];

    if (limit === 'all') {
        let hasMore = true;
        let cursor = afterId;
        while (hasMore) {
            const resp = await fetchReplies(state, api, comment.id, cursor, 100, isReply);
            allReplies.push(...resp.comments);
            hasMore = !!resp.meta.pagination.next;
            cursor = resp.comments.length ? resp.comments[resp.comments.length - 1]?.id : undefined;
        }
    } else {
        const resp = await fetchReplies(state, api, comment.id, afterId, limit as number || 100, isReply);
        allReplies = resp.comments;
    }

    const updated = state.comments.map(c => (c.id === comment.id ? {...comment, replies: [...comment.replies, ...allReplies]} : c));
    return {comments: updated};
}

/**
 * Add a new top‑level comment.
 */
async function addComment({state, api, data: comment}: {state: EditableAppContext; api: GhostApi; data: AddComment}) {
    const resp = await api.comments.add({comment});
    const newComment = resp.comments[0];
    return {
        comments: [newComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

/**
 * Add a reply to an existing comment.
 */
async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext; api: GhostApi; data: {reply: any; parent: any}}) {
    const replyWithParent = {...reply, parent_id: parent.id};
    const resp = await api.comments.add({comment: replyWithParent});
    const savedReply = resp.comments[0];
    const updated = state.comments.map(c => {
        if (c.id === parent.id) {
            return {
                ...parent,
                replies: [...parent.replies, savedReply],
                count: {...parent.count, replies: parent.count.replies + 1}
            };
        }
        return c;
    });
    return {
        comments: updated,
        commentCount: state.commentCount + 1
    };
}

/**
 * Hide a comment (admin only).
 */
async function hideComment({state, data: comment}: {state: EditableAppContext; adminApi: any; data: {id: string}}) {
    await state.adminApi?.hideComment(comment.id);
    const updated = state.comments.map(c => {
        const updatedReplies = c.replies.map(r => (r.id === comment.id ? {...r, status: 'hidden'} : r));
        if (c.id === comment.id) {
            return {...c, status: 'hidden', replies: updatedReplies};
        }
        return {...c, replies: updatedReplies};
    });
    return {
        comments: updated,
        commentCount: state.commentCount - 1
    };
}

/**
 * Show a previously hidden comment.
 */
async function showComment({state, api, data: comment}: {state: EditableAppContext; api: GhostApi; adminApi: any; data: {id: string}}) {
    await state.adminApi?.showComment({id: comment.id});
    const resp = await (state.adminApi?.read({
        commentId: comment.id,
        memberUuid: state.member?.uuid
    }) ?? api.comments.read(comment.id));
    const refreshed = resp.comments[0];
    const updated = state.comments.map(c => {
        const updatedReplies = c.replies.map(r => (r.id === comment.id ? refreshed : r));
        if (c.id === comment.id) {
            return refreshed;
        }
        return {...c, replies: updatedReplies};
    });
    return {
        comments: updated,
        commentCount: state.commentCount + 1
    };
}

/**
 * Update like state for a comment and its replies.
 */
async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext; data: {id: string; liked: boolean}}) {
    const updated = state.comments.map(c => {
        const updatedReplies = c.replies.map(r => {
            if (r.id === comment.id) {
                const likesDelta = comment.liked ? 1 : -1;
                return {
                    ...r,
                    liked: comment.liked,
                    count: {...r.count, likes: r.count.likes + likesDelta}
                };
            }
            return r;
        });
        if (c.id === comment.id) {
            const likesDelta = comment.liked ? 1 : -1;
            return {
                ...c,
                liked: comment.liked,
                replies: updatedReplies,
                count: {...c.count, likes: c.count.likes + likesDelta}
            };
        }
        return {...c, replies: updatedReplies};
    });
    return {comments: updated};
}

/**
 * Like a comment (optimistic UI).
 */
async function likeComment({api, data: comment, dispatchAction}: {state: EditableAppContext; api: GhostApi; data: {id: string}; dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    }
}

/**
 * Unlike a comment (optimistic UI).
 */
async function unlikeComment({api, data: comment, dispatchAction}: {state: EditableAppContext; api: GhostApi; data: {id: string}; dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    try {
        await api.comments.unlike({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    }
}

/**
 * Report a comment.
 */
async function reportComment({api, data: comment}: {api: GhostApi; data: {id: string}}) {
    await api.comments.report({comment});
    return {};
}

/**
 * Delete a comment or reply.
 */
async function deleteComment({state, api, data: comment, dispatchAction}: {state: EditableAppContext; api: GhostApi; data: {id: string}; dispatchAction: DispatchActionType}) {
    await api.comments.edit({
        comment: {id: comment.id, status: 'deleted'}
    });

    const target = state.comments.find(c => c.id === comment.id);
    if (target && (!target.replies?.length)) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    const updated = state.comments.map(top => {
        if (top.id === comment.id) {
            if (top.replies?.length) {
                return {...top, status: 'deleted'};
            }
            return null;
        }
        const originalLen = top.replies?.length ?? 0;
        const filteredReplies = top.replies?.filter(r => r.id !== comment.id) ?? [];
        if (originalLen !== filteredReplies.length && top.count?.replies) {
            top.count.replies -= 1;
        }
        return {...top, replies: filteredReplies};
    }).filter(Boolean) as Comment[];

    return {
        comments: updated,
        commentCount: state.commentCount - 1
    };
}

/**
 * Edit an existing comment.
 */
async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext; api: GhostApi; data: {comment: Partial<Comment> & {id: string}; parent?: Comment}}) {
    const resp = await api.comments.edit({comment});
    const updatedComment = resp.comments[0];
    const updated = state.comments.map(c => {
        if (parent && parent.id === c.id) {
            return {
                ...c,
                replies: c.replies.map(r => (r.id === updatedComment.id ? updatedComment : r))
            };
        }
        if (c.id === updatedComment.id) {
            return updatedComment;
        }
        return c;
    });
    return {comments: updated};
}

/**
 * Update member profile.
 */
async function updateMember({data, state, api}: {data: {name: string; expertise: string}; state: EditableAppContext; api: GhostApi}) {
    const {name, expertise} = data;
    const patch: {name?: string; expertise?: string} = {};

    if (name && state.member?.name !== name) {
        patch.name = name;
    }
    if (expertise !== undefined && state.member?.expertise !== expertise) {
        patch.expertise = expertise;
    }

    if (Object.keys(patch).length) {
        try {
            const member = await api.member.update(patch);
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

/**
 * Open a popup page.
 */
function openPopup({data}: {data: Page}) {
    return {popup: data};
}

/**
 * Close any open popup.
 */
function closePopup() {
    return {popup: null};
}

/**
 * Open a comment form, optionally loading all replies for the parent comment.
 */
async function openCommentForm({data: newForm, api, state}: {data: OpenCommentForm; api: GhostApi; state: EditableAppContext}) {
    let extraState: Partial<EditableAppContext> = {};

    const topLevelId = newForm.parent_id || newForm.id;
    if (newForm.type === 'reply' && !state.openCommentForms.some(f => f.id === topLevelId || f.parent_id === topLevelId)) {
        const parentComment = state.comments.find(c => c.id === topLevelId);
        if (parentComment) {
            const moreReplies = await loadMoreReplies({state, api, data: {comment: parentComment, limit: 'all'}, isReply: true});
            extraState = {...extraState, ...moreReplies};
        }
    }

    const filtered = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const existingIdx = filtered.findIndex(f => f.id === newForm.id);
    if (existingIdx > -1) {
        filtered[existingIdx] = newForm;
        return {openCommentForms: filtered, ...extraState};
    }
    return {openCommentForms: [...filtered, newForm], ...extraState};
}

/**
 * Set comment highlight identifier.
 */
function setHighlightComment({data: commentId}: {data: string | null}) {
    return {commentIdToHighlight: commentId};
}

/**
 * Trigger highlight with auto‑clear after timeout.
 */
function highlightComment({data: {commentId}, dispatchAction}: {data: {commentId: string | null}; state: EditableAppContext; dispatchAction: DispatchActionType}) {
    setTimeout(() => {
        dispatchAction('setHighlightComment', null);
    }, 3000);
    return {commentIdToHighlight: commentId};
}

/**
 * Mark a comment form as having unsaved changes.
 */
function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string; hasUnsavedChanges: boolean}; state: EditableAppContext}) {
    const updated = state.openCommentForms.map(f => (f.id === id ? {...f, hasUnsavedChanges} : {...f}));
    return {openCommentForms: updated};
}

/**
 * Close a specific comment form.
 */
function closeCommentForm({data: id, state}: {data: string; state: EditableAppContext}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

/**
 * Set scroll target comment identifier.
 */
function setScrollTarget({data: commentId}: {data: string | null}) {
    return {commentIdToScrollTo: commentId};
}

/**
 * Synchronous actions collection.
 */
export const SyncActions = {
    openPopup,
    closePopup,
    closeCommentForm,
    setCommentFormHasUnsavedChanges,
    setScrollTarget
};

export type SyncActionType = keyof typeof SyncActions;

/**
 * Asynchronous actions collection.
 */
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

/**
 * Type guard for synchronous actions.
 */
export function isSyncAction(action: string): action is SyncActionType {
    return !!(SyncActions as any)[action];
}

/**
 * General async action handler.
 */
export async function ActionHandler({action, data, state, api, adminApi, options, dispatchAction}: {action: ActionType; data: any; state: EditableAppContext; options: CommentsOptions; api: GhostApi; adminApi: AdminApi; dispatchAction: DispatchActionType}): Promise<Partial<EditableAppContext>> {
    const handler = Actions[action];
    if (handler) {
        return (await handler({data, state, api, adminApi, options, dispatchAction} as any)) || {};
    }
    return {};
}

/**
 * Synchronous action handler.
 */
export function SyncActionHandler({action, data, state, api, adminApi, options}: {action: SyncActionType; data: any; state: EditableAppContext; options: CommentsOptions; api: GhostApi; adminApi: AdminApi}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    if (handler) {
        return handler({data, state, api, adminApi, options} as any) || {};
    }
    return {};
}