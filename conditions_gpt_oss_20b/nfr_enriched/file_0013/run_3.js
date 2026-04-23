import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/** Helper: get the last reply id of a comment, if any */
function getLastReplyId(comment: Comment): string | undefined {
    return comment.replies?.[comment.replies.length - 1]?.id;
}

/** Helper: fetch replies for a comment, using admin or public API */
async function fetchRepliesForComment(state: EditableAppContext, api: GhostApi, comment: Comment, afterReplyId: string | undefined, limit: number, isReply: boolean) {
    if (state.admin && state.adminApi && !isReply) {
        return await state.adminApi.replies({
            commentId: comment.id,
            afterReplyId,
            limit,
            memberUuid: state.member?.uuid
        });
    }
    return await api.comments.replies({
        commentId: comment.id,
        afterReplyId,
        limit
    });
}

/** Helper: accumulate all replies for a comment */
async function accumulateAllReplies(state: EditableAppContext, api: GhostApi, comment: Comment, isReply: boolean) {
    const all: Comment[] = [];
    let afterReplyId = getLastReplyId(comment);
    let hasMore = true;
    while (hasMore) {
        const data = await fetchRepliesForComment(state, api, comment, afterReplyId, 100, isReply);
        all.push(...data.comments);
        hasMore = !!data.meta.pagination.next;
        if (data.comments?.length) {
            afterReplyId = data.comments[data.comments.length - 1]?.id;
        } else {
            hasMore = false;
        }
    }
    return all;
}

/** Helper: map comments, replacing a target comment with updated data */
function mapCommentsWithUpdatedComment(comments: Comment[], targetId: string, updated: Comment): Comment[] {
    return comments.map(c => (c.id === targetId ? updated : c));
}

/** Helper: map comments, replacing a target comment's replies */
function mapCommentsWithUpdatedReplies(comments: Comment[], targetId: string, newReplies: Comment[]): Comment[] {
    return comments.map(c => {
        if (c.id !== targetId) return c;
        return {...c, replies: [...c.replies, ...newReplies]};
    });
}

/** Helper: map comments, updating like state for a comment or reply */
function mapCommentsWithLikeState(comments: Comment[], targetId: string, liked: boolean): Comment[] {
    return comments.map(c => {
        const replies = c.replies?.map(r => {
            if (r.id !== targetId) return r;
            const delta = liked ? 1 : -1;
            return {
                ...r,
                liked,
                count: {...r.count, likes: r.count.likes + delta}
            };
        }) ?? [];
        if (c.id === targetId) {
            const delta = liked ? 1 : -1;
            return {
                ...c,
                liked,
                count: {...c.count, likes: c.count.likes + delta},
                replies
            };
        }
        return {...c, replies};
    });
}

/** Helper: map comments, updating status for a comment or reply */
function mapCommentsWithStatus(comments: Comment[], targetId: string, status: string): Comment[] {
    return comments.map(c => {
        const replies = c.replies?.map(r => (r.id === targetId ? {...r, status} : r)) ?? [];
        if (c.id === targetId) {
            return {...c, status, replies};
        }
        return {...c, replies};
    });
}

/** Helper: remove a comment from state, returning new array */
function removeCommentFromState(comments: Comment[], commentId: string): Comment[] {
    return comments.filter(c => c.id !== commentId);
}

/** Helper: decrement reply count on parent comment */
function decrementParentReplyCount(comments: Comment[], parentId: string): Comment[] {
    return comments.map(c => {
        if (c.id !== parentId) return c;
        const newCount = {...c.count, replies: (c.count.replies ?? 0) - 1};
        return {...c, count: newCount};
    });
}

/** Load more comments for a post */
async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?: string}): Promise<Partial<EditableAppContext>> {
    const page = state.pagination?.page ? state.pagination.page + 1 : 1;
    const data = state.admin && state.adminApi
        ? await state.adminApi.browse({page, postId: options.postId, order: order ?? state.order, memberUuid: state.member?.uuid})
        : await api.comments.browse({page, postId: options.postId, order: order ?? state.order});
    const updated = [...state.comments, ...data.comments];
    const deduped = updated.filter((c, i, self) => self.findIndex(x => x.id === c.id) === i);
    return {comments: deduped, pagination: data.meta.pagination};
}

/** Set loading flag for comments */
function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {commentsIsLoading: isLoading};
}

/** Set order for comments */
async function setOrder({state, data: {order}, options, api, dispatchAction}: {state: EditableAppContext, data: {order: string}, options: CommentsOptions, api: GhostApi, dispatchAction: DispatchActionType}) {
    dispatchAction('setCommentsIsLoading', true);
    try {
        const data = state.admin && state.adminApi
            ? await state.adminApi.browse({page: 1, postId: options.postId, order, memberUuid: state.member?.uuid})
            : await api.comments.browse({page: 1, postId: options.postId, order});
        return {comments: [...data.comments], pagination: data.meta.pagination, order, commentsIsLoading: false};
    } catch (error) {
        console.error('Failed to set order:', error);
        state.commentsIsLoading = false;
        throw error;
    }
}

/** Load more replies for a comment */
async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const afterReplyId = getLastReplyId(comment);
    let allComments: Comment[] = [];
    if (limit === 'all') {
        allComments = await accumulateAllReplies(state, api, comment, isReply);
    } else {
        const data = await fetchRepliesForComment(state, api, comment, afterReplyId, limit as number ?? 100, isReply);
        allComments = data.comments;
    }
    return {comments: mapCommentsWithUpdatedReplies(state.comments, comment.id, allComments)};
}

/** Add a new comment */
async function addComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, data: AddComment}) {
    const data = await api.comments.add({comment});
    const newComment = data.comments[0];
    return {comments: [newComment, ...state.comments], commentCount: state.commentCount + 1};
}

/** Add a reply to a comment */
async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}) {
    const comment = reply;
    comment.parent_id = parent.id;
    const data = await api.comments.add({comment});
    const newReply = data.comments[0];
    return {
        comments: mapCommentsWithUpdatedComment(state.comments, parent.id, {
            ...parent,
            replies: [...parent.replies, newReply],
            count: {...parent.count, replies: parent.count.replies + 1}
        }),
        commentCount: state.commentCount + 1
    };
}

/** Hide a comment or reply */
async function hideComment({state, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.hideComment(comment.id);
    }
    return {
        comments: mapCommentsWithStatus(state.comments, comment.id, 'hidden'),
        commentCount: state.commentCount - 1
    };
}

/** Show a comment or reply */
async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.showComment({id: comment.id});
    }
    const data = state.admin && state.adminApi
        ? await state.adminApi.read({commentId: comment.id, memberUuid: state.member?.uuid})
        : await api.comments.read(comment.id);
    const updatedComment = data.comments[0];
    return {
        comments: mapCommentsWithUpdatedComment(state.comments, comment.id, updatedComment),
        commentCount: state.commentCount + 1
    };
}

/** Update like state for a comment or reply */
async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {comments: mapCommentsWithLikeState(state.comments, comment.id, comment.liked)};
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

/** Delete a comment or reply */
async function deleteComment({state, api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    await api.comments.edit({comment: {id: comment.id, status: 'deleted'}});
    const target = state.comments.find(c => c.id === comment.id);
    if (target && (!target.replies || target.replies.length === 0)) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }
    let updated = state.comments.map(c => {
        if (c.id === comment.id) {
            return c.replies?.length
                ? {...c, status: 'deleted'}
                : null;
        }
        const replies = c.replies?.filter(r => r.id !== comment.id) ?? [];
        const hasDeleted = replies.length !== c.replies?.length;
        if (hasDeleted && c.count?.replies) {
            c.count.replies = c.count.replies - 1;
        }
        return {...c, replies};
    }).filter(Boolean) as Comment[];
    return {comments: updated, commentCount: state.commentCount - 1};
}

/** Edit a comment or reply */
async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const data = await api.comments.edit({comment});
    const updated = data.comments[0];
    return {
        comments: state.comments.map(c => {
            if (parent && parent.id === c.id) {
                return {
                    ...c,
                    replies: c.replies?.map(r => (r.id === comment.id ? updated : r)) ?? []
                };
            }
            return c.id === comment.id ? updated : c;
        })
    };
}

/** Update member profile */
async function updateMember({data, state, api}: {data: {name: string, expertise: string}, state: EditableAppContext, api: GhostApi}) {
    const {name, expertise} = data;
    const patch: {name?: string; expertise?: string} = {};
    if (name && state.member?.name !== name) patch.name = name;
    if (expertise !== undefined && state.member?.expertise !== expertise) patch.expertise = expertise;
    if (!Object.keys(patch).length) return null;
    try {
        const member = await api.member.update(patch);
        if (!member) throw new Error('Failed to update member');
        return {member, success: true};
    } catch (err) {
        return {success: false, error: err};
    }
}

/** Open a popup */
function openPopup({data}: {data: Page}) {
    return {popup: data};
}

/** Close a popup */
function closePopup() {
    return {popup: null};
}

/** Open a comment form */
async function openCommentForm({data: newForm, api, state}: {data: OpenCommentForm, api: GhostApi, state: EditableAppContext}) {
    let otherStateChanges: Partial<EditableAppContext> = {};
    const topLevelId = newForm.parent_id ?? newForm.id;
    if (newForm.type === 'reply' && !state.openCommentForms.some(f => f.id === topLevelId || f.parent_id === topLevelId)) {
        const comment = state.comments.find(c => c.id === topLevelId);
        if (comment) {
            const newState = await loadMoreReplies({state, api, data: {comment, limit: 'all'}, isReply: true});
            otherStateChanges = {...otherStateChanges, ...newState};
        }
    }
    const openForms = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const index = openForms.findIndex(f => f.id === newForm.id);
    if (index > -1) {
        openForms[index] = newForm;
        return {openCommentForms: openForms, ...otherStateChanges};
    }
    return {openCommentForms: [...openForms, newForm], ...otherStateChanges};
}

/** Set comment to highlight */
function setHighlightComment({data: commentId}: {data: string | null}) {
    return {commentIdToHighlight: commentId};
}

/** Highlight a comment temporarily */
function highlightComment({data: {commentId}, dispatchAction}: {data: {commentId: string | null}; state: EditableAppContext; dispatchAction: DispatchActionType}) {
    setTimeout(() => dispatchAction('setHighlightComment', null), 3000);
    return {commentIdToHighlight: commentId};
}

/** Mark a form as having unsaved changes */
function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string; hasUnsavedChanges: boolean}; state: EditableAppContext}) {
    const updated = state.openCommentForms.map(f => f.id === id ? {...f, hasUnsavedChanges} : {...f});
    return {openCommentForms: updated};
}

/** Close a comment form */
function closeCommentForm({data: id, state}: {data: string; state: EditableAppContext}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

/** Set scroll target */
function setScrollTarget({data: commentId}: {data: string | null}) {
    return {commentIdToScrollTo: commentId};
}

/** Sync actions */
export const SyncActions = {
    openPopup,
    closePopup,
    closeCommentForm,
    setCommentFormHasUnsavedChanges,
    setScrollTarget
};

export type SyncActionType = keyof typeof SyncActions;

/** Actions */
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
export async function ActionHandler({action, data, state, api, adminApi, options, dispatchAction}: {action: ActionType; data: any; state: EditableAppContext; options: CommentsOptions; api: GhostApi; adminApi: AdminApi; dispatchAction: DispatchActionType}): Promise<Partial<EditableAppContext>> {
    const handler = Actions[action];
    if (handler) {
        return (await handler({data, state, api, adminApi, options, dispatchAction} as any)) || {};
    }
    return {};
}

/** Handle sync actions in the App, returns updated state */
export function SyncActionHandler({action, data, state, api, adminApi, options}: {action: SyncActionType; data: any; state: EditableAppContext; options: CommentsOptions; api: GhostApi; adminApi: AdminApi}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    if (handler) {
        return handler({data, state, api, adminApi, options} as any) || {};
    }
    return {};
}