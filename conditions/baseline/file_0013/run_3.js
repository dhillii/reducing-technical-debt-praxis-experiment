```typescript
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

// ============================================================================
// Type Definitions
// ============================================================================

type ActionContext = {
    state: EditableAppContext;
    api: GhostApi;
    adminApi?: AdminApi;
    options?: CommentsOptions;
    dispatchAction?: DispatchActionType;
};

type CommentUpdateFn = (comment: Comment) => Comment;

// ============================================================================
// Utility Functions
// ============================================================================

function dedupeComments(comments: Comment[]): Comment[] {
    return comments.filter((comment, index, self) => 
        self.findIndex(c => c.id === comment.id) === index
    );
}

function getNextPage(state: EditableAppContext): number {
    return (state.pagination?.page ?? 0) + 1;
}

function getLastReplyId(comment: Comment): string | undefined {
    return comment.replies?.[comment.replies.length - 1]?.id;
}

function updateCommentInState(
    comments: Comment[],
    commentId: string,
    updateFn: CommentUpdateFn,
    parentId?: string
): Comment[] {
    return comments.map(c => {
        if (parentId && c.id === parentId) {
            return {
                ...c,
                replies: c.replies.map(r => r.id === commentId ? updateFn(r) : r)
            };
        }
        if (c.id === commentId) {
            return updateFn(c);
        }
        return {
            ...c,
            replies: c.replies.map(r => r.id === commentId ? updateFn(r) : r)
        };
    });
}

function findCommentInState(state: EditableAppContext, commentId: string): Comment | undefined {
    const topLevel = state.comments.find(c => c.id === commentId);
    if (topLevel) return topLevel;
    
    for (const comment of state.comments) {
        const reply = comment.replies?.find(r => r.id === commentId);
        if (reply) return reply;
    }
    return undefined;
}

// ============================================================================
// API Fetch Functions
// ============================================================================

async function fetchComments(
    state: EditableAppContext,
    api: GhostApi,
    page: number,
    postId: string,
    order: string
) {
    if (state.admin && state.adminApi) {
        return await state.adminApi.browse({
            page,
            postId,
            order,
            memberUuid: state.member?.uuid
        });
    }
    return await api.comments.browse({page, postId, order});
}

async function fetchReplies(
    state: EditableAppContext,
    api: GhostApi,
    commentId: string,
    afterReplyId: string | undefined,
    limit: number,
    isReply: boolean
) {
    if (state.admin && state.adminApi && !isReply) {
        return await state.adminApi.replies({
            commentId,
            afterReplyId,
            limit,
            memberUuid: state.member?.uuid
        });
    }
    return await api.comments.replies({commentId, afterReplyId, limit});
}

async function fetchCommentById(
    state: EditableAppContext,
    api: GhostApi,
    commentId: string
) {
    if (state.admin && state.adminApi) {
        return await state.adminApi.read({
            commentId,
            memberUuid: state.member?.uuid
        });
    }
    return await api.comments.read(commentId);
}

// ============================================================================
// Comment Actions
// ============================================================================

async function loadMoreComments({state, api, options, order}: ActionContext & {options: CommentsOptions, order?: string}): Promise<Partial<EditableAppContext>> {
    const page = getNextPage(state);
    const data = await fetchComments(state, api, page, options.postId, order || state.order);
    const updatedComments = [...state.comments, ...data.comments];
    const dedupedComments = dedupeComments(updatedComments);

    return {
        comments: dedupedComments,
        pagination: data.meta.pagination
    };
}

async function setOrder({state, data: {order}, options, api, dispatchAction}: ActionContext & {data: {order: string}, options: CommentsOptions}): Promise<Partial<EditableAppContext>> {
    dispatchAction?.('setCommentsIsLoading', true);

    try {
        const data = await fetchComments(state, api, 1, options.postId, order);
        return {
            comments: data.comments,
            pagination: data.meta.pagination,
            order,
            commentsIsLoading: false
        };
    } catch (error) {
        console.error('Failed to set order:', error);
        throw error;
    }
}

async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: ActionContext & {data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const allComments: Comment[] = [];
    let afterReplyId = getLastReplyId(comment);

    if (limit === 'all') {
        let hasMore = true;
        while (hasMore) {
            const data = await fetchReplies(state, api, comment.id, afterReplyId, 100, isReply);
            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next;
            afterReplyId = getLastReplyId({...comment, replies: data.comments});
        }
    } else {
        const data = await fetchReplies(state, api, comment.id, afterReplyId, (limit as number) || 100, isReply);
        allComments.push(...data.comments);
    }

    return {
        comments: state.comments.map(c =>
            c.id === comment.id
                ? {...c, replies: [...(c.replies || []), ...allComments]}
                : c
        )
    };
}

async function addComment({state, api, data: comment}: ActionContext & {data: AddComment}): Promise<Partial<EditableAppContext>> {
    const result = await api.comments.add({comment});
    const newComment = result.comments[0];

    return {
        comments: [newComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

async function addReply({state, api, data: {reply, parent}}: ActionContext & {data: {reply: any, parent: any}}): Promise<Partial<EditableAppContext>> {
    const commentData = {...reply, parent_id: parent.id};
    const result = await api.comments.add({comment: commentData});
    const newReply = result.comments[0];

    return {
        comments: state.comments.map(c =>
            c.id === parent.id
                ? {
                    ...c,
                    replies: [...(c.replies || []), newReply],
                    count: {...c.count, replies: (c.count?.replies ?? 0) + 1}
                }
                : c
        ),
        commentCount: state.commentCount + 1
    };
}

async function editComment({state, api, data: {comment, parent}}: ActionContext & {data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}): Promise<Partial<EditableAppContext>> {
    const result = await api.comments.edit({comment});
    const updatedComment = result.comments[0];

    return {
        comments: updateCommentInState(state.comments, updatedComment.id, () => updatedComment, parent?.id)
    };
}

async function deleteComment({state, api, data: comment, dispatchAction}: ActionContext & {data: {id: string}}): Promise<Partial<EditableAppContext> | null> {
    await api.comments.edit({
        comment: {id: comment.id, status: 'deleted'}
    });

    const commentToDelete = findCommentInState(state, comment.id);
    const hasNoReplies = !commentToDelete?.replies || commentToDelete.replies.length === 0;

    if (commentToDelete && hasNoReplies) {
        dispatchAction?.('setOrder', {order: state.order});
        return null;
    }

    return {
        comments: state.comments
            .map(c => {
                if (c.id === comment.id) {
                    return c.replies?.length ? {...c, status: 'deleted'} : null;
                }
                return {
                    ...c,
                    replies: c.replies.filter(r => r.id !== comment.id),
                    count: c.replies.some(r => r.id === comment.id)
                        ? {...c.count, replies: (c.count?.replies ?? 0) - 1}
                        : c.count
                };
            })
            .filter(Boolean) as Comment[],
        commentCount: state.commentCount - 1
    };
}

async function hideComment({state, data: comment}: ActionContext & {data: {id: string}}): Promise<Partial<EditableAppContext>> {
    if (state.adminApi) {
        await state.adminApi.hideComment(comment.id);
    }

    return {
        comments: updateCommentInState(
            state.comments,
            comment.id,
            c => ({...c, status: 'hidden'})
        ),
        commentCount: state.commentCount - 1
    };
}

async function showComment({state, api, data: comment}: ActionContext & {data: {id: string}}): Promise<Partial<EditableAppContext>> {
    if (state.adminApi) {
        await state.adminApi.showComment({id: comment.id});
    }

    const result = await fetchCommentById(state, api, comment.id);
    const updatedComment = result.comments[0];

    return {
        comments: updateCommentInState(
            state.comments,
            comment.id,
            () => updatedComment
        ),
        commentCount: state.commentCount + 1
    };
}

// ============================================================================
// Like/Reaction Actions
// ============================================================================

async function updateCommentLikeState({state, data: comment}: ActionContext & {data: {id: string, liked: boolean}}): Promise<Partial<EditableAppContext>> {
    return {
        comments: updateCommentInState(
            state.comments,
            comment.id,
            c => ({
                ...c,
                liked: comment.liked,
                count: {
                    ...c.count,
                    likes: comment.liked ? (c.count?.likes ?? 0) + 1 : (c.count?.likes ?? 0) - 1
                }
            })
        )
    };
}

async function likeComment({api, data: comment, dispatchAction}: ActionContext & {data: {id: string}}): Promise<Partial<EditableAppContext>> {
    dispatchAction?.('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
        return {};
    } catch {
        dispatchAction?.('updateCommentLikeState', {id: comment.id, liked: false});
    }
}

async function unlikeComment({api, data: comment, dispatchAction}: ActionContext & {data: {id: string}}): Promise<Partial<EditableAppContext>> {
    dispatchAction?.('updateCommentLikeState', {id: comment.id, liked: false});
    try {
        await api.comments.unlike({comment});
        return {};
    } catch {
        dispatchAction?.('updateCommentLikeState', {id: comment.id, liked: true});
    }
}

async function reportComment({api, data: comment}: ActionContext & {data: {id: string}}): Promise<Partial<EditableAppContext>> {
    await api.comments.report({comment});
    return {};
}

// ============================================================================
// Member Actions
// ============================================================================

async function updateMember({data, state, api}: ActionContext & {data: {name: string, expertise: string}}): Promise<Partial<EditableAppContext> | null> {
    const {name, expertise} = data;
    const patchData: {name?: string, expertise?: string} = {};

    if (name && state.member?.name !== name) {
        patchData.name = name;
    }

    if (expertise !== undefined && state.member?.expertise !== expertise) {
        patchData.expertise = expertise;
    }

    if (Object.keys(patchData).length === 0) {
        return null;
    }

    try {
        const member = await api.member.update(patchData);
        if (!member) throw new Error('Failed to update member');
        return {member, success: true};
    } catch (error) {
        return {success: false, error};
    }
}

// ============================================================================
// UI Actions
// ============================================================================

function setCommentsIsLoading({data: isLoading}: {data: boolean | null}): Partial<EditableAppContext> {
    return {commentsIsLoading: isLoading};
}

function openPopup({data}: {data: Page}): Partial<EditableAppContext> {
    return {popup: data};
}

function closePopup(): Partial<EditableAppContext> {
    return {popup: null};
}

async function openCommentForm({data: newForm, api, state}: ActionContext & {data: OpenCommentForm}): Promise<Partial<EditableAppContext>> {
    let otherStateChanges: Partial<EditableAppContext> = {};

    const topLevelCommentId = newForm.parent_id || newForm.id;
    const isReplyFormForNewParent = newForm.type === 'reply' && 
        !state.openCommentForms.some(f => f.id === topLevelCommentId || f.parent_id === topLevelCommentId);

    if (isReplyFormForNewParent) {
        const comment = state.comments.find(c => c.id === topLevelCommentId);
        if (comment) {
            const newCommentsState = await loadMoreReplies({state, api, data: {comment, limit: 'all'}, isReply: true});
            otherStateChanges = newCommentsState;
        }
    }

    const openFormsAfterAutoclose = state.openCommentForms.filter(f => f.hasUnsavedChanges);
    const existingFormIndex = openFormsAfterAutoclose.findIndex(f => f.id === newForm.id);

    const updatedForms = existingFormIndex > -1
        ? openFormsAfterAutoclose.map((f, i) => i === existingFormIndex ? newForm : f)
        : [...openFormsAfterAutoclose, newForm];

    return {openCommentForms: updatedForms, ...otherStateChanges};
}

function setHighlightComment({data: commentId}: {data: string | null}): Partial<EditableAppContext> {
    return {commentIdToHighlight: commentId};
}

function highlightComment({data: {commentId}, dispatchAction}: {data: {commentId: string | null}, dispatchAction: DispatchActionType}): Partial<EditableAppContext> {
    setTimeout(() => {
        dispatchAction('setHighlightComment', null);
    }, 3000);
    return {commentIdToHighlight: commentId};
}

function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string, hasUnsavedChanges: boolean}, state: EditableAppContext}): Partial<EditableAppContext> {
    return {
        openCommentForms: state.openCommentForms.map(f =>
            f.id === id ? {...f, hasUnsavedChanges} : f
        )
    };
}

function