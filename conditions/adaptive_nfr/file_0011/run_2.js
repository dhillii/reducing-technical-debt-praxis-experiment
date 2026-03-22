# Refactored Actions Code

## Key Improvements

1. **Extracted shared utilities** - `browseComments`, `updateCommentInTree`, `updateCommentLikeCount` reduce duplication
2. **Simplified complex functions** - `deleteComment`, `loadMoreReplies`, `openCommentForm` broken into smaller pieces
3. **Consistent patterns** - Like/unlike, hide/show use shared helpers
4. **Removed mutation** - Fixed `topLevelComment.count.replies` direct mutation in `deleteComment`

```typescript
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type BrowseParams = {
    page: number;
    postId: string;
    order?: string;
    memberUuid?: string;
};

async function browseComments(
    state: EditableAppContext,
    api: GhostApi,
    params: BrowseParams
) {
    if (state.admin && state.adminApi) {
        return state.adminApi.browse({...params, memberUuid: state.member?.uuid});
    }
    return api.comments.browse(params);
}

async function readComment(
    state: EditableAppContext,
    api: GhostApi,
    commentId: string
) {
    if (state.admin && state.adminApi) {
        return state.adminApi.read({commentId, memberUuid: state.member?.uuid});
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
    if (state.admin && state.adminApi && !isReply) {
        return state.adminApi.replies({commentId, afterReplyId, limit, memberUuid: state.member?.uuid});
    }
    return api.comments.replies({commentId, afterReplyId, limit});
}

/**
 * Maps over top-level comments and their replies, replacing any comment
 * whose id matches `targetId` with the result of `updater`.
 */
function updateCommentInTree(
    comments: Comment[],
    targetId: string,
    updater: (c: Comment) => Comment | null
): Comment[] {
    return comments.map((c) => {
        const updatedReplies = c.replies.map((r) => {
            if (r.id === targetId) {
                return updater(r);
            }
            return r;
        }).filter(Boolean) as Comment[];

        if (c.id === targetId) {
            return updater({...c, replies: updatedReplies});
        }

        return {...c, replies: updatedReplies};
    }).filter(Boolean) as Comment[];
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

    return {
        comments: deduped,
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
        throw error;
    }
}

async function fetchAllReplies(
    state: EditableAppContext,
    api: GhostApi,
    comment: Comment,
    isReply: boolean
): Promise<Comment[]> {
    const lastReplyId = (replies: Comment[]) =>
        replies.length > 0 ? replies[replies.length - 1]?.id : undefined;

    let afterReplyId = lastReplyId(comment.replies);
    const allReplies: Comment[] = [];

    while (true) {
        const data = await fetchRepliesPage(state, api, comment.id, afterReplyId, 100, isReply);
        allReplies.push(...data.comments);

        if (!data.meta.pagination.next || data.comments.length === 0) {
            break;
        }

        afterReplyId = lastReplyId(data.comments);
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
    const afterReplyId = comment.replies.length > 0
        ? comment.replies[comment.replies.length - 1]?.id
        : undefined;

    const newReplies = limit === 'all'
        ? await fetchAllReplies(state, api, comment, isReply)
        : (await fetchRepliesPage(state, api, comment.id, afterReplyId, limit as number || 100, isReply)).comments;

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
    if (state.adminApi) {
        await state.adminApi.hideComment(comment.id);
    }

    return {
        comments: updateCommentInTree(state.comments, comment.id, c => ({...c, status: 'hidden'})),
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
    const updated = data.comments[0];

    return {
        comments: updateCommentInTree(state.comments, comment.id, () => updated),
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
        comments: updateCommentInTree(
            state.comments,
            comment.id,
            c => adjustLikeCount(c, comment.liked)
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

    // Refresh entire list when deleting a top-level comment with no replies
    // to maintain correct pagination
    const target = state.comments.find(c => c.id === comment.id);
    if (target && !target.replies?.length) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    const updatedComments = state.comments.map((topLevel) => {
        if (topLevel.id === comment.id) {
            // Keep with deleted status if it has replies, otherwise remove
            return topLevel.replies.length > 0
                ? {...topLevel, status: 'deleted'}
                : null;
        }

        const filteredReplies = topLevel.replies.filter(r => r.id !== comment.id);
        const replyWasDeleted = filteredReplies.length !== topLevel.replies.length;

        return {
            ...topLevel,
            replies: filteredReplies,
            count: replyWasDeleted && topLevel.count?.replies
                ? {...topLevel.count, replies: topLevel.count.replies - 1}
                : topLevel.count
        };
    }).filter(Boolean) as Comment[];

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
                    replies: c.replies.map(r => r.id === updated.id ? updated : r)
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

    // Load all replies when opening a reply form so the new reply appears in the correct position
    const topLevelCommentId = newForm.parent_id || newForm.id;
    const isFirstReplyFormForThread = newForm.type === 'reply' &&
        !state.openCommentForms.some(
            f => f.id === topLevelCommentId || f.parent_id === topLevelCommentId
        );

    if (isFirstReplyFormForThread) {
        const comment = state.comments.find(c => c.id === topLevelCommentId);
        if (comment) {
            const repliesState = await loadMoreReplies({
                state,
                api,
                data: {comment, limit: 'all'},
                isReply: true
            });
            otherStateChanges = repliesState;
        }
    }

    // Close empty/unchanged forms to keep UI clean
    const openForms = state.openCommentForms.filter(form => form.hasUnsavedChanges);

    // Replace existing form for same id, or append new one
    const existingIndex = openForms.findIndex(form => form.id === newForm.id);
    const updatedForms = existingIndex > -1
        ? openForms.map((f, i) => i === existingIndex ? newForm : f)
        : [...openForms, newForm];

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
    return handler ? await handler({data, state, api, adminApi, options, dispatchAction} as any) || {} : {};
}

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
    return handler ? handler({data, state, api, adminApi, options} as any) || {} : {};
}
```

## Summary of Changes

| Area | Change |
|------|--------|
| `browseComments` | Extracted admin/member API branching used in 3+ functions |
| `readComment` | Extracted admin/member read branching from `showComment` |
| `fetchRepliesPage` | Extracted reply fetching branching from `loadMoreReplies` |
| `fetchAllReplies` | Extracted pagination loop from `loadMoreReplies` |
| `updateCommentInTree` | Replaced duplicated map+replace patterns in `hideComment`, `showComment`, `updateCommentLikeState` |
| `adjustLikeCount` | Extracted like count arithmetic shared by `updateCommentLikeState` |
| `deleteComment` | Fixed direct state mutation; simplified branching |
| `openCommentForm` | Extracted intent into named boolean; replaced splice with `map` |
| `updateMember` | Destructured inline for clarity |