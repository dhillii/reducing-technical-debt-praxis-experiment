import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/* ---------- Helper utilities ---------- */

/**
 * Returns the admin API instance when the current state is in admin mode.
 */
function getAdminApi(state: EditableAppContext): AdminApi | undefined {
    return state.admin && state.adminApi ? state.adminApi : undefined;
}

/**
 * Fetches a page of comments using the appropriate API (admin or public).
 */
async function fetchCommentsPage(state: EditableAppContext, api: GhostApi, options: CommentsOptions, page: number, order?: string) {
    const adminApi = getAdminApi(state);
    if (adminApi) {
        return adminApi.browse({
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

/**
 * Fetches replies for a comment using the appropriate API.
 */
async function fetchReplies(state: EditableAppContext, api: GhostApi, commentId: string, afterReplyId: string | undefined, limit: number, isReply: boolean) {
    const adminApi = getAdminApi(state);
    if (adminApi && !isReply) {
        return adminApi.replies({
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

/**
 * Updates a comment (or reply) inside a comment list.
 */
function updateCommentList(comments: Comment[], targetId: string, updater: (c: Comment) => Comment): Comment[] {
    return comments.map(c => (c.id === targetId ? updater(c) : c));
}

/**
 * Merges new comments into the existing list while preserving order and removing duplicates.
 */
function mergeAndDedupComments(existing: Comment[], incoming: Comment[]): Comment[] {
    const combined = [...existing, ...incoming];
    return combined.filter((c, i, self) => self.findIndex(item => item.id === c.id) === i);
}

/* ---------- Action implementations ---------- */

async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?: string}): Promise<Partial<EditableAppContext>> {
    const nextPage = (state.pagination?.page ?? 0) + 1;
    const data = await fetchCommentsPage(state, api, options, nextPage, order);
    return {
        comments: mergeAndDedupComments(state.comments, data.comments),
        pagination: data.meta.pagination
    };
}

function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {commentsIsLoading: isLoading};
}

async function setOrder({state, data: {order}, options, api, dispatchAction}: {state: EditableAppContext, data: {order: string}, options: CommentsOptions, api: GhostApi, dispatchAction: DispatchActionType}) {
    dispatchAction('setCommentsIsLoading', true);
    try {
        const data = await fetchCommentsPage(state, api, options, 1, order);
        return {
            comments: data.comments,
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

/**
 * Retrieves all replies for a comment, handling pagination internally.
 */
async function loadAllReplies(state: EditableAppContext, api: GhostApi, comment: Comment): Promise<Comment[]> {
    let afterReplyId: string | undefined = comment.replies?.[comment.replies.length - 1]?.id;
    const all: Comment[] = [];
    let hasMore = true;

    while (hasMore) {
        const data = await fetchReplies(state, api, comment.id, afterReplyId, 100, false);
        all.push(...data.comments);
        hasMore = !!data.meta.pagination.next;
        afterReplyId = data.comments?.[data.comments.length - 1]?.id;
    }

    return all;
}

/**
 * Loads a limited set of replies for a comment.
 */
async function loadLimitedReplies(state: EditableAppContext, api: GhostApi, comment: Comment, limit: number): Promise<Comment[]> {
    const afterReplyId = comment.replies?.[comment.replies.length - 1]?.id;
    const data = await fetchReplies(state, api, comment.id, afterReplyId, limit, false);
    return data.comments;
}

async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const replies = limit === 'all'
        ? await loadAllReplies(state, api, comment)
        : await loadLimitedReplies(state, api, comment, limit as number ?? 100);

    return {
        comments: updateCommentList(state.comments, comment.id, c => ({
            ...c,
            replies: [...(c.replies ?? []), ...replies]
        }))
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
    const replyWithParent = {...reply, parent_id: parent.id};
    const result = await api.comments.add({comment: replyWithParent});
    const savedReply = result.comments[0];

    return {
        comments: updateCommentList(state.comments, parent.id, c => ({
            ...c,
            replies: [...(c.replies ?? []), savedReply],
            count: {
                ...c.count,
                replies: (c.count?.replies ?? 0) + 1
            }
        })),
        commentCount: state.commentCount + 1
    };
}

async function hideComment({state, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    const adminApi = getAdminApi(state);
    if (adminApi) {
        await adminApi.hideComment(comment.id);
    }
    return {
        comments: state.comments.map(c => ({
            ...c,
            status: c.id === comment.id ? 'hidden' : c.status,
            replies: c.replies.map(r => ({
                ...r,
                status: r.id === comment.id ? 'hidden' : r.status
            }))
        })),
        commentCount: state.commentCount - 1
    };
}

async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    const adminApi = getAdminApi(state);
    if (adminApi) {
        await adminApi.showComment({id: comment.id});
    }

    const data = adminApi
        ? await adminApi.read({commentId: comment.id, memberUuid: state.member?.uuid})
        : await api.comments.read(comment.id);

    const updated = data.comments[0];

    return {
        comments: state.comments.map(c => ({
            ...c,
            ...(c.id === comment.id ? updated : {}),
            replies: c.replies.map(r => (r.id === comment.id ? updated : r))
        })),
        commentCount: state.commentCount + 1
    };
}

async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: state.comments.map(c => ({
            ...c,
            liked: c.id === comment.id ? comment.liked : c.liked,
            count: {
                ...c.count,
                likes: c.id === comment.id
                    ? comment.liked ? (c.count?.likes ?? 0) + 1 : (c.count?.likes ?? 0) - 1
                    : c.count?.likes
            },
            replies: c.replies.map(r => ({
                ...r,
                liked: r.id === comment.id ? comment.liked : r.liked,
                count: {
                    ...r.count,
                    likes: r.id === comment.id
                        ? comment.liked ? (r.count?.likes ?? 0) + 1 : (r.count?.likes ?? 0) - 1
                        : r.count?.likes
                }
            }))
        }))
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

    const target = state.comments.find(c => c.id === comment.id);
    if (target && (!target.replies?.length)) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    return {
        comments: state.comments
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
            .filter(Boolean) as Comment[],
        commentCount: state.commentCount - 1
    };
}

async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const result = await api.comments.edit({comment});
    const updated = result.comments[0];

    if (parent) {
        return {
            comments: updateCommentList(state.comments, parent.id, p => ({
                ...p,
                replies: updateCommentList(p.replies, updated.id, () => updated)
            }))
        };
    }

    return {
        comments: updateCommentList(state.comments, updated.id, () => updated)
    };
}

async function updateMember({data, state, api}: {data: {name: string, expertise: string}, state: EditableAppContext, api: GhostApi}) {
    const {name, expertise} = data;
    const patch: {name?: string; expertise?: string} = {};

    if (name && state.member?.name !== name) {
        patch.name = name;
    }
    if (expertise !== undefined && state.member?.expertise !== expertise) {
        patch.expertise = expertise;
    }

    if (Object.keys(patch).length === 0) {
        return null;
    }

    try {
        const member = await api.member.update(patch);
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

async function openCommentForm({data: newForm, api, state}: {data: OpenCommentForm, api: GhostApi, state: EditableAppContext}) {
    let extraChanges: Partial<EditableAppContext> = {};

    const topLevelId = newForm.parent_id || newForm.id;
    if (newForm.type === 'reply' && !state.openCommentForms.some(f => f.id === topLevelId || f.parent_id === topLevelId)) {
        const parentComment = state.comments.find(c => c.id === topLevelId);
        if (parentComment) {
            const moreReplies = await loadMoreReplies({state, api, data: {comment: parentComment, limit: 'all'}, isReply: true});
            extraChanges = {...extraChanges, ...moreReplies};
        }
    }

    const activeForms = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const existingIdx = activeForms.findIndex(f => f.id === newForm.id);

    if (existingIdx > -1) {
        activeForms[existingIdx] = newForm;
        return {openCommentForms: activeForms, ...extraChanges};
    }

    return {openCommentForms: [...activeForms, newForm], ...extraChanges};
}

function setHighlightComment({data: commentId}: {data: string | null}) {
    return {commentIdToHighlight: commentId};
}

function highlightComment({data: {commentId}, dispatchAction}: {data: {commentId: string | null}; state: EditableAppContext; dispatchAction: DispatchActionType}) {
    setTimeout(() => dispatchAction('setHighlightComment', null), 3000);
    return {commentIdToHighlight: commentId};
}

function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string, hasUnsavedChanges: boolean}, state: EditableAppContext}) {
    const updated = state.openCommentForms.map(f => (f.id === id ? {...f, hasUnsavedChanges} : f));
    return {openCommentForms: updated};
}

function closeCommentForm({data: id, state}: {data: string, state: EditableAppContext}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

function setScrollTarget({data: commentId}: {data: string | null}) {
    return {commentIdToScrollTo: commentId};
}

/* ---------- Exported action collections ---------- */

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
    return handler ? (await handler({data, state, api, adminApi, options, dispatchAction} as any)) || {} : {};
}

/** Handle sync actions in the App, returns updated state */
export function SyncActionHandler({action, data, state, api, adminApi, options}: {action: SyncActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    return handler ? (handler({data, state, api, adminApi, options} as any)) || {} : {};
}