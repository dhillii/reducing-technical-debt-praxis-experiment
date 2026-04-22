import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/** Helper to choose the correct browse method based on admin context */
function getBrowseFn(state: EditableAppContext, api: GhostApi) {
    return state.adminApi?.browse?.bind(state.adminApi) ?? api.comments.browse.bind(api.comments);
}

/** Helper to choose the correct read method based on admin context */
function getReadFn(state: EditableAppContext, api: GhostApi) {
    return state.adminApi?.read?.bind(state.adminApi) ?? api.comments.read.bind(api.comments);
}

/** Helper to choose the correct replies method based on admin context */
function getRepliesFn(state: EditableAppContext, api: GhostApi, isReply: boolean) {
    return (state.adminApi && !isReply)
        ? state.adminApi.replies.bind(state.adminApi)
        : api.comments.replies.bind(api.comments);
}

/** Update a comment (or reply) inside a list */
function updateCommentList(comments: Comment[], targetId: string, updater: (c: Comment) => Comment): Comment[] {
    return comments.map(c => c.id === targetId ? updater(c) : c);
}

/** Update replies of a specific parent comment */
function updateReplies(comments: Comment[], parentId: string, newReplies: Comment[]): Comment[] {
    return comments.map(c => {
        if (c.id === parentId) {
            return {...c, replies: [...c.replies, ...newReplies]};
        }
        return c;
    });
}

/** Deduplicate comments by id while preserving order */
function dedupeComments(comments: Comment[]): Comment[] {
    return comments.filter((c, i, self) => self.findIndex(t => t.id === c.id) === i);
}

/** Load more top‑level comments */
async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?: string}): Promise<Partial<EditableAppContext>> {
    const page = (state.pagination?.page ?? 0) + 1;
    const browse = getBrowseFn(state, api);
    const data = await browse({page, postId: options.postId, order: order ?? state.order, memberUuid: state.member?.uuid});
    const deduped = dedupeComments([...state.comments, ...data.comments]);

    return {
        comments: deduped,
        pagination: data.meta.pagination
    };
}

/** Set loading flag for comments */
function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {commentsIsLoading: isLoading};
}

/** Change comment ordering */
async function setOrder({state, data: {order}, options, api, dispatchAction}: {state: EditableAppContext, data: {order: string}, options: CommentsOptions, api: GhostApi, dispatchAction: DispatchActionType}) {
    dispatchAction('setCommentsIsLoading', true);
    try {
        const browse = getBrowseFn(state, api);
        const data = await browse({page: 1, postId: options.postId, order, memberUuid: state.member?.uuid});
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

/** Load more replies for a comment */
async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const fetchReplies = getRepliesFn(state, api, isReply);
    let afterReplyId = comment.replies?.[comment.replies.length - 1]?.id;
    let allComments: Comment[] = [];

    if (limit === 'all') {
        let hasMore = true;
        while (hasMore) {
            const data = await fetchReplies({commentId: comment.id, afterReplyId, limit: 100, memberUuid: state.member?.uuid});
            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next;
            afterReplyId = data.comments?.[data.comments.length - 1]?.id ?? afterReplyId;
        }
    } else {
        const data = await fetchReplies({commentId: comment.id, afterReplyId, limit: limit as number ?? 100, memberUuid: state.member?.uuid});
        allComments = data.comments;
    }

    return {comments: updateReplies(state.comments, comment.id, allComments)};
}

/** Add a new top‑level comment */
async function addComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, data: AddComment}) {
    const {comments} = await api.comments.add({comment});
    const newComment = comments[0];
    return {
        comments: [newComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

/** Add a reply to an existing comment */
async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}) {
    reply.parent_id = parent.id;
    const {comments} = await api.comments.add({comment: reply});
    const newReply = comments[0];

    const updated = state.comments.map(c => {
        if (c.id === parent.id) {
            return {
                ...parent,
                replies: [...parent.replies, newReply],
                count: {...parent.count, replies: parent.count.replies + 1}
            };
        }
        return c;
    });

    return {comments: updated, commentCount: state.commentCount + 1};
}

/** Hide a comment (admin only) */
async function hideComment({state, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    await state.adminApi?.hideComment(comment.id);
    const updated = state.comments.map(c => {
        const replies = c.replies.map(r => r.id === comment.id ? {...r, status: 'hidden'} : r);
        return c.id === comment.id ? {...c, status: 'hidden', replies} : {...c, replies};
    });
    return {comments: updated, commentCount: state.commentCount - 1};
}

/** Show a hidden comment (admin only) */
async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    await state.adminApi?.showComment({id: comment.id});
    const read = getReadFn(state, api);
    const {comments} = await read({commentId: comment.id, memberUuid: state.member?.uuid});
    const updatedComment = comments[0];

    const updated = state.comments.map(c => {
        const replies = c.replies.map(r => r.id === comment.id ? updatedComment : r);
        return c.id === comment.id ? updatedComment : {...c, replies};
    });

    return {comments: updated, commentCount: state.commentCount + 1};
}

/** Update like state for a comment or reply */
async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    const updated = state.comments.map(c => {
        const replies = c.replies.map(r => {
            if (r.id === comment.id) {
                const likesDelta = comment.liked ? 1 : -1;
                return {...r, liked: comment.liked, count: {...r.count, likes: r.count.likes + likesDelta}};
            }
            return r;
        });

        if (c.id === comment.id) {
            const likesDelta = comment.liked ? 1 : -1;
            return {...c, liked: comment.liked, replies, count: {...c.count, likes: c.count.likes + likesDelta}};
        }

        return {...c, replies};
    });

    return {comments: updated};
}

/** Optimistically like a comment */
async function likeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    }
}

/** Optimistically unlike a comment */
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
    if (target?.replies?.length === 0) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    const updated = state.comments.map(top => {
        if (top.id === comment.id) {
            return top.replies?.length
                ? {...top, status: 'deleted'}
                : null;
        }

        const originalLen = top.replies.length;
        const filteredReplies = top.replies.filter(r => r.id !== comment.id);
        if (originalLen !== filteredReplies.length && top.count?.replies) {
            top.count.replies -= 1;
        }

        return {...top, replies: filteredReplies};
    }).filter(Boolean) as Comment[];

    return {comments: updated, commentCount: state.commentCount - 1};
}

/** Edit an existing comment */
async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const {comments} = await api.comments.edit({comment});
    const updated = comments[0];

    const newState = state.comments.map(c => {
        if (parent?.id === c.id) {
            return {...c, replies: c.replies.map(r => r.id === updated.id ? updated : r)};
        }
        return c.id === updated.id ? updated : c;
    });

    return {comments: newState};
}

/** Update member profile */
async function updateMember({data, state, api}: {data: {name: string, expertise: string}, state: EditableAppContext, api: GhostApi}) {
    const {name, expertise} = data;
    const patch: {name?: string; expertise?: string} = {};

    if (name && state.member?.name !== name) patch.name = name;
    if (expertise !== undefined && state.member?.expertise !== expertise) patch.expertise = expertise;

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

/** Popup handling */
function openPopup({data}: {data: Page}) {
    return {popup: data};
}
function closePopup() {
    return {popup: null};
}

/** Open a comment form, optionally loading all replies for the parent */
async function openCommentForm({data: newForm, api, state}: {data: OpenCommentForm, api: GhostApi, state: EditableAppContext}) {
    let otherStateChanges = {};

    const topLevelId = newForm.parent_id || newForm.id;
    if (newForm.type === 'reply' && !state.openCommentForms.some(f => f.id === topLevelId || f.parent_id === topLevelId)) {
        const parent = state.comments.find(c => c.id === topLevelId);
        if (parent) {
            const newCommentsState = await loadMoreReplies({state, api, data: {comment: parent, limit: 'all'}, isReply: true});
            otherStateChanges = {...otherStateChanges, ...newCommentsState};
        }
    }

    const filtered = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const idx = filtered.findIndex(f => f.id === newForm.id);
    if (idx > -1) {
        filtered[idx] = newForm;
        return {openCommentForms: filtered, ...otherStateChanges};
    }
    return {openCommentForms: [...filtered, newForm], ...otherStateChanges};
}

/** Highlight handling */
function setHighlightComment({data: commentId}: {data: string | null}) {
    return {commentIdToHighlight: commentId};
}
function highlightComment({data: {commentId}, dispatchAction}: {data: {commentId: string | null}; state: EditableAppContext; dispatchAction: DispatchActionType}) {
    setTimeout(() => dispatchAction('setHighlightComment', null), 3000);
    return {commentIdToHighlight: commentId};
}

/** Form change tracking */
function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string, hasUnsavedChanges: boolean}, state: EditableAppContext}) {
    const updated = state.openCommentForms.map(f => f.id === id ? {...f, hasUnsavedChanges} : {...f});
    return {openCommentForms: updated};
}
function closeCommentForm({data: id, state}: {data: string, state: EditableAppContext}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

/** Scroll target */
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

/** Async actions */
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

/** Handle async actions */
export async function ActionHandler({action, data, state, api, adminApi, options, dispatchAction}: {action: ActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi, dispatchAction: DispatchActionType}): Promise<Partial<EditableAppContext>> {
    const handler = Actions[action];
    if (handler) {
        return (await handler({data, state, api, adminApi, options, dispatchAction} as any)) ?? {};
    }
    return {};
}

/** Handle sync actions */
export function SyncActionHandler({action, data, state, api, adminApi, options}: {action: SyncActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    if (handler) {
        return handler({data, state, api, adminApi, options} as any) ?? {};
    }
    return {};
}