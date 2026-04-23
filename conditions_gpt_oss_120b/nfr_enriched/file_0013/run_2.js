import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/**
 * Helper to fetch comments using admin or public API.
 */
async function fetchComments({
    state,
    api,
    options,
    order,
    page
}: {
    state: EditableAppContext;
    api: GhostApi;
    options: CommentsOptions;
    order: string;
    page: number;
}) {
    if (state.admin && state.adminApi) {
        return state.adminApi.browse({
            page,
            postId: options.postId,
            order,
            memberUuid: state.member?.uuid
        });
    }
    return api.comments.browse({
        page,
        postId: options.postId,
        order
    });
}

/**
 * Helper to fetch replies using admin or public API.
 */
async function fetchReplies({
    state,
    api,
    commentId,
    afterReplyId,
    limit,
    isReply
}: {
    state: EditableAppContext;
    api: GhostApi;
    commentId: string;
    afterReplyId?: string;
    limit: number;
    isReply: boolean;
}) {
    if (state.admin && state.adminApi && !isReply) {
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
 * Helper to deduplicate comments by id while preserving order.
 */
function dedupeComments(comments: Comment[]): Comment[] {
    const seen = new Set<string>();
    const result: Comment[] = [];
    for (const c of comments) {
        if (!seen.has(c.id)) {
            seen.add(c.id);
            result.push(c);
        }
    }
    return result;
}

/**
 * Load additional comment pages.
 */
export async function loadMoreComments({
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
    const nextPage = (state.pagination?.page ?? 0) + 1;
    const data = await fetchComments({
        state,
        api,
        options,
        order: order ?? state.order,
        page: nextPage
    });

    const merged = [...state.comments, ...data.comments];
    return {
        comments: dedupeComments(merged),
        pagination: data.meta.pagination
    };
}

/**
 * Set loading flag for comments.
 */
export function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {commentsIsLoading: isLoading};
}

/**
 * Change comment ordering and reload first page.
 */
export async function setOrder({
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
        const data = await fetchComments({
            state,
            api,
            options,
            order,
            page: 1
        });
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
 * Load more replies for a given comment.
 */
export async function loadMoreReplies({
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
    const afterReplyId = comment.replies?.[comment.replies.length - 1]?.id;
    const requestLimit = limit === 'all' ? 100 : (limit as number) ?? 100;

    if (limit === 'all') {
        const all: Comment[] = [];
        let cursor = afterReplyId;
        let hasMore = true;
        while (hasMore) {
            const resp = await fetchReplies({
                state,
                api,
                commentId: comment.id,
                afterReplyId: cursor,
                limit: requestLimit,
                isReply
            });
            all.push(...resp.comments);
            hasMore = !!resp.meta.pagination.next;
            cursor = resp.comments?.[resp.comments.length - 1]?.id;
        }
        return {
            comments: state.comments.map(c =>
                c.id === comment.id
                    ? {...comment, replies: [...comment.replies, ...all]}
                    : c
            )
        };
    }

    const resp = await fetchReplies({
        state,
        api,
        commentId: comment.id,
        afterReplyId,
        limit: requestLimit,
        isReply
    });
    return {
        comments: state.comments.map(c =>
            c.id === comment.id
                ? {...comment, replies: [...comment.replies, ...resp.comments]}
                : c
        )
    };
}

/**
 * Add a new top‑level comment.
 */
export async function addComment({
    state,
    api,
    data: comment
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: AddComment;
}) {
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
export async function addReply({
    state,
    api,
    data: {reply, parent}
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {reply: any; parent: any};
}) {
    reply.parent_id = parent.id;
    const resp = await api.comments.add({comment: reply});
    const newReply = resp.comments[0];
    return {
        comments: state.comments.map(c =>
            c.id === parent.id
                ? {
                      ...parent,
                      replies: [...parent.replies, newReply],
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

/**
 * Hide a comment (admin only).
 */
export async function hideComment({
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
    const update = (c: Comment) => ({
        ...c,
        status: 'hidden',
        replies: c.replies.map(r => (r.id === comment.id ? {...r, status: 'hidden'} : r))
    });
    return {
        comments: state.comments.map(c => (c.id === comment.id ? update(c) : update(c))),
        commentCount: state.commentCount - 1
    };
}

/**
 * Show a previously hidden comment and refresh its content.
 */
export async function showComment({
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
    const readData = state.admin && state.adminApi
        ? await state.adminApi.read({commentId: comment.id, memberUuid: state.member?.uuid})
        : await api.comments.read(comment.id);
    const refreshed = readData.comments[0];

    const replace = (c: Comment) => (c.id === comment.id ? refreshed : {
        ...c,
        replies: c.replies.map(r => (r.id === comment.id ? refreshed : r))
    });

    return {
        comments: state.comments.map(replace),
        commentCount: state.commentCount + 1
    };
}

/**
 * Update like state for a comment and its replies.
 */
export async function updateCommentLikeState({
    state,
    data: {id, liked}
}: {
    state: EditableAppContext;
    data: {id: string; liked: boolean};
}) {
    const update = (c: Comment) => ({
        ...c,
        liked,
        count: {
            ...c.count,
            likes: liked ? c.count.likes + 1 : c.count.likes - 1
        }
    });

    const mapReplies = (replies: Comment[]) =>
        replies.map(r => (r.id === id ? update(r) : r));

    return {
        comments: state.comments.map(c =>
            c.id === id
                ? update(c)
                : {...c, replies: mapReplies(c.replies)}
        )
    };
}

/**
 * Optimistically like a comment.
 */
export async function likeComment({
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
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    }
}

/**
 * Optimistically unlike a comment.
 */
export async function unlikeComment({
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
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    }
}

/**
 * Report a comment as inappropriate.
 */
export async function reportComment({
    api,
    data: comment
}: {
    api: GhostApi;
    data: {id: string};
}) {
    await api.comments.report({comment});
    return {};
}

/**
 * Delete a comment (admin only) and adjust pagination if needed.
 */
export async function deleteComment({
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
        comment: {id: comment.id, status: 'deleted'}
    });

    const target = state.comments.find(c => c.id === comment.id);
    if (target && (!target.replies || target.replies.length === 0)) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    const filterDeleted = (c: Comment) => {
        if (c.id === comment.id) {
            return c.replies.length > 0 ? {...c, status: 'deleted'} : null;
        }
        const filteredReplies = c.replies.filter(r => r.id !== comment.id);
        if (c.replies.length !== filteredReplies.length && c.count?.replies) {
            c.count.replies -= 1;
        }
        return {...c, replies: filteredReplies};
    };

    return {
        comments: state.comments.map(filterDeleted).filter(Boolean) as Comment[],
        commentCount: state.commentCount - 1
    };
}

/**
 * Edit an existing comment.
 */
export async function editComment({
    state,
    api,
    data: {comment, parent}
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {comment: Partial<Comment> & {id: string}; parent?: Comment};
}) {
    const resp = await api.comments.edit({comment});
    const updated = resp.comments[0];

    const replaceInReplies = (replies: Comment[]) =>
        replies.map(r => (r.id === updated.id ? updated : r));

    const replace = (c: Comment) => {
        if (parent && parent.id === c.id) {
            return {...c, replies: replaceInReplies(c.replies)};
        }
        return c.id === updated.id ? updated : c;
    };

    return {
        comments: state.comments.map(replace)
    };
}

/**
 * Update member profile fields.
 */
export async function updateMember({
    data,
    state,
    api
}: {
    data: {name: string; expertise: string};
    state: EditableAppContext;
    api: GhostApi;
}) {
    const {name, expertise} = data;
    const patch: {name?: string; expertise?: string} = {};

    if (name && state.member?.name !== name) {
        patch.name = name;
    }
    if (expertise !== undefined && state.member?.expertise !== expertise) {
        patch.expertise = expertise;
    }

    if (Object.keys(patch).length === 0) {
        return null;
    }

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

/**
 * Open a popup page.
 */
export function openPopup({data}: {data: Page}) {
    return {popup: data};
}

/**
 * Close any open popup.
 */
export function closePopup() {
    return {popup: null};
}

/**
 * Open a comment form, optionally loading all replies for the parent comment.
 */
export async function openCommentForm({
    data: newForm,
    api,
    state
}: {
    data: OpenCommentForm;
    api: GhostApi;
    state: EditableAppContext;
}) {
    let extraState: Partial<EditableAppContext> = {};

    const topLevelId = newForm.parent_id || newForm.id;
    if (
        newForm.type === 'reply' &&
        !state.openCommentForms.some(f => f.id === topLevelId || f.parent_id === topLevelId)
    ) {
        const parentComment = state.comments.find(c => c.id === topLevelId);
        if (parentComment) {
            const moreReplies = await loadMoreReplies({
                state,
                api,
                data: {comment: parentComment, limit: 'all'},
                isReply: true
            });
            extraState = {...extraState, ...moreReplies};
        }
    }

    const activeForms = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const existingIdx = activeForms.findIndex(f => f.id === newForm.id);

    if (existingIdx > -1) {
        activeForms[existingIdx] = newForm;
        return {openCommentForms: activeForms, ...extraState};
    }

    return {openCommentForms: [...activeForms, newForm], ...extraState};
}

/**
 * Set which comment should be highlighted.
 */
export function setHighlightComment({data: commentId}: {data: string | null}) {
    return {commentIdToHighlight: commentId};
}

/**
 * Highlight a comment temporarily.
 */
export function highlightComment({
    data: {commentId},
    dispatchAction
}: {
    data: {commentId: string | null};
    state: EditableAppContext;
    dispatchAction: DispatchActionType;
}) {
    setTimeout(() => {
        dispatchAction('setHighlightComment', null);
    }, 3000);
    return {commentIdToHighlight: commentId};
}

/**
 * Mark a comment form as having unsaved changes.
 */
export function setCommentFormHasUnsavedChanges({
    data: {id, hasUnsavedChanges},
    state
}: {
    data: {id: string; hasUnsavedChanges: boolean};
    state: EditableAppContext;
}) {
    const updated = state.openCommentForms.map(f =>
        f.id === id ? {...f, hasUnsavedChanges} : f
    );
    return {openCommentForms: updated};
}

/**
 * Close a specific comment form.
 */
export function closeCommentForm({
    data: id,
    state
}: {
    data: string;
    state: EditableAppContext;
}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

/**
 * Set the comment to scroll to.
 */
export function setScrollTarget({data: commentId}: {data: string | null}) {
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

export function isSyncAction(action: string): action is SyncActionType {
    return !!(SyncActions as any)[action];
}

/**
 * Dispatch asynchronous actions.
 */
export async function ActionHandler({
    action,
    data,
    state,
    api,
    adminApi,
    options,
    dispatchAction
}: {
    action: ActionType;
    data: any;
    state: EditableAppContext;
    options: CommentsOptions;
    api: GhostApi;
    adminApi: AdminApi;
    dispatchAction: DispatchActionType;
}): Promise<Partial<EditableAppContext>> {
    const handler = Actions[action];
    if (handler) {
        return (await handler({data, state, api, adminApi, options, dispatchAction} as any)) || {};
    }
    return {};
}

/**
 * Dispatch synchronous actions.
 */
export function SyncActionHandler({
    action,
    data,
    state,
    api,
    adminApi,
    options
}: {
    action: SyncActionType;
    data: any;
    state: EditableAppContext;
    options: CommentsOptions;
    api: GhostApi;
    adminApi: AdminApi;
}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    if (handler) {
        return handler({data, state, api, adminApi, options} as any) || {};
    }
    return {};
}