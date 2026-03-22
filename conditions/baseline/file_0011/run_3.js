Here's the refactored code with improved organization, reduced complexity, and better separation of concerns:

```typescript
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

// ─── Shared Utilities ────────────────────────────────────────────────────────

const isAdminContext = (state: EditableAppContext) => !!(state.admin && state.adminApi);

const updateCommentInTree = (
    comments: Comment[],
    predicate: (c: Comment) => boolean,
    updater: (c: Comment) => Comment | null
): Comment[] =>
    comments
        .map(c => ({
            ...c,
            replies: c.replies.map(r => (predicate(r) ? updater(r) : r)).filter(Boolean) as Comment[]
        }))
        .map(c => (predicate(c) ? updater(c) : c))
        .filter(Boolean) as Comment[];

const dedupeById = <T extends {id: string}>(items: T[]): T[] =>
    items.filter((item, index, self) => self.findIndex(i => i.id === item.id) === index);

// ─── API Helpers ─────────────────────────────────────────────────────────────

async function browseComments(
    state: EditableAppContext,
    api: GhostApi,
    params: {page: number; postId: string; order: string}
) {
    return isAdminContext(state)
        ? state.adminApi!.browse({...params, memberUuid: state.member?.uuid})
        : api.comments.browse(params);
}

async function fetchReplies(
    state: EditableAppContext,
    api: GhostApi,
    params: {commentId: string; afterReplyId?: string; limit: number},
    isReply: boolean
) {
    return isAdminContext(state) && !isReply
        ? state.adminApi!.replies({...params, memberUuid: state.member?.uuid})
        : api.comments.replies(params);
}

async function readComment(state: EditableAppContext, api: GhostApi, commentId: string) {
    return isAdminContext(state)
        ? state.adminApi!.read({commentId, memberUuid: state.member?.uuid})
        : api.comments.read(commentId);
}

// ─── Comment Loading ──────────────────────────────────────────────────────────

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
    const newReplies = await fetchAllReplies(state, api, comment, limit, isReply);

    return {
        comments: state.comments.map(c =>
            c.id === comment.id
                ? {...comment, replies: [...comment.replies, ...newReplies]}
                : c
        )
    };
}

async function fetchAllReplies(
    state: EditableAppContext,
    api: GhostApi,
    comment: Comment,
    limit: number | 'all' | undefined,
    isReply: boolean
): Promise<Comment[]> {
    const lastReplyId = comment.replies?.at(-1)?.id;

    if (limit !== 'all') {
        const data = await fetchReplies(
            state,
            api,
            {commentId: comment.id, afterReplyId: lastReplyId, limit: (limit as number) || 100},
            isReply
        );
        return data.comments;
    }

    const allComments: Comment[] = [];
    let afterReplyId = lastReplyId;
    let hasMore = true;

    while (hasMore) {
        const data = await fetchReplies(
            state,
            api,
            {commentId: comment.id, afterReplyId, limit: 100},
            isReply
        );
        allComments.push(...data.comments);
        hasMore = !!data.meta.pagination.next && data.comments.length > 0;
        afterReplyId = data.comments.at(-1)?.id;
    }

    return allComments;
}

// ─── Comment Mutations ────────────────────────────────────────────────────────

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
    const data = await api.comments.add({comment: {...reply, parent_id: parent.id}});
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
        comments: state.comments.map(c => {
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
    if (topLevelComment && !topLevelComment.replies?.length) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    return {
        comments: state.comments
            .map(c => {
                if (c.id === comment.id) {
                    return c.replies.length > 0 ? {...c, status: 'deleted'} : null;
                }

                const updatedReplies = c.replies.filter(r => r.id !== comment.id);
                const replyWasDeleted = updatedReplies.length !== c.replies.length;

                return {
                    ...c,
                    replies: updatedReplies,
                    ...(replyWasDeleted && c.count?.replies
                        ? {count: {...c.count, replies: c.count.replies - 1}}
                        : {})
                };
            })
            .filter(Boolean),
        commentCount: state.commentCount - 1
    };
}

// ─── Comment Visibility ───────────────────────────────────────────────────────

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
    await state.adminApi?.showComment({id: comment.id});

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

// ─── Comment Likes ────────────────────────────────────────────────────────────

function updateCommentLikeState({
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
        comments: state.comments.map(c => ({
            ...c,
            replies: c.replies.map(r => (r.id === comment.id ? applyLike(r) : r)),
            ...(c.id === comment.id ? applyLike(c) : {})
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

async function reportComment({api, data: comment}: {api: GhostApi; data: {id: string}}) {
    await api.comments.report({comment});
    return {};
}

// ─── Ordering ─────────────────────────────────────────────────────────────────

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

// ─── Member ───────────────────────────────────────────────────────────────────

async function updateMember({
    data,
    state,
    api
}: {
    data: {name: string; expertise: string};
    state: EditableAppContext;
    api: GhostApi;
}) {
    const patchData = buildMemberPatch(data, state);

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

function buildMemberPatch(
    {name, expertise}: {name: string; expertise: string},
    state: EditableAppContext
): {name?: string; expertise?: string} {
    const patch: {name?: string; expertise?: string} = {};

    if (name && state.member?.name !== name) {
        patch.name = name;
    }
    if (expertise !== undefined && state.member?.expertise !== expertise) {
        patch.expertise = expertise;
    }

    return patch;
}

// ─── UI State ─────────────────────────────────────────────────────────────────

function openPopup({data}: {data: Page}) {
    return {popup: data};
}

function closePopup() {
    return {popup: null};
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

function setScrollTarget({data: commentId}: {data: string | null}) {
    return {commentIdToScrollTo: commentId};
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
    return {
        openCommentForms: state.openCommentForms.map(f =>
            f.id === id ? {...f, hasUnsavedChanges} : {...f}
        )
    };
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

    if (shouldLoadReplies(newForm, state)) {
        const comment = state.comments.find(c => c.id === (newForm.parent_id || newForm.id));
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

    const openForms = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const existingIndex = openForms.findIndex(f => f.id === newForm.id);

    if (existingIndex > -1) {
        openForms[existingIndex] = newForm;
        return {openCommentForms: openForms, ...otherStateChanges};
    }

    return {openCommentForms: [...openForms, newForm], ...otherStateChanges};
}

function shouldLoadReplies(newForm: OpenCommentForm, state: EditableAppContext): boolean {
    if (newForm.type !== 'reply') {
        return false;
    }
    const topLevelId = newForm.parent_id || newForm.id;
    return !state.openCommentForms.some(
        f => f.id === topLevelId || f.parent_id === topLevelId
    );
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

Key refactoring improvements:

1. **Extracted shared utilities**: `isAdminContext`, `updateCommentInTree`, and `dedupeById` eliminate repeated conditional checks and mapping patterns throughout the code.

2. **Centralized API helpers**: `browseComments`, `fetchReplies`, and `readComment` consolidate the repeated admin/regular API branching logic into single functions.

3. **Extracted `fetchAllReplies`**: Pulled the pagination loop out of `loadMoreReplies` into its own focused function, reducing nesting and complexity.

4. **Extracted `buildMemberPatch`**: Separated the patch-building logic from `updateMember` for clarity.

5. **Extracted `shouldLoadReplies`**: Moved the reply-loading condition check out of `openCommentForm` into a named predicate.

6. **Consistent formatting**: Destructured parameters are formatted consistently with one property per line for readability.

7. **Simplified expressions**: Used `Array.at(-1)` instead of `array[array.length - 1]`, and simplified conditional returns throughout.

8. **Removed mutation**: Eliminated `state.commentsIsLoading = false` direct mutation in `setOrder`'s catch block.