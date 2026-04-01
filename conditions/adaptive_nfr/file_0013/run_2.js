```typescript
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/**
 * Determines if admin API should be used for fetching data
 */
function shouldUseAdminApi(state: EditableAppContext): boolean {
    return !!(state.admin && state.adminApi);
}

/**
 * Fetches comments using appropriate API (admin or public)
 */
async function fetchComments(
    state: EditableAppContext,
    api: GhostApi,
    page: number,
    postId: string,
    order: string
): Promise<any> {
    if (shouldUseAdminApi(state)) {
        return await state.adminApi?.browse({page, postId, order, memberUuid: state.member?.uuid});
    }
    return await api.comments.browse({page, postId, order});
}

/**
 * Fetches a single comment using appropriate API
 */
async function fetchComment(
    state: EditableAppContext,
    api: GhostApi,
    commentId: string
): Promise<any> {
    if (shouldUseAdminApi(state)) {
        return await state.adminApi?.read({commentId, memberUuid: state.member?.uuid});
    }
    return await api.comments.read(commentId);
}

/**
 * Fetches replies using appropriate API
 */
async function fetchReplies(
    state: EditableAppContext,
    api: GhostApi,
    commentId: string,
    afterReplyId: string | undefined,
    limit: number,
    isReply: boolean
): Promise<any> {
    if (shouldUseAdminApi(state) && !isReply) {
        return await state.adminApi?.replies({commentId, afterReplyId, limit, memberUuid: state.member?.uuid});
    }
    return await api.comments.replies({commentId, afterReplyId, limit});
}

/**
 * Deduplicates comments by ID
 */
function deduplicateComments(comments: Comment[]): Comment[] {
    return comments.filter((comment, index, self) => self.findIndex(c => c.id === comment.id) === index);
}

/**
 * Gets the last reply ID from a comment
 */
function getLastReplyId(comment: Comment): string | undefined {
    return comment.replies?.[comment.replies.length - 1]?.id;
}

/**
 * Updates a comment in the comments array
 */
function updateCommentInArray(
    comments: Comment[],
    commentId: string,
    updater: (comment: Comment) => Comment
): Comment[] {
    return comments.map(c => c.id === commentId ? updater(c) : c);
}

/**
 * Updates a reply within a parent comment
 */
function updateReplyInComment(
    comment: Comment,
    replyId: string,
    updater: (reply: Comment) => Comment
): Comment {
    return {
        ...comment,
        replies: comment.replies.map(r => r.id === replyId ? updater(r) : r)
    };
}

/**
 * Updates both a comment and its replies
 */
function updateCommentAndReplies(
    comments: Comment[],
    commentId: string,
    replyId: string | undefined,
    updater: (item: Comment) => Comment
): Comment[] {
    return comments.map(c => {
        if (c.id === commentId) {
            return updater(c);
        }
        if (replyId) {
            const updatedReplies = c.replies.map(r => r.id === replyId ? updater(r) : r);
            return {...c, replies: updatedReplies};
        }
        return c;
    });
}

async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?:string}): Promise<Partial<EditableAppContext>> {
    const page = (state.pagination?.page ?? 0) + 1;
    const data = await fetchComments(state, api, page, options.postId, order ?? state.order);
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
        const data = await fetchComments(state, api, 1, options.postId, order);

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
    let afterReplyId: string | undefined = getLastReplyId(comment);
    let allComments: Comment[] = [];

    if (limit === 'all') {
        let hasMore = true;

        while (hasMore) {
            const data = await fetchReplies(state, api, comment.id, afterReplyId, 100, isReply);
            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next;

            if (data.comments?.length > 0) {
                afterReplyId = data.comments[data.comments.length - 1]?.id;
            } else {
                hasMore = false;
            }
        }
    } else {
        const data = await fetchReplies(state, api, comment.id, afterReplyId, (limit as number) || 100, isReply);
        allComments = data.comments;
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
    const data = await api.comments.add({comment});
    comment = data.comments[0];

    return {
        comments: [comment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}) {
    let comment = reply;
    comment.parent_id = parent.id;

    const data = await api.comments.add({comment});
    comment = data.comments[0];

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

/**
 * Updates reply status in comment tree
 */
function updateReplyStatus(replies: Comment[], replyId: string, status: string): Comment[] {
    return replies.map(r => r.id === replyId ? {...r, status} : r);
}

async function hideComment({state, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    await state.adminApi?.hideComment(comment.id);

    return {
        comments: state.comments.map((c) => {
            const replies = updateReplyStatus(c.replies, comment.id, 'hidden');

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
        }),
        commentCount: state.commentCount - 1
    };
}

async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    await state.adminApi?.showComment({id: comment.id});

    const data = await fetchComment(state, api, comment.id);
    const updatedComment = data.comments[0];

    return {
        comments: state.comments.map((c) => {
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
        }),
        commentCount: state.commentCount + 1
    };
}

/**
 * Updates like count for a comment
 */
function updateLikeCount(count: any, liked: boolean): any {
    return {
        ...count,
        likes: liked ? count.likes + 1 : count.likes - 1
    };
}

async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: state.comments.map((c) => {
            const replies = c.replies.map((r) => {
                if (r.id === comment.id) {
                    return {
                        ...r,
                        liked: comment.liked,
                        count: updateLikeCount(r.count, comment.liked)
                    };
                }
                return r;
            });

            if (c.id === comment.id) {
                return {
                    ...c,
                    liked: comment.liked,
                    replies,
                    count: updateLikeCount(c.count, comment.liked)
                };
            }

            return {
                ...c,
                replies
            };
        })
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

/**
 * Checks if a comment has no replies
 */
function hasNoReplies(comment: Comment | undefined): boolean {
    return !comment?.replies?.length;
}

async function deleteComment({state, api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    await api.comments.edit({
        comment: {
            id: comment.id,
            status: 'deleted'
        }
    });

    const commentToDelete = state.comments.find(c => c.id === comment.id);
    if (commentToDelete && hasNoReplies(commentToDelete)) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    return {
        comments: state.comments.map((topLevelComment) => {
            if (topLevelComment.id === comment.id) {
                return topLevelComment.replies.length > 0 ? {...topLevelComment, status: 'deleted'} : null;
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
        }).filter(Boolean),
        commentCount: state.commentCount - 1
    };
}

async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const data = await api.comments.edit({comment});
    comment = data.comments[0];

    return {
        comments: state.comments.map((c) => {
            if (parent?.id === c.id) {
                return {
                    ...c,
                    replies: c.replies.map((r) => r.id === comment.id ? comment : r)
                };
            }
            return c.id === comment.id ? comment : c;
        })
    };
}

/**
 * Determines if member data should be updated
 */
function shouldUpdateMemberData(data: any, state: EditableAppContext): {name?: string, expertise?: string} {
    const patchData: {name?: string, expertise?: string} = {};

    if (data.name && state.member?.name !== data.name) {
        patchData.name = data.name;
    }

    if (data.expertise !== undefined && state.member?.expertise !== data.expertise) {
        patchData.expertise = data.expertise;
    }

    return patchData;
}

async function updateMember({data, state, api}: {data: {name: string, expertise: string}, state: EditableAppContext, api: GhostApi}) {
    const patchData = shouldUpdateMemberData(data, state);

    if (Object.keys(patchData).length === 0) {
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

/**
 * Checks if a form already exists for the given ID
 */
function findExistingFormIndex(forms: OpenCommentForm[], id: string): number {
    return forms.findIndex(form => form.id === id);
}

/**
 * Checks if replies should be loaded for a comment form
 */
function shouldLoadReplies(newForm: OpenCommentForm, state: EditableAppContext): boolean {
    if (newForm.type !== 'reply') {
        return false;
    }
    const topLevelCommentId = newForm.parent_id || newForm.id;
    return !state.openCommentForms.some(f => f.id === topLevelCommentId || f.parent_id === topLevelCommentId);
}

async function openCommentForm({data: newForm, api, state}: {data: OpenCommentForm, api: GhostApi, state: EditableAppContext}) {
    let otherStateChanges = {};

    if (shouldLoadReplies(newForm, state)) {
        const topLevelCommentId = newForm.parent_id || newForm.id;
        const comment = state.comments.find(c => c.id === topLevelCommentId);

        if (comment) {
            const newCommentsState = await loadMoreReplies({state, api, data: {comment, limit: 'all'}, isReply: true});
            otherStateChanges = {...otherStateChanges, ...newCommentsState};
        }
    }

    const openFormsAfterAutoclose = state.openCommentForms.filter(form => form.hasUnsavedChanges);
    const openFormIndexForId = findExistingFormIndex(openFormsAfterAutoclose, newForm.id);

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
    const updatedForms = state.openCommentForms.map((f) => {
        return f.id === id ? {...f, hasUnsavedChanges} : {...f};
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
    return await handler?.({data, state, api, adminApi, options, dispatchAction} as any) || {};
}

/** Handle actions in the App, returns updated state */
export function SyncActionHandler({action, data, state, api, adminApi, options}: {action: SyncActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    return handler?.({data, state, api, adminApi, options} as any) || {};
}
```