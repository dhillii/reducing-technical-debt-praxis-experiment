```typescript
import CoverImage from '../../../../assets/images/user-cover.jpg';
import LatestPosts1 from '../../../../assets/images/latest-posts-1.jpg';
import LatestPosts2 from '../../../../assets/images/latest-posts-2.jpg';
import LatestPosts3 from '../../../../assets/images/latest-posts-3.jpg';
import clsx from 'clsx';
import {GhostOrb, Icon} from '@tryghost/admin-x-design-system';
import {isManagedEmail} from '@tryghost/admin-x-framework/api/config';
import {useGlobalData} from '../../../providers/global-data-provider';

interface NewsletterPreviewContentProps {
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
}

const getTitleFontClasses = (titleFontCategory?: string, titleFontWeight?: string): string => {
    const fontFamilyClass = titleFontCategory === 'serif' ? 'font-serif' : '';
    const fontWeightClass = {
        'normal': 'font-normal',
        'medium': 'font-medium',
        'semibold': 'font-semibold',
        'bold': 'font-bold'
    }[titleFontWeight || ''] || '';
    
    return clsx(fontFamilyClass, fontWeightClass);
};

const getExcerptClasses = (titleFontCategory?: string, bodyFontCategory?: string, titleAlignment?: string): string => {
    const baseClasses = 'mb-5 text-pretty leading-[1.7] text-black';
    
    const fontClasses = (() => {
        if (titleFontCategory === 'serif' && bodyFontCategory === 'serif') {
            return 'mb-8 font-serif text-[2.0rem] leading-tight';
        }
        if (titleFontCategory !== 'serif' && bodyFontCategory === 'serif') {
            return 'mb-8 text-[1.7rem] leading-tight tracking-tight';
        }
        if (titleFontCategory === 'serif' && bodyFontCategory !== 'serif') {
            return 'mb-8 font-serif text-[2.0rem] leading-tight';
        }
        return 'mb-8 text-[1.9rem] leading-tight tracking-tight';
    })();
    
    const alignmentClass = titleAlignment === 'center' ? 'text-center' : '';
    
    return clsx(baseClasses, fontClasses, alignmentClass);
};

const getDividerClasses = (dividerStyle?: string): string => {
    return clsx(
        dividerStyle === 'dashed' && 'border-dashed',
        dividerStyle === 'dotted' && 'border-b-2 border-dotted'
    );
};

const getImageCornerClasses = (imageCorners?: string): string => {
    return clsx(
        imageCorners === 'square' && 'rounded-none',
        imageCorners === 'rounded' && 'rounded-md'
    );
};

const getButtonClasses = (buttonCorners?: string, buttonStyle?: string, linkStyle?: string): string => {
    return clsx(
        'inline-block border px-[18px] py-2 font-sans text-[15px]',
        buttonCorners === 'rounded' && 'rounded-[6px]',
        buttonCorners === 'pill' && 'rounded-full',
        buttonCorners === 'square' && 'rounded-none',
        buttonStyle === 'outline' ? 'bg-transparent' : 'border-transparent text-white',
        linkStyle === 'bold' ? 'font-bold' : 'font-semibold'
    );
};

const getButtonStyles = (buttonStyle?: string, buttonColor?: string, buttonTextColor?: string, accentColor?: string) => {
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

const EmailHeader: React.FC<{isManagedEmail: boolean; senderName?: string; senderEmail: string | null; senderReplyTo: string | null}> = ({isManagedEmail: isManaged, senderName, senderEmail, senderReplyTo}) => {
    if (isManaged) {
        return (
            <>
                <p className="leading-normal"><span className="font-semibold text-grey-900">From: </span><span>{senderName} ({senderEmail})</span></p>
                <p className="leading-normal">
                    <span className="font-semibold text-grey-900">Reply-to: </span>{senderReplyTo ? senderReplyTo : senderEmail}
                </p>
            </>
        );
    }
    return (
        <>
            <p className="leading-normal"><span className="font-semibold text-grey-900">{senderName}</span><span> {senderEmail}</span></p>
            <p className="leading-normal"><span className="font-semibold text-grey-900">To:</span> Jamie Larson jamie@example.com</p>
        </>
    );
};

const HeaderSection: React.FC<{
    headerImage?: string | null;
    headerIcon?: string;
    headerTitle?: string | null;
    headerSubtitle?: string | null;
    headerBackgroundColor?: string;
    headerTextColor?: string;
    secondaryHeaderTextColor?: string;
    showHeader: boolean;
}> = ({headerImage, headerIcon, headerTitle, headerSubtitle, headerBackgroundColor, headerTextColor, secondaryHeaderTextColor, showHeader}) => (
    <div className="px-[7rem]" style={{backgroundColor: headerBackgroundColor}}>
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
    </div>
);

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
}> = ({showPostTitleSection, showExcerpt, titleAlignment, titleFontCategory, titleFontWeight, bodyFontCategory, authorPlaceholder, postTitleColor, headerTextColor, secondaryHeaderTextColor, currentDate}) => {
    if (!showPostTitleSection) return null;
    
    return (
        <div className={clsx('flex flex-col py-8', titleAlignment === 'center' ? 'items-center' : 'items-start')}>
            <h2 className={clsx(
                'text-4xl font-bold leading-supertight text-black',
                getTitleFontClasses(titleFontCategory, titleFontWeight),
                titleAlignment === 'center' ? 'text-center' : 'text-left',
                showExcerpt ? 'mb-2' : 'mb-8'
            )} style={{color: postTitleColor}}>Your email newsletter</h2>
            {showExcerpt && (
                <p className={getExcerptClasses(titleFontCategory, bodyFontCategory, titleAlignment)} style={{color: headerTextColor}}>A subtitle to highlight key points and engage your readers.</p>
            )}
            <div className={clsx(
                'flex w-full justify-between text-center text-md leading-none text-grey-700',
                titleAlignment === 'center' ? 'flex-col gap-1' : 'flex-row'
            )}>
                <p className="pb-1 text-[1.3rem]" style={{color: secondaryHeaderTextColor}}>
                    By {authorPlaceholder}
                    <span className="before:pl-0.5 before:pr-1 before:content-['•']">{currentDate}</span>
                </p>
                <p className="pb-1 text-[1.3rem] underline" style={{color: secondaryHeaderTextColor}}><span>View in browser</span></p>
            </div>
        </div>
    );
};

const FeatureImageSection: React.FC<{
    showFeatureImage: boolean;
    showPostTitleSection: boolean;
    imageCorners?: string;
    secondaryHeaderTextColor?: string;
}> = ({showFeatureImage, showPostTitleSection, imageCorners, secondaryHeaderTextColor}) => {
    if (!showFeatureImage) return null;
    
    return (
        <>
            <div className={clsx(
                'h-[unset] w-full max-w-[600px] bg-cover bg-no-repeat',
                showPostTitleSection ? '' : 'pt-6'
            )}>
                <img alt="Feature" className={clsx(
                    'min-h-full min-w-full shrink-0',
                    getImageCornerClasses(imageCorners)
                )} src={CoverImage} />
            </div>
            <div className="mt-1 w-full max-w-[600px] pb-8 text-center text-[1.3rem] text-grey-700" style={{color: secondaryHeaderTextColor}}>Feature image caption</div>
        </>
    );
};

const ContentSection: React.FC<{
    dividerStyle?: string;
    dividerColor?: string;
    bodyFontCategory?: string;
    showFeatureImage: boolean;
    showPostTitleSection: boolean;
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
}> = ({dividerStyle, dividerColor, bodyFontCategory, showFeatureImage, showPostTitleSection, textColor, sectionTitleColor, linkColor, accentColor, linkStyle, buttonCorners, buttonStyle, buttonColor, buttonTextColor, titleFontCategory, titleFontWeight}) => (
    <div className={clsx(
        'max-w-[600px] border-b border-grey-200 pb-[52px] leading-[27.2px] text-black',
        getDividerClasses(dividerStyle),
        bodyFontCategory === 'serif' ? 'font-serif text-[1.8rem]' : 'text-[1.7rem] tracking-tight',
        (showFeatureImage || showPostTitleSection) ? '' : 'pt-8'
    )} style={{borderColor: dividerColor}}>
        <p className="mb-6" style={{color: textColor}}>This is what your content will look like when you send one of your posts as an email newsletter to your subscribers.</p>
        <p className="mb-6" style={{color: textColor}}>Over there on the right you&apos;ll see some settings that allow you to customize the look and feel of this template – from colors and typography to layout and buttons – to make it perfectly suited to your brand.</p>
        <p className="mb-[52px]" style={{color: textColor}}>Email templates are exceptionally finnicky to make, but we&apos;ve spent a long time optimising this one to make it work beautifully across devices, email clients and content types. So, you can trust that every email you send with Ghost will look great and work well. Just like the rest of your site.</p>
        <hr className={clsx('my-[52px] border-[#e0e7eb]', getDividerClasses(dividerStyle))} style={{borderColor: dividerColor}} />
        <h3 className={clsx(
            'mb-[13px] text-[2.6rem] leading-supertight',
            getTitleFontClasses(titleFontCategory, titleFontWeight)
        )} style={{color: sectionTitleColor}}>Need inspiration?</h3>
        <p className="mb-[27px]" style={{color: textColor}}>We&apos;ve put together a <a className={clsx(linkStyle === 'underline' && 'underline', linkStyle === 'bold' && 'font-bold')} href="https://ghost.org/help/email-design/" rel="noopener noreferrer" style={{color: linkColor || accentColor}} target="_blank">quick guide</a> that walks through all of the available settings, along with a few examples of what&apos;s possible.</p>
        <a
            className={getButtonClasses(buttonCorners, buttonStyle, linkStyle)}
            href="https://ghost.org/help/email-design/"
            rel="noopener noreferrer"
            style={getButtonStyles(buttonStyle, buttonColor, buttonTextColor, accentColor)}
            target="_blank"
        >
            Learn more
        </a>
    </div>
);

const FeedbackSection: React.FC<{
    showFeedback: boolean;
    showCommentCta: boolean;
    dividerStyle?: string;
    dividerColor?: string;
    textColor?: string;
}> = ({showFeedback, showCommentCta, dividerStyle, dividerColor, textColor}) => {
    if (!showFeedback && !showCommentCta) return null;
    
    return (
        <div className={clsx('grid gap-5 border-b border-grey-200 px-6 py-5', getDividerClasses(dividerStyle))} style={{borderColor: dividerColor}}>
            <div className="flex justify-center gap-3">
                {showFeedback && (
                    <>
                        <button className="pointer-events-none cursor-default whitespace-nowrap rounded-[2.2rem] bg-transparent font-semibold" type="button">
                            <span className="inline-flex items-center gap-2 px-[18px] py