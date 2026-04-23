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

/* ---------- Helper predicates & utilities ---------- */

/**
 * Returns true if the comment has at least one reply.
 */
function hasReplies(comment: Comment): boolean {
    return !!comment.replies?.length;
}

/**
 * Returns true if the comment status equals the provided status.
 */
function isStatus(comment: Comment, status: Comment['status']): boolean {
    return comment.status === status;
}

/**
 * Returns the not‑published message for a comment based on its status.
 */
function getNotPublishedMessage(comment: Comment, t: (key: string) => string): string {
    if (isStatus(comment, 'hidden')) {
        return t('This comment has been hidden.');
    }
    if (isStatus(comment, 'deleted')) {
        return t('This comment has been removed.');
    }
    return '';
}

/**
 * Returns the member expertise if the current user is the comment author,
 * otherwise the comment author’s expertise.
 */
function resolveMemberExpertise(currentMember: Comment['member'] | null, comment: Comment): string | undefined {
    return currentMember?.uuid === comment.member?.uuid
        ? currentMember?.expertise
        : comment.member?.expertise;
}

/**
 * Returns true when the comment should be displayed with reduced opacity.
 */
function isHiddenForAdmin(comment: Comment, isAdmin: boolean): boolean {
    return isAdmin && isStatus(comment, 'hidden');
}

/**
 * Returns true when the comment is editable (i.e., an edit form is open for it).
 */
function isInEditMode(openForms: OpenCommentForm[], commentId: string): boolean {
    return !!openForms.find(f => f.id === commentId && f.type === 'edit');
}

/**
 * Returns the reply form that matches the given comment (or its parent).
 */
function findReplyForm(openForms: OpenCommentForm[], commentId: string): OpenCommentForm | undefined {
    return openForms.find(f => (f.id === commentId || f.parent_id === commentId) && f.type === 'reply');
}

/**
 * Returns true when a reply form should be displayed inside the comment.
 */
function shouldDisplayReplyForm(form?: OpenCommentForm, commentId?: string): boolean {
    return !!form && (!form.parent_id || form.parent_id === commentId);
}

/**
 * Returns true when the reply button should be highlighted for the given comment.
 */
function shouldHighlightReplyButton(form?: OpenCommentForm, commentId?: string): boolean {
    return !!form && form.id === commentId;
}

/* ---------- Component implementations ---------- */

type AnimatedCommentProps = {
    comment: Comment;
    parent?: Comment;
};

const AnimatedComment: React.FC<AnimatedCommentProps> = ({comment, parent}) => {
    const {commentsIsLoading} = useAppContext();

    return (
        <Transition
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

const useCommentVisibility = (comment: Comment, admin: boolean) => {
    const deleted = isStatus(comment, 'deleted');
    const hidden = isStatus(comment, 'hidden');
    const replies = hasReplies(comment);

    return {
        showDeletedMessage: deleted && replies,
        showHiddenMessage: replies && hidden && !admin,
        showCommentContent: !deleted && (admin || isStatus(comment, 'published'))
    };
};

type PublishedCommentProps = CommentProps & {
    openEditMode: () => void;
};

const PublishedComment: React.FC<PublishedCommentProps> = ({comment, parent, openEditMode}) => {
    const {dispatchAction, openCommentForms, isAdmin, commentIdToHighlight} = useAppContext();

    const hiddenClass = isHiddenForAdmin(comment, isAdmin) ? 'opacity-30' : '';
    const editForm = openCommentForms.find(f => f.id === comment.id && f.type === 'edit');
    const inEditMode = !!editForm;

    const replyForm = findReplyForm(openCommentForms, comment.id);
    const displayReplyForm = shouldDisplayReplyForm(replyForm, comment.id);
    const highlightReplyButton = shouldHighlightReplyButton(replyForm, comment.id);

    const openReplyForm = useCallback(async () => {
        if (replyForm && replyForm.id === comment.id) {
            await dispatchAction('closeCommentForm', replyForm.id);
            return;
        }

        const inReplyToDetails: Partial<OpenCommentForm> = {};

        if (parent) {
            inReplyToDetails.in_reply_to_id = comment.id;
            inReplyToDetails.in_reply_to_snippet = getCommentInReplyToSnippet(comment);
        }

        const newForm: OpenCommentForm = {
            id: comment.id,
            parent_id: parent?.id,
            type: 'reply',
            hasUnsavedChanges: false,
            ...inReplyToDetails
        };

        await dispatchAction('openCommentForm', newForm);
    }, [comment.id, parent, replyForm, dispatchAction]);

    const hasAnyReplies = displayReplyForm || hasReplies(comment);
    const avatar = <Avatar member={comment.member} />;

    return (
        <CommentLayout avatar={avatar} className={hiddenClass} hasReplies={hasAnyReplies} memberUuid={comment.member?.uuid}>
            <div>
                {inEditMode ? (
                    <>
                        <CommentHeader className={hiddenClass} comment={comment} />
                        <EditForm comment={comment} openForm={editForm!} parent={parent} />
                    </>
                ) : (
                    <>
                        <CommentHeader className={hiddenClass} comment={comment} />
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
            {displayReplyForm && <ReplyFormBox comment={comment} openForm={replyForm!} />}
        </CommentLayout>
    );
};

type UnpublishedCommentProps = {
    comment: Comment;
    openEditMode: () => void;
};

const UnpublishedComment: React.FC<UnpublishedCommentProps> = ({comment, openEditMode}) => {
    const {isAdmin, openCommentForms, t} = useAppContext();

    const avatar = isAdmin && comment.status !== 'deleted' ? <Avatar member={comment.member} /> : <BlankAvatar />;
    const notPublishedMessage = getNotPublishedMessage(comment, t);
    const replyForm = findReplyForm(openCommentForms, comment.id);
    const displayReplyForm = shouldDisplayReplyForm(replyForm, comment.id);
    const showMoreButton = isAdmin && isStatus(comment, 'hidden');

    return (
        <CommentLayout avatar={avatar} hasReplies={hasReplies(comment)}>
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
            {displayReplyForm && <ReplyFormBox comment={comment} openForm={replyForm!} />}
        </CommentLayout>
    );
};

/* ---------- Helper components ---------- */

const MemberExpertise: React.FC<{comment: Comment}> = ({comment}) => {
    const {member} = useAppContext();
    const expertise = resolveMemberExpertise(member, comment);
    if (!expertise) return null;
    return (
        <span className="[overflow-wrap:anywhere]">
            <span className="mx-[0.3em] hidden sm:inline-block">·</span>
            {expertise}
        </span>
    );
};

const EditedInfo: React.FC<{comment: Comment}> = ({comment}) => {
    const {t} = useAppContext();
    return comment.edited_at ? <span>&nbsp;({t('edited')})</span> : null;
};

const RepliesContainer: React.FC<RepliesProps & {className?: string}> = ({comment, className = ''}) => {
    if (!hasReplies(comment)) return null;
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

const ReplyFormBox: React.FC<ReplyFormBoxProps> = ({comment, openForm}) => (
    <div className="my-8 sm:my-10">
        <ReplyForm openForm={openForm} parent={comment} />
    </div>
);

/* ---------- Published comment components ---------- */

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
    const isPublished = inReplyToComment?.status === 'published';
    const snippet = !inReplyToComment || !isPublished ? `[${t('removed')}]` : comment.in_reply_to_snippet;

    const className = 'font-medium text-neutral-900/60 break-all transition-colors dark:text-white/70';
    const linkClassName = `${className} hover:text-neutral-900/75 dark:hover:text-white/85`;

    return isPublished ? (
        <a
            className={linkClassName}
            data-testid="comment-in-reply-to"
            href={buildCommentPermalink(pageUrl, comment.in_reply_to_id!)}
            target="_parent"
        >
            {snippet}
        </a>
    ) : (
        <span className={className} data-testid="comment-in-reply-to">
            {snippet}
        </span>
    );
};

type CommentHeaderProps = {
    comment: Comment;
    className?: string;
};

const CommentHeader: React.FC<CommentHeaderProps> = ({comment, className = ''}) => {
    const {member, t, pageUrl} = useAppContext();
    const createdAtRelative = useRelativeTime(comment.created_at);
    const memberExpertise = resolveMemberExpertise(member, comment);
    const isReplyToReply = !!comment.in_reply_to_id && !!comment.in_reply_to_snippet;

    const timestampElement = (
        <a
            className="hover:underline"
            href={buildCommentPermalink(pageUrl, comment.id)}
            target="_parent"
            title={formatExplicitTime(comment.created_at)}
        >
            <span className="mx-[0.3em]">·</span>
            {createdAtRelative}
        </a>
    );

    return (
        <>
            <div
                className={`mt-0.5 flex flex-wrap items-start sm:flex-row ${
                    memberExpertise ? 'flex-col' : 'flex-row'
                } ${isReplyToReply ? 'mb-0.5' : 'mb-2'} ${className}`}
            >
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
    const highlightedHtml = isHighlighted ? (() => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        doc.querySelectorAll('p').forEach(p => {
            const mark = doc.createElement('mark');
            mark.className =
                'animate-[highlight_2.5s_ease-out] [animation-delay:1s] bg-yellow-300/40 -my-0.5 py-0.5 dark:text-white/85 dark:bg-yellow-500/40';
            while (p.firstChild) {
                mark.appendChild(p.firstChild);
            }
            p.appendChild(mark);
        });
        return doc.body.innerHTML;
    })() : html;

    return (
        <div className={`mt mb-2 flex flex-row items-center gap-4 pr-4 ${className}`}>
            <div
                dangerouslySetInnerHTML={{__html: highlightedHtml}}
                className="gh-comment-content text-md -mx-1 text-pretty rounded-md px-1 font-sans leading-normal text-neutral-900 [overflow-wrap:anywhere] sm:text-lg dark:text-white/85"
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
    const shouldShowMore = isAdmin || (isMember && isPublished);
    const shouldHideMore = isCommentingDisabled && isOwnComment;
    const showMoreButton = shouldShowMore && !shouldHideMore;

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

    return (
        <div className={`flex items-center gap-4 ${className}`}>
            {showLikeButton ? (
                <LikeButton comment={comment} />
            ) : (
                <LikeCount count={comment.count.likes} liked={comment.liked} />
            )}
            {showReplyButton && (
                <ReplyButton isReplying={highlightReplyButton} openReplyForm={openReplyForm} />
            )}
            {showMoreButton && <MoreButton comment={comment} toggleEdit={openEditMode} />}
        </div>
    );
};

/* ---------- Layout ---------- */

const RepliesLine: React.FC<{hasReplies: boolean}> = ({hasReplies}) =>
    hasReplies ? (
        <div
            className="mb-2 h-full w-px grow rounded bg-gradient-to-b from-neutral-900/15 from-70% to-transparent dark:from-white/20 dark:from-70%"
            data-testid="replies-line"
        />
    ) : null;

type CommentLayoutProps = {
    children: React.ReactNode;
    avatar: React.ReactNode;
    hasReplies: boolean;
    className?: string;
    memberUuid?: string;
};

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

/* ---------- Default export ---------- */

export default AnimatedComment;