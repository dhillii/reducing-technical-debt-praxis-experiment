```typescript
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/**
 * Determines if admin API should be used for fetching comments
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
        return await state.adminApi!.browse({page, postId, order, memberUuid: state.member?.uuid});
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
        return await state.adminApi!.read({commentId, memberUuid: state.member?.uuid});
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
        return await state.adminApi!.replies({commentId, afterReplyId, limit, memberUuid: state.member?.uuid});
    }
    return await api.comments.replies({commentId, afterReplyId, limit});
}

async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?:string}): Promise<Partial<EditableAppContext>> {
    const page = (state.pagination?.page ?? 0) + 1;
    const data = await fetchComments(state, api, page, options.postId, order ?? state.order);

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
    const afterReplyId = comment.replies?.[comment.replies.length - 1]?.id;
    let allComments: Comment[] = [];

    if (limit === 'all') {
        let hasMore = true;
        let currentAfterId = afterReplyId;

        while (hasMore) {
            const data = await fetchReplies(state, api, comment.id, currentAfterId, 100, isReply);
            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next;
            currentAfterId = data.comments?.[data.comments.length - 1]?.id;
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
                    replies: [...(comment.replies ?? []), ...allComments]
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
                    replies: [...(parent.replies ?? []), comment],
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
 * Updates comment status in nested structure
 */
function updateCommentStatus(comments: Comment[], targetId: string, newStatus: string): Comment[] {
    return comments.map((c) => {
        const replies = c.replies?.map((r) => {
            if (r.id === targetId) {
                return {...r, status: newStatus};
            }
            return r;
        }) ?? [];

        if (c.id === targetId) {
            return {...c, status: newStatus, replies};
        }

        return {...c, replies};
    });
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
    
    const data = await fetchComment(state, api, comment.id);
    const updatedComment = data.comments[0];

    return {
        comments: state.comments.map((c) => {
            const replies = c.replies?.map((r) => r.id === comment.id ? updatedComment : r) ?? [];

            if (c.id === comment.id) {
                return updatedComment;
            }

            return {...c, replies};
        }),
        commentCount: state.commentCount + 1
    };
}

/**
 * Updates like count for a comment
 */
function updateLikeCount(count: number, liked: boolean): number {
    return liked ? count + 1 : count - 1;
}

async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: state.comments.map((c) => {
            const replies = c.replies?.map((r) => {
                if (r.id === comment.id) {
                    return {
                        ...r,
                        liked: comment.liked,
                        count: {
                            ...r.count,
                            likes: updateLikeCount(r.count.likes, comment.liked)
                        }
                    };
                }
                return r;
            }) ?? [];

            if (c.id === comment.id) {
                return {
                    ...c,
                    liked: comment.liked,
                    replies,
                    count: {
                        ...c.count,
                        likes: updateLikeCount(c.count.likes, comment.liked)
                    }
                };
            }

            return {...c, replies};
        })
    };
}

/**
 * Strategy for like/unlike operations
 */
const likeStrategy = {
    like: {
        optimisticLiked: true,
        revertLiked: false,
        apiCall: (api: GhostApi, comment: any) => api.comments.like({comment})
    },
    unlike: {
        optimisticLiked: false,
        revertLiked: true,
        apiCall: (api: GhostApi, comment: any) => api.comments.unlike({comment})
    }
};

/**
 * Generic like/unlike handler
 */
async function handleLikeAction(
    type: 'like' | 'unlike',
    {api, data: comment, dispatchAction}: {api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}
) {
    const strategy = likeStrategy[type];
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: strategy.optimisticLiked});
    try {
        await strategy.apiCall(api, comment);
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: strategy.revertLiked});
    }
}

async function likeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    return handleLikeAction('like', {api, data: comment, dispatchAction});
}

async function unlikeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    return handleLikeAction('unlike', {api, data: comment, dispatchAction});
}

async function reportComment({api, data: comment}: {api: GhostApi, data: {id: string}}) {
    await api.comments.report({comment});
    return {};
}

/**
 * Checks if a comment has no replies
 */
function hasNoReplies(comment: Comment): boolean {
    return !comment.replies?.length;
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
                return topLevelComment.replies?.length ? {...topLevelComment, status: 'deleted'} : null;
            }

            const originalLength = topLevelComment.replies?.length ?? 0;
            const updatedReplies = topLevelComment.replies?.filter(reply => reply.id !== comment.id) ?? [];
            const hasDeletedReply = originalLength !== updatedReplies.length;

            if (hasDeletedReply && topLevelComment.count?.replies) {
                topLevelComment.count.replies -= 1;
            }

            return {
                ...topLevelComment,
                replies: updatedReplies
            };
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
                    replies: c.replies?.map((r) => r.id === comment.id ? comment : r) ?? []
                };
            }
            return c.id === comment.id ? comment : c;
        })
    };
}

/**
 * Checks if member data has changed
 */
function hasMemberChanges(data: {name: string, expertise: string}, state: EditableAppContext): boolean {
    const nameChanged = data.name && state.member?.name !== data.name;
    const expertiseChanged = data.expertise !== undefined && state.member?.expertise !== data.expertise;
    return nameChanged || expertiseChanged;
}

/**
 * Builds patch data for member update
 */
function buildMemberPatchData(data: {name: string, expertise: string}, state: EditableAppContext): {name?: string, expertise?: string} {
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
    if (!hasMemberChanges(data, state)) {
        return null;
    }

    const patchData = buildMemberPatchData(data, state);

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
    return {popup: data};
}

function closePopup() {
    return {popup: null};
}

/**
 * Checks if form already exists for comment
 */
function formExistsForComment(forms: OpenCommentForm[], commentId: string): boolean {
    return forms.some(f => f.id === commentId || f.parent_id === commentId);
}

async function openCommentForm({data: newForm, api, state}: {data: OpenCommentForm, api: GhostApi, state: EditableAppContext}) {
    let otherStateChanges = {};

    const topLevelCommentId = newForm.parent_id || newForm.id;
    if (newForm.type === 'reply' && !formExistsForComment(state.openCommentForms, topLevelCommentId)) {
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
    return {commentIdToHighlight: commentId};
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
    return {commentIdToHighlight: commentId};
}

function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string, hasUnsavedChanges: boolean}, state: EditableAppContext}) {
    const updatedForms = state.openCommentForms.map((f) => 
        f.id === id ? {...f, hasUnsavedChanges} : {...f}
    );

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
    return await handler?.({data, state, api, adminApi, options, dispatchAction} as any) || {};
}

export function SyncActionHandler({action, data, state, api, adminApi, options}: {action: SyncActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    return handler?.({data, state, api, adminApi, options} as any) || {};
}
```