import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

// Helper: Get next page number from pagination state
function getNextPageNumber(pagination: any): number {
    return pagination?.page ? pagination.page + 1 : 1;
}

// Helper: Fetch comments based on admin or public API
async function fetchComments(state: EditableAppContext, api: GhostApi, page: number, postId: string, order: string, memberUuid?: string) {
    if (state.admin && state.adminApi) {
        return await state.adminApi.browse({page, postId, order, memberUuid});
    }
    return await api.comments.browse({page, postId, order});
}

// Helper: Deduplicate comments by ID
function deduplicateComments(comments: Comment[]): Comment[] {
    return comments.filter((comment, index, self) => self.findIndex(c => c.id === comment.id) === index);
}

// Helper: Update comment status in nested structure
function updateCommentStatus(comments: Comment[], targetId: string, newStatus: string): Comment[] {
    return comments.map((c) => {
        const updatedReplies = c.replies?.map((r) => ({
            ...r,
            status: r.id === targetId ? newStatus : r.status
        })) ?? [];

        return {
            ...c,
            status: c.id === targetId ? newStatus : c.status,
            replies: updatedReplies
        };
    });
}

// Helper: Find comment in nested structure
function findCommentInTree(comments: Comment[], targetId: string): Comment | undefined {
    for (const comment of comments) {
        if (comment.id === targetId) return comment;
        const found = comment.replies?.find(r => r.id === targetId);
        if (found) return found;
    }
    return undefined;
}

// Helper: Replace comment in nested structure
function replaceCommentInTree(comments: Comment[], targetId: string, replacement: Comment, parentId?: string): Comment[] {
    return comments.map((c) => {
        if (parentId && c.id === parentId) {
            return {
                ...c,
                replies: c.replies?.map((r) => r.id === targetId ? replacement : r) ?? []
            };
        }
        if (c.id === targetId) {
            return replacement;
        }
        return {
            ...c,
            replies: c.replies?.map((r) => r.id === targetId ? replacement : r) ?? []
        };
    });
}

// Helper: Update comment like count
function updateCommentLikeCount(comment: Comment, liked: boolean): Comment {
    return {
        ...comment,
        liked,
        count: {
            ...comment.count,
            likes: liked ? comment.count.likes + 1 : comment.count.likes - 1
        }
    };
}

// Helper: Update nested comment likes
function updateNestedCommentLikes(comments: Comment[], targetId: string, liked: boolean): Comment[] {
    return comments.map((c) => {
        const updatedReplies = c.replies?.map((r) => 
            r.id === targetId ? updateCommentLikeCount(r, liked) : r
        ) ?? [];

        if (c.id === targetId) {
            return {
                ...updateCommentLikeCount(c, liked),
                replies: updatedReplies
            };
        }

        return {
            ...c,
            replies: updatedReplies
        };
    });
}

// Helper: Delete comment from nested structure
function deleteCommentFromTree(comments: Comment[], targetId: string): {comments: Comment[], wasTopLevel: boolean, hadReplies: boolean} {
    let wasTopLevel = false;
    let hadReplies = false;

    const filtered = comments.map((c) => {
        if (c.id === targetId) {
            wasTopLevel = true;
            hadReplies = (c.replies?.length ?? 0) > 0;
            return c.replies && c.replies.length > 0 ? {...c, status: 'deleted'} : null;
        }

        const originalLength = c.replies?.length ?? 0;
        const updatedReplies = c.replies?.filter(r => r.id !== targetId) ?? [];
        const hasDeletedReply = originalLength !== updatedReplies.length;

        if (hasDeletedReply && c.count?.replies) {
            c.count.replies = c.count.replies - 1;
        }

        return {
            ...c,
            replies: updatedReplies
        };
    }).filter(Boolean);

    return {comments: filtered as Comment[], wasTopLevel, hadReplies};
}

async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?:string}): Promise<Partial<EditableAppContext>> {
    const page = getNextPageNumber(state.pagination);
    const data = await fetchComments(state, api, page, options.postId, order ?? state.order, state.member?.uuid);
    const updatedComments = [...state.comments, ...data.comments];
    const dedupedComments = deduplicateComments(updatedComments);

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
        const data = await fetchComments(state, api, 1, options.postId, order, state.member?.uuid);

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

async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const fetchReplies = async (afterReplyId: string | undefined, requestLimit: number) => {
        if (state.admin && state.adminApi && !isReply) {
            return await state.adminApi.replies({commentId: comment.id, afterReplyId, limit: requestLimit, memberUuid: state.member?.uuid});
        }
        return await api.comments.replies({commentId: comment.id, afterReplyId, limit: requestLimit});
    };

    let afterReplyId: string | undefined = comment.replies?.[comment.replies.length - 1]?.id;
    let allComments: Comment[] = [];

    if (limit === 'all') {
        let hasMore = true;

        while (hasMore) {
            const data = await fetchReplies(afterReplyId, 100);
            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next;
            afterReplyId = data.comments?.[data.comments.length - 1]?.id;

            if (!data.comments?.length) {
                hasMore = false;
            }
        }
    } else {
        const data = await fetchReplies(afterReplyId, (limit as number) || 100);
        allComments = data.comments;
    }

    return {
        comments: state.comments.map((c) => {
            if (c.id === comment.id) {
                return {
                    ...comment,
                    replies: [...(comment.replies ?? []), ...allComments]
                };
            }
            return c;
        })
    };
}

async function addComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, data: AddComment}) {
    const result = await api.comments.add({comment});
    const newComment = result.comments[0];

    return {
        comments: [newComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}) {
    const commentToAdd = {
        ...reply,
        parent_id: parent.id
    };

    const result = await api.comments.add({comment: commentToAdd});
    const newComment = result.comments[0];

    return {
        comments: state.comments.map((c) => {
            if (c.id === parent.id) {
                return {
                    ...parent,
                    replies: [...(parent.replies ?? []), newComment],
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
    await state.adminApi?.hideComment(comment.id);

    return {
        comments: updateCommentStatus(state.comments, comment.id, 'hidden'),
        commentCount: state.commentCount - 1
    };
}

async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    await state.adminApi?.showComment({id: comment.id});

    let data;
    if (state.admin && state.adminApi) {
        data = await state.adminApi.read({commentId: comment.id, memberUuid: state.member?.uuid});
    } else {
        data = await api.comments.read(comment.id);
    }

    const updatedComment = data.comments[0];

    return {
        comments: state.comments.map((c) => {
            const replies = c.replies?.map((r) => r.id === comment.id ? updatedComment : r) ?? [];

            if (c.id === comment.id) {
                return updatedComment;
            }

            return {
                ...c,
                replies
            };
        }),
        commentCount: state.commentCount + 1
    };
}

async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: updateNestedCommentLikes(state.comments, comment.id, comment.liked)
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
    const shouldRefresh = commentToDelete && !commentToDelete.replies?.length;

    if (shouldRefresh) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    const {comments: deletedComments} = deleteCommentFromTree(state.comments, comment.id);

    return {
        comments: deletedComments,
        commentCount: state.commentCount - 1
    };
}

async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const result = await api.comments.edit({comment});
    const updatedComment = result.comments[0];

    return {
        comments: replaceCommentInTree(state.comments, updatedComment.id, updatedComment, parent?.id)
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

    if (!Object.keys(patchData).length) {
        return null;
    }

    try {
        const member = await api.member.update(patchData);
        if (!member) {
            throw new Error('Failed to update member');
        }
        return {
            member,
            success: true
        };
    } catch (err) {
        return {
            success: false,
            error: err
        };
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
    const isReplyFormForNewParent = newForm.type === 'reply' && !state.openCommentForms.some(f => f.id === topLevelCommentId || f.parent_id === topLevelCommentId);

    if (isReplyFormForNewParent) {
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
    const updatedForms = state.openCommentForms.map((f) => ({
        ...f,
        hasUnsavedChanges: f.id === id ? hasUnsavedChanges : f.hasUnsavedChanges
    }));

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