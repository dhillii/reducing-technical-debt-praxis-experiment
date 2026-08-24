let inReplyToSnippet = comment.in_reply_to_snippet;
    // For public API requests hidden/deleted comments won't exist in the comments array
    // unless it was only just deleted in which case it will exist but have a 'deleted' status
    inReplyToSnippet = (!inReplyToComment || inReplyToComment.status !== 'published') ? `[${t('removed')}]` : inReplyToSnippet;