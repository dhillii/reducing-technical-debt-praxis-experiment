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
type ReplyFormBoxProps = {comment: Comment; openForm: OpenCommentForm};

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

const getNotPublishedMessage = (comment: Comment, t: (s: string) => string) => {
    if (comment.status === 'hidden') {
        return t('This comment has been hidden.');
    }
    if (comment.status === 'deleted') {
        return t('This comment has been removed.');
    }
    return '';
};

const highlightHtml = (html: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const markClass =
        'animate-[highlight_2.5s_ease-out] [animation-delay:1s] bg-yellow-300/40 -my-0.5 py-0.5 dark:text-white/85 dark:bg-yellow-500/40';

    doc.querySelectorAll('p').forEach((p) => {
        const mark = doc.createElement('mark');
        mark.className = markClass;
        while (p.firstChild) {
            mark.appendChild(p.firstChild);
        }
        p.appendChild(mark);
    });

    return doc.body.innerHTML;
};

// ─── Small UI Components ──────────────────────────────────────────────────────

const MemberExpertise: React.FC<{comment: Comment}> = ({comment}) => {
    const {member} = useAppContext();
    const expertise =
        member && comment.member?.uuid === member.uuid
            ? member.expertise
            : comment.member?.expertise;

    if (!expertise) {
        return null;
    }

    return (
        <span className="[overflow-wrap:anywhere]">
            <span className="mx-[0.3em] hidden sm:inline-block">·</span>
            {expertise}
        </span>
    );
};

const EditedInfo: React.FC<{comment: Comment}> = ({comment}) => {
    const {t} = useAppContext();

    if (!comment.edited_at) {
        return null;
    }

    return <span>&nbsp;({t('edited')})</span>;
};

const RepliesLine: React.FC<{hasReplies: boolean}> = ({hasReplies}) => {
    if (!hasReplies) {
        return null;
    }

    return (
        <div
            className="mb-2 h-full w-px grow rounded bg-gradient-to-b from-neutral-900/15 from-70% to-transparent dark:from-white/20 dark:from-70%"
            data-testid="replies-line"
        />
    );
};

const AuthorName: React.FC<{comment: Comment}> = ({comment}) => {
    const {t} = useAppContext();
    const name = getMemberNameFromComment(comment, t);

    return (
        <h4 className="font-sans text-base font-bold leading-snug text-neutral-900 sm:text-sm dark:text-white/85">
            {name}
        </h4>
    );
};

// ─── Reply / Replies Containers ───────────────────────────────────────────────

const RepliesContainer: React.FC<RepliesProps & {className?: string}> = ({comment, className = ''}) => {
    if (!comment.replies?.length) {
        return null;
    }

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

// ─── Comment Header ───────────────────────────────────────────────────────────

export const RepliedToSnippet: React.FC<{comment: Comment}> = ({comment}) => {
    const {comments, t, pageUrl} = useAppContext();
    const inReplyToComment = findCommentById(comments, comment.in_reply_to_id);

    const isAvailable = inReplyToComment?.status === 'published';
    const snippet = isAvailable ? comment.in_reply_to_snippet : `[${t('removed')}]`;

    const baseClass = 'font-medium text-neutral-900/60 break-all transition-colors dark:text-white/70';

    if (!isAvailable) {
        return (
            <span className={baseClass} data-testid="comment-in-reply-to">
                {snippet}
            </span>
        );
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

    const memberExpertise =
        member && comment.member?.uuid === member.uuid
            ? member.expertise
            : comment.member?.expertise;
    const isReplyToReply = comment.in_reply_to_id && comment.in_reply_to_snippet;

    return (
        <>
            <div
                className={`mt-0.5 flex flex-wrap items-start sm:flex-row ${memberExpertise ? 'flex-col' : 'flex-row'} ${isReplyToReply ? 'mb-0.5' : 'mb-2'} ${className}`}
            >
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
                            <span className="mx-[0.3em]">·</span>
                            {createdAtRelative}
                        </a>
                        <EditedInfo comment={comment} />
                    </span>
                </div>
            </div>
            {isReplyToReply && (
                <div className="mb-2 line-clamp-1 font-sans text-base leading-snug text-neutral-900/50 sm:text-sm dark:text-white/60">
                    <span>{t('Replied to')}</span>:&nbsp;
                    <RepliedToSnippet comment={comment} />
                </div>
            )}
        </>
    );
};

// ─── Comment Body ─────────────────────────────────────────────────────────────

const CommentBody: React.FC<CommentBodyProps> = ({html, className = '', isHighlighted}) => {
    const commentHtml = isHighlighted ? highlightHtml(html) : html;

    return (
        <div className={`mt mb-2 flex flex-row items-center gap-4 pr-4 ${className}`}>
            <div
                className="gh-comment-content text-md -mx-1 text-pretty rounded-md px-1 font-sans leading-normal text-neutral-900 [overflow-wrap:anywhere] sm:text-lg dark:text-white/85"
                dangerouslySetInnerHTML={{__html: commentHtml}}
                data-testid="comment-content"
            />
        </div>
    );
};

// ─── Comment Menu ─────────────────────────────────────────────────────────────

const CommentMenu: React.FC<CommentMenuProps> = ({
    comment,
    openReplyForm,
    highlightReplyButton,
    openEditMode,
    className = ''
}) => {
    const {member, t, isMember, isAdmin, isCommentingDisabled} = useAppContext();

    const isPublished = comment.status === 'published';
    const isOwnComment = member && comment.member?.uuid === member?.uuid;

    if (isAdmin && comment.status === 'hidden') {
        return (
            <div className={`flex items-center gap-4 ${className}`}>
                <span className="font-sans text-base leading-snug text-red-600 sm:text-sm">
                    {t('Hidden for members')}
                </span>
                <MoreButton comment={comment} toggleEdit={openEditMode} />
            </div>
        );
    }

    const showMoreButton =
        (isAdmin || (isMember && isPublished)) &&
        !(isCommentingDisabled && isOwnComment);

    return (
        <div className={`flex items-center gap-4 ${className}`}>
            {!isCommentingDisabled
                ? <LikeButton comment={comment} />
                : <LikeCount count={comment.count.likes} liked={comment.liked} />
            }
            {!isCommentingDisabled && (
                <ReplyButton isReplying={highlightReplyButton} openReplyForm={openReplyForm} />
            )}
            {showMoreButton && <MoreButton comment={comment} toggleEdit={openEditMode} />}
        </div>
    );
};

// ─── Layout ───────────────────────────────────────────────────────────────────

const CommentLayout: React.FC<CommentLayoutProps> = ({
    children,
    avatar,
    hasReplies,
    className = '',
    memberUuid = ''
}) => (
    <div
        className={`flex w-full flex-row ${hasReplies ? 'mb-0' : 'mb-7'}`}
        data-member-uuid={memberUuid}
        data-testid="comment-component"
    >
        <div className="mr-2 flex flex-col items-center justify-start sm:mr-3">
            <div className={`flex-0 mb-3 sm:mb-4 ${className}`}>{avatar}</div>
            <RepliesLine hasReplies={hasReplies} />
        </div>
        <div className="grow">{children}</div>
    </div>
);

// ─── Published Comment ────────────────────────────────────────────────────────

const PublishedComment: React.FC<PublishedCommentProps> = ({comment, parent, openEditMode}) => {
    const {openCommentForms, isAdmin, commentIdToHighlight} = useAppContext();

    const isHidden = isAdmin && comment.status === 'hidden';
    const hiddenClass = isHidden ? 'opacity-30' : '';

    const editForm = openCommentForms.find(f => f.id === comment.id && f.type === 'edit');
    const isInEditMode = !!editForm;

    const {openForm, displayReplyForm, highlightReplyButton} = useReplyFormState(comment);
    const openReplyForm = useOpenReplyForm(comment, parent, openForm);