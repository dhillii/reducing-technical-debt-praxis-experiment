```typescript
import CoverImage from '../../../../assets/images/user-cover.jpg';
import LatestPosts1 from '../../../../assets/images/latest-posts-1.jpg';
import LatestPosts2 from '../../../../assets/images/latest-posts-2.jpg';
import LatestPosts3 from '../../../../assets/images/latest-posts-3.jpg';
import clsx from 'clsx';
import {GhostOrb, Icon} from '@tryghost/admin-x-design-system';
import {isManagedEmail} from '@tryghost/admin-x-framework/api/config';
import {useGlobalData} from '../../../providers/global-data-provider';

type NewsletterPreviewContentProps = {
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
};

// Helper: Build email header based on managed email configuration
const buildEmailHeader = (
    isManagedEmailConfig: boolean,
    senderName: string | undefined,
    senderEmail: string | null,
    senderReplyTo: string | null
): React.ReactNode => {
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

// Helper: Get font weight class based on weight value
const getFontWeightClass = (weight?: string): string => {
    switch (weight) {
        case 'normal':
            return 'font-normal';
        case 'medium':
            return 'font-medium';
        case 'semibold':
            return 'font-semibold';
        case 'bold':
            return 'font-bold';
        default:
            return '';
    }
};

// Helper: Get font family class based on category
const getFontFamilyClass = (category?: string): string => {
    return category === 'serif' ? 'font-serif' : '';
};

// Helper: Get image corner radius class
const getImageCornerClass = (corners?: string): string => {
    switch (corners) {
        case 'square':
            return 'rounded-none';
        case 'rounded':
            return 'rounded-md';
        default:
            return '';
    }
};

// Helper: Get button corner radius class
const getButtonCornerClass = (corners?: string): string => {
    switch (corners) {
        case 'rounded':
            return 'rounded-[6px]';
        case 'pill':
            return 'rounded-full';
        case 'square':
            return 'rounded-none';
        default:
            return '';
    }
};

// Helper: Get divider style class
const getDividerStyleClass = (style?: string): string => {
    if (style === 'dashed') return 'border-dashed';
    if (style === 'dotted') return 'border-b-2 border-dotted';
    return '';
};

// Helper: Get link style class
const getLinkStyleClass = (style?: string): string => {
    if (style === 'underline') return 'underline';
    if (style === 'bold') return 'font-bold';
    return '';
};

// Helper: Build excerpt classes based on font settings and alignment
const buildExcerptClasses = (
    titleFontCategory?: string,
    bodyFontCategory?: string,
    titleAlignment?: string
): string => {
    let classes = 'mb-5 text-pretty leading-[1.7] text-black';

    if (titleFontCategory === 'serif' && bodyFontCategory === 'serif') {
        classes = clsx(classes, 'mb-8 font-serif text-[2.0rem] leading-tight');
    } else if (titleFontCategory !== 'serif' && bodyFontCategory === 'serif') {
        classes = clsx(classes, 'mb-8 text-[1.7rem] leading-tight tracking-tight');
    } else if (titleFontCategory === 'serif' && bodyFontCategory !== 'serif') {
        classes = clsx(classes, 'mb-8 font-serif text-[2.0rem] leading-tight');
    } else {
        classes = clsx(classes, 'mb-8 text-[1.9rem] leading-tight tracking-tight');
    }

    if (titleAlignment === 'center') {
        classes = clsx(classes, 'text-center');
    }

    return classes;
};

// Helper: Process footer content to add security attributes to links
const processFooterContent = (content?: string | null): string => {
    return content ? content.replace(/<a/g, '<a target="_blank" rel="noopener noreferrer"') : '';
};

// Component: Email header section
const EmailHeader: React.FC<{emailHeader: React.ReactNode}> = ({emailHeader}) => (
    <div className="flex-column flex min-h-[77px] justify-center rounded-t-sm border-b border-grey-200 bg-white px-6 text-sm text-grey-700">
        {emailHeader}
    </div>
);

// Component: Header section with icon, title, and subtitle
const HeaderSection: React.FC<{
    headerImage?: string | null;
    headerIcon?: string;
    headerTitle?: string | null;
    headerSubtitle?: string | null;
    headerTextColor?: string;
    secondaryHeaderTextColor?: string;
}> = ({headerImage, headerIcon, headerTitle, headerSubtitle, headerTextColor, secondaryHeaderTextColor}) => {
    const showHeader = headerIcon || headerTitle;

    if (!showHeader && !headerImage) return null;

    return (
        <div className="px-[7rem]">
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

// Component: Post title section with metadata
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
    currentDate
}) => {
    if (!showPostTitleSection) return null;

    const excerptClasses = buildExcerptClasses(titleFontCategory, bodyFontCategory, titleAlignment);

    return (
        <div className={clsx('flex flex-col py-8', titleAlignment === 'center' ? 'items-center' : 'items-start')}>
            <h2
                className={clsx(
                    'text-4xl font-bold leading-supertight text-black',
                    getFontFamilyClass(titleFontCategory),
                    getFontWeightClass(titleFontWeight),
                    titleAlignment === 'center' ? 'text-center' : 'text-left',
                    showExcerpt ? 'mb-2' : 'mb-8'
                )}
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

// Component: Feature image with caption
const FeatureImageSection: React.FC<{
    showFeatureImage: boolean;
    showPostTitleSection: boolean;
    imageCorners?: string;
    secondaryHeaderTextColor?: string;
}> = ({showFeatureImage, showPostTitleSection, imageCorners, secondaryHeaderTextColor}) => {
    if (!showFeatureImage) return null;

    return (
        <>
            <div className={clsx('h-[unset] w-full max-w-[600px] bg-cover bg-no-repeat', showPostTitleSection ? '' : 'pt-6')}>
                <img alt="Feature" className={clsx('min-h-full min-w-full shrink-0', getImageCornerClass(imageCorners))} src={CoverImage} />
            </div>
            <div className="mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700" style={{color: secondaryHeaderTextColor}}>
                Feature image caption
            </div>
        </>
    );
};

// Component: Main content section with text and CTA button
const ContentSection: React.FC<{
    showFeatureImage: boolean;
    showPostTitleSection: boolean;
    bodyFontCategory?: string;
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    accentColor?: string;
    linkStyle?: string;
    buttonCorners?: string;
    buttonStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    titleFontCategory?: string;
    titleFontWeight?: string;
}> = ({
    showFeatureImage,
    showPostTitleSection,
    bodyFontCategory,
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    accentColor,
    linkStyle,
    buttonCorners,
    buttonStyle,
    buttonColor,
    buttonTextColor,
    titleFontCategory,
    titleFontWeight
}) => {
    const dividerClasses = getDividerStyleClass(dividerStyle);
    const linkClasses = getLinkStyleClass(linkStyle);

    return (
        <div
            className={clsx(
                'max-w-[600px] border-b border-grey-200 pb-[52px] leading-[27.2px] text-black',
                dividerClasses,
                bodyFontCategory === 'serif' ? 'font-serif text-[1.8rem]' : 'text-[1.7rem] tracking-tight',
                (showFeatureImage || showPostTitleSection) ? '' : 'pt-8'
            )}
            style={{borderColor: dividerColor}}
        >
            <p className="mb-6" style={{color: textColor}}>
                This is what your content will look like when you send one of your posts as an email newsletter to your subscribers.
            </p>
            <p className="mb-6" style={{color: textColor}}>
                Over there on the right you&apos;ll see some settings that allow you to customize the look and feel of this template – from colors and typography to layout and buttons – to make it perfectly suited to your brand.
            </p>
            <p className="mb-[52px]" style={{color: textColor}}>
                Email templates are exceptionally finnicky to make, but we&apos;ve spent a long time optimising this one to make it work beautifully across devices, email clients and content types. So, you can trust that every email you send with Ghost will look great and work well. Just like the rest of your site.
            </p>
            <hr className={clsx('my-[52px] border-[#e0e7eb]', dividerClasses)} style={{borderColor: dividerColor}} />
            <h3
                className={clsx(
                    'mb-[13px] text-[2.6rem] leading-supertight',
                    getFontFamilyClass(titleFontCategory),
                    getFontWeightClass(titleFontWeight)
                )}
                style={{color: sectionTitleColor}}
            >
                Need inspiration?
            </h3>
            <p className="mb-[27px]" style={{color: textColor}}>
                We&apos;ve put together a{' '}
                <a
                    className={linkClasses}
                    href="https://ghost.org/help/email-design/"
                    rel="noopener noreferrer"
                    style={{color: linkColor || accentColor}}
                    target="_blank"
                >
                    quick guide
                </a>{' '}
                that walks through all of the available settings, along with a few examples of what&apos;s possible.
            </p>
            <a
                className={clsx(
                    'inline-block border px-[18px] py-2 font-sans text-[15px]',
                    getButtonCornerClass(buttonCorners),
                    buttonStyle === 'outline' ? 'bg-transparent' : 'border-transparent text-white',
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
};

// Component: Feedback and comment CTA buttons
const FeedbackSection: React.FC<{
    showFeedback: boolean;
    showCommentCta: boolean;
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
}> = ({showFeedback, showCommentCta, dividerStyle, dividerColor, textColor}) => {
    if (!showFeedback && !showCommentCta) return null;

    const dividerClasses = getDividerStyleClass(dividerStyle);

    return (
        <div
            className={clsx('grid gap-5 border-b border-grey-200 px-6 py-5', dividerClasses)}
            style={{borderColor: dividerColor}}
        >
            <div className="flex justify-center gap-3">
                {showFeedback && (
                    <>
                        <button className="pointer-events-none cursor-default whitespace-nowrap rounded-[2.2rem] bg-transparent font-semibold" type="button">
                            <span className="inline-flex items-center gap-2 px-[18px] py-[7px]" style={{color: textColor}}>
                                <Icon colorClass="" name="thumbs-up" size="md" />
                                <span>More like this</span>
                            </span>
                        </button>
                        <button className="pointer-events-none cursor-default whitespace-nowrap rounded-[2.2rem] bg-transparent font-semibold" type="button">
                            <span className="inline-flex items-center gap-2 px-[18px] py-[7px]" style={{color: textColor}}>
                                <Icon colorClass="" name="thumbs-down" />
                                <span>Less like this</span>
                            </span>
                        </button>
                    </>
                )}
                {showCommentCta && (
                    <button className="pointer-events-none cursor-default whitespace-nowrap rounded-[2.2rem] bg-transparent font-semibold" type="button">
                        <span className="inline-flex items-center gap-2 px-[18px] py-[7px]" style={{color: textColor}}>
                            <Icon colorClass="" name="comment" />
                            <span>Comment</span>
                        </span>
                    </button>
                )}
            </div>
        </div>
    );
};

// Component: Latest posts section
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

    const dividerClasses = getDividerStyleClass(dividerStyle);
    const postImages = [LatestPosts1, LatestPosts2, LatestPosts3];
    const postTitles = [
        'The three latest posts published on your site',
        'Displayed at the bottom of each newsletter',
        'To keep your work front and center'
    ];
    const postDescriptions = [
        'Posts sent as an email only will never be shown here.',
        'Giving your readers one more place to discover your stories.',
        'Making sure that your audience stays engaged.'
    ];

    return (
        <div className={clsx('border-b border-grey-200 py-6', dividerClasses)} style={{borderColor: dividerColor}}>
            <h3 className="mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black" style={{color: textColor}}>
                Keep reading
            </h3>
            {postImages.map((image, index) => (
                <div key={index} className="flex justify-between gap-4 py-2">
                    <div>
                        <h4
                            className={clsx(
                                'mt-0.5 text-[1.9rem] text-black',
                                getFontFamilyClass(titleFontCategory),
                                getFontWeightClass(titleFontWeight)
                            )}
                            style={{color: sectionTitleColor}}
                        >
                            {postTitles[index]}
                        </h4>
                        <p className="m-0 text-base text-grey-700" style={{color: secondaryTextColor}}>
                            {postDescriptions[index]}
                        </p>
                    </div>
                    <div className="aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat">
                        <img alt="Latest post" className={getImageCornerClass(imageCorners)} src={image} />
                    </div>
                </div>
            ))}
        </div>
    );
};

// Component: Subscription details section
const SubscriptionDetailsSection: React.FC<{
    showSubscriptionDetails: boolean;
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    linkColor?: string;
    accentColor?: string;
    linkStyle?: string;
    siteTitle?: string;
}> = ({showSubscriptionDetails, dividerStyle, dividerColor, textColor, linkColor, accentColor, linkStyle, siteTitle}) => {
    if (!showSubscriptionDetails) return null;

    const dividerClasses = getDividerStyleClass(dividerStyle);
    const linkClasses = getLinkStyleClass(linkStyle);

    return (
        <div className={clsx('border-b border-grey-200 py-8', dividerClasses)} style={{borderColor: dividerColor}}>
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
                <span className={clsx('w-full self-end whitespace-nowrap text-right text-base', linkClasses)} style={{color: linkColor || accentColor}}>
                    Manage subscription
                </span>
            </div>
        </div>
    );
};

// Component: Footer section with branding and unsubscribe
const FooterSection: React.FC<{
    processedFooterContent: string;
    secondaryTextColor?: string;
    siteTitle?: string;
    currentYear: number;
    showBadge?: boolean;
    textColor?: string;
}> = ({processedFooterContent, secondaryTextColor, siteTitle, currentYear, showBadge, textColor}) => (
    <div className="flex flex-col items-center pt-10">
        <div
            dangerouslySetInnerHTML={{__html: processedFooterContent || ''}}
            className="text break-words px-8 py-3 text-center text-[1.3rem] leading-base text-grey-700 [&_a]:underline"
            style={{color: secondaryTextColor}}
        />
        <div className="px-8 pb-14 pt-3 text-center text-[1.3rem] text-grey-700">
            <span style={{color: secondaryTextColor}}>{siteTitle} © {currentYear} &mdash; </span>
            <span className="pointer-events-none cursor-auto underline" style={{color: secondaryTextColor}}>
                Unsubscribe
            </span>
        </div>
        {showBadge && (
            <div className="flex flex-col items-center pb-[40px] pt-[10px]">
                <a className="pointer-events-none inline-flex cursor-auto items-center px-2 py-1 text-[1.25rem] font-semibold tracking-tight text-grey-900" href="https://ghost.org" style={{color: textColor}}>
                    <GhostOrb className="mr-[6px] size-4" />
                    <span>Powered by Ghost</span>
                </a>
            </div>
        )}
    </div>
);

const NewsletterPreviewContent: React.FC<NewsletterPreviewContentProps> = (props) => {
    const {config} = useGlobalData();

    const currentDate = new Date().toLocaleDateString('default', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    const currentYear = new Date().getFullYear();

    const emailHeader = buildEmailHeader(
        isManagedEmail(config),
        props.senderName,
        props.senderEmail,
        props.senderReplyTo
    );

    const processedFooterContent = processFooterContent(props.footerContent);

    return (
        <div className="relative flex grow flex-col">
            <div className="absolute inset-0 m-5 flex items-center justify-center">
                <div className="mx-auto my-0 flex max-h-full w-full max-w-[700px] flex-col overflow-hidden rounded-[4px] text-black shadow-sm">
                    <EmailHeader emailHeader={emailHeader} />

                    <div className="overflow-y-auto text-sm" style={{backgroundColor: props.backgroundColor}}>
                        <div style={{backgroundColor: props.headerBackgroundColor}}>
                            <HeaderSection
                                headerImage={props.headerImage}
                                headerIcon={props.headerIcon}
                                headerTitle={props.headerTitle}
                                headerSubtitle={props.headerSubtitle}
                                headerTextColor={props.headerTextColor}
                                secondaryHeaderTextColor={props.secondaryHeaderTextColor}
                            />

                            <div className="px-[7rem]">
                                <PostTitleSection
                                    showPostTitleSection={props.showPostTitleSection}
                                    showExcerpt={props.showExcerpt}
                                    titleAlignment={props.titleAlignment}
                                    titleFontCategory={props.titleFontCategory}
                                    titleFontWeight={props.titleFontWeight}
                                    bodyFontCategory={props.bodyFontCategory}
                                    authorPlaceholder={props.authorPlaceholder}
                                    postTitleColor={props.postTitleColor}
                                    headerTextColor={props.headerTextColor}
                                    secondaryHeaderTextColor={props.secondaryHeaderTextColor}
                                    currentDate={currentDate}
                                />

                                <FeatureImageSection
                                    showFeatureImage={props.showFeatureImage}
                                    showPostTitleSection={props.showPostTitleSection}
                                    imageCorners={props.imageCorners}
                                    secondaryHeaderTextColor={props.secondaryHeaderTextColor}
                                />
                            </div>
                        </div>

                        <div className={clsx('px-[7rem]', props.headerBackgroundColor !== 'transparent' && 'pt-10')}>
                            <ContentSection
                                showFeatureImage={props.showFeatureImage}
                                showPostTitleSection={props.showPostTitleSection}
                                bodyFontCategory={props.bodyFontCategory}
                                dividerStyle={props.dividerStyle}
                                dividerColor={props.dividerColor}
                                textColor={props.textColor}
                                sectionTitleColor={props.sectionTitleColor}
                                linkColor={props.linkColor}
                                accentColor={props.accentColor}
                                linkStyle={props.linkStyle}
                                buttonCorners={props.buttonCorners}
                                buttonStyle={props.buttonStyle}
                                buttonColor={props.buttonColor}
                                buttonTextColor={props.buttonTextColor}
                                titleFontCategory={props.titleFontCategory}
                                titleFontWeight={props.titleFontWeight}
                            />

                            <FeedbackSection
                                showFeedback={props.showFeedback}
                                showCommentCta={props.showCommentCta}
                                dividerStyle={props.dividerStyle}
                                dividerColor={props.dividerColor}
                                textColor={props.textColor}
                            />

                            <LatestPostsSection
                                showLatestPosts={props.showLatestPosts}
                                dividerStyle={props.dividerStyle}
                                dividerColor={props.dividerColor}
                                textColor={props.textColor}
                                sectionTitleColor={props.sectionTitleColor}
                                secondaryTextColor={props.secondaryTextColor}
                                titleFontCategory={props.titleFontCategory}
                                titleFontWeight={props.titleFontWeight}
                                imageCorners={props.imageCorners}
                            />

                            <SubscriptionDetailsSection
                                showSubscriptionDetails={props.showSubscriptionDetails}
                                dividerStyle={props.dividerStyle}
                                dividerColor={props.dividerColor}
                                textColor={props.textColor}
                                linkColor={props.linkColor}
                                accentColor={props.accentColor}
                                linkStyle={props.linkStyle}
                                siteTitle={props.siteTitle}
                            />

                            <FooterSection
                                processedFooterContent={processedFooterContent}
                                secondaryTextColor={props.secondaryTextColor}
                                siteTitle={props.siteTitle}
                                currentYear={currentYear}
                                showBadge={props.showBadge}
                                textColor={props.textColor}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NewsletterPreviewContent;
```