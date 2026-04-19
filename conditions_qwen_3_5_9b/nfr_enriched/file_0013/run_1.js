```typescript
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/**
 * Calculates the next page number based on current pagination state.
 */
function calculateNextPage(state: EditableAppContext): number {
    return state.pagination?.page ? state.pagination.page + 1 : 1;
}

/**
 * Fetches comments from the appropriate API based on admin context.
 */
async function fetchComments(
    api: GhostApi,
    adminApi: AdminApi | undefined,
    state: EditableAppContext,
    options: CommentsOptions,
    page: number,
    order?: string
): Promise<{comments: Comment[], meta: {pagination: {page: number}}}> {
    const memberUuid = state.member?.uuid;
    const adminApiCall = adminApi?.browse({page, postId: options.postId, order: order || state.order, memberUuid});
    const guestApiCall = api.comments.browse({page, postId: options.postId, order: order || state.order});

    const data = adminApiCall ? await adminApiCall : await guestApiCall;
    return {comments: data.comments, meta: data.meta.pagination};
}

/**
 * Deduplicates comments by ID while preserving order.
 */
function deduplicateComments(comments: Comment[]): Comment[] {
    return comments.filter((comment, index, self) => self.findIndex(c => c.id === comment.id) === index);
}

/**
 * Merges new comments into existing state while deduplicating.
 */
function mergeComments(state: EditableAppContext, newComments: Comment[]): {comments: Comment[], pagination: {page: number}} {
    const updatedComments = [...state.comments, ...newComments];
    const dedupedComments = deduplicateComments(updatedComments);
    return {comments: dedupedComments, pagination: newComments.length > 0 ? newComments[0].meta?.pagination : state.pagination};
}

async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?:string}): Promise<Partial<EditableAppContext>> {
    const page = calculateNextPage(state);
    const {comments, meta} = await fetchComments(api, state.adminApi, state, options, page, order);
    return mergeComments(state, comments);
}

function setCommentsIsLoading({data: isLoading}: {data: boolean | null}): {commentsIsLoading: boolean} {
    return {commentsIsLoading: isLoading};
}

/**
 * Fetches comments with the specified order from the appropriate API.
 */
async function fetchOrderedComments(
    api: GhostApi,
    adminApi: AdminApi | undefined,
    state: EditableAppContext,
    options: CommentsOptions,
    order: string
): Promise<{comments: Comment[], meta: {pagination: {page: number}}}> {
    const memberUuid = state.member?.uuid;
    const adminApiCall = adminApi?.browse({page: 1, postId: options.postId, order, memberUuid});
    const guestApiCall = api.comments.browse({page: 1, postId: options.postId, order});

    const data = adminApiCall ? await adminApiCall : await guestApiCall;
    return {comments: data.comments, meta: data.meta.pagination};
}

async function setOrder({state, data: {order}, options, api, dispatchAction}: {state: EditableAppContext, data: {order: string}, options: CommentsOptions, api: GhostApi, dispatchAction: DispatchActionType}): Promise<Partial<EditableAppContext>> {
    dispatchAction('setCommentsIsLoading', true);

    try {
        const {comments, meta} = await fetchOrderedComments(api, state.adminApi, state, options, order);
        return {comments, pagination: meta, order, commentsIsLoading: false};
    } catch (error) {
        console.error('Failed to set order:', error); // eslint-disable-line no-console
        state.commentsIsLoading = false;
        throw error;
    }
}

/**
 * Fetches replies for a comment with pagination support.
 */
async function fetchReplies(
    api: GhostApi,
    adminApi: AdminApi | undefined,
    state: EditableAppContext,
    comment: Comment,
    afterReplyId: string | undefined,
    limit: number
): Promise<{comments: Comment[], meta: {pagination: {next: boolean}}}> {
    const memberUuid = state.member?.uuid;
    const adminApiCall = adminApi?.replies({commentId: comment.id, afterReplyId, limit, memberUuid});
    const guestApiCall = api.comments.replies({commentId: comment.id, afterReplyId, limit});

    const data = adminApiCall ? await adminApiCall : await guestApiCall;
    return {comments: data.comments, meta: data.meta.pagination};
}

/**
 * Fetches all replies recursively until no more are available.
 */
async function fetchAllReplies(
    api: GhostApi,
    adminApi: AdminApi | undefined,
    state: EditableAppContext,
    comment: Comment,
    isReply: boolean
): Promise<Comment[]> {
    const fetchReplies = async (afterReplyId: string | undefined, requestLimit: number): Promise<{comments: Comment[], meta: {pagination: {next: boolean}}}> => {
        const data = await fetchReplies(api, adminApi, state, comment, afterReplyId, requestLimit);
        return data;
    };

    let afterReplyId: string | undefined = comment.replies?.length > 0 ? comment.replies[comment.replies.length - 1]?.id : undefined;
    let allComments: Comment[] = [];
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

    return allComments;
}

/**
 * Loads all replies for a comment with optional limit.
 */
async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const allComments = limit === 'all'
        ? await fetchAllReplies(api, state.adminApi, state, comment, isReply)
        : await fetchReplies(api, state.adminApi, state, comment, undefined, limit as number || 100);

    const updatedComments = state.comments.map((c) => {
        if (c.id === comment.id) {
            return {
                ...comment,
                replies: [...comment.replies, ...allComments]
            };
        }
        return c;
    });

    return {comments: updatedComments};
}

async function addComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, data: AddComment}): Promise<Partial<EditableAppContext>> {
    const data = await api.comments.add({comment});
    const newComment = data.comments[0];

    return {
        comments: [newComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}): Promise<Partial<EditableAppContext>> {
    const comment = {
        ...reply,
        parent_id: parent.id
    };

    const data = await api.comments.add({comment});
    const newComment = data.comments[0];

    const updatedComments = state.comments.map((c) => {
        if (c.id === parent.id) {
            return {
                ...parent,
                replies: [...parent.replies, newComment],
                count: {
                    ...parent.count,
                    replies: parent.count.replies + 1
                }
            };
        }
        return c;
    });

    return {
        comments: updatedComments,
        commentCount: state.commentCount + 1
    };
}

/**
 * Updates comment status to hidden and updates reply statuses.
 */
function hideComment({state, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}): Partial<EditableAppContext> {
    if (state.adminApi) {
        state.adminApi.hideComment(comment.id);
    }

    const updatedComments = state.comments.map((c) => {
        const replies = c.replies.map((r) => {
            if (r.id === comment.id) {
                return {
                    ...r,
                    status: 'hidden'
                };
            }
            return r;
        });

        if (c.id === comment.id) {
            return {
                ...c,
                status: 'hidden',
                replies
            };
        }

        return {
            ...c,
            replies
        };
    });

    return {
        comments: updatedComments,
        commentCount: state.commentCount - 1
    };
}

/**
 * Fetches updated comment data from the appropriate API.
 */
async function fetchUpdatedComment(
    api: GhostApi,
    adminApi: AdminApi | undefined,
    state: EditableAppContext,
    commentId: string
): Promise<Comment> {
    const memberUuid = state.member?.uuid;
    const adminApiCall = adminApi?.read({commentId, memberUuid});
    const guestApiCall = api.comments.read(commentId);

    const data = adminApiCall ? await adminApiCall : await guestApiCall;
    return data.comments[0];
}

/**
 * Updates comment status to visible and refreshes comment data.
 */
async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}): Promise<Partial<EditableAppContext>> {
    if (state.adminApi) {
        state.adminApi.showComment({id: comment.id});
    }

    const updatedComment = await fetchUpdatedComment(api, state.adminApi, state, comment.id);

    const updatedComments = state.comments.map((c) => {
        const replies = c.replies.map((r) => {
            if (r.id === comment.id) {
                return updatedComment;
            }
            return r;
        });

        if (c.id === comment.id) {
            return updatedComment;
        }

        return {
            ...c,
            replies
        };
    });

    return {
        comments: updatedComments,
        commentCount: state.commentCount + 1
    };
}

/**
 * Updates comment like state in the UI.
 */
function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}): Partial<EditableAppContext> {
    const updatedComments = state.comments.map((c) => {
        const replies = c.replies.map((r) => {
            if (r.id === comment.id) {
                return {
                    ...r,
                    liked: comment.liked,
                    count: {
                        ...r.count,
                        likes: comment.liked ? r.count.likes + 1 : r.count.likes - 1
                    }
                };
            }
            return r;
        });

        if (c.id === comment.id) {
            return {
                ...c,
                liked: comment.liked,
                replies,
                count: {
                    ...c.count,
                    likes: comment.liked ? c.count.likes + 1 : c.count.likes - 1
                }
            };
        }

        return {
            ...c,
            replies
        };
    });

    return {comments: updatedComments};
}

async function likeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}): Promise<void> {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    }
}

async function unlikeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}): Promise<void> {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});

    try {
        await api.comments.unlike({comment});
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    }
}

async function reportComment({api, data: comment}: {api: GhostApi, data: {id: string}}): Promise<void> {
    await api.comments.report({comment});
}

/**
 * Deletes a comment and updates state accordingly.
 */
async function deleteComment({state, api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}): Promise<Partial<EditableAppContext> | null> {
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

    const updatedComments = state.comments.map((topLevelComment) => {
        if (topLevelComment.id === comment.id) {
            if (topLevelComment.replies?.length > 0) {
                return {
                    ...topLevelComment,
                    status: 'deleted'
                };
            }
            return null;
        }

        const originalLength = topLevelComment.replies.length;
        const updatedReplies = topLevelComment.replies.filter(reply => reply.id !== comment.id);
        const hasDeletedReply = originalLength !== updatedReplies.length;

        const updatedTopLevelComment = {
            ...topLevelComment,
            replies: updatedReplies
        };

        if (hasDeletedReply && topLevelComment.count?.replies) {
            topLevelComment.count.replies = topLevelComment.count.replies - 1;
        }

        return updatedTopLevelComment;
    }).filter(Boolean);

    return {
        comments: updatedComments,
        commentCount: state.commentCount - 1
    };
}

async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}): Promise<Partial<EditableAppContext>> {
    const data = await api.comments.edit({
        comment
    });
    const updatedComment = data.comments[0];

    const updatedComments = state.comments.map((c) => {
        if (parent && parent.id === c.id) {
            return {
                ...c,
                replies: c.replies.map((r) => {
                    if (r.id === updatedComment.id) {
                        return updatedComment;
                    }
                    return r;
                })
            };
        } else if (c.id === updatedComment.id) {
            return updatedComment;
        }

        return c;
    });

    return {comments: updatedComments};
}

/**
 * Updates member profile data if changes are detected.
 */
async function updateMember({data, state, api}: {data: {name: string, expertise: string}, state: EditableAppContext, api: GhostApi}): Promise<{member: any, success: boolean} | {success: boolean, error: any} | null> {
    const {name, expertise} = data;
    const patchData: {name?: string, expertise?: string} = {};

    const originalName = state?.member?.name;
    if (name && originalName !== name) {
        patchData.name = name;
    }

    const originalExpertise = state?.member?.expertise;
    if (expertise !== undefined && originalExpertise !== expertise) {
        patchData.expertise = expertise;
    }

    if (Object.keys(patchData).length > 0) {
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
    return null;
}

function openPopup({data}: {data: Page}): {popup: Page} {
    return {popup: data};
}

function closePopup(): {popup: null} {
    return {popup: null};
}

/**
 * Opens a comment form and loads replies if needed.
 */
async function openCommentForm({data: newForm, api, state}: {data: OpenCommentForm, api: GhostApi, state: EditableAppContext}): Promise<Partial<EditableAppContext>> {
    const topLevelCommentId = newForm.parent_id || newForm.id;
    const shouldLoadReplies = newForm.type === 'reply' && !state.openCommentForms.some(f => f.id === topLevelCommentId || f.parent_id === topLevelCommentId);

    let otherStateChanges = {};
    if (shouldLoadReplies) {
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

function setHighlightComment({data: commentId}: {data: string | null}): {commentIdToHighlight: string | null} {
    return {commentIdToHighlight: commentId};
}

function highlightComment({
    data: {commentId},
    dispatchAction
}: {
    data: { commentId: string | null };
    state: EditableAppContext;
    dispatchAction: DispatchActionType;
}): Partial<EditableAppContext> {
    setTimeout(() => {
        dispatchAction('setHighlightComment', null);
    }, 3000);
    return {
        commentIdToHighlight: commentId
    };
}

function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string, hasUnsavedChanges: boolean}, state: EditableAppContext}): {openCommentForms: any[]} {
    const updatedForms = state.openCommentForms.map((f) => {
        if (f.id === id) {
            return {...f, hasUnsavedChanges};
        }
        return {...f};
    });

    return {openCommentForms: updatedForms};
}

function closeCommentForm({data: id, state}: {data: string, state: EditableAppContext}): {openCommentForms: any[]} {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

function setScrollTarget({data: commentId}: {data: string | null}): {commentIdToScrollTo: string | null} {
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
```