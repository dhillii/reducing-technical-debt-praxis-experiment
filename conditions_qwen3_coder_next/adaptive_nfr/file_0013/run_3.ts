async function updateCommentInState({state, commentId, parentId, updater, shouldCountUpdate, countDelta}) {
    const isReply = parentId != null;
    return {
        comments: state.comments.map((c) => {
            const isTopLevel = c.id === commentId;
            const isParent = c.id === parentId;

            if (isTopLevel || (isReply && isParent)) {
                const updated = updater(c);
                return {
                    ...updated,
                    count: shouldCountUpdate
                        ? {
                            ...updated.count,
                            replies: (updated.count?.replies || 0) + countDelta
                        }
                        : updated.count
                };
            }
            return c;
        })
    };
}

function processReplies(parent, commentId, updater, shouldCountUpdate, countDelta) {
    const replies = parent.replies?.map(r => {
        if (r.id === commentId) {
            const updated = updater(r);
            return {
                ...updated,
                count: shouldCountUpdate
                    ? {
                        ...updated.count,
                        likes: updated.liked ? updated.count.likes + countDelta : updated.count.likes - countDelta
                    }
                    : updated.count
            };
        }
        return r;
    }) || [];

    return {
        ...parent,
        replies,
        count: shouldCountUpdate
            ? {
                ...parent.count,
                likes: (parent.liked ? parent.count.likes : parent.count.likes - 1) + countDelta
            }
            : parent.count
    };
}

function updateCommentMap(state, commentId, parentId, updater, shouldCountUpdate, countDelta) {
    return state.comments.map(c => {
        if (c.id === commentId) {
            return updater(c);
        }
        if (parentId && c.id === parentId) {
            return {
                ...c,
                replies: c.replies.map(r => r.id === commentId ? updater(r) : r)
            };
        }
        return c;
    });
}

function filterDeletedComments(comments, deletedId, countDelta) {
    return comments.reduce((acc, c) => {
        if (c.id === deletedId) {
            if (c.replies.length === 0) {
                return acc;
            }
            acc.push({...c, status: 'deleted'});
        } else {
            const originalLength = c.replies.length;
            const newReplies = c.replies.filter(r => r.id !== deletedId);
            const hasDeleted = originalLength !== newReplies.length;
            const updatedComment = {
                ...c,
                replies: newReplies
            };
            if (hasDeleted && c.count?.replies) {
                updatedComment.count = {
                    ...c.count,
                    replies: c.count.replies + countDelta
                };
            }
            acc.push(updatedComment);
        }
        return acc;
    }, []);
}

function getRepliesData(api, commentId, afterReplyId, limit, state, isReply) {
    if (state.admin && state.adminApi && !isReply) {
        return state.adminApi.replies({
            commentId,
            afterReplyId,
            limit,
            memberUuid: state.member?.uuid
        });
    }
    return api.comments.replies({
        commentId,
        afterReplyId,
        limit
    });
}

function processAllReplies(fetchReplies, limit) {
    const allComments = [];
    let hasMore = true;
    let afterReplyId = undefined;

    while (hasMore) {
        const data = await fetchReplies(afterReplyId, 100);
        allComments.push(...data.comments);
        hasMore = !!data.meta.pagination.next;

        if (data.comments.length === 0) {
            hasMore = false;
        } else {
            afterReplyId = data.comments[data.comments.length - 1]?.id;
        }
    }

    return allComments;
}

function createCommentPayload(comment, parent, commentBase, likesBase, isLiked, delta) {
    return {
        ...comment,
        replies: comment.replies?.map(r => {
            if (r.id === parent.id) {
                return {
                    ...r,
                    liked: isLiked,
                    count: {
                        ...r.count,
                        likes: (isLiked ? r.count.likes : r.count.likes - 1) + delta
                    }
                };
            }
            return r;
        }),
        liked: isLiked,
        count: {
            ...comment.count,
            likes: (isLiked ? commentBase : commentBase - 1) + delta
        }
    };
}

async function updateCommentLikeState({state, data: {id, liked}}) {
    const likesDelta = liked ? 1 : -1;
    const baseLikes = 1;

    return {
        comments: state.comments.map(c => {
            if (c.id === id) {
                return {
                    ...c,
                    liked,
                    replies: c.replies?.map(r => {
                        if (r.id === id) {
                            return {
                                ...r,
                                liked,
                                count: {
                                    ...r.count,
                                    likes: (liked ? r.count.likes : r.count.likes - 1) + likesDelta
                                }
                            };
                        }
                        return r;
                    }),
                    count: {
                        ...c.count,
                        likes: (liked ? c.count.likes : c.count.likes - 1) + likesDelta
                    }
                };
            }

            if (c.replies?.length) {
                return {
                    ...c,
                    replies: c.replies.map(r => {
                        if (r.id === id) {
                            return {
                                ...r,
                                liked,
                                count: {
                                    ...r.count,
                                    likes: (liked ? r.count.likes : r.count.likes - 1) + likesDelta
                                }
                            };
                        }
                        return r;
                    })
                };
            }
            return c;
        })
    };
}

async function likeComment({api, data: {id}, dispatchAction}) {
    dispatchAction('updateCommentLikeState', {id, liked: true});
    try {
        await api.comments.like({id});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id, liked: false});
    }
}

async function unlikeComment({api, data: {id}, dispatchAction}) {
    dispatchAction('updateCommentLikeState', {id, liked: false});
    try {
        await api.comments.unlike({id});
        return {};
    } catch {
        dispatchAction('updateCommentLikeState', {id, liked: true});
    }
}

async function hideComment({state, adminApi, data: {id}}) {
    if (state.adminApi) {
        await state.adminApi.hideComment(id);
    }

    return {
        comments: state.comments.map(c => {
            if (c.id === id) {
                return {
                    ...c,
                    status: 'hidden',
                    replies: c.replies?.map(r => {
                        if (r.id === id) return {...r, status: 'hidden'};
                        return r;
                    }) || []
                };
            }
            return {
                ...c,
                replies: c.replies?.map(r => {
                    if (r.id === id) return {...r, status: 'hidden'};
                    return r;
                }) || []
            };
        }),
        commentCount: state.commentCount - 1
    };
}

async function showComment({state, api, adminApi, data: {id}}) {
    if (state.adminApi) {
        await state.adminApi.showComment({id});
    }

    let data;
    if (state.admin && state.adminApi) {
        data = await state.adminApi.read({commentId: id, memberUuid: state.member?.uuid});
    } else {
        data = await api.comments.read(id);
    }

    const updatedComment = data.comments[0];

    return {
        comments: state.comments.map(c => {
            if (c.id === id) {
                return updatedComment;
            }
            return {
                ...c,
                replies: c.replies?.map(r => {
                    if (r.id === id) return updatedComment;
                    return r;
                }) || []
            };
        }),
        commentCount: state.commentCount + 1
    };
}

async function deleteComment({state, api, data: {id}, dispatchAction}) {
    await api.comments.edit({
        comment: {
            id,
            status: 'deleted'
        }
    });

    const commentToDelete = state.comments.find(c => c.id === id);
    if (commentToDelete && (!commentToDelete.replies || commentToDelete.replies.length === 0)) {
        dispatchAction('setOrder', {order: state.order});
        return null;
    }

    const updatedComments = filterDeletedComments(state.comments, id, -1);

    return {
        comments: updatedComments.filter(Boolean),
        commentCount: state.commentCount - 1
    };
}

async function editComment({state, api, data: {comment, parent}}) {
    const data = await api.comments.edit({comment});
    comment = data.comments[0];

    return {
        comments: state.comments.map(c => {
            if (parent && parent.id === c.id) {
                return {
                    ...c,
                    replies: c.replies?.map(r => r.id === comment.id ? comment : r) || []
                };
            } else if (c.id === comment.id) {
                return comment;
            }
            return c;
        })
    };
}

async function addReply({state, api, data: {reply, parent}}) {
    let comment = {...reply, parent_id: parent.id};

    const data = await api.comments.add({comment});
    comment = data.comments[0];

    return {
        comments: state.comments.map(c => {
            if (c.id === parent.id) {
                return {
                    ...parent,
                    replies: [...(parent.replies || []), comment],
                    count: {
                        ...parent.count,
                        replies: (parent.count?.replies || 0) + 1
                    }
                };
            }
            return c;
        }),
        commentCount: state.commentCount + 1
    };
}

async function loadMoreReplies({state, api, data: {comment, limit}, isReply}) {
    const fetchReplies = async (afterReplyId, requestLimit) => {
        return getRepliesData(api, comment.id, afterReplyId, requestLimit, state, isReply);
    };

    let afterReplyId = comment.replies?.length > 0
        ? comment.replies[comment.replies.length - 1]?.id
        : undefined;

    let allReplies = [];

    if (limit === 'all') {
        allReplies = await processAllReplies(fetchReplies, limit);
    } else {
        const data = await fetchReplies(afterReplyId, limit || 100);
        allReplies = data.comments;
    }

    return {
        comments: state.comments.map(c => {
            if (c.id === comment.id) {
                return {
                    ...comment,
                    replies: [...(comment.replies || []), ...allReplies]
                };
            }
            return c;
        })
    };
}

async function addComment({state, api, data: comment}) {
    const data = await api.comments.add({comment});
    const newComment = data.comments[0];

    return {
        comments: [newComment, ...state.comments],
        commentCount: state.commentCount + 1
    };
}

function setCommentsIsLoading({data: isLoading}) {
    return {commentsIsLoading: isLoading};
}

async function setOrder({state, data: {order}, options, api, dispatchAction}) {
    dispatchAction('setCommentsIsLoading', true);

    try {
        let data;
        if (state.admin && state.adminApi) {
            data = await state.adminApi.browse({
                page: 1,
                postId: options.postId,
                order,
                memberUuid: state.member?.uuid
            });
        } else {
            data = await api.comments.browse({page: 1, postId: options.postId, order});
        }

        return {
            comments: data.comments,
            pagination: data.meta.pagination,
            order,
            commentsIsLoading: false
        };
    } catch (error) {
        console.error('Failed to set order:', error);
        state.commentsIsLoading = false;
        throw error;
    }
}