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
): Promise<{comments: Comment[]; meta: {pagination: any}}> {
    return isAdminContext(state)
        ? state.adminApi!.browse({...params, memberUuid: state.member?.uuid})
        : api.comments.browse(params);
}

async function readComment(
    state: EditableAppContext,
    api: GhostApi,
    commentId: string
): Promise<{comments: Comment[]}> {
    return isAdminContext(state)
        ? state.adminApi!.read({commentId, memberUuid: state.member?.uuid})
        : api.comments.read(commentId);
}

async function fetchReplies(
    state: EditableAppContext,
    api: GhostApi,
    commentId: string,
    afterReplyId: string | undefined,
    limit: number,
    isReply: boolean
): Promise<{comments: Comment[]; meta: {pagination: any}}> {
    const useAdminApi = isAdminContext(state) && !isReply;
    return useAdminApi
        ? state.adminApi!.replies({commentId, afterReplyId, limit, memberUuid: state.member?.uuid})
        : api.comments.replies({commentId, afterReplyId, limit});
}

function dedupeComments(comments: Comment[]): Comment[] {
    return comments.filter(
        (comment, index, self) => self.findIndex(c => c.id === comment.id) === index
    );
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
    return comments
        .map((c) => {
            const updatedReplies = c.replies.map(r =>
                r.id === targetId ? replyUpdater(r) : r
            );

            if (c.id === targetId) {
                return commentUpdater({...c, replies: updatedReplies});
            }

            return {...c, replies: updatedReplies};
        })
        .filter(Boolean) as Comment[];
}

function getLastReplyId(comment: Comment): string | undefined {
    return comment.replies?.length > 0
        ? comment.replies[comment.replies.length - 1]?.id
        : undefined;
}

// ─── Reply Loading ─────────────────────────────────────────────────────────────

async function fetchAllReplies(
    state: EditableAppContext,
    api: GhostApi,
    comment: Comment,
    isReply: boolean
): Promise<Comment[]> {
    const allComments: Comment[] = [];
    let afterReplyId = getLastReplyId(comment);
    let hasMore = true;

    while (hasMore) {
        const data = await fetchReplies(state, api, comment.id, afterReplyId, 100, isReply);
        allComments.push(...data.comments);
        hasMore = data.comments.length > 0 && !!data.meta.pagination.next;
        afterReplyId = data.comments[data.comments.length - 1]?.id;
    }

    return allComments;
}

async function fetchPagedReplies(
    state: EditableAppContext,
    api: GhostApi,
    comment: Comment,
    limit: number,
    isReply: boolean
): Promise<Comment[]> {
    const afterReplyId = getLastReplyId(comment);
    const data = await fetchReplies(state, api, comment.id, afterReplyId, limit, isReply);
    return data.comments;
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
        comments: dedupeComments([...state.comments, ...data.comments]),
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
        const data = await browseComments(state, api, {
            page: 1,
            postId: options.postId,
            order
        });

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
    const newReplies = limit === 'all'
        ? await fetchAllReplies(state, api, comment, isReply)
        : await fetchPagedReplies(state, api, comment, (limit as number) || 100, isReply);

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

    return {
        comments: state.comments
            .map((topLevel) => {
                if (topLevel.id === comment.id) {
                    return topLevel.replies.length > 0
                        ? {...topLevel, status: 'deleted'}
                        : null;
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
            if (parent?.id === c.id) {
                return {
                    ...c,
                    replies: c.replies.map(r => r.id === updatedComment.id ? updatedComment : r)
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

// ─── Action Maps ──────────────────────────────────────────────────────────────

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
    return handler
        ? await handler({data, state, api, adminApi, options, dispatchAction} as any) || {}
        : {};
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
    return handler
        ? handler({data, state, api, adminApi, options} as any) || {}
        : {};
}
```

Key refactoring improvements:

1. **Extracted shared helpers**: `isAdminContext`, `browseComments`, `readComment`, `fetchReplies`, `dedupeComments` eliminate repeated admin/API branching logic throughout the file.

2. **Generalized comment tree traversal**: `updateCommentInList` and `updateCommentAndReplies` replace duplicated `.map()` patterns across `hideComment`, `showComment`, `updateCommentLikeState`, and `addReply`.

3. **Split reply fetching**: `fetchAllReplies` and `fetchPagedReplies` replace the nested `if/while` block in `loadMoreReplies`, making each path independently readable.

4. **Extracted `buildLikeUpdate`**: Removes duplicated like/unlike delta logic used in both comment and reply updates.

5. **Simplified conditionals**: Replaced verbose `if/else` blocks with ternary expressions where intent is clear (e.g., `ActionHandler`, `SyncActionHandler`, `deleteComment`).

6. **Consistent formatting**: Destructured parameters are formatted uniformly across all functions for readability.