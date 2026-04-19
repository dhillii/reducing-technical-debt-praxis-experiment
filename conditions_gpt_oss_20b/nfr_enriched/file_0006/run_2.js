import CoverImage from '../../../../assets/images/user-cover.jpg';
import LatestPosts1 from '../../../../assets/images/latest-posts-1.jpg';
import LatestPosts2 from '../../../../assets/images/latest-posts-2.jpg';
import LatestPosts3 from '../../../../assets/images/latest-posts-3.jpg';
import clsx from 'clsx';
import {GhostOrb, Icon} from '@tryghost/admin-x-design-system';
import {isManagedEmail} from '@tryghost/admin-x-framework/api/config';
import {useGlobalData} from '../../../providers/global-data-provider';

/**
 * Returns the email header JSX based on whether the email is managed.
 */
const getEmailHeader = (
    config: any,
    senderName: string | undefined,
    senderEmail: string | null,
    senderReplyTo: string | null
) => {
    if (isManagedEmail(config)) {
        return (
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
 * Computes the CSS classes for the excerpt paragraph.
 */
const getExcerptClasses = (
    titleFontCategory: string | undefined,
    bodyFontCategory: string | undefined,
    titleAlignment: string | undefined
) => {
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

/**
 * Renders the header section (image, icon, title, subtitle).
 */
const renderHeaderSection = (
    headerImage: string | null | undefined,
    headerIcon: string | undefined,
    headerTitle: string | null | undefined,
    headerSubtitle: string | null | undefined,
    headerTextColor: string | undefined,
    secondaryHeaderTextColor: string | undefined
) => {
    return (
        <>
            {headerImage && (
                <div>
                    <img alt="" className="mb-4 block pt-6" src={headerImage} />
                </div>
            )}
            {(headerIcon || headerTitle) && (
                <div className="py-3">
                    {headerIcon && (
                        <img
                            alt=""
                            className="mx-auto mb-2 size-10"
                            role="presentation"
                            src={headerIcon}
                        />
                    )}
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
};

/**
 * Renders the post title section with optional excerpt.
 */
const renderPostTitleSection = (
    showPostTitleSection: boolean,
    titleAlignment: string | undefined,
    titleFontCategory: string | undefined,
    titleFontWeight: string | undefined,
    titleColor: string | undefined,
    excerptClasses: string,
    headerTextColor: string | undefined,
    authorPlaceholder: string | undefined,
    currentDate: string,
    showExcerpt: boolean
) => {
    if (!showPostTitleSection) return null;
    return (
        <div
            className={clsx(
                'flex flex-col py-8',
                titleAlignment === 'center' ? 'items-center' : 'items-start'
            )}
        >
            <h2
                className={clsx(
                    'text-4xl font-bold leading-supertight text-black',
                    titleFontCategory === 'serif' && 'font-serif',
                    titleFontWeight === 'normal' && 'font-normal',
                    titleFontWeight === 'medium' && 'font-medium',
                    titleFontWeight === 'semibold' && 'font-semibold',
                    titleFontWeight === 'bold' && 'font-bold',
                    titleAlignment === 'center' ? 'text-center' : 'text-left',
                    showExcerpt ? 'mb-2' : 'mb-8'
                )}
                style={{color: titleColor}}
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

/**
 * Renders the feature image section.
 */
const renderFeatureImage = (
    showFeatureImage: boolean,
    showPostTitleSection: boolean,
    imageCorners: string | undefined,
    secondaryHeaderTextColor: string | undefined
) => {
    if (!showFeatureImage) return null;
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

/**
 * Renders the divider section with optional button and link.
 */
const renderDivider = (
    titleFontCategory: string | undefined,
    titleFontWeight: string | undefined,
    sectionTitleColor: string | undefined,
    linkStyle: string | undefined,
    linkColor: string | undefined,
    accentColor: string | undefined,
    buttonStyle: string | undefined,
    buttonCorners: string | undefined,
    buttonColor: string | undefined,
    buttonTextColor: string | undefined,
    dividerStyle: string | undefined,
    dividerColor: string | undefined,
    bodyFontCategory: string | undefined,
    textColor: string | undefined,
    secondaryTextColor: string | undefined,
    showFeedback: boolean,
    showCommentCta: boolean,
    showLatestPosts: boolean,
    showSubscriptionDetails: boolean,
    siteTitle: string | undefined,
    currentYear: number,
    showBadge: boolean,
    processedFooterContent: string,
    headerBackgroundColor: string | undefined,
    headerTextColor: string | undefined,
    secondaryHeaderTextColor: string | undefined,
    postTitleColor: string | undefined,
    authorPlaceholder: string | undefined,
    currentDate: string,
    titleAlignment: string | undefined,
    titleFontCategoryProp: string | undefined,
    titleFontWeightProp: string | undefined,
    titleAlignmentProp: string | undefined,
    titleFontCategoryProp2: string | undefined,
    titleFontWeightProp2: string | undefined,
    titleAlignmentProp2: string | undefined,
    titleFontCategoryProp3: string | undefined,
    titleFontWeightProp3: string | undefined,
    titleAlignmentProp3: string | undefined,
    titleFontCategoryProp4: string | undefined,
    titleFontWeightProp4: string | undefined,
    titleAlignmentProp4: string | undefined,
    titleFontCategoryProp5: string | undefined,
    titleFontWeightProp5: string | undefined,
    titleAlignmentProp5: string | undefined,
    titleFontCategoryProp6: string | undefined,
    titleFontWeightProp6: string | undefined,
    titleAlignmentProp6: string | undefined,
    titleFontCategoryProp7: string | undefined,
    titleFontWeightProp7: string | undefined,
    titleAlignmentProp7: string | undefined,
    titleFontCategoryProp8: string | undefined,
    titleFontWeightProp8: string | undefined,
    titleAlignmentProp8: string | undefined,
    titleFontCategoryProp9: string | undefined,
    titleFontWeightProp9: string | undefined,
    titleAlignmentProp9: string | undefined,
    titleFontCategoryProp10: string | undefined,
    titleFontWeightProp10: string | undefined,
    titleAlignmentProp10: string | undefined,
    titleFontCategoryProp11: string | undefined,
    titleFontWeightProp11: string | undefined,
    titleAlignmentProp11: string | undefined,
    titleFontCategoryProp12: string | undefined,
    titleFontWeightProp12: string | undefined,
    titleAlignmentProp12: string | undefined,
    titleFontCategoryProp13: string | undefined,
    titleFontWeightProp13: string | undefined,
    titleAlignmentProp13: string | undefined,
    titleFontCategoryProp14: string | undefined,
    titleFontWeightProp14: string | undefined,
    titleAlignmentProp14: string | undefined,
    titleFontCategoryProp15: string | undefined,
    titleFontWeightProp15: string | undefined,
    titleAlignmentProp15: string | undefined,
    titleFontCategoryProp16: string | undefined,
    titleFontWeightProp16: string | undefined,
    titleAlignmentProp16: string | undefined,
    titleFontCategoryProp17: string | undefined,
    titleFontWeightProp17: string | undefined,
    titleAlignmentProp17: string | undefined,
    titleFontCategoryProp18: string | undefined,
    titleFontWeightProp18: string | undefined,
    titleAlignmentProp18: string | undefined,
    titleFontCategoryProp19: string | undefined,
    titleFontWeightProp19: string | undefined,
    titleAlignmentProp19: string | undefined,
    titleFontCategoryProp20: string | undefined,
    titleFontWeightProp20: string | undefined,
    titleAlignmentProp20: string | undefined,
    titleFontCategoryProp21: string | undefined,
    titleFontWeightProp21: string | undefined,
    titleAlignmentProp21: string | undefined,
    titleFontCategoryProp22: string | undefined,
    titleFontWeightProp22: string | undefined,
    titleAlignmentProp22: string | undefined,
    titleFontCategoryProp23: string | undefined,
    titleFontWeightProp23: string | undefined,
    titleAlignmentProp23: string | undefined,
    titleFontCategoryProp24: string | undefined,
    titleFontWeightProp24: string | undefined,
    titleAlignmentProp24: string | undefined,
    titleFontCategoryProp25: string | undefined,
    titleFontWeightProp25: string | undefined,
    titleAlignmentProp25: string | undefined,
    titleFontCategoryProp26: string | undefined,
    titleFontWeightProp26: string | undefined,
    titleAlignmentProp26: string | undefined,
    titleFontCategoryProp27: string | undefined,
    titleFontWeightProp27: string | undefined,
    titleAlignmentProp27: string | undefined,
    titleFontCategoryProp28: string | undefined,
    titleFontWeightProp28: string | undefined,
    titleAlignmentProp28: string | undefined,
    titleFontCategoryProp29: string | undefined,
    titleFontWeightProp29: string | undefined,
    titleAlignmentProp29: string | undefined,
    titleFontCategoryProp30: string | undefined,
    titleFontWeightProp30: string | undefined,
    titleAlignmentProp30: string | undefined,
    titleFontCategoryProp31: string | undefined,
    titleFontWeightProp31: string | undefined,
    titleAlignmentProp31: string | undefined,
    titleFontCategoryProp32: string | undefined,
    titleFontWeightProp32: string | undefined,
    titleAlignmentProp32: string | undefined,
    titleFontCategoryProp33: string | undefined,
    titleFontWeightProp33: string | undefined,
    titleAlignmentProp33: string | undefined,
    titleFontCategoryProp34: string | undefined,
    titleFontWeightProp34: string | undefined,
    titleAlignmentProp34: string | undefined,
    titleFontCategoryProp35: string | undefined,
    titleFontWeightProp35: string | undefined,
    titleAlignmentProp35: string | undefined,
    titleFontCategoryProp36: string | undefined,
    titleFontWeightProp36: string | undefined,
    titleAlignmentProp36: string | undefined,
    titleFontCategoryProp37: string | undefined,
    titleFontWeightProp37: string | undefined,
    titleAlignmentProp37: string | undefined,
    titleFontCategoryProp38: string | undefined,
    titleFontWeightProp38: string | undefined,
    titleAlignmentProp38: string | undefined,
    titleFontCategoryProp39: string | undefined,
    titleFontWeightProp39: string | undefined,
    titleAlignmentProp39: string | undefined,
    titleFontCategoryProp40: string | undefined,
    titleFontWeightProp40: string | undefined,
    titleAlignmentProp40: string | undefined,
    titleFontCategoryProp41: string | undefined,
    titleFontWeightProp41: string | undefined,
    titleAlignmentProp41: string | undefined,
    titleFontCategoryProp42: string | undefined,
    titleFontWeightProp42: string | undefined,
    titleAlignmentProp42: string | undefined,
    titleFontCategoryProp43: string | undefined,
    titleFontWeightProp43: string | undefined,
    titleAlignmentProp43: string | undefined,
    titleFontCategoryProp44: string | undefined,
    titleFontWeightProp44: string | undefined,
    titleAlignmentProp44: string | undefined,
    titleFontCategoryProp45: string | undefined,
    titleFontWeightProp45: string | undefined,
    titleAlignmentProp45: string | undefined,
    titleFontCategoryProp46: string | undefined,
    titleFontWeightProp46: string | undefined,
    titleAlignmentProp46: string | undefined,
    titleFontCategoryProp47: string | undefined,
    titleFontWeightProp47: string | undefined,
    titleAlignmentProp47: string | undefined,
    titleFontCategoryProp48: string | undefined,
    titleFontWeightProp48: string | undefined,
    titleAlignmentProp48: string | undefined,
    titleFontCategoryProp49: string | undefined,
    titleFontWeightProp49: string | undefined,
    titleAlignmentProp49: string | undefined,
    titleFontCategoryProp50: string | undefined,
    titleFontWeightProp50: string | undefined,
    titleAlignmentProp50: string | undefined,
    titleFontCategoryProp51: string | undefined,
    titleFontWeightProp51: string | undefined,
    titleAlignmentProp51: string | undefined,
    titleFontCategoryProp52: string | undefined,
    titleFontWeightProp52: string | undefined,
    titleAlignmentProp52: string | undefined,
    titleFontCategoryProp53: string | undefined,
    titleFontWeightProp53: string | undefined,
    titleAlignmentProp53: string | undefined,
    titleFontCategoryProp54: string | undefined,
    titleFontWeightProp54: string | undefined,
    titleAlignmentProp54: string | undefined,
    titleFontCategoryProp55: string | undefined,
    titleFontWeightProp55: string | undefined,
    titleAlignmentProp55: string | undefined,
    titleFontCategoryProp56: string | undefined,
    titleFontWeightProp56: string | undefined,
    titleAlignmentProp56: string | undefined,
    titleFontCategoryProp57: string | undefined,
    titleFontWeightProp57: string | undefined,
    titleAlignmentProp57: string | undefined,
    titleFontCategoryProp58: string | undefined,
    titleFontWeightProp58: string | undefined,
    titleAlignmentProp58: string | undefined,
    titleFontCategoryProp59: string | undefined,
    titleFontWeightProp59: string | undefined,
    titleAlignmentProp59: string | undefined,
    titleFontCategoryProp60: string | undefined,
    titleFontWeightProp60: string | undefined,
    titleAlignmentProp60: string | undefined,
    titleFontCategoryProp61: string | undefined,
    titleFontWeightProp61: string | undefined,
    titleAlignmentProp61: string | undefined,
    titleFontCategoryProp62: string | undefined,
    titleFontWeightProp62: string | undefined,
    titleAlignmentProp62: string | undefined,
    titleFontCategoryProp63: string | undefined,
    titleFontWeightProp63: string | undefined,
    titleAlignmentProp63: string | undefined,
    titleFontCategoryProp64: string | undefined,
    titleFontWeightProp64: string | undefined,
    titleAlignmentProp64: string | undefined,
    titleFontCategoryProp65: string | undefined,
    titleFontWeightProp65: string | undefined,
    titleAlignmentProp65: string | undefined,
    titleFontCategoryProp66: string | undefined,
    titleFontWeightProp66: string | undefined,
    titleAlignmentProp66: string | undefined,
    titleFontCategoryProp67: string | undefined,
    titleFontWeightProp67: string | undefined,
    titleAlignmentProp67: string | undefined,
    titleFontCategoryProp68: string | undefined,
    titleFontWeightProp68: string | undefined,
    titleAlignmentProp68: string | undefined,
    titleFontCategoryProp69: string | undefined,
    titleFontWeightProp69: string | undefined,
    titleAlignmentProp69: string | undefined,
    titleFontCategoryProp70: string | undefined,
    titleFontWeightProp70: string | undefined,
    titleAlignmentProp70: string | undefined,
    titleFontCategoryProp71: string | undefined,
    titleFontWeightProp71: string | undefined,
    titleAlignmentProp71: string | undefined,
    titleFontCategoryProp72: string | undefined,
    titleFontWeightProp72: string | undefined,
    titleAlignmentProp72: string | undefined,
    titleFontCategoryProp73: string | undefined,
    titleFontWeightProp73: string | undefined,
    titleAlignmentProp73: string | undefined,
    titleFontCategoryProp74: string | undefined,
    titleFontWeightProp74: string | undefined,
    titleAlignmentProp74: string | undefined,
    titleFontCategoryProp75: string | undefined,
    titleFontWeightProp75: string | undefined,
    titleAlignmentProp75: string | undefined,
    titleFontCategoryProp76: string | undefined,
    titleFontWeightProp76: string | undefined,
    titleAlignmentProp76: string | undefined,
    titleFontCategoryProp77: string | undefined,
    titleFontWeightProp77: string | undefined,
    titleAlignmentProp77: string | undefined,
    titleFontCategoryProp78: string | undefined,
    titleFontWeightProp78: string | undefined,
    titleAlignmentProp78: string | undefined,
    titleFontCategoryProp79: string | undefined,
    titleFontWeightProp79: string | undefined,
    titleAlignmentProp79: string | undefined,
    titleFontCategoryProp80: string | undefined,
    titleFontWeightProp80: string | undefined,
    titleAlignmentProp80: string | undefined,
    titleFontCategoryProp81: string | undefined,
    titleFontWeightProp81: string | undefined,
    titleAlignmentProp81: string | undefined,
    titleFontCategoryProp82: string | undefined,
    titleFontWeightProp82: string | undefined,
    titleAlignmentProp82: string | undefined,
    titleFontCategoryProp83: string | undefined,
    titleFontWeightProp83: string | undefined,
    titleAlignmentProp83: string | undefined,
    titleFontCategoryProp84: string | undefined,
    titleFontWeightProp84: string | undefined,
    titleAlignmentProp84: string | undefined,
    titleFontCategoryProp85: string | undefined,
    titleFontWeightProp85: string | undefined,
    titleAlignmentProp85: string | undefined,
    titleFontCategoryProp86: string | undefined,
    titleFontWeightProp86: string | undefined,
    titleAlignmentProp86: string | undefined,
    titleFontCategoryProp87: string | undefined,
    titleFontWeightProp87: string | undefined,
    titleAlignmentProp87: string | undefined,
    titleFontCategoryProp88: string | undefined,
    titleFontWeightProp88: string | undefined,
    titleAlignmentProp88: string | undefined,
    titleFontCategoryProp89: string | undefined,
    titleFontWeightProp89: string | undefined,
    titleAlignmentProp89: string | undefined,
    titleFontCategoryProp90: string | undefined,
    titleFontWeightProp90: string | undefined,
    titleAlignmentProp90: string | undefined,
    titleFontCategoryProp91: string | undefined,
    titleFontWeightProp91: string | undefined,
    titleAlignmentProp91: string | undefined,
    titleFontCategoryProp92: string | undefined,
    titleFontWeightProp92: string | undefined,
    titleAlignmentProp92: string | undefined,
    titleFontCategoryProp93: string | undefined,
    titleFontWeightProp93: string | undefined,
    titleAlignmentProp93: string | undefined,
    titleFontCategoryProp94: string | undefined,
    titleFontWeightProp94: string | undefined,
    titleAlignmentProp94: string | undefined,
    titleFontCategoryProp95: string | undefined,
    titleFontWeightProp95: string | undefined,
    titleAlignmentProp95: string | undefined,
    titleFontCategoryProp96: string | undefined,
    titleFontWeightProp96: string | undefined,
    titleAlignmentProp96: string | undefined,
    titleFontCategoryProp97: string | undefined,
    titleFontWeightProp97: string | undefined,
    titleAlignmentProp97: string | undefined,
    titleFontCategoryProp98: string | undefined,
    titleFontWeightProp98: string | undefined,
    titleAlignmentProp98: string | undefined,
    titleFontCategory