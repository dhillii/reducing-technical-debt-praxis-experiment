```tsx
import CoverImage from '../../../../assets/images/user-cover.jpg';
import LatestPosts1 from '../../../../assets/images/latest-posts-1.jpg';
import LatestPosts2 from '../../../../assets/images/latest-posts-2.jpg';
import LatestPosts3 from '../../../../assets/images/latest-posts-3.jpg';
import clsx from 'clsx';
import {GhostOrb, Icon} from '@tryghost/admin-x-design-system';
import {isManagedEmail} from '@tryghost/admin-x-framework/api/config';
import {useGlobalData} from '../../../providers/global-data-provider';

type Props = {
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

const EmailHeader = ({
    senderName,
    senderEmail,
    senderReplyTo,
    isManaged
}: Pick<Props, 'senderName' | 'senderEmail' | 'senderReplyTo'> & {isManaged: boolean}) => {
    if (isManaged) {
        return (
            <>
                <p className="leading-normal">
                    <span className="font-semibold text-grey-900">From: </span>
                    <span>{senderName} ({senderEmail})</span>
                </p>
                <p className="leading-normal">
                    <span className="font-semibold text-grey-900">Reply‑to: </span>
                    {senderReplyTo ?? senderEmail}
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

const HeaderSection = ({
    headerImage,
    headerIcon,
    headerTitle,
    headerSubtitle,
    headerBackgroundColor,
    headerTextColor,
    secondaryHeaderTextColor
}: Pick<Props, 'headerImage' | 'headerIcon' | 'headerTitle' | 'headerSubtitle' | 'headerBackgroundColor' | 'headerTextColor' | 'secondaryHeaderTextColor'>) => {
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
        </div>
    );
};

const getExcerptClasses = ({
    titleFontCategory,
    bodyFontCategory,
    titleAlignment
}: Pick<Props, 'titleFontCategory' | 'bodyFontCategory' | 'titleAlignment'>) => {
    let base = 'mb-5 text-pretty leading-[1.7] text-black';
    if (titleFontCategory === 'serif' && bodyFontCategory === 'serif') {
        base = clsx(base, 'mb-8 font-serif text-[2.0rem] leading-tight');
    } else if (titleFontCategory !== 'serif' && bodyFontCategory === 'serif') {
        base = clsx(base, 'mb-8 text-[1.7rem] leading-tight tracking-tight');
    } else if (titleFontCategory === 'serif' && bodyFontCategory !== 'serif') {
        base = clsx(base, 'mb-8 font-serif text-[2.0rem] leading-tight');
    } else {
        base = clsx(base, 'mb-8 text-[1.9rem] leading-tight tracking-tight');
    }
    return titleAlignment === 'center' ? clsx(base, 'text-center') : base;
};

const PostTitleSection = ({
    showPostTitleSection,
    showExcerpt,
    titleAlignment,
    titleFontCategory,
    titleFontWeight,
    titleColor,
    excerptClasses,
    headerTextColor,
    authorPlaceholder,
    currentDate,
    secondaryHeaderTextColor
}: {
    showPostTitleSection: boolean;
    showExcerpt: boolean;
    titleAlignment?: string;
    titleFontCategory?: string;
    titleFontWeight?: string;
    titleColor?: string;
    excerptClasses: string;
    headerTextColor?: string;
    authorPlaceholder?: string;
    currentDate: string;
    secondaryHeaderTextColor?: string;
}) => {
    if (!showPostTitleSection) return null;

    const alignmentCls = titleAlignment === 'center' ? 'items-center' : 'items-start';
    const titleCls = clsx(
        'text-4xl font-bold leading-supertight text-black',
        titleFontCategory === 'serif' && 'font-serif',
        titleFontWeight && `font-${titleFontWeight}`,
        titleAlignment === 'center' ? 'text-center' : 'text-left',
        showExcerpt ? 'mb-2' : 'mb-8'
    );

    const metaCls = clsx(
        'flex w-full justify-between text-center text-md leading-none text-grey-700',
        titleAlignment === 'center' ? 'flex-col gap-1' : 'flex-row'
    );

    return (
        <div className={clsx('flex flex-col py-8', alignmentCls)}>
            <h2 className={titleCls} style={{color: titleColor}}>
                Your email newsletter
            </h2>
            {showExcerpt && (
                <p className={excerptClasses} style={{color: headerTextColor}}>
                    A subtitle to highlight key points and engage your readers.
                </p>
            )}
            <div className={metaCls}>
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

const FeatureImage = ({
    showFeatureImage,
    imageCorners,
    postTitleSectionVisible,
    headerTextColor,
    secondaryHeaderTextColor
}: Pick<Props, 'showFeatureImage' | 'imageCorners' | 'headerTextColor' | 'secondaryHeaderTextColor'> & {postTitleSectionVisible: boolean}) => {
    if (!showFeatureImage) return null;
    return (
        <>
            <div
                className={clsx(
                    'h-[unset] w-full max-w-[600px] bg-cover bg-no-repeat',
                    postTitleSectionVisible ? '' : 'pt-6'
                )}
            >
                <img
                    alt="Feature"
                    className={clsx(
                        'min-h-full min-w-full shrink-0',
                        imageCorners === 'square' && 'rounded-none',
                        imageCorners === 'rounded' && 'rounded-md'
                    )}
                    src={CoverImage}
                />
            </div>
            <div
                className="mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700"
                style={{color: secondaryHeaderTextColor}}
            >
                Feature image caption
            </div>
        </>
    );
};

const ContentBody = ({
    backgroundColor,
    headerBackgroundColor,
    dividerStyle,
    dividerColor,
    bodyFontCategory,
    textColor,
    sectionTitleColor,
    linkColor,
    accentColor,
    buttonStyle,
    buttonCorners,
    buttonColor,
    buttonTextColor,
    linkStyle
}: Pick<
    Props,
    | 'backgroundColor'
    | 'headerBackgroundColor'
    | 'dividerStyle'
    | 'dividerColor'
    | 'bodyFontCategory'
    | 'textColor'
    | 'sectionTitleColor'
    | 'linkColor'
    | 'accentColor'
    | 'buttonStyle'
    | 'buttonCorners'
    | 'buttonColor'
    | 'buttonTextColor'
    | 'linkStyle'
>) => {
    const bodyCls = clsx(
        'max-w-[600px] border-b border-grey-200 pb-[52px] leading-[27.2px] text-black',
        dividerStyle === 'dashed' && 'border-dashed',
        dividerStyle === 'dotted' && 'border-b-2 border-dotted',
        bodyFontCategory === 'serif' ? 'font-serif text-[1.8rem]' : 'text-[1.7rem] tracking-tight'
    );

    const linkCls = clsx(linkStyle === 'underline' && 'underline', linkStyle === 'bold' && 'font-bold');

    const buttonCls = clsx(
        'inline-block border px-[18px] py-2 font-sans text-[15px]',
        buttonCorners === 'rounded' && 'rounded-[6px]',
        buttonCorners === 'pill' && 'rounded-full',
        buttonCorners === 'square' && 'rounded-none',
        buttonStyle === 'outline' ? 'bg-transparent' : 'border-transparent text-white',
        linkStyle === 'bold' ? 'font-bold' : 'font-semibold'
    );

    const buttonStyleObj =
        buttonStyle === 'outline'
            ? {borderColor: buttonColor || accentColor, color: buttonColor || accentColor}
            : {backgroundColor: buttonColor || accentColor, color: buttonTextColor};

    return (
        <div className="overflow-y-auto text-sm" style={{backgroundColor}}>
            <div className={clsx('px-[7rem]', headerBackgroundColor !== 'transparent' && 'pt-10')}>
                <div className={bodyCls} style={{borderColor: dividerColor}}>
                    <p className="mb-6" style={{color: textColor}}>
                        This is what your content will look like when you send one of your posts as an email
                        newsletter to your subscribers.
                    </p>
                    <p className="mb-6" style={{color: textColor}}>
                        Over there on the right you&apos;ll see some settings that allow you to customize the
                        look and feel of this template – from colors and typography to layout and buttons –
                        to make it perfectly suited to your brand.
                    </p>
                    <p className="mb-[52px]" style={{color: textColor}}>
                        Email templates are exceptionally finnicky to make, but we&apos;ve spent a long time
                        optimising this one to make it work beautifully across devices, email clients and
                        content types. So, you can trust that every email you send with Ghost will look great
                        and work well. Just like the rest of your site.
                    </p>
                    <hr
                        className={clsx(
                            'my-[52px] border-[#e0e7eb]',
                            dividerStyle === 'dashed' && 'border-dashed',
                            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
                        )}
                        style={{borderColor: dividerColor}}
                    />
                    <h3
                        className={clsx(
                            'mb-[13px] text-[2.6rem] leading-supertight',
                            // title font handled by parent
                        )}
                        style={{color: sectionTitleColor}}
                    >
                        Need inspiration?
                    </h3>
                    <p className="mb-[27px]" style={{color: textColor}}>
                        We&apos;ve put together a{' '}
                        <a
                            className={linkCls}
                            href="https://ghost.org/help/email-design/"
                            rel="noopener noreferrer"
                            style={{color: linkColor || accentColor}}
                            target="_blank"
                        >
                            quick guide
                        </a>{' '}
                        that walks through all of the available settings, along with a few examples of
                        what&apos;s possible.
                    </p>
                    <a
                        className={buttonCls}
                        href="https://ghost.org/help/email-design/"
                        rel="noopener noreferrer"
                        style={buttonStyleObj}
                        target="_blank"
                    >
                        Learn more
                    </a>
                </div>
            </div>
        </div>
    );
};

const FeedbackSection = ({
    showFeedback,
    showCommentCta,
    dividerStyle,
    dividerColor,
    textColor
}: Pick<Props, 'showFeedback' | 'showCommentCta' | 'dividerStyle' | 'dividerColor' | 'textColor'>) => {
    if (!showFeedback && !showCommentCta) return null;
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
};

const LatestPostsSection = ({
    showLatestPosts,
    titleFontCategory,
    titleFontWeight,
    imageCorners,
    dividerStyle,
    dividerColor,
    textColor,
    secondaryTextColor,
    sectionTitleColor
}: Pick<
    Props,
    | 'showLatestPosts'
    | 'titleFontCategory'
    | 'titleFontWeight'
    | 'imageCorners'
    | 'dividerStyle'
    | 'dividerColor'
    | 'textColor'
    | 'secondaryTextColor'
    | 'sectionTitleColor'
>) => {
    if (!showLatestPosts) return null;

    const headingCls = (base: string) =>
        clsx(
            base,
            titleFontCategory === 'serif' && 'font-serif',
            titleFontWeight && `font-${titleFontWeight}`
        );

    const imgCls = clsx(
        imageCorners === 'square' && 'rounded-none',
        imageCorners === 'rounded' && 'rounded-md'
    );

    const containerCls = clsx(
        'border-b border-grey-200 py-6',
        dividerStyle === 'dashed' && 'border-dashed',
        dividerStyle === 'dotted' && 'border-b-2 border-dotted'
    );

    const posts = [
        {
            title: 'The three latest posts published on your site',
            desc: 'Posts sent as an email only will never be shown here.',
            img: LatestPosts1
        },
        {
            title: 'Displayed at the bottom of each newsletter',
            desc: 'Giving your readers one more place to discover your stories.',
            img: LatestPosts2
        },
        {
            title: 'To keep your work front and center',
            desc: 'Making sure that your audience stays engaged.',
            img: LatestPosts3
        }
    ];

    return (
        <div className={containerCls} style={{borderColor: dividerColor}}>
            <h3
                className="mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black"
                style={{color: textColor}}
            >
                Keep reading
            </h3>
            {posts.map(({title, desc, img}, i) => (
                <div key={i} className="flex justify-between gap-4 py-2">
                    <div>
                        <h4 className={headingCls('mt-0.5 text-[1.9rem] text-black')} style={{color: sectionTitleColor}}>
                            {title}
                        </h4>
                        <p className="m-0 text-base text-grey-700" style={{color: secondaryTextColor}}>
                            {desc}
                        </p>
                    </div>
                    <div className="aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat">
                        <img alt="Latest post" className={imgCls} src={img} />
                    </div>
                </div>
            ))}
        </div>
    );
};

const SubscriptionDetails = ({
    showSubscriptionDetails,
    siteTitle,
    dividerStyle,
    dividerColor,
    textColor,
    linkStyle,
    linkColor,
    accentColor
}: Pick<Props, 'showSubscriptionDetails' | 'siteTitle' | 'dividerStyle' | 'dividerColor' | 'textColor' | 'linkStyle' | 'linkColor' | 'accentColor'>) => {
    if (!showSubscriptionDetails) return null;
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
                You are receiving this because you are a paid subscriber to {siteTitle}. Your subscription will
                renew on 17 Jul 2024.
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
};

const FooterSection = ({
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
    showBadge?: boolean;
    textColor?: string;
}) => (
    <div className="flex flex-col items-center pt-10">
        <div
            dangerouslySetInnerHTML={{__html: processedFooterContent}}
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

const NewsletterPreviewContent: React.FC<Props> = ({
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
    const {config} = useGlobalData();
    const isManaged = isManagedEmail(config);
    const currentDate = new Date().toLocaleDateString('default', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    const currentYear = new Date().getFullYear();
    const processedFooterContent = footerContent
        ? footerContent.replace(/<a/g, '<a target="_blank" rel="noopener noreferrer"')
        : '';

    const excerptClasses = getExcerptClasses({titleFontCategory, bodyFontCategory, titleAlignment});

    return (
        <div className="relative flex grow flex-col">
            <div className="absolute inset-0 m-5 flex items-center justify-center">
                <div className="mx-auto my-0 flex max-h-full w-full max-w-[700px] flex-col overflow-hidden rounded-[4px] text-black shadow-sm">
                    {/* Email header */}
                    <div className="flex-column flex min-h-[77px] justify-center rounded-t-sm border-b border-grey-200 bg-white px-6 text-sm text-grey-700">
                        <EmailHeader
                            senderName={senderName}
                            senderEmail={senderEmail}
                            senderReplyTo={senderReplyTo}
                            isManaged={isManaged}
                        />
                    </div>

                    {/* Email content */}
                    <HeaderSection
                        headerImage={headerImage}
                        headerIcon={headerIcon}
                        headerTitle={headerTitle}
                        headerSubtitle={headerSubtitle}
                        headerBackgroundColor={headerBackgroundColor}
                        headerTextColor={headerTextColor}
                        secondaryHeaderTextColor={secondaryHeaderTextColor}
                    />

                    <PostTitleSection
                        showPostTitleSection={showPostTitleSection}
                        showExcerpt={showExcerpt}
                        titleAlignment={titleAlignment}
                        titleFontCategory={titleFontCategory}
                        titleFontWeight={titleFontWeight}
                        titleColor={postTitleColor}
                        excerptClasses={excerptClasses}
                        headerTextColor={headerTextColor}
                        authorPlaceholder={authorPlaceholder}
                        currentDate={currentDate}
                        secondaryHeaderTextColor={secondaryHeaderTextColor}
                    />

                    <FeatureImage
                        showFeatureImage={showFeatureImage}
                        imageCorners={imageCorners}
                        postTitleSectionVisible={showPostTitleSection}
                        headerTextColor={headerTextColor}
                        secondaryHeaderTextColor={secondaryHeaderTextColor}
                    />

                    <ContentBody
                        backgroundColor={backgroundColor}
                        headerBackgroundColor={headerBackgroundColor}
                        dividerStyle={dividerStyle}
                        dividerColor={dividerColor}
                        bodyFontCategory={bodyFontCategory}
                        textColor={textColor}
                        sectionTitleColor={sectionTitleColor}
                        linkColor={linkColor}
                        accentColor={accentColor}
                        buttonStyle={buttonStyle}
                        buttonCorners={buttonCorners}
                        buttonColor={buttonColor}
                        buttonTextColor={buttonTextColor}
                        linkStyle={linkStyle}
                    />

                    <FeedbackSection
                        showFeedback={showFeedback}
                        showCommentCta={showCommentCta}
                        dividerStyle={dividerStyle}
                        dividerColor={dividerColor}
                        textColor={textColor}
                    />

                    <LatestPostsSection
                        showLatestPosts={showLatestPosts}
                        titleFontCategory={titleFontCategory}
                        titleFontWeight={titleFontWeight}
                        imageCorners={imageCorners}
                        dividerStyle={dividerStyle}
                        dividerColor={dividerColor}
                        textColor={textColor}
                        secondaryTextColor={secondaryTextColor}
                        sectionTitleColor={sectionTitleColor}
                    />

                    <SubscriptionDetails
                        showSubscriptionDetails={showSubscriptionDetails}
                        siteTitle={siteTitle}
                        dividerStyle={dividerStyle}
                        dividerColor={dividerColor}
                        textColor={textColor}
                        linkStyle={linkStyle}
                        linkColor={linkColor}
                        accentColor={accentColor}
                    />

                    <FooterSection
                        processedFooterContent={processedFooterContent}
                        siteTitle={siteTitle}
                        currentYear={currentYear}
                        secondaryTextColor={secondaryTextColor}
                        showBadge={showBadge}
                        textColor={textColor}
                    />
                </div>
            </div>
        </div>
    );
};

export default NewsletterPreviewContent;
```