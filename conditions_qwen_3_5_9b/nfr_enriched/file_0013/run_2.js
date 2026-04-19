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
    options: CommentsOptions,
    page: number,
    order: string | undefined,
    memberUuid: string | undefined
): Promise<{comments: Comment[], meta: {pagination: {page: number}}}> {
    if (adminApi) {
        return await adminApi.browse({page, postId: options.postId, order, memberUuid});
    }
    return await api.comments.browse({page, postId: options.postId, order});
}

/**
 * Deduplicates comments by their ID while preserving order.
 */
function deduplicateComments(comments: Comment[]): Comment[] {
    return comments.filter((comment, index, self) => 
        self.findIndex(c => c.id === comment.id) === index
    );
}

/**
 * Loads additional comments with pagination support.
 */
async function loadMoreComments({state, api, options, order}: {
    state: EditableAdminContext,
    api: GhostApi,
    options: CommentsOptions,
    order?: string
}): Promise<Partial<EditableAppContext>> {
    const page = calculateNextPage(state);
    const orderValue = order || state.order;
    const memberUuid = state.member?.uuid;

    const {comments, meta} = await fetchComments(api, state.adminApi, options, page, orderValue, memberUuid);
    const dedupedComments = deduplicateComments([...state.comments, ...comments]);

    return {
        comments: dedupedComments,
        pagination: meta.pagination
    };
}

/**
 * Sets the loading state for comments.
 */
function setCommentsIsLoading({data: isLoading}: {data: boolean | null}): Partial<EditableAppContext> {
    return {
        commentsIsLoading: isLoading
    };
}

/**
 * Updates the comment order and fetches comments accordingly.
 */
async function setOrder({state, data: {order}, options, api, dispatchAction}: {
    state: EditableAppContext,
    data: {order: string},
    options: CommentsOptions,
    api: GhostApi,
    dispatchAction: DispatchActionType
}): Promise<Partial<EditableAppContext>> {
    dispatchAction('setCommentsIsLoading', true);

    try {
        const {comments, meta} = await fetchComments(api, state.adminApi, options, 1, order, state.member?.uuid);

        return {
            comments,
            pagination: meta.pagination,
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
 * Fetches replies from the appropriate API based on admin context.
 */
async function fetchReplies(
    api: GhostApi,
    adminApi: AdminApi | undefined,
    comment: Comment,
    afterReplyId: string | undefined,
    limit: number,
    isReply: boolean,
    memberUuid: string | undefined
): Promise<{comments: Comment[], meta: {pagination: {next: boolean}}}> {
    if (adminApi && !isReply) {
        return await adminApi.replies({commentId: comment.id, afterReplyId, limit, memberUuid});
    }
    return await api.comments.replies({commentId: comment.id, afterReplyId, limit});
}

/**
 * Loads all replies for a comment with pagination support.
 */
async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {
    state: EditableAppContext,
    api: GhostApi,
    data: {comment: Comment, limit?: number | 'all'},
    isReply: boolean
}): Promise<Partial<EditableAppContext>> {
    const afterReplyId = comment.replies?.length > 0 
        ? comment.replies[comment.replies.length - 1]?.id 
        : undefined;
    const memberUuid = state.member?.uuid;

    if (limit === 'all') {
        let allComments: Comment[] = [];
        let hasMore = true;
        let currentAfterReplyId = afterReplyId;

        while (hasMore) {
            const {comments, meta} = await fetchReplies(api, state.adminApi, comment, currentAfterReplyId, 100, isReply, memberUuid);
            allComments.push(...comments);
            hasMore = meta.pagination.next;

            if (comments.length > 0) {
                currentAfterReplyId = comments[comments.length - 1]?.id;
            } else {
                hasMore = false;
            }
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

    const {comments} = await fetchReplies(api, state.adminApi, comment, afterReplyId, limit as number || 100, isReply, memberUuid);

    return {
        comments: state.comments.map((c) => {
            if (c.id === comment.id) {
                return {
                    ...comment,
                    replies: [...comment.replies, ...comments]
                };
            }
            return c;
        })
    };
}

/**
 * Adds a new comment to the state.
 */
async function addComment({state, api, data: comment}: {
    state: EditableAppContext,
    api: GhostApi,
    data: AddComment
}): Promise<Partial<EditableAppContext>> {
    const {comments: newComment} = await api.comments.add({comment});
    const updatedComment = newComment[0];

    return {
        comments: [updatedComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

/**
 * Adds a reply to a comment.
 */
async function addReply({state, api, data: {reply, parent}}: {
    state: EditableAppContext,
    api: GhostApi,
    data: {reply: any, parent: any}
}): Promise<Partial<EditableAppContext>> {
    const comment = {...reply, parent_id: parent.id};
    const {comments: newComment} = await api.comments.add({comment});
    const updatedComment = newComment[0];

    return {
        comments: state.comments.map((c) => {
            if (c.id === parent.id) {
                return {
                    ...parent,
                    replies: [...parent.replies, updatedComment],
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

/**
 * Hides a comment and updates its status.
 */
async function hideComment({state, data: comment}: {
    state: EditableAppContext,
    adminApi: AdminApi | undefined,
    data: {id: string}
}): Promise<Partial<EditableAppContext>> {
    if (state.adminApi) {
        await state.adminApi.hideComment(comment.id);
    }

    return {
        comments: state.comments.map((c) => {
            const replies = c.replies.map((r) => {
                if (r.id === comment.id) {
                    return {...r, status: 'hidden'};
                }
                return r;
            });

            if (c.id === comment.id) {
                return {...c, status: 'hidden', replies};
            }

            return {...c, replies};
        }),
        commentCount: state.commentCount - 1
    };
}

/**
 * Shows a comment and refreshes its content.
 */
async function showComment({state, api, data: comment}: {
    state: EditableAppContext,
    api: GhostApi,
    adminApi: AdminApi | undefined,
    data: {id: string}
}): Promise<Partial<EditableAppContext>> {
    if (state.adminApi) {
        await state.adminApi.showComment({id: comment.id});
    }

    let fetchedComment: Comment;
    if (state.adminApi) {
        const {comments} = await state.adminApi.read({commentId: comment.id, memberUuid: state.member?.uuid});
        fetchedComment = comments[0];
    } else {
        const {comments} = await api.comments.read(comment.id);
        fetchedComment = comments[0];
    }

    return {
        comments: state.comments.map((c) => {
            const replies = c.replies.map((r) => {
                if (r.id === comment.id) {
                    return fetchedComment;
                }
                return r;
            });

            if (c.id === comment.id) {
                return fetchedComment;
            }

            return {...c, replies};
        }),
        commentCount: state.commentCount + 1
    };
}

/**
 * Updates the like state for a comment.
 */
function updateCommentLikeState({state, data: comment}: {
    state: EditableAppContext,
    data: {id: string, liked: boolean}
}): Partial<EditableAppContext> {
    return {
        comments: state.comments.map((c) => {
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

            return {...c, replies};
        })
    };
}

/**
 * Handles liking a comment with error recovery.
 */
async function likeComment({api, data: comment, dispatchAction}: {
    state: EditableAppContext,
    api: GhostApi,
    data: {id: string},
    dispatchAction: DispatchActionType
}): Promise<void> {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    }
}

/**
 * Handles unliking a comment with error recovery.
 */
async function unlikeComment({api, data: comment, dispatchAction}: {
    state: EditableAppContext,
    api: GhostApi,
    data: {id: string},
    dispatchAction: DispatchActionType
}): Promise<void> {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    try {
        await api.comments.unlike({comment});
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    }
}

/**
 * Reports a comment to the system.
 */
async function reportComment({api, data: comment}: {
    api: GhostApi,
    data: {id: string}
}): Promise<void> {
    await api.comments.report({comment});
}

/**
 * Deletes a comment and updates the state accordingly.
 */
async function deleteComment({state, api, data: comment, dispatchAction}: {
    state: EditableAppContext,
    api: GhostApi,
    data: {id: string},
    dispatchAction: DispatchActionType
}): Promise<Partial<EditableAppContext> | null> {
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

    return {
        comments: state.comments.map((topLevelComment) => {
            if (topLevelComment.id === comment.id) {
                if (topLevelComment.replies.length > 0) {
                    return {...topLevelComment, status: 'deleted'};
                }
                return null;
            }

            const updatedReplies = topLevelComment.replies.filter(reply => reply.id !== comment.id);
            const hasDeletedReply = topLevelComment.replies.length !== updatedReplies.length;

            const updatedTopLevelComment = {
                ...topLevelComment,
                replies: updatedReplies
            };

            if (hasDeletedReply && topLevelComment.count?.replies) {
                topLevelComment.count.replies -= 1;
            }

            return updatedTopLevelComment;
        }).filter(Boolean),
        commentCount: state.commentCount - 1
    };
}

/**
 * Edits a comment and updates the state.
 */
async function editComment({state, api, data: {comment, parent}}: {
    state: EditableAppContext,
    api: GhostApi,
    data: {comment: Partial<Comment> & {id: string}, parent?: Comment}
}): Promise<Partial<EditableAppContext>> {
    const {comments: updatedComment} = await api.comments.edit({comment});
    const editedComment = updatedComment[0];

    return {
        comments: state.comments.map((c) => {
            if (parent && parent.id === c.id) {
                return {
                    ...c,
                    replies: c.replies.map((r) => {
                        if (r.id === editedComment.id) {
                            return editedComment;
                        }
                        return r;
                    })
                };
            }
            if (c.id === editedComment.id) {
                return editedComment;
            }
            return c;
        })
    };
}

/**
 * Updates member profile information.
 */
async function updateMember({data, state, api}: {
    data: {name: string, expertise: string},
    state: EditableAppContext,
    api: GhostApi
}): Promise<{member: any, success: true} | {success: false, error: any} | null> {
    const {name, expertise} = data;
    const patchData: {name?: string, expertise?: string} = {};
    const originalName = state?.member?.name;
    const originalExpertise = state?.member?.expertise;

    if (name && originalName !== name) {
        patchData.name = name;
    }

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

/**
 * Opens a popup with the provided page data.
 */
function openPopup({data}: {data: Page}): Partial<EditableAppContext> {
    return {
        popup: data
    };
}

/**
 * Closes the currently open popup.
 */
function closePopup(): Partial<EditableAppContext> {
    return {
        popup: null
    };
}

/**
 * Opens a comment form and manages form state.
 */
async function openCommentForm({data: newForm, api, state}: {
    data: OpenCommentForm,
    api: GhostApi,
    state: EditableAppContext
}): Promise<Partial<EditableAppContext>> {
    const topLevelCommentId = newForm.parent_id || newForm.id;

    if (newForm.type === 'reply' && !state.openCommentForms.some(f => f.id === topLevelCommentId || f.parent_id === topLevelCommentId)) {
        const comment = state.comments.find(c => c.id === topLevelCommentId);
        if (comment) {
            const newCommentsState = await loadMoreReplies({state, api, data: {comment, limit: 'all'}, isReply: true});
            return {...newCommentsState, openCommentForms: [...state.openCommentForms, newForm]};
        }
    }

    const openFormsAfterAutoclose = state.openCommentForms.filter(form => form.hasUnsavedChanges);
    const openFormIndexForId = openFormsAfterAutoclose.findIndex(form => form.id === newForm.id);

    if (openFormIndexForId > -1) {
        openFormsAfterAutoclose[openFormIndexForId] = newForm;
        return {openCommentForms: openFormsAfterAutoclose};
    }

    return {openCommentForms: [...openFormsAfterAutoclose, newForm]};
}

/**
 * Sets the comment ID to highlight.
 */
function setHighlightComment({data: commentId}: {data: string | null}): Partial<EditableAppContext> {
    return {
        commentIdToHighlight: commentId
    };
}

/**
 * Highlights a comment and automatically clears the highlight after 3 seconds.
 */
function highlightComment({
    data: {commentId},
    dispatchAction
}: {
    data: {commentId: string | null};
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

/**
 * Sets whether a comment form has unsaved changes.
 */
function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {
    data: {id: string, hasUnsavedChanges: boolean},
    state: EditableAppContext
}): Partial<EditableAppContext> {
    const updatedForms = state.openCommentForms.map((f) => {
        if (f.id === id) {
            return {...f, hasUnsavedChanges};
        }
        return {...f};
    });

    return {openCommentForms: updatedForms};
}

/**
 * Closes a specific comment form by ID.
 */
function closeCommentForm({data: id, state}: {
    data: string,
    state: EditableAppContext
}): Partial<EditableAppContext> {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

/**
 * Sets the scroll target comment ID.
 */
function setScrollTarget({data: commentId}: {data: string | null}): Partial<EditableAppContext> {
    return {commentIdToScrollTo: commentId};
}

interface EditableAdminContext extends EditableAppContext {
    adminApi: AdminApi | undefined;
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
export async function ActionHandler({action, data, state, api, adminApi, options, dispatchAction}: {
    action: ActionType,
    data: any,
    state: EditableAppContext,
    options: CommentsOptions,
    api: GhostApi,
    adminApi: AdminApi,
    dispatchAction: DispatchActionType
}): Promise<Partial<EditableAppContext>> {
    const handler = Actions[action];
    if (handler) {
        return await handler({data, state, api, adminApi, options, dispatchAction} as any) || {};
    }
    return {};
}

/** Handle actions in the App, returns updated state */
export function SyncActionHandler({action, data, state, api, adminApi, options}: {
    action: SyncActionType,
    data: any,
    state: EditableAppContext,
    options: CommentsOptions,
    api: GhostApi,
    adminApi: AdminApi
}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    if (handler) {
        return handler({data, state, api, adminApi, options} as any) || {};
    }
    return {};
}
```