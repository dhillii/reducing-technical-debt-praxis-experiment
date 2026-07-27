import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/* Helper: update comment tree when a comment or its reply changes */
function updateCommentTree(comments: Comment[], updated: Comment, parent?: Comment): Comment[] {
    return comments.map(c => {
        if (parent && parent.id === c.id) {
            return {
                ...c,
                replies: c.replies.map(r => r.id === updated.id ? updated : r)
            };
        }
        if (c.id === updated.id) {
            return updated;
        }
        return c;
    });
}

/* Helper: hide a comment (and its replies) */
function hideCommentInTree(comments: Comment[], targetId: string): Comment[] {
    return comments.map(c => {
        const replies = c.replies.map(r => r.id === targetId ? {...r, status: 'hidden'} : r);
        if (c.id === targetId) {
            return {...c, status: 'hidden', replies};
        }
        return {...c, replies};
    });
}

/* Helper: replace a comment (or its reply) with a new version */
function replaceCommentInTree(comments: Comment[], targetId: string, replacement: Comment): Comment[] {
    return comments.map(c => {
        const replies = c.replies.map(r => r.id === targetId ? replacement : r);
        if (c.id === targetId) {
            return replacement;
        }
        return {...c, replies};
    });
}

/* Helper: toggle like state for a comment or its reply */
function toggleLikeInTree(comments: Comment[], targetId: string, liked: boolean): Comment[] {
    return comments.map(c => {
        const replies = c.replies.map(r => {
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
                replies,
                count: {...c.count, likes: c.count.likes + likesDelta}
            };
        }

        return {...c, replies};
    });
}

/* Helper: delete a comment or reply from the tree */
function deleteFromTree(comments: Comment[], targetId: string): Comment[] {
    return comments.map(top => {
        if (top.id === targetId) {
            if (top.replies.length > 0) {
                return {...top, status: 'deleted'};
            }
            return null;
        }

        const originalLength = top.replies.length;
        const updatedReplies = top.replies.filter(r => r.id !== targetId);
        const hasDeletedReply = originalLength !== updatedReplies.length;

        if (hasDeletedReply && top.count?.replies) {
            top.count.replies = top.count.replies - 1;
        }

        return {...top, replies: updatedReplies};
    }).filter(Boolean) as Comment[];
}

/* Helper: add a reply to a parent comment */
function addReplyToParent(comments: Comment[], parentId: string, reply: Comment): Comment[] {
    return comments.map(c => {
        if (c.id === parentId) {
            return {
                ...c,
                replies: [...c.replies, reply],
                count: {...c.count, replies: c.count.replies + 1}
            };
        }
        return c;
    });
}

/* Load more top‑level comments */
async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?: string}): Promise<Partial<EditableAppContext>> {
    const page = (state.pagination?.page ?? 0) + 1;
    const browseParams = {page, postId: options.postId, order: order ?? state.order, memberUuid: state.member?.uuid};

    const data = state.admin && state.adminApi
        ? await state.adminApi.browse(browseParams)
        : await api.comments.browse(browseParams);

    const merged = [...state.comments, ...data.comments];
    const deduped = merged.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);

    return {
        comments: deduped,
        pagination: data.meta.pagination
    };
}

/* Set loading flag for comments */
function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {commentsIsLoading: isLoading};
}

/* Change comment ordering */
async function setOrder({state, data: {order}, options, api, dispatchAction}: {state: EditableAppContext, data: {order: string}, options: CommentsOptions, api: GhostApi, dispatchAction: DispatchActionType}) {
    dispatchAction('setCommentsIsLoading', true);
    try {
        const browseParams = {page: 1, postId: options.postId, order, memberUuid: state.member?.uuid};
        const data = state.admin && state.adminApi
            ? await state.adminApi.browse(browseParams)
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

/* Load more replies for a comment */
async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const fetchReplies = async (afterReplyId: string | undefined, requestLimit: number) => {
        if (state.admin && state.adminApi && !isReply) {
            return await state.adminApi.replies({commentId: comment.id, afterReplyId, limit: requestLimit, memberUuid: state.member?.uuid});
        }
        return await api.comments.replies({commentId: comment.id, afterReplyId, limit: requestLimit});
    };

    let afterReplyId = comment.replies?.length ? comment.replies[comment.replies.length - 1]?.id : undefined;
    let allComments: Comment[] = [];

    if (limit === 'all') {
        let hasMore = true;
        while (hasMore) {
            const data = await fetchReplies(afterReplyId, 100);
            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next;
            afterReplyId = data.comments?.length ? data.comments[data.comments.length - 1]?.id : undefined;
        }
    } else {
        const data = await fetchReplies(afterReplyId, (limit as number) ?? 100);
        allComments = data.comments;
    }

    return {
        comments: state.comments.map(c => c.id === comment.id ? {...comment, replies: [...comment.replies, ...allComments]} : c)
    };
}

/* Add a new top‑level comment */
async function addComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, data: AddComment}) {
    const data = await api.comments.add({comment});
    const newComment = data.comments[0];
    return {
        comments: [newComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

/* Add a reply to an existing comment */
async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}) {
    reply.parent_id = parent.id;
    const data = await api.comments.add({comment: reply});
    const newReply = data.comments[0];
    return {
        comments: addReplyToParent(state.comments, parent.id, newReply),
        commentCount: state.commentCount + 1
    };
}

/* Hide a comment (or reply) */
async function hideComment({state, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.hideComment(comment.id);
    }
    return {
        comments: hideCommentInTree(state.comments, comment.id),
        commentCount: state.commentCount - 1
    };
}

/* Show a previously hidden comment */
async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.showComment({id: comment.id});
    }
    const readParams = state.admin && state.adminApi
        ? {commentId: comment.id, memberUuid: state.member?.uuid}
        : undefined;
    const data = state.admin && state.adminApi
        ? await state.adminApi.read(readParams!)
        : await api.comments.read(comment.id);
    const updated = data.comments[0];
    return {
        comments: replaceCommentInTree(state.comments, comment.id, updated),
        commentCount: state.commentCount + 1
    };
}

/* Update like state for a comment or reply */
async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: toggleLikeInTree(state.comments, comment.id, comment.liked)
    };
}

/* Optimistic like */
async function likeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    }
}

/* Optimistic unlike */
async function unlikeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    try {
        await api.comments.unlike({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    }
}

/* Report a comment */
async function reportComment({api, data: comment}: {api: GhostApi, data: {id: string}}) {
    await api.comments.report({comment});
    return {};
}

/* Delete a comment or reply */
async function deleteComment({state, api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    await api.comments.edit({comment: {id: comment.id, status: 'deleted'}});
    const commentToDelete = state.comments.find(c => c.id === comment.id);
    if (commentToDelete && (!commentToDelete.replies?.length)) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }
    return {
        comments: deleteFromTree(state.comments, comment.id),
        commentCount: state.commentCount - 1
    };
}

/* Edit an existing comment */
async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const data = await api.comments.edit({comment});
    const updated = data.comments[0];
    return {
        comments: updateCommentTree(state.comments, updated, parent)
    };
}

/* Update member profile */
async function updateMember({data, state, api}: {data: {name: string, expertise: string}, state: EditableAppContext, api: GhostApi}) {
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
            if (!member) throw new Error('Failed to update member');
            return {member, success: true};
        } catch (err) {
            return {success: false, error: err};
        }
    }
    return null;
}

/* Popup handling */
function openPopup({data}: {data: Page}) {
    return {popup: data};
}
function closePopup() {
    return {popup: null};
}

/* Open comment form, loading replies if needed */
async function openCommentForm({data: newForm, api, state}: {data: OpenCommentForm, api: GhostApi, state: EditableAppContext}) {
    let otherStateChanges = {};

    const topLevelId = newForm.parent_id || newForm.id;
    if (newForm.type === 'reply' && !state.openCommentForms.some(f => f.id === topLevelId || f.parent_id === topLevelId)) {
        const comment = state.comments.find(c => c.id === topLevelId);
        if (comment) {
            const newCommentsState = await loadMoreReplies({state, api, data: {comment, limit: 'all'}, isReply: true});
            otherStateChanges = {...otherStateChanges, ...newCommentsState};
        }
    }

    const openForms = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const existingIdx = openForms.findIndex(f => f.id === newForm.id);
    if (existingIdx > -1) {
        openForms[existingIdx] = newForm;
        return {openCommentForms: openForms, ...otherStateChanges};
    }
    return {openCommentForms: [...openForms, newForm], ...otherStateChanges};
}

/* Highlight handling */
function setHighlightComment({data: commentId}: {data: string | null}) {
    return {commentIdToHighlight: commentId};
}
function highlightComment({data: {commentId}, dispatchAction}: {data: {commentId: string | null}; state: EditableAppContext; dispatchAction: DispatchActionType}) {
    setTimeout(() => dispatchAction('setHighlightComment', null), 3000);
    return {commentIdToHighlight: commentId};
}

/* Form unsaved changes */
function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string, hasUnsavedChanges: boolean}, state: EditableAppContext}) {
    const updatedForms = state.openCommentForms.map(f => f.id === id ? {...f, hasUnsavedChanges} : {...f});
    return {openCommentForms: updatedForms};
}

/* Close a comment form */
function closeCommentForm({data: id, state}: {data: string, state: EditableAppContext}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

/* Scroll target */
function setScrollTarget({data: commentId}: {data: string | null}) {
    return {commentIdToScrollTo: commentId};
}

/* Sync actions */
export const SyncActions = {
    openPopup,
    closePopup,
    closeCommentForm,
    setCommentFormHasUnsavedChanges,
    setScrollTarget
};
export type SyncActionType = keyof typeof SyncActions;

/* Async actions */
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

/* Main async handler */
export async function ActionHandler({action, data, state, api, adminApi, options, dispatchAction}: {action: ActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi, dispatchAction: DispatchActionType}): Promise<Partial<EditableAppContext>> {
    const handler = Actions[action];
    if (handler) {
        return (await handler({data, state, api, adminApi, options, dispatchAction} as any)) || {};
    }
    return {};
}

/* Main sync handler */
export function SyncActionHandler({action, data, state, api, adminApi, options}: {action: SyncActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    if (handler) {
        return handler({data, state, api, adminApi, options} as any) || {};
    }
    return {};
}