```typescript
import {
    AddComment,
    Comment,
    CommentsOptions,
    DispatchActionType,
    EditableAppContext,
    OpenCommentForm
} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/* ---------- Helper utilities ---------- */

/** Resolve admin API when available */
function getAdminApi(state: EditableAppContext): AdminApi | undefined {
    return state.admin && state.adminApi ? state.adminApi : undefined;
}

/** Fetch comments for a given page/order */
async function fetchComments({
    state,
    api,
    options,
    page = 1,
    order
}: {
    state: EditableAppContext;
    api: GhostApi;
    options: CommentsOptions;
    page?: number;
    order?: string;
}): Promise<{comments: Comment[]; pagination: any}> {
    const admin = getAdminApi(state);
    if (admin) {
        return admin.browse({
            page,
            postId: options.postId,
            order: order ?? state.order,
            memberUuid: state.member?.uuid
        });
    }
    return api.comments.browse({
        page,
        postId: options.postId,
        order: order ?? state.order
    });
}

/** Fetch replies for a comment */
async function fetchReplies({
    state,
    api,
    commentId,
    afterReplyId,
    limit,
    isReply
}: {
    state: EditableAppContext;
    api: GhostApi;
    commentId: string;
    afterReplyId?: string;
    limit: number;
    isReply: boolean;
}): Promise<{comments: Comment[]; meta: any}> {
    const admin = getAdminApi(state);
    if (admin && !isReply) {
        return admin.replies({
            commentId,
            afterReplyId,
            limit,
            memberUuid: state.member?.uuid
        });
    }
    return api.comments.replies({
        commentId,
        afterReplyId,
        limit
    });
}

/** Replace a comment (or its reply) inside the state */
function replaceCommentInState(
    state: EditableAppContext,
    targetId: string,
    updater: (c: Comment) => Comment
): Comment[] {
    return state.comments.map(c => {
        if (c.id === targetId) {
            return updater(c);
        }
        const updatedReplies = c.replies.map(r => (r.id === targetId ? updater(r) : r));
        return { ...c, replies: updatedReplies };
    });
}

/* ---------- Action implementations ---------- */

async function loadMoreComments({
    state,
    api,
    options,
    order
}: {
    state: EditableAppContext;
    api: GhostApi;
    options: CommentsOptions;
    order?: string;
}): Promise<Partial<EditableAppContext>> {
    const nextPage = state.pagination?.page ? state.pagination.page + 1 : 1;
    const data = await fetchComments({state, api, options, page: nextPage, order});
    const merged = [...state.comments, ...data.comments];
    const deduped = merged.filter(
        (c, i, self) => self.findIndex(s => s.id === c.id) === i
    );
    return {comments: deduped, pagination: data.pagination};
}

function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {commentsIsLoading: isLoading};
}

async function setOrder({
    state,
    data: {order},
    options,
    api,
    dispatchAction
}: {
    state: EditableAppContext;
    data: {order: string};
    options: CommentsOptions;
    api: GhostApi;
    dispatchAction: DispatchActionType;
}) {
    dispatchAction('setCommentsIsLoading', true);
    try {
        const data = await fetchComments({state, api, options, order});
        return {
            comments: data.comments,
            pagination: data.pagination,
            order,
            commentsIsLoading: false
        };
    } catch (error) {
        console.error('Failed to set order:', error);
        state.commentsIsLoading = false;
        throw error;
    }
}

async function loadMoreReplies({
    state,
    api,
    data: {comment, limit},
    isReply
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {comment: Comment; limit?: number | 'all'};
    isReply: boolean;
}): Promise<Partial<EditableAppContext>> {
    const afterId = comment.replies?.[comment.replies.length - 1]?.id;
    const requestLimit = limit === 'all' ? 100 : (limit as number) ?? 100;

    if (limit === 'all') {
        let afterReplyId = afterId;
        const all: Comment[] = [];
        let hasMore = true;
        while (hasMore) {
            const resp = await fetchReplies({
                state,
                api,
                commentId: comment.id,
                afterReplyId,
                limit: requestLimit,
                isReply
            });
            all.push(...resp.comments);
            hasMore = !!resp.meta.pagination.next;
            afterReplyId = resp.comments?.[resp.comments.length - 1]?.id;
        }
        return {
            comments: replaceCommentInState(state, comment.id, c => ({
                ...c,
                replies: [...c.replies, ...all]
            }))
        };
    }

    const resp = await fetchReplies({
        state,
        api,
        commentId: comment.id,
        afterReplyId: afterId,
        limit: requestLimit,
        isReply
    });
    return {
        comments: replaceCommentInState(state, comment.id, c => ({
            ...c,
            replies: [...c.replies, ...resp.comments]
        }))
    };
}

async function addComment({
    state,
    api,
    data: comment
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: AddComment;
}) {
    const {comments} = await api.comments.add({comment});
    const newComment = comments[0];
    return {
        comments: [newComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

async function addReply({
    state,
    api,
    data: {reply, parent}
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {reply: any; parent: any};
}) {
    const replyWithParent = {...reply, parent_id: parent.id};
    const {comments} = await api.comments.add({comment: replyWithParent});
    const saved = comments[0];
    return {
        comments: replaceCommentInState(state, parent.id, c => ({
            ...c,
            replies: [...c.replies, saved],
            count: {...c.count, replies: c.count.replies + 1}
        })),
        commentCount: state.commentCount + 1
    };
}

async function hideComment({
    state,
    data: comment
}: {
    state: EditableAppContext;
    adminApi: any;
    data: {id: string};
}) {
    await getAdminApi(state)?.hideComment(comment.id);
    return {
        comments: replaceCommentInState(state, comment.id, c => ({
            ...c,
            status: 'hidden'
        })),
        commentCount: state.commentCount - 1
    };
}

async function showComment({
    state,
    api,
    data: comment
}: {
    state: EditableAppContext;
    api: GhostApi;
    adminApi: any;
    data: {id: string};
}) {
    await getAdminApi(state)?.showComment({id: comment.id});
    const source = getAdminApi(state)
        ? await getAdminApi(state)!.read({commentId: comment.id, memberUuid: state.member?.uuid})
        : await api.comments.read(comment.id);
    const updated = source.comments[0];
    return {
        comments: replaceCommentInState(state, comment.id, () => updated),
        commentCount: state.commentCount + 1
    };
}

async function updateCommentLikeState({
    state,
    data: {id, liked}
}: {
    state: EditableAppContext;
    data: {id: string; liked: boolean};
}) {
    return {
        comments: replaceCommentInState(state, id, c => ({
            ...c,
            liked,
            count: {
                ...c.count,
                likes: liked ? c.count.likes + 1 : c.count.likes - 1
            }
        }))
    };
}

async function likeComment({
    api,
    data: comment,
    dispatchAction
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {id: string};
    dispatchAction: DispatchActionType;
}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    }
}

async function unlikeComment({
    api,
    data: comment,
    dispatchAction
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {id: string};
    dispatchAction: DispatchActionType;
}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    try {
        await api.comments.unlike({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    }
}

async function reportComment({
    api,
    data: comment
}: {
    api: GhostApi;
    data: {id: string};
}) {
    await api.comments.report({comment});
    return {};
}

async function deleteComment({
    state,
    api,
    data: comment,
    dispatchAction
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {id: string};
    dispatchAction: DispatchActionType;
}) {
    await api.comments.edit({
        comment: {id: comment.id, status: 'deleted'}
    });

    const target = state.comments.find(c => c.id === comment.id);
    if (target?.replies?.length === 0) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    const updated = state.comments
        .map(c => {
            if (c.id === comment.id) {
                return c.replies?.length
                    ? {...c, status: 'deleted'}
                    : null;
            }
            const filteredReplies = c.replies.filter(r => r.id !== comment.id);
            if (c.replies.length !== filteredReplies.length && c.count?.replies) {
                c.count.replies -= 1;
            }
            return {...c, replies: filteredReplies};
        })
        .filter(Boolean) as Comment[];

    return {
        comments: updated,
        commentCount: state.commentCount - 1
    };
}

async function editComment({
    state,
    api,
    data: {comment, parent}
}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {
        comment: Partial<Comment> & {id: string};
        parent?: Comment;
    };
}) {
    const {comments} = await api.comments.edit({comment});
    const updated = comments[0];
    if (parent) {
        return {
            comments: replaceCommentInState(state, parent.id, c => ({
                ...c,
                replies: c.replies.map(r => (r.id === updated.id ? updated : r))
            }))
        };
    }
    return {
        comments: replaceCommentInState(state, updated.id, () => updated)
    };
}

async function updateMember({
    data,
    state,
    api
}: {
    data: {name: string; expertise: string};
    state: EditableAppContext;
    api: GhostApi;
}) {
    const patch: {name?: string; expertise?: string} = {};
    if (data.name && data.name !== state.member?.name) patch.name = data.name;
    if (data.expertise !== undefined && data.expertise !== state.member?.expertise) {
        patch.expertise = data.expertise;
    }
    if (!Object.keys(patch).length) return null;

    try {
        const member = await api.member.update(patch);
        if (!member) throw new Error('Failed to update member');
        return {member, success: true};
    } catch (error) {
        return {success: false, error};
    }
}

/* ---------- Sync actions ---------- */

function openPopup({data}: {data: Page}) {
    return {popup: data};
}
function closePopup() {
    return {popup: null};
}
function closeCommentForm({data: id, state}: {data: string; state: EditableAppContext}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}
function setCommentFormHasUnsavedChanges({
    data: {id, hasUnsavedChanges},
    state
}: {
    data: {id: string; hasUnsavedChanges: boolean};
    state: EditableAppContext;
}) {
    const updated = state.openCommentForms.map(f =>
        f.id === id ? {...f, hasUnsavedChanges} : f
    );
    return {openCommentForms: updated};
}
function setScrollTarget({data: commentId}: {data: string | null}) {
    return {commentIdToScrollTo: commentId};
}

/* ---------- Open comment form ---------- */

async function openCommentForm({
    data: newForm,
    api,
    state
}: {
    data: OpenCommentForm;
    api: GhostApi;
    state: EditableAppContext;
}) {
    let extraChanges: Partial<EditableAppContext> = {};

    if (
        newForm.type === 'reply' &&
        !state.openCommentForms.some(
            f => f.id === newForm.parent_id || f.parent_id === newForm.parent_id
        )
    ) {
        const topId = newForm.parent_id || newForm.id;
        const parent = state.comments.find(c => c.id === topId);
        if (parent) {
            const more = await loadMoreReplies({
                state,
                api,
                data: {comment: parent, limit: 'all'},
                isReply: true
            });
            extraChanges = {...extraChanges, ...more};
        }
    }

    const activeForms = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const idx = activeForms.findIndex(f => f.id === newForm.id);
    if (idx > -1) {
        activeForms[idx] = newForm;
        return {openCommentForms: activeForms, ...extraChanges};
    }
    return {openCommentForms: [...activeForms, newForm], ...extraChanges};
}

/* ---------- Highlight actions ---------- */

function setHighlightComment({data: commentId}: {data: string | null}) {
    return {commentIdToHighlight: commentId};
}
function highlightComment({
    data: {commentId},
    dispatchAction
}: {
    data: {commentId: string | null};
    state: EditableAppContext;
    dispatchAction: DispatchActionType;
}) {
    setTimeout(() => dispatchAction('setHighlightComment', null), 3000);
    return {commentIdToHighlight: commentId};
}

/* ---------- Exported collections ---------- */

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

/** Handle async actions */
export async function ActionHandler({
    action,
    data,
    state,
    api,
    adminApi,
    options,
    dispatchAction
}: {
    action: ActionType;
    data: any;
    state: EditableAppContext;
    options: CommentsOptions;
    api: GhostApi;
    adminApi: AdminApi;
    dispatchAction: DispatchActionType;
}): Promise<Partial<EditableAppContext>> {
    const handler = Actions[action];
    return handler ? (await handler({data, state, api, adminApi, options, dispatchAction} as any)) || {} : {};
}

/** Handle sync actions */
export function SyncActionHandler({
    action,
    data,
    state,
    api,
    adminApi,
    options
}: {
    action: SyncActionType;
    data: any;
    state: EditableAppContext;
    options: CommentsOptions;
    api: GhostApi;
    adminApi: AdminApi;
}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    return handler ? (handler({data, state, api, adminApi, options} as any) || {}) : {};
}
```