```typescript
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
    }

    if (showCommentContent && !showHiddenMessage) {
        return <PublishedComment comment={comment} openEditMode={openEditMode} parent={parent} />;
    }

    return null;
};

type CommentProps = AnimatedCommentProps;

/** Determines visibility state of a comment based on status and admin privileges */
const useCommentVisibility = (comment: Comment, admin: boolean) => {
    const hasReplies = comment.replies?.length ?? 0 > 0;
    const isDeleted = comment.status === 'deleted';
    const isHidden = comment.status === 'hidden';

    return {
        // Show deleted message only when comment has replies (regardless of admin status)
        showDeletedMessage: isDeleted && hasReplies,
        // Show hidden message for non-admins when comment has replies
        showHiddenMessage: hasReplies && isHidden && !admin,
        // Show comment content if not deleted AND (is published OR admin viewing hidden)
        showCommentContent: !isDeleted && (admin || comment.status === 'published')
    };
};

type PublishedCommentProps = CommentProps & {
    openEditMode: () => void;
};

/** Finds the edit form for the current comment */
const findEditForm = (openCommentForms: OpenCommentForm[], commentId: string) => {
    return openCommentForms.find(openForm => openForm.id === commentId && openForm.type === 'edit');
};

/** Finds the reply form for the current comment or its parent */
const findReplyForm = (openCommentForms: OpenCommentForm[], commentId: string) => {
    return openCommentForms.find(f => (f.id === commentId || f.parent_id === commentId) && f.type === 'reply');
};

/** Determines if reply form should be displayed at comment level */
const shouldDisplayReplyForm = (openForm: OpenCommentForm | undefined, commentId: string): boolean => {
    return !!(openForm && (!openForm.parent_id || openForm.parent_id === commentId));
};

/** Determines if reply button should be highlighted */
const shouldHighlightReplyButton = (openForm: OpenCommentForm | undefined, commentId: string): boolean => {
    return !!(openForm && openForm.id === commentId);
};

/** Builds reply form data for nested replies */
const buildReplyFormData = (comment: Comment, parent: Comment | undefined): Partial<OpenCommentForm> => {
    if (!parent) {
        return {};
    }

    return {
        in_reply_to_id: comment.id,
        in_reply_to_snippet: getCommentInReplyToSnippet(comment)
    };
};

const PublishedComment: React.FC<PublishedCommentProps> = ({comment, parent, openEditMode}) => {
    const {dispatchAction, openCommentForms, isAdmin, commentIdToHighlight} = useAppContext();

    const isHidden = isAdmin && comment.status === 'hidden';
    const hiddenClass = isHidden ? 'opacity-30' : '';

    const editForm = findEditForm(openCommentForms, comment.id);
    const isInEditMode = !!editForm;

    const openForm = findReplyForm(openCommentForms, comment.id);
    const displayReplyForm = shouldDisplayReplyForm(openForm, comment.id);
    const highlightReplyButton = shouldHighlightReplyButton(openForm, comment.id);

    const openReplyForm = useCallback(async () => {
        if (openForm?.id === comment.id) {
            dispatchAction('closeCommentForm', openForm.id);
        } else {
            const inReplyToDetails = buildReplyFormData(comment, parent);

            const newForm: OpenCommentForm = {
                id: comment.id,
                parent_id: parent?.id,
                type: 'reply',
                hasUnsavedChanges: false,
                ...inReplyToDetails
            };

            await dispatchAction('openCommentForm', newForm);
        }
    }, [comment, parent, openForm, dispatchAction]);

    const hasReplies = displayReplyForm || (comment.replies?.length ?? 0 > 0);
    const avatar = <Avatar member={comment.member} />;

    return (
        <CommentLayout avatar={avatar} className={hiddenClass} hasReplies={hasReplies} memberUuid={comment.member?.uuid}>
            <div>
                {isInEditMode ? (
                    <>
                        <CommentHeader className={hiddenClass} comment={comment} />
                        <EditForm comment={comment} openForm={editForm} parent={parent} />
                    </>
                ) : (
                    <>
                        <CommentHeader className={hiddenClass} comment={comment} />
                        <CommentBody className={hiddenClass} html={comment.html} isHighlighted={comment.id === commentIdToHighlight} />
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

type UnpublishedCommentProps = {
    comment: Comment;
    openEditMode: () => void;
};

/** Determines the appropriate avatar for unpublished comments */
const getUnpublishedAvatar = (comment: Comment, isAdmin: boolean) => {
    return (isAdmin && comment.status !== 'deleted')
        ? <Avatar member={comment.member} />
        : <BlankAvatar />;
};

/** Gets the localized message for unpublished comment status */
const getUnpublishedMessage = (status: string, t: (key: string) => string): string => {
    if (status === 'hidden') {
        return t('This comment has been hidden.');
    }
    if (status === 'deleted') {
        return t('This comment has been removed.');
    }
    return '';
};

const UnpublishedComment: React.FC<UnpublishedCommentProps> = ({comment, openEditMode}) => {
    const {isAdmin, openCommentForms, t} = useAppContext();

    const avatar = getUnpublishedAvatar(comment, isAdmin);
    const hasReplies = comment.replies?.length ?? 0 > 0;
    const notPublishedMessage = getUnpublishedMessage(comment.status, t);

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

// Helper components

const MemberExpertise: React.FC<{comment: Comment}> = ({comment}) => {
    const {member} = useAppContext();
    const memberExpertise = member?.uuid === comment.member?.uuid ? member.expertise : comment.member?.expertise;

    if (!memberExpertise) {
        return null;
    }

    return (
        <span className="[overflow-wrap:anywhere]"><span className="mx-[0.3em] hidden sm:inline-block">·</span>{memberExpertise}</span>
    );
};

const EditedInfo: React.FC<{comment: Comment}> = ({comment}) => {
    const {t} = useAppContext();
    if (!comment.edited_at) {
        return null;
    }
    return (
        <span>
            &nbsp;({t('edited')})
        </span>
    );
};

const RepliesContainer: React.FC<RepliesProps & {className?: string}> = ({comment, className = ''}) => {
    const hasReplies = comment.replies?.length ?? 0 > 0;

    if (!hasReplies) {
        return null;
    }

    return (
        <div className={`-ml-2 mb-4 mt-7 sm:mb-0 sm:mt-8 ${className}`}>
            <Replies comment={comment} />
        </div>
    );
};

type ReplyFormBoxProps = {
    comment: Comment;
    openForm: OpenCommentForm;
};

const ReplyFormBox: React.FC<ReplyFormBoxProps> = ({comment, openForm}) => {
    return (
        <div className="my-8 sm:my-10">
            <ReplyForm openForm={openForm} parent={comment} />
        </div>
    );
};

//
// -- Published comment components --
//

const AuthorName: React.FC<{comment: Comment}> = ({comment}) => {
    const {t} = useAppContext();
    const name = getMemberNameFromComment(comment, t);
    return (
        <h4 className="font-sans text-base font-bold leading-snug text-neutral-900 sm:text-sm dark:text-white/85">
            {name}
        </h4>
    );
};

export const RepliedToSnippet: React.FC<{comment: Comment}> = ({comment}) => {
    const {comments, t, pageUrl} = useAppContext();
    const inReplyToComment = findCommentById(comments, comment.in_reply_to_id);

    let inReplyToSnippet = comment.in_reply_to_snippet;
    // For public API requests hidden/deleted comments won't exist in the comments array
    // unless it was only just deleted in which case it will exist but have a 'deleted' status
    if (!inReplyToComment?.status || inReplyToComment.status !== 'published') {
        inReplyToSnippet = `[${t('removed')}]`;
    }

    const linkToReply = inReplyToComment?.status === 'published';
    const className = 'font-medium text-neutral-900/60 break-all transition-colors dark:text-white/70';
    const linkClassName = `${className} hover:text-neutral-900/75 dark:hover:text-white/85`;

    if (!linkToReply) {
        return <span className={className} data-testid="comment-in-reply-to">{inReplyToSnippet}</span>;
    }

    return (
        <a className={linkClassName} data-testid="comment-in-reply-to" href={buildCommentPermalink(pageUrl, comment.in_reply_to_id)} target="_parent">{inReplyToSnippet}</a>
    );
};

type CommentHeaderProps = {
    comment: Comment;
    className?: string;
};

/** Determines if comment is a reply to another reply */
const isReplyToReply = (comment: Comment): boolean => {
    return !!(comment.in_reply_to_id && comment.in_reply_to_snippet);
};

/** Gets member expertise, preferring current user's expertise if applicable */
const getMemberExpertise = (comment: Comment, member: any): string | undefined => {
    return member?.uuid === comment.member?.uuid ? member.expertise : comment.member?.expertise;
};

const CommentHeader: React.FC<CommentHeaderProps> = ({comment, className = ''}) => {
    const {member, t, pageUrl} = useAppContext();
    const createdAtRelative = useRelativeTime(comment.created_at);
    const memberExpertise = getMemberExpertise(comment, member);
    const isReply = isReplyToReply(comment);

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
            <div className={`mt-0.5 flex flex-wrap items-start sm:flex-row ${memberExpertise ? 'flex-col' : 'flex-row'} ${isReply ? 'mb-0.5' : 'mb-2'} ${className}`}>
                <AuthorName comment={comment} />
                <div className="flex items-baseline pr-4 font-sans text-base leading-snug text-neutral-900/50 sm:text-sm dark:text-white/60">
                    <span>
                        <MemberExpertise comment={comment}/>
                        {timestampElement}
                        <EditedInfo comment={