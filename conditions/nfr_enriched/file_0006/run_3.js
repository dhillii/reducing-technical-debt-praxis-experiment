```tsx
import CoverImage from '../../../../assets/images/user-cover.jpg';
import LatestPosts1 from '../../../../assets/images/latest-posts-1.jpg';
import LatestPosts2 from '../../../../assets/images/latest-posts-2.jpg';
import LatestPosts3 from '../../../../assets/images/latest-posts-3.jpg';
import clsx from 'clsx';
import {GhostOrb, Icon} from '@tryghost/admin-x-design-system';
import {isManagedEmail} from '@tryghost/admin-x-framework/api/config';
import {useGlobalData} from '../../../providers/global-data-provider';

// ─── Types ───────────────────────────────────────────────────────────────────

interface NewsletterPreviewContentProps {
    senderName?: string;
    senderEmail: string | null;
    senderReplyTo: string | null;
    headerImage?: string | null;
    headerIcon?: string;
    headerTitle?: string | null;
    headerSubtitle?: string | null;
    showPostTitleSection: boolean;
    showExcerpt: boolean;
    titleAlignment?: string;
    titleFontCategory?: string;
    titleFontWeight?: string;
    bodyFontCategory?: string;
    authorPlaceholder?: string;
    showCommentCta: boolean;
    showFeatureImage: boolean;
    showFeedback: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string | null;
    showBadge?: boolean;
    backgroundColor?: string;
    headerBackgroundColor?: string;
    accentColor?: string;
    textColor?: string;
    secondaryTextColor?: string;
    headerTextColor?: string;
    secondaryHeaderTextColor?: string;
    postTitleColor?: string;
    sectionTitleColor?: string;
    dividerColor?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    linkColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    imageCorners?: string;
    linkStyle?: string;
    dividerStyle?: string;
}

interface StyleProps {
    accentColor?: string;
    textColor?: string;
    secondaryTextColor?: string;
    headerTextColor?: string;
    secondaryHeaderTextColor?: string;
    postTitleColor?: string;
    sectionTitleColor?: string;
    dividerColor?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    linkColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    imageCorners?: string;
    linkStyle?: string;
    dividerStyle?: string;
    titleFontCategory?: string;
    titleFontWeight?: string;
    bodyFontCategory?: string;
    titleAlignment?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDate = (date: Date) =>
    date.toLocaleDateString('default', {year: 'numeric', month: 'short', day: 'numeric'});

const processFooterContent = (content?: string | null) =>
    content ? content.replace(/<a/g, '<a target="_blank" rel="noopener noreferrer"') : '';

const getTitleFontClasses = (titleFontCategory?: string, titleFontWeight?: string) =>
    clsx(
        titleFontCategory === 'serif' && 'font-serif',
        titleFontCategory === 'sans_serif' && 'font-sans',
        titleFontWeight === 'normal' && 'font-normal',
        titleFontWeight === 'medium' && 'font-medium',
        titleFontWeight === 'semibold' && 'font-semibold',
        titleFontWeight === 'bold' && 'font-bold'
    );

const getDividerClasses = (dividerStyle?: string) =>
    clsx(
        'border-b border-grey-200',
        dividerStyle === 'dashed' && 'border-dashed',
        dividerStyle === 'dotted' && 'border-b-2 border-dotted'
    );

const getImageCornerClasses = (imageCorners?: string) =>
    clsx(
        imageCorners === 'square' && 'rounded-none',
        imageCorners === 'rounded' && 'rounded-md'
    );

const getExcerptClasses = (titleFontCategory?: string, bodyFontCategory?: string, titleAlignment?: string) => {
    const isSerifBody = bodyFontCategory === 'serif';
    const isSerifTitle = titleFontCategory === 'serif';

    const sizeClasses = isSerifBody
        ? 'mb-8 font-serif text-[2.0rem] leading-tight'
        : isSerifTitle
            ? 'mb-8 font-serif text-[2.0rem] leading-tight'
            : 'mb-8 text-[1.9rem] leading-tight tracking-tight';

    return clsx(
        'mb-5 text-pretty leading-[1.7] text-black',
        sizeClasses,
        titleAlignment === 'center' && 'text-center'
    );
};

const getButtonStyles = (buttonStyle?: string, buttonColor?: string, accentColor?: string, buttonTextColor?: string) =>
    buttonStyle === 'outline'
        ? {borderColor: buttonColor || accentColor, color: buttonColor || accentColor}
        : {backgroundColor: buttonColor || accentColor, color: buttonTextColor};

// ─── Sub-components ───────────────────────────────────────────────────────────

const EmailHeader: React.FC<{
    senderName?: string;
    senderEmail: string | null;
    senderReplyTo: string | null;
    isManagedEmailConfig: boolean;
}> = ({senderName, senderEmail, senderReplyTo, isManagedEmailConfig}) => {
    if (isManagedEmailConfig) {
        return (
            <>
                <p className="leading-normal">
                    <span className="font-semibold text-grey-900">From: </span>
                    <span>{senderName} ({senderEmail})</span>
                </p>
                <p className="leading-normal">
                    <span className="font-semibold text-grey-900">Reply-to: </span>
                    {senderReplyTo || senderEmail}
                </p>
            </>
        );
    }

    return (
        <>
            <p className="leading-normal">
                <span className="font-semibold text-grey-900">{senderName}</span>
                <span> {senderEmail}</span>
            </p>
            <p className="leading-normal">
                <span className="font-semibold text-grey-900">To:</span> Jamie Larson jamie@example.com
            </p>
        </>
    );
};

const NewsletterHeader: React.FC<{
    headerImage?: string | null;
    headerIcon?: string;
    headerTitle?: string | null;
    headerSubtitle?: string | null;
    headerBackgroundColor?: string;
    headerTextColor?: string;
    secondaryHeaderTextColor?: string;
}> = ({headerImage, headerIcon, headerTitle, headerSubtitle, headerBackgroundColor, headerTextColor, secondaryHeaderTextColor}) => {
    const showHeader = headerIcon || headerTitle;

    return (
        <div className="px-[7rem]" style={{backgroundColor: headerBackgroundColor}}>
            {headerImage && (
                <div>
                    <img alt="" className="mb-4 block pt-6" src={headerImage} />
                </div>
            )}
            {showHeader && (
                <div className="py-3">
                    {headerIcon && <img alt="" className="mx-auto mb-2 size-10" role="presentation" src={headerIcon} />}
                    {headerTitle && (
                        <h4 className="mb-1 text-center text-[1.6rem] font-bold uppercase leading-tight tracking-tight text-grey-900" style={{color: headerTextColor}}>
                            {headerTitle}
                        </h4>
                    )}
                    {headerSubtitle && (
                        <h5 className="mb-1 text-center text-[1.3rem] font-normal text-grey-700" style={{color: secondaryHeaderTextColor}}>
                            {headerSubtitle}
                        </h5>
                    )}
                </div>
            )}
        </div>
    );
};

const PostTitleSection: React.FC<{
    showExcerpt: boolean;
    titleAlignment?: string;
    titleFontCategory?: string;
    titleFontWeight?: string;
    bodyFontCategory?: string;
    authorPlaceholder?: string;
    postTitleColor?: string;
    headerTextColor?: string;
    secondaryHeaderTextColor?: string;
    currentDate: string;
}> = ({showExcerpt, titleAlignment, titleFontCategory, titleFontWeight, bodyFontCategory, authorPlaceholder, postTitleColor, headerTextColor, secondaryHeaderTextColor, currentDate}) => (
    <div className={clsx('flex flex-col py-8', titleAlignment === 'center' ? 'items-center' : 'items-start')}>
        <h2
            className={clsx(
                'text-4xl font-bold leading-supertight text-black',
                getTitleFontClasses(titleFontCategory, titleFontWeight),
                titleAlignment === 'center' ? 'text-center' : 'text-left',
                showExcerpt ? 'mb-2' : 'mb-8'
            )}
            style={{color: postTitleColor}}
        >
            Your email newsletter
        </h2>
        {showExcerpt && (
            <p className={getExcerptClasses(titleFontCategory, bodyFontCategory, titleAlignment)} style={{color: headerTextColor}}>
                A subtitle to highlight key points and engage your readers.
            </p>
        )}
        <div className={clsx(
            'flex w-full justify-between text-center text-md leading-none text-grey-700',
            titleAlignment === 'center' ? 'flex-col gap-1' : 'flex-row'
        )}>
            <p className="pb-1 text-[1.3rem]" style={{color: secondaryHeaderTextColor}}>
                By {authorPlaceholder}
                <span className="before:pl-0.5 before:pr-1 before:content-['•']">{currentDate}</span>
            </p>
            <p className="pb-1 text-[1.3rem] underline" style={{color: secondaryHeaderTextColor}}>
                <span>View in browser</span>
            </p>
        </div>
    </div>
);

const FeatureImage: React.FC<{
    showPostTitleSection: boolean;
    imageCorners?: string;
    secondaryHeaderTextColor?: string;
}> = ({showPostTitleSection, imageCorners, secondaryHeaderTextColor}) => (
    <>
        <div className={clsx('h-[unset] w-full max-w-[600px] bg-cover bg-no-repeat', !showPostTitleSection && 'pt-6')}>
            <img
                alt="Feature"
                className={clsx('min-h-full min-w-full shrink-0', getImageCornerClasses(imageCorners))}
                src={CoverImage}
            />
        </div>
        <div className="mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700" style={{color: secondaryHeaderTextColor}}>
            Feature image caption
        </div>
    </>
);

const FeedbackButton: React.FC<{icon: string; label: string; textColor?: string}> = ({icon, label, textColor}) => (
    <button className="pointer-events-none cursor-default whitespace-nowrap rounded-[2.2rem] bg-transparent font-semibold" type="button">
        <span className="inline-flex items-center gap-2 px-[18px] py-[7px]" style={{color: textColor}}>
            <Icon colorClass='' name={icon} size="md" />
            <span>{label}</span>
        </span>
    </button>
);

const FeedbackSection: React.FC<{
    showFeedback: boolean;
    showCommentCta: boolean;
    textColor?: string;
    dividerStyle?: string;
    dividerColor?: string;
}> = ({showFeedback, showCommentCta, textColor, dividerStyle, dividerColor}) => (
    <div className={clsx('grid gap-5 px-6 py-5', getDividerClasses(dividerStyle))} style={{borderColor: dividerColor}}>
        <div className="flex justify-center gap-3">
            {showFeedback && (
                <>
                    <FeedbackButton icon="thumbs-up" label="More like this" textColor={textColor} />
                    <FeedbackButton icon="thumbs-down" label="Less like this" textColor={textColor} />
                </>
            )}
            {showCommentCta && <FeedbackButton icon="comment" label="Comment" textColor={textColor} />}
        </div>
    </div>
);

const LATEST_POSTS_DATA = [
    {
        title: 'The three latest posts published on your site',
        description: 'Posts sent as an email only will never be shown here.',
        image: LatestPosts1
    },
    {
        title: 'Displayed at the bottom of each newsletter',
        description: 'Giving your readers one more place to discover your stories.',
        image: LatestPosts2
    },
    {
        title: 'To keep your work front and center',
        description: 'Making sure that your audience stays engaged.',
        image: LatestPosts3
    }
];

const LatestPostItem: React.FC<{
    title: string;
    description: string;
    image: string;
    titleFontCategory?: string;
    titleFontWeight?: string;
    imageCorners?: string;
    sectionTitleColor?: string;
    secondaryTextColor?: string;
}> = ({title, description, image, titleFontCategory, titleFontWeight, imageCorners, sectionTitleColor, secondaryTextColor}) => (
    <div className="flex justify-between gap-4 py-2">
        <div>
            <h4
                className={clsx('mt-0.5 text-[1.9rem] text-black', getTitleFontClasses(titleFontCategory, titleFontWeight))}
                style={{color: sectionTitleColor}}
            >
                {title}
            </h4>
            <p className="m-0 text-base text-grey-700" style={{color: secondaryTextColor}}>{description}</p>
        </div>
        <div className="aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat">
            <img alt="Latest post" className={getImageCornerClasses(imageCorners)} src={image} />
        </div>
    </div>
);

const LatestPostsSection: React.FC<{
    textColor?: string;
    sectionTitleColor?: string;
    secondaryTextColor?: string;
    dividerStyle?: string;
    dividerColor?: string;
    titleFontCategory?: string;
    titleFontWeight?: string;
    imageCorners?: string;
}> = ({textColor, sectionTitleColor, secondaryTextColor, dividerStyle, dividerColor, titleFontCategory, titleFontWeight, imageCorners}) => (
    <div className={clsx('py-6', getDividerClasses(dividerStyle))} style={{borderColor: dividerColor}}>
        <h3 className="mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black" style={{