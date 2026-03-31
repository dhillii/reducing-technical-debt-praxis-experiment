```tsx
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
import {
    buildCommentPermalink,
    findCommentById,
    formatExplicitTime,
    getCommentInReplyToSnippet,
    getMemberNameFromComment
} from '../../utils/helpers';
import {useRelativeTime} from '../../utils/hooks';

// ─── Types ───────────────────────────────────────────────────────────────────

type CommentProps = {
    comment: Comment;
    parent?: Comment;
};

type PublishedCommentProps = CommentProps & {openEditMode: () => void};
type UnpublishedCommentProps = {comment: Comment; openEditMode: () => void};
type ReplyFormBoxProps = {comment: Comment; openForm: OpenCommentForm};

type CommentHeaderProps = {comment: Comment; className?: string};
type CommentBodyProps = {html: string; className?: string; isHighlighted?: boolean};
type CommentMenuProps = {
    comment: Comment;
    openReplyForm: () => void;
    highlightReplyButton: boolean;
    openEditMode: () => void;
    className?: string;
};
type CommentLayoutProps = {
    children: React.ReactNode;
    avatar: React.ReactNode;
    hasReplies: boolean;
    className?: string;
    memberUuid?: string;
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

const useCommentVisibility = (comment: Comment, isAdmin: boolean) => {
    const hasReplies = !!comment.replies?.length;
    const isDeleted = comment.status === 'deleted';
    const isHidden = comment.status === 'hidden';

    return {
        showDeletedMessage: isDeleted && hasReplies,
        showHiddenMessage: hasReplies && isHidden && !isAdmin,
        showCommentContent: !isDeleted && (isAdmin || comment.status === 'published')
    };
};

const useOpenReplyForm = (comment: Comment, parent: Comment | undefined, openForm: OpenCommentForm | undefined) => {
    const {dispatchAction} = useAppContext();

    return useCallback(async () => {
        if (openForm?.id === comment.id) {
            dispatchAction('closeCommentForm', openForm.id);
            return;
        }

        const inReplyToDetails: Partial<OpenCommentForm> = parent
            ? {in_reply_to_id: comment.id, in_reply_to_snippet: getCommentInReplyToSnippet(comment)}
            : {};

        await dispatchAction('openCommentForm', {
            id: comment.id,
            parent_id: parent?.id,
            type: 'reply',
            hasUnsavedChanges: false,
            ...inReplyToDetails
        });
    }, [comment, parent, openForm, dispatchAction]);
};

const useOpenEditForm = (comment: Comment) => {
    const {dispatchAction} = useAppContext();

    return useCallback(() => {
        dispatchAction('openCommentForm', {
            id: comment.id,
            type: 'edit',
            hasUnsavedChanges: false,
            in_reply_to_id: comment.in_reply_to_id,
            in_reply_to_snippet: comment.in_reply_to_snippet
        });
    }, [comment.id, comment.in_reply_to_id, comment.in_reply_to_snippet, dispatchAction]);
};

const useReplyFormState = (comment: Comment) => {
    const {openCommentForms} = useAppContext();

    const openForm = openCommentForms.find(
        f => (f.id === comment.id || f.parent_id === comment.id) && f.type === 'reply'
    );
    const displayReplyForm = openForm && (!openForm.parent_id || openForm.parent_id === comment.id);
    const highlightReplyButton = !!(openForm?.id === comment.id);

    return {openForm, displayReplyForm, highlightReplyButton};
};

// ─── Small Helpers ────────────────────────────────────────────────────────────

const getNotPublishedMessage = (comment: Comment, t: (s: string) => string): string => {
    if (comment.status === 'hidden') return t('This comment has been hidden.');
    if (comment.status === 'deleted') return t('This comment has been removed.');
    return '';
};

const highlightHtml = (html: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const markClass = 'animate-[highlight_2.5s_ease-out] [animation-delay:1s] bg-yellow-300/40 -my-0.5 py-0.5 dark:text-white/85 dark:bg-yellow-500/40';

    doc.querySelectorAll('p').forEach((p) => {
        const mark = doc.createElement('mark');
        mark.className = markClass;
        while (p.firstChild) mark.appendChild(p.firstChild);
        p.appendChild(mark);
    });

    return doc.body.innerHTML;
};

// ─── Animated Entry Point ─────────────────────────────────────────────────────

const AnimatedComment: React.FC<CommentProps> = ({comment, parent}) => {
    const {commentsIsLoading} = useAppContext();

    return (
        <Transition
            appear
            className={commentsIsLoading ? 'animate-pulse' : ''}
            data-testid="animated-comment"
            enter="transition-opacity duration-300 ease-out"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            id={comment.id}
            leave="transition-opacity duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            show={true}
        >
            <CommentComponent comment={comment} parent={parent} />
        </Transition>
    );
};

// ─── Comment Dispatcher ───────────────────────────────────────────────────────

export const CommentComponent: React.FC<CommentProps> = ({comment, parent}) => {
    const {isAdmin} = useAppContext();
    const {showDeletedMessage, showHiddenMessage, showCommentContent} = useCommentVisibility(comment, isAdmin);
    const openEditMode = useOpenEditForm(comment);

    if (showDeletedMessage || showHiddenMessage) {
        return <UnpublishedComment comment={comment} openEditMode={openEditMode} />;
    }

    if (showCommentContent) {
        return <PublishedComment comment={comment} openEditMode={openEditMode} parent={parent} />;
    }

    return null;
};

// ─── Published Comment ────────────────────────────────────────────────────────

const PublishedComment: React.FC<PublishedCommentProps> = ({comment, parent, openEditMode}) => {
    const {isAdmin, openCommentForms, commentIdToHighlight} = useAppContext();
    const {openForm, displayReplyForm, highlightReplyButton} = useReplyFormState(comment);
    const openReplyForm = useOpenReplyForm(comment, parent, openForm);

    const isHidden = isAdmin && comment.status === 'hidden';
    const hiddenClass = isHidden ? 'opacity-30' : '';

    const editForm = openCommentForms.find(f => f.id === comment.id && f.type === 'edit');
    const isInEditMode = !!editForm;

    const hasReplies = displayReplyForm || !!comment.replies?.length;
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
            {displayReplyForm && <ReplyFormBox comment={comment} openForm={openForm!} />}
        </CommentLayout>
    );
};

// ─── Unpublished Comment ──────────────────────────────────────────────────────

const UnpublishedComment: React.FC<UnpublishedCommentProps> = ({comment, openEditMode}) => {
    const {isAdmin, t} = useAppContext();
    const {openForm, displayReplyForm} = useReplyFormState(comment);

    const avatar = isAdmin && comment.status !== 'deleted'
        ? <Avatar member={comment.member} />
        : <BlankAvatar />;

    const hasReplies = !!comment.replies?.length;
    const notPublishedMessage = getNotPublishedMessage(comment, t);
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
            {displayReplyForm && <ReplyFormBox comment={comment} openForm={openForm!} />}
        </CommentLayout>
    );
};

// ─── Small Presentational Components ─────────────────────────────────────────

const MemberExpertise: React.FC<{comment: Comment}> = ({comment}) => {
    const {member} = useAppContext();
    const expertise = member?.uuid === comment.member?.uuid ? member?.expertise : comment.member?.expertise;

    if (!expertise) return null;

    return (
        <span className="[overflow-wrap:anywhere]">
            <span className="mx-[0.3em] hidden sm:inline-block">·</span>{expertise}
        </span>
    );
};

const EditedInfo: React.FC<{comment: Comment}> = ({comment}) => {
    const {t} = useAppContext();
    if (!comment.edited_at) return null;
    return <span>&nbsp;({t('edited')})</span>;
};

const RepliesContainer: React.FC<RepliesProps & {className?: string}> = ({comment, className = ''}) => {
    if (!comment.replies?.length) return null;

    return (
        <div className={`-ml-2 mb-4 mt-7 sm:mb-0 sm:mt-8 ${className}`}>
            <Replies comment={comment} />
        </div>
    );
};

const ReplyFormBox: React.FC<ReplyFormBoxProps> = ({comment, openForm}) => (
    <div className="my-8 sm:my-10">
        <ReplyForm openForm={openForm} parent={comment} />
    </div>
);

const AuthorName: React.FC<{comment: Comment}> = ({comment}) => {
    const {t} = useAppContext();
    return (
        <h4 className="font-sans text-base font-bold leading-snug text-neutral-900 sm:text-sm dark:text-white/85">
            {getMemberNameFromComment(comment, t)}
        </h4>
    );
};

export const RepliedToSnippet: React.FC<{comment: Comment}> = ({comment}) => {
    const {comments, t, pageUrl} = useAppContext();
    const inReplyToComment = findCommentById(comments, comment.in_reply_to_id);
    const isPublished = inReplyToComment?.status === 'published';

    const snippet = isPublished
        ? comment.in_reply_to_snippet
        : `[${t('removed')}]`;

    const baseClass = 'font-medium text-neutral-900/60 break-all transition-colors dark:text-white/70';

    if (!isPublished) {
        return <span className={baseClass} data-testid="comment-in-reply-to">{snippet}</span>;
    }

    return (
        <a
            className={`${baseClass} hover:text-neutral-900/75 dark:hover:text-white/85`}
            data-testid="comment-in-reply-to"
            href={buildCommentPermalink(pageUrl, comment.in_reply_to_id)}
            target="_parent"
        >
            {snippet}
        </a>
    );
};

const CommentHeader: React.FC<CommentHeaderProps> = ({comment, className = ''}) => {
    const {member, t, pageUrl} = useAppContext();
    const createdAtRelative = useRelativeTime(comment.created_at);
    const expertise = member?.uuid === comment.member?.uuid ? member?.expertise : comment.member?.expertise;
    const isReplyToReply = comment.in_reply_to_id && comment.in_reply_to_snippet;

    return (
        <>
            <div className={`mt-0.5 flex flex-wrap items-start sm:flex-row ${expertise ? 'flex-col' : 'flex-row'} ${isReplyToReply ? 'mb-0.5' : 'mb-2'} ${className}`}>
                <AuthorName comment={comment} />
                <div className="flex items-baseline pr-4 font-sans text-base leading-snug text-neutral-900/50 sm:text-sm dark:text-white/60">
                    <span>
                        <MemberExpertise comment={comment} />
                        <a
                            className="hover:underline"
                            href={buildCommentPermalink(pageUrl, comment.id)}
                            target="_parent"
                            title={formatExplicitTime(comment.created_at)}
                        >
                            <span className="mx-[0.3em]">·</span>{createdAtRelative}
                        </a>
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

const CommentBody: React.FC<CommentBodyProps> =