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

type CommentUpdate = Partial<EditableAppContext>;

// ─── API Helpers ──────────────────────────────────────────────────────────────

async function browseComments(
    state: EditableAppContext,
    api: GhostApi,
    params: {page: number; postId: string; order: string}
) {
    if (state.admin && state.adminApi) {
        return state.adminApi.browse({...params, memberUuid: state.member?.uuid});
    }
    return api.comments.browse(params);
}

async function fetchRepliesPage(
    state: EditableAppContext,
    api: GhostApi,
    params: {commentId: string; afterReplyId?: string; limit: number; isReply: boolean}
) {
    const {isReply, ...rest} = params;
    if (state.admin && state.adminApi && !isReply) {
        return state.adminApi.replies({...rest, memberUuid: state.member?.uuid});
    }
    return api.comments.replies(rest);
}

async function readComment(state: EditableAppContext, api: GhostApi, commentId: string) {
    if (state.admin && state.adminApi) {
        return state.adminApi.read({commentId, memberUuid: state.member?.uuid});
    }
    return api.comments.read(commentId);
}

// ─── Comment Mapping Helpers ──────────────────────────────────────────────────

function updateCommentInList(
    comments: Comment[],
    predicate: (c: Comment) => boolean,
    updater: (c: Comment) => Comment | null
): Comment[] {
    return comments.map(c => (predicate(c) ? updater(c) : c)).filter(Boolean) as Comment[];
}

function updateReplyInComment(comment: Comment, replyId: string, updater: (r: Comment) => Comment): Comment {
    return {
        ...comment,
        replies: comment.replies.map(r => (r.id === replyId ? updater(r) : r))
    };
}

function updateCommentOrReply(
    comments: Comment[],
    targetId: string,
    commentUpdater: (c: Comment) => Comment,
    replyUpdater: (r: Comment) => Comment
): Comment[] {
    return comments.map((c) => {
        if (c.id === targetId) {
            return commentUpdater(c);
        }
        return updateReplyInComment(c, targetId, replyUpdater);
    });
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function loadMoreComments({
    state,
    api,
    options,
    order
}: {state: EditableAppContext; api: GhostApi; options: CommentsOptions; order?: string}): Promise<CommentUpdate> {
    const page = state.pagination?.page ? state.pagination.page + 1 : 1;
    const data = await browseComments(state, api, {
        page,
        postId: options.postId,
        order: order || state.order
    });

    const merged = [...state.comments, ...data.comments];
    const deduplicated = merged.filter((c, i, self) => self.findIndex(x => x.id === c.id) === i);

    return {comments: deduplicated, pagination: data.meta.pagination};
}

function setCommentsIsLoading({data: isLoading}: {data: boolean | null}): CommentUpdate {
    return {commentsIsLoading: isLoading};
}

async function setOrder({
    state,
    data: {order},
    options,
    api,
    dispatchAction
}: {state: EditableAppContext; data: {order: string}; options: CommentsOptions; api: GhostApi; dispatchAction: DispatchActionType}): Promise<CommentUpdate> {
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

    while (true) {
        const data = await fetchRepliesPage(state, api, {
            commentId: comment.id,
            afterReplyId,
            limit: 100,
            isReply
        });
        allReplies.push(...data.comments);

        if (!data.meta.pagination.next || data.comments.length === 0) {
            break;
        }
        afterReplyId = data.comments.at(-1)?.id;
    }

    return allReplies;
}

async function loadMoreReplies({
    state,
    api,
    data: {comment, limit},
    isReply
}: {state: EditableAppContext; api: GhostApi; data: {comment: Comment; limit?: number | 'all'}; isReply: boolean}): Promise<CommentUpdate> {
    const afterReplyId = comment.replies?.at(-1)?.id;

    const newReplies = limit === 'all'
        ? await fetchAllReplies(state, api, comment, isReply)
        : (await fetchRepliesPage(state, api, {commentId: comment.id, afterReplyId, limit: (limit as number) || 100, isReply})).comments;

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
}: {state: EditableAppContext; api: GhostApi; data: AddComment}): Promise<CommentUpdate> {
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
}: {state: EditableAppContext; api: GhostApi; data: {reply: any; parent: any}}): Promise<CommentUpdate> {
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
}: {state: EditableAppContext; adminApi: any; data: {id: string}}): Promise<CommentUpdate> {
    await state.adminApi?.hideComment(comment.id);

    return {
        comments: updateCommentOrReply(
            state.comments,
            comment.id,
            c => ({...c, status: 'hidden', replies: c.replies.map(r => r.id === comment.id ? {...r, status: 'hidden'} : r)}),
            r => ({...r, status: 'hidden'})
        ),
        commentCount: state.commentCount - 1
    };
}

async function showComment({
    state,
    api,
    data: comment
}: {state: EditableAppContext; api: GhostApi; adminApi: any; data: {id: string}}): Promise<CommentUpdate> {
    await state.adminApi?.showComment({id: comment.id});

    const data = await readComment(state, api, comment.id);
    const updated = data.comments[0];

    return {
        comments: updateCommentOrReply(
            state.comments,
            comment.id,
            () => updated,
            () => updated
        ),
        commentCount: state.commentCount + 1
    };
}

function buildLikeUpdate(comment: Comment, liked: boolean): Comment {
    const delta = liked ? 1 : -1;
    return {
        ...comment,
        liked,
        count: {...comment.count, likes: comment.count.likes + delta}
    };
}

async function updateCommentLikeState({
    state,
    data: comment
}: {state: EditableAppContext; data: {id: string; liked: boolean}}): Promise<CommentUpdate> {
    return {
        comments: updateCommentOrReply(
            state.comments,
            comment.id,
            c => buildLikeUpdate(c, comment.liked),
            r => buildLikeUpdate(r, comment.liked)
        )
    };
}

async function likeComment({
    api,
    data: comment,
    dispatchAction
}: {state: EditableAppContext; api: GhostApi; data: {id: string}; dispatchAction: DispatchActionType}): Promise<CommentUpdate> {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    }
    return {};
}

async function unlikeComment({
    api,
    data: comment,
    dispatchAction
}: {state: EditableAppContext; api: GhostApi; data: {id: string}; dispatchAction: DispatchActionType}): Promise<CommentUpdate> {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    try {
        await api.comments.unlike({comment});
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    }
    return {};
}

async function reportComment({api, data: comment}: {api: GhostApi; data: {id: string}}): Promise<CommentUpdate> {
    await api.comments.report({comment});
    return {};
}

async function deleteComment({
    state,
    api,
    data: comment,
    dispatchAction
}: {state: EditableAppContext; api: GhostApi; data: {id: string}; dispatchAction: DispatchActionType}): Promise<CommentUpdate | null> {
    await api.comments.edit({comment: {id: comment.id, status: 'deleted'}});

    const target = state.comments.find(c => c.id === comment.id);
    if (target && !target.replies?.length) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    return {
        comments: state.comments.map((c) => {
            if (c.id === comment.id) {
                return c.replies.length > 0 ? {...c, status: 'deleted'} : null;
            }

            const updatedReplies = c.replies.filter(r => r.id !== comment.id);
            const replyWasDeleted = updatedReplies.length !== c.replies.length;

            return {
                ...c,
                replies: updatedReplies,
                count: replyWasDeleted && c.count?.replies
                    ? {...c.count, replies: c.count.replies - 1}
                    : c.count
            };
        }).filter(Boolean) as Comment[],
        commentCount: state.commentCount - 1
    };
}

async function editComment({
    state,
    api,
    data: {comment, parent}
}: {state: EditableAppContext; api: GhostApi; data: {comment: Partial<Comment> & {id: string}; parent?: Comment}}): Promise<CommentUpdate> {
    const data = await api.comments.edit({comment});
    const updated = data.comments[0];

    return {
        comments: state.comments.map((c) => {
            if (parent?.id === c.id) {
                return updateReplyInComment(c, updated.id, () => updated);
            }
            return c.id === updated.id ? updated : c;
        })
    };
}

async function updateMember({
    data,
    state,
    api
}: {data: {name: string; expertise: string}; state: EditableAppContext; api: GhostApi}): Promise<CommentUpdate | null> {
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

// ─── Popup & Form Actions ─────────────────────────────────────────────────────

function openPopup({data}: {data: Page}): CommentUpdate {
    return {popup: data};
}

function closePopup(): CommentUpdate {
    return {popup: null};
}

async function openCommentForm({
    data: newForm,
    api,
    state
}: {data: OpenCommentForm; api: GhostApi; state: EditableAppContext}): Promise<CommentUpdate> {
    let extra: CommentUpdate = {};

    const topLevelId = newForm.parent_id || newForm.id;
    const isFirstReplyForm = newForm.type === 'reply' &&
        !state.openCommentForms.some(f => f.id === topLevelId || f.parent_id === topLevelId);

    if (isFirstReplyForm) {
        const comment = state.comments.find(c => c.id === topLevelId);
        if (comment) {
            extra = await loadMoreReplies({state, api, data: {comment, limit: 'all'}, isReply: true});
        }
    }

    const retained = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const existingIndex = retained.findIndex(f => f.id === newForm.id);

    const updatedForms = existingIndex > -1
        ? retained.map((f, i) => (i === existingIndex ? newForm : f))
        : [...retained, newForm];

    return {openCommentForms: updatedForms, ...extra};
}

function setHighlightComment({data: commentId}: {data: string | null}): CommentUpdate {
    return {commentIdToHighlight: commentId};
}

function highlightComment({
    data: {commentId},
    dispatchAction
}: {data: {commentId: string | null}; state: EditableAppContext; dispatchAction: DispatchActionType}): CommentUpdate {
    setTimeout(() => dispatchAction('setHighlightComment', null), 3000);
    return {commentIdToHighlight: commentId};
}

function setCommentFormHasUnsavedChanges({
    data: {id, hasUnsavedChanges},
    state
}: {data: {id: string; hasUnsavedChanges: boolean}; state: EditableAppContext}): CommentUpdate {
    return {
        openCommentForms: state.openCommentForms.map(f =>
            f.id === id ? {...f, hasUnsavedChanges} : {...f}
        )
    };
}

function closeCommentForm({data: id, state}: {data: string; state: EditableAppContext}): CommentUpdate {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

function setScrollTarget({data: commentId}: {data: string | null}): CommentUpdate {
    return {commentIdToScrollTo: commentId};
}

// ─── Action Registry ──────────────────────────────────────────────────────────

export const SyncActions = {
    openPopup,
    closePopup,
    closeCommentForm,
    setCommentFormHasUnsavedChanges,
    setScrollTarget
};

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

export type SyncActionType = keyof typeof SyncActions;
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
}: {action: ActionType; data: any; state: EditableAppContext; options: CommentsOptions; api: GhostApi; adminApi: AdminApi; dispatchAction: DispatchActionType}): Promise<CommentUpdate> {
    const handler = Actions[action];
    return handler ? (await handler({data, state, api, adminApi, options, dispatchAction} as any)) || {} : {};
}

export function SyncActionHandler({
    action,
    data,
    state,
    api,
    adminApi,
    options
}: {action: SyncActionType; data: any; state: EditableAppContext; options: CommentsOptions; api: GhostApi; adminApi: AdminApi}): CommentUpdate {
    const handler = SyncActions[action];
    return handler ? handler({data, state, api, adminApi, options} as any) || {} : {};
}
```

Key improvements made:

1. **Extracted API helpers** (`browseComments`, `fetchRepliesPage`, `readComment`) to eliminate repeated admin/member API branching logic throughout the file.

2. **Extracted comment mapping helpers** (`updateCommentInList`, `updateReplyInComment`, `updateCommentOrReply`) to replace deeply nested `.map()` chains that appeared in `hideComment`, `showComment`, `updateCommentLikeState`, and `editComment`.

3. **Extracted `fetchAllReplies`** from `loadMoreReplies` to separate the pagination loop concern and simplify the parent function.

4. **Extracted `buildLikeUpdate`** to deduplicate the like/unlike count logic shared between comment and reply updates.

5. **Added `CommentUpdate` type alias** for `Partial<EditableAppContext>` to reduce verbosity.

6. **Simplified conditionals** using early returns, `Array.at(-1)`, ternary expressions, and optional chaining (`?.`).

7. **Fixed a subtle mutation bug** in `deleteComment` where `topLevelComment.count.replies` was mutated directly — replaced with an immutable spread.

8. **Improved `openCommentForm`** by extracting the `isFirstReplyForm` condition and replacing the index-based form update with a cleaner `.map()`.