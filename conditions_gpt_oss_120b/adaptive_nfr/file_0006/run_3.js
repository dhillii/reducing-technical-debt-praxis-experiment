import CoverImage from '../../../../assets/images/user-cover.jpg';
import LatestPosts1 from '../../../../assets/images/latest-posts-1.jpg';
import LatestPosts2 from '../../../../assets/images/latest-posts-2.jpg';
import LatestPosts3 from '../../../../assets/images/latest-posts-3.jpg';
import clsx from 'clsx';
import {GhostOrb, Icon} from '@tryghost/admin-x-design-system';
import {isManagedEmail} from '@tryghost/admin-x-framework/api/config';
import {useGlobalData} from '../../../providers/global-data-provider';
import React from 'react';

/**
 * Returns the email header JSX based on the configuration type.
 */
function getEmailHeader(isManaged: boolean, senderName?: string, senderEmail?: string | null, senderReplyTo?: string | null) {
    if (isManaged) {
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
}

/**
 * Builds the class string for the excerpt paragraph.
 */
function buildExcerptClasses(
    titleFontCategory?: string,
    bodyFontCategory?: string,
    titleAlignment?: string
) {
    let base = 'mb-5 text-pretty leading-[1.7] text-black';

    const serifTitle = titleFontCategory === 'serif';
    const serifBody = bodyFontCategory === 'serif';

    if (serifTitle && serifBody) {
        base = clsx(base, 'mb-8 font-serif text-[2.0rem] leading-tight');
    } else if (!serifTitle && serifBody) {
        base = clsx(base, 'mb-8 text-[1.7rem] leading-tight tracking-tight');
    } else if (serifTitle && !serifBody) {
        base = clsx(base, 'mb-8 font-serif text-[2.0rem] leading-tight');
    } else {
        base = clsx(base, 'mb-8 text-[1.9rem] leading-tight tracking-tight');
    }

    if (titleAlignment === 'center') {
        base = clsx(base, 'text-center');
    }

    return base;
}

/**
 * Returns class names for title based on font category, weight and alignment.
 */
function getTitleClassNames(
    titleFontCategory?: string,
    titleFontWeight?: string,
    titleAlignment?: string,
    showExcerpt?: boolean
) {
    return clsx(
        'text-4xl font-bold leading-supertight text-black',
        titleFontCategory === 'serif' && 'font-serif',
        titleFontWeight === 'normal' && 'font-normal',
        titleFontWeight === 'medium' && 'font-medium',
        titleFontWeight === 'semibold' && 'font-semibold',
        titleFontWeight === 'bold' && 'font-bold',
        titleAlignment === 'center' ? 'text-center' : 'text-left',
        showExcerpt ? 'mb-2' : 'mb-8'
    );
}

/**
 * Returns class names for the body container based on divider style.
 */
function getDividerClassNames(dividerStyle?: string) {
    return clsx(
        dividerStyle === 'dashed' && 'border-dashed',
        dividerStyle === 'dotted' && 'border-b-2 border-dotted'
    );
}

/**
 * Returns class names for image corners.
 */
function getImageCornerClass(imageCorners?: string) {
    return clsx(
        imageCorners === 'square' && 'rounded-none',
        imageCorners === 'rounded' && 'rounded-md'
    );
}

/**
 * Returns class names for button corners.
 */
function getButtonCornerClass(buttonCorners?: string) {
    return clsx(
        buttonCorners === 'rounded' && 'rounded-[6px]',
        buttonCorners === 'pill' && 'rounded-full',
        buttonCorners === 'square' && 'rounded-none'
    );
}

/**
 * Returns class names for button style.
 */
function getButtonStyleClass(buttonStyle?: string) {
    return buttonStyle === 'outline' ? 'bg-transparent' : 'border-transparent text-white';
}

/**
 * Returns class names for link style.
 */
function getLinkStyleClass(linkStyle?: string) {
    return clsx(
        linkStyle === 'underline' && 'underline',
        linkStyle === 'bold' && 'font-bold'
    );
}

/**
 * Renders the header section (image, icon, title, subtitle).
 */
function HeaderSection({
    headerImage,
    headerIcon,
    headerTitle,
    headerSubtitle,
    headerTextColor,
    secondaryHeaderTextColor,
    headerBackgroundColor,
    showHeader
}: {
    headerImage?: string | null;
    headerIcon?: string;
    headerTitle?: string | null;
    headerSubtitle?: string | null;
    headerTextColor?: string;
    secondaryHeaderTextColor?: string;
    headerBackgroundColor?: string;
    showHeader: boolean;
}) {
    return (
        <>
            {headerImage && (
                <div>
                    <img alt="" className="mb-4 block pt-6" src={headerImage} />
                </div>
            )}
            {showHeader && (
                <div className="py-3">
                    {headerIcon && <img alt="" className="mx-auto mb-2 size-10" role="presentation" src={headerIcon} />}
                    {headerTitle && (
                        <h4
                            className="mb-1 text-center text-[1.6rem] font-bold uppercase leading-tight tracking-tight text-grey-900"
                            style={{color: headerTextColor}}
                        >
                            {headerTitle}
                        </h4>
                    )}
                    {headerSubtitle && (
                        <h5
                            className="mb-1 text-center text-[1.3rem] font-normal text-grey-700"
                            style={{color: secondaryHeaderTextColor}}
                        >
                            {headerSubtitle}
                        </h5>
                    )}
                </div>
            )}
        </>
    );
}

/**
 * Renders the feature image block.
 */
function FeatureImage({
    showFeatureImage,
    showPostTitleSection,
    imageCorners,
    CoverImageSrc = CoverImage
}: {
    showFeatureImage: boolean;
    showPostTitleSection: boolean;
    imageCorners?: string;
    CoverImageSrc?: string;
}) {
    if (!showFeatureImage) {
        return null;
    }

    return (
        <>
            <div
                className={clsx(
                    'h-[unset] w-full max-w-[600px] bg-cover bg-no-repeat',
                    showPostTitleSection ? '' : 'pt-6'
                )}
            >
                <img
                    alt="Feature"
                    className={clsx('min-h-full min-w-full shrink-0', getImageCornerClass(imageCorners))}
                    src={CoverImageSrc}
                />
            </div>
            <div
                className="mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700"
                style={{color: undefined}}
            >
                Feature image caption
            </div>
        </>
    );
}

/**
 * Renders the post title and excerpt block.
 */
function PostTitleSection({
    showPostTitleSection,
    titleAlignment,
    titleFontCategory,
    titleFontWeight,
    titleFontCategoryClass,
    titleFontWeightClass,
    titleAlignmentClass,
    showExcerpt,
    excerptClasses,
    headerTextColor,
    postTitleColor,
    authorPlaceholder,
    currentDate
}: {
    showPostTitleSection: boolean;
    titleAlignment?: string;
    titleFontCategory?: string;
    titleFontWeight?: string;
    showExcerpt?: boolean;
    excerptClasses: string;
    headerTextColor?: string;
    postTitleColor?: string;
    authorPlaceholder?: string;
    currentDate: string;
}) {
    if (!showPostTitleSection) {
        return null;
    }

    return (
        <div className={clsx('flex flex-col py-8', titleAlignment === 'center' ? 'items-center' : 'items-start')}>
            <h2
                className={getTitleClassNames(titleFontCategory, titleFontWeight, titleAlignment, showExcerpt)}
                style={{color: postTitleColor}}
            >
                Your email newsletter
            </h2>
            {showExcerpt && (
                <p className={excerptClasses} style={{color: headerTextColor}}>
                    A subtitle to highlight key points and engage your readers.
                </p>
            )}
            <div
                className={clsx(
                    'flex w-full justify-between text-center text-md leading-none text-grey-700',
                    titleAlignment === 'center' ? 'flex-col gap-1' : 'flex-row'
                )}
            >
                <p className="pb-1 text-[1.3rem]" style={{color: undefined}}>
                    By {authorPlaceholder}
                    <span className="before:pl-0.5 before:pr-1 before:content-['•']">{currentDate}</span>
                </p>
                <p className="pb-1 text-[1.3rem] underline" style={{color: undefined}}>
                    <span>View in browser</span>
                </p>
            </div>
        </div>
    );
}

/**
 * Renders the main content block (static paragraphs, divider, CTA button).
 */
function MainContent({
    dividerStyle,
    dividerColor,
    bodyFontCategory,
    textColor,
    linkStyle,
    linkColor,
    accentColor,
    buttonStyle,
    buttonCorners,
    buttonColor,
    buttonTextColor,
    sectionTitleColor,
    titleFontCategory,
    titleFontWeight
}: {
    dividerStyle?: string;
    dividerColor?: string;
    bodyFontCategory?: string;
    textColor?: string;
    linkStyle?: string;
    linkColor?: string;
    accentColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    sectionTitleColor?: string;
    titleFontCategory?: string;
    titleFontWeight?: string;
}) {
    return (
        <div
            className={clsx(
                'max-w-[600px] border-b border-grey-200 pb-[52px] leading-[27.2px] text-black',
                getDividerClassNames(dividerStyle),
                bodyFontCategory === 'serif' ? 'font-serif text-[1.8rem]' : 'text-[1.7rem] tracking-tight'
            )}
            style={{borderColor: dividerColor}}
        >
            <p className="mb-6" style={{color: textColor}}>
                This is what your content will look...
            </p>
            <p className="mb-6" style={{color: textColor}}>
                Over there on the right you&apos;ll see some settings...
            </p>
            <p className="mb-[52px]" style={{color: textColor}}>
                Email templates are exceptionally finnicky...
            </p>
            <hr
                className={clsx('my-[52px] border-[#e0e7eb]', getDividerClassNames(dividerStyle))}
                style={{borderColor: dividerColor}}
            />
            <h3
                className={clsx(
                    'mb-[13px] text-[2.6rem] leading-supertight',
                    titleFontCategory === 'serif' && 'font-serif',
                    titleFontCategory === 'sans_serif' && 'font-sans',
                    titleFontWeight === 'normal' && 'font-normal',
                    titleFontWeight === 'medium' && 'font-medium',
                    titleFontWeight === 'semibold' && 'font-semibold',
                    titleFontWeight === 'bold' && 'font-bold'
                )}
                style={{color: sectionTitleColor}}
            >
                Need inspiration?
            </h3>
            <p className="mb-[27px]" style={{color: textColor}}>
                We&apos;ve put together a{' '}
                <a
                    className={getLinkStyleClass(linkStyle)}
                    href="https://ghost.org/help/email-design/"
                    rel="noopener noreferrer"
                    style={{color: linkColor || accentColor}}
                    target="_blank"
                >
                    quick guide
                </a>{' '}
                that walks through all of the available settings...
            </p>
            <a
                className={clsx(
                    'inline-block border px-[18px] py-2 font-sans text-[15px]',
                    getButtonCornerClass(buttonCorners),
                    getButtonStyleClass(buttonStyle),
                    linkStyle === 'bold' ? 'font-bold' : 'font-semibold'
                )}
                href="https://ghost.org/help/email-design/"
                rel="noopener noreferrer"
                style={
                    buttonStyle === 'outline'
                        ? {
                              borderColor: buttonColor || accentColor,
                              color: buttonColor || accentColor
                          }
                        : {
                              backgroundColor: buttonColor || accentColor,
                              color: buttonTextColor
                          }
                }
                target="_blank"
            >
                Learn more
            </a>
        </div>
    );
}

/**
 * Renders the feedback / comment CTA block.
 */
function FeedbackSection({
    showFeedback,
    showCommentCta,
    textColor,
    dividerStyle,
    dividerColor
}: {
    showFeedback: boolean;
    showCommentCta: boolean;
    textColor?: string;
    dividerStyle?: string;
    dividerColor?: string;
}) {
    if (!showFeedback && !showCommentCta) {
        return null;
    }

    return (
        <div
            className={clsx(
                'grid gap-5 border-b border-grey-200 px-6 py-5',
                dividerStyle === 'dashed' && 'border-dashed',
                dividerStyle === 'dotted' && 'border-b-2 border-dotted'
            )}
            style={{borderColor: dividerColor}}
        >
            <div className="flex justify-center gap-3">
                {showFeedback && (
                    <>
                        <button
                            className="pointer-events-none cursor-default whitespace-nowrap rounded-[2.2rem] bg-transparent font-semibold"
                            type="button"
                        >
                            <span className="inline-flex items-center gap-2 px-[18px] py-[7px]" style={{color: textColor}}>
                                <Icon colorClass="" name="thumbs-up" size="md" />
                                <span>More like this</span>
                            </span>
                        </button>
                        <button
                            className="pointer-events-none cursor-default whitespace-nowrap rounded-[2.2rem] bg-transparent font-semibold"
                            type="button"
                        >
                            <span className="inline-flex items-center gap-2 px-[18px] py-[7px]" style={{color: textColor}}>
                                <Icon colorClass="" name="thumbs-down" />
                                <span>Less like this</span>
                            </span>
                        </button>
                    </>
                )}
                {showCommentCta && (
                    <button
                        className="pointer-events-none cursor-default whitespace-nowrap rounded-[2.2rem] bg-transparent font-semibold"
                        type="button"
                    >
                        <span className="inline-flex items-center gap-2 px-[18px] py-[7px]" style={{color: textColor}}>
                            <Icon colorClass="" name="comment" />
                            <span>Comment</span>
                        </span>
                    </button>
                )}
            </div>
        </div>
    );
}

/**
 * Renders the latest posts block.
 */
function LatestPostsSection({
    showLatestPosts,
    titleFontCategory,
    titleFontWeight,
    imageCorners,
    dividerStyle,
    dividerColor,
    sectionTitleColor,
    secondaryTextColor,
    textColor
}: {
    showLatestPosts: boolean;
    titleFontCategory?: string;
    titleFontWeight?: string;
    imageCorners?: string;
    dividerStyle?: string;
    dividerColor?: string;
    sectionTitleColor?: string;
    secondaryTextColor?: string;
    textColor?: string;
}) {
    if (!showLatestPosts) {
        return null;
    }

    const titleClass = (title: string) =>
        clsx(
            'mt-0.5 text-[1.9rem] text-black',
            titleFontCategory === 'serif' && 'font-serif',
            titleFontWeight === 'normal' && 'font-normal',
            titleFontWeight === 'medium' && 'font-medium',
            titleFontWeight === 'semibold' && 'font-semibold',
            titleFontWeight === 'bold' && 'font-bold'
        );

    const postData = [
        {
            title: 'The three latest posts published on your site',
            description: 'Posts sent as an email only will never be shown here.',
            img: LatestPosts1
        },
        {
            title: 'Displayed at the bottom of each newsletter',
            description: 'Giving your readers one more place to discover your stories.',
            img: LatestPosts2
        },
        {
            title: 'To keep your work front and center',
            description: 'Making sure that your audience stays engaged.',
            img: LatestPosts3
        }
    ];

    return (
        <div
            className={clsx(
                'border-b border-grey-200 py-6',
                dividerStyle === 'dashed' && 'border-dashed',
                dividerStyle === 'dotted' && 'border-b-2 border-dotted'
            )}
            style={{borderColor: dividerColor}}
        >
            <h3
                className="mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black"
                style={{color: textColor}}
            >
                Keep reading
            </h3>
            {postData.map((post, idx) => (
                <div key={idx} className="flex justify-between gap-4 py-2">
                    <div>
                        <h4 className={titleClass(post.title)} style={{color: sectionTitleColor}}>
                            {post.title}
                        </h4>
                        <p className="m-0 text-base text-grey-700" style={{color: secondaryTextColor}}>
                            {post.description}
                        </p>
                    </div>
                    <div className="aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat">
                        <img
                            alt="Latest post"
                            className={clsx(getImageCornerClass(imageCorners))}
                            src={post.img}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

/**
 * Renders the subscription details block.
 */
function SubscriptionDetailsSection({
    showSubscriptionDetails,
    siteTitle,
    textColor,
    linkColor,
    accentColor,
    linkStyle,
    dividerStyle,
    dividerColor
}: {
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    textColor?: string;
    linkColor?: string;
    accentColor?: string;
    linkStyle?: string;
    dividerStyle?: string;
    dividerColor?: string;
}) {
    if (!showSubscriptionDetails) {
        return null;
    }

    return (
        <div
            className={clsx(
                'border-b border-grey-200 py-8',
                dividerStyle === 'dashed' && 'border-dashed',
                dividerStyle === 'dotted' && 'border-b-2 border-dotted'
            )}
            style={{borderColor: dividerColor}}
        >
            <h4 className="mb-3 text-[1.2rem] uppercase tracking-wide text-black" style={{color: textColor}}>
                Subscription details
            </h4>
            <p className="m-0 mb-4 text-base" style={{color: textColor}}>
                You are receiving this because you are a paid subscriber to {siteTitle}. Your subscription will renew on 17 Jul 2024.
            </p>
            <div className="flex">
                <div className="shrink-0 text-base">
                    <p style={{color: textColor}}>Name: Jamie Larson</p>
                    <p style={{color: textColor}}>Email: jamie@example.com</p>
                    <p style={{color: textColor}}>Member since: 17 July 2023</p>
                </div>
                <span
                    className={clsx(
                        'w-full self-end whitespace-nowrap text-right text-base',
                        linkStyle === 'underline' && 'underline',
                        linkStyle === 'bold' && 'font-bold'
                    )}
                    style={{color: linkColor || accentColor}}
                >
                    Manage subscription
                </span>
            </div>
        </div>
    );
}

/**
 * Renders the footer block.
 */
function FooterSection({
    processedFooterContent,
    siteTitle,
    currentYear,
    secondaryTextColor,
    showBadge,
    textColor
}: {
    processedFooterContent: string;
    siteTitle?: string;
    currentYear: number;
    secondaryTextColor?: string;
    showBadge: boolean;
    textColor?: string;
}) {
    return (
        <div className="flex flex-col items-center pt-10">
            <div
                dangerouslySetInnerHTML={{__html: processedFooterContent || ''}}
                className="text break-words px-8 py-3 text-center text-[1.3rem] leading-base text-grey-700 [&_a]:underline"
                style={{color: secondaryTextColor}}
            />
            <div className="px-8 pb-14 pt-3 text-center text-[1.3rem] text-grey-700">
                <span style={{color: secondaryTextColor}}>
                    {siteTitle} © {currentYear} &mdash;{' '}
                </span>
                <span className="pointer-events-none cursor-auto underline" style={{color: secondaryTextColor}}>
                    Unsubscribe
                </span>
            </div>
            {showBadge && (
                <div className="flex flex-col items-center pb-[40px] pt-[10px]">
                    <a
                        className="pointer-events-none inline-flex cursor-auto items-center px-2 py-1 text-[1.25rem] font-semibold tracking-tight text-grey-900"
                        href="https://ghost.org"
                        style={{color: textColor}}
                    >
                        <GhostOrb className="mr-[6px] size-4" />
                        <span>Powered by Ghost</span>
                    </a>
                </div>
            )}
        </div>
    );
}

/**
 * Main newsletter preview component.
 */
const NewsletterPreviewContent: React.FC<{
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
}> = ({
    senderName,
    senderEmail,
    senderReplyTo,
    headerImage,
    headerIcon,
    headerTitle,
    headerSubtitle,
    showPostTitleSection,
    showExcerpt,
    titleAlignment,
    titleFontCategory,
    titleFontWeight,
    bodyFontCategory,
    authorPlaceholder,

    showCommentCta,
    showFeatureImage,
    showFeedback,
    showLatestPosts,
    showSubscriptionDetails,

    siteTitle,
    footerContent,
    showBadge,

    backgroundColor,
    headerBackgroundColor,
    accentColor,
    textColor,
    secondaryTextColor,
    headerTextColor,
    secondaryHeaderTextColor,
    postTitleColor,
    sectionTitleColor,
    dividerColor,
    buttonColor,
    buttonTextColor,
    linkColor,
    buttonStyle,
    buttonCorners,
    imageCorners,
    linkStyle,
    dividerStyle
}) => {
    const {config} = useGlobalData();
    const currentDate = new Date().toLocaleDateString('default', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    const currentYear = new Date().getFullYear();

    const processedFooterContent = footerContent
        ? footerContent.replace(/<a/g, '<a target="_blank" rel="noopener noreferrer"')
        : '';

    const showHeader = Boolean(headerIcon || headerTitle);
    const emailHeader = getEmailHeader(isManagedEmail(config), senderName, senderEmail, senderReplyTo);
    const excerptClasses = buildExcerptClasses(titleFontCategory, bodyFontCategory, titleAlignment);

    return (
        <div className="relative flex grow flex-col">
            <div className="absolute inset-0 m-5 flex items-center justify-center">
                <div className="mx-auto my-0 flex max-h-full w-full max-w-[700px] flex-col overflow-hidden rounded-[4px] text-black shadow-sm">
                    {/* Email header */}
                    <div className="flex-column flex min-h-[77px] justify-center rounded-t-sm border-b border-grey-200 bg-white px-6 text-sm text-grey-700">
                        {emailHeader}
                    </div>

                    {/* Email content */}
                    <div className="overflow-y-auto text-sm" style={{backgroundColor}}>
                        <div className="px-[7rem]" style={{backgroundColor: headerBackgroundColor}}>
                            <HeaderSection
                                headerImage={headerImage}
                                headerIcon={headerIcon}
                                headerTitle={headerTitle}
                                headerSubtitle={headerSubtitle}
                                headerTextColor={headerTextColor}
                                secondaryHeaderTextColor={secondaryHeaderTextColor}
                                headerBackgroundColor={headerBackgroundColor}
                                showHeader={showHeader}
                            />
                            <PostTitleSection
                                showPostTitleSection={showPostTitleSection}
                                titleAlignment={titleAlignment}
                                titleFontCategory={titleFontCategory}
                                titleFontWeight={titleFontWeight}
                                showExcerpt={showExcerpt}
                                excerptClasses={excerptClasses}
                                headerTextColor={headerTextColor}
                                postTitleColor={postTitleColor}
                                authorPlaceholder={authorPlaceholder}
                                currentDate={currentDate}
                            />
                            <FeatureImage
                                showFeatureImage={showFeatureImage}
                                showPostTitleSection={showPostTitleSection}
                                imageCorners={imageCorners}
                            />
                        </div>

                        <div className={clsx('px-[7rem]', headerBackgroundColor !== 'transparent' && 'pt-10')}>
                            <MainContent
                                dividerStyle={dividerStyle}
                                dividerColor={dividerColor}
                                bodyFontCategory={bodyFontCategory}
                                textColor={textColor}
                                linkStyle={linkStyle}
                                linkColor={linkColor}
                                accentColor={accentColor}
                                buttonStyle={buttonStyle}
                                buttonCorners={buttonCorners}
                                buttonColor={buttonColor}
                                buttonTextColor={buttonTextColor}
                                sectionTitleColor={sectionTitleColor}
                                titleFontCategory={titleFontCategory}
                                titleFontWeight={titleFontWeight}
                            />
                            <FeedbackSection
                                showFeedback={showFeedback}
                                showCommentCta={showCommentCta}
                                textColor={textColor}
                                dividerStyle={dividerStyle}
                                dividerColor={dividerColor}
                            />
                            <LatestPostsSection
                                showLatestPosts={showLatestPosts}
                                titleFontCategory={titleFontCategory}
                                titleFontWeight={titleFontWeight}
                                imageCorners={imageCorners}
                                dividerStyle={dividerStyle}
                                dividerColor={dividerColor}
                                sectionTitleColor={sectionTitleColor}
                                secondaryTextColor={secondaryTextColor}
                                textColor={textColor}
                            />
                            <SubscriptionDetailsSection
                                showSubscriptionDetails={showSubscriptionDetails}
                                siteTitle={siteTitle}
                                textColor={textColor}
                                linkColor={linkColor}
                                accentColor={accentColor}
                                linkStyle={linkStyle}
                                dividerStyle={dividerStyle}
                                dividerColor={dividerColor}
                            />
                            <FooterSection
                                processedFooterContent={processedFooterContent}
                                siteTitle={siteTitle}
                                currentYear={currentYear}
                                secondaryTextColor={secondaryTextColor}
                                showBadge={!!showBadge}
                                textColor={textColor}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NewsletterPreviewContent;