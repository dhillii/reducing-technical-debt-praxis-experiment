import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/** Fetch comments data using the appropriate API */
async function fetchCommentsData(state: EditableAppContext, api: GhostApi, options: CommentsOptions, page: number, order?: string) {
    const adminApi = state.adminApi;
    const memberUuid = state.member?.uuid;
    const browseParams = {page, postId: options.postId, order: order ?? state.order, memberUuid};
    return await (adminApi?.browse(browseParams) ?? api.comments.browse(browseParams));
}

/** Fetch replies data using the appropriate API */
async function fetchRepliesData(state: EditableAppContext, api: GhostApi, comment: Comment, afterReplyId: string | undefined, limit: number, isReply: boolean) {
    const adminApi = state.adminApi;
    const memberUuid = state.member?.uuid;
    const repliesParams = {commentId: comment.id, afterReplyId, limit, memberUuid};
    if (adminApi && !isReply) {
        return await adminApi.replies(repliesParams);
    }
    return await api.comments.replies(repliesParams);
}

/** Load more comments */
export async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?: string}): Promise<Partial<EditableAppContext>> {
    const page = state.pagination?.page ? state.pagination.page + 1 : 1;
    const data = await fetchCommentsData(state, api, options, page, order);
    const updatedComments = [...state.comments, ...data.comments];
    const dedupedComments = updatedComments.filter((comment, index, self) => self.findIndex(c => c.id === comment.id) === index);
    return {comments: dedupedComments, pagination: data.meta.pagination};
}

/** Set comments loading state */
export function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {commentsIsLoading: isLoading};
}

/** Set order and load first page of comments */
export async function setOrder({state, data: {order}, options, api, dispatchAction}: {state: EditableAppContext, data: {order: string}, options: CommentsOptions, api: GhostApi, dispatchAction: DispatchActionType}) {
    dispatchAction('setCommentsIsLoading', true);
    try {
        const data = await fetchCommentsData(state, api, options, 1, order);
        return {comments: [...data.comments], pagination: data.meta.pagination, order, commentsIsLoading: false};
    } catch (error) {
        console.error('Failed to set order:', error); // eslint-disable-line no-console
        state.commentsIsLoading = false;
        throw error;
    }
}

/** Load more replies for a comment */
export async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const afterReplyId = comment.replies?.[comment.replies.length - 1]?.id;
    const allComments: Comment[] = [];
    if (limit === 'all') {
        let hasMore = true;
        while (hasMore) {
            const data = await fetchRepliesData(state, api, comment, afterReplyId, 100, isReply);
            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next;
            if (data.comments?.length) {
                afterReplyId = data.comments[data.comments.length - 1]?.id;
            } else {
                hasMore = false;
            }
        }
    } else {
        const data = await fetchRepliesData(state, api, comment, afterReplyId, limit as number ?? 100, isReply);
        allComments.push(...data.comments);
    }
    return {
        comments: state.comments.map(c => c.id === comment.id ? {...comment, replies: [...comment.replies, ...allComments]} : c)
    };
}

/** Add a new comment */
export async function addComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, data: AddComment}) {
    const data = await api.comments.add({comment});
    const newComment = data.comments[0];
    return {comments: [newComment, ...state.comments], commentCount: state.commentCount + 1};
}

/** Add a reply to a comment */
export async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}) {
    const comment = reply;
    comment.parent_id = parent.id;
    const data = await api.comments.add({comment});
    const newReply = data.comments[0];
    return {
        comments: state.comments.map(c => c.id === parent.id ? {...parent, replies: [...parent.replies, newReply], count: {...parent.count, replies: parent.count.replies + 1}} : c),
        commentCount: state.commentCount + 1
    };
}

/** Hide a comment */
export async function hideComment({state, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    await state.adminApi?.hideComment(comment.id);
    return {
        comments: state.comments.map(c => {
            const replies = c.replies.map(r => r.id === comment.id ? {...r, status: 'hidden'} : r);
            if (c.id === comment.id) {
                return {...c, status: 'hidden', replies};
            }
            return {...c, replies};
        }),
        commentCount: state.commentCount - 1
    };
}

/** Show a comment */
export async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    await state.adminApi?.showComment({id: comment.id});
    const data = await (state.adminApi?.read({commentId: comment.id, memberUuid: state.member?.uuid}) ?? api.comments.read(comment.id));
    const updatedComment = data.comments[0];
    return {
        comments: state.comments.map(c => {
            const replies = c.replies.map(r => r.id === comment.id ? updatedComment : r);
            if (c.id === comment.id) {
                return updatedComment;
            }
            return {...c, replies};
        }),
        commentCount: state.commentCount + 1
    };
}

/** Update like state of a comment */
export async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: state.comments.map(c => {
            const replies = c.replies.map(r => r.id === comment.id ? {...r, liked: comment.liked, count: {...r.count, likes: comment.liked ? r.count.likes + 1 : r.count.likes - 1}} : r);
            if (c.id === comment.id) {
                return {...c, liked: comment.liked, replies, count: {...c.count, likes: comment.liked ? c.count.likes + 1 : c.count.likes - 1}};
            }
            return {...c, replies};
        })
    };
}

/** Like a comment */
export async function likeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    }
}

/** Unlike a comment */
export async function unlikeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    try {
        await api.comments.unlike({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    }
}

/** Report a comment */
export async function reportComment({api, data: comment}: {api: GhostApi, data: {id: string}}) {
    await api.comments.report({comment});
    return {};
}

/** Delete a comment */
export async function deleteComment({state, api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    await api.comments.edit({comment: {id: comment.id, status: 'deleted'}});
    const commentToDelete = state.comments.find(c => c.id === comment.id);
    if (commentToDelete && (!commentToDelete.replies || commentToDelete.replies.length === 0)) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }
    return {
        comments: state.comments.map(topLevelComment => {
            if (topLevelComment.id === comment.id) {
                if (topLevelComment.replies.length > 0) {
                    return {...topLevelComment, status: 'deleted'};
                }
                return null;
            }
            const originalLength = topLevelComment.replies.length;
            const updatedReplies = topLevelComment.replies.filter(r => r.id !== comment.id);
            const hasDeletedReply = originalLength !== updatedReplies.length;
            const updatedTopLevelComment = {...topLevelComment, replies: updatedReplies};
            if (hasDeletedReply && topLevelComment.count?.replies) {
                topLevelComment.count.replies -= 1;
            }
            return updatedTopLevelComment;
        }).filter(Boolean),
        commentCount: state.commentCount - 1
    };
}

/** Edit a comment */
export async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const data = await api.comments.edit({comment});
    const updatedComment = data.comments[0];
    return {
        comments: state.comments.map(c => {
            if (parent && parent.id === c.id) {
                return {...c, replies: c.replies.map(r => r.id === comment.id ? updatedComment : r)};
            }
            if (c.id === comment.id) {
                return updatedComment;
            }
            return c;
        })
    };
}

/** Update member profile */
export async function updateMember({data, state, api}: {data: {name: string, expertise: string}, state: EditableAppContext, api: GhostApi}) {
    const {name, expertise} = data;
    const patchData: {name?: string; expertise?: string} = {};
    if (name && state?.member?.name !== name) patchData.name = name;
    if (expertise !== undefined && state?.member?.expertise !== expertise) patchData.expertise = expertise;
    if (Object.keys(patchData).length > 0) {
        try {
            const member = await api.member.update(patchData);
            if (!member) throw new Error('Failed to update member');
            return {member, success: true};
        } catch (err) {
            return {success: false, error: err};
        }
    }
    return null;
}

/** Open a popup */
export function openPopup({data}: {data: Page}) {
    return {popup: data};
}

/** Close the popup */
export function closePopup() {
    return {popup: null};
}

/** Open a comment form */
export async function openCommentForm({data: newForm, api, state}: {data: OpenCommentForm, api: GhostApi, state: EditableAppContext}) {
    let otherStateChanges = {};
    const topLevelCommentId = newForm.parent_id ?? newForm.id;
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

/** Set comment to highlight */
export function setHighlightComment({data: commentId}: {data: string | null}) {
    return {commentIdToHighlight: commentId};
}

/** Highlight a comment temporarily */
export function highlightComment({data: {commentId}, dispatchAction}: {data: {commentId: string | null}; state: EditableAppContext; dispatchAction: DispatchActionType}) {
    setTimeout(() => dispatchAction('setHighlightComment', null), 3000);
    return {commentIdToHighlight: commentId};
}

/** Update unsaved changes flag for a form */
export function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string; hasUnsavedChanges: boolean}; state: EditableAppContext}) {
    const updatedForms = state.openCommentForms.map(f => f.id === id ? {...f, hasUnsavedChanges} : {...f});
    return {openCommentForms: updatedForms};
}

/** Close a comment form */
export function closeCommentForm({data: id, state}: {data: string; state: EditableAppContext}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

/** Set scroll target */
export function setScrollTarget({data: commentId}: {data: string | null}) {
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
export async function ActionHandler({action, data, state, api, adminApi, options, dispatchAction}: {action: ActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi, dispatchAction: DispatchActionType}): Promise<Partial<EditableAppContext>> {
    const handler = Actions[action];
    if (handler) {
        return await handler({data, state, api, adminApi, options, dispatchAction} as any) || {};
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