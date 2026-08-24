import {AddComment, Comment, CommentsOptions, DispatchActionType, EditableAppContext, OpenCommentForm} from './app-context';
import {AdminApi} from './utils/admin-api';
import {GhostApi} from './utils/api';
import {Page} from './pages';

async function loadMoreComments({state, api, options, order}: {state: EditableAppContext, api: GhostApi, options: CommentsOptions, order?:string}): Promise<Partial<EditableAppContext>> {
    let page = 1;
    if (state.pagination && state.pagination.page) {
        page = state.pagination.page + 1;
    }
    let data;
    if (state.admin && state.adminApi) {
        data = await state.adminApi.browse({page, postId: options.postId, order: order || state.order, memberUuid: state.member?.uuid});
    } else {
        data = await api.comments.browse({page, postId: options.postId, order: order || state.order});
    }

    const updatedComments = [...state.comments, ...data.comments];
    const dedupedComments = updatedComments.filter((comment, index, self) => self.findIndex(c => c.id === comment.id) === index);

    // Note: we store the comments from new to old, and show them in reverse order
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
        let data;
        if (state.admin && state.adminApi) {
            data = await state.adminApi.browse({page: 1, postId: options.postId, order, memberUuid: state.member?.uuid});
        } else {
            data = await api.comments.browse({page: 1, postId: options.postId, order});
        }

        return {
            comments: [...data.comments],
            pagination: data.meta.pagination,
            order,
            commentsIsLoading: false
        };
    } catch (error) {
        console.error('Failed to set order:', error); // eslint-disable-line no-console
        state.commentsIsLoading = false;
        throw error; // Rethrow the error to allow upstream handling
    }
}

async function loadMoreReplies({state, api, data: {comment, limit}, isReply}: {state: EditableAppContext, api: GhostApi, data: {comment: Comment, limit?: number | 'all'}, isReply: boolean}): Promise<Partial<EditableAppContext>> {
    const fetchReplies = async (afterReplyId: string | undefined, requestLimit: number) => {
        if (state.admin && state.adminApi && !isReply) { // we don't want the admin api to load reply data for replying to a reply, so we pass isReply: true
            return await state.adminApi.replies({commentId: comment.id, afterReplyId, limit: requestLimit, memberUuid: state.member?.uuid});
        } else {
            return await api.comments.replies({commentId: comment.id, afterReplyId, limit: requestLimit});
        }
    };

    const getLastReplyId = (commentReplies?: Comment[]) => commentReplies?.[commentReplies.length - 1]?.id;
    let afterReplyId = comment.replies ? getLastReplyId(comment.replies) : undefined;

    let allComments: Comment[] = [];

    if (limit === 'all') {
        let hasMore = true;

        while (hasMore) {
            const data = await fetchReplies(afterReplyId, 100);
            allComments.push(...data.comments);
            hasMore = !!data.meta.pagination.next;

            if (data.comments && data.comments.length > 0) {
                afterReplyId = data.comments[data.comments.length - 1]?.id;
            } else {
                hasMore = false;
            }
        }
    } else {
        const data = await fetchReplies(afterReplyId, limit === 'all' ? 100 : (limit as number || 100));
        allComments = data.comments;
    }

    const appendRepliesToComment = (topLevelComments: Comment[], targetComment: Comment, newReplies: Comment[]) => {
        return topLevelComments.map((c) => {
            if (c.id === targetComment.id) {
                return {
                    ...targetComment,
                    replies: [...(targetComment.replies || []), ...newReplies]
                };
            }
            return c;
        });
    };

    return {
        comments: appendRepliesToComment(state.comments, comment, allComments)
    };
}

async function addComment({state, api, data: comment}: {state: EditableAppContext, api: GhostApi, data: AddComment}) {
    const data = await api.comments.add({comment});
    const addedComment = data.comments[0];

    return {
        comments: [addedComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

function addReplyToParent({parent, reply}: {parent: Comment, reply: Comment}): Comment {
    return {
        ...parent,
        replies: [...(parent.replies || []), reply],
        count: {
            ...parent.count,
            replies: (parent.count?.replies || 0) + 1
        }
    };
}

async function addReply({state, api, data: {reply, parent}}: {state: EditableAppContext, api: GhostApi, data: {reply: any, parent: any}}) {
    let comment = reply;
    comment.parent_id = parent.id;

    const data = await api.comments.add({comment});
    const addedReply = data.comments[0];

    const updatedComments = state.comments.map((c) => {
        if (c.id === parent.id) {
            return addReplyToParent({parent: c, reply: addedReply});
        }
        return c;
    });

    return {
        comments: updatedComments,
        commentCount: state.commentCount + 1
    };
}

function updateRepliesStatus({comments, commentId, status}: {comments: Comment[], commentId: string, status: 'hidden' | 'deleted'}): Comment[] {
    return comments.map((c) => {
        const replies = c.replies.map((r) => {
            if (r.id === commentId) {
                return {
                    ...r,
                    status
                };
            }
            return r;
        });

        if (c.id === commentId) {
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
    });
}

async function hideComment({state, adminApi}: {state: EditableAppContext, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.hideComment(state.data.id);
    }

    const updatedComments = updateRepliesStatus({
        comments: state.comments,
        commentId: state.data.id,
        status: 'hidden'
    });

    return {
        comments: updatedComments,
        commentCount: state.commentCount - 1
    };
}

async function showComment({state, api, adminApi, data: comment}: {state: EditableAppContext, api: GhostApi, adminApi: any, data: {id: string}}) {
    if (state.adminApi) {
        await state.adminApi.showComment({id: comment.id});
    }

    let data;
    if (state.admin && state.adminApi) {
        data = await state.adminApi.read({commentId: comment.id, memberUuid: state.member?.uuid});
    } else {
        data = await api.comments.read(comment.id);
    }

    const updatedComment = data.comments[0];

    const updateRepliesAndSelf = (comments: Comment[]): Comment[] => {
        return comments.map((c) => {
            const replies = c.replies.map((r) => {
                if (r.id === comment.id) {
                    return updatedComment;
                }
                return r;
            });

            if (c.id === comment.id) {
                return updatedComment;
            }

            return {
                ...c,
                replies
            };
        });
    };

    return {
        comments: updateRepliesAndSelf(state.comments),
        commentCount: state.commentCount + 1
    };
}

function updateCommentLikeStateLocally({comments, id, liked}: {comments: Comment[], id: string, liked: boolean}): Comment[] {
    return comments.map((c) => {
        const replies = c.replies.map((r) => {
            if (r.id === id) {
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

        if (c.id === id) {
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
    });
}

async function updateCommentLikeState({state, data: {id, liked}}: {state: EditableAppContext, data: {id: string, liked: boolean}}) {
    return {
        comments: updateCommentLikeStateLocally({
            comments: state.comments,
            id,
            liked
        })
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

function filterAndReduceDeletedReplies(comment: Comment, deletedReplyId: string): Comment {
    const originalLength = (comment.replies?.length || 0);
    const updatedReplies = (comment.replies || []).filter(reply => reply.id !== deletedReplyId);
    const hasDeletedReply = originalLength !== updatedReplies.length;

    if (hasDeletedReply && comment.count?.replies) {
        comment.count.replies = comment.count.replies - 1;
    }

    return {
        ...comment,
        replies: updatedReplies
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
    if (commentToDelete && (!commentToDelete.replies || commentToDelete.replies.length === 0)) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    const updatedComments = state.comments.map((topLevelComment) => {
        if (topLevelComment.id === comment.id) {
            if (topLevelComment.replies?.length > 0) {
                return {
                    ...topLevelComment,
                    status: 'deleted'
                };
            } else {
                return null;
            }
        }

        const updatedTopLevelComment = filterAndReduceDeletedReplies(topLevelComment, comment.id);

        return updatedTopLevelComment;
    }).filter(Boolean);

    return {
        comments: updatedComments as Comment[],
        commentCount: state.commentCount - 1
    };
}

async function editComment({state, api, data: {comment, parent}}: {state: EditableAppContext, api: GhostApi, data: {comment: Partial<Comment> & {id: string}, parent?: Comment}}) {
    const data = await api.comments.edit({comment});
    const updatedComment = data.comments[0];

    const updateCommentInList = (comments: Comment[]): Comment[] => {
        return comments.map((c) => {
            if (parent && parent.id === c.id) {
                return {
                    ...c,
                    replies: (c.replies || []).map((r) => {
                        if (r.id === updatedComment.id) {
                            return updatedComment;
                        }
                        return r;
                    })
                };
            } else if (c.id === updatedComment.id) {
                return updatedComment;
            }

            return c;
        });
    };

    return {
        comments: updateCommentInList(state.comments)
    };
}

function updateMemberLocally({state, name, expertise}: {state: EditableAppContext, name: string, expertise: string}) {
    const member = state.member;
    if (!member) {
        return null;
    }

    const patchData: {name?: string, expertise?: string} = {};

    if (name && member.name !== name) {
        patchData.name = name;
    }

    if (expertise !== undefined && member.expertise !== expertise) {
        patchData.expertise = expertise;
    }

    return patchData;
}

async function updateMember({data, state, api}: {data: {name: string, expertise: string}, state: EditableAppContext, api: GhostApi}) {
    const {name, expertise} = data;
    const patchData = updateMemberLocally({state, name, expertise});

    if (!patchData || Object.keys(patchData).length === 0) {
        return null;
    }

    try {
        const member = await api.member.update(patchData);
        if (!member) {
            throw new Error('Failed to update member');
        }

        return {
            member,
            success: true
        };
    } catch (err) {
        return {
            success: false,
            error: err
        };
    }
}

function openPopup({data}: {data: Page}) {
    return {
        popup: data
    };
}

function closePopup() {
    return {
        popup: null
    };
}

function findActiveTopLevelComment({newForm, state}: {newForm: OpenCommentForm, state: EditableAppContext}): Comment | undefined {
    const topLevelCommentId = newForm.parent_id || newForm.id;
    return state.comments.find(c => c.id === topLevelCommentId);
}

async function openCommentForm({data: newForm, api, state}: {data: OpenCommentForm, api: GhostApi, state: EditableAppContext}) {
    let otherStateChanges = {};

    // When opening a reply form, load in all of the replies for the parent comment
    const topLevelComment = findActiveTopLevelComment({newForm, state});

    if (newForm.type === 'reply' && !state.openCommentForms.some(f => f.id === newForm.parent_id || f.parent_id === newForm.parent_id)) {
        if (topLevelComment) {
            const newCommentsState = await loadMoreReplies({state, api, data: {comment: topLevelComment, limit: 'all'}, isReply: true});
            otherStateChanges = {...otherStateChanges, ...newCommentsState};
        }
    }

    // Close empty or unchanged forms automatically
    const openFormsAfterAutoclose = state.openCommentForms.filter(form => form.hasUnsavedChanges);

    // Avoid multiple forms open for same id
    const openFormIndexForId = openFormsAfterAutoclose.findIndex(form => form.id === newForm.id);
    if (openFormIndexForId > -1) {
        openFormsAfterAutoclose[openFormIndexForId] = newForm;

        return {openCommentForms: openFormsAfterAutoclose, ...otherStateChanges};
    } else {
        return {openCommentForms: [...openFormsAfterAutoclose, newForm], ...otherStateChanges};
    };
}

function setHighlightComment({data: commentId}: {data: string | null}) {
    return {
        commentIdToHighlight: commentId
    };
}

function highlightComment({
    data: {commentId},
    dispatchAction

}: {
    data: { commentId: string | null };
    state: EditableAppContext;
    dispatchAction: DispatchActionType;
}) {
    setTimeout(() => {
        dispatchAction('setHighlightComment', null);
    }, 3000);
    return {
        commentIdToHighlight: commentId
    };
}

function setCommentFormHasUnsavedChanges({data: {id, hasUnsavedChanges}, state}: {data: {id: string, hasUnsavedChanges: boolean}, state: EditableAppContext}) {
    const updatedForms = state.openCommentForms.map((f) => {
        if (f.id === id) {
            return {...f, hasUnsavedChanges};
        }
        return {...f};
    });

    return {openCommentForms: updatedForms};
}

function closeCommentForm({data: id, state}: {data: string, state: EditableAppContext}) {
    return {openCommentForms: state.openCommentForms.filter(f => f.id !== id)};
}

function setScrollTarget({data: commentId}: {data: string | null}) {
    return {commentIdToScrollTo: commentId};
}

// Sync actions make use of setState((currentState) => newState), to avoid 'race' conditions
export const SyncActions = {
    openPopup,
    closePopup,
    closeCommentForm,
    setCommentFormHasUnsavedChanges,
    setScrollTarget
};

export type SyncActionType = keyof typeof SyncActions;

export const Actions = {
    // Put your actions here
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

/** Handle actions in the App, returns updated state */
export async function ActionHandler({action, data, state, api, adminApi, options, dispatchAction}: {action: ActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi, dispatchAction: DispatchActionType}): Promise<Partial<EditableAppContext>> {
    const handler = Actions[action];
    if (handler) {
        return await handler({data, state, api, adminApi, options, dispatchAction} as any) || {};
    }
    return {};
}

/** Handle actions in the App, returns updated state */
export function SyncActionHandler({action, data, state, api, adminApi, options}: {action: SyncActionType, data: any, state: EditableAppContext, options: CommentsOptions, api: GhostApi, adminApi: AdminApi}): Partial<EditableAppContext> {
    const handler = SyncActions[action];
    if (handler) {
        // Do not await here
        return handler({data, state, api, adminApi, options} as any) || {};
    }
    return {};
}