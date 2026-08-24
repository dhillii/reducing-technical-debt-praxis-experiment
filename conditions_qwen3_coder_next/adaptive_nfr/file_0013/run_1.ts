import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/**
 * Helper to safely map nested replies within a comment tree while updating a specific reply or comment.
 * @param {Comment[]} comments - Top-level comments to traverse
 * @param {string} targetId - ID of the comment or reply to update
 * @param {(comment: Comment) => Comment} commentMapper - Function to transform matching top-level comment
 * @param {(reply: Comment) => Comment} replyMapper - Function to transform matching reply
 * @returns {Comment[]} updated comment list
 */
function mapCommentTree(comments: Comment[], targetId: string, commentMapper: (c: Comment) => Comment, replyMapper: (r: Comment) => Comment): Comment[] {
    return comments.map((c) => {
        if (c.id === targetId) {
            return commentMapper(c);
        }

        const newReplies = c.replies?.map((r) => {
            if (r.id === targetId) {
                return replyMapper(r);
            }
            return r;
        }) || [];

        return {
            ...c,
            replies: newReplies
        };
    });
}

/**
 * Recursively map comment tree; handles replies within replies.
 * @param {Comment[]} comments - Top-level comments
 * @param {string} targetId - ID of the comment or reply to update anywhere in the tree
 * @param {(node: Comment) => Comment} nodeMapper - Function that handles the update
 * @returns {Comment[]} updated comment list
 */
function mapCommentTreeDeep(comments: Comment[], targetId: string, nodeMapper: (node: Comment) => Comment): Comment[] {
    return comments.map((c) => {
        const mapped = nodeMapper(c);
        if (c.id === targetId) {
            return mapped;
        }
        if (c.replies?.length) {
            return {
                ...c,
                replies: mapCommentTreeDeep(c.replies, targetId, nodeMapper)
            };
        }
        return mapped;
    });
}

/**
 * Find a comment or reply in the comment tree by ID.
 */
function findCommentNode(comments: Comment[], id: string): Comment | undefined {
    for (const c of comments) {
        if (c.id === id) return c;
        if (c.replies?.length) {
            const found = findCommentNode(c.replies, id);
            if (found) return found;
        }
    }
    return undefined;
}

/**
 * Increment or decrement like counts on comment/reply trees.
 */
function updateLikeCounts(comment: Comment, liked: boolean): Comment {
    return {
        ...comment,
        liked,
        count: {
            ...comment.count,
            likes: liked ? (comment.count?.likes || 0) + 1 : Math.max(0, (comment.count?.likes || 0) - 1)
        }
    };
}

async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?:string}): Promise<Partial<EditableAppContext>> {
    let page = 1;
    if (state.pagination && state.pagination.page) {
        page = state.pagination.page + 1;
    }
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

async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const fetchReplies = async (afterReplyId: string | undefined, requestLimit: number) => {
        if (state.admin && state.adminApi && !isReply) {
            return await state.adminApi.replies({commentId: comment.id, afterReplyId, limit: requestLimit, memberUuid: state.member?.uuid});
        }
        return await api.comments.replies({commentId: comment.id, afterReplyId, limit: requestLimit});
    };

    const hasReplies = comment.replies && comment.replies.length > 0;
    const afterReplyId = hasReplies ? comment.replies[comment.replies.length - 1]?.id : undefined;

    let allComments: Comment[] = [];

    if (limit === 'all') {
        let hasMore = true;

        while (hasMore) {
            const data = await fetchReplies(afterReplyId, 100);
            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next;

            if (data.comments?.length > 0) {
                afterReplyId = data.comments[data.comments.length - 1]?.id;
            } else {
                hasMore = false;
            }
        }
    } else {
        const res = await fetchReplies(afterReplyId, limit as number || 100);
        allComments = res.comments;
    }

    return {
        comments: state.comments.map((c) => {
            if (c.id === comment.id) {
                return {
                    ...comment,
                    replies: [...comment.replies, ...allComments]
                };
            }
            return c;
        })
    };
}

async function addComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, data: AddComment}) {
    const res = await api.comments.add({comment});
    comment = res.comments[0];

    return {
        comments: [comment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}) {
    let comment = reply;
    comment.parent_id = parent.id;

    const res = await api.comments.add({comment});
    comment = res.comments[0];

    return {
        comments: state.comments.map((c) => {
            if (c.id === parent.id) {
                return {
                    ...parent,
                    replies: [...parent.replies, comment],
                    count: {
                        ...parent.count,
                        replies: parent.count.replies + 1
                    }
                };
            }
            return c;
        }),
        commentCount: state.commentCount + 1
    };
}

async function hideComment({state, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.hideComment(comment.id);
    }

    return {
        comments: mapCommentTreeDeep(
            state.comments,
            comment.id,
            (c) => ({
                ...c,
                status: 'hidden'
            })
        ),
        commentCount: state.commentCount - 1
    };
}

async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
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
        comments: mapCommentTreeDeep(state.comments, comment.id, (c) => c.id === comment.id ? updatedComment : c),
        commentCount: state.commentCount + 1
    };
}

async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: mapCommentTreeDeep(
            state.comments,
            comment.id,
            (c) => updateLikeCounts(c, comment.liked)
        )
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
        comment: {id: comment.id, status: 'deleted'}
    });

    const commentToDelete = findCommentNode(state.comments, comment.id);
    if (commentToDelete && !commentToDelete.replies?.length) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    const updatedComments = state.comments.map((topLevelComment) => {
        if (topLevelComment.id === comment.id) {
            return topLevelComment.replies?.length ? { ...topLevelComment, status: 'deleted' } : null;
        }

        if (!topLevelComment.replies?.length) {
            return topLevelComment;
        }

        const beforeCount = topLevelComment.replies.length;
        const updatedReplies = topLevelComment.replies.filter(r => r.id !== comment.id);
        const afterCount = updatedReplies.length;

        if (beforeCount !== afterCount && topLevelComment.count?.replies) {
            topLevelComment.count.replies -= 1;
        }

        return {
            ...topLevelComment,
            replies: updatedReplies
        };
    });

    return {
        comments: updatedComments.filter(Boolean),
        commentCount: state.commentCount - 1
    };
}

async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const data = await api.comments.edit({comment});
    comment = data.comments[0];

    return {
        comments: state.comments.map((c) => {
            if (parent && parent.id === c.id) {
                return {
                    ...c,
                    replies: c.replies.map((r) => (r.id === comment.id ? comment : r))
                };
            } else if (c.id === comment.id) {
                return comment;
            }
            return c;
        })
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

    if (Object.keys(patchData).length === 0) return null;

    try {
        const member = await api.member.update(patchData);
        if (!member) {
            throw new Error('Failed to update member');
        }
        return { member, success: true };
    } catch (err) {
        return { success: false, error: err };
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
            otherStateChanges = { ...otherStateChanges, ...newCommentsState };
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
    const updatedForms = state.openCommentForms.map((f) => (
        f.id === id ? {...f, hasUnsavedChanges} : {...f}
    ));
    return {openCommentForms: updatedForms};
}

function closeCommentForm({data: id, state}: {data: string, state: EditableAppContext}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

function setScrollTarget({data: commentId}: {data: string | null}) {
    return {commentIdToScrollTo: commentId};
}

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

export async function ActionHandler({action, data, state, api, adminApi, options, dispatchAction}: {action: ActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi, dispatchAction: DispatchActionType}): Promise<Partial<EditableAppContext>> {
    const handler = Actions[action];
    if (handler) {
        return await handler({data, state, api, adminApi, options, dispatchAction} as any) || {};
    }
    return {};
}

export function SyncActionHandler({action, data, state, api, adminApi, options}: {action: SyncActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    if (handler) {
        return handler({data, state, api, adminApi, options} as any) || {};
    }
    return {};
}