```typescript
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

// Helper: Fetch comments based on admin or public API
async function fetchComments({state, api, page, postId, order, memberUuid}: {state: EditableAppContext, api: GhostApi, page: number, postId: string, order: string, memberUuid?: string}) {
    if (state.admin && state.adminApi) {
        return await state.adminApi.browse({page, postId, order, memberUuid});
    }
    return await api.comments.browse({page, postId, order});
}

// Helper: Deduplicate comments by ID
function deduplicateComments(comments: Comment[]): Comment[] {
    return comments.filter((comment, index, self) => self.findIndex(c => c.id === comment.id) === index);
}

// Helper: Get next page number
function getNextPage(pagination: any): number {
    return pagination?.page ? pagination.page + 1 : 1;
}

async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?: string}): Promise<Partial<EditableAppContext>> {
    const page = getNextPage(state.pagination);
    const data = await fetchComments({
        state,
        api,
        page,
        postId: options.postId,
        order: order || state.order,
        memberUuid: state.member?.uuid
    });

    const updatedComments = [...state.comments, ...data.comments];
    const dedupedComments = deduplicateComments(updatedComments);

    return {
        comments: dedupedComments,
        pagination: data.meta.pagination
    };
}

function setCommentsIsLoading({data: isLoading}: {data: boolean | null}) {
    return {
        commentsIsLoading: isLoading
    };
}

async function setOrder({state, data: {order}, options, api, dispatchAction}: {state: EditableAppContext, data: {order: string}, options: CommentsOptions, api: GhostApi, dispatchAction: DispatchActionType}) {
    dispatchAction('setCommentsIsLoading', true);

    try {
        const data = await fetchComments({
            state,
            api,
            page: 1,
            postId: options.postId,
            order,
            memberUuid: state.member?.uuid
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

// Helper: Fetch replies from admin or public API
async function fetchReplies({state, api, commentId, afterReplyId, limit, isReply}: {state: EditableAppContext, api: GhostApi, commentId: string, afterReplyId?: string, limit: number, isReply: boolean}) {
    if (state.admin && state.adminApi && !isReply) {
        return await state.adminApi.replies({commentId, afterReplyId, limit, memberUuid: state.member?.uuid});
    }
    return await api.comments.replies({commentId, afterReplyId, limit});
}

// Helper: Get the ID of the last reply
function getLastReplyId(replies?: Comment[]): string | undefined {
    return replies?.[replies.length - 1]?.id;
}

// Helper: Load all replies with pagination
async function loadAllReplies({state, api, commentId, isReply}: {state: EditableAppContext, api: GhostApi, commentId: string, isReply: boolean}): Promise<Comment[]> {
    let afterReplyId: string | undefined;
    let allComments: Comment[] = [];
    let hasMore = true;

    while (hasMore) {
        const data = await fetchReplies({state, api, commentId, afterReplyId, limit: 100, isReply});
        allComments.push(...data.comments);
        hasMore = !!data.meta.pagination.next;
        afterReplyId = getLastReplyId(data.comments) || undefined;
    }

    return allComments;
}

// Helper: Load limited replies
async function loadLimitedReplies({state, api, commentId, limit, isReply}: {state: EditableAppContext, api: GhostApi, commentId: string, limit: number, isReply: boolean}): Promise<Comment[]> {
    const data = await fetchReplies({state, api, commentId, limit, isReply});
    return data.comments;
}

async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const afterReplyId = getLastReplyId(comment.replies);

    const allComments = limit === 'all'
        ? await loadAllReplies({state, api, commentId: comment.id, isReply})
        : await loadLimitedReplies({state, api, commentId: comment.id, limit: (limit as number) || 100, isReply});

    return {
        comments: state.comments.map((c) => {
            if (c.id === comment.id) {
                return {
                    ...comment,
                    replies: [...(comment.replies || []), ...allComments]
                };
            }
            return c;
        })
    };
}

async function addComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, data: AddComment}) {
    const data = await api.comments.add({comment});
    const newComment = data.comments[0];

    return {
        comments: [newComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}) {
    const replyWithParent = {
        ...reply,
        parent_id: parent.id
    };

    const data = await api.comments.add({comment: replyWithParent});
    const newReply = data.comments[0];

    return {
        comments: state.comments.map((c) => {
            if (c.id === parent.id) {
                return {
                    ...parent,
                    replies: [...(parent.replies || []), newReply],
                    count: {
                        ...parent.count,
                        replies: parent.count.replies + 1
                    }
                };
            }
            return c;
        }),
        commentCount: state.commentCount + 1
    };
}

// Helper: Update comment status in replies
function updateReplyStatus(replies: Comment[], commentId: string, status: string): Comment[] {
    return replies.map((r) => {
        if (r.id === commentId) {
            return {...r, status};
        }
        return r;
    });
}

// Helper: Update comment in state tree
function updateCommentInState(comments: Comment[], commentId: string, status: string): Comment[] {
    return comments.map((c) => {
        const replies = updateReplyStatus(c.replies || [], commentId, status);
        if (c.id === commentId) {
            return {...c, status, replies};
        }
        return {...c, replies};
    });
}

async function hideComment({state, data: comment}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    await state.adminApi?.hideComment(comment.id);

    return {
        comments: updateCommentInState(state.comments, comment.id, 'hidden'),
        commentCount: state.commentCount - 1
    };
}

// Helper: Fetch updated comment data
async function fetchUpdatedComment({state, api, commentId}: {state: EditableAppContext, api: GhostApi, commentId: string}): Promise<Comment> {
    let data;
    if (state.admin && state.adminApi) {
        data = await state.adminApi.read({commentId, memberUuid: state.member?.uuid});
    } else {
        data = await api.comments.read(commentId);
    }
    return data.comments[0];
}

// Helper: Replace comment in state tree
function replaceCommentInState(comments: Comment[], oldCommentId: string, newComment: Comment): Comment[] {
    return comments.map((c) => {
        const replies = c.replies?.map((r) => {
            if (r.id === oldCommentId) {
                return newComment;
            }
            return r;
        }) || [];

        if (c.id === oldCommentId) {
            return newComment;
        }

        return {...c, replies};
    });
}

async function showComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    await state.adminApi?.showComment({id: comment.id});

    const updatedComment = await fetchUpdatedComment({state, api, commentId: comment.id});

    return {
        comments: replaceCommentInState(state.comments, comment.id, updatedComment),
        commentCount: state.commentCount + 1
    };
}

// Helper: Update like count
function updateLikeCount(count: any, liked: boolean): any {
    return {
        ...count,
        likes: liked ? count.likes + 1 : count.likes - 1
    };
}

// Helper: Update reply like state
function updateReplyLikeState(replies: Comment[], commentId: string, liked: boolean): Comment[] {
    return replies.map((r) => {
        if (r.id === commentId) {
            return {
                ...r,
                liked,
                count: updateLikeCount(r.count, liked)
            };
        }
        return r;
    });
}

// Helper: Update comment like state in tree
function updateCommentLikeInState(comments: Comment[], commentId: string, liked: boolean): Comment[] {
    return comments.map((c) => {
        const replies = updateReplyLikeState(c.replies || [], commentId, liked);

        if (c.id === commentId) {
            return {
                ...c,
                liked,
                replies,
                count: updateLikeCount(c.count, liked)
            };
        }

        return {...c, replies};
    });
}

async function updateCommentLikeState({state, data: comment}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: updateCommentLikeInState(state.comments, comment.id, comment.liked)
    };
}

async function likeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    try {
        await api.comments.like({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});
    }
}

async function unlikeComment({api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    dispatchAction('updateCommentLikeState', {id: comment.id, liked: false});

    try {
        await api.comments.unlike({comment});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id: comment.id, liked: true});
    }
}

async function reportComment({api, data: comment}: {api: GhostApi, data: {id: string}}) {
    await api.comments.report({comment});
    return {};
}

// Helper: Check if comment has no replies
function hasNoReplies(comment?: Comment): boolean {
    return !comment?.replies || comment.replies.length === 0;
}

// Helper: Update replies after deletion
function updateRepliesAfterDeletion(replies: Comment[], deletedCommentId: string): {updated: Comment[], hasDeleted: boolean} {
    const updated = replies.filter(reply => reply.id !== deletedCommentId);
    return {updated, hasDeleted: replies.length !== updated.length};
}

// Helper: Update comment count if reply was deleted
function updateReplyCount(count: any, hasDeleted: boolean): any {
    if (hasDeleted && count?.replies) {
        return {...count, replies: count.replies - 1};
    }
    return count;
}

// Helper: Process comment deletion
function processCommentDeletion(topLevelComment: Comment, deletedCommentId: string): Comment | null {
    if (topLevelComment.id === deletedCommentId) {
        if (topLevelComment.replies?.length) {
            return {...topLevelComment, status: 'deleted'};
        }
        return null;
    }

    const {updated: updatedReplies, hasDeleted} = updateRepliesAfterDeletion(topLevelComment.replies || [], deletedCommentId);

    return {
        ...topLevelComment,
        replies: updatedReplies,
        count: updateReplyCount(topLevelComment.count, hasDeleted)
    };
}

async function deleteComment({state, api, data: comment, dispatchAction}: {state: EditableAppContext, api: GhostApi, data: {id: string}, dispatchAction: DispatchActionType}) {
    await api.comments.edit({
        comment: {
            id: comment.id,
            status: 'deleted'
        }
    });

    const commentToDelete = state.comments.find(c => c.id === comment.id);
    if (commentToDelete && hasNoReplies(commentToDelete)) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    return {
        comments: state.comments.map(c => processCommentDeletion(c, comment.id)).filter(Boolean),
        commentCount: state.commentCount - 1
    };
}

async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const data = await api.comments.edit({comment});
    const updatedComment = data.comments[0];

    return {
        comments: state.comments.map((c) => {
            if (parent?.id === c.id) {
                return {
                    ...c,
                    replies: c.replies?.map((r) => {
                        if (r.id === updatedComment.id) {
                            return updatedComment;
                        }
                        return r;
                    }) || []
                };
            }
            if (c.id === updatedComment.id) {
                return updatedComment;
            }
            return c;
        })
    };
}

// Helper: Build patch data for member update
function buildMemberPatchData(data: {name: string, expertise: string}, member?: any): {name?: string, expertise?: string} {
    const patchData: {name?: string, expertise?: string} = {};

    if (data.name && member?.name !== data.name) {
        patchData.name = data.name;
    }

    if (data.expertise !== undefined && member?.expertise !== data.expertise) {
        patchData.expertise = data.expertise;
    }

    return patchData;
}

async function updateMember({data, state,