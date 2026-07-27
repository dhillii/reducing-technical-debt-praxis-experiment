const RepliedToSnippet: React.FC<{comment: Comment}> = ({comment}) => {
    const {comments, t, pageUrl} = useAppContext();
    const inReplyToComment = findCommentById(comments, comment.in_reply_to_id);

    let inReplyToSnippet = comment.in_reply_to_snippet;
    // For public API requests hidden/deleted comments won't exist in the comments array
    // unless it was only just deleted in which case it will exist but have a 'deleted' status
    if (!inReplyToComment?.status || inReplyToComment.status !== 'published') {
        inReplyToSnippet = `[${t('removed')}]`;
    }

    const linkToReply = inReplyToComment && inReplyToComment.status === 'published';
    const className = 'font-medium text-neutral-900/60 break-all transition-colors dark:text-white/70';
    const linkClassName = `${className} hover:text-neutral-900/75 dark:hover:text-white/85`;

    if (!linkToReply) {
        return <span className={className} data-testid="comment-in-reply-to">{inReplyToSnippet}</span>;
    }

    return (
        <a className={linkClassName} data-testid="comment-in-reply-to" href={buildCommentPermalink(pageUrl, comment.in_reply_to_id)} target="_parent">{inReplyToSnippet}</a>
    );
};