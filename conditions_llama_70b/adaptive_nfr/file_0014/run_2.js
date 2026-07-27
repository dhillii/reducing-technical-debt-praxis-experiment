const RepliedToSnippet: React.FC<{comment: Comment}> = ({comment}) => {
    const {comments, t, pageUrl} = useAppContext();
    const inReplyToComment = findCommentById(comments, comment.in_reply_to_id);

    let inReplyToSnippet = comment.in_reply_to_snippet;
    const isPublished = inReplyToComment?.status === 'published';

    const getInReplyToSnippet = (inReplyToComment: Comment | undefined) => {
        if (!inReplyToComment || inReplyToComment.status !== 'published') {
            return `[${t('removed')}]`;
        }
        return inReplyToComment.in_reply_to_snippet;
    };

    inReplyToSnippet = getInReplyToSnippet(inReplyToComment);

    const linkToReply = isPublished;
    const className = 'font-medium text-neutral-900/60 break-all transition-colors dark:text-white/70';
    const linkClassName = `${className} hover:text-neutral-900/75 dark:hover:text-white/85`;

    if (!linkToReply) {
        return <span className={className} data-testid="comment-in-reply-to">{inReplyToSnippet}</span>;
    }

    return (
        <a className={linkClassName} data-testid="comment-in-reply-to" href={buildCommentPermalink(pageUrl, comment.in_reply_to_id)} target="_parent">{inReplyToSnippet}</a>
    );
};