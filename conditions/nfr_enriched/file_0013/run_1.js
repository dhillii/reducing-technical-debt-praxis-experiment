```typescript
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

// ============================================================================
// Types and Interfaces
// ============================================================================

interface ActionContext {
    state: EditableAppContext;
    api: GhostApi;
    adminApi?: AdminApi;
    options?: CommentsOptions;
    dispatchAction?: DispatchActionType;
}

interface BrowseParams {
    page: number;
    postId: string;
    order: string;
    memberUuid?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

function shouldUseAdminApi(state: EditableAppContext): boolean {
    return !!(state.admin && state.adminApi);
}

function dedupeComments(comments: Comment[]): Comment[] {
    return comments.filter((comment, index, self) => 
        self.findIndex(c => c.id === comment.id) === index
    );
}

function getLastReplyId(replies: Comment[] = []): string | undefined {
    return replies.length > 0 ? replies[replies.length - 1]?.id : undefined;
}

function updateCommentInList(
    comments: Comment[],
    commentId: string,
    updater: (comment: Comment) => Comment
): Comment[] {
    return comments.map(c => c.id === commentId ? updater(c) : c);
}

function updateCommentAndReplies(
    comments: Comment[],
    commentId: string,
    parentId: string | undefined,
    updater: (comment: Comment) => Comment
): Comment[] {
    return comments.map(c => {
        if (parentId && c.id === parentId) {
            return {
                ...c,
                replies: c.replies.map(r => r.id === commentId ? updater(r) : r)
            };
        }
        if (c.id === commentId) {
            return updater(c);
        }
        return c;
    });
}

// ============================================================================
// API Calls
// ============================================================================

async function browseComments(
    state: EditableAppContext,
    api: GhostApi,
    params: BrowseParams
) {
    if (shouldUseAdminApi(state)) {
        return await state.adminApi!.browse(params);
    }
    return await api.comments.browse({
        page: params.page,
        postId: params.postId,
        order: params.order
    });
}

async function fetchReplies(
    state: EditableAppContext,
    api: GhostApi,
    commentId: string,
    afterReplyId: string | undefined,
    limit: number,
    isReply: boolean
) {
    if (shouldUseAdminApi(state) && !isReply) {
        return await state.adminApi!.replies({
            commentId,
            afterReplyId,
            limit,
            memberUuid: state.member?.uuid
        });
    }
    return await api.comments.replies({commentId, afterReplyId, limit});
}

// ============================================================================
// Comment Loading Actions
// ============================================================================

async function loadMoreComments({state, api, options, order}: {
    state: EditableAppContext;
    api: GhostApi;
    options: CommentsOptions;
    order?: string;
}): Promise<Partial<EditableAppContext>> {
    const page = (state.pagination?.page ?? 0) + 1;
    
    const data = await browseComments(state, api, {
        page,
        postId: options.postId,
        order: order || state.order,
        memberUuid: state.member?.uuid
    });

    const updatedComments = [...state.comments, ...data.comments];
    const dedupedComments = dedupeComments(updatedComments);

    return {
        comments: dedupedComments,
        pagination: data.meta.pagination
    };
}

async function setOrder({state, data: {order}, options, api, dispatchAction}: {
    state: EditableAppContext;
    data: {order: string};
    options: CommentsOptions;
    api: GhostApi;
    dispatchAction: DispatchActionType;
}): Promise<Partial<EditableAppContext>> {
    dispatchAction('setCommentsIsLoading', true);

    try {
        const data = await browseComments(state, api, {
            page: 1,
            postId: options.postId,
            order,
            memberUuid: state.member?.uuid
        });

        return {
            comments: data.comments,
            pagination: data.meta.pagination,
            order,
            commentsIsLoading: false
        };
    } catch (error) {
        console.error('Failed to set order:', error); // eslint-disable-line no-console
        dispatchAction('setCommentsIsLoading', false);
        throw error;
    }
}

async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {comment: Comment; limit?: number | 'all'};
    isReply: boolean;
}): Promise<Partial<EditableAppContext>> {
    const allComments: Comment[] = [];
    let afterReplyId = getLastReplyId(comment.replies);

    if (limit === 'all') {
        let hasMore = true;
        while (hasMore) {
            const data = await fetchReplies(state, api, comment.id, afterReplyId, 100, isReply);
            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next && data.comments.length > 0;
            
            if (data.comments.length > 0) {
                afterReplyId = getLastReplyId(data.comments);
            }
        }
    } else {
        const data = await fetchReplies(state, api, comment.id, afterReplyId, (limit as number) || 100, isReply);
        allComments.push(...data.comments);
    }

    return {
        comments: state.comments.map(c =>
            c.id === comment.id
                ? {...c, replies: [...comment.replies, ...allComments]}
                : c
        )
    };
}

// ============================================================================
// Comment CRUD Actions
// ============================================================================

async function addComment({state, api, data: comment}: {
    state: EditableAppContext;
    api: GhostApi;
    data: AddComment;
}): Promise<Partial<EditableAppContext>> {
    const result = await api.comments.add({comment});
    const newComment = result.comments[0];

    return {
        comments: [newComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

async function addReply({state, api, data: {reply, parent}}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {reply: any; parent: any};
}): Promise<Partial<EditableAppContext>> {
    const commentToAdd = {...reply, parent_id: parent.id};
    const result = await api.comments.add({comment: commentToAdd});
    const newComment = result.comments[0];

    return {
        comments: state.comments.map(c =>
            c.id === parent.id
                ? {
                    ...parent,
                    replies: [...parent.replies, newComment],
                    count: {
                        ...parent.count,
                        replies: parent.count.replies + 1
                    }
                }
                : c
        ),
        commentCount: state.commentCount + 1
    };
}

async function editComment({state, api, data: {comment, parent}}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {comment: Partial<Comment> & {id: string}; parent?: Comment};
}): Promise<Partial<EditableAppContext>> {
    const result = await api.comments.edit({comment});
    const updatedComment = result.comments[0];

    return {
        comments: state.comments.map(c => {
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

async function deleteComment({state, api, data: comment, dispatchAction}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {id: string};
    dispatchAction: DispatchActionType;
}): Promise<Partial<EditableAppContext> | null> {
    await api.comments.edit({
        comment: {id: comment.id, status: 'deleted'}
    });

    const commentToDelete = state.comments.find(c => c.id === comment.id);
    const hasNoReplies = !commentToDelete?.replies || commentToDelete.replies.length === 0;

    if (commentToDelete && hasNoReplies) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    return {
        comments: state.comments.map(topLevelComment => {
            if (topLevelComment.id === comment.id) {
                return topLevelComment.replies.length > 0
                    ? {...topLevelComment, status: 'deleted'}
                    : null;
            }

            const updatedReplies = topLevelComment.replies.filter(r => r.id !== comment.id);
            const replyWasDeleted = updatedReplies.length < topLevelComment.replies.length;

            return {
                ...topLevelComment,
                replies: updatedReplies,
                count: replyWasDeleted && topLevelComment.count?.replies
                    ? {...topLevelComment.count, replies: topLevelComment.count.replies - 1}
                    : topLevelComment.count
            };
        }).filter(Boolean),
        commentCount: state.commentCount - 1
    };
}

// ============================================================================
// Comment Visibility Actions
// ============================================================================

async function hideComment({state, data: comment}: {
    state: EditableAppContext;
    data: {id: string};
}): Promise<Partial<EditableAppContext>> {
    if (state.adminApi) {
        await state.adminApi.hideComment(comment.id);
    }

    return {
        comments: state.comments.map(c => ({
            ...c,
            status: c.id === comment.id ? 'hidden' : c.status,
            replies: c.replies.map(r => ({
                ...r,
                status: r.id === comment.id ? 'hidden' : r.status
            }))
        })),
        commentCount: state.commentCount - 1
    };
}

async function showComment({state, api, data: comment}: {
    state: EditableAppContext;
    api: GhostApi;
    data: {id: string};
}): Promise<Partial<EditableAppContext>> {
    if (state.adminApi) {
        await state.adminApi.showComment({id: comment.id});
    }

    const result = shouldUseAdminApi(state)
        ? await state.adminApi!.read({commentId: comment.id, memberUuid: state.member?.uuid})
        : await api.comments.read(comment.id);

    const updatedComment = result.comments[0];

    return {
        comments: state.comments.map(c => ({
            ...c,
            ...( c.id === comment.id && {status: updatedComment.status}),
            replies: c.replies.map(r => r.id === comment.id ? updatedComment : r)
        })),
        commentCount: state.commentCount + 1
    };
}

// ============================================================================
// Comment Interaction Actions
// ============================================================================

async function updateCommentLikeState({state, data: comment}: {
    state: EditableAppContext;
    data: {id: string; liked: boolean};
}): Promise<Partial<EditableAppContext>> {
    const updateLikes = (c: Comment) => ({
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
            ...(c.id === comment.id && updateLikes(c)),
            replies: c.replies.map(r => r.id === comment.id ? updateLikes(r) : r)
        }))
    };
}

async function likeComment({api, data: comment, dispatchAction}: {
    api: GhostApi;
    data: {id: string};
    dispatchAction: DispatchActionType;
}): Promise<{}> {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    }
    return {};
}

async function unlikeComment({api, data: comment, dispatchAction}: {
    api: GhostApi;
    data: {id: string};
    dispatchAction: DispatchActionType;
}): Promise<{}> {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    try {
        await api.comments.unlike({comment});
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    }
    return {};
}

async function reportComment({api, data: comment}: {
    api: GhostApi;
    data: {id: string};
}): Promise<{}> {
    await api.comments.report({comment});
    return {};
}

// ============================================================================
// Member Actions
// ============================================================================

async function updateMember({data, state, api}: {
    data: {name: string; expertise: string};
    state: EditableAppContext;
    api: GhostApi;
}): Promise<Partial<EditableAppContext> | null> {
    const patchData: {name?: string; expertise?: string} = {};

    if (data.name && state.member?.name !== data.name) {
        patchData.name = data.name;
    }

    if (data.expertise !== undefined && state.member?.expertise !== data.expertise) {
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

// ============================================================================
// UI Actions
// ============================================================================

async function openCommentForm({data: newForm, api, state}: {
    data: OpenCommentForm;
    api: GhostApi;
    state: EditableAppContext;
}): Promise<Partial<EditableAppContext>> {
    let otherStateChanges = {};

    const topLevelCommentId = newForm.parent_id || newForm.id;
    const isReplyFormWithoutLoadedReplies = 
        newForm.type === 'reply' && 
        !state.openCommentForms.some(f => f.id === topLevelCommentId || f.parent_id === topLevelCommentId);

    if (isReplyFormWithoutLoadedReplies) {
        const comment = state.comments.find(c => c.id === topLevelCommentId);
        if (comment) {
            const newCommentsState