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

    // Process footer content to add target and rel attributes to links
    const processedFooterContent = footerContent ? footerContent.replace(/<a/g, '<a target="_blank" rel="noopener noreferrer"') : '';

    let emailHeader;

    if (isManagedEmail(config)) {
        emailHeader = <><p className="leading-normal"><span className="font-semibold text-grey-900">From: </span><span>{senderName} ({senderEmail})</span></p>
            <p className="leading-normal">
                <span className="font-semibold text-grey-900">Reply-to: </span>{senderReplyTo ? senderReplyTo : senderEmail}
            </p>
        </>;
    } else {
        emailHeader = <><p className="leading-normal"><span className="font-semibold text-grey-900">{senderName}</span><span> {senderEmail}</span></p>
            <p className="leading-normal"><span className="font-semibold text-grey-900">To:</span> Jamie Larson jamie@example.com</p></>;
    }

    const getExcerptClasses = (fontCategory: string, alignment: string | undefined): string => {
        let classes = 'mb-5 text-pretty leading-[1.7] text-black';

        if (fontCategory === 'serif') {
            classes = clsx(classes, 'mb-8 font-serif text-[2.0rem] leading-tight');
        } else {
            classes = clsx(classes, 'mb-8 text-[1.9rem] leading-tight tracking-tight');
        }

        if (alignment === 'center') {
            classes = clsx(classes, 'text-center');
        }

        return classes;
    };

    const getFontClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = '';
        if (fontCategory === 'serif') {
            classes += 'font-serif ';
        }
        if (fontWeight === 'normal') {
            classes += 'font-normal ';
        }
        if (fontWeight === 'medium') {
            classes += 'font-medium ';
        }
        if (fontWeight === 'semibold') {
            classes += 'font-semibold ';
        }
        if (fontWeight === 'bold') {
            classes += 'font-bold ';
        }
        return classes;
    };

    const getButtonClasses = (corners: string | undefined, style: string | undefined): string => {
        let classes = 'inline-block border px-[18px] py-2 font-sans text-[15px]';
        if (corners === 'rounded') {
            classes += ' rounded-[6px]';
        } else if (corners === 'pill') {
            classes += ' rounded-full';
        } else if (corners === 'square') {
            classes += ' rounded-none';
        }
        if (style === 'outline') {
            classes += ' bg-transparent border-transparent text-white';
        } else {
            classes += ' border-transparent text-white';
        }
        if (linkStyle === 'bold') {
            classes += ' font-bold';
        } else {
            classes += ' font-semibold';
        }
        return classes;
    };

    const getButtonStyle = (style: string | undefined, color: string | undefined, textColor: string | undefined): React.CSSProperties => {
        if (style === 'outline') {
            return {
                borderColor: color || accentColor,
                color: color || accentColor
            };
        }
        return {
            backgroundColor: color || accentColor,
            color: textColor
        };
    };

    const getDividerClasses = (style: string | undefined): string => {
        let classes = '';
        if (style === 'dashed') {
            classes += ' border-dashed';
        } else if (style === 'dotted') {
            classes += ' border-b-2 border-dotted';
        }
        return classes;
    };

    const getDividerHRClasses = (style: string | undefined): string => {
        let classes = 'my-[52px] border-[#e0e7eb]';
        if (style === 'dashed') {
            classes += ' border-dashed';
        } else if (style === 'dotted') {
            classes += ' border-b-2 border-t-0 border-dotted';
        }
        return classes;
    };

    const getLinkClasses = (style: string | undefined): string => {
        if (style === 'underline') {
            return 'underline';
        }
        if (style === 'bold') {
            return 'font-bold';
        }
        return '';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = '';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getFeatureImageClasses = (corners: string | undefined): string => {
        let classes = 'min-h-full min-w-full shrink-0';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostsSectionClasses = (style: string | undefined): string => {
        let classes = 'border-b border-grey-200 py-6';
        if (style === 'dashed') {
            classes += ' border-dashed';
        } else if (style === 'dotted') {
            classes += ' border-b-2 border-dotted';
        }
        return classes;
    };

    const getSubscriptionDetailsSectionClasses = (style: string | undefined): string => {
        let classes = 'border-b border-grey-200 py-8';
        if (style === 'dashed') {
            classes += ' border-dashed';
        } else if (style === 'dotted') {
            classes += ' border-b-2 border-dotted';
        }
        return classes;
    };

    const getFeedbackSectionClasses = (style: string | undefined): string => {
        let classes = 'grid gap-5 border-b border-grey-200 px-6 py-5';
        if (style === 'dashed') {
            classes += ' border-dashed';
        } else if (style === 'dotted') {
            classes += ' border-b-2 border-dotted';
        }
        return classes;
    };

    const getHeaderSectionClasses = (style: string | undefined): string => {
        let classes = 'flex-column flex min-h-[77px] justify-center rounded-t-sm border-b border-grey-200 bg-white px-6 text-sm text-grey-700';
        return classes;
    };

    const getPostTitleSectionClasses = (alignment: string | undefined): string => {
        return clsx('flex flex-col py-8', alignment === 'center' ? 'items-center' : 'items-start');
    };

    const getLatestPostItemClasses = (corners: string | undefined): string => {
        let classes = 'flex justify-between gap-4 py-2';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTextClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';
        if (corners === 'square') {
            classes += ' rounded-none';
        } else if (corners === 'rounded') {
            classes += ' rounded-md';
        }
        return classes;
    };

    const getLatestPostTitleClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mt-0.5 text-[1.9rem] text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostSubtitleClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageContainerClasses = (corners: string | undefined): string => {
        return clsx('aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat', getLatestPostImageClasses(corners));
    };

    const getLatestPostHeaderClasses = (fontCategory: string, fontWeight: string | undefined): string => {
        let classes = 'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black';
        if (fontCategory === 'serif') {
            classes += ' font-serif';
        }
        if (fontWeight === 'normal') {
            classes += ' font-normal';
        }
        if (fontWeight === 'medium') {
            classes += ' font-medium';
        }
        if (fontWeight === 'semibold') {
            classes += ' font-semibold';
        }
        if (fontWeight === 'bold') {
            classes += ' font-bold';
        }
        return classes;
    };

    const getLatestPostDescriptionClasses = (): string => {
        return 'm-0 text-base text-grey-700';
    };

    const getLatestPostImageClasses = (corners: string | undefined): string => {
        let classes = 'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat';