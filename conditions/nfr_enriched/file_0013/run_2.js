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
    order?: string;
    memberUuid?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

function dedupeComments(comments: Comment[]): Comment[] {
    return comments.filter((comment, index, self) => 
        self.findIndex(c => c.id === comment.id) === index
    );
}

function getNextPage(pagination?: {page?: number}): number {
    return (pagination?.page ?? 0) + 1;
}

function shouldUseAdminApi(state: EditableAppContext, isReply?: boolean): boolean {
    return !!(state.admin && state.adminApi && !isReply);
}

function findCommentById(comments: Comment[], id: string): Comment | undefined {
    return comments.find(c => c.id === id);
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
// API Fetch Helpers
// ============================================================================

async function browseComments(
    context: ActionContext,
    params: BrowseParams
): Promise<any> {
    if (shouldUseAdminApi(context.state)) {
        return context.state.adminApi!.browse({
            ...params,
            memberUuid: context.state.member?.uuid
        });
    }
    return context.api.comments.browse(params);
}

async function fetchReplies(
    context: ActionContext,
    commentId: string,
    afterReplyId: string | undefined,
    limit: number,
    isReply: boolean
): Promise<any> {
    if (shouldUseAdminApi(context.state, isReply)) {
        return context.state.adminApi!.replies({
            commentId,
            afterReplyId,
            limit,
            memberUuid: context.state.member?.uuid
        });
    }
    return context.api.comments.replies({commentId, afterReplyId, limit});
}

// ============================================================================
// Comment Actions
// ============================================================================

async function loadMoreComments(
    context: ActionContext & {data: CommentsOptions; order?: string}
): Promise<Partial<EditableAppContext>> {
    const page = getNextPage(context.state.pagination);
    const data = await browseComments(context, {
        page,
        postId: context.data.postId,
        order: context.order || context.state.order
    });

    const updatedComments = [...context.state.comments, ...data.comments];
    const dedupedComments = dedupeComments(updatedComments);

    return {
        comments: dedupedComments,
        pagination: data.meta.pagination
    };
}

async function setOrder(
    context: ActionContext & {data: {order: string}}
): Promise<Partial<EditableAppContext>> {
    context.dispatchAction?.('setCommentsIsLoading', true);

    try {
        const data = await browseComments(context, {
            page: 1,
            postId: context.options!.postId,
            order: context.data.order
        });

        return {
            comments: data.comments,
            pagination: data.meta.pagination,
            order: context.data.order,
            commentsIsLoading: false
        };
    } catch (error) {
        console.error('Failed to set order:', error);
        throw error;
    }
}

async function addComment(
    context: ActionContext & {data: AddComment}
): Promise<Partial<EditableAppContext>> {
    const result = await context.api.comments.add({comment: context.data});
    const comment = result.comments[0];

    return {
        comments: [comment, ...context.state.comments],
        commentCount: context.state.commentCount + 1
    };
}

async function addReply(
    context: ActionContext & {data: {reply: any; parent: any}}
): Promise<Partial<EditableAppContext>> {
    const {reply, parent} = context.data;
    const comment = {...reply, parent_id: parent.id};

    const result = await context.api.comments.add({comment});
    const addedComment = result.comments[0];

    return {
        comments: updateCommentInList(context.state.comments, parent.id, c => ({
            ...c,
            replies: [...c.replies, addedComment],
            count: {
                ...c.count,
                replies: c.count.replies + 1
            }
        })),
        commentCount: context.state.commentCount + 1
    };
}

async function editComment(
    context: ActionContext & {data: {comment: Partial<Comment> & {id: string}; parent?: Comment}}
): Promise<Partial<EditableAppContext>> {
    const result = await context.api.comments.edit({comment: context.data.comment});
    const updatedComment = result.comments[0];
    const {parent} = context.data;

    return {
        comments: updateCommentAndReplies(
            context.state.comments,
            updatedComment.id,
            parent?.id,
            () => updatedComment
        )
    };
}

async function deleteComment(
    context: ActionContext & {data: {id: string}}
): Promise<Partial<EditableAppContext> | null> {
    await context.api.comments.edit({
        comment: {id: context.data.id, status: 'deleted'}
    });

    const commentToDelete = findCommentById(context.state.comments, context.data.id);
    const hasNoReplies = !commentToDelete?.replies || commentToDelete.replies.length === 0;

    if (commentToDelete && hasNoReplies) {
        context.dispatchAction?.('setOrder', {order: context.state.order});
        return null;
    }

    return {
        comments: context.state.comments
            .map(topLevelComment => {
                if (topLevelComment.id === context.data.id) {
                    return topLevelComment.replies.length > 0
                        ? {...topLevelComment, status: 'deleted'}
                        : null;
                }

                const updatedReplies = topLevelComment.replies.filter(
                    r => r.id !== context.data.id
                );
                const deletedReplyCount = topLevelComment.replies.length - updatedReplies.length;

                return {
                    ...topLevelComment,
                    replies: updatedReplies,
                    count: deletedReplyCount > 0 && topLevelComment.count
                        ? {...topLevelComment.count, replies: topLevelComment.count.replies - deletedReplyCount}
                        : topLevelComment.count
                };
            })
            .filter(Boolean) as Comment[],
        commentCount: context.state.commentCount - 1
    };
}

async function hideComment(
    context: ActionContext & {data: {id: string}}
): Promise<Partial<EditableAppContext>> {
    await context.state.adminApi?.hideComment(context.data.id);

    return {
        comments: context.state.comments.map(c => ({
            ...c,
            status: c.id === context.data.id ? 'hidden' : c.status,
            replies: c.replies.map(r => ({
                ...r,
                status: r.id === context.data.id ? 'hidden' : r.status
            }))
        })),
        commentCount: context.state.commentCount - 1
    };
}

async function showComment(
    context: ActionContext & {data: {id: string}}
): Promise<Partial<EditableAppContext>> {
    await context.state.adminApi?.showComment({id: context.data.id});

    const result = shouldUseAdminApi(context.state)
        ? await context.state.adminApi!.read({
            commentId: context.data.id,
            memberUuid: context.state.member?.uuid
        })
        : await context.api.comments.read(context.data.id);

    const updatedComment = result.comments[0];

    return {
        comments: context.state.comments.map(c => ({
            ...c,
            ...( c.id === context.data.id ? updatedComment : {}),
            replies: c.replies.map(r => r.id === context.data.id ? updatedComment : r)
        })),
        commentCount: context.state.commentCount + 1
    };
}

// ============================================================================
// Reply Actions
// ============================================================================

async function loadMoreReplies(
    context: ActionContext & {data: {comment: Comment; limit?: number | 'all'}; isReply: boolean}
): Promise<Partial<EditableAppContext>> {
    const {comment, limit} = context.data;
    const allReplies: Comment[] = [];
    let afterReplyId = comment.replies?.[comment.replies.length - 1]?.id;

    if (limit === 'all') {
        let hasMore = true;
        while (hasMore) {
            const data = await fetchReplies(
                context,
                comment.id,
                afterReplyId,
                100,
                context.isReply
            );
            allReplies.push(...data.comments);
            hasMore = !!data.meta.pagination.next && data.comments.length > 0;
            if (data.comments.length > 0) {
                afterReplyId = data.comments[data.comments.length - 1].id;
            }
        }
    } else {
        const data = await fetchReplies(
            context,
            comment.id,
            afterReplyId,
            (limit as number) || 100,
            context.isReply
        );
        allReplies.push(...data.comments);
    }

    return {
        comments: updateCommentInList(context.state.comments, comment.id, c => ({
            ...c,
            replies: [...c.replies, ...allReplies]
        }))
    };
}

// ============================================================================
// Like/Reaction Actions
// ============================================================================

function updateCommentLikeState(
    context: ActionContext & {data: {id: string; liked: boolean}}
): Partial<EditableAppContext> {
    const {id, liked} = context.data;

    return {
        comments: context.state.comments.map(c => {
            const replies = c.replies.map(r => 
                r.id === id
                    ? {
                        ...r,
                        liked,
                        count: {
                            ...r.count,
                            likes: liked ? r.count.likes + 1 : r.count.likes - 1
                        }
                    }
                    : r
            );

            return c.id === id
                ? {
                    ...c,
                    liked,
                    replies,
                    count: {
                        ...c.count,
                        likes: liked ? c.count.likes + 1 : c.count.likes - 1
                    }
                }
                : {...c, replies};
        })
    };
}

async function likeComment(
    context: ActionContext & {data: {id: string}}
): Promise<Partial<EditableAppContext>> {
    context.dispatchAction?.('updateCommentLikeState', {id: context.data.id, liked: true});
    try {
        await context.api.comments.like({comment: context.data});
        return {};
    } catch {
        context.dispatchAction?.('updateCommentLikeState', {id: context.data.id, liked: false});
    }
    return {};
}

async function unlikeComment(
    context: ActionContext & {data: {id: string}}
): Promise<Partial<EditableAppContext>> {
    context.dispatchAction?.('updateCommentLikeState', {id: context.data.id, liked: false});
    try {
        await context.api.comments.unlike({comment: context.data});
        return {};
    } catch {
        context.dispatchAction?.('updateCommentLikeState', {id: context.data.id, liked: true});
    }
    return {};
}

async function reportComment(
    context: ActionContext & {data: {id: string}}
): Promise<Partial<EditableAppContext>> {
    await context.api.comments.report({comment: context.data});
    return {};
}

// ============================================================================
// Member Actions
// ============================================================================

async function updateMember(
    context: ActionContext & {data: {name: string; expertise: string}}
): Promise<Partial<EditableAppContext> | null> {
    const {name, expertise} = context.data;
    const patchData: {name?: string; expertise?: string} = {};

    if (name && context.state.member?.name !== name) {
        patchData.name = name;
    }

    if (expertise !== undefined && context.state.member?.expertise !== expertise) {
        patchData.expertise = expertise;
    }

    if (Object.keys(patchData).length === 0) {
        return null;
    }

    try {
        const member = await context.api.member.update(patchData);
        if (!member) {
            throw new Error('Failed to update member');
        }
        return {member, success: true};
    } catch (error) {
        return {success: false, error};
    }
}

// ============================================================================
// UI Actions
// ============================================================================

function setCommentsIsLoading(
    context: ActionContext & {data: boolean | null}
): Partial<EditableAppContext> {
    return {commentsIsLoading: context.data};
}

function openPopup(
    context: ActionContext & {data: Page}
): Partial<EditableAppContext> {
    return {popup: context.data};
}

function closePopup(): Partial<EditableAppContext> {
    return {popup: null};
}

async function openCommentForm(
    context: ActionContext & {data: OpenCommentForm}
): Promise<Partial<EditableAppContext>> {
    const newForm = context.data;
    let otherStateChanges: Partial<EditableAppContext> = {};

    const topLevelCommentId = newForm.parent_id || newForm.id;
    const shouldLoadReplies = newForm.type === 'reply' &&
        !context.state.openCommentForms.some(f => f.id === topLevelCommentId || f.parent_id === topLevelCommentId);

    if (shouldLoadReplies) {
        const comment = findCommentById(context.state.comments, topLevelCommentId);
        if (comment) {
            const newCommentsState = await loadMoreReplies({
                ...context,
                data: {comment, limit: 'all'},
                isReply: true
            });
            otherStateChanges = newCommentsState;
        }
    }

    const openFormsAfterAutoclose = context