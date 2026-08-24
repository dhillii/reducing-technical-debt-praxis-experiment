import CoverImage from '../../../../assets/images/user-cover.jpg';
import LatestPosts1 from '../../../../assets/images/latest-posts-1.jpg';
import LatestPosts2 from '../../../../assets/images/latest-posts-2.jpg';
import LatestPosts3 from '../../../../assets/images/latest-posts-3.jpg';
import clsx from 'clsx';
import {GhostOrb, Icon} from '@tryghost/admin-x-design-system';
import {isManagedEmail} from '@tryghost/admin-x-framework/api/config';
import {useGlobalData} from '../../../providers/global-data-provider';

/**
 * Extracted predicate to determine if serif fonts are used for title/body
 */
const isSerifTitleSerifBody = (titleFontCategory: string, bodyFontCategory: string) =>
    titleFontCategory === 'serif' && bodyFontCategory === 'serif';

/**
 * Extracted predicate to determine if title is serif but body is not
 */
const isSerifTitleNonSerifBody = (titleFontCategory: string, bodyFontCategory: string) =>
    titleFontCategory === 'serif' && bodyFontCategory !== 'serif';

/**
 * Extracted predicate to determine if title is non-serif but body is serif
 */
const isNonSerifTitleSerifBody = (titleFontCategory: string, bodyFontCategory: string) =>
    titleFontCategory !== 'serif' && bodyFontCategory === 'serif';

/**
 * Extracted predicate to determine if both fonts are non-serif
 */
const isNonSerifTitleNonSerifBody = (titleFontCategory: string, bodyFontCategory: string) =>
    titleFontCategory !== 'serif' && bodyFontCategory !== 'serif';

/**
 * Extracted predicate to determine if title alignment is center
 */
const isCenterAligned = (alignment?: string) => alignment === 'center';

/**
 * Extracted predicate to determine if button style is outline
 */
const isOutlineButton = (style?: string) => style === 'outline';

/**
 * Extracted predicate to determine if link style is bold
 */
const isBoldLink = (style?: string) => style === 'bold';

/**
 * Extracted predicate to determine if link style is underline
 */
const isUnderlineLink = (style?: string) => style === 'underline';

/**
 * Extracted predicate to determine if divider style is dashed
 */
const isDashedDivider = (style?: string) => style === 'dashed';

/**
 * Extracted predicate to determine if divider style is dotted
 */
const isDottedDivider = (style?: string) => style === 'dotted';

/**
 * Extracted predicate to determine if image corners are square
 */
const isSquareCorners = (corners?: string) => corners === 'square';

/**
 * Extracted predicate to determine if image corners are rounded
 */
const isRoundedCorners = (corners?: string) => corners === 'rounded';

/**
 * Extracted predicate to determine if image corners are neither square nor rounded
 */
const isDefaultCorners = (corners?: string) => !isSquareCorners(corners) && !isRoundedCorners(corners);

/**
 * Extracted predicate to determine if button corners are rounded
 */
const isButtonRounded = (corners?: string) => corners === 'rounded';

/**
 * Extracted predicate to determine if button corners are pill-shaped
 */
const isButtonPill = (corners?: string) => corners === 'pill';

/**
 * Extracted predicate to determine if button corners are square
 */
const isButtonSquare = (corners?: string) => corners === 'square';

/**
 * Extracted predicate to determine if button corners are default (none of the above)
 */
const isButtonDefaultCorners = (corners?: string) =>
    !isButtonRounded(corners) && !isButtonPill(corners) && !isButtonSquare(corners);

/**
 * Extracted predicate to determine if title font category is serif
 */
const isTitleSerif = (category?: string) => category === 'serif';

/**
 * Extracted predicate to determine if title font category is sans-serif
 */
const isTitleSansSerif = (category?: string) => category === 'sans_serif';

/**
 * Extracted predicate to determine if title font weight is normal
 */
const isTitleNormalWeight = (weight?: string) => weight === 'normal';

/**
 * Extracted predicate to determine if title font weight is medium
 */
const isTitleMediumWeight = (weight?: string) => weight === 'medium';

/**
 * Extracted predicate to determine if title font weight is semibold
 */
const isTitleSemiboldWeight = (weight?: string) => weight === 'semibold';

/**
 * Extracted predicate to determine if title font weight is bold
 */
const isTitleBoldWeight = (weight?: string) => weight === 'bold';

/**
 * Extracted predicate to determine if showFeedback or showCommentCta is enabled
 */
const isFeedbackOrCommentEnabled = (showFeedback: boolean, showCommentCta: boolean) =>
    showFeedback || showCommentCta;

/**
 * Extracted predicate to determine if showLatestPosts is enabled
 */
const isLatestPostsEnabled = (showLatestPosts: boolean) => showLatestPosts;

/**
 * Extracted predicate to determine if showSubscriptionDetails is enabled
 */
const isSubscriptionDetailsEnabled = (showSubscriptionDetails: boolean) => showSubscriptionDetails;

/**
 * Extracted predicate to determine if showBadge is enabled
 */
const isBadgeEnabled = (showBadge: boolean) => showBadge;

/**
 * Extracted predicate to determine if showFeatureImage is enabled
 */
const isFeatureImageEnabled = (showFeatureImage: boolean) => showFeatureImage;

/**
 * Extracted predicate to determine if showPostTitleSection is enabled
 */
const isPostTitleSectionEnabled = (showPostTitleSection: boolean) => showPostTitleSection;

/**
 * Extracted predicate to determine if showHeader is enabled
 */
const isHeaderEnabled = (headerIcon?: string | null, headerTitle?: string | null) =>
    !!(headerIcon || headerTitle);

/**
 * Extracted predicate to determine if showExcerpt is enabled
 */
const isExcerptEnabled = (showExcerpt: boolean) => showExcerpt;

/**
 * Extracted predicate to determine if header background is transparent
 */
const isHeaderTransparent = (headerBackgroundColor?: string) => headerBackgroundColor === 'transparent';

/**
 * Extracted predicate to determine if email is managed
 */
const isManaged = (config: any) => isManagedEmail(config);

/**
 * Extracted function to generate excerpt classes based on font and alignment settings
 */
const getExcerptClasses = (
    titleFontCategory: string,
    bodyFontCategory: string,
    titleAlignment?: string,
    showExcerpt?: boolean
) => {
    let base = 'mb-5 text-pretty leading-[1.7] text-black';

    if (isSerifTitleSerifBody(titleFontCategory, bodyFontCategory)) {
        base = clsx(base, 'mb-8 font-serif text-[2.0rem] leading-tight');
    } else if (isSerifTitleNonSerifBody(titleFontCategory, bodyFontCategory)) {
        base = clsx(base, 'mb-8 font-serif text-[2.0rem] leading-tight');
    } else if (isNonSerifTitleSerifBody(titleFontCategory, bodyFontCategory)) {
        base = clsx(base, 'mb-8 text-[1.7rem] leading-tight tracking-tight');
    } else {
        base = clsx(base, 'mb-8 text-[1.9rem] leading-tight tracking-tight');
    }

    if (isCenterAligned(titleAlignment)) {
        base = clsx(base, 'text-center');
    }

    return base;
};

/**
 * Extracted function to generate email header JSX based on email type
 */
const getEmailHeader = (config: any, senderName?: string, senderEmail?: string | null, senderReplyTo?: string | null) => {
    if (isManaged(config)) {
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

/**
 * Extracted function to generate button style object
 */
const getButtonStyle = (
    buttonStyle?: string,
    buttonColor?: string,
    accentColor?: string,
    buttonTextColor?: string
) => {
    if (isOutlineButton(buttonStyle)) {
        return {
            borderColor: buttonColor || accentColor,
            color: buttonColor || accentColor
        };
    }

    return {
        backgroundColor: buttonColor || accentColor,
        color: buttonTextColor
    };
};

/**
 * Extracted function to generate image corner classes
 */
const getImageCornerClasses = (corners?: string) => {
    if (isSquareCorners(corners)) {
        return 'rounded-none';
    }
    if (isRoundedCorners(corners)) {
        return 'rounded-md';
    }
    return '';
};

/**
 * Extracted function to generate button corner classes
 */
const getButtonCornerClasses = (corners?: string) => {
    if (isButtonRounded(corners)) {
        return 'rounded-[6px]';
    }
    if (isButtonPill(corners)) {
        return 'rounded-full';
    }
    if (isButtonSquare(corners)) {
        return 'rounded-none';
    }
    return '';
};

/**
 * Extracted function to generate title font classes
 */
const getTitleFontClasses = (
    titleFontCategory?: string,
    titleFontWeight?: string
) => {
    const classes: string[] = [];

    if (isTitleSerif(titleFontCategory)) {
        classes.push('font-serif');
    } else if (isTitleSansSerif(titleFontCategory)) {
        classes.push('font-sans');
    }

    if (isTitleNormalWeight(titleFontWeight)) {
        classes.push('font-normal');
    } else if (isTitleMediumWeight(titleFontWeight)) {
        classes.push('font-medium');
    } else if (isTitleSemiboldWeight(titleFontWeight)) {
        classes.push('font-semibold');
    } else if (isTitleBoldWeight(titleFontWeight)) {
        classes.push('font-bold');
    }

    return classes;
};

/**
 * Extracted function to generate divider classes
 */
const getDividerClasses = (dividerStyle?: string, hasTopPadding?: boolean) => {
    const classes: string[] = [];

    if (isDashedDivider(dividerStyle)) {
        classes.push('border-dashed');
    } else if (isDottedDivider(dividerStyle)) {
        classes.push('border-b-2 border-dotted');
    }

    if (hasTopPadding) {
        classes.push('pt-10');
    }

    return classes;
};

/**
 * Extracted function to generate link classes
 */
const getLinkClasses = (linkStyle?: string) => {
    const classes: string[] = [];

    if (isUnderlineLink(linkStyle)) {
        classes.push('underline');
    }
    if (isBoldLink(linkStyle)) {
        classes.push('font-bold');
    }

    return classes;
};

/**
 * Extracted function to generate section title classes
 */
const getSectionTitleClasses = (
    titleFontCategory?: string,
    titleFontWeight?: string
) => {
    const classes: string[] = [];

    if (isTitleSerif(titleFontCategory)) {
        classes.push('font-serif');
    } else if (isTitleSansSerif(titleFontCategory)) {
        classes.push('font-sans');
    }

    if (isTitleNormalWeight(titleFontWeight)) {
        classes.push('font-normal');
    } else if (isTitleMediumWeight(titleFontWeight)) {
        classes.push('font-medium');
    } else if (isTitleSemiboldWeight(titleFontWeight)) {
        classes.push('font-semibold');
    } else if (isTitleBoldWeight(titleFontWeight)) {
        classes.push('font-bold');
    }

    return classes;
};

/**
 * Extracted function to generate body font classes
 */
const getBodyFontClasses = (bodyFontCategory?: string) => {
    if (bodyFontCategory === 'serif') {
        return 'font-serif text-[1.8rem]';
    }
    return 'text-[1.7rem] tracking-tight';
};

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
    buttonCorners?: string;
    buttonStyle?: string;
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
    buttonCorners,
    buttonStyle,
    imageCorners,
    linkStyle,
    dividerStyle
}) => {
    const showHeader = isHeaderEnabled(headerIcon, headerTitle);
    const {config} = useGlobalData();

    const currentDate = new Date().toLocaleDateString('default', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    const currentYear = new Date().getFullYear();

    const processedFooterContent = footerContent ? footerContent.replace(/<a/g, '<a target="_blank" rel="noopener noreferrer"') : '';

    const emailHeader = getEmailHeader(config, senderName, senderEmail, senderReplyTo);

    const excerptClasses = getExcerptClasses(
        titleFontCategory || '',
        bodyFontCategory || '',
        titleAlignment,
        showExcerpt
    );

    return (
        <div className="relative flex grow flex-col">
            <div className="absolute inset-0 m-5 flex items-center justify-center">
                <div className="mx-auto my-0 flex max-h-full w-full max-w-[700px] flex-col overflow-hidden rounded-[4px] text-black shadow-sm">
                    <div className="flex-column flex min-h-[77px] justify-center rounded-t-sm border-b border-grey-200 bg-white px-6 text-sm text-grey-700">
                        {emailHeader}
                    </div>

                    <div className="overflow-y-auto text-sm" style={{backgroundColor}}>
                        <div className={clsx('px-[7rem]', isHeaderTransparent(headerBackgroundColor) ? '' : 'pt-10')}>
                            {headerImage && (
                                <div>
                                    <img alt="" className="mb-4 block pt-6" src={headerImage} />
                                </div>
                            )}
                            {showHeader && (
                                <div className="py-3">
                                    {headerIcon && <img alt="" className="mx-auto mb-2 size-10" role="presentation" src={headerIcon} />}
                                    {headerTitle && <h4 className="mb-1 text-center text-[1.6rem] font-bold uppercase leading-tight tracking-tight text-grey-900" style={{color: headerTextColor}}>{headerTitle}</h4>}
                                    {headerSubtitle && <h5 className="mb-1 text-center text-[1.3rem] font-normal text-grey-700" style={{color: secondaryHeaderTextColor}}>{headerSubtitle}</h5>}
                                </div>
                            )}
                            {isPostTitleSectionEnabled(showPostTitleSection) && (
                                <div className={clsx('flex flex-col py-8', isCenterAligned(titleAlignment) ? 'items-center' : 'items-start')}>
                                    <h2 className={clsx(
                                        'text-4xl font-bold leading-supertight text-black',
                                        ...getTitleFontClasses(titleFontCategory, titleFontWeight),
                                        isCenterAligned(titleAlignment) ? 'text-center' : 'text-left',
                                        isExcerptEnabled(showExcerpt) ? 'mb-2' : 'mb-8'
                                    )} style={{color: postTitleColor}}>Your email newsletter</h2>
                                    {isExcerptEnabled(showExcerpt) && (
                                        <p className={excerptClasses} style={{color: headerTextColor}}>A subtitle to highlight key points and engage your readers.</p>
                                    )}
                                    <div className={clsx(
                                        'flex w-full justify-between text-center text-md leading-none text-grey-700',
                                        isCenterAligned(titleAlignment) ? 'flex-col gap-1' : 'flex-row'
                                    )}>
                                        <p className="pb-1 text-[1.3rem]" style={{color: secondaryHeaderTextColor}}>
                                            By {authorPlaceholder}
                                            <span className="before:pl-0.5 before:pr-1 before:content-['•']">{currentDate}</span>
                                        </p>
                                        <p className="pb-1 text-[1.3rem] underline" style={{color: secondaryHeaderTextColor}}><span>View in browser</span></p>
                                    </div>
                                </div>
                            )}

                            {isFeatureImageEnabled(showFeatureImage) && (
                                <>
                                    <div className={clsx(
                                        'h-[unset] w-full max-w-[600px] bg-cover bg-no-repeat',
                                        isPostTitleSectionEnabled(showPostTitleSection) ? '' : 'pt-6'
                                    )}>
                                        <img alt="Feature" className={clsx(
                                            'min-h-full min-w-full shrink-0',
                                            getImageCornerClasses(imageCorners)
                                        )} src={CoverImage} />
                                    </div>
                                    <div className="mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700" style={{color: secondaryHeaderTextColor}}>Feature image caption</div>
                                </>
                            )}
                        </div>

                        <div className={clsx('px-[7rem]', isHeaderTransparent(headerBackgroundColor) ? '' : 'pt-10')}>
                            <div className={clsx(
                                'max-w-[600px] border-b border-grey-200 pb-[52px] leading-[27.2px] text-black',
                                ...getDividerClasses(dividerStyle),
                                getBodyFontClasses(bodyFontCategory),
                                (isFeatureImageEnabled(showFeatureImage) || isPostTitleSectionEnabled(showPostTitleSection)) ? '' : 'pt-8'
                            )} style={{borderColor: dividerColor}}>
                                <p className="mb-6" style={{color: textColor}}>This is what your content will look like when you send one of your posts as an email newsletter to your subscribers.</p>
                                <p className="mb-6" style={{color: textColor}}>Over there on the right you&apos;ll see some settings that allow you to customize the look and feel of this template – from colors and typography to layout and buttons – to make it perfectly suited to your brand.</p>
                                <p className="mb-[52px]" style={{color: textColor}}>Email templates are exceptionally finnicky to make, but we&apos;ve spent a long time optimising this one to make it work beautifully across devices, email clients and content types. So, you can trust that every email you send with Ghost will look great and work well. Just like the rest of your site.</p>
                                <hr className={clsx('my-[52px] border-[#e0e7eb]', ...getDividerClasses(dividerStyle))} style={{borderColor: dividerColor}} />
                                <h3
                                    className={clsx(
                                        'mb-[13px] text-[2.6rem] leading-supertight',
                                        ...getSectionTitleClasses(titleFontCategory, titleFontWeight)
                                    )}
                                    style={{color: sectionTitleColor}}>Need inspiration?</h3>
                                <p className="mb-[27px]" style={{color: textColor}}>We&apos;ve put together a <a className={clsx(...getLinkClasses(linkStyle))} href="https://ghost.org/help/email-design/" rel="noopener noreferrer" style={{color: linkColor || accentColor}} target="_blank">quick guide</a> that walks through all of the available settings, along with a few examples of what&apos;s possible.</p>
                                <a
                                    className={clsx(
                                        'inline-block border px-[18px] py-2 font-sans text-[15px]',
                                        ...getButtonCornerClasses(buttonCorners),
                                        isOutlineButton(buttonStyle) ? 'bg-transparent' : 'border-transparent text-white',
                                        isBoldLink(linkStyle) ? 'font-bold' : 'font-semibold'
                                    )}
                                    href="https://ghost.org/help/email-design/"
                                    rel="noopener noreferrer"
                                    style={getButtonStyle(buttonStyle, buttonColor, accentColor, buttonTextColor)}
                                    target="_blank"
                                >
                                    Learn more
                                </a>
                            </div>

                            {isFeedbackOrCommentEnabled(showFeedback, showCommentCta) && (
                                <div className={clsx('grid gap-5 border-b border-grey-200 px-6 py-5', ...getDividerClasses(dividerStyle))} style={{borderColor: dividerColor}}>
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
                            )}

                            {isLatestPostsEnabled(showLatestPosts) && (
                                <div className={clsx('border-b border-grey-200 py-6', ...getDividerClasses(dividerStyle))} style={{borderColor: dividerColor}}>
                                    <h3 className="mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black" style={{color: textColor}}>Keep reading</h3>
                                    <div className="flex justify-between gap-4 py-2">
                                        <div>
                                            <h4
                                                className={clsx(
                                                    'mt-0.5 text-[1.9rem] text-black',
                                                    ...getSectionTitleClasses(titleFontCategory, titleFontWeight)
                                                )}
                                                style={{color: sectionTitleColor}}>The three latest posts published on your site</h4>
                                            <p className="m-0 text-base text-grey-700" style={{color: secondaryTextColor}}>Posts sent as an email only will never be shown here.</p>
                                        </div>
                                        <div className="aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat">
                                            <img alt="Latest post" className={clsx(getImageCornerClasses(imageCorners))} src={LatestPosts1} />
                                        </div>
                                    </div>
                                    <div className="flex justify-between gap-4 py-2">
                                        <div>
                                            <h4
                                                className={clsx(
                                                    'mt-0.5 text-[1.9rem] text-black',
                                                    ...getSectionTitleClasses(titleFontCategory, titleFontWeight)
                                                )} style={{color: sectionTitleColor}}>Displayed at the bottom of each newsletter</h4>
                                            <p className="m-0 text-base text-grey-700" style={{color: secondaryTextColor}}>Giving your readers one more place to discover your stories.</p>
                                        </div>
                                        <div className="aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat">
                                            <img alt="Latest post" className={clsx(getImageCornerClasses(imageCorners))} src={LatestPosts2} />
                                        </div>
                                    </div>
                                    <div className="flex justify-between gap-4 py-2">
                                        <div>
                                            <h4
                                                className={clsx(
                                                    'mt-0.5 text-[1.9rem] text-black',
                                                    ...getSectionTitleClasses(titleFontCategory, titleFontWeight)
                                                )} style={{color: sectionTitleColor}}>To keep your work front and center</h4>
                                            <p className="m-0 text-base text-grey-700" style={{color: secondaryTextColor}}>Making sure that your audience stays engaged.</p>
                                        </div>
                                        <div className="aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat">
                                            <img alt="Latest post" className={clsx(getImageCornerClasses(imageCorners))} src={LatestPosts3} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {isSubscriptionDetailsEnabled(showSubscriptionDetails) && (
                                <div className={clsx('border-b border-grey-200 py-8', ...getDividerClasses(dividerStyle))} style={{borderColor: dividerColor}}>
                                    <h4 className="mb-3 text-[1.2rem] uppercase tracking-wide text-black" style={{color: textColor}}>Subscription details</h4>
                                    <p className="m-0 mb-4 text-base" style={{color: textColor}}>You are receiving this because you are a paid subscriber to {siteTitle}. Your subscription will renew on 17 Jul 2024.</p>
                                    <div className="flex">
                                        <div className="shrink-0 text-base">
                                            <p style={{color: textColor}}>Name: Jamie Larson</p>
                                            <p style={{color: textColor}}>Email: jamie@example.com</p>
                                            <p style={{color: textColor}}>Member since: 17 July 2023</p>
                                        </div>
                                        <span className={clsx('w-full self-end whitespace-nowrap text-right text-base', ...getLinkClasses(linkStyle))} style={{color: linkColor || accentColor}}>
                                            Manage subscription
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col items-center pt-10">
                                <div dangerouslySetInnerHTML={{__html: processedFooterContent || ''}} className="text break-words px-8 py-3 text-center text-[1.3rem] leading-base text-grey-700 [&_a]:underline" style={{color: secondaryTextColor}} />

                                <div className="px-8 pb-14 pt-3 text-center text-[1.3rem] text-grey-700">
                                    <span style={{color: secondaryTextColor}}>{siteTitle} © {currentYear} &mdash; </span>
                                    <span className="pointer-events-none cursor-auto underline" style={{color: secondaryTextColor}}>Unsubscribe</span>
                                </div>

                                {isBadgeEnabled(showBadge) && (
                                    <div className="flex flex-col items-center pb-[40px] pt-[10px]">
                                        <a className="pointer-events-none inline-flex cursor-auto items-center px-2 py-1 text-[1.25rem] font-semibold tracking-tight text-grey-900" href="https://ghost.org" style={{color: textColor}}>
                                            <GhostOrb className="mr-[6px] size-4"/>
                                            <span>Powered by Ghost</span>
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NewsletterPreviewContent;