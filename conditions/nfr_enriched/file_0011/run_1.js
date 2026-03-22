# Refactored Code

Here's the refactored version with reduced complexity through several improvements:

1. **Extracted helper functions** to eliminate repeated patterns
2. **Simplified conditional logic** using early returns and helper abstractions
3. **Reduced duplication** in comment mapping operations
4. **Improved readability** with clearer naming and structure

```typescript
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

// ─── Shared Helpers ───────────────────────────────────────────────────────────

function isAdminContext(state: EditableAppContext): boolean {
    return !!(state.admin && state.adminApi);
}

async function browseComments(
    state: EditableAppContext,
    api: GhostApi,
    params: {page: number; postId: string; order: string}
) {
    return isAdminContext(state)
        ? state.adminApi!.browse({...params, memberUuid: state.member?.uuid})
        : api.comments.browse(params);
}

async function readComment(state: EditableAppContext, api: GhostApi, commentId: string) {
    return isAdminContext(state)
        ? state.adminApi!.read({commentId, memberUuid: state.member?.uuid})
        : api.comments.read(commentId);
}

async function fetchRepliesPage(
    state: EditableAppContext,
    api: GhostApi,
    params: {commentId: string; afterReplyId?: string; limit: number; isReply: boolean}
) {
    const {commentId, afterReplyId, limit, isReply} = params;
    return isAdminContext(state) && !isReply
        ? state.adminApi!.replies({commentId, afterReplyId, limit, memberUuid: state.member?.uuid})
        : api.comments.replies({commentId, afterReplyId, limit});
}

function deduplicateById<T extends {id: string}>(items: T[]): T[] {
    return items.filter((item, index, self) => self.findIndex(c => c.id === item.id) === index);
}

function updateCommentInList(
    comments: Comment[],
    predicate: (c: Comment) => boolean,
    updater: (c: Comment) => Comment | null
): Comment[] {
    return comments.map(c => (predicate(c) ? updater(c) : c)).filter(Boolean) as Comment[];
}

function updateCommentAndReplies(
    comments: Comment[],
    targetId: string,
    commentUpdater: (c: Comment) => Comment | null,
    replyUpdater: (r: Comment) => Comment
): Comment[] {
    return comments.map((c) => {
        const updatedReplies = c.replies.map(r => (r.id === targetId ? replyUpdater(r) : r));
        const updatedComment = c.id === targetId
            ? commentUpdater({...c, replies: updatedReplies})
            : {...c, replies: updatedReplies};
        return updatedComment;
    }).filter(Boolean) as Comment[];
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

    const dedupedComments = deduplicateById([...state.comments, ...data.comments]);

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
    const lastReplyId = comment.replies?.at(-1)?.id;
    let afterReplyId: string | undefined = lastReplyId;
    let newReplies: Comment[] = [];

    if (limit === 'all') {
        let hasMore = true;
        while (hasMore) {
            const data = await fetchRepliesPage(state, api, {
                commentId: comment.id,
                afterReplyId,
                limit: 100,
                isReply
            });
            newReplies.push(...data.comments);
            hasMore = !!data.meta.pagination.next && data.comments.length > 0;
            afterReplyId = data.comments.at(-1)?.id;
        }
    } else {
        const data = await fetchRepliesPage(state, api, {
            commentId: comment.id,
            afterReplyId,
            limit: (limit as number) || 100,
            isReply
        });
        newReplies = data.comments;
    }

    return {
        comments: updateCommentInList(
            state.comments,
            c => c.id === comment.id,
            () => ({...comment, replies: [...comment.replies, ...newReplies]})
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
        comments: updateCommentInList(
            state.comments,
            c => c.id === parent.id,
            () => ({
                ...parent,
                replies: [...parent.replies, newReply],
                count: {...parent.count, replies: parent.count.replies + 1}
            })
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
        comments: updateCommentAndReplies(
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
    if (state.adminApi) {
        await state.adminApi.showComment({id: comment.id});
    }

    const data = await readComment(state, api, comment.id);
    const updatedComment = data.comments[0];

    return {
        comments: updateCommentAndReplies(
            state.comments,
            comment.id,
            () => updatedComment,
            () => updatedComment
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
}: {
    state: EditableAppContext;
    data: {id: string; liked: boolean};
}) {
    return {
        comments: updateCommentAndReplies(
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
    const hasNoReplies = !topLevelComment?.replies?.length;

    if (topLevelComment && hasNoReplies) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    const updatedComments = state.comments.map((topLevel) => {
        if (topLevel.id === comment.id) {
            return topLevel.replies.length > 0
                ? {...topLevel, status: 'deleted'}
                : null;
        }

        const updatedReplies = topLevel.replies.filter(r => r.id !== comment.id);
        const replyWasDeleted = updatedReplies.length !== topLevel.replies.length;

        if (replyWasDeleted && topLevel.count?.replies) {
            return {
                ...topLevel,
                replies: updatedReplies,
                count: {...topLevel.count, replies: topLevel.count.replies - 1}
            };
        }

        return {...topLevel, replies: updatedReplies};
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
    const updatedComment = data.comments[0];

    return {
        comments: state.comments.map((c) => {
            if (parent?.id === c.id) {
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
    const isNewReplyThread = newForm.type === 'reply' &&
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

// ─── Action Registry ──────────────────────────────────────────────────────────

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
    return handler ? (await handler({data, state, api, adminApi, options, dispatchAction} as any)) || {} : {};
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

## Key Refactoring Changes

### Extracted Shared Helpers
| Helper | Purpose |
|--------|---------|
| `isAdminContext()` | Eliminates repeated `state.admin && state.adminApi` checks |
| `browseComments()` | Unifies admin/member API branching for comment browsing |
| `readComment()` | Unifies admin/member API branching for reading a comment |
| `fetchRepliesPage()` | Unifies admin/member API branching for fetching replies |
| `deduplicateById()` | Extracts deduplication logic |
| `updateCommentInList()` | Generic comment list updater |
| `updateCommentAndReplies()` | Eliminates repeated nested map patterns in hide/show/like |
| `buildLikeUpdate()` | Extracts like/unlike state mutation |

### Other Improvements
- **`addReply`**: Removed mutation of `reply` object; uses a new `commentWithParent` variable
- **`deleteComment`**: Immutably updates `count` instead of mutating `topLevelComment.count.replies`
- **`loadMoreReplies`**: Uses `Array.at(-1)` instead of `array[array.length - 1]`
- **`openCommentForm`**: Extracted `isNewReplyThread` boolean for clarity
- Consistent formatting and removal of trailing semicolons after closing braces