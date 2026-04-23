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

    const emailHeader = isManagedEmail(config) ? (
        <>
            <p className="leading-normal"><span className="font-semibold text-grey-900">From: </span><span>{senderName} ({senderEmail})</span></p>
            <p className="leading-normal">
                <span className="font-semibold text-grey-900">Reply-to: </span>{senderReplyTo || senderEmail}
            </p>
        </>
    ) : (
        <>
            <p className="leading-normal"><span className="font-semibold text-grey-900">{senderName}</span><span> {senderEmail}</span></p>
            <p className="leading-normal"><span className="font-semibold text-grey-900">To:</span> Jamie Larson jamie@example.com</p>
        </>
    );

    const getExcerptClasses = () => {
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

    const getPostTitleClasses = () => {
        const alignmentClass = titleAlignment === 'center' ? 'text-center' : 'text-left';
        const weightClass = titleFontWeight === 'normal' ? 'font-normal' : titleFontWeight === 'medium' ? 'font-medium' : titleFontWeight === 'semibold' ? 'font-semibold' : titleFontWeight === 'bold' ? 'font-bold' : 'font-bold';
        const fontClass = titleFontCategory === 'serif' ? 'font-serif' : '';
        const marginClass = showExcerpt ? 'mb-2' : 'mb-8';

        return clsx(
            'text-4xl font-bold leading-supertight text-black',
            fontClass,
            weightClass,
            alignmentClass,
            marginClass
        );
    };

    const getLatestPostTitleClasses = () => {
        const weightClass = titleFontWeight === 'normal' ? 'font-normal' : titleFontWeight === 'medium' ? 'font-medium' : titleFontWeight === 'semibold' ? 'font-semibold' : titleFontWeight === 'bold' ? 'font-bold' : 'font-bold';
        const fontClass = titleFontCategory === 'serif' ? 'font-serif' : '';

        return clsx(
            'mt-0.5 text-[1.9rem] text-black',
            fontClass,
            weightClass
        );
    };

    const getSectionTitleClasses = () => {
        const fontClass = titleFontCategory === 'serif' ? 'font-serif' : titleFontCategory === 'sans_serif' ? 'font-sans' : '';
        const weightClass = titleFontWeight === 'normal' ? 'font-normal' : titleFontWeight === 'medium' ? 'font-medium' : titleFontWeight === 'semibold' ? 'font-semibold' : titleFontWeight === 'bold' ? 'font-bold' : '';

        return clsx(
            'mb-[13px] text-[2.6rem] leading-supertight',
            fontClass,
            weightClass
        );
    };

    const getButtonClasses = () => {
        const cornerClass = buttonCorners === 'rounded' ? 'rounded-[6px]' : buttonCorners === 'pill' ? 'rounded-full' : 'rounded-none';
        const styleClass = buttonStyle === 'outline' ? 'bg-transparent' : 'border-transparent text-white';
        const linkStyleClass = linkStyle === 'bold' ? 'font-bold' : 'font-semibold';

        return clsx(
            'inline-block border px-[18px] py-2 font-sans text-[15px]',
            cornerClass,
            styleClass,
            linkStyleClass
        );
    };

    const getButtonStyle = () => {
        if (buttonStyle === 'outline') {
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

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'border-b border-grey-200',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageClasses = () => {
        return clsx(
            'h-[unset] w-full max-w-[600px] bg-cover bg-no-repeat',
            showPostTitleSection ? '' : 'pt-6'
        );
    };

    const getLatestPostImageClasses = () => {
        return clsx(
            imageCorners === 'square' && 'rounded-none',
            imageCorners === 'rounded' && 'rounded-md'
        );
    };

    const getFeedbackButtonClasses = () => {
        return clsx(
            'pointer-events-none cursor-default whitespace-nowrap rounded-[2.2rem] bg-transparent font-semibold'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getSubscriptionDetailsClasses = () => {
        return clsx(
            'border-b border-grey-200 py-8',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getFooterLinkClasses = () => {
        return clsx(
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getFeedbackSectionClasses = () => {
        return clsx(
            'grid gap-5 border-b border-grey-200 px-6 py-5',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getMainContentClasses = () => {
        return clsx(
            'max-w-[600px] border-b border-grey-200 pb-[52px] leading-[27.2px] text-black',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted',
            bodyFontCategory === 'serif' ? 'font-serif text-[1.8rem]' : 'text-[1.7rem] tracking-tight',
            (showFeatureImage || showPostTitleSection) ? '' : 'pt-8'
        );
    };

    const getHeaderSectionClasses = () => {
        return clsx(
            'flex-column flex min-h-[77px] justify-center rounded-t-sm border-b border-grey-200 bg-white px-6 text-sm text-grey-700'
        );
    };

    const getContainerClasses = () => {
        return clsx(
            'relative flex grow flex-col'
        );
    };

    const getInnerContainerClasses = () => {
        return clsx(
            'absolute inset-0 m-5 flex items-center justify-center'
        );
    };

    const getCardClasses = () => {
        return clsx(
            'mx-auto my-0 flex max-h-full w-full max-w-[700px] flex-col overflow-hidden rounded-[4px] text-black shadow-sm'
        );
    };

    const getContentContainerClasses = () => {
        return clsx(
            'overflow-y-auto text-sm'
        );
    };

    const getHeaderContentClasses = () => {
        return clsx(
            'px-[7rem]'
        );
    };

    const getMainContentContainerClasses = () => {
        return clsx(
            'px-[7rem]',
            headerBackgroundColor !== 'transparent' && 'pt-10'
        );
    };

    const getFooterContainerClasses = () => {
        return clsx(
            'flex flex-col items-center pt-10'
        );
    };

    const getBadgeContainerClasses = () => {
        return clsx(
            'flex flex-col items-center pb-[40px] pt-[10px]'
        );
    };

    const getBadgeLinkClasses = () => {
        return clsx(
            'pointer-events-none inline-flex cursor-auto items-center px-2 py-1 text-[1.25rem] font-semibold tracking-tight text-grey-900'
        );
    };

    const getBadgeIconClasses = () => {
        return clsx(
            'mr-[6px] size-4'
        );
    };

    const getBadgeTextClasses = () => {
        return clsx(
            'text-grey-900'
        );
    };

    const getFooterContentClasses = () => {
        return clsx(
            'text break-words px-8 py-3 text-center text-[1.3rem] leading-base text-grey-700 [&_a]:underline'
        );
    };

    const getFooterCopyrightClasses = () => {
        return clsx(
            'px-8 pb-14 pt-3 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getFooterLinkClasses = () => {
        return clsx(
            'pointer-events-none cursor-auto underline'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-t-0 border-dotted'
        );
        return isBottom ? clsx(baseClass, 'border-b-2 border-dotted') : baseClass;
    };

    const getFeatureImageCaptionClasses = () => {
        return clsx(
            'mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700'
        );
    };

    const getPostTitleSectionClasses = () => {
        return clsx(
            'flex flex-col py-8',
            titleAlignment === 'center' ? 'items-center' : 'items-start'
        );
    };

    const getPostTitleSectionAuthorClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem]',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionViewClasses = () => {
        return clsx(
            'pb-1 text-[1.3rem] underline',
            titleAlignment === 'center' ? 'text-center' : 'text-left'
        );
    };

    const getPostTitleSectionDateClasses = () => {
        return clsx(
            'before:pl-0.5 before:pr-1 before:content-["•"]'
        );
    };

    const getLatestPostsSectionClasses = () => {
        return clsx(
            'border-b border-grey-200 py-6',
            dividerStyle === 'dashed' && 'border-dashed',
            dividerStyle === 'dotted' && 'border-b-2 border-dotted'
        );
    };

    const getLatestPostItemClasses = () => {
        return clsx(
            'flex justify-between gap-4 py-2'
        );
    };

    const getLatestPostTextClasses = () => {
        return clsx(
            'm-0 text-base text-grey-700'
        );
    };

    const getLatestPostImageContainerClasses = () => {
        return clsx(
            'aspect-square h-auto w-full max-w-[100px] bg-cover bg-no-repeat'
        );
    };

    const getLatestPostHeaderClasses = () => {
        return clsx(
            'mb-4 mt-2 pb-1 text-[1.2rem] font-semibold uppercase tracking-wide text-black'
        );
    };

    const getFeedbackButtonIconClasses = () => {
        return clsx(
            'inline-flex items-center gap-2 px-[18px] py-[7px]'
        );
    };

    const getFeedbackButtonSpanClasses = () => {
        return clsx(
            'text-grey-700'
        );
    };

    const getSubscriptionDetailsHeaderClasses = () => {
        return clsx(
            'mb-3 text-[1.2rem] uppercase tracking-wide text-black'
        );
    };

    const getSubscriptionDetailsTextClasses = () => {
        return clsx(
            'm-0 mb-4 text-base'
        );
    };

    const getSubscriptionDetailsNameClasses = () => {
        return clsx(
            'shrink-0 text-base'
        );
    };

    const getSubscriptionDetailsLinkClasses = () => {
        return clsx(
            'w-full self-end whitespace-nowrap text-right text-base',
            linkStyle === 'underline' && 'underline',
            linkStyle === 'bold' && 'font-bold'
        );
    };

    const getDividerClasses = (isBottom = false) => {
        const baseClass = clsx(
            'my-[52px] border-[#e0e7eb]',