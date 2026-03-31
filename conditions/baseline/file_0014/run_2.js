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
): OpenCommentForm => ({
    id: comment.id,
    parent_id: parent?.id,
    type: 'reply',
    hasUnsavedChanges: false,
    ...(parent && {
        in_reply_to_id: comment.id,
        in_reply_to_snippet: getCommentInReplyToSnippet(comment)
    })
});

// ============================================================================
// Form State Helpers
// ============================================================================

const findEditForm = (openForms: OpenCommentForm[], commentId: string) =>
    openForms.find(f => f.id === commentId && f.type === 'edit');

const findReplyForm = (openForms: OpenCommentForm[], commentId: string) =>
    openForms.find(f => (f.id === commentId || f.parent_id === commentId) && f.type === 'reply');

const shouldDisplayReplyForm = (openForm: OpenCommentForm | undefined, commentId: string) =>
    openForm && (!openForm.parent_id || openForm.parent_id === commentId);

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
    const { dispatchAction, isAdmin } = useAppContext();
    const visibility = useCommentVisibility(comment, isAdmin);

    const openEditMode = useCallback(() => {
        dispatchAction('openCommentForm', createEditForm(comment));
    }, [comment, dispatchAction]);

    if (visibility.showDeletedMessage || visibility.showHiddenMessage) {
        return <UnpublishedComment comment={comment} openEditMode={openEditMode} />;
    }

    if (visibility.showCommentContent && !visibility.showHiddenMessage) {
        return <PublishedComment comment={comment} openEditMode={openEditMode} parent={parent} />;
    }

    return null;
};

// ============================================================================
// Published Comment
// ============================================================================

type PublishedCommentProps = AnimatedCommentProps & {
    openEditMode: () => void;
};

const PublishedComment: React.FC<PublishedCommentProps> = ({ comment, parent, openEditMode }) => {
    const { dispatchAction, openCommentForms, isAdmin, commentIdToHighlight } = useAppContext();

    const isHidden = isAdmin && comment.status === 'hidden';
    const hiddenClass = isHidden ? 'opacity-30' : '';

    const editForm = findEditForm(openCommentForms, comment.id);
    const isInEditMode = !!editForm;

    const openForm = findReplyForm(openCommentForms, comment.id);
    const displayReplyForm = shouldDisplayReplyForm(openForm, comment.id);
    const highlightReplyButton = !!(openForm && openForm.id === comment.id);

    const openReplyForm = useCallback(async () => {
        if (openForm && openForm.id === comment.id) {
            dispatchAction('closeCommentForm', openForm.id);
        } else {
            await dispatchAction('openCommentForm', createReplyForm(comment, parent));
        }
    }, [comment, parent, openForm, dispatchAction]);

    const hasReplies = displayReplyForm || (comment.replies?.length ?? 0) > 0;
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

    const avatar = isAdmin && comment.status !== 'deleted'
        ? <Avatar member={comment.member} />
        : <BlankAvatar />;

    const hasReplies = (comment.replies?.length ?? 0) > 0;

    const statusMessages: Record<string, string> = {
        hidden: t('This comment has been hidden.'),
        deleted: t('This comment has been removed.')
    };
    const notPublishedMessage = statusMessages[comment.status] || '';

    const openForm = findReplyForm(openCommentForms, comment.id);
    const displayReplyForm = shouldDisplayReplyForm(openForm, comment.id);
    const showMoreButton = isAdmin && comment.status === 'hidden';

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
// Header Components
// ============================================================================

const MemberExpertise: React.FC<{ comment: Comment }> = ({ comment }) => {
    const { member } = useAppContext();
    const memberExpertise = member?.uuid === comment.member?.uuid
        ? member.expertise
        : comment.member?.expertise;

    if (!memberExpertise) return null;

    return (
        <span className="[overflow-wrap:anywhere]">
            <span className="mx-[0.3em] hidden sm:inline-block">·</span>
            {memberExpertise}
        </span>
    );
};

const EditedInfo: React.FC<{ comment: Comment }> = ({ comment }) => {
    const { t } = useAppContext();
    if (!comment.edited_at) return null;

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

    const isPublished = inReplyToComment?.status === 'published';
    const inReplyToSnippet = isPublished ? comment.in_reply_to_snippet : `[${t('removed')}]`;

    const baseClass = 'font-medium text-neutral-900/60 break-all transition-colors dark:text-white/70';
    const linkClass = `${baseClass} hover:text-neutral-900/75 dark:hover:text-white/85`;

    if (!isPublished) {
        return <span className={baseClass} data-testid="comment-in-reply-to">{inReplyToSnippet}</span>;
    }

    return (
        <a
            className={linkClass}
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
    const memberExpertise = member?.uuid === comment.member?.uuid
        ? member.expertise
        : comment.member?.expertise;
    const isReplyToReply = !!(comment.in_reply_to_id && comment.in_reply_to_snippet);

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
// Body Component
// ============================================================================

type CommentBodyProps = {
    html: string;
    className?: string;
    isHighlighted?: boolean;
};

const highlightCommentHtml = (html: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const highlightClass = 'animate-[highlight_2.5s_ease-out] [animation-delay:1s] bg-yellow-300/40 -my-0.5 py-0.5 dark:text-white/85 dark:bg-yellow-500/40';

    doc.querySelectorAll('p').forEach((p) => {
        const mark = doc.createElement('mark');
        mark.className = highlightClass;

        while (p.firstChild) {
            mark.appendChild(p.firstChild);
        }
        p.appendChild(mark);
    });

    return doc.body.innerHTML;
};

const CommentBody: React.FC<CommentBodyProps> = ({ html, className = '', isHighlighted }) => {
    const commentHtml = isHighlighted ? highlightCommentHtml(html) : html;

    return (
        <div className={`mt mb-2 flex flex-row items-center gap-4 pr-4 ${className}`}>
            <div
                dangerouslySetInnerHTML={{ __html: commentHtml }}
                className="gh-comment-content text-md -mx-1 text-pretty rounded-md px-1 font-sans leading-normal text-neutral-900 [overflow-wrap:anywhere] sm:text-lg dark:text-white/85"
                data-testid="comment-content"
            />
        </div>
    );
};

// ============================================================================
// Menu Component
// ============================================================================

type CommentMenuProps = {
    comment: Comment;
    openReplyForm: () => void;
    highlightReplyButton: boolean;
    openEditMode: () => void;