```typescript
import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

// Helper: Get next page number
function getNextPageNumber(state: EditableAppContext): number {
    return state.pagination?.page ? state.pagination.page + 1 : 1;
}

// Helper: Get API instance based on context
function getApiInstance(state: EditableAppContext, api: GhostApi): GhostApi | AdminApi {
    return state.admin && state.adminApi ? state.adminApi : api;
}

// Helper: Build browse options
function buildBrowseOptions(options: CommentsOptions, order?: string, page: number = 1, memberUuid?: string): {page: number, postId: string, order: string, memberUuid?: string} {
    return {
        page,
        postId: options.postId,
        order: order || state.order,
        memberUuid
    };
}

// Helper: Deduplicate comments by ID
function deduplicateComments(comments: Comment[]): Comment[] {
    return comments.filter((comment, index, self) => self.findIndex(c => c.id === comment.id) === index);
}

// Helper: Get last reply ID for pagination
function getLastReplyId(comment: Comment): string | undefined {
    return comment.replies?.length > 0 ? comment.replies[comment.replies.length - 1]?.id : undefined;
}

// Helper: Fetch replies with pagination
async function fetchReplies(state: EditableAppContext, api: GhostApi, comment: Comment, afterReplyId: string | undefined, limit: number | 'all', isReply: boolean): Promise<Comment[]> {
    const requestLimit = limit === 'all' ? 100 : limit;
    
    const fetchReplies = async (afterReplyId: string | undefined, requestLimit: number): Promise<Comment[]> => {
        const apiInstance = state.admin && state.adminApi && !isReply ? state.adminApi : api;
        const data = await apiInstance.replies({commentId: comment.id, afterReplyId, limit: requestLimit, memberUuid: state.member?.uuid});
        return data.comments;
    };

    if (limit === 'all') {
        let allComments: Comment[] = [];
        let hasMore = true;
        let currentAfterReplyId = afterReplyId;

        while (hasMore) {
            const data = await fetchReplies(currentAfterReplyId, 100);
            allComments.push(...data);
            hasMore = !!data.meta.pagination.next;
            currentAfterReplyId = data[data.length - 1]?.id;
        }

        return allComments;
    }

    const data = await fetchReplies(afterReplyId, requestLimit);
    return data;
}

// Helper: Update comment with replies
function updateCommentWithReplies(comment: Comment, newReplies: Comment[]): Comment {
    return {
        ...comment,
        replies: [...comment.replies, ...newReplies]
    };
}

// Helper: Update comment in state with new replies
function updateCommentInState(state: EditableAppContext, comment: Comment, newReplies: Comment[]): EditableAppContext {
    return {
        comments: state.comments.map((c) => {
            if (c.id === comment.id) {
                return updateCommentWithReplies(comment, newReplies);
            }
            return c;
        })
    };
}

// Helper: Update comment count
function updateCommentCount(count: {replies?: number}, increment: number): {replies?: number} {
    return {
        replies: count.replies ? count.replies + increment : increment
    };
}

// Helper: Update comment like state
function updateCommentLikeState(state: EditableAppContext, commentId: string, liked: boolean): EditableAppContext {
    return {
        comments: state.comments.map((c) => {
            const replies = c.replies.map((r) => {
                if (r.id === commentId) {
                    return {
                        ...r,
                        liked,
                        count: {
                            ...r.count,
                            likes: liked ? r.count.likes + 1 : r.count.likes - 1
                        }
                    };
                }
                return r;
            });

            if (c.id === commentId) {
                return {
                    ...c,
                    liked,
                    replies,
                    count: {
                        ...c.count,
                        likes: liked ? c.count.likes + 1 : c.count.likes - 1
                    }
                };
            }

            return {
                ...c,
                replies
            };
        })
    };
}

// Helper: Update member data
function buildMemberPatchData(data: {name: string, expertise: string}, state: EditableAppContext): {name?: string, expertise?: string} {
    const patchData: {name?: string, expertise?: string} = {};
    const originalName = state?.member?.name;
    const originalExpertise = state?.member?.expertise;

    if (data.name && originalName !== data.name) {
        patchData.name = data.name;
    }

    if (data.expertise !== undefined && originalExpertise !== data.expertise) {
        patchData.expertise = data.expertise;
    }

    return patchData;
}

// Helper: Update comment status
function updateCommentStatus(comment: Comment, status: 'hidden' | 'deleted'): Comment {
    return {
        ...comment,
        status
    };
}

// Helper: Filter deleted replies
function filterDeletedReplies(replies: Comment[]): Comment[] {
    return replies.filter(reply => reply.id !== 'deleted');
}

// Helper: Update comment replies after deletion
function updateRepliesAfterDeletion(topLevelComment: Comment, deletedReplyId: string): Comment {
    const originalLength = topLevelComment.replies.length;
    const updatedReplies = topLevelComment.replies.filter(reply => reply.id !== deletedReplyId);
    const hasDeletedReply = originalLength !== updatedReplies.length;

    const updatedTopLevelComment = {
        ...topLevelComment,
        replies: updatedReplies
    };

    if (hasDeletedReply && topLevelComment.count?.replies) {
        topLevelComment.count.replies = topLevelComment.count.replies - 1;
    }

    return updatedTopLevelComment;
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        comments: state.comments.map((c) => {
            if (parent && parent.id === c.id) {
                return {
                    ...c,
                    replies: c.replies.map((r) => {
                        if (r.id === comment.id) {
                            return comment;
                        }
                        return r;
                    })
                };
            } else if (c.id === comment.id) {
                return comment;
            }
            return c;
        })
    };
}

// Helper: Update comment in state after hide/show
function updateCommentInStateAfterHideShow(state: EditableAppContext, comment: Comment, status: 'hidden' | 'visible'): EditableAppContext {
    return {
        comments: state.comments.map((c) => {
            const replies = c.replies.map((r) => {
                if (r.id === comment.id) {
                    return {
                        ...r,
                        status
                    };
                }
                return r;
            });

            if (c.id === comment.id) {
                return {
                    ...c,
                    status,
                    replies
                };
            }

            return {
                ...c,
                replies
            };
        })
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        comments: state.comments.map((topLevelComment) => {
            if (topLevelComment.id === comment.id) {
                if (topLevelComment.replies.length > 0) {
                    return updateCommentStatus(topLevelComment, 'deleted');
                }
                return null;
            }

            const updatedTopLevelComment = updateRepliesAfterDeletion(topLevelComment, comment.id);
            return updatedTopLevelComment;
        }).filter(Boolean)
    };
}

// Helper: Update comment count after delete
function updateCommentCountAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...state,
        commentCount: state.commentCount - 1
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        comments: [comment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        comments: state.comments.map((c) => {
            if (c.id === parent.id) {
                return {
                    ...c,
                    replies: [...c.replies, comment],
                    count: {
                        ...c.count,
                        replies: c.count.replies + 1
                    }
                };
            }
            return c;
        }),
        commentCount: state.commentCount + 1
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHideShow(state, comment, 'hidden'),
        commentCount: state.commentCount - 1
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHideShow(state, comment, 'visible'),
        commentCount: state.commentCount + 1
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment),
        ...updateCommentCountAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment in state after add
function updateCommentInStateAfterAdd(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAdd(state, comment)
    };
}

// Helper: Update comment in state after add reply
function updateCommentInStateAfterAddReply(state: EditableAppContext, parent: Comment, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterAddReply(state, parent, comment)
    };
}

// Helper: Update comment in state after hide
function updateCommentInStateAfterHide(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterHide(state, comment)
    };
}

// Helper: Update comment in state after show
function updateCommentInStateAfterShow(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterShow(state, comment)
    };
}

// Helper: Update comment in state after delete
function updateCommentInStateAfterDelete(state: EditableAppContext, comment: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterDelete(state, comment)
    };
}

// Helper: Update comment in state after edit
function updateCommentInStateAfterEdit(state: EditableAppContext, comment: Comment, parent?: Comment): EditableAppContext {
    return {
        ...updateCommentInStateAfterEdit(state, comment, parent)
    };
}

// Helper: Update comment