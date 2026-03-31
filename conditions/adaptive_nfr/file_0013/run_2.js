```typescript
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

// ─── Shared Helpers ───────────────────────────────────────────────────────────

function isAdminContext(state: EditableAppContext): boolean {
    return !!(state.admin && state.adminApi);
}

function dedupeById<T extends {id: string}>(items: T[]): T[] {
    return items.filter((item, index, self) => self.findIndex(c => c.id === item.id) === index);
}

function updateCommentInTree(
    comments: Comment[],
    predicate: (c: Comment) => boolean,
    updater: (c: Comment) => Comment | null
): Comment[] {
    return comments
        .map((c) => {
            const updatedReplies = c.replies.map(r => (predicate(r) ? updater(r) : r)).filter(Boolean) as Comment[];
            if (predicate(c)) {
                const updated = updater({...c, replies: updatedReplies});
                return updated;
            }
            return {...c, replies: updatedReplies};
        })
        .filter(Boolean) as Comment[];
}

async function browseComments(
    state: EditableAppContext,
    api: GhostApi,
    params: {page: number; postId: string; order: string}
) {
    if (isAdminContext(state)) {
        return state.adminApi!.browse({...params, memberUuid: state.member?.uuid});
    }
    return api.comments.browse(params);
}

async function readComment(state: EditableAppContext, api: GhostApi, commentId: string) {
    if (isAdminContext(state)) {
        return state.adminApi!.read({commentId, memberUuid: state.member?.uuid});
    }
    return api.comments.read(commentId);
}

async function fetchRepliesPage(
    state: EditableAppContext,
    api: GhostApi,
    commentId: string,
    afterReplyId: string | undefined,
    limit: number,
    isReply: boolean
) {
    if (isAdminContext(state) && !isReply) {
        return state.adminApi!.replies({commentId, afterReplyId, limit, memberUuid: state.member?.uuid});
    }
    return api.comments.replies({commentId, afterReplyId, limit});
}

// ─── Actions ──────────────────────────────────────────────────────────────────

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
    const page = state.pagination?.page ? state.pagination.page + 1 : 1;
    const data = await browseComments(state, api, {
        page,
        postId: options.postId,
        order: order || state.order
    });

    return {
        comments: dedupeById([...state.comments, ...data.comments]),
        pagination: data.meta.pagination
    };
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
        const data = await browseComments(state, api, {page: 1, postId: options.postId, order});
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
    const getLastReplyId = (replies: Comment[]) =>
        replies.length > 0 ? replies[replies.length - 1]?.id : undefined;

    let afterReplyId = getLastReplyId(comment.replies ?? []);
    let allComments: Comment[] = [];

    if (limit === 'all') {
        let hasMore = true;
        while (hasMore) {
            const data = await fetchRepliesPage(state, api, comment.id, afterReplyId, 100, isReply);
            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next && data.comments.length > 0;
            if (data.comments.length > 0) {
                afterReplyId = getLastReplyId(data.comments);
            }
        }
    } else {
        const data = await fetchRepliesPage(state, api, comment.id, afterReplyId, (limit as number) || 100, isReply);
        allComments = data.comments;
    }

    return {
        comments: state.comments.map(c =>
            c.id === comment.id
                ? {...comment, replies: [...comment.replies, ...allComments]}
                : c
        )
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
    const data = await api.comments.add({comment});
    const added = data.comments[0];

    return {
        comments: [added, ...state.comments],
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
    const commentPayload = {...reply, parent_id: parent.id};
    const data = await api.comments.add({comment: commentPayload});
    const added = data.comments[0];

    return {
        comments: state.comments.map(c =>
            c.id === parent.id
                ? {
                    ...parent,
                    replies: [...parent.replies, added],
                    count: {...parent.count, replies: parent.count.replies + 1}
                }
                : c
        ),
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
    if (state.adminApi) {
        await state.adminApi.hideComment(comment.id);
    }

    return {
        comments: updateCommentInTree(
            state.comments,
            c => c.id === comment.id,
            c => ({...c, status: 'hidden'})
        ),
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
    if (state.adminApi) {
        await state.adminApi.showComment({id: comment.id});
    }

    const data = await readComment(state, api, comment.id);
    const updatedComment = data.comments[0];

    return {
        comments: updateCommentInTree(
            state.comments,
            c => c.id === comment.id,
            () => updatedComment
        ),
        commentCount: state.commentCount + 1
    };
}

async function updateCommentLikeState({
    state,
    data: comment
}: {
    state: EditableAppContext;
    data: {id: string; liked: boolean};
}) {
    const applyLike = (c: Comment) => ({
        ...c,
        liked: comment.liked,
        count: {
            ...c.count,
            likes: comment.liked ? c.count.likes + 1 : c.count.likes - 1
        }
    });

    return {
        comments: updateCommentInTree(
            state.comments,
            c => c.id === comment.id,
            applyLike
        )
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

async function reportComment({api, data: comment}: {api: GhostApi; data: {id: string}}) {
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
    await api.comments.edit({comment: {id: comment.id, status: 'deleted'}});

    const topLevel = state.comments.find(c => c.id === comment.id);
    if (topLevel && (!topLevel.replies || topLevel.replies.length === 0)) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    const updatedComments = state.comments
        .map((topLevelComment) => {
            if (topLevelComment.id === comment.id) {
                return topLevelComment.replies.length > 0
                    ? {...topLevelComment, status: 'deleted'}
                    : null;
            }

            const updatedReplies = topLevelComment.replies.filter(r => r.id !== comment.id);
            const replyWasDeleted = updatedReplies.length !== topLevelComment.replies.length;

            return {
                ...topLevelComment,
                replies: updatedReplies,
                count: replyWasDeleted && topLevelComment.count?.replies
                    ? {...topLevelComment.count, replies: topLevelComment.count.replies - 1}
                    : topLevelComment.count
            };
        })
        .filter(Boolean) as Comment[];

    return {
        comments: updatedComments,
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
    data: {comment: Partial<Comment> & {id: string}; parent?: Comment};
}) {
    const data = await api.comments.edit({comment});
    const updated = data.comments[0];

    return {
        comments: state.comments.map((c) => {
            if (parent && parent.id === c.id) {
                return {
                    ...c,
                    replies: c.replies.map(r => (r.id === updated.id ? updated : r))
                };
            }
            return c.id === updated.id ? updated : c;
        })
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
    const patchData: {name?: string; expertise?: string} = {};

    if (data.name && state?.member?.name !== data.name) {
        patchData.name = data.name;
    }
    if (data.expertise !== undefined && state?.member?.expertise !== data.expertise) {
        patchData.expertise = data.expertise;
    }

    if (Object.keys(patchData).length === 0) {
        return null;
    }

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

async function openCommentForm({
    data: newForm,
    api,
    state
}: {
    data: OpenCommentForm;
    api: GhostApi;
    state: EditableAppContext;
}) {
    let otherStateChanges = {};

    const topLevelCommentId = newForm.parent_id || newForm.id;
    const isNewReplyThread =
        newForm.type === 'reply' &&
        !state.openCommentForms.some(
            f => f.id === topLevelCommentId || f.parent_id === topLevelCommentId
        );

    if (isNewReplyThread) {
        const comment = state.comments.find(c => c.id === topLevelCommentId);
        if (comment) {
            const newCommentsState = await loadMoreReplies({
                state,
                api,
                data: {comment, limit: 'all'},
                isReply: true
            });
            otherStateChanges = {...otherStateChanges, ...newCommentsState};
        }
    }

    const openFormsAfterAutoclose = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const existingIndex = openFormsAfterAutoclose.findIndex(f => f.id === newForm.id);

    if (existingIndex > -1) {
        openFormsAfterAutoclose[existingIndex] = newForm;
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
    data: {commentId: string | null};
    state: EditableAppContext;
    dispatchAction: DispatchActionType;
}) {
    setTimeout(() => dispatchAction('setHighlightComment', null),