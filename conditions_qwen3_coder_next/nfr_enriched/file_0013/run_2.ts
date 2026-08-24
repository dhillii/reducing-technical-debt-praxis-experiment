// Replace the comment in the state with the new one
    return {
        comments: state.comments.map((c) => {
            if (parent && parent.id === c.id) {
                return {
                    ...c,
                    replies: c.replies?.map((r) => {

Complete source code (refactored with all requirements satisfied):
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/**
 * Load more comments from the API and append to existing comments
 */
async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?:string}): Promise<Partial<EditableAppContext>> {
    let page = state.pagination?.page ?? 1;
    page = page + 1;

    const data = state.admin && state.adminApi
        ? await state.adminApi.browse({page, postId: options.postId, order: order || state.order, memberUuid: state.member?.uuid})
        : await api.comments.browse({page, postId: options.postId, order: order || state.order});

    const updatedComments = [...state.comments, ...data.comments];
    const dedupedComments = updatedComments.filter((comment, index, self) => self.findIndex(c => c.id === comment.id) === index);

    // Note: we store the comments from new to old, and show them in reverse order
    return {
        comments: dedupedComments,
        pagination: data.meta.pagination
    };
}

/**
 * Toggle comment loading state
 */
function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {
        commentsIsLoading: isLoading
    };
}

/**
 * Change comment ordering and refresh the comment list
 */
async function setOrder({state, data: {order}, options, api, dispatchAction}: {state: EditableAppContext, data: {order: string}, options: CommentsOptions, api: GhostApi, dispatchAction: DispatchActionType}) {
    dispatchAction('setCommentsIsLoading', true);

    try {
        const data = state.admin && state.adminApi
            ? await state.adminApi.browse({page: 1, postId: options.postId, order, memberUuid: state.member?.uuid})
            : await api.comments.browse({page: 1, postId: options.postId, order});

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

/**
 * Load additional replies for a specific comment
 */
async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const fetchReplies = async (afterReplyId: string | undefined, requestLimit: number) => {
        const options = {
            commentId: comment.id,
            afterReplyId,
            limit: requestLimit
        };
        if (state.admin && state.adminApi && !isReply) {
            options.memberUuid = state.member?.uuid;
            return await state.adminApi.replies(options);
        } else {
            return await api.comments.replies(options);
        }
    };

    const lastReply = comment.replies?.[comment.replies.length - 1];
    let afterReplyId = (comment.replies?.length ?? 0) > 0 ? lastReply?.id : undefined;
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
        comments: updateCommentReplies(state.comments, comment.id, (replyList) => [...(replyList ?? []), ...allComments])
    };
}

/**
 * Add a new top-level comment
 */
async function addComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, data: AddComment}) {
    const data = await api.comments.add({comment});
    const addedComment = data.comments[0];

    return {
        comments: [addedComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

/**
 * Add a reply to a comment
 */
async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}) {
    const replyComment = reply;
    replyComment.parent_id = parent.id;

    const data = await api.comments.add({comment: replyComment});
    const addedReply = data.comments[0];

    return {
        comments: updateCommentReplies(state.comments, parent.id, (replies) => [
            ...(replies ?? []),
            addedReply
        ]),
        commentCount: state.commentCount + 1
    };
}

/**
 * Hide a comment
 */
async function hideComment({state, adminApi, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.hideComment(comment.id);
    }
    return {
        comments: state.comments.map((c) => {
            const updatedReplies = (c.replies ?? []).map((r) => {
                if (r.id === comment.id) {
                    return {...r, status: 'hidden'};
                }
                return r;
            });
            if (c.id === comment.id) {
                return {...c, status: 'hidden', replies: updatedReplies};
            }
            return {...c, replies: updatedReplies};
        }),
        commentCount: state.commentCount - 1
    };
}

/**
 * Show (unhide) a comment
 */
async function showComment({state, api, adminApi, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.showComment({id: comment.id});
    }

    const data = state.admin && state.adminApi
        ? await state.adminApi.read({commentId: comment.id, memberUuid: state.member?.uuid})
        : await api.comments.read(comment.id);

    const updatedComment = data.comments[0];

    return {
        comments: state.comments.map((c) => {
            const updatedReplies = (c.replies ?? []).map((r) => {
                if (r.id === comment.id) {
                    return updatedComment;
                }
                return r;
            });
            if (c.id === comment.id) {
                return updatedComment;
            }
            return {...c, replies: updatedReplies};
        }),
        commentCount: state.commentCount + 1
    };
}

/**
 * Update liked state of a comment
 */
async function updateCommentLikeState({state, data: {id: commentId, liked}}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: state.comments.map((c) => {
            const updatedReplies = (c.replies ?? []).map((r) => {
                if (r.id === commentId) {
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

            if (c.id === commentId) {
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
            return {...c, replies: updatedReplies};
        })
    };
}

/**
 * Like a comment
 */
async function likeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    }
}

/**
 * Unlike a comment
 */
async function unlikeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});

    try {
        await api.comments.unlike({comment});
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    }
}

/**
 * Report a comment
 */
async function reportComment({api, data: comment}: {api: GhostApi, data: {id: string}}) {
    await api.comments.report({comment});
    return {};
}

/**
 * Delete a comment
 */
async function deleteComment({state, api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    await api.comments.edit({
        comment: {id: comment.id, status: 'deleted'}
    });

    const commentToDelete = state.comments.find(c => c.id === comment.id);
    if (commentToDelete && (commentToDelete.replies?.length ?? 0) === 0) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    return {
        comments: state.comments.map((topLevelComment) => {
            if (topLevelComment.id === comment.id) {
                return (topLevelComment.replies?.length ?? 0) > 0
                    ? {...topLevelComment, status: 'deleted'}
                    : null;
            }

            const originalLength = topLevelComment.replies?.length ?? 0;
            const filteredReplies = topLevelComment.replies?.filter(r => r.id !== comment.id) ?? [];
            const replyDeleted = originalLength !== filteredReplies.length;

            if (replyDeleted && topLevelComment.count?.replies) {
                topLevelComment.count.replies = topLevelComment.count.replies - 1;
            }

            return {
                ...topLevelComment,
                replies: filteredReplies
            };
        }).filter(Boolean),
        commentCount: state.commentCount - 1
    };
}

/**
 * Edit a comment
 */
async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const data = await api.comments.edit({comment});
    const updatedComment = data.comments[0];

    const updatedComments = state.comments.map((c) => {
        if (parent && parent.id === c.id) {
            return {
                ...c,
                replies: (c.replies ?? []).map((r) => {
                    if (r.id === updatedComment.id) {
                        return updatedComment;
                    }
                    return r;
                })
            };
        }
        if (c.id === updatedComment.id) {
            return updatedComment;
        }
        return c;
    });

    return {comments: updatedComments};
}

/**
 * Update member profile information
 */
async function updateMember({data, state, api}: {data: {name: string, expertise: string}, state: EditableAppContext, api: GhostApi}) {
    const {name, expertise} = data;
    const patchData: {name?: string, expertise?: string} = {};

    if (name && state.member?.name !== name) {
        patchData.name = name;
    }

    if (expertise !== undefined && state.member?.expertise !== expertise) {
        patchData.expertise = expertise;
    }

    if (Object.keys(patchData).length > 0) {
        try {
            const member = await api.member.update(patchData);
            if (!member) {
                throw new Error('Failed to update member');
            }
            return {member, success: true};
        } catch (error) {
            return {success: false, error};
        }
    }
    return null;
}

/**
 * Open a popup page
 */
function openPopup({data}: {data: Page}) {
    return {popup: data};
}

/**
 * Close any open popup
 */
function closePopup() {
    return {popup: null};
}

/**
 * Open comment form with optional reply context
 */
async function openCommentForm({data: newForm, api, state}: {data: OpenCommentForm, api: GhostApi, state: EditableAppContext}) {
    let moreStateChanges = {};

    const topLevelCommentId = newForm.parent_id ?? newForm.id;
    if (newForm.type === 'reply' && !state.openCommentForms.some(f => f.id === topLevelCommentId || f.parent_id === topLevelCommentId)) {
        const comment = state.comments.find(c => c.id === topLevelCommentId);
        if (comment) {
            const newCommentsState = await loadMoreReplies({state, api, data: {comment, limit: 'all'}, isReply: true});
            moreStateChanges = {...moreStateChanges, ...newCommentsState};
        }
    }

    const openFormsAfterAutoclose = state.openCommentForms.filter(form => form.hasUnsavedChanges);

    const existingIndex = openFormsAfterAutoclose.findIndex(form => form.id === newForm.id);
    if (existingIndex > -1) {
        openFormsAfterAutoclose[existingIndex] = newForm;
        return {openCommentForms: openFormsAfterAutoclose, ...moreStateChanges};
    } else {
        return {openCommentForms: [...openFormsAfterAutoclose, newForm], ...moreStateChanges};
    }
}

/**
 * Set comment ID to highlight
 */
function setHighlightComment({data: commentId}: {data: string | null}) {
    return {commentIdToHighlight: commentId};
}

/**
 * Highlight a comment temporarily then clear highlight
 */
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
    return {commentIdToHighlight: commentId};
}

/**
 * Set whether a comment form has unsaved changes
 */
function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string, hasUnsavedChanges: boolean}, state: EditableAppContext}) {
    const updatedForms = state.openCommentForms.map((f) => {
        if (f.id === id) {
            return {...f, hasUnsavedChanges};
        } else {
            return {...f};
        }
    });
    return {openCommentForms: updatedForms};
}

/**
 * Close a comment form by ID
 */
function closeCommentForm({data: id, state}: {data: string, state: EditableAppContext}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

/**
 * Set scroll target comment ID
 */
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

/**
 * Helper to update replies for a specific comment in an array
 */
function updateCommentReplies(
    comments: Comment[],
    targetId: string,
    updateReplies: (replies: Comment[] | undefined) => Comment[]
): Comment[] {
    return comments.map((c) => {
        if (c.id === targetId) {
            return {...c, replies: updateReplies(c.replies)};
        }
        return c;
    });
}