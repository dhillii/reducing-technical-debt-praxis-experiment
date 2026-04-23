import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

/** Helper to determine if admin API can be used */
function canUseAdminApi(state: EditableAppContext): boolean {
    return !!state.adminApi?.browse;
}

/** Helper to merge comment lists without duplicates */
function dedupeComments(comments: Comment[]): Comment[] {
    return comments.filter((c, i, self) => self.findIndex(t => t.id === c.id) === i);
}

/** Load additional comment pages */
async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?: string}): Promise<Partial<EditableAppContext>> {
    const nextPage = (state.pagination?.page ?? 0) + 1;
    const browseParams = {
        page: nextPage,
        postId: options.postId,
        order: order ?? state.order,
        memberUuid: state.member?.uuid
    };

    const data = canUseAdminApi(state)
        ? await state.adminApi!.browse(browseParams)
        : await api.comments.browse(browseParams);

    const merged = dedupeComments([...state.comments, ...data.comments]);

    return {
        comments: merged,
        pagination: data.meta.pagination
    };
}

/** Set loading flag for comments */
function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {commentsIsLoading: isLoading};
}

/** Change comment ordering */
async function setOrder({state, data: {order}, options, api, dispatchAction}: {state: EditableAppContext, data: {order: string}, options: CommentsOptions, api: GhostApi, dispatchAction: DispatchActionType}) {
    dispatchAction('setCommentsIsLoading', true);
    try {
        const browseParams = {page: 1, postId: options.postId, order, memberUuid: state.member?.uuid};
        const data = canUseAdminApi(state)
            ? await state.adminApi!.browse(browseParams)
            : await api.comments.browse(browseParams);

        return {
            comments: [...data.comments],
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

/** Load more replies for a comment */
async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const fetchReplies = async (afterReplyId: string | undefined, requestLimit: number) => {
        const params = {commentId: comment.id, afterReplyId, limit: requestLimit, memberUuid: state.member?.uuid};
        return canUseAdminApi(state) && !isReply
            ? await state.adminApi!.replies(params)
            : await api.comments.replies(params);
    };

    const lastReply = comment.replies?.[comment.replies.length - 1];
    let afterReplyId = lastReply?.id;
    let allReplies: Comment[] = [];

    if (limit === 'all') {
        let hasMore = true;
        while (hasMore) {
            const data = await fetchReplies(afterReplyId, 100);
            allReplies.push(...data.comments);
            hasMore = !!data.meta.pagination.next;
            afterReplyId = data.comments?.[data.comments.length - 1]?.id;
        }
    } else {
        const data = await fetchReplies(afterReplyId, (limit as number) ?? 100);
        allReplies = data.comments;
    }

    return {
        comments: state.comments.map(c => c.id === comment.id ? {...comment, replies: [...comment.replies ?? [], ...allReplies]} : c)
    };
}

/** Add a new top‑level comment */
async function addComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, data: AddComment}) {
    const {comments} = await api.comments.add({comment});
    const newComment = comments[0];
    return {
        comments: [newComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

/** Add a reply to an existing comment */
async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}) {
    const replyToAdd = {...reply, parent_id: parent.id};
    const {comments} = await api.comments.add({comment: replyToAdd});
    const savedReply = comments[0];

    return {
        comments: state.comments.map(c => c.id === parent.id
            ? {
                ...parent,
                replies: [...parent.replies, savedReply],
                count: {...parent.count, replies: parent.count.replies + 1}
            }
            : c),
        commentCount: state.commentCount + 1
    };
}

/** Hide a comment (admin only) */
async function hideComment({state, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    if (state.adminApi?.hideComment) {
        await state.adminApi.hideComment(comment.id);
    }
    return {
        comments: state.comments.map(c => ({
            ...c,
            status: c.id === comment.id ? 'hidden' : c.status,
            replies: c.replies.map(r => r.id === comment.id ? {...r, status: 'hidden'} : r)
        })),
        commentCount: state.commentCount - 1
    };
}

/** Show a previously hidden comment */
async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    if (state.adminApi?.showComment) {
        await state.adminApi.showComment({id: comment.id});
    }

    const readParams = {commentId: comment.id, memberUuid: state.member?.uuid};
    const data = canUseAdminApi(state)
        ? await state.adminApi!.read(readParams)
        : await api.comments.read(comment.id);

    const updated = data.comments[0];

    return {
        comments: state.comments.map(c => ({
            ...c,
            ...(c.id === comment.id ? updated : {}),
            replies: c.replies.map(r => r.id === comment.id ? updated : r)
        })),
        commentCount: state.commentCount + 1
    };
}

/** Update like state for a comment and its replies */
async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: state.comments.map(c => ({
            ...c,
            liked: c.id === comment.id ? comment.liked : c.liked,
            count: {
                ...c.count,
                likes: c.id === comment.id
                    ? comment.liked ? c.count.likes + 1 : c.count.likes - 1
                    : c.count.likes
            },
            replies: c.replies.map(r => ({
                ...r,
                liked: r.id === comment.id ? comment.liked : r.liked,
                count: {
                    ...r.count,
                    likes: r.id === comment.id
                        ? comment.liked ? r.count.likes + 1 : r.count.likes - 1
                        : r.count.likes
                }
            }))
        }))
    };
}

/** Optimistically like a comment */
async function likeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    }
}

/** Optimistically unlike a comment */
async function unlikeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    try {
        await api.comments.unlike({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    }
}

/** Report a comment */
async function reportComment({api, data: comment}: {api: GhostApi, data: {id: string}}) {
    await api.comments.report({comment});
    return {};
}

/** Delete a comment (admin only) */
async function deleteComment({state, api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    await api.comments.edit({comment: {id: comment.id, status: 'deleted'}});
    const target = state.comments.find(c => c.id === comment.id);

    if (target && (!target.replies?.length)) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    return {
        comments: state.comments.map(top => {
            if (top.id === comment.id) {
                return top.replies?.length
                    ? {...top, status: 'deleted'}
                    : null;
            }

            const filteredReplies = top.replies.filter(r => r.id !== comment.id);
            if (top.replies.length !== filteredReplies.length && top.count?.replies) {
                top.count.replies -= 1;
            }

            return {...top, replies: filteredReplies};
        }).filter(Boolean),
        commentCount: state.commentCount - 1
    };
}

/** Edit an existing comment */
async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const {comments} = await api.comments.edit({comment});
    const updated = comments[0];

    return {
        comments: state.comments.map(c => {
            if (parent?.id === c.id) {
                return {...c, replies: c.replies.map(r => r.id === updated.id ? updated : r)};
            }
            return c.id === updated.id ? updated : c;
        })
    };
}

/** Update member profile */
async function updateMember({data, state, api}: {data: {name: string, expertise: string}, state: EditableAppContext, api: GhostApi}) {
    const patch: {name?: string; expertise?: string} = {};
    if (data.name && data.name !== state.member?.name) patch.name = data.name;
    if (data.expertise !== undefined && data.expertise !== state.member?.expertise) patch.expertise = data.expertise;

    if (!Object.keys(patch).length) return null;

    try {
        const member = await api.member.update(patch);
        if (!member) throw new Error('Failed to update member');
        return {member, success: true};
    } catch (err) {
        return {success: false, error: err};
    }
}

/** Open a popup page */
function openPopup({data}: {data: Page}) {
    return {popup: data};
}

/** Close any popup */
function closePopup() {
    return {popup: null};
}

/** Open a comment form, loading replies when necessary */
async function openCommentForm({data: newForm, api, state}: {data: OpenCommentForm, api: GhostApi, state: EditableAppContext}) {
    let extraState: Partial<EditableAppContext> = {};

    const topLevelId = newForm.parent_id || newForm.id;
    if (newForm.type === 'reply' && !state.openCommentForms.some(f => f.id === topLevelId || f.parent_id === topLevelId)) {
        const parentComment = state.comments.find(c => c.id === topLevelId);
        if (parentComment) {
            const moreReplies = await loadMoreReplies({state, api, data: {comment: parentComment, limit: 'all'}, isReply: true});
            extraState = {...extraState, ...moreReplies};
        }
    }

    const activeForms = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const existingIdx = activeForms.findIndex(f => f.id === newForm.id);

    if (existingIdx > -1) {
        activeForms[existingIdx] = newForm;
        return {openCommentForms: activeForms, ...extraState};
    }

    return {openCommentForms: [...activeForms, newForm], ...extraState};
}

/** Set comment highlight */
function setHighlightComment({data: commentId}: {data: string | null}) {
    return {commentIdToHighlight: commentId};
}

/** Highlight a comment temporarily */
function highlightComment({data: {commentId}, dispatchAction}: {data: {commentId: string | null}; state: EditableAppContext; dispatchAction: DispatchActionType}) {
    setTimeout(() => dispatchAction('setHighlightComment', null), 3000);
    return {commentIdToHighlight: commentId};
}

/** Track unsaved changes in a comment form */
function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string, hasUnsavedChanges: boolean}, state: EditableAppContext}) {
    const updated = state.openCommentForms.map(f => f.id === id ? {...f, hasUnsavedChanges} : f);
    return {openCommentForms: updated};
}

/** Close a specific comment form */
function closeCommentForm({data: id, state}: {data: string, state: EditableAppContext}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

/** Set scroll target comment */
function setScrollTarget({data: commentId}: {data: string | null}) {
    return {commentIdToScrollTo: commentId};
}

/** Synchronous UI actions */
export const SyncActions = {
    openPopup,
    closePopup,
    closeCommentForm,
    setCommentFormHasUnsavedChanges,
    setScrollTarget
};

export type SyncActionType = keyof typeof SyncActions;

/** Asynchronous actions */
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

/** Handle asynchronous actions */
export async function ActionHandler({action, data, state, api, adminApi, options, dispatchAction}: {action: ActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi, dispatchAction: DispatchActionType}): Promise<Partial<EditableAppContext>> {
    const handler = Actions[action];
    return handler ? (await handler({data, state, api, adminApi, options, dispatchAction} as any)) || {} : {};
}

/** Handle synchronous actions */
export function SyncActionHandler({action, data, state, api, adminApi, options}: {action: SyncActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    return handler ? (handler({data, state, api, adminApi, options} as any)) || {} : {};
}