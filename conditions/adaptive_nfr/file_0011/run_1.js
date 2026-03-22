# Refactored Code

The main complexity issues I identified:
1. **Duplicated admin/API branching logic** repeated throughout multiple functions
2. **Large, complex functions** doing too much (especially `deleteComment`, `openCommentForm`)
3. **Duplicated comment-mapping patterns** for updating nested replies
4. **Inconsistent error handling**
5. **Mixed abstraction levels** within functions

```typescript
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

// ---------------------------------------------------------------------------
// API helpers – eliminate repeated admin/public branching
// ---------------------------------------------------------------------------

function browseComments(
    state: EditableAppContext,
    api: GhostApi,
    params: {page: number; postId: string; order: string}
) {
    return state.admin && state.adminApi
        ? state.adminApi.browse({...params, memberUuid: state.member?.uuid})
        : api.comments.browse(params);
}

function fetchRepliesPage(
    state: EditableAppContext,
    api: GhostApi,
    params: {commentId: string; afterReplyId?: string; limit: number},
    isReply: boolean
) {
    // Skip admin API when loading replies-of-replies
    return state.admin && state.adminApi && !isReply
        ? state.adminApi.replies({...params, memberUuid: state.member?.uuid})
        : api.comments.replies(params);
}

function readComment(state: EditableAppContext, api: GhostApi, commentId: string) {
    return state.admin && state.adminApi
        ? state.adminApi.read({commentId, memberUuid: state.member?.uuid})
        : api.comments.read(commentId);
}

// ---------------------------------------------------------------------------
// Comment-tree helpers – eliminate duplicated map/update patterns
// ---------------------------------------------------------------------------

type CommentUpdater = (comment: Comment) => Comment;
type ReplyUpdater = (reply: Comment) => Comment;

/**
 * Immutably updates comments and their replies in the state tree.
 * Provide `updateComment` and/or `updateReply` to target specific nodes.
 */
function mapCommentTree(
    comments: Comment[],
    targetId: string,
    updateComment?: CommentUpdater,
    updateReply?: ReplyUpdater
): Comment[] {
    return comments.map((c) => {
        const updatedReplies = updateReply
            ? c.replies.map(r => (r.id === targetId ? updateReply(r) : r))
            : c.replies;

        if (c.id === targetId && updateComment) {
            return updateComment({...c, replies: updatedReplies});
        }

        return c.replies === updatedReplies ? c : {...c, replies: updatedReplies};
    });
}

function updateLikeCount(comment: Comment, liked: boolean): Comment {
    const delta = liked ? 1 : -1;
    return {
        ...comment,
        liked,
        count: {...comment.count, likes: comment.count.likes + delta}
    };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

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

    const merged = [...state.comments, ...data.comments];
    const deduped = merged.filter(
        (comment, index, self) => self.findIndex(c => c.id === comment.id) === index
    );

    return {comments: deduped, pagination: data.meta.pagination};
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
        throw error;
    }
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
        const data = await fetchRepliesPage(
            state, api, {commentId: comment.id, afterReplyId, limit: 100}, isReply
        );
        allReplies.push(...data.comments);
        hasMore = !!data.meta.pagination.next && data.comments.length > 0;
        afterReplyId = data.comments.at(-1)?.id;
    }

    return allReplies;
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
    const afterReplyId = comment.replies?.at(-1)?.id;

    const newReplies = limit === 'all'
        ? await fetchAllReplies(state, api, comment, isReply)
        : (await fetchRepliesPage(
            state, api, {commentId: comment.id, afterReplyId, limit: (limit as number) || 100}, isReply
        )).comments;

    return {
        comments: state.comments.map(c =>
            c.id === comment.id
                ? {...comment, replies: [...comment.replies, ...newReplies]}
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
    const data = await api.comments.add({comment: {...reply, parent_id: parent.id}});
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
    await state.adminApi?.hideComment(comment.id);

    return {
        comments: mapCommentTree(
            state.comments,
            comment.id,
            c => ({...c, status: 'hidden'}),
            r => ({...r, status: 'hidden'})
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
    await state.adminApi?.showComment({id: comment.id});

    const data = await readComment(state, api, comment.id);
    const updated = data.comments[0];

    return {
        comments: mapCommentTree(
            state.comments,
            comment.id,
            () => updated,
            () => updated
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
    return {
        comments: mapCommentTree(
            state.comments,
            comment.id,
            c => updateLikeCount(c, comment.liked),
            r => updateLikeCount(r, comment.liked)
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

function applyCommentDeletion(
    comments: Comment[],
    targetId: string
): {comments: Comment[]; deletedReply: boolean} {
    let deletedReply = false;

    const updated = comments
        .map((topLevel): Comment | null => {
            if (topLevel.id === targetId) {
                return topLevel.replies.length > 0
                    ? {...topLevel, status: 'deleted'}
                    : null;
            }

            const filteredReplies = topLevel.replies.filter(r => r.id !== targetId);
            if (filteredReplies.length !== topLevel.replies.length) {
                deletedReply = true;
                const updatedCount = topLevel.count?.replies
                    ? {...topLevel.count, replies: topLevel.count.replies - 1}
                    : topLevel.count;
                return {...topLevel, replies: filteredReplies, count: updatedCount};
            }

            return topLevel;
        })
        .filter((c): c is Comment => c !== null);

    return {comments: updated, deletedReply};
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

    // Refresh entire list when deleting a top-level comment with no replies
    // to maintain correct pagination
    const target = state.comments.find(c => c.id === comment.id);
    if (target && !target.replies?.length) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    const {comments} = applyCommentDeletion(state.comments, comment.id);
    return {comments, commentCount: state.commentCount - 1};
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
            if (parent && c.id === parent.id) {
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

    // Load all replies when opening a reply form so the new reply appears in the correct position
    const topLevelCommentId = newForm.parent_id || newForm.id;
    const isFirstReplyFormForThread = newForm.type === 'reply'
        && !state.openCommentForms.some(
            f => f.id === topLevelCommentId || f.parent_id === topLevelCommentId
        );

    if (isFirstReplyFormForThread) {
        const comment = state.comments.find(c => c.id === topLevelCommentId);
        if (comment) {
            const repliesState = await loadMoreReplies({
                state, api, data: {comment, limit: 'all'}, isReply: true
            });
            otherStateChanges = repliesState;
        }
    }

    // Close empty/unchanged forms to keep the UI clean
    const retainedForms = state.openCommentForms.filter(f => f.hasUnsavedChanges);

    // Replace existing form for the same id, or append
    const existingIndex = retainedForms.findIndex(f => f.id === newForm.id);
    const updatedForms = existingIndex > -1
        ? retainedForms.map((f, i) => (i === existingIndex ? newForm : f))
        : [...retainedForms, newForm];

    return {openCommentForms: updatedForms, ...otherStateChanges};
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
    setTimeout(() => dispatchAction('setHighlightComment', null), 3000);
    return {commentIdToHighlight: commentId};
}

function setCommentFormHasUnsavedChanges({
    data: {id, hasUnsavedChanges},
    state
}: {
    data: {id: string; hasUnsavedChanges: boolean};
    state: EditableAppContext;
}) {
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

// ---------------------------------------------------------------------------
// Action registries
// ---------------------------------------------------------------------------

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
    action, data, state, api, adminApi, options, dispatchAction
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
    return handler ? await handler({data, state, api, adminApi, options, dispatchAction} as any) || {} : {};
}

export function SyncActionHandler({
    action, data, state, api, adminApi, options
}: {
    action: SyncActionType;
    data: any;
    state: EditableAppContext;
    options: CommentsOptions;
    api: GhostApi;
    adminApi: AdminApi;
}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    return handler ? handler({data, state, api, adminApi, options} as any) || {} : {};
}
```

## Key Changes

| Problem | Solution |
|---|---|
| Admin/public API branching repeated in 5+ functions | Extracted `browseComments`, `fetchRepliesPage`, `readComment` helpers |
| Duplicated `comments.map` + `replies.map` pattern | Extracted `mapCommentTree` utility accepting updater callbacks |
| Duplicated like-count arithmetic | Extracted `updateLikeCount` helper |
| `deleteComment` mixed deletion logic with state mapping | Extracted `applyCommentDeletion` with clear return type |
| `loadMoreReplies` mixed pagination loop with state update | Extracted `fetchAllReplies` for the pagination concern |
| `openCommentForm` had unclear conditionals | Named intermediate booleans (`isFirstReplyFormForThread`) and simplified form-replace logic |
| Inconsistent `setOrder` error handling (mutated state) | Removed direct state mutation; just rethrow |
| Trailing semicolons on function declarations | Removed |