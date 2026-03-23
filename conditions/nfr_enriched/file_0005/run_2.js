# Refactored NewsletterPreviewContent

Here's the refactored code with reduced complexity through component extraction, helper functions, and consolidated logic:

```typescript
import CoverImage from '../../../../assets/images/user-cover.jpg';
import LatestPosts1 from '../../../../assets/images/latest-posts-1.jpg';
import LatestPosts2 from '../../../../assets/images/latest-posts-2.jpg';
import LatestPosts3 from '../../../../assets/images/latest-posts-3.jpg';
import clsx from 'clsx';
import {GhostOrb, Icon} from '@tryghost/admin-x-design-system';
import {isManagedEmail} from '@tryghost/admin-x-framework/api/config';
import {useGlobalData} from '../../../providers/global-data-provider';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StyleProps {
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
}

interface LayoutProps {
    buttonStyle?: string;
    buttonCorners?: string;
    imageCorners?: string;
    linkStyle?: string;
    dividerStyle?: string;
    titleAlignment?: string;
    titleFontCategory?: string;
    titleFontWeight?: string;
    bodyFontCategory?: string;
}

interface VisibilityProps {
    showPostTitleSection: boolean;
    showExcerpt: boolean;
    showCommentCta: boolean;
    showFeatureImage: boolean;
    showFeedback: boolean;
    showLatestPosts: boolean;
    showSubscriptionDetails: boolean;
    showBadge?: boolean;
}

interface ContentProps {
    senderName?: string;
    senderEmail: string | null;
    senderReplyTo: string | null;
    headerImage?: string | null;
    headerIcon?: string;
    headerTitle?: string | null;
    headerSubtitle?: string | null;
    authorPlaceholder?: string;
    siteTitle?: string;
    footerContent?: string | null;
}

type NewsletterPreviewContentProps = ContentProps & StyleProps & LayoutProps & VisibilityProps;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = () => new Date().toLocaleDateString('default', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
});

const processFooterContent = (content?: string | null): string =>
    content ? content.replace(/<a/g, '<a target="_blank" rel="noopener noreferrer"') : '';

const getTitleFontClasses = (titleFontCategory?: string, titleFontWeight?: string) => clsx(
    titleFontCategory === 'serif' && 'font-serif',
    titleFontCategory === 'sans_serif' && 'font-sans',
    titleFontWeight === 'normal' && 'font-normal',
    titleFontWeight === 'medium' && 'font-medium',
    titleFontWeight === 'semibold' && 'font-semibold',
    titleFontWeight === 'bold' && 'font-bold'
);

const getDividerClasses = (dividerStyle?: string) => clsx(
    'border-b border-grey-200',
    dividerStyle === 'dashed' && 'border-dashed',
    dividerStyle === 'dotted' && 'border-b-2 border-dotted'
);

const getImageCornerClasses = (imageCorners?: string) => clsx(
    imageCorners === 'square' && 'rounded-none',
    imageCorners === 'rounded' && 'rounded-md'
);

const getExcerptClasses = (titleFontCategory?: string, bodyFontCategory?: string, titleAlignment?: string): string => {
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

// ─── Sub-components ───────────────────────────────────────────────────────────

const ManagedEmailHeader: React.FC<{senderName?: string; senderEmail: string | null; senderReplyTo: string | null}> = ({
    senderName,
    senderEmail,
    senderReplyTo
}) => (
    <>
        <p className="leading-normal">
            <span className="font-semibold text-grey-900">From: </span>
            <span>{senderName} ({senderEmail})</span>
        </p>
        <p className="leading-normal">
            <span className="font-semibold text-grey-900">Reply-to: </span>
            {senderReplyTo ?? senderEmail}
        </p>
    </>
);

const StandardEmailHeader: React.FC<{senderName?: string; senderEmail: string | null}> = ({
    senderName,
    senderEmail
}) => (
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

const NewsletterHeader: React.FC<{
    headerIcon?: string;
    headerTitle?: string | null;
    headerSubtitle?: string | null;
    headerTextColor?: string;
    secondaryHeaderTextColor?: string;
}> = ({headerIcon, headerTitle, headerSubtitle, headerTextColor, secondaryHeaderTextColor}) => (
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
);

const PostTitleSection: React.FC<{
    titleAlignment?: string;
    titleFontCategory?: string;
    titleFontWeight?: string;
    showExcerpt: boolean;
    authorPlaceholder?: string;
    postTitleColor?: string;
    headerTextColor?: string;
    secondaryHeaderTextColor?: string;
    bodyFontCategory?: string;
}> = ({
    titleAlignment,
    titleFontCategory,
    titleFontWeight,
    showExcerpt,
    authorPlaceholder,
    postTitleColor,
    headerTextColor,
    secondaryHeaderTextColor,
    bodyFontCategory
}) => {
    const currentDate = formatDate();
    const isCentered = titleAlignment === 'center';

    return (
        <div className={clsx('flex flex-col py-8', isCentered ? 'items-center' : 'items-start')}>
            <h2
                className={clsx(
                    'text-4xl font-bold leading-supertight text-black',
                    getTitleFontClasses(titleFontCategory, titleFontWeight),
                    isCentered ? 'text-center' : 'text-left',
                    showExcerpt ? 'mb-2' : 'mb-8'
                )}
                style={{color: postTitleColor}}
            >
                Your email newsletter
            </h2>

            {showExcerpt && (
                <p
                    className={getExcerptClasses(titleFontCategory, bodyFontCategory, titleAlignment)}
                    style={{color: headerTextColor}}
                >
                    A subtitle to highlight key points and engage your readers.
                </p>
            )}

            <div className={clsx(
                'flex w-full justify-between text-center text-md leading-none text-grey-700',
                isCentered ? 'flex-col gap-1' : 'flex-row'
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
        <div
            className="mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700"
            style={{color: secondaryHeaderTextColor}}
        >
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
    <div
        className={clsx('grid gap-5 px-6 py-5', getDividerClasses(dividerStyle))}
        style={{borderColor: dividerColor}}
    >
        <div className="flex justify-center gap-3">
            {showFeedback && (
                <>
                    <FeedbackButton icon="thumbs-up" label="More like this" textColor={textColor} />
                    <FeedbackButton icon="thumbs-down" label="Less like this" textColor={textColor} />
                </>
            )}
            {showCommentCta && (
                <FeedbackButton icon="comment" label="Comment" textColor={textColor} />
            )}
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
    titleFontCategory?: string;
    titleFontWeight?: string;
    imageCorners?: string;
    sectionTitleColor?: string;
    secondaryTextColor?: string;
    textColor?: string;
    dividerStyle?: string;
    dividerColor?: string;
}> = ({titleFontCategory, titleFontWeight, imageCorners, sectionTitleColor, secondaryTextColor, textColor, dividerStyle, dividerColor}) => (
    <div className={clsx('py-6', getDividerClasses(dividerStyle))} style={{borderColor: dividerColor}}>
        <h3 className="mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black" style={{color: textColor}}>
            Keep reading
        </h3>
        {LATEST_POSTS_DATA.map(post => (
            <LatestPostItem
                key={post.title}
                description={post.description}
                image={post.image}
                imageCorners={imageCorners}
                secondaryTextColor={secondaryTextColor}
                sectionTitleColor={sectionTitleColor}
                title={post.title}
                titleFontCategory={titleFontCategory}
                titleFontWeight={titleFontWeight}
            />
        ))}
    </div>
);

const SubscriptionDetailsSection: React.FC<{
    siteTitle?: string;
    textColor?: string;
    linkColor?: string;
    accentColor?: string;
    linkStyle?: string;
    dividerStyle?: string;
    dividerColor?: string;
}> = ({siteTitle, textColor, linkColor, accentColor, linkStyle, dividerStyle, dividerColor}) => (
    <div className={clsx('py-8', getDividerClasses(dividerStyle))} style={{borderColor: dividerColor}}>
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
                className={clsx('w-full self-end whitespace-nowrap text-right text-base', linkStyle === 'underline' && 'underline', linkStyle === 'bold' && 'font-bold')}
                style={{color: linkColor ?? accentColor}}
            >
                Manage subscription
            </span>
        </div>
    </div>
);

const EmailFooter: React.FC<{
    footerContent?: string | null;
    siteTitle?: string;
    showBadge?: boolean;
    secondaryTextColor?: string;
    textColor?: string;
}> = ({footerContent, siteTitle, showBadge, secondaryTextColor, textColor}) => {
    const currentYear = new Date().getFullYear();

    return (
        <div className="flex flex-col items-center pt-10">
            <div
                dangerouslySetInnerHTML={{__html: processFooterContent(footerContent)}}
                className="text break-words px-8 py-3 text-center text-[1.3rem] leading-base text-grey-700 [&_a]:underline"
                style={{color: secondaryTextColor}}
            />
            <div className="px-8 pb-14 pt-3 text-center text-[1.3rem] text-grey-700">
                <span style={{color: secondaryTextColor}}>{siteTitle} © {currentYear} &mdash; </span>
                <span className="pointer-events-none cursor-auto underline" style={{color: secondaryTextColor}}>Unsubscribe</span>
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
};

const ArticleBody: React.FC<{
    textColor?: string;
    linkColor?: string;
    accentColor?: string;
    linkStyle?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    buttonCorners?: string;
    buttonStyle?: string;
    sectionTitleColor?: string;
    dividerColor?: string;
    dividerStyle?: string;
    titleFontCategory?: string;
    titleFontWeight?: string;
    bodyFontCategory?: string;
    showFeatureImage: boolean;
    showPostTitleSection: boolean;
}> = ({
    textColor,
    linkColor,
    accentColor,
    linkStyle,
    buttonColor,
    buttonTextColor,
    buttonCorners,
    buttonStyle,
    sectionTitleColor,
    dividerColor,
    dividerStyle,
    titleFontCategory,
    titleFontWeight,
    bodyFontCategory,
    showFeatureImage,
    showPostTitleSection
}) => (
    <div
        className={clsx(
            'max-w-[600px] border-b border-grey-200 pb-[52px] leading-[27.2px] text-black',
            getDividerClasses(dividerStyle).replace('border-b border-grey-200', ''),
            bodyFontCategory === 'serif' ? 'font-serif text-[1.8rem]' : 'text-[1.7rem] tracking-tight',
            !(showFeatureImage || showPostTitleSection) && 'pt-8'
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

        <hr
            className={clsx('my-[52px] border-[#e0e7eb]', dividerStyle === 'dashed' && 'border-dashed', dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted')}
            style={{borderColor: dividerColor}}
        />

        <h3
            className={clsx('mb-[13px] text-[2.6rem] leading-supertight', getTitleFontClasses(titleFontCategory, titleFontWeight))}
            style={{color: sectionTitleColor}}
        >
            Need inspiration?
        </h3>

        <p className="mb-[27px]" style={{color: textColor}}>
            We&apos;ve put together a{' '}
            <a
                className={clsx(linkStyle === 'underline' && 'underline', linkStyle === 'bold' && 'font-bold')}
                href="https://ghost.org/help/email-design/"
                rel="noopener noreferrer"
                style={{color: linkColor ?? accentColor}}
                target="_blank"
            >
                quick guide
            </a>
            {' '}that walks through all of the available settings, along with a few examples of what&apos;s possible.
        </p>

        <a
            className={clsx(
                'inline-block border px-[18px] py-2 font-sans text-[15px]',
                buttonCorners === 'rounded' && 'rounded-[6px]',
                buttonCorners === 'pill' && 'rounded-full',
                buttonCorners === 'square' && 'rounded-none',
                buttonStyle === 'outline' ? 'bg-transparent' : 'border-transparent text-white',
                linkStyle === 'bold' ? 'font-bold' : 'font-semibold'
            )}
            href="https://ghost.org/help/email-design/"
            rel="noopener noreferrer"
            style={
                buttonStyle === 'outline'
                    ? {borderColor: buttonColor ?? accentColor, color: buttonColor ?? accentColor}
                    : {backgroundColor: buttonColor ?? accentColor, color: buttonTextColor}
            }
            target="_blank"
        >
            Learn more
        </a>
    </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const NewsletterPreviewContent: React.FC<NewsletterPreviewContentProps> = ({
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
    const showHeader = headerIcon || headerTitle;

    return (
        <div className="relative flex grow flex-col">
            <div className="absolute inset-0 m-5 flex items-center justify-center">
                <div className="mx-auto my-0 flex max-h-full w-full max-w-[700px] flex-col overflow-hidden rounded-[4px] text-black shadow-sm">

                    {/* Email client header */}
                    <div className="flex-column flex min-h-[77px] justify-center rounded-t-sm border-b border-grey-200 bg-white px-6 text-sm text-grey-700">
                        {isManagedEmail(config)
                            ? <ManagedEmailHeader senderEmail={senderEmail} senderName={senderName} senderReplyTo={senderReplyTo} />
                            : <StandardEmailHeader senderEmail={senderEmail} senderName={senderName} />
                        }
                    </div>

                    {/* Email body */}
                    <div className="overflow-y-auto text-sm" style={{backgroundColor}}>

                        {/* Header area */}
                        <div className="px-[7rem]" style={{backgroundColor: headerBackgroundColor}}>
                            {headerImage && (
                                <div>
                                    <img alt="" className="mb-4 block pt-6" src={headerImage} />
                                </div>
                            )}
                            {showHeader && (
                                <NewsletterHeader
                                    headerIcon={headerIcon}
                                    headerSubtitle={headerSubtitle}
                                    headerTextColor={headerTextColor}
                                    headerTitle={headerTitle}
                                    secondaryHeaderTextColor={secondaryHeaderTextColor}
                                />
                            )}
                            {showPostTitleSection && (
                                <PostTitleSection
                                    authorPlaceholder={authorPlaceholder}
                                    bodyFontCategory={bodyFontCategory}
                                    headerTextColor={headerTextColor}
                                    postTitleColor={postTitleColor}
                                    secondaryHeaderTextColor={secondaryHeaderTextColor}
                                    showExcerpt={showExcerpt}
                                    titleAlignment={titleAlignment}
                                    titleFontCategory={titleFontCategory}
                                    titleFontWeight={titleFontWeight}
                                />
                            )}
                            {showFeatureImage && (
                                <FeatureImage
                                    imageCorners={imageCorners}
                                    secondaryHeaderTextColor={secondaryHeaderTextColor}
                                    showPostTitleSection={showPostTitleSection}
                                />
                            )}
                        </div>

                        {/* Content area */}
                        <div className={clsx('px-[7rem]', headerBackgroundColor !== 'transparent' && 'pt-10')}>
                            <ArticleBody
                                accentColor={accentColor}
                                bodyFontCategory={bodyFontCategory}
                                buttonColor={buttonColor}
                                buttonCorners={buttonCorners}
                                buttonStyle={buttonStyle}
                                buttonTextColor={buttonTextColor}
                                dividerColor={dividerColor}
                                dividerStyle={dividerStyle}
                                linkColor={linkColor}
                                linkStyle={linkStyle}
                                sectionTitleColor={sectionTitleColor}
                                showFeatureImage={showFeatureImage}
                                showPostTitleSection={showPostTitleSection}
                                textColor={textColor}
                                titleFontCategory={titleFontCategory}
                                titleFontWeight={titleFontWeight}
                            />

                            {(showFeedback || showCommentCta) && (
                                <FeedbackSection
                                    dividerColor={dividerColor}
                                    dividerStyle={dividerStyle}
                                    showCommentCta={showCommentCta}
                                    showFeedback={showFeedback}
                                    textColor={textColor}
                                />
                            )}

                            {showLatestPosts && (
                                <LatestPostsSection
                                    dividerColor={dividerColor}
                                    dividerStyle={dividerStyle}
                                    imageCorners={imageCorners}
                                    secondaryTextColor={secondaryTextColor}
                                    sectionTitleColor={sectionTitleColor}
                                    textColor={textColor}
                                    titleFontCategory={titleFontCategory}
                                    titleFontWeight={titleFontWeight}
                                />
                            )}

                            {showSubscriptionDetails && (
                                <SubscriptionDetailsSection
                                    accentColor={accentColor}
                                    dividerColor={dividerColor}
                                    dividerStyle={dividerStyle}
                                    linkColor={linkColor}
                                    linkStyle={linkStyle}
                                    siteTitle={siteTitle}
                                    textColor={textColor}
                                />
                            )}

                            <EmailFooter
                                footerContent={footerContent}
                                secondaryTextColor={secondaryTextColor}
                                showBadge={showBadge}
                                siteTitle={siteTitle}
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
```

## Key Refactoring Decisions

### 1. **Type Splitting**
The single large props interface was split into four focused interfaces (`StyleProps`, `LayoutProps`, `VisibilityProps`, `ContentProps`) that are composed via intersection types, making each concern explicit.

### 2. **Helper Functions Extracted**
- `getTitleFontClasses` — eliminates repeated font class logic across 4+ locations
- `getDividerClasses` — consolidates repeated divider border class pattern
- `getImageCornerClasses` — removes duplicated image corner logic
- `getExcerptClasses` — simplifies the complex conditional excerpt class logic
- `processFooterContent` / `formatDate` — pure utility functions

### 3. **Sub-components Extracted**
Each logical section became its own component:
- `ManagedEmailHeader` / `StandardEmailHeader` — replaces the `let emailHeader` mutation pattern
- `NewsletterHeader`, `PostTitleSection`, `FeatureImage`
- `FeedbackButton`, `FeedbackSection` — `FeedbackButton` eliminates three near-identical button blocks
- `LatestPostItem` + `LATEST_POSTS_DATA` array — replaces three copy-pasted post blocks with a data-driven loop
- `SubscriptionDetailsSection`, `ArticleBody`, `EmailFooter`

### 4. **Eliminated Mutation**
Replaced `let emailHeader` with a ternary in JSX, and replaced `let excerptClasses` with a pure function.