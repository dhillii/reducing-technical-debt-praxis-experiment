import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

// Helper: Get next page number from pagination state
function getNextPageNumber(state: EditableAppContext): number {
    return (state.pagination?.page ?? 0) + 1;
}

// Helper: Fetch comments based on admin or public API
async function fetchCommentsBrowse(state: EditableAppContext, api: GhostApi, page: number, postId: string, order: string, memberUuid?: string) {
    if (state.admin && state.adminApi) {
        return await state.adminApi.browse({page, postId, order, memberUuid});
    }
    return await api.comments.browse({page, postId, order});
}

// Helper: Deduplicate comments by ID
function deduplicateComments(comments: Comment[]): Comment[] {
    return comments.filter((comment, index, self) => self.findIndex(c => c.id === comment.id) === index);
}

async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?:string}): Promise<Partial<EditableAppContext>> {
    const page = getNextPageNumber(state);
    const data = await fetchCommentsBrowse(state, api, page, options.postId, order ?? state.order, state.member?.uuid);
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
        const data = await fetchCommentsBrowse(state, api, 1, options.postId, order, state.member?.uuid);

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
async function fetchRepliesBrowse(state: EditableAppContext, api: GhostApi, commentId: string, afterReplyId: string | undefined, limit: number, isReply: boolean, memberUuid?: string) {
    if (state.admin && state.adminApi && !isReply) {
        return await state.adminApi.replies({commentId, afterReplyId, limit, memberUuid});
    }
    return await api.comments.replies({commentId, afterReplyId, limit});
}

// Helper: Get the last reply ID from a comment
function getLastReplyId(comment: Comment): string | undefined {
    return comment.replies?.[comment.replies.length - 1]?.id;
}

// Helper: Load all replies with pagination
async function loadAllReplies(state: EditableAppContext, api: GhostApi, comment: Comment, isReply: boolean): Promise<Comment[]> {
    const allComments: Comment[] = [];
    let afterReplyId: string | undefined = getLastReplyId(comment);
    let hasMore = true;

    while (hasMore) {
        const data = await fetchRepliesBrowse(state, api, comment.id, afterReplyId, 100, isReply, state.member?.uuid);
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

// Helper: Load limited replies
async function loadLimitedReplies(state: EditableAppContext, api: GhostApi, comment: Comment, limit: number, isReply: boolean): Promise<Comment[]> {
    const afterReplyId = getLastReplyId(comment);
    const data = await fetchRepliesBrowse(state, api, comment.id, afterReplyId, limit || 100, isReply, state.member?.uuid);
    return data.comments;
}

async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const allComments = limit === 'all'
        ? await loadAllReplies(state, api, comment, isReply)
        : await loadLimitedReplies(state, api, comment, limit as number, isReply);

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
    const replyWithParent = {...reply, parent_id: parent.id};
    const data = await api.comments.add({comment: replyWithParent});
    const newReply = data.comments[0];

    return {
        comments: state.comments.map((c) => {
            if (c.id === parent.id) {
                return {
                    ...parent,
                    replies: [...(parent.replies ?? []), newReply],
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

// Helper: Update comment status in nested structure
function updateCommentStatus(comments: Comment[], targetId: string, newStatus: string): Comment[] {
    return comments.map((c) => {
        const updatedReplies = c.replies?.map((r) => {
            if (r.id === targetId) {
                return {...r, status: newStatus};
            }
            return r;
        }) ?? [];

        if (c.id === targetId) {
            return {...c, status: newStatus, replies: updatedReplies};
        }

        return {...c, replies: updatedReplies};
    });
}

async function hideComment({state, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    await state.adminApi?.hideComment(comment.id);

    return {
        comments: updateCommentStatus(state.comments, comment.id, 'hidden'),
        commentCount: state.commentCount - 1
    };
}

// Helper: Fetch updated comment from API
async function fetchUpdatedComment(state: EditableAppContext, api: GhostApi, commentId: string): Promise<Comment> {
    let data;
    if (state.admin && state.adminApi) {
        data = await state.adminApi.read({commentId, memberUuid: state.member?.uuid});
    } else {
        data = await api.comments.read(commentId);
    }
    return data.comments[0];
}

// Helper: Replace comment in nested structure
function replaceComment(comments: Comment[], targetId: string, newComment: Comment): Comment[] {
    return comments.map((c) => {
        const updatedReplies = c.replies?.map((r) => {
            if (r.id === targetId) {
                return newComment;
            }
            return r;
        }) ?? [];

        if (c.id === targetId) {
            return newComment;
        }

        return {...c, replies: updatedReplies};
    });
}

async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    await state.adminApi?.showComment({id: comment.id});

    const updatedComment = await fetchUpdatedComment(state, api, comment.id);

    return {
        comments: replaceComment(state.comments, comment.id, updatedComment),
        commentCount: state.commentCount + 1
    };
}

// Helper: Update like count for a comment
function updateLikeCount(count: any, liked: boolean): any {
    return {
        ...count,
        likes: liked ? count.likes + 1 : count.likes - 1
    };
}

// Helper: Update comment like state in nested structure
function updateCommentLikeInTree(comments: Comment[], targetId: string, liked: boolean): Comment[] {
    return comments.map((c) => {
        const updatedReplies = c.replies?.map((r) => {
            if (r.id === targetId) {
                return {
                    ...r,
                    liked,
                    count: updateLikeCount(r.count, liked)
                };
            }
            return r;
        }) ?? [];

        if (c.id === targetId) {
            return {
                ...c,
                liked,
                replies: updatedReplies,
                count: updateLikeCount(c.count, liked)
            };
        }

        return {...c, replies: updatedReplies};
    });
}

async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: updateCommentLikeInTree(state.comments, comment.id, comment.liked)
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
function hasNoReplies(comment: Comment | undefined): boolean {
    return !comment?.replies?.length;
}

// Helper: Filter out null values
function filterOutNull<T>(item: T | null): item is T {
    return item !== null;
}

// Helper: Update comment deletion status
function updateCommentDeletion(comments: Comment[], targetId: string): Comment[] {
    return comments.map((topLevelComment) => {
        if (topLevelComment.id === targetId) {
            return topLevelComment.replies?.length ? {...topLevelComment, status: 'deleted'} : null;
        }

        const updatedReplies = topLevelComment.replies?.filter(reply => reply.id !== targetId) ?? [];
        const hasDeletedReply = (topLevelComment.replies?.length ?? 0) !== updatedReplies.length;

        const updatedComment = {...topLevelComment, replies: updatedReplies};

        if (hasDeletedReply && topLevelComment.count?.replies) {
            updatedComment.count = {...updatedComment.count, replies: updatedComment.count.replies - 1};
        }

        return updatedComment;
    }).filter(filterOutNull);
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
        comments: updateCommentDeletion(state.comments, comment.id),
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
                    replies: c.replies?.map((r) => {
                        if (r.id === updatedComment.id) {
                            return updatedComment;
                        }
                        return r;
                    }) ?? []
                };
            } else if (c.id === updatedComment.id) {
                return updatedComment;
            }

            return c;
        })
    };
}

// Helper: Build patch data for member update
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

// Helper: Check if form exists for comment
function formExistsForComment(forms: OpenCommentForm[], topLevelCommentId: string): boolean {
    return forms.some(f => f.id === topLevelCommentId || f.parent_id === topLevelCommentId);
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