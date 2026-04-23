import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/**
 * Returns a comment service that abstracts admin vs public API calls.
 */
function getCommentService(state: EditableAppContext, api: GhostApi) {
    if (state.admin && state.adminApi) {
        return {
            browse: (params: any) => state.adminApi!.browse(params),
            read: (id: string) => state.adminApi!.read({commentId: id, memberUuid: state.member?.uuid}),
            hideComment: (id: string) => state.adminApi!.hideComment(id),
            showComment: (id: string) => state.adminApi!.showComment({id}),
            replies: (params: any) => state.adminApi!.replies(params)
        };
    }
    return {
        browse: (params: any) => api.comments.browse(params),
        read: (id: string) => api.comments.read(id),
        hideComment: undefined,
        showComment: undefined,
        replies: (params: any) => api.comments.replies(params)
    };
}

/** Load more top‑level comments */
async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?: string}): Promise<Partial<EditableAppContext>> {
    const nextPage = (state.pagination?.page ?? 0) + 1;
    const service = getCommentService(state, api);
    const data = await service.browse({page: nextPage, postId: options.postId, order: order ?? state.order, memberUuid: state.member?.uuid});
    const merged = [...state.comments, ...data.comments];
    const deduped = merged.filter((c, i, arr) => arr.findIndex(t => t.id === c.id) === i);
    return {comments: deduped, pagination: data.meta.pagination};
}

/** Set loading flag for comments */
function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {commentsIsLoading: isLoading};
}

/** Change comment order */
async function setOrder({state, data: {order}, options, api, dispatchAction}: {state: EditableAppContext, data: {order: string}, options: CommentsOptions, api: GhostApi, dispatchAction: DispatchActionType}) {
    dispatchAction('setCommentsIsLoading', true);
    try {
        const service = getCommentService(state, api);
        const data = await service.browse({page: 1, postId: options.postId, order, memberUuid: state.member?.uuid});
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

/** Load more replies for a comment */
async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const service = getCommentService(state, api);
    const fetchReplies = async (afterReplyId: string | undefined, requestLimit: number) => {
        if (state.admin && state.adminApi && !isReply) {
            return await service.replies({commentId: comment.id, afterReplyId, limit: requestLimit, memberUuid: state.member?.uuid});
        }
        return await service.replies({commentId: comment.id, afterReplyId, limit: requestLimit});
    };

    let afterReplyId = comment.replies?.[comment.replies.length - 1]?.id;
    let allComments: Comment[] = [];

    if (limit === 'all') {
        let hasMore = true;
        while (hasMore) {
            const data = await fetchReplies(afterReplyId, 100);
            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next;
            afterReplyId = data.comments?.[data.comments.length - 1]?.id ?? afterReplyId;
        }
    } else {
        const data = await fetchReplies(afterReplyId, (limit as number) ?? 100);
        allComments = data.comments;
    }

    return {
        comments: state.comments.map(c => c.id === comment.id ? {...comment, replies: [...comment.replies, ...allComments]} : c)
    };
}

/** Add a new top‑level comment */
async function addComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, data: AddComment}) {
    const data = await api.comments.add({comment});
    const newComment = data.comments[0];
    return {
        comments: [newComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

/** Add a reply to an existing comment */
async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}) {
    const replyWithParent = {...reply, parent_id: parent.id};
    const data = await api.comments.add({comment: replyWithParent});
    const savedReply = data.comments[0];
    return {
        comments: state.comments.map(c => c.id === parent.id ? {
            ...parent,
            replies: [...parent.replies, savedReply],
            count: {...parent.count, replies: parent.count.replies + 1}
        } : c),
        commentCount: state.commentCount + 1
    };
}

/** Hide a comment (admin only) */
async function hideComment({state, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    await state.adminApi?.hideComment(comment.id);
    return {
        comments: state.comments.map(c => {
            const updatedReplies = c.replies.map(r => r.id === comment.id ? {...r, status: 'hidden'} : r);
            if (c.id === comment.id) {
                return {...c, status: 'hidden', replies: updatedReplies};
            }
            return {...c, replies: updatedReplies};
        }),
        commentCount: state.commentCount - 1
    };
}

/** Show a hidden comment (admin only) */
async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    await state.adminApi?.showComment({id: comment.id});
    const service = getCommentService(state, api);
    const data = await service.read(comment.id);
    const updated = data.comments[0];
    return {
        comments: state.comments.map(c => {
            const updatedReplies = c.replies.map(r => r.id === comment.id ? updated : r);
            if (c.id === comment.id) {
                return updated;
            }
            return {...c, replies: updatedReplies};
        }),
        commentCount: state.commentCount + 1
    };
}

/** Update like state for a comment or reply */
async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: state.comments.map(c => {
            const updatedReplies = c.replies.map(r => r.id === comment.id ? {
                ...r,
                liked: comment.liked,
                count: {...r.count, likes: comment.liked ? r.count.likes + 1 : r.count.likes - 1}
            } : r);
            if (c.id === comment.id) {
                return {
                    ...c,
                    liked: comment.liked,
                    replies: updatedReplies,
                    count: {...c.count, likes: comment.liked ? c.count.likes + 1 : c.count.likes - 1}
                };
            }
            return {...c, replies: updatedReplies};
        })
    };
}

/** Like a comment */
async function likeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    }
}

/** Unlike a comment */
async function unlikeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    try {
        await api.comments.unlike({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    }
}

/** Report a comment */
async function reportComment({api, data: comment}: {api: GhostApi, data: {id: string}}) {
    await api.comments.report({comment});
    return {};
}

/** Delete a comment */
async function deleteComment({state, api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    await api.comments.edit({comment: {id: comment.id, status: 'deleted'}});
    const target = state.comments.find(c => c.id === comment.id);
    if (target && (!target.replies || target.replies.length === 0)) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }
    return {
        comments: state.comments.map(top => {
            if (top.id === comment.id) {
                if (top.replies.length > 0) {
                    return {...top, status: 'deleted'};
                }
                return null;
            }
            const filteredReplies = top.replies.filter(r => r.id !== comment.id);
            if (top.replies.length !== filteredReplies.length && top.count?.replies) {
                top.count.replies -= 1;
            }
            return {...top, replies: filteredReplies};
        }).filter(Boolean),
        commentCount: state.commentCount - 1
    };
}

/** Edit an existing comment */
async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const resp = await api.comments.edit({comment});
    const updated = resp.comments[0];
    return {
        comments: state.comments.map(c => {
            if (parent?.id === c.id) {
                return {...c, replies: c.replies.map(r => r.id === updated.id ? updated : r)};
            }
            if (c.id === updated.id) {
                return updated;
            }
            return c;
        })
    };
}

/** Update member profile */
async function updateMember({data, state, api}: {data: {name: string, expertise: string}, state: EditableAppContext, api: GhostApi}) {
    const {name, expertise} = data;
    const patch: {name?: string, expertise?: string} = {};

    if (name && state.member?.name !== name) {
        patch.name = name;
    }
    if (expertise !== undefined && state.member?.expertise !== expertise) {
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

/** Open a popup page */
function openPopup({data}: {data: Page}) {
    return {popup: data};
}

/** Close any popup */
function closePopup() {
    return {popup: null};
}

/** Open a comment form, optionally loading all replies for the parent */
async function openCommentForm({data: newForm, api, state}: {data: OpenCommentForm, api: GhostApi, state: EditableAppContext}) {
    let extraState: Partial<EditableAppContext> = {};

    const topId = newForm.parent_id || newForm.id;
    if (newForm.type === 'reply' && !state.openCommentForms.some(f => f.id === topId || f.parent_id === topId)) {
        const parentComment = state.comments.find(c => c.id === topId);
        if (parentComment) {
            const more = await loadMoreReplies({state, api, data: {comment: parentComment, limit: 'all'}, isReply: true});
            extraState = {...extraState, ...more};
        }
    }

    const filtered = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const idx = filtered.findIndex(f => f.id === newForm.id);
    if (idx > -1) {
        filtered[idx] = newForm;
        return {openCommentForms: filtered, ...extraState};
    }
    return {openCommentForms: [...filtered, newForm], ...extraState};
}

/** Set comment highlight */
function setHighlightComment({data: commentId}: {data: string | null}) {
    return {commentIdToHighlight: commentId};
}

/** Trigger highlight with auto‑clear */
function highlightComment({data: {commentId}, dispatchAction}: {data: {commentId: string | null}; state: EditableAppContext; dispatchAction: DispatchActionType}) {
    setTimeout(() => dispatchAction('setHighlightComment', null), 3000);
    return {commentIdToHighlight: commentId};
}

/** Mark a comment form as having unsaved changes */
function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string, hasUnsavedChanges: boolean}, state: EditableAppContext}) {
    const updated = state.openCommentForms.map(f => f.id === id ? {...f, hasUnsavedChanges} : {...f});
    return {openCommentForms: updated};
}

/** Close a specific comment form */
function closeCommentForm({data: id, state}: {data: string, state: EditableAppContext}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

/** Set scroll target comment */
function setScrollTarget({data: commentId}: {data: string | null}) {
    return {commentIdToScrollTo: commentId};
}

/** Synchronous actions */
export const SyncActions = {
    openPopup,
    closePopup,
    closeCommentForm,
    setCommentFormHasUnsavedChanges,
    setScrollTarget
};

export type SyncActionType = keyof typeof SyncActions;

/** Asynchronous actions */
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

/** Handle asynchronous actions */
export async function ActionHandler({action, data, state, api, adminApi, options, dispatchAction}: {action: ActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi, dispatchAction: DispatchActionType}): Promise<Partial<EditableAppContext>> {
    const handler = Actions[action];
    if (handler) {
        return (await handler({data, state, api, adminApi, options, dispatchAction} as any)) || {};
    }
    return {};
}

/** Handle synchronous actions */
export function SyncActionHandler({action, data, state, api, adminApi, options}: {action: SyncActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    if (handler) {
        return handler({data, state, api, adminApi, options} as any) || {};
    }
    return {};
}