```typescript
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

// ─── Helpers ────────────────────────────────────────────────────────────────

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
                return updater({...c, replies: updatedReplies});
            }
            return {...c, replies: updatedReplies};
        })
        .filter(Boolean) as Comment[];
}

async function browseComments(
    state: EditableAppContext,
    api: GhostApi,
    options: CommentsOptions,
    page: number,
    order?: string
) {
    const effectiveOrder = order ?? state.order;
    if (isAdminContext(state)) {
        return state.adminApi!.browse({page, postId: options.postId, order: effectiveOrder, memberUuid: state.member?.uuid});
    }
    return api.comments.browse({page, postId: options.postId, order: effectiveOrder});
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

async function fetchAllReplies(
    state: EditableAppContext,
    api: GhostApi,
    comment: Comment,
    isReply: boolean
): Promise<Comment[]> {
    const allComments: Comment[] = [];
    let afterReplyId = getLastReplyId(comment);

    while (true) {
        const data = await fetchRepliesPage(state, api, comment.id, afterReplyId, 100, isReply);
        allComments.push(...data.comments);

        if (!data.meta.pagination.next || data.comments.length === 0) {
            break;
        }
        afterReplyId = data.comments[data.comments.length - 1]?.id;
    }

    return allComments;
}

function getLastReplyId(comment: Comment): string | undefined {
    return comment.replies?.length > 0 ? comment.replies[comment.replies.length - 1]?.id : undefined;
}

function appendRepliesToComment(comments: Comment[], targetComment: Comment, newReplies: Comment[]): Comment[] {
    return comments.map(c =>
        c.id === targetComment.id
            ? {...targetComment, replies: [...targetComment.replies, ...newReplies]}
            : c
    );
}

// ─── Actions ────────────────────────────────────────────────────────────────

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
    const data = await browseComments(state, api, options, page, order);
    const dedupedComments = dedupeById([...state.comments, ...data.comments]);

    return {
        comments: dedupedComments,
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
        const data = await browseComments(state, api, options, 1, order);
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
    let newReplies: Comment[];

    if (limit === 'all') {
        newReplies = await fetchAllReplies(state, api, comment, isReply);
    } else {
        const data = await fetchRepliesPage(
            state, api, comment.id, getLastReplyId(comment), (limit as number) || 100, isReply
        );
        newReplies = data.comments;
    }

    return {
        comments: appendRepliesToComment(state.comments, comment, newReplies)
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
    const newComment = data.comments[0];

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
    const commentWithParent = {...reply, parent_id: parent.id};
    const data = await api.comments.add({comment: commentWithParent});
    const newReply = data.comments[0];

    return {
        comments: state.comments.map(c =>
            c.id === parent.id
                ? {
                    ...parent,
                    replies: [...parent.replies, newReply],
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

    const data = isAdminContext(state)
        ? await state.adminApi!.read({commentId: comment.id, memberUuid: state.member?.uuid})
        : await api.comments.read(comment.id);

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

function buildLikeUpdate(comment: {id: string; liked: boolean}, current: Comment): Comment {
    const delta = comment.liked ? 1 : -1;
    return {
        ...current,
        liked: comment.liked,
        count: {...current.count, likes: current.count.likes + delta}
    };
}

async function updateCommentLikeState({
    state,
    data: comment
}: {
    state: EditableAppContext;
    data: {id: string; liked: boolean};
}) {
    return {
        comments: updateCommentInTree(
            state.comments,
            c => c.id === comment.id,
            c => buildLikeUpdate(comment, c)
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

    const topLevelComment = state.comments.find(c => c.id === comment.id);
    const isTopLevelWithNoReplies = topLevelComment && (!topLevelComment.replies?.length);

    if (isTopLevelWithNoReplies) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    return {
        comments: state.comments
            .map((topLevel) => {
                if (topLevel.id === comment.id) {
                    return topLevel.replies.length > 0 ? {...topLevel, status: 'deleted'} : null;
                }

                const updatedReplies = topLevel.replies.filter(r => r.id !== comment.id);
                const replyWasDeleted = updatedReplies.length !== topLevel.replies.length;

                return {
                    ...topLevel,
                    replies: updatedReplies,
                    count: replyWasDeleted && topLevel.count?.replies
                        ? {...topLevel.count, replies: topLevel.count.replies - 1}
                        : topLevel.count
                };
            })
            .filter(Boolean),
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
    const updatedComment = data.comments[0];

    return {
        comments: state.comments.map((c) => {
            if (parent && parent.id === c.id) {
                return {
                    ...c,
                    replies: c.replies.map(r => (r.id === updatedComment.id ? updatedComment : r))
                };
            }
            return c.id === updatedComment.id ? updatedComment : c;
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

    if (data.name && state.member?.name !== data.name) {
        patchData.name = data.name;
    }
    if (data.expertise !== undefined && state.member?.expertise !== data.expertise) {
        patchData.expertise = data.expertise;
    }

    if (!Object.keys(patchData).length) {
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
            const newCommentsState = await loadMoreReplies({state, api, data: {comment, limit: 'all'}, isReply: true});
            otherStateChanges = {...otherStateChanges, ...newCommentsState};
        }
    }

    const openFormsAfterAutoclose = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const existingIndex = openFormsAfterAutoclose.findIndex(f => f.id === newForm.id);

    if (existingIndex > -1) {
        openFormsAfterAutoclose[existingIndex] = newForm;
        return {openCommentForms: openFormsAfterAutoclose, ...otherStateChanges};
    }

    return {openCommentForms: [...openFormsAfterAutoclose,