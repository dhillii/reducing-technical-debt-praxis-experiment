```typescript
import CoverImage from '../../../../assets/images/user-cover.jpg';
import LatestPosts1 from '../../../../assets/images/latest-posts-1.jpg';
import LatestPosts2 from '../../../../assets/images/latest-posts-2.jpg';
import LatestPosts3 from '../../../../assets/images/latest-posts-3.jpg';
import clsx from 'clsx';
import {GhostOrb, Icon} from '@tryghost/admin-x-design-system';
import {isManagedEmail} from '@tryghost/admin-x-framework/api/config';
import {useGlobalData} from '../../../providers/global-data-provider';

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

/** Determines font weight class based on weight value */
const getFontWeightClass = (weight?: string): string => {
    const weightMap: Record<string, string> = {
        'normal': 'font-normal',
        'medium': 'font-medium',
        'semibold': 'font-semibold',
        'bold': 'font-bold'
    };
    return weight && weight in weightMap ? weightMap[weight] : '';
};

/** Determines font family class based on category */
const getFontFamilyClass = (category?: string): string => {
    return category === 'serif' ? 'font-serif' : '';
};

/** Determines image corner radius class */
const getImageCornerClass = (corners?: string): string => {
    const cornerMap: Record<string, string> = {
        'square': 'rounded-none',
        'rounded': 'rounded-md'
    };
    return corners && corners in cornerMap ? cornerMap[corners] : '';
};

/** Determines divider style classes */
const getDividerStyleClasses = (style?: string): string => {
    if (style === 'dashed') return 'border-dashed';
    if (style === 'dotted') return 'border-b-2 border-dotted';
    return '';
};

/** Determines link style classes */
const getLinkStyleClasses = (style?: string): string => {
    const classes = [];
    if (style === 'underline') classes.push('underline');
    if (style === 'bold') classes.push('font-bold');
    return classes.join(' ');
};

/** Determines button corner radius class */
const getButtonCornerClass = (corners?: string): string => {
    const cornerMap: Record<string, string> = {
        'rounded': 'rounded-[6px]',
        'pill': 'rounded-full',
        'square': 'rounded-none'
    };
    return corners && corners in cornerMap ? cornerMap[corners] : '';
};

/** Builds excerpt classes based on font configuration and alignment */
const buildExcerptClasses = (
    titleFontCategory?: string,
    bodyFontCategory?: string,
    titleAlignment?: string
): string => {
    const baseClasses = 'mb-5 text-pretty leading-[1.7] text-black mb-8 leading-tight';
    
    const fontClasses = (() => {
        const isSerifTitle = titleFontCategory === 'serif';
        const isSerifBody = bodyFontCategory === 'serif';
        
        if (isSerifTitle && isSerifBody) {
            return 'font-serif text-[2.0rem]';
        }
        if (!isSerifTitle && isSerifBody) {
            return 'text-[1.7rem] tracking-tight';
        }
        if (isSerifTitle && !isSerifBody) {
            return 'font-serif text-[2.0rem]';
        }
        return 'text-[1.9rem] tracking-tight';
    })();

    const alignmentClass = titleAlignment === 'center' ? 'text-center' : '';
    
    return clsx(baseClasses, fontClasses, alignmentClass);
};

/** Renders email header based on managed email configuration */
const renderEmailHeader = (
    isManagedEmailConfig: boolean,
    senderName?: string,
    senderEmail?: string | null,
    senderReplyTo?: string | null
): JSX.Element => {
    if (isManagedEmailConfig) {
        return (
            <>
                <p className="leading-normal">
                    <span className="font-semibold text-grey-900">From: </span>
                    <span>{senderName} ({senderEmail})</span>
                </p>
                <p className="leading-normal">
                    <span className="font-semibold text-grey-900">Reply-to: </span>
                    {senderReplyTo ? senderReplyTo : senderEmail}
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

/** Renders post title section with metadata */
const PostTitleSection: React.FC<{
    showPostTitleSection: boolean;
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
    excerptClasses: string;
}> = ({
    showPostTitleSection,
    showExcerpt,
    titleAlignment,
    titleFontCategory,
    titleFontWeight,
    bodyFontCategory,
    authorPlaceholder,
    postTitleColor,
    headerTextColor,
    secondaryHeaderTextColor,
    currentDate,
    excerptClasses
}) => {
    if (!showPostTitleSection) return null;

    return (
        <div className={clsx('flex flex-col py-8', titleAlignment === 'center' ? 'items-center' : 'items-start')}>
            <h2 className={clsx(
                'text-4xl font-bold leading-supertight text-black',
                getFontFamilyClass(titleFontCategory),
                getFontWeightClass(titleFontWeight),
                titleAlignment === 'center' ? 'text-center' : 'text-left',
                showExcerpt ? 'mb-2' : 'mb-8'
            )} style={{color: postTitleColor}}>Your email newsletter</h2>
            {showExcerpt && (
                <p className={excerptClasses} style={{color: headerTextColor}}>
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
};

/** Renders feature image with caption */
const FeatureImageSection: React.FC<{
    showFeatureImage: boolean;
    showPostTitleSection: boolean;
    imageCorners?: string;
    secondaryHeaderTextColor?: string;
}> = ({showFeatureImage, showPostTitleSection, imageCorners, secondaryHeaderTextColor}) => {
    if (!showFeatureImage) return null;

    return (
        <>
            <div className={clsx(
                'h-[unset] w-full max-w-[600px] bg-cover bg-no-repeat',
                showPostTitleSection ? '' : 'pt-6'
            )}>
                <img alt="Feature" className={clsx(
                    'min-h-full min-w-full shrink-0',
                    getImageCornerClass(imageCorners)
                )} src={CoverImage} />
            </div>
            <div className="mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700" style={{color: secondaryHeaderTextColor}}>
                Feature image caption
            </div>
        </>
    );
};

/** Renders header section with icon, title, and subtitle */
const HeaderSection: React.FC<{
    showHeader: boolean;
    headerIcon?: string;
    headerTitle?: string | null;
    headerSubtitle?: string | null;
    headerTextColor?: string;
    secondaryHeaderTextColor?: string;
}> = ({showHeader, headerIcon, headerTitle, headerSubtitle, headerTextColor, secondaryHeaderTextColor}) => {
    if (!showHeader) return null;

    return (
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
    );
};

/** Renders feedback and comment CTA buttons */
const FeedbackSection: React.FC<{
    showFeedback: boolean;
    showCommentCta: boolean;
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
}> = ({showFeedback, showCommentCta, dividerStyle, dividerColor, textColor}) => {
    if (!showFeedback && !showCommentCta) return null;

    return (
        <div className={clsx('grid gap-5 border-b border-grey-200 px-6 py-5', getDividerStyleClasses(dividerStyle))} style={{borderColor: dividerColor}}>
            <div className="flex justify-center gap-3">
                {showFeedback && (
                    <>
                        <button className="pointer-events-none cursor-default whitespace-nowrap rounded-[2.2rem] bg-transparent font-semibold" type="button">
                            <span className="inline-flex items-center gap-2 px-[18px] py-[7px]" style={{color: textColor}}>
                                <Icon colorClass='' name="thumbs-up" size="md" />
                                <span>More like this</span>
                            </span>
                        </button>
                        <button className="pointer-events-none cursor-default whitespace-nowrap rounded-[2.2rem] bg-transparent font-semibold" type="button">
                            <span className="inline-flex items-center gap-2 px-[18px] py-[7px]" style={{color: textColor}}>
                                <Icon colorClass='' name="thumbs-down" />
                                <span>Less like this</span>
                            </span>
                        </button>
                    </>
                )}
                {showCommentCta && (
                    <button className="pointer-events-none cursor-default whitespace-nowrap rounded-[2.2rem] bg-transparent font-semibold" type="button">
                        <span className="inline-flex items-center gap-2 px-[18px] py-[7px]" style={{color: textColor}}>
                            <Icon colorClass='' name="comment" />
                            <span>Comment</span>
                        </span>
                    </button>
                )}
            </div>
        </div>
    );
};

/** Renders latest posts section */
const LatestPostsSection: React.FC<{
    showLatestPosts: boolean;
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    secondaryTextColor?: string;
    titleFontCategory?: string;
    titleFontWeight?: string;
    imageCorners?: string;
}> = ({
    showLatestPosts,
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    secondaryTextColor,
    titleFontCategory,
    titleFontWeight,
    imageCorners
}) => {
    if (!showLatestPosts) return null;

    const latestPostsData = [
        {image: LatestPosts1, title: 'The three latest posts published on your site', description: 'Posts sent as an email only will never be shown here.'},
        {image: LatestPosts2, title: 'Displayed at the bottom of each newsletter', description: 'Giving your readers one more place to discover your stories.'},
        {image: LatestPosts3, title: 'To keep your work front and center', description: 'Making sure that your audience stays engaged.'}
    ];

    return (
        <div className={clsx('border-b border-grey-200 py-6', getDividerStyleClasses(dividerStyle))} style={{borderColor: dividerColor}}>
            <h3 className="mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black" style={{color: textColor}}>
                Keep reading
            </h3>
            {latestPostsData.map((post, index) => (
                <div key={index} className="flex justify-between gap-4 py-2">
                    <div>
                        <h4 className={clsx(
                            'mt-0.5 text-[1.9rem] text-black',
                            getFontFamilyClass(titleFontCategory),
                            getFontWeightClass(titleFontWeight)
                        )} style={{color: sectionTitleColor}}>
                            {post.title}
                        </h4>
                        <p className="m-0 text-base text-grey