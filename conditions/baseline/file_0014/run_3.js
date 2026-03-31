```typescript
import EditForm from './forms/edit-form';
import LikeButton from './buttons/like-button';
import LikeCount from './buttons/like-count';
import MoreButton from './buttons/more-button';
import React, { useCallback } from 'react';
import Replies, { RepliesProps } from './replies';
import ReplyButton from './buttons/reply-button';
import ReplyForm from './forms/reply-form';
import { Avatar, BlankAvatar } from './avatar';
import { Comment, OpenCommentForm, useAppContext } from '../../app-context';
import { Transition } from '@headlessui/react';
import {
    buildCommentPermalink,
    findCommentById,
    formatExplicitTime,
    getCommentInReplyToSnippet,
    getMemberNameFromComment
} from '../../utils/helpers';
import { useRelativeTime } from '../../utils/hooks';

type AnimatedCommentProps = {
    comment: Comment;
    parent?: Comment;
};

type CommentVisibility = {
    showDeletedMessage: boolean;
    showHiddenMessage: boolean;
    showCommentContent: boolean;
};

type CommentMenuVisibility = {
    showLikeButton: boolean;
    showReplyButton: boolean;
    showMoreButton: boolean;
};

// ============================================================================
// Visibility Logic
// ============================================================================

const useCommentVisibility = (comment: Comment, admin: boolean): CommentVisibility => {
    const hasReplies = comment.replies && comment.replies.length > 0;
    const isDeleted = comment.status === 'deleted';
    const isHidden = comment.status === 'hidden';

    return {
        showDeletedMessage: isDeleted && hasReplies,
        showHiddenMessage: hasReplies && isHidden && !admin,
        showCommentContent: !isDeleted && (admin || comment.status === 'published')
    };
};

const useCommentMenuVisibility = (
    comment: Comment,
    isAdmin: boolean,
    isMember: boolean,
    isCommentingDisabled: boolean,
    isOwnComment: boolean
): CommentMenuVisibility => {
    const isPublished = comment.status === 'published';
    const shouldShowMoreButton = isAdmin || (isMember && isPublished);
    const shouldHideMoreButton = isCommentingDisabled && isOwnComment;

    return {
        showLikeButton: !isCommentingDisabled,
        showReplyButton: !isCommentingDisabled,
        showMoreButton: shouldShowMoreButton && !shouldHideMoreButton
    };
};

// ============================================================================
// Form Management
// ============================================================================

const createEditForm = (comment: Comment): OpenCommentForm => ({
    id: comment.id,
    type: 'edit',
    hasUnsavedChanges: false,
    in_reply_to_id: comment.in_reply_to_id,
    in_reply_to_snippet: comment.in_reply_to_snippet
});

const createReplyForm = (
    comment: Comment,
    parent: Comment | undefined
): OpenCommentForm => {
    const inReplyToDetails: Partial<OpenCommentForm> = {};

    if (parent) {
        inReplyToDetails.in_reply_to_id = comment.id;
        inReplyToDetails.in_reply_to_snippet = getCommentInReplyToSnippet(comment);
    }

    return {
        id: comment.id,
        parent_id: parent?.id,
        type: 'reply',
        hasUnsavedChanges: false,
        ...inReplyToDetails
    };
};

// ============================================================================
// Reply Form Logic
// ============================================================================

const useReplyFormState = (comment: Comment, parent: Comment | undefined) => {
    const { openCommentForms } = useAppContext();

    const openForm = openCommentForms.find(
        f => (f.id === comment.id || f.parent_id === comment.id) && f.type === 'reply'
    );

    const displayReplyForm = openForm && (!openForm.parent_id || openForm.parent_id === comment.id);
    const highlightReplyButton = !!(openForm && openForm.id === comment.id);

    return { openForm, displayReplyForm, highlightReplyButton };
};

const useOpenReplyForm = (comment: Comment, parent: Comment | undefined) => {
    const { dispatchAction } = useAppContext();
    const { openForm } = useReplyFormState(comment, parent);

    return useCallback(async () => {
        if (openForm && openForm.id === comment.id) {
            dispatchAction('closeCommentForm', openForm.id);
        } else {
            const newForm = createReplyForm(comment, parent);
            await dispatchAction('openCommentForm', newForm);
        }
    }, [comment, parent, openForm, dispatchAction]);
};

// ============================================================================
// Edit Form Logic
// ============================================================================

const useEditFormState = (comment: Comment) => {
    const { openCommentForms } = useAppContext();
    const editForm = openCommentForms.find(
        openForm => openForm.id === comment.id && openForm.type === 'edit'
    );
    return { editForm, isInEditMode: !!editForm };
};

const useOpenEditMode = (comment: Comment) => {
    const { dispatchAction } = useAppContext();

    return useCallback(() => {
        const newForm = createEditForm(comment);
        dispatchAction('openCommentForm', newForm);
    }, [comment.id, dispatchAction]);
};

// ============================================================================
// Main Components
// ============================================================================

const AnimatedComment: React.FC<AnimatedCommentProps> = ({ comment, parent }) => {
    const { commentsIsLoading } = useAppContext();

    return (
        <Transition
            className={`${commentsIsLoading ? 'animate-pulse' : ''}`}
            data-testid="animated-comment"
            enter="transition-opacity duration-300 ease-out"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            id={comment.id}
            leave="transition-opacity duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            show={true}
            appear
        >
            <CommentComponent comment={comment} parent={parent} />
        </Transition>
    );
};

export const CommentComponent: React.FC<AnimatedCommentProps> = ({ comment, parent }) => {
    const { isAdmin } = useAppContext();
    const { showDeletedMessage, showHiddenMessage, showCommentContent } = useCommentVisibility(comment, isAdmin);
    const openEditMode = useOpenEditMode(comment);

    if (showDeletedMessage || showHiddenMessage) {
        return <UnpublishedComment comment={comment} openEditMode={openEditMode} />;
    }

    if (showCommentContent && !showHiddenMessage) {
        return <PublishedComment comment={comment} openEditMode={openEditMode} parent={parent} />;
    }

    return null;
};

// ============================================================================
// Published Comment
// ============================================================================

type PublishedCommentProps = {
    comment: Comment;
    parent?: Comment;
    openEditMode: () => void;
};

const PublishedComment: React.FC<PublishedCommentProps> = ({ comment, parent, openEditMode }) => {
    const { openCommentForms, isAdmin, commentIdToHighlight } = useAppContext();
    const { editForm, isInEditMode } = useEditFormState(comment);
    const { openForm, displayReplyForm, highlightReplyButton } = useReplyFormState(comment, parent);
    const openReplyForm = useOpenReplyForm(comment, parent);

    const isHidden = isAdmin && comment.status === 'hidden';
    const hiddenClass = isHidden ? 'opacity-30' : '';
    const hasReplies = displayReplyForm || (comment.replies && comment.replies.length > 0);
    const avatar = <Avatar member={comment.member} />;

    return (
        <CommentLayout avatar={avatar} className={hiddenClass} hasReplies={hasReplies} memberUuid={comment.member?.uuid}>
            <div>
                <CommentHeader className={hiddenClass} comment={comment} />
                {isInEditMode ? (
                    <EditForm comment={comment} openForm={editForm} parent={parent} />
                ) : (
                    <>
                        <CommentBody
                            className={hiddenClass}
                            html={comment.html}
                            isHighlighted={comment.id === commentIdToHighlight}
                        />
                        <CommentMenu
                            comment={comment}
                            highlightReplyButton={highlightReplyButton}
                            openEditMode={openEditMode}
                            openReplyForm={openReplyForm}
                            parent={parent}
                        />
                    </>
                )}
            </div>
            <RepliesContainer comment={comment} />
            {displayReplyForm && <ReplyFormBox comment={comment} openForm={openForm} />}
        </CommentLayout>
    );
};

// ============================================================================
// Unpublished Comment
// ============================================================================

type UnpublishedCommentProps = {
    comment: Comment;
    openEditMode: () => void;
};

const UnpublishedComment: React.FC<UnpublishedCommentProps> = ({ comment, openEditMode }) => {
    const { isAdmin, openCommentForms, t } = useAppContext();
    const { openForm, displayReplyForm } = useReplyFormState(comment, undefined);

    const avatar = isAdmin && comment.status !== 'deleted'
        ? <Avatar member={comment.member} />
        : <BlankAvatar />;

    const hasReplies = comment.replies && comment.replies.length > 0;
    const showMoreButton = isAdmin && comment.status === 'hidden';

    const notPublishedMessage = comment.status === 'hidden'
        ? t('This comment has been hidden.')
        : t('This comment has been removed.');

    return (
        <CommentLayout avatar={avatar} hasReplies={hasReplies}>
            <div className="mt-[-3px] flex items-start">
                <div className="flex h-10 flex-row items-center gap-4 pb-[8px] pr-4">
                    <p className="text-md mt-[4px] font-sans leading-normal text-neutral-900/40 sm:text-lg dark:text-white/60">
                        {notPublishedMessage}
                    </p>
                    {showMoreButton && (
                        <div className="mt-[4px]">
                            <MoreButton comment={comment} toggleEdit={openEditMode} />
                        </div>
                    )}
                </div>
            </div>
            <RepliesContainer comment={comment} />
            {displayReplyForm && <ReplyFormBox comment={comment} openForm={openForm} />}
        </CommentLayout>
    );
};

// ============================================================================
// Comment Header Components
// ============================================================================

const MemberExpertise: React.FC<{ comment: Comment }> = ({ comment }) => {
    const { member } = useAppContext();
    const memberExpertise = member && comment.member && comment.member.uuid === member.uuid
        ? member.expertise
        : comment?.member?.expertise;

    if (!memberExpertise) {
        return null;
    }

    return (
        <span className="[overflow-wrap:anywhere]">
            <span className="mx-[0.3em] hidden sm:inline-block">·</span>
            {memberExpertise}
        </span>
    );
};

const EditedInfo: React.FC<{ comment: Comment }> = ({ comment }) => {
    const { t } = useAppContext();

    if (!comment.edited_at) {
        return null;
    }

    return <span>&nbsp;({t('edited')})</span>;
};

const AuthorName: React.FC<{ comment: Comment }> = ({ comment }) => {
    const { t } = useAppContext();
    const name = getMemberNameFromComment(comment, t);

    return (
        <h4 className="font-sans text-base font-bold leading-snug text-neutral-900 sm:text-sm dark:text-white/85">
            {name}
        </h4>
    );
};

export const RepliedToSnippet: React.FC<{ comment: Comment }> = ({ comment }) => {
    const { comments, t, pageUrl } = useAppContext();
    const inReplyToComment = findCommentById(comments, comment.in_reply_to_id);

    const inReplyToSnippet = !inReplyToComment || inReplyToComment.status !== 'published'
        ? `[${t('removed')}]`
        : comment.in_reply_to_snippet;

    const linkToReply = inReplyToComment && inReplyToComment.status === 'published';
    const className = 'font-medium text-neutral-900/60 break-all transition-colors dark:text-white/70';
    const linkClassName = `${className} hover:text-neutral-900/75 dark:hover:text-white/85`;

    if (!linkToReply) {
        return <span className={className} data-testid="comment-in-reply-to">{inReplyToSnippet}</span>;
    }

    return (
        <a
            className={linkClassName}
            data-testid="comment-in-reply-to"
            href={buildCommentPermalink(pageUrl, comment.in_reply_to_id)}
            target="_parent"
        >
            {inReplyToSnippet}
        </a>
    );
};

type CommentHeaderProps = {
    comment: Comment;
    className?: string;
};

const CommentHeader: React.FC<CommentHeaderProps> = ({ comment, className = '' }) => {
    const { member, t, pageUrl } = useAppContext();
    const createdAtRelative = useRelativeTime(comment.created_at);
    const memberExpertise = member && comment.member && comment.member.uuid === member.uuid
        ? member.expertise
        : comment?.member?.expertise;
    const isReplyToReply = comment.in_reply_to_id && comment.in_reply_to_snippet;

    const timestampElement = (
        <a
            className="hover:underline"
            href={buildCommentPermalink(pageUrl, comment.id)}
            target="_parent"
            title={formatExplicitTime(comment.created_at)}
        >
            <span className="mx-[0.3em]">·</span>{createdAtRelative}
        </a>
    );

    const flexDirection = memberExpertise ? 'flex-col' : 'flex-row';
    const marginBottom = isReplyToReply ? 'mb-0.5' : 'mb-2';

    return (
        <>
            <div className={`mt-0.5 flex flex-wrap items-start sm:flex-row ${flexDirection} ${marginBottom} ${className}`}>
                <AuthorName comment={comment} />
                <div className="flex items-baseline pr-4 font-sans text-base leading-snug text-neutral-900/50 sm:text-sm dark:text-white/60">
                    <span>
                        <MemberExpertise comment={comment} />
                        {timestampElement}
                        <EditedInfo comment={comment} />
                    </span>
                </div>
            </div>
            {isReplyToReply && (
                <div className="mb-2 line-clamp-1 font-sans text-base leading-snug text-neutral-900/50 sm:text-sm dark:text-white/60">
                    <span>{t('Replied to')}</span>:&nbsp;<RepliedToSnippet comment={comment} />
                </div>
            )}
        </>
    );
};

// ============================================================================
// Comment Body
// ============================================================================

type CommentBodyProps = {
    html: string;
    className?: string;
    isHigh