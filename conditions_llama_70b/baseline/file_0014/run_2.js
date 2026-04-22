```javascript
// ...

const useCommentVisibility = (comment: Comment, admin: boolean) => {
    const hasReplies = comment?.replies?.length > 0;
    const isDeleted = comment?.status === 'deleted';
    const isHidden = comment?.status === 'hidden';

    return {
        // Show deleted message only when comment has replies (regardless of admin status)
        showDeletedMessage: isDeleted && hasReplies,
        // Show hidden message for non-admins when comment has replies
        showHiddenMessage: hasReplies && isHidden && !admin,
        // Show comment content if not deleted AND (is published OR admin viewing hidden)
        showCommentContent: !isDeleted && (admin || comment?.status === 'published')
    };
};

// ...

const PublishedComment: React.FC<PublishedCommentProps> = ({comment, parent, openEditMode}) => {
    const {dispatchAction, openCommentForms, isAdmin, commentIdToHighlight} = useAppContext();

    // Determine if the comment should be displayed with reduced opacity
    const isHidden = isAdmin && comment?.status === 'hidden';
    const hiddenClass = isHidden ? 'opacity-30' : '';

    // Check if this comment is being edited
    const editForm = openCommentForms?.find(openForm => openForm.id === comment.id && openForm.type === 'edit');
    const isInEditMode = !!editForm;

    // currently a reply-to-reply form is displayed inside the top-level PublishedComment component
    // so we need to check for a match of either the comment id or the parent id
    const openForm = openCommentForms?.find(f => (f.id === comment.id || f.parent_id === comment.id) && f.type === 'reply');
    // avoid displaying the reply form inside RepliesContainer
    const displayReplyForm = openForm && (!openForm.parent_id || openForm.parent_id === comment.id);
    // only highlight the reply button for the comment that is being replied to
    const highlightReplyButton = !!(openForm && openForm.id === comment.id);

    // ...

    const avatar = (<Avatar member={comment?.member} />);

    // ...
};

// ...

const UnpublishedComment: React.FC<UnpublishedCommentProps> = ({comment, openEditMode}) => {
    const {isAdmin, openCommentForms, t} = useAppContext();

    const avatar = (isAdmin && comment?.status !== 'deleted')
        ? <Avatar member={comment?.member} />
        : <BlankAvatar />;
    const hasReplies = comment?.replies?.length > 0;

    // ...

    const openForm = openCommentForms?.find(f => (f.id === comment.id || f.parent_id === comment.id) && f.type === 'reply');
    // avoid displaying the reply form inside RepliesContainer
    const displayReplyForm = openForm && (!openForm.parent_id || openForm.parent_id === comment.id);

    // ...
};

// ...

const RepliesContainer: React.FC<RepliesProps & {className?: string}> = ({comment, className = ''}) => {
    const hasReplies = comment?.replies?.length > 0;

    if (!hasReplies) {
        return null;
    }

    return (
        <div className={`-ml-2 mb-4 mt-7 sm:mb-0 sm:mt-8 ${className}`}>
            <Replies comment={comment} />
        </div>
    );
};

// ...

const RepliedToSnippet: React.FC<{comment: Comment}> = ({comment}) => {
    const {comments, t, pageUrl} = useAppContext();
    const inReplyToComment = comments?.find(c => c.id === comment.in_reply_to_id);

    let inReplyToSnippet = comment.in_reply_to_snippet;
    // For public API requests hidden/deleted comments won't exist in the comments array
    // unless it was only just deleted in which case it will exist but have a 'deleted' status
    if (!inReplyToComment || inReplyToComment.status !== 'published') {
        inReplyToSnippet = `[${t('removed')}]`;
    }

    // ...
};

// ...
```