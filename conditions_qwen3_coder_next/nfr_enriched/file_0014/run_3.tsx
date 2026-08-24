import EditForm from './forms/edit-form';
import LikeButton from './buttons/like-button';
import LikeCount from './buttons/like-count';
import MoreButton from './buttons/more-button';
import React, {useCallback} from 'react';
import Replies, {RepliesProps} from './replies';
import ReplyButton from './buttons/reply-button';
import ReplyForm from './forms/reply-form';
import {Avatar, BlankAvatar} from './avatar';
import {Comment, OpenCommentForm, useAppContext} from '../../app-context';
import {Transition} from '@headlessui/react';
import {buildCommentPermalink, findCommentById, formatExplicitTime, getCommentInReplyToSnippet, getMemberNameFromComment} from '../../utils/helpers';
import {useRelativeTime} from '../../utils/hooks';

type AnimatedCommentProps = {
    comment: Comment;
    parent?: Comment;
};

const AnimatedComment: React.FC<AnimatedCommentProps> = ({comment, parent}) => {
    const {commentsIsLoading} = useAppContext();

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

export const CommentComponent: React.FC<CommentProps> = ({comment, parent}) => {
    const {dispatchAction, isAdmin} = useAppContext();
    const {showDeletedMessage, showHiddenMessage, showCommentContent} = useCommentVisibility(comment, isAdmin);

    const openEditMode = useCallback(() => {
        const newForm: OpenCommentForm = {
            id: comment.id,
            type: 'edit',
            hasUnsavedChanges: false,
            in_reply_to_id: comment.in_reply_to_id,
            in_reply_to_snippet: comment.in_reply_to_snippet
        };
        dispatchAction('openCommentForm', newForm);
    }, [comment.id, dispatchAction]);

    if (showDeletedMessage || showHiddenMessage) {
        return <UnpublishedComment comment={comment} openEditMode={openEditMode} />;
    } else if (showCommentContent && !showHiddenMessage) {
        return <PublishedComment comment={comment} openEditMode={openEditMode} parent={parent} />;
    }

    return null;
};

type CommentProps = AnimatedCommentProps;

/**
 * Determines visibility logic for a comment based on its status and admin status
 */
const useCommentVisibility = (comment: Comment, admin: boolean) => {
    const hasReplies = !!(comment.replies && comment.replies.length > 0);
    const isDeleted = comment.status === 'deleted';
    const isHidden = comment.status === 'hidden';

    return {
        showDeletedMessage: isDeleted && hasReplies,
        showHiddenMessage: hasReplies && isHidden && !admin,
        showCommentContent: !isDeleted && (admin || comment.status === 'published')
    };
};

type PublishedCommentProps = CommentProps & {
    openEditMode: () => void;
};

/**
 * Renders a fully published comment with all its interactive elements and reply sections
 */
const PublishedComment: React.FC<PublishedCommentProps> = ({comment, parent, openEditMode}) => {
    const {dispatchAction, openCommentForms, isAdmin, commentIdToHighlight} = useAppContext();

    const isHidden = isAdmin && comment.status === 'hidden';
    const hiddenClass = isHidden ? 'opacity-30' : '';

    const isInEditMode = !!openCommentForms.find(form => form.id === comment.id && form.type === 'edit');

    const openReplyForm = useCallback(async () => {
        const existingForm = openCommentForms.find(f => (f.id === comment.id || f.parent_id === comment.id) && f.type === 'reply');

        if (existingForm && existingForm.id === comment.id) {
            dispatchAction('closeCommentForm', existingForm.id);
            return;
        }

        const inReplyToDetails: Partial<OpenCommentForm> = parent ? {
            in_reply_to_id: comment.id,
            in_reply_to_snippet: getCommentInReplyToSnippet(comment)
        } : {};

        await dispatchAction('openCommentForm', {
            id: comment.id,
            parent_id: parent?.id,
            type: 'reply',
            hasUnsavedChanges: false,
            ...inReplyToDetails
        });
    }, [comment, parent, openCommentForms, dispatchAction]);

    const hasReplies = comment.replies && comment.replies.length > 0;
    const avatar = <Avatar member={comment.member} />;

    const renderContent = () => {
        if (isInEditMode) {
            return (
                <>
                    <CommentHeader className={hiddenClass} comment={comment} />
                    <EditForm comment={comment} openForm={openCommentForms.find(f => f.id === comment.id && f.type === 'edit')} parent={parent} />
                </>
            );
        }

        return (
            <>
                <CommentHeader className={hiddenClass} comment={comment} />
                <CommentBody className={hiddenClass} html={comment.html} isHighlighted={comment.id === commentIdToHighlight} />
                <CommentMenu
                    comment={comment}
                    highlightReplyButton={!!(openCommentForms.find(f => (f.id === comment.id || f.parent_id === comment.id) && f.type === 'reply')?.id === comment.id)}
                    openEditMode={openEditMode}
                    openReplyForm={openReplyForm}
                    parent={parent}
                />
            </>
        );
    };

    return (
        <CommentLayout avatar={avatar} className={hiddenClass} hasReplies={hasReplies} memberUuid={comment.member?.uuid}>
            <div>
                {renderContent()}
            </div>
            <RepliesContainer comment={comment} />
            <RenderReplyFormBox comment={comment} />
        </CommentLayout>
    );
};

type UnpublishedCommentProps = {
    comment: Comment;
    openEditMode: () => void;
};

/**
 * Renders a hidden or deleted comment with appropriate messaging
 */
const UnpublishedComment: React.FC<UnpublishedCommentProps> = ({comment, openEditMode}) => {
    const {isAdmin, openCommentForms, t} = useAppContext();

    const avatar = isAdmin && comment.status !== 'deleted' ? <Avatar member={comment.member} /> : <BlankAvatar />;
    const hasReplies = !!(comment.replies && comment.replies.length > 0);
    const notPublishedMessage = getUnpublishedMessage(comment, t);
    const openForm = openCommentForms.find(f => (f.id === comment.id || f.parent_id === comment.id) && f.type === 'reply');
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
            <RenderReplyFormBox comment={comment} openForm={openForm} />
        </CommentLayout>
    );
};

/**
 * Returns the localized message for unpublished comment depending on status
 */
function getUnpublishedMessage(comment: Comment, t: (key: string) => string): string {
    switch (comment.status) {
        case 'hidden':
            return t('This comment has been hidden.');
        case 'deleted':
            return t('This comment has been removed.');
        default:
            return '';
    }
}

// Helper components

const MemberExpertise: React.FC<{comment: Comment}> = ({comment}) => {
    const {member} = useAppContext();
    const expertise = member?.uuid === comment.member?.uuid ? member.expertise : comment.member?.expertise;

    return expertise
        ? <span className="[overflow-wrap:anywhere]"><span className="mx-[0.3em] hidden sm:inline-block">·</span>{expertise}</span>
        : null;
};

const EditedInfo: React.FC<{comment: Comment}> = ({comment}) => {
    const {t} = useAppContext();
    return comment.edited_at
        ? <span>&nbsp;({t('edited')})</span>
        : null;
};

const RepliesContainer: React.FC<RepliesProps & {className?: string}> = ({comment, className = ''}) => {
    const hasReplies = !!(comment.replies && comment.replies.length > 0);

    return hasReplies
        ? <div className={`-ml-2 mb-4 mt-7 sm:mb-0 sm:mt-8 ${className}`}><Replies comment={comment} /></div>
        : null;
};

type ReplyFormBoxProps = {
    comment: Comment;
    openForm?: OpenCommentForm;
};

const RenderReplyFormBox: React.FC<ReplyFormBoxProps> = ({comment, openForm}) => {
    if (!openForm || (openForm.parent_id && openForm.parent_id !== comment.id)) {
        return null;
    }

    return <ReplyFormBox component comment={comment} openForm={openForm} />;
};

const ReplyFormBox: React.FC<ReplyFormBoxProps & {component?: boolean}> = ({comment, openForm}) => {
    return (
        <div className="my-8 sm:my-10">
            <ReplyForm openForm={openForm} parent={comment} />
        </div>
    );
};

const AuthorName: React.FC<{comment: Comment}> = ({comment}) => {
    const {t} = useAppContext();
    const name = getMemberNameFromComment(comment, t);
    return (
        <h4 className="font-sans text-base font-bold leading-snug text-neutral-900 sm:text-sm dark:text-white/85">{name}</h4>
    );
};

/**
 * Renders a link to a replied comment if available, or indication text if removed/pending
 */
export const RepliedToSnippet: React.FC<{comment: Comment}> = ({comment}) => {
    const {comments, t, pageUrl} = useAppContext();
    const inReplyToComment = findCommentById(comments, comment.in_reply_to_id);

    const inReplyToSnippet = comment.in_reply_to_snippet
        ?? `[${t('removed')}]`;

    const isValid = inReplyToComment?.status === 'published';
    const className = 'font-medium text-neutral-900/60 break-all transition-colors dark:text-white/70';
    const linkClassName = `${className} hover:text-neutral-900/75 dark:hover:text-white/85`;

    if (!isValid) {
        return <span className={className} data-testid="comment-in-reply-to">{inReplyToSnippet}</span>;
    }

    return (
        <a
            className={linkClassName}
            data-testid="comment-in-reply-to"
            href={buildCommentPermalink(pageUrl, inReplyToComment!.id)}
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

const CommentHeader: React.FC<CommentHeaderProps> = ({comment, className = ''}) => {
    const {member, t, pageUrl} = useAppContext();
    const createdAtRelative = useRelativeTime(comment.created_at);
    const memberExpertise = member?.uuid === comment.member?.uuid ? member.expertise : comment.member?.expertise;
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

    return (
        <>
            <div className={`mt-0.5 flex flex-wrap items-start sm:flex-row ${memberExpertise ? 'flex-col' : 'flex-row'} ${isReplyToReply ? 'mb-0.5' : 'mb-2'} ${className}`}>
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

type CommentBodyProps = {
    html: string;
    className?: string;
    isHighlighted?: boolean;
};

const CommentBody: React.FC<CommentBodyProps> = ({html, className = '', isHighlighted}) => {
    let contentHtml = html;

    if (isHighlighted) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const paragraphs = doc.querySelectorAll('p');

        paragraphs.forEach((p) => {
            const mark = doc.createElement('mark');
            mark.className =
                'animate-[highlight_2.5s_ease-out] [animation-delay:1s] bg-yellow-300/40 -my-0.5 py-0.5 dark:text-white/85 dark:bg-yellow-500/40';

            while (p.firstChild) {
                mark.appendChild(p.firstChild);
            }
            p.appendChild(mark);
        });

        contentHtml = doc.body.innerHTML;
    }

    return (
        <div className={`mt mb-2 flex flex-row items-center gap-4 pr-4 ${className}`}>
            <div
                className="gh-comment-content text-md -mx-1 text-pretty rounded-md px-1 font-sans leading-normal text-neutral-900 [overflow-wrap:anywhere] sm:text-lg dark:text-white/85"
                dangerouslySetInnerHTML={{__html: contentHtml}}
                data-testid="comment-content"
            />
        </div>
    );
};

type CommentMenuProps = {
    comment: Comment;
    openReplyForm: () => void;
    highlightReplyButton: boolean;
    openEditMode: () => void;
    className?: string;
};

const CommentMenu: React.FC<CommentMenuProps> = ({
    comment,
    openReplyForm,
    highlightReplyButton,
    openEditMode,
    className = ''
}) => {
    const {member, t, isMember, isAdmin, isCommentingDisabled} = useAppContext();

    const isPublished = comment.status === 'published';
    const isOwnComment = member?.uuid === comment.member?.uuid;

    const showLikeButton = !isCommentingDisabled;
    const showReplyButton = !isCommentingDisabled;

    const showMoreButton = !(isCommentingDisabled && isOwnComment) && (isAdmin || (isMember && isPublished));

    if (isAdmin && comment.status === 'hidden') {
        return (
            <div className={`flex items-center gap-4 ${className}`}>
                <span className="font-sans text-base leading-snug text-red-600 sm:text-sm">{t('Hidden for members')}</span>
                <MoreButton comment={comment} toggleEdit={openEditMode} />
            </div>
        );
    }

    return (
        <div className={`flex items-center gap-4 ${className}`}>
            {showLikeButton
                ? <LikeButton comment={comment} />
                : <LikeCount count={comment.count.likes} liked={comment.liked} />
            }
            {showReplyButton && <ReplyButton isReplying={highlightReplyButton} openReplyForm={openReplyForm} />}
            {showMoreButton && <MoreButton comment={comment} toggleEdit={openEditMode} />}
        </div>
    );
};

const RepliesLine: React.FC<{hasReplies: boolean}> = ({hasReplies}) => {
    return hasReplies
        ? <div className="mb-2 h-full w-px grow rounded bg-gradient-to-b from-neutral-900/15 from-70% to-transparent dark:from-white/20 dark:from-70%" data-testid="replies-line" />
        : null;
};

type CommentLayoutProps = {
    children: React.ReactNode;
    avatar: React.ReactNode;
    hasReplies: boolean;
    className?: string;
    memberUuid?: string;
};

const CommentLayout: React.FC<CommentLayoutProps> = ({children, avatar, hasReplies, className = '', memberUuid = ''}) => {
    return (
        <div className={`flex w-full flex-row ${hasReplies === true ? 'mb-0' : 'mb-7'}`} data-member-uuid={memberUuid} data-testid="comment-component">
            <div className="mr-2 flex flex-col items-center justify-start sm:mr-3">
                <div className={`flex-0 mb-3 sm:mb-4 ${className}`}>
                    {avatar}
                </div>
                <RepliesLine hasReplies={hasReplies} />
            </div>
            <div className="grow">
                {children}
            </div>
        </div>
    );
};

export default AnimatedComment;