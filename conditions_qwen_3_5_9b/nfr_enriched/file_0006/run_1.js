import CoverImage from '../../../../assets/images/user-cover.jpg';
import LatestPosts1 from '../../../../assets/images/latest-posts-1.jpg';
import LatestPosts2 from '../../../../assets/images/latest-posts-2.jpg';
import LatestPosts3 from '../../../../assets/images/latest-posts-3.jpg';
import clsx from 'clsx';
import {GhostOrb, Icon} from '@tryghost/admin-x-design-system';
import {isManagedEmail} from '@tryghost/admin-x-framework/api/config';
import {useGlobalData} from '../../../providers/global-data-provider';

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
    buttonCorners,
    buttonStyle,
    imageCorners,
    linkStyle,
    dividerStyle
}) => {
    const showHeader = headerIcon || headerTitle;
    const {config} = useGlobalData();
    const currentDate = new Date().toLocaleDateString('default', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    const currentYear = new Date().getFullYear();

    const processedFooterContent = footerContent ? footerContent.replace(/<a/g, '<a target="_blank" rel="noopener noreferrer"') : '';
    const emailHeader = buildEmailHeader(senderName, senderEmail, senderReplyTo, config);
    const excerptClasses = buildExcerptClasses(titleFontCategory, bodyFontCategory, titleAlignment);

    return (
        <div className="relative flex grow flex-col">
            <div className="absolute inset-0 m-5 flex items-center justify-center">
                <div className="mx-auto my-0 flex max-h-full w-full max-w-[700px] flex-col overflow-hidden rounded-[4px] text-black shadow-sm">
                    <NewsletterHeader emailHeader={emailHeader} />
                    <NewsletterContent
                        backgroundColor={backgroundColor}
                        headerBackgroundColor={headerBackgroundColor}
                        headerImage={headerImage}
                        showHeader={showHeader}
                        headerIcon={headerIcon}
                        headerTitle={headerTitle}
                        headerSubtitle={headerSubtitle}
                        showPostTitleSection={showPostTitleSection}
                        showExcerpt={showExcerpt}
                        titleAlignment={titleAlignment}
                        titleFontCategory={titleFontCategory}
                        titleFontWeight={titleFontWeight}
                        bodyFontCategory={bodyFontCategory}
                        authorPlaceholder={authorPlaceholder}
                        excerptClasses={excerptClasses}
                        postTitleColor={postTitleColor}
                        secondaryHeaderTextColor={secondaryHeaderTextColor}
                        currentDate={currentDate}
                        showFeatureImage={showFeatureImage}
                        imageCorners={imageCorners}
                        dividerStyle={dividerStyle}
                        dividerColor={dividerColor}
                        textColor={textColor}
                        sectionTitleColor={sectionTitleColor}
                        linkColor={linkColor}
                        linkStyle={linkStyle}
                        buttonColor={buttonColor}
                        buttonTextColor={buttonTextColor}
                        buttonStyle={buttonStyle}
                        buttonCorners={buttonCorners}
                        showFeedback={showFeedback}
                        showCommentCta={showCommentCta}
                        showLatestPosts={showLatestPosts}
                        showSubscriptionDetails={showSubscriptionDetails}
                        siteTitle={siteTitle}
                        footerContent={processedFooterContent}
                        showBadge={showBadge}
                        secondaryTextColor={secondaryTextColor}
                        currentYear={currentYear}
                    />
                </div>
            </div>
        </div>
    );
};

const buildEmailHeader = (senderName: string | undefined, senderEmail: string | null, senderReplyTo: string | null, config: any): React.ReactNode => {
    if (isManagedEmail(config)) {
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

const buildExcerptClasses = (titleFontCategory: string | undefined, bodyFontCategory: string | undefined, titleAlignment: string | undefined): string => {
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

const NewsletterHeader: React.FC<{emailHeader: React.ReactNode}> = ({emailHeader}) => (
    <div className="flex-column flex min-h-[77px] justify-center rounded-t-sm border-b border-grey-200 bg-white px-6 text-sm text-grey-700">
        {emailHeader}
    </div>
);

const NewsletterContent: React.FC<{
    backgroundColor?: string;
    headerBackgroundColor?: string;
    headerImage?: string | null;
    showHeader: boolean;
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
    excerptClasses: string;
    postTitleColor?: string;
    secondaryHeaderTextColor?: string;
    currentDate: string;
    showFeatureImage: boolean;
    imageCorners?: string;
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    backgroundColor,
    headerBackgroundColor,
    headerImage,
    showHeader,
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
    excerptClasses,
    postTitleColor,
    secondaryHeaderTextColor,
    currentDate,
    showFeatureImage,
    imageCorners,
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <div className="overflow-y-auto text-sm" style={{backgroundColor}}>
        <NewsletterMainContent
            headerBackgroundColor={headerBackgroundColor}
            headerImage={headerImage}
            showHeader={showHeader}
            headerIcon={headerIcon}
            headerTitle={headerTitle}
            headerSubtitle={headerSubtitle}
            showPostTitleSection={showPostTitleSection}
            showExcerpt={showExcerpt}
            titleAlignment={titleAlignment}
            titleFontCategory={titleFontCategory}
            titleFontWeight={titleFontWeight}
            bodyFontCategory={bodyFontCategory}
            authorPlaceholder={authorPlaceholder}
            excerptClasses={excerptClasses}
            postTitleColor={postTitleColor}
            secondaryHeaderTextColor={secondaryHeaderTextColor}
            showFeatureImage={showFeatureImage}
            imageCorners={imageCorners}
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </div>
);

const NewsletterMainContent: React.FC<{
    headerBackgroundColor?: string;
    headerImage?: string | null;
    showHeader: boolean;
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
    excerptClasses: string;
    postTitleColor?: string;
    secondaryHeaderTextColor?: string;
    showFeatureImage: boolean;
    imageCorners?: string;
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    headerBackgroundColor,
    headerImage,
    showHeader,
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
    excerptClasses,
    postTitleColor,
    secondaryHeaderTextColor,
    showFeatureImage,
    imageCorners,
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <div className="px-[7rem]" style={{backgroundColor: headerBackgroundColor}}>
            <NewsletterHeaderSection
                headerImage={headerImage}
                showHeader={showHeader}
                headerIcon={headerIcon}
                headerTitle={headerTitle}
                headerSubtitle={headerSubtitle}
                showPostTitleSection={showPostTitleSection}
                showExcerpt={showExcerpt}
                titleAlignment={titleAlignment}
                titleFontCategory={titleFontCategory}
                titleFontWeight={titleFontWeight}
                bodyFontCategory={bodyFontCategory}
                authorPlaceholder={authorPlaceholder}
                excerptClasses={excerptClasses}
                postTitleColor={postTitleColor}
                secondaryHeaderTextColor={secondaryHeaderTextColor}
                currentDate={new Date().toLocaleDateString('default', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                })}
                showFeatureImage={showFeatureImage}
                imageCorners={imageCorners}
            />
        </div>

        <NewsletterBody
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterHeaderSection: React.FC<{
    headerImage?: string | null;
    showHeader: boolean;
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
    excerptClasses: string;
    postTitleColor?: string;
    secondaryHeaderTextColor?: string;
    currentDate: string;
    showFeatureImage: boolean;
    imageCorners?: string;
}> = ({
    headerImage,
    showHeader,
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
    excerptClasses,
    postTitleColor,
    secondaryHeaderTextColor,
    currentDate,
    showFeatureImage,
    imageCorners
}) => (
    <>
        {headerImage && (
            <div>
                <img alt="" className="mb-4 block pt-6" src={headerImage} />
            </div>
        )}
        {showHeader && (
            <div className="py-3">
                {headerIcon && <img alt="" className="mx-auto mb-2 size-10" role="presentation" src={headerIcon} />}
                {headerTitle && <h4 className="mb-1 text-center text-[1.6rem] font-bold uppercase leading-tight tracking-tight text-grey-900">{headerTitle}</h4>}
                {headerSubtitle && <h5 className="mb-1 text-center text-[1.3rem] font-normal text-grey-700">{headerSubtitle}</h5>}
            </div>
        )}
        {showPostTitleSection && (
            <div className={clsx('flex flex-col py-8', titleAlignment === 'center' ? 'items-center' : 'items-start')}>
                <h2 className={clsx(
                    'text-4xl font-bold leading-supertight text-black',
                    titleFontCategory === 'serif' && 'font-serif',
                    titleFontWeight === 'normal' && 'font-normal',
                    titleFontWeight === 'medium' && 'font-medium',
                    titleFontWeight === 'semibold' && 'font-semibold',
                    titleFontWeight === 'bold' && 'font-bold',
                    titleAlignment === 'center' ? 'text-center' : 'text-left',
                    showExcerpt ? 'mb-2' : 'mb-8'
                )} style={{color: postTitleColor}}>Your email newsletter</h2>
                {showExcerpt && (
                    <p className={excerptClasses}>{'A subtitle to highlight key points and engage your readers.'}</p>
                )}
                <div className={clsx(
                    'flex w-full justify-between text-center text-md leading-none text-grey-700',
                    titleAlignment === 'center' ? 'flex-col gap-1' : 'flex-row'
                )}>
                    <p className="pb-1 text-[1.3rem]" style={{color: secondaryHeaderTextColor}}>
                        By {authorPlaceholder}
                        <span className="before:pl-0.5 before:pr-1 before:content-['•']">{currentDate}</span>
                    </p>
                    <p className="pb-1 text-[1.3rem] underline" style={{color: secondaryHeaderTextColor}}>View in browser</p>
                </div>
            </div>
        )}
        {showFeatureImage && (
            <>
                <div className={clsx(
                    'h-[unset] w-full max-w-[600px] bg-cover bg-no-repeat',
                    showPostTitleSection ? '' : 'pt-6'
                )}>
                    <img alt="Feature" className={clsx(
                        'min-h-full min-w-full shrink-0',
                        imageCorners === 'square' && 'rounded-none',
                        imageCorners === 'rounded' && 'rounded-md'
                    )} src={CoverImage} />
                </div>
                <div className="mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700">Feature image caption</div>
            </>
        )}
    </>
);

const NewsletterBody: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterDividerSection
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterDividerSection: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentSection
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
        <NewsletterFooterSection
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            footerContent={footerContent}
            siteTitle={siteTitle}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentSection: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterTextSection
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterTextSection: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterMainText
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterMainText: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlock
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlock: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}
            linkColor={linkColor}
            linkStyle={linkStyle}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
            buttonStyle={buttonStyle}
            buttonCorners={buttonCorners}
            showFeedback={showFeedback}
            showCommentCta={showCommentCta}
            showLatestPosts={showLatestPosts}
            showSubscriptionDetails={showSubscriptionDetails}
            siteTitle={siteTitle}
            footerContent={footerContent}
            showBadge={showBadge}
            secondaryTextColor={secondaryTextColor}
            currentYear={currentYear}
        />
    </>
);

const NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
    sectionTitleColor?: string;
    linkColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonStyle?: string;
    buttonCorners?: string;
    showFeedback: boolean;
    showCommentCta: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    siteTitle?: string;
    footerContent?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    currentYear: number;
}> = ({
    dividerStyle,
    dividerColor,
    textColor,
    sectionTitleColor,
    linkColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    buttonCorners,
    showFeedback,
    showCommentCta,
    showLatestPosts,
    showSubscriptionDetails,
    siteTitle,
    footerContent,
    showBadge,
    secondaryTextColor,
    currentYear
}) => (
    <>
        <NewsletterContentBlockInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInnerInner
            dividerStyle={dividerStyle}
            dividerColor={dividerColor}
            textColor={textColor}
            sectionTitleColor={sectionTitleColor}