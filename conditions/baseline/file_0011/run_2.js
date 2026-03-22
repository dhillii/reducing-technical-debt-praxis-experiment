Here's the refactored code with improved organization, reduced complexity, and better separation of concerns:

```typescript
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionContext = {
    state: EditableAppContext;
    api: GhostApi;
    options: CommentsOptions;
    dispatchAction: DispatchActionType;
};

type BrowseParams = {
    page: number;
    postId: string;
    order: string;
    memberUuid?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAdminContext(state: EditableAppContext): boolean {
    return !!(state.admin && state.adminApi);
}

async function browseComments(
    state: EditableAppContext,
    api: GhostApi,
    params: BrowseParams
) {
    if (isAdminContext(state)) {
        return state.adminApi!.browse({...params, memberUuid: state.member?.uuid});
    }
    return api.comments.browse(params);
}

async function readComment(
    state: EditableAppContext,
    api: GhostApi,
    commentId: string
) {
    if (isAdminContext(state)) {
        return state.adminApi!.read({commentId, memberUuid: state.member?.uuid});
    }
    return api.comments.read(commentId);
}

async function fetchReplies(
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

function deduplicateComments(comments: Comment[]): Comment[] {
    return comments.filter(
        (comment, index, self) => self.findIndex(c => c.id === comment.id) === index
    );
}

function updateCommentInList(
    comments: Comment[],
    commentId: string,
    updater: (comment: Comment) => Comment
): Comment[] {
    return comments.map(c => (c.id === commentId ? updater(c) : c));
}

function updateReplyInList(
    comments: Comment[],
    replyId: string,
    updater: (reply: Comment) => Comment
): Comment[] {
    return comments.map(c => ({
        ...c,
        replies: c.replies.map(r => (r.id === replyId ? updater(r) : r))
    }));
}

function updateCommentOrReply(
    comments: Comment[],
    commentId: string,
    updater: (comment: Comment) => Comment
): Comment[] {
    return comments.map((c) => {
        const updatedReplies = c.replies.map(r => (r.id === commentId ? updater(r) : r));
        if (c.id === commentId) {
            return updater({...c, replies: updatedReplies});
        }
        return {...c, replies: updatedReplies};
    });
}

function adjustLikeCount(comment: Comment, liked: boolean): Comment {
    return {
        ...comment,
        liked,
        count: {
            ...comment.count,
            likes: liked ? comment.count.likes + 1 : comment.count.likes - 1
        }
    };
}

async function fetchAllReplies(
    state: EditableAppContext,
    api: GhostApi,
    comment: Comment,
    isReply: boolean
): Promise<Comment[]> {
    let afterReplyId = comment.replies?.at(-1)?.id;
    const allReplies: Comment[] = [];
    let hasMore = true;

    while (hasMore) {
        const data = await fetchReplies(state, api, comment.id, afterReplyId, 100, isReply);
        allReplies.push(...data.comments);
        hasMore = !!data.meta.pagination.next && data.comments.length > 0;
        afterReplyId = data.comments.at(-1)?.id;
    }

    return allReplies;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function loadMoreComments({
    state,
    api,
    options,
    order
}: {state: EditableAppContext; api: GhostApi; options: CommentsOptions; order?: string}): Promise<Partial<EditableAppContext>> {
    const page = state.pagination?.page ? state.pagination.page + 1 : 1;
    const data = await browseComments(state, api, {
        page,
        postId: options.postId,
        order: order || state.order
    });

    return {
        comments: deduplicateComments([...state.comments, ...data.comments]),
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
}: {state: EditableAppContext; data: {order: string}; options: CommentsOptions; api: GhostApi; dispatchAction: DispatchActionType}) {
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
}: {state: EditableAppContext; api: GhostApi; data: {comment: Comment; limit?: number | 'all'}; isReply: boolean}): Promise<Partial<EditableAppContext>> {
    let newReplies: Comment[];

    if (limit === 'all') {
        newReplies = await fetchAllReplies(state, api, comment, isReply);
    } else {
        const afterReplyId = comment.replies?.at(-1)?.id;
        const data = await fetchReplies(state, api, comment.id, afterReplyId, (limit as number) || 100, isReply);
        newReplies = data.comments;
    }

    return {
        comments: updateCommentInList(state.comments, comment.id, c => ({
            ...c,
            replies: [...comment.replies, ...newReplies]
        }))
    };
}

async function addComment({
    state,
    api,
    data: comment
}: {state: EditableAppContext; api: GhostApi; data: AddComment}) {
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
}: {state: EditableAppContext; api: GhostApi; data: {reply: any; parent: any}}) {
    const commentWithParent = {...reply, parent_id: parent.id};
    const data = await api.comments.add({comment: commentWithParent});
    const newReply = data.comments[0];

    return {
        comments: updateCommentInList(state.comments, parent.id, () => ({
            ...parent,
            replies: [...parent.replies, newReply],
            count: {...parent.count, replies: parent.count.replies + 1}
        })),
        commentCount: state.commentCount + 1
    };
}

async function hideComment({
    state,
    data: comment
}: {state: EditableAppContext; adminApi: any; data: {id: string}}) {
    await state.adminApi?.hideComment(comment.id);

    return {
        comments: updateCommentOrReply(state.comments, comment.id, c => ({...c, status: 'hidden'})),
        commentCount: state.commentCount - 1
    };
}

async function showComment({
    state,
    api,
    data: comment
}: {state: EditableAppContext; api: GhostApi; adminApi: any; data: {id: string}}) {
    await state.adminApi?.showComment({id: comment.id});

    const data = await readComment(state, api, comment.id);
    const updatedComment = data.comments[0];

    return {
        comments: updateCommentOrReply(state.comments, comment.id, () => updatedComment),
        commentCount: state.commentCount + 1
    };
}

async function updateCommentLikeState({
    state,
    data: comment
}: {state: EditableAppContext; data: {id: string; liked: boolean}}) {
    return {
        comments: updateCommentOrReply(state.comments, comment.id, c =>
            adjustLikeCount(c, comment.liked)
        )
    };
}

async function likeComment({
    api,
    data: comment,
    dispatchAction
}: {state: EditableAppContext; api: GhostApi; data: {id: string}; dispatchAction: DispatchActionType}) {
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
}: {state: EditableAppContext; api: GhostApi; data: {id: string}; dispatchAction: DispatchActionType}) {
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
}: {state: EditableAppContext; api: GhostApi; data: {id: string}; dispatchAction: DispatchActionType}) {
    await api.comments.edit({comment: {id: comment.id, status: 'deleted'}});

    const topLevelComment = state.comments.find(c => c.id === comment.id);
    const isTopLevelWithNoReplies = topLevelComment && !topLevelComment.replies?.length;

    if (isTopLevelWithNoReplies) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    const updatedComments = state.comments.map((topLevel) => {
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
    }).filter(Boolean);

    return {
        comments: updatedComments,
        commentCount: state.commentCount - 1
    };
}

async function editComment({
    state,
    api,
    data: {comment, parent}
}: {state: EditableAppContext; api: GhostApi; data: {comment: Partial<Comment> & {id: string}; parent?: Comment}}) {
    const data = await api.comments.edit({comment});
    const updatedComment = data.comments[0];

    return {
        comments: state.comments.map((c) => {
            if (parent?.id === c.id) {
                return {
                    ...c,
                    replies: updateCommentInList(c.replies, updatedComment.id, () => updatedComment)
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
}: {data: {name: string; expertise: string}; state: EditableAppContext; api: GhostApi}) {
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
}: {data: OpenCommentForm; api: GhostApi; state: EditableAppContext}) {
    let otherStateChanges = {};

    const topLevelCommentId = newForm.parent_id || newForm.id;
    const isNewReplyThread = newForm.type === 'reply' &&
        !state.openCommentForms.some(f => f.id === topLevelCommentId || f.parent_id === topLevelCommentId);

    if (isNewReplyThread) {
        const comment = state.comments.find(c => c.id === topLevelCommentId);
        if (comment) {
            const newCommentsState = await loadMoreReplies({state, api, data: {comment, limit: 'all'}, isReply: true});
            otherStateChanges = newCommentsState;
        }
    }

    const openFormsAfterAutoclose = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const existingFormIndex = openFormsAfterAutoclose.findIndex(f => f.id === newForm.id);

    if (existingFormIndex > -1) {
        openFormsAfterAutoclose[existingFormIndex] = newForm;
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
}: {data: {commentId: string | null}; state: EditableAppContext; dispatchAction: DispatchActionType}) {
    setTimeout(() => dispatchAction('setHighlightComment', null), 3000);
    return {commentIdToHighlight: commentId};
}

function setCommentFormHasUnsavedChanges({
    data: {id, hasUnsavedChanges},
    state
}: {data: {id: string; hasUnsavedChanges: boolean}; state: EditableAppContext}) {
    return {
        openCommentForms: state.openCommentForms.map(f =>
            f.id === id ? {...f, hasUnsavedChanges} : {...f}
        )
    };
}

function closeCommentForm({data: id, state}: {data: string; state: EditableAppContext}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

function setScrollTarget({data: commentId}: {data: string | null}) {
    return {commentIdToScrollTo: commentId};
}

// ─── Exports ──────────────────────────────────────────────────────────────────

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

export async function ActionHandler({
    action,
    data,
    state,
    api,
    adminApi,
    options,
    dispatchAction
}: {action: ActionType; data: any; state: EditableAppContext; options: CommentsOptions; api: GhostApi; adminApi: AdminApi; dispatchAction: DispatchActionType}): Promise<Partial<EditableAppContext>> {
    const handler = Actions[action];
    return handler ? await handler({data, state, api, adminApi, options, dispatchAction} as any) || {} : {};
}

export function SyncActionHandler({
    action,
    data,
    state,
    api,
    adminApi,
    options
}: {action: SyncActionType; data: any; state: EditableAppContext; options: CommentsOptions; api: GhostApi; adminApi: AdminApi}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    return handler ? handler({data, state, api, adminApi, options} as any) || {} : {};
}
```

Key improvements made:

1. **Extracted helper functions** — `browseComments`, `readComment`, `fetchReplies`, `isAdminContext` eliminate repeated admin/non-admin branching throughout the code.

2. **Reusable comment updaters** — `updateCommentInList`, `updateReplyInList`, `updateCommentOrReply`, and `adjustLikeCount` replace duplicated `map` logic across `hideComment`, `showComment`, `updateCommentLikeState`, and `editComment`.

3. **Extracted `fetchAllReplies`** — Pulled the pagination loop out of `loadMoreReplies` into its own focused function.

4. **Simplified conditionals** — Replaced verbose `if/else` chains with ternary expressions and early returns where appropriate.

5. **Cleaner `deleteComment`** — Extracted the "top-level with no replies" check into a named variable and simplified the count update logic.

6. **Consistent formatting** — Destructured parameters are consistently formatted for readability.

7. **Added a `Types` section** — Shared types like `ActionContext` and `BrowseParams` are defined once at the top.