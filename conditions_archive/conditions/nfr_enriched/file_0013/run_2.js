```typescript
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

// Helper: Fetch comments based on admin or public API
async function fetchComments({state, api, page, postId, order, memberUuid}: {state: EditableAppContext, api: GhostApi, page: number, postId: string, order: string, memberUuid?: string}) {
    if (state.admin && state.adminApi) {
        return await state.adminApi.browse({page, postId, order, memberUuid});
    }
    return await api.comments.browse({page, postId, order});
}

// Helper: Deduplicate comments by ID
function deduplicateComments(comments: Comment[]): Comment[] {
    return comments.filter((comment, index, self) => self.findIndex(c => c.id === comment.id) === index);
}

// Helper: Get next page number
function getNextPage(state: EditableAppContext): number {
    return (state.pagination?.page ?? 0) + 1;
}

async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?: string}): Promise<Partial<EditableAppContext>> {
    const page = getNextPage(state);
    const data = await fetchComments({
        state,
        api,
        page,
        postId: options.postId,
        order: order ?? state.order,
        memberUuid: state.member?.uuid
    });

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
        const data = await fetchComments({
            state,
            api,
            page: 1,
            postId: options.postId,
            order,
            memberUuid: state.member?.uuid
        });

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

// Helper: Fetch replies from admin or public API
async function fetchReplies({state, api, commentId, afterReplyId, limit, isReply}: {state: EditableAppContext, api: GhostApi, commentId: string, afterReplyId?: string, limit: number, isReply: boolean}) {
    if (state.admin && state.adminApi && !isReply) {
        return await state.adminApi.replies({commentId, afterReplyId, limit, memberUuid: state.member?.uuid});
    }
    return await api.comments.replies({commentId, afterReplyId, limit});
}

// Helper: Get the last reply ID from a comment
function getLastReplyId(comment: Comment): string | undefined {
    return comment.replies?.[comment.replies.length - 1]?.id;
}

// Helper: Load all replies with pagination
async function loadAllReplies({state, api, commentId, isReply}: {state: EditableAppContext, api: GhostApi, commentId: string, isReply: boolean}): Promise<Comment[]> {
    let afterReplyId: string | undefined;
    let allComments: Comment[] = [];
    let hasMore = true;

    while (hasMore) {
        const data = await fetchReplies({state, api, commentId, afterReplyId, limit: 100, isReply});
        allComments.push(...data.comments);
        hasMore = !!data.meta.pagination.next;
        afterReplyId = data.comments?.[data.comments.length - 1]?.id;
    }

    return allComments;
}

// Helper: Load limited replies
async function loadLimitedReplies({state, api, commentId, limit, isReply}: {state: EditableAppContext, api: GhostApi, commentId: string, limit: number, isReply: boolean}): Promise<Comment[]> {
    const data = await fetchReplies({state, api, commentId, limit, isReply});
    return data.comments;
}

async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const afterReplyId = getLastReplyId(comment);
    
    const allComments = limit === 'all'
        ? await loadAllReplies({state, api, commentId: comment.id, isReply})
        : await loadLimitedReplies({state, api, commentId: comment.id, limit: (limit as number) ?? 100, isReply});

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
    const newComment = data.comments[0];

    return {
        comments: [newComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}) {
    const commentData = {
        ...reply,
        parent_id: parent.id
    };

    const data = await api.comments.add({comment: commentData});
    const newComment = data.comments[0];

    return {
        comments: state.comments.map((c) => {
            if (c.id === parent.id) {
                return {
                    ...parent,
                    replies: [...(parent.replies ?? []), newComment],
                    count: {
                        ...parent.count,
                        replies: (parent.count?.replies ?? 0) + 1
                    }
                };
            }
            return c;
        }),
        commentCount: state.commentCount + 1
    };
}

// Helper: Update comment status in replies
function updateReplyStatus(replies: Comment[], commentId: string, status: string): Comment[] {
    return replies.map((r) => {
        if (r.id === commentId) {
            return {...r, status};
        }
        return r;
    });
}

// Helper: Update comment in state tree
function updateCommentInState(comments: Comment[], commentId: string, updates: Partial<Comment>): Comment[] {
    return comments.map((c) => {
        if (c.id === commentId) {
            return {...c, ...updates};
        }
        return {
            ...c,
            replies: updateReplyStatus(c.replies ?? [], commentId, updates.status ?? c.replies?.[0]?.status ?? '')
        };
    });
}

async function hideComment({state, data: comment}: {state: EditableAppContext, adminApi?: any, data: {id: string}}) {
    await state.adminApi?.hideComment(comment.id);

    return {
        comments: state.comments.map((c) => {
            const replies = updateReplyStatus(c.replies ?? [], comment.id, 'hidden');

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

// Helper: Fetch updated comment data
async function fetchUpdatedComment({state, api, commentId}: {state: EditableAppContext, api: GhostApi, commentId: string}): Promise<Comment> {
    if (state.admin && state.adminApi) {
        const data = await state.adminApi.read({commentId, memberUuid: state.member?.uuid});
        return data.comments[0];
    }
    const data = await api.comments.read(commentId);
    return data.comments[0];
}

async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi?: any, data: {id: string}}) {
    await state.adminApi?.showComment({id: comment.id});

    const updatedComment = await fetchUpdatedComment({state, api, commentId: comment.id});

    return {
        comments: state.comments.map((c) => {
            const replies = (c.replies ?? []).map((r) => {
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

// Helper: Update like count
function updateLikeCount(currentCount: number, liked: boolean): number {
    return liked ? currentCount + 1 : currentCount - 1;
}

// Helper: Update reply like state
function updateReplyLikeState(replies: Comment[], commentId: string, liked: boolean): Comment[] {
    return replies.map((r) => {
        if (r.id === commentId) {
            return {
                ...r,
                liked,
                count: {
                    ...r.count,
                    likes: updateLikeCount(r.count?.likes ?? 0, liked)
                }
            };
        }
        return r;
    });
}

async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: state.comments.map((c) => {
            const replies = updateReplyLikeState(c.replies ?? [], comment.id, comment.liked);

            if (c.id === comment.id) {
                return {
                    ...c,
                    liked: comment.liked,
                    replies,
                    count: {
                        ...c.count,
                        likes: updateLikeCount(c.count?.likes ?? 0, comment.liked)
                    }
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

// Helper: Check if comment has no replies
function hasNoReplies(comment: Comment): boolean {
    return !comment.replies || comment.replies.length === 0;
}

// Helper: Filter out deleted top-level comments with no replies
function filterDeletedComments(comments: Comment[]): Comment[] {
    return comments.filter(Boolean) as Comment[];
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
        comments: filterDeletedComments(state.comments.map((topLevelComment) => {
            if (topLevelComment.id === comment.id) {
                return topLevelComment.replies?.length ? {...topLevelComment, status: 'deleted'} : null;
            }

            const updatedReplies = (topLevelComment.replies ?? []).filter(reply => reply.id !== comment.id);
            const hasDeletedReply = (topLevelComment.replies?.length ?? 0) !== updatedReplies.length;

            if (hasDeletedReply && topLevelComment.count?.replies) {
                topLevelComment.count.replies -= 1;
            }

            return {
                ...topLevelComment,
                replies: updatedReplies
            };
        })),
        commentCount: state.commentCount - 1
    };
}

async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const data = await api.comments.edit({comment});
    const updatedComment = data.comments[0];

    return {
        comments: state.comments.map((c) => {
            if (parent?.id === c.id) {
                return {
                    ...c,
                    replies: (c.replies ?? []).map((r) => {
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
        })
    };
}

// Helper: Build member patch data
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
    const patchData = buildMemberPatchData(data, state);

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

// Helper: Check if form already exists for comment
function findExistingFormIndex(forms: OpenCommentForm[], newForm: OpenCommentForm): number {
    return forms.findIndex(form => form.id === newForm.id);
}

// Helper: Load all replies for a comment
async function loadAllRepliesForComment({state, api, comment}: {state: EditableAppContext, api: GhostApi, comment: Comment}) {
    return await loadMoreReplies({state, api, data: {comment, limit: 'all'}, isReply: true});
}

async function openCommentForm({data: newForm, api, state}: {data: OpenCommentForm, api: GhostApi, state: EditableAppContext}) {
    let otherStateChanges = {};

    const topLevelCommentId = newForm.parent_id ?? newForm.id;
    const isReplyFormWithoutLoadedReplies = newForm.type === 'reply' && !state.openCommentForms.some(f => f.id === topLevelCommentId || f.parent_id === topLevelCommentId);

    if (isReplyFormWithoutLoadedReplies) {
        const comment = state.comments.find(c => c.id === topLevelCommentId);
        if (comment) {
            const newCommentsState = await loadAllRepliesForComment({state, api, comment});
            otherStateChanges = {...otherStateChanges, ...newCommentsState};
        }
    }

    const openFormsAfterAutoclose = state.openCommentForms.filter(form => form.hasUnsavedChanges);
    const openFormIndexForId = findExistingFormIndex(openFormsAfterAutoclose, newForm);

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
        return await handler({data, state, api, adminApi, options, dispatchAction} as any) ?? {};
    }
    return {};
}

/** Handle actions in the App, returns updated state */
export function SyncActionHandler({action, data, state, api, adminApi, options}: {action: SyncActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    if (handler) {
        return handler({data, state, api, adminApi, options} as any) ?? {};
    }
    return {};
}
```