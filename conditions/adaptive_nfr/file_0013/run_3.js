import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/** Determines if admin API should be used for fetching data */
function shouldUseAdminApi(state: EditableAppContext): boolean {
    return !!(state.admin && state.adminApi);
}

/** Fetches comments using appropriate API based on admin status */
async function fetchComments(state: EditableAppContext, api: GhostApi, page: number, postId: string, order: string): Promise<any> {
    if (shouldUseAdminApi(state)) {
        return await state.adminApi?.browse({page, postId, order, memberUuid: state.member?.uuid});
    }
    return await api.comments.browse({page, postId, order});
}

/** Fetches replies using appropriate API based on admin status and reply context */
async function fetchReplies(state: EditableAppContext, api: GhostApi, commentId: string, afterReplyId: string | undefined, limit: number, isReply: boolean): Promise<any> {
    if (shouldUseAdminApi(state) && !isReply) {
        return await state.adminApi?.replies({commentId, afterReplyId, limit, memberUuid: state.member?.uuid});
    }
    return await api.comments.replies({commentId, afterReplyId, limit});
}

/** Reads a single comment using appropriate API based on admin status */
async function readComment(state: EditableAppContext, api: GhostApi, commentId: string): Promise<any> {
    if (shouldUseAdminApi(state)) {
        return await state.adminApi?.read({commentId, memberUuid: state.member?.uuid});
    }
    return await api.comments.read(commentId);
}

/** Updates comment status in replies array */
function updateCommentInReplies(replies: Comment[], commentId: string, updater: (reply: Comment) => Comment): Comment[] {
    return replies.map((r) => {
        if (r.id === commentId) {
            return updater(r);
        }
        return r;
    });
}

/** Updates comment in top-level comments array */
function updateCommentInList(comments: Comment[], commentId: string, updater: (comment: Comment) => Comment | null): Comment[] {
    return comments.map((c) => {
        if (c.id === commentId) {
            return updater(c);
        }
        return c;
    }).filter(Boolean);
}

/** Maps over comments and their replies, applying updates */
function mapCommentsWithReplies(comments: Comment[], commentId: string, replyUpdater: (reply: Comment) => Comment, topLevelUpdater: (comment: Comment, replies: Comment[]) => Comment): Comment[] {
    return comments.map((c) => {
        const replies = updateCommentInReplies(c.replies, commentId, replyUpdater);
        if (c.id === commentId) {
            return topLevelUpdater(c, replies);
        }
        return {
            ...c,
            replies
        };
    });
}

async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?:string}): Promise<Partial<EditableAppContext>> {
    let page = 1;
    if (state.pagination?.page) {
        page = state.pagination.page + 1;
    }
    
    const data = await fetchComments(state, api, page, options.postId, order || state.order);
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
    let afterReplyId: string | undefined = comment.replies?.[comment.replies.length - 1]?.id;
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

async function hideComment({state, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    await state.adminApi?.hideComment(comment.id);
    
    return {
        comments: mapCommentsWithReplies(
            state.comments,
            comment.id,
            (r) => ({...r, status: 'hidden'}),
            (c, replies) => ({...c, status: 'hidden', replies})
        ),
        commentCount: state.commentCount - 1
    };
}

async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    await state.adminApi?.showComment({id: comment.id});
    
    const data = await readComment(state, api, comment.id);
    const updatedComment = data.comments[0];

    return {
        comments: mapCommentsWithReplies(
            state.comments,
            comment.id,
            (r) => (r.id === comment.id ? updatedComment : r),
            (c) => (c.id === comment.id ? updatedComment : c)
        ),
        commentCount: state.commentCount + 1
    };
}

async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    const likeCountDelta = comment.liked ? 1 : -1;
    
    return {
        comments: mapCommentsWithReplies(
            state.comments,
            comment.id,
            (r) => ({
                ...r,
                liked: comment.liked,
                count: {
                    ...r.count,
                    likes: r.count.likes + likeCountDelta
                }
            }),
            (c, replies) => ({
                ...c,
                liked: comment.liked,
                replies,
                count: {
                    ...c.count,
                    likes: c.count.likes + likeCountDelta
                }
            })
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
        comment: {
            id: comment.id,
            status: 'deleted'
        }
    });

    const commentToDelete = state.comments.find(c => c.id === comment.id);
    if (commentToDelete && !commentToDelete.replies?.length) {
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

            if (hasDeletedReply && topLevelComment.count?.replies) {
                topLevelComment.count.replies = topLevelComment.count.replies - 1;
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
                    replies: c.replies.map((r) => r.id === comment.id ? comment : r)
                };
            }
            return c.id === comment.id ? comment : c;
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

    if (Object.keys(patchData).length > 0) {
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
    return null;
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
    const isReplyFormWithoutLoadedReplies = newForm.type === 'reply' && !state.openCommentForms.some(f => f.id === topLevelCommentId || f.parent_id === topLevelCommentId);
    
    if (isReplyFormWithoutLoadedReplies) {
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