Here's the refactored code with reduced complexity through component extraction, helper functions, and consolidated logic:

```tsx
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

type NewsletterPreviewContentProps = ContentProps & VisibilityProps & StyleProps & LayoutProps;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = () => new Date().toLocaleDateString('default', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
});

const processFooterContent = (content?: string | null) =>
    content?.replace(/<a/g, '<a target="_blank" rel="noopener noreferrer"') ?? '';

const getDividerClasses = (dividerStyle?: string) => clsx(
    'border-b border-grey-200',
    dividerStyle === 'dashed' && 'border-dashed',
    dividerStyle === 'dotted' && 'border-b-2 border-dotted'
);

const getTitleClasses = (titleFontCategory?: string, titleFontWeight?: string) => clsx(
    titleFontCategory === 'serif' && 'font-serif',
    titleFontCategory === 'sans_serif' && 'font-sans',
    titleFontWeight === 'normal' && 'font-normal',
    titleFontWeight === 'medium' && 'font-medium',
    titleFontWeight === 'semibold' && 'font-semibold',
    titleFontWeight === 'bold' && 'font-bold'
);

const getImageCornerClasses = (imageCorners?: string) => clsx(
    imageCorners === 'square' && 'rounded-none',
    imageCorners === 'rounded' && 'rounded-md'
);

const getExcerptClasses = (titleFontCategory?: string, bodyFontCategory?: string, titleAlignment?: string) => {
    const isSerifBody = bodyFontCategory === 'serif';
    const isSerifTitle = titleFontCategory === 'serif';

    return clsx(
        'mb-5 text-pretty leading-[1.7] text-black mb-8 leading-tight',
        isSerifBody && isSerifTitle && 'font-serif text-[2.0rem]',
        isSerifBody && !isSerifTitle && 'text-[1.7rem] tracking-tight',
        !isSerifBody && isSerifTitle && 'font-serif text-[2.0rem]',
        !isSerifBody && !isSerifTitle && 'text-[1.9rem] tracking-tight',
        titleAlignment === 'center' && 'text-center'
    );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const ManagedEmailHeader: React.FC<Pick<ContentProps, 'senderName' | 'senderEmail' | 'senderReplyTo'>> = ({
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

const StandardEmailHeader: React.FC<Pick<ContentProps, 'senderName' | 'senderEmail'>> = ({
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

const FeedbackButton: React.FC<{icon: string; label: string; textColor?: string}> = ({icon, label, textColor}) => (
    <button className="pointer-events-none cursor-default whitespace-nowrap rounded-[2.2rem] bg-transparent font-semibold" type="button">
        <span className="inline-flex items-center gap-2 px-[18px] py-[7px]" style={{color: textColor}}>
            <Icon colorClass='' name={icon} size="md" />
            <span>{label}</span>
        </span>
    </button>
);

interface LatestPostItemProps {
    title: string;
    description: string;
    image: string;
    imageCorners?: string;
    sectionTitleColor?: string;
    secondaryTextColor?: string;
    titleFontCategory?: string;
    titleFontWeight?: string;
}

const LatestPostItem: React.FC<LatestPostItemProps> = ({
    title,
    description,
    image,
    imageCorners,
    sectionTitleColor,
    secondaryTextColor,
    titleFontCategory,
    titleFontWeight
}) => (
    <div className="flex justify-between gap-4 py-2">
        <div>
            <h4
                className={clsx('mt-0.5 text-[1.9rem] text-black', getTitleClasses(titleFontCategory, titleFontWeight))}
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
    const currentDate = formatDate();
    const currentYear = new Date().getFullYear();
    const processedFooterContent = processFooterContent(footerContent);
    const showHeader = headerIcon || headerTitle;

    const sharedLatestPostProps = {imageCorners, sectionTitleColor, secondaryTextColor, titleFontCategory, titleFontWeight};
    const dividerClasses = getDividerClasses(dividerStyle);
    const buttonEffectiveColor = buttonColor || accentColor;
    const linkEffectiveColor = linkColor || accentColor;

    const buttonStyles = buttonStyle === 'outline'
        ? {borderColor: buttonEffectiveColor, color: buttonEffectiveColor}
        : {backgroundColor: buttonEffectiveColor, color: buttonTextColor};

    return (
        <div className="relative flex grow flex-col">
            <div className="absolute inset-0 m-5 flex items-center justify-center">
                <div className="mx-auto my-0 flex max-h-full w-full max-w-[700px] flex-col overflow-hidden rounded-[4px] text-black shadow-sm">

                    {/* Email header */}
                    <div className="flex-column flex min-h-[77px] justify-center rounded-t-sm border-b border-grey-200 bg-white px-6 text-sm text-grey-700">
                        {isManagedEmail(config)
                            ? <ManagedEmailHeader senderEmail={senderEmail} senderName={senderName} senderReplyTo={senderReplyTo} />
                            : <StandardEmailHeader senderEmail={senderEmail} senderName={senderName} />
                        }
                    </div>

                    {/* Email content */}
                    <div className="overflow-y-auto text-sm" style={{backgroundColor}}>
                        <div className="px-[7rem]" style={{backgroundColor: headerBackgroundColor}}>

                            {/* Header image */}
                            {headerImage && (
                                <div>
                                    <img alt="" className="mb-4 block pt-6" src={headerImage} />
                                </div>
                            )}

                            {/* Header branding */}
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

                            {/* Post title section */}
                            {showPostTitleSection && (
                                <div className={clsx('flex flex-col py-8', titleAlignment === 'center' ? 'items-center' : 'items-start')}>
                                    <h2
                                        className={clsx(
                                            'text-4xl font-bold leading-supertight text-black',
                                            getTitleClasses(titleFontCategory, titleFontWeight),
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
                            )}

                            {/* Feature image */}
                            {showFeatureImage && (
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
                            )}
                        </div>

                        <div className={clsx('px-[7rem]', headerBackgroundColor !== 'transparent' && 'pt-10')}>

                            {/* Body content */}
                            <div
                                className={clsx(
                                    'max-w-[600px] pb-[52px] leading-[27.2px] text-black',
                                    dividerClasses,
                                    bodyFontCategory === 'serif' ? 'font-serif text-[1.8rem]' : 'text-[1.7rem] tracking-tight',
                                    !showFeatureImage && !showPostTitleSection && 'pt-8'
                                )}
                                style={{borderColor: dividerColor}}
                            >
                                <p className="mb-6" style={{color: textColor}}>This is what your content will look like when you send one of your posts as an email newsletter to your subscribers.</p>
                                <p className="mb-6" style={{color: textColor}}>Over there on the right you&apos;ll see some settings that allow you to customize the look and feel of this template – from colors and typography to layout and buttons – to make it perfectly suited to your brand.</p>
                                <p className="mb-[52px]" style={{color: textColor}}>Email templates are exceptionally finnicky to make, but we&apos;ve spent a long time optimising this one to make it work beautifully across devices, email clients and content types. So, you can trust that every email you send with Ghost will look great and work well. Just like the rest of your site.</p>

                                <hr
                                    className={clsx('my-[52px] border-[#e0e7eb]', dividerStyle === 'dashed' && 'border-dashed', dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted')}
                                    style={{borderColor: dividerColor}}
                                />

                                <h3
                                    className={clsx('mb-[13px] text-[2.6rem] leading-supertight', getTitleClasses(titleFontCategory, titleFontWeight))}
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
                                        style={{color: linkEffectiveColor}}
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
                                    style={buttonStyles}
                                    target="_blank"
                                >
                                    Learn more
                                </a>
                            </div>

                            {/* Feedback / Comments */}
                            {(showFeedback || showCommentCta) && (
                                <div className={clsx('grid gap-5 px-6 py-5', dividerClasses)} style={{borderColor: dividerColor}}>
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
                            )}

                            {/* Latest posts */}
                            {showLatestPosts && (
                                <div className={clsx('py-6', dividerClasses)} style={{borderColor: dividerColor}}>
                                    <h3 className="mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black" style={{color: textColor}}>Keep reading</h3>
                                    <LatestPostItem {...sharedLatestPostProps} description="Posts sent as an email only will never be shown here." image={LatestPosts1} title="The three latest posts published on your site" />
                                    <LatestPostItem {...sharedLatestPostProps} description="Giving your readers one more place to discover your stories." image={LatestPosts2} title="Displayed at the bottom of each newsletter" />
                                    <LatestPostItem {...sharedLatestPostProps} description="Making sure that your audience stays engaged." image={LatestPosts3} title="To keep your work front and center" />
                                </div>
                            )}

                            {/* Subscription details */}
                            {showSubscriptionDetails && (
                                <div className={clsx('py-8', dividerClasses)} style={{borderColor: dividerColor}}>
                                    <h4 className="mb-3 text-[1.2rem] uppercase tracking-wide text-black" style={{color: textColor}}>Subscription details</h4>
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
                                            style={{color: linkEffectiveColor}}
                                        >
                                            Manage subscription
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Footer */}
                            <div className="flex flex-col items-center pt-10">
                                <div
                                    dangerouslySetInnerHTML={{__html: processedFooterContent}}
                                    className="text break-words px-8 py-3 text-center text-[1.3rem] leading-base text-grey-700 [&_a]:underline"
                                    style={{color: secondaryTextColor}}
                                />
                                <div className="px-8 pb-14 pt-3 text-center text-[1.3rem] text-grey-700">
                                    <span style={{color: secondaryTextColor}}>{siteTitle} © {currentYear} &mdash; </span>
                                    <span className="pointer-events-none cursor-auto underline" style={{color: secondaryTextColor}}>Unsubscribe</span>
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
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NewsletterPreviewContent;
```

Key refactoring improvements:

1. **Type splitting**: The monolithic prop type is split into `StyleProps`, `LayoutProps`, `VisibilityProps`, and `ContentProps` interfaces, making each concern explicit and reusable.

2. **Helper functions extracted**: `formatDate`, `processFooterContent`, `getDividerClasses`, `getTitleClasses`, `getImageCornerClasses`, and `getExcerptClasses` eliminate repeated `clsx` logic and reduce duplication significantly.

3. **Sub-components extracted**:
   - `ManagedEmailHeader` / `StandardEmailHeader` replace the conditional `emailHeader` variable
   - `FeedbackButton` eliminates three near-identical button blocks
   - `LatestPostItem` eliminates three near-identical post blocks

4. **Derived values hoisted**: `buttonEffectiveColor`, `linkEffectiveColor`, `buttonStyles`, `dividerClasses`, and `sharedLatestPostProps` are computed once and reused, removing inline repetition.

5. **Simplified conditionals**: `showPostTitleSection ? '' : 'pt-6'` becomes `!showPostTitleSection && 'pt-6'`, and `senderReplyTo ? senderReplyTo : senderEmail` becomes `senderReplyTo ?? senderEmail`.