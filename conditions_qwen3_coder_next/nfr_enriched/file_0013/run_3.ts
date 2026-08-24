import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

// Helper: Safely update a comment's replies with a new reply
function updateCommentReplies(comments: Comment[], parentId: string, newReply: Comment): Comment[] {
    return comments.map((c) => {
        if (c.id === parentId) {
            return {
                ...c,
                replies: [...(c.replies || []), newReply],
                count: {
                    ...c.count,
                    replies: (c.count?.replies || 0) + 1
                }
            };
        }
        return c;
    });
}

// Helper: Safely update a comment's replies with a new reply (for replies to replies)
function updateReplyReplies(comments: Comment[], parentId: string, newReply: Comment): Comment[] {
    return comments.map((c) => {
        if (c.id === parentId) {
            return {
                ...c,
                replies: [...(c.replies || []), newReply]
            };
        }
        return c;
    });
}

// Helper: Update a top-level comment or its replies with a new version
function replaceCommentOrReply(comments: Comment[], targetId: string, updatedComment: Comment, parent?: Comment): Comment[] {
    if (parent && parent.id === targetId) {
        return comments.map((c) => {
            if (c.id === parent.id) {
                return {
                    ...c,
                    replies: c.replies?.map((r) => (r.id === updatedComment.id ? updatedComment : r))
                };
            }
            return c;
        });
    }

    return comments.map((c) => (c.id === targetId ? updatedComment : c));
}

// Helper: Update comment like state recursively
function updateLikeStateRecursive(comments: Comment[], targetId: string, liked: boolean): Comment[] {
    return comments.map((c) => {
        const updatedReplies = c.replies?.map((r) => {
            if (r.id === targetId) {
                return {
                    ...r,
                    liked,
                    count: {
                        ...r.count,
                        likes: liked ? r.count.likes + 1 : r.count.likes - 1
                    }
                };
            }
            return r;
        });

        if (c.id === targetId) {
            return {
                ...c,
                liked,
                replies: updatedReplies,
                count: {
                    ...c.count,
                    likes: liked ? c.count.likes + 1 : c.count.likes - 1
                }
            };
        }

        return {
            ...c,
            replies: updatedReplies
        };
    });
}

// Helper: Hide a comment recursively
function hideCommentRecursive(comments: Comment[], targetId: string): Comment[] {
    return comments.map((c) => {
        const updatedReplies = c.replies?.map((r) => {
            if (r.id === targetId) {
                return {...r, status: 'hidden'};
            }
            return r;
        });

        if (c.id === targetId) {
            return {...c, status: 'hidden', replies: updatedReplies};
        }

        return {...c, replies: updatedReplies};
    });
}

// Helper: Show a comment recursively
function showCommentRecursive(comments: Comment[], targetId: string, updatedComment: Comment): Comment[] {
    return comments.map((c) => {
        const updatedReplies = c.replies?.map((r) => (r.id === targetId ? updatedComment : r));

        if (c.id === targetId) {
            return updatedComment;
        }

        return {...c, replies: updatedReplies};
    });
}

// Helper: Delete a comment recursively
function deleteCommentRecursive(comments: Comment[], targetId: string): {comments: Comment[]; commentCountDelta: number} {
    let commentCountDelta = 0;
    const filteredComments = comments
        .map((c) => {
            if (c.id === targetId) {
                commentCountDelta -= 1;
                return c.replies?.length ? {...c, status: 'deleted'} : null;
            }

            const originalLength = c.replies?.length || 0;
            const filteredReplies = c.replies?.filter((r) => r.id !== targetId);
            const hasDeletedReply = originalLength !== filteredReplies?.length;

            if (hasDeletedReply && c.count?.replies) {
                c.count.replies -= 1;
            }

            return {...c, replies: filteredReplies};
        })
        .filter(Boolean) as Comment[];

    return {comments: filteredComments, commentCountDelta};
}

// Helper: Load more replies with pagination support
async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const fetchReplies = async (afterReplyId: string | undefined, requestLimit: number) => {
        if (state.admin && state.adminApi && !isReply) {
            return await state.adminApi.replies({commentId: comment.id, afterReplyId, limit: requestLimit, memberUuid: state.member?.uuid});
        } else {
            return await api.comments.replies({commentId: comment.id, afterReplyId, limit: requestLimit});
        }
    };

    const lastReplyId = comment.replies?.[comment.replies.length - 1]?.id;
    let afterReplyId = comment.replies?.length ? lastReplyId : undefined;
    let allComments: Comment[] = [];

    if (limit === 'all') {
        let hasMore = true;
        while (hasMore) {
            const data = await fetchReplies(afterReplyId, 100);
            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next;
            if (data.comments.length > 0) {
                afterReplyId = data.comments[data.comments.length - 1]?.id;
            } else {
                hasMore = false;
            }
        }
    } else {
        const data = await fetchReplies(afterReplyId, limit as number || 100);
        allComments = data.comments;
    }

    return {
        comments: state.comments.map((c) => {
            if (c.id === comment.id) {
                return {
                    ...comment,
                    replies: [...(comment.replies || []), ...allComments]
                };
            }
            return c;
        })
    };
}

async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?:string}): Promise<Partial<EditableAppContext>> {
    let page = state.pagination?.page ? state.pagination.page + 1 : 1;
    let data;
    if (state.admin && state.adminApi) {
        data = await state.adminApi.browse({page, postId: options.postId, order: order || state.order, memberUuid: state.member?.uuid});
    } else {
        data = await api.comments.browse({page, postId: options.postId, order: order || state.order});
    }

    const updatedComments = [...state.comments, ...data.comments];
    const dedupedComments = updatedComments.filter((comment, index, self) => self.findIndex(c => c.id === comment.id) === index);

    return {
        comments: dedupedComments,
        pagination: data.meta.pagination
    };
}

function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {
        commentsIsLoading: isLoading
    };
}

async function setOrder({state, data: {order}, options, api, dispatchAction}: {state: EditableAppContext, data: {order: string}, options: CommentsOptions, api: GhostApi, dispatchAction: DispatchActionType}) {
    dispatchAction('setCommentsIsLoading', true);

    try {
        let data;
        if (state.admin && state.adminApi) {
            data = await state.adminApi.browse({page: 1, postId: options.postId, order, memberUuid: state.member?.uuid});
        } else {
            data = await api.comments.browse({page: 1, postId: options.postId, order});
        }

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

async function addComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, data: AddComment}) {
    const data = await api.comments.add({comment});
    const newComment = data.comments[0];

    return {
        comments: [newComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}) {
    const comment = {...reply, parent_id: parent.id};
    const data = await api.comments.add({comment});
    const newReply = data.comments[0];

    return {
        comments: updateCommentReplies(state.comments, parent.id, newReply),
        commentCount: state.commentCount + 1
    };
}

async function hideComment({state, adminApi}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.hideComment(state.data.id);
    }

    return {
        comments: hideCommentRecursive(state.comments, state.data.id),
        commentCount: state.commentCount - 1
    };
}

async function showComment({state, api, adminApi, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.showComment({id: comment.id});
    }

    let data;
    if (state.admin && state.adminApi) {
        data = await state.adminApi.read({commentId: comment.id, memberUuid: state.member?.uuid});
    } else {
        data = await api.comments.read(comment.id);
    }

    const updatedComment = data.comments[0];

    return {
        comments: showCommentRecursive(state.comments, comment.id, updatedComment),
        commentCount: state.commentCount + 1
    };
}

async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: updateLikeStateRecursive(state.comments, comment.id, comment.liked)
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
    await api.comments.edit({
        comment: {
            id: comment.id,
            status: 'deleted'
        }
    });

    const commentToDelete = state.comments.find(c => c.id === comment.id);
    if (commentToDelete && (!commentToDelete.replies || commentToDelete.replies.length === 0)) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    const {comments, commentCountDelta} = deleteCommentRecursive(state.comments, comment.id);

    return {
        comments,
        commentCount: state.commentCount + commentCountDelta
    };
}

async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const data = await api.comments.edit({comment});
    const updatedComment = data.comments[0];

    return {
        comments: replaceCommentOrReply(state.comments, updatedComment.id, updatedComment, parent)
    };
}

async function updateMember({data, state, api}: {data: {name: string, expertise: string}, state: EditableAppContext, api: GhostApi}) {
    const {name, expertise} = data;
    const patchData: {name?: string, expertise?: string} = {};

    if (name && state.member?.name !== name) {
        patchData.name = name;
    }

    if (expertise !== undefined && state.member?.expertise !== expertise) {
        patchData.expertise = expertise;
    }

    if (Object.keys(patchData).length === 0) {
        return null;
    }

    try {
        const member = await api.member.update(patchData);
        if (!member) {
            throw new Error('Failed to update member');
        }
        return {member, success: true};
    } catch (err) {
        return {success: false, error: err};
    }
}

function openPopup({data}: {data: Page}) {
    return {
        popup: data
    };
}

function closePopup() {
    return {
        popup: null
    };
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

    const openFormsAfterAutoclose = state.openCommentForms.filter(form => form.hasUnsavedChanges);

    const openFormIndexForId = openFormsAfterAutoclose.findIndex(form => form.id === newForm.id);
    if (openFormIndexForId > -1) {
        openFormsAfterAutoclose[openFormIndexForId] = newForm;
        return {openCommentForms: openFormsAfterAutoclose, ...otherStateChanges};
    } else {
        return {openCommentForms: [...openFormsAfterAutoclose, newForm], ...otherStateChanges};
    }
}

function setHighlightComment({data: commentId}: {data: string | null}) {
    return {
        commentIdToHighlight: commentId
    };
}

function highlightComment({
    data: {commentId},
    dispatchAction
}: {
    data: { commentId: string | null };
    state: EditableAppContext;
    dispatchAction: DispatchActionType;
}) {
    setTimeout(() => {
        dispatchAction('setHighlightComment', null);
    }, 3000);
    return {
        commentIdToHighlight: commentId
    };
}

function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string, hasUnsavedChanges: boolean}, state: EditableAppContext}) {
    const updatedForms = state.openCommentForms.map((f) => {
        if (f.id === id) {
            return {...f, hasUnsavedChanges};
        }
        return {...f};
    });

    return {openCommentForms: updatedForms};
}

function closeCommentForm({data: id, state}: {data: string, state: EditableAppContext}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

function setScrollTarget({data: commentId}: {data: string | null}) {
    return {commentIdToScrollTo: commentId};
}

// Sync actions make use of setState((currentState) => newState), to avoid 'race' conditions
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