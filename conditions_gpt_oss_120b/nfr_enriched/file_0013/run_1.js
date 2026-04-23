import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/* Helper utilities -------------------------------------------------------- */

function getAdminApi(state: EditableAppContext): AdminApi | undefined {
    return state.admin && state.adminApi ? state.adminApi : undefined;
}

function dedupeComments(comments: Comment[]): Comment[] {
    return comments.filter((c, i, self) => self.findIndex(s => s.id === c.id) === i);
}

function updateCommentArray(comments: Comment[], updater: (c: Comment) => Comment | null): Comment[] {
    return comments.map(c => updater(c)).filter((c): c is Comment => c !== null);
}

/* Action implementations -------------------------------------------------- */

async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?: string}): Promise<Partial<EditableAppContext>> {
    const page = (state.pagination?.page ?? 0) + 1;
    const adminApi = getAdminApi(state);
    const data = adminApi
        ? await adminApi.browse({page, postId: options.postId, order: order ?? state.order, memberUuid: state.member?.uuid})
        : await api.comments.browse({page, postId: options.postId, order: order ?? state.order});

    const merged = [...state.comments, ...data.comments];
    return {
        comments: dedupeComments(merged),
        pagination: data.meta.pagination
    };
}

function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {commentsIsLoading: isLoading};
}

async function setOrder({state, data: {order}, options, api, dispatchAction}: {state: EditableAppContext, data: {order: string}, options: CommentsOptions, api: GhostApi, dispatchAction: DispatchActionType}) {
    dispatchAction('setCommentsIsLoading', true);
    const adminApi = getAdminApi(state);
    try {
        const data = adminApi
            ? await adminApi.browse({page: 1, postId: options.postId, order, memberUuid: state.member?.uuid})
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

/* Load more replies ------------------------------------------------------- */

async function fetchReplies({state, api, comment, limit, afterReplyId, isReply}: {state: EditableAppContext, api: GhostApi, comment: Comment, limit: number, afterReplyId?: string, isReply: boolean}) {
    const adminApi = getAdminApi(state);
    if (adminApi && !isReply) {
        return await adminApi.replies({commentId: comment.id, afterReplyId, limit, memberUuid: state.member?.uuid});
    }
    return await api.comments.replies({commentId: comment.id, afterReplyId, limit});
}

async function loadAllReplies({state, api, comment}: {state: EditableAppContext, api: GhostApi, comment: Comment}): Promise<Comment[]> {
    let afterReplyId: string | undefined = comment.replies?.[comment.replies.length - 1]?.id;
    const all: Comment[] = [];
    let hasMore = true;

    while (hasMore) {
        const data = await fetchReplies({state, api, comment, limit: 100, afterReplyId, isReply: false});
        all.push(...data.comments);
        hasMore = !!data.meta.pagination.next;
        afterReplyId = data.comments?.[data.comments.length - 1]?.id;
    }
    return all;
}

async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const afterReplyId = comment.replies?.[comment.replies.length - 1]?.id;
    const requestLimit = limit === 'all' ? undefined : (limit as number) ?? 100;

    const replies = limit === 'all'
        ? await loadAllReplies({state, api, comment})
        : (await fetchReplies({state, api, comment, limit: requestLimit, afterReplyId, isReply})).comments;

    return {
        comments: state.comments.map(c => c.id === comment.id ? {...comment, replies: [...comment.replies, ...replies]} : c)
    };
}

/* Comment mutations ------------------------------------------------------- */

async function addComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, data: AddComment}) {
    const result = await api.comments.add({comment});
    const newComment = result.comments[0];
    return {
        comments: [newComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}) {
    const replyWithParent = {...reply, parent_id: parent.id};
    const result = await api.comments.add({comment: replyWithParent});
    const savedReply = result.comments[0];

    return {
        comments: state.comments.map(c => c.id === parent.id
            ? {
                ...parent,
                replies: [...parent.replies, savedReply],
                count: {...parent.count, replies: parent.count.replies + 1}
            }
            : c),
        commentCount: state.commentCount + 1
    };
}

/* Status handling -------------------------------------------------------- */

function toggleCommentStatus(comments: Comment[], targetId: string, status: string): Comment[] {
    return updateCommentArray(comments, c => {
        if (c.id === targetId) {
            return {...c, status};
        }
        const updatedReplies = c.replies?.map(r => r.id === targetId ? {...r, status} : r);
        return updatedReplies ? {...c, replies: updatedReplies} : c;
    });
}

async function hideComment({state, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    const adminApi = getAdminApi(state);
    if (adminApi) {
        await adminApi.hideComment(comment.id);
    }
    return {
        comments: toggleCommentStatus(state.comments, comment.id, 'hidden'),
        commentCount: state.commentCount - 1
    };
}

async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    const adminApi = getAdminApi(state);
    if (adminApi) {
        await adminApi.showComment({id: comment.id});
    }
    const data = adminApi
        ? await adminApi.read({commentId: comment.id, memberUuid: state.member?.uuid})
        : await api.comments.read(comment.id);
    const updated = data.comments[0];

    const replace = (c: Comment) => c.id === comment.id ? updated : {
        ...c,
        replies: c.replies?.map(r => r.id === comment.id ? updated : r) ?? c.replies
    };
    return {
        comments: state.comments.map(replace),
        commentCount: state.commentCount + 1
    };
}

/* Like handling ---------------------------------------------------------- */

async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    const adjust = (c: Comment) => ({
        ...c,
        liked: comment.liked,
        count: {...c.count, likes: comment.liked ? c.count.likes + 1 : c.count.likes - 1}
    });

    const updated = state.comments.map(c => {
        if (c.id === comment.id) {
            return adjust(c);
        }
        const updatedReplies = c.replies?.map(r => r.id === comment.id ? adjust(r) : r);
        return updatedReplies ? {...c, replies: updatedReplies} : c;
    });

    return {comments: updated};
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

/* Reporting & Deletion ---------------------------------------------------- */

async function reportComment({api, data: comment}: {api: GhostApi, data: {id: string}}) {
    await api.comments.report({comment});
    return {};
}

async function deleteComment({state, api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    await api.comments.edit({comment: {id: comment.id, status: 'deleted'}});
    const target = state.comments.find(c => c.id === comment.id);
    if (target && (!target.replies?.length)) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    const filtered = state.comments.map(top => {
        if (top.id === comment.id) {
            return top.replies?.length ? {...top, status: 'deleted'} : null;
        }
        const newReplies = top.replies?.filter(r => r.id !== comment.id) ?? top.replies;
        if (newReplies?.length !== top.replies?.length && top.count?.replies) {
            top.count.replies -= 1;
        }
        return {...top, replies: newReplies};
    }).filter((c): c is Comment => c !== null);

    return {
        comments: filtered,
        commentCount: state.commentCount - 1
    };
}

/* Editing ---------------------------------------------------------------- */

async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const result = await api.comments.edit({comment});
    const updated = result.comments[0];

    const replace = (c: Comment) => {
        if (parent && parent.id === c.id) {
            return {...c, replies: c.replies?.map(r => r.id === updated.id ? updated : r) ?? c.replies};
        }
        return c.id === updated.id ? updated : c;
    };
    return {comments: state.comments.map(replace)};
}

/* Member update ----------------------------------------------------------- */

async function updateMember({data, state, api}: {data: {name: string, expertise: string}, state: EditableAppContext, api: GhostApi}) {
    const patch: {name?: string; expertise?: string} = {};
    if (data.name && data.name !== state.member?.name) {
        patch.name = data.name;
    }
    if (data.expertise !== undefined && data.expertise !== state.member?.expertise) {
        patch.expertise = data.expertise;
    }

    if (Object.keys(patch).length === 0) {
        return null;
    }

    try {
        const member = await api.member.update(patch);
        if (!member) throw new Error('Failed to update member');
        return {member, success: true};
    } catch (err) {
        return {success: false, error: err};
    }
}

/* UI actions -------------------------------------------------------------- */

function openPopup({data}: {data: Page}) {
    return {popup: data};
}

function closePopup() {
    return {popup: null};
}

async function openCommentForm({data: newForm, api, state}: {data: OpenCommentForm, api: GhostApi, state: EditableAppContext}) {
    let extraChanges: Partial<EditableAppContext> = {};

    if (newForm.type === 'reply') {
        const topId = newForm.parent_id || newForm.id;
        const alreadyOpen = state.openCommentForms.some(f => f.id === topId || f.parent_id === topId);
        if (!alreadyOpen) {
            const parent = state.comments.find(c => c.id === topId);
            if (parent) {
                const more = await loadMoreReplies({state, api, data: {comment: parent, limit: 'all'}, isReply: true});
                extraChanges = {...extraChanges, ...more};
            }
        }
    }

    const activeForms = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const existingIdx = activeForms.findIndex(f => f.id === newForm.id);

    if (existingIdx > -1) {
        activeForms[existingIdx] = newForm;
        return {openCommentForms: activeForms, ...extraChanges};
    }
    return {openCommentForms: [...activeForms, newForm], ...extraChanges};
}

function setHighlightComment({data: commentId}: {data: string | null}) {
    return {commentIdToHighlight: commentId};
}

function highlightComment({data: {commentId}, dispatchAction}: {data: {commentId: string | null}; state: EditableAppContext; dispatchAction: DispatchActionType}) {
    setTimeout(() => dispatchAction('setHighlightComment', null), 3000);
    return {commentIdToHighlight: commentId};
}

function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string, hasUnsavedChanges: boolean}, state: EditableAppContext}) {
    const updated = state.openCommentForms.map(f => f.id === id ? {...f, hasUnsavedChanges} : f);
    return {openCommentForms: updated};
}

function closeCommentForm({data: id, state}: {data: string, state: EditableAppContext}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

function setScrollTarget({data: commentId}: {data: string | null}) {
    return {commentIdToScrollTo: commentId};
}

/* Exported collections ---------------------------------------------------- */

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
        return (await handler({data, state, api, adminApi, options, dispatchAction} as any)) || {};
    }
    return {};
}

/** Handle sync actions in the App, returns updated state */
export function SyncActionHandler({action, data, state, api, adminApi, options}: {action: SyncActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    if (handler) {
        return handler({data, state, api, adminApi, options} as any) || {};
    }
    return {};
}