import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/** Helper to determine if admin API should be used */
function useAdmin(state: EditableAppContext): boolean {
    return !!state.admin && !!state.adminApi;
}

/** Fetch comments list respecting admin mode */
async function fetchComments({state, api, options, order, page = 1}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?: string, page?: number}): Promise<any> {
    if (useAdmin(state)) {
        return state.adminApi!.browse({page, postId: options.postId, order, memberUuid: state.member?.uuid});
    }
    return api.comments.browse({page, postId: options.postId, order});
}

/** Fetch a single comment respecting admin mode */
async function fetchComment({state, api, commentId}: {state: EditableAppContext, api: GhostApi, commentId: string}): Promise<any> {
    if (useAdmin(state)) {
        return state.adminApi!.read({commentId, memberUuid: state.member?.uuid});
    }
    return api.comments.read(commentId);
}

/** Generic mapper for comments array */
function mapComments(comments: Comment[], predicate: (c: Comment) => boolean, updater: (c: Comment) => Comment): Comment[] {
    return comments.map(c => predicate(c) ? updater(c) : c);
}

/** Generic mapper for replies array */
function mapReplies(replies: Comment[], predicate: (r: Comment) => boolean, updater: (r: Comment) => Comment): Comment[] {
    return replies.map(r => predicate(r) ? updater(r) : r);
}

/** Load more top‑level comments */
async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?: string}): Promise<Partial<EditableAppContext>> {
    const nextPage = (state.pagination?.page ?? 0) + 1;
    const data = await fetchComments({state, api, options, order: order ?? state.order, page: nextPage});

    const merged = [...state.comments, ...data.comments];
    const deduped = merged.filter((c, i, self) => self.findIndex(s => s.id === c.id) === i);

    return {
        comments: deduped,
        pagination: data.meta.pagination
    };
}

/** Set loading flag for comments */
function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {commentsIsLoading: isLoading};
}

/** Change ordering of comments */
async function setOrder({state, data: {order}, options, api, dispatchAction}: {state: EditableAppContext, data: {order: string}, options: CommentsOptions, api: GhostApi, dispatchAction: DispatchActionType}) {
    dispatchAction('setCommentsIsLoading', true);
    try {
        const data = await fetchComments({state, api, options, order});
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
    const fetchReplies = async (afterReplyId: string | undefined, requestLimit: number) => {
        if (useAdmin(state) && !isReply) {
            return state.adminApi!.replies({commentId: comment.id, afterReplyId, limit: requestLimit, memberUuid: state.member?.uuid});
        }
        return api.comments.replies({commentId: comment.id, afterReplyId, limit: requestLimit});
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
        comments: mapComments(state.comments, c => c.id === comment.id, c => ({
            ...comment,
            replies: [...comment.replies, ...allComments]
        }))
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
    reply.parent_id = parent.id;
    const data = await api.comments.add({comment: reply});
    const newReply = data.comments[0];

    return {
        comments: mapComments(state.comments, c => c.id === parent.id, c => ({
            ...parent,
            replies: [...parent.replies, newReply],
            count: {...parent.count, replies: parent.count.replies + 1}
        })),
        commentCount: state.commentCount + 1
    };
}

/** Hide a comment (admin only) */
async function hideComment({state, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.hideComment(comment.id);
    }
    return {
        comments: state.comments.map(c => {
            const updatedReplies = mapReplies(c.replies, r => r.id === comment.id, r => ({...r, status: 'hidden'}));
            if (c.id === comment.id) {
                return {...c, status: 'hidden', replies: updatedReplies};
            }
            return {...c, replies: updatedReplies};
        }),
        commentCount: state.commentCount - 1
    };
}

/** Show a previously hidden comment */
async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.showComment({id: comment.id});
    }
    const data = await fetchComment({state, api, commentId: comment.id});
    const updated = data.comments[0];

    return {
        comments: state.comments.map(c => {
            const updatedReplies = mapReplies(c.replies, r => r.id === comment.id, () => updated);
            if (c.id === comment.id) {
                return updated;
            }
            return {...c, replies: updatedReplies};
        }),
        commentCount: state.commentCount + 1
    };
}

/** Update like state for a comment and its replies */
async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: state.comments.map(c => {
            const updatedReplies = mapReplies(c.replies, r => r.id === comment.id, r => ({
                ...r,
                liked: comment.liked,
                count: {...r.count, likes: comment.liked ? r.count.likes + 1 : r.count.likes - 1}
            }));
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

/** Optimistic like */
async function likeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    }
}

/** Optimistic unlike */
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

/** Delete a comment (or reply) */
async function deleteComment({state, api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    await api.comments.edit({comment: {id: comment.id, status: 'deleted'}});
    const target = state.comments.find(c => c.id === comment.id);
    if (target?.replies?.length) {
        // top‑level comment with replies: keep it, mark deleted
        return {
            comments: state.comments.map(c => c.id === comment.id ? {...c, status: 'deleted'} : c),
            commentCount: state.commentCount - 1
        };
    }
    if (!target) {
        // reply case: refresh whole list
        dispatchAction('setOrder', {order: state.order});
        return null;
    }
    // reply deletion: remove from parent replies and adjust count
    return {
        comments: state.comments.map(top => {
            if (top.id === comment.id) {
                return {...top, status: 'deleted'};
            }
            const filtered = top.replies.filter(r => r.id !== comment.id);
            if (filtered.length !== top.replies.length && top.count?.replies) {
                top.count.replies -= 1;
            }
            return {...top, replies: filtered};
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
                return {
                    ...c,
                    replies: mapReplies(c.replies, r => r.id === updated.id, () => updated)
                };
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

/** Popup handling */
function openPopup({data}: {data: Page}) {
    return {popup: data};
}
function closePopup() {
    return {popup: null};
}

/** Open comment form, optionally loading missing replies */
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

    const filteredForms = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const existingIdx = filteredForms.findIndex(f => f.id === newForm.id);

    if (existingIdx > -1) {
        filteredForms[existingIdx] = newForm;
        return {openCommentForms: filteredForms, ...otherStateChanges};
    }
    return {openCommentForms: [...filteredForms, newForm], ...otherStateChanges};
}

/** Highlight handling */
function setHighlightComment({data: commentId}: {data: string | null}) {
    return {commentIdToHighlight: commentId};
}
function highlightComment({data: {commentId}, dispatchAction}: {data: {commentId: string | null}; state: EditableAppContext; dispatchAction: DispatchActionType}) {
    setTimeout(() => dispatchAction('setHighlightComment', null), 3000);
    return {commentIdToHighlight: commentId};
}

/** Form unsaved changes flag */
function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string, hasUnsavedChanges: boolean}, state: EditableAppContext}) {
    const updated = state.openCommentForms.map(f => f.id === id ? {...f, hasUnsavedChanges} : {...f});
    return {openCommentForms: updated};
}

/** Close a comment form */
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
        return (await handler({data, state, api, adminApi, options, dispatchAction} as any)) || {};
    }
    return {};
}

/** Handle sync actions */
export function SyncActionHandler({action, data, state, api, adminApi, options}: {action: SyncActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    if (handler) {
        return handler({data, state, api, adminApi, options} as any) || {};
    }
    return {};
}