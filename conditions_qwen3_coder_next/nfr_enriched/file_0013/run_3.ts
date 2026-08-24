// Replace the comment in the state with the new one
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