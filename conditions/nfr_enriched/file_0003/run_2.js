```typescript
import {memo, useCallback, useEffect, useRef, useState} from 'react';

import APAvatar from '@src/components/global/ap-avatar';
import DotsPattern from './dots-pattern';
import ProfileCardShadow from '@assets/images/profile-card-shadow.png';
import ProfileCardShadowSquare from '@assets/images/profile-card-shadow-square.png';
import html2canvas from 'html2canvas-objectfit-fix';
import {Account} from '@src/api/activitypub';
import {Button, H2, LoadingIndicator, LucideIcon, Skeleton, ToggleGroup, ToggleGroupItem, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@tryghost/shade';
import {imageUrlToDataUrl} from '@src/utils/image';
import {toast} from 'sonner';
import {useBrowseSite} from '@tryghost/admin-x-framework/api/site';

type ProfileProps = {
    account?: Account
    isLoading: boolean
}

type ProfileCardProps = {
    isScreenshot?: boolean
    format?: 'vertical' | 'square'
    account?: Account
    isLoading: boolean
    bannerDataUrl: string | null
    avatarDataUrl: string | null
    coverImage?: string
    publicationIcon?: string
    siteTitle?: string
    backgroundColor: 'light' | 'dark' | 'accent'
    accentColor?: string
}

type BackgroundColorType = 'light' | 'dark' | 'accent';
type CardFormatType = 'vertical' | 'square';

const COLOR_MAP: Record<BackgroundColorType, {bg: string; text: string}> = {
    light: {bg: '#fff', text: '#15171a'},
    dark: {bg: '#15171a', text: '#fff'},
    accent: {bg: '#15171a', text: '#fff'}
};

const GRADIENT_MAP: Record<BackgroundColorType, (accentColor?: string) => string> = {
    light: () => `linear-gradient(to bottom left, #EBEEF0, ${hexToRgba('#EBEEF0', 0)})`,
    dark: () => `linear-gradient(to bottom left, ${hexToRgba('#1A1E22', 1)}, ${hexToRgba('#343C48', 1)})`,
    accent: (accentColor) => `linear-gradient(to bottom left, ${hexToRgba(accentColor || '#15171a', 0.08)}, ${hexToRgba(accentColor || '#15171a', 0.06)})`
};

const DOTS_PATTERN_COLOR_MAP: Record<BackgroundColorType, string> = {
    light: hexToRgba('#15171a', 0.025),
    dark: hexToRgba('#15171a', 0.23),
    accent: 'rgba(0, 0, 0, 0.02)'
};

const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getBackgroundColor = (backgroundColor: BackgroundColorType, accentColor?: string): string => {
    if (backgroundColor === 'accent') {
        return accentColor || COLOR_MAP.accent.bg;
    }
    return COLOR_MAP[backgroundColor].bg;
};

const getTextColor = (backgroundColor: BackgroundColorType): string => {
    return COLOR_MAP[backgroundColor].text;
};

const getGradient = (backgroundColor: BackgroundColorType, accentColor?: string): string => {
    return GRADIENT_MAP[backgroundColor](accentColor);
};

const getDotsPatternColor = (backgroundColor: BackgroundColorType): string => {
    return DOTS_PATTERN_COLOR_MAP[backgroundColor];
};

const BannerSection = memo(({
    bannerImageSrc,
    avatarImageSrc,
    account,
    cardBackgroundColor,
    isScreenshot,
    accentColor,
    backgroundColor
}: {
    bannerImageSrc?: string
    avatarImageSrc?: string
    account?: Account
    cardBackgroundColor: string
    isScreenshot: boolean
    accentColor?: string
    backgroundColor: BackgroundColorType
}) => {
    const gradientColor = backgroundColor === 'accent' ? '#ffffff' : accentColor || '#15171a';
    const patternColor = backgroundColor === 'accent' ? hexToRgba(accentColor || '#15171a', 0.2) : 'rgba(255, 255, 255, 0.2)';

    return (
        <div className='relative h-48 p-2'>
            {bannerImageSrc ? (
                <img
                    alt={account?.name}
                    className='size-full rounded-[26px] rounded-b-none object-cover'
                    referrerPolicy='no-referrer'
                    src={bannerImageSrc}
                />
            ) : (
                <div className='relative size-full overflow-hidden rounded-[26px] rounded-b-none' style={{background: `linear-gradient(to bottom, ${hexToRgba(gradientColor, 1)}, ${hexToRgba(gradientColor, 0.5)})`}}>
                    <DotsPattern className='absolute' style={{color: patternColor, top: isScreenshot ? '-42px' : '-84px', left: isScreenshot ? '-69px' : '-138px'}} />
                </div>
            )}
            {avatarImageSrc && (
                <div className='absolute bottom-0 left-1/2 -mb-8 -translate-x-1/2 rounded-full border-8 [&>div]:!size-16 [&_img]:!size-16' style={{borderColor: cardBackgroundColor}}>
                    <APAvatar
                        author={{
                            icon: {url: avatarImageSrc || ''},
                            name: account?.name || '',
                            handle: account?.handle
                        }}
                        size='md'
                    />
                </div>
            )}
        </div>
    );
});

BannerSection.displayName = 'BannerSection';

const HandleDisplay = memo(({
    handle,
    backgroundColor,
    accentColor,
    isScreenshot,
    onCopy
}: {
    handle?: string
    backgroundColor: BackgroundColorType
    accentColor?: string
    isScreenshot: boolean
    onCopy: () => void
}) => {
    const [copied, setCopied] = useState(false);
    const copyTimeoutRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (copyTimeoutRef.current) {
            window.clearTimeout(copyTimeoutRef.current);
        }
    }, []);

    const handleCopyClick = async () => {
        if (!handle || !navigator?.clipboard?.writeText) {
            toast.error('Unable to copy handle');
            return;
        }
        try {
            await navigator.clipboard.writeText(handle);
            setCopied(true);
            toast.success('Handle copied');
            if (copyTimeoutRef.current) {
                window.clearTimeout(copyTimeoutRef.current);
            }
            copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy handle');
            setCopied(false);
        }
    };

    const textColor = backgroundColor !== 'light' ? '#fff' : accentColor;
    const borderColor = accentColor ? hexToRgba(backgroundColor === 'accent' ? '#ffffff' : accentColor, backgroundColor !== 'light' ? 0.7 : 0.2) : undefined;
    const backgroundGradient = accentColor ? `linear-gradient(to top right, ${hexToRgba(backgroundColor === 'accent' ? '#ffffff' : accentColor, backgroundColor === 'dark' ? 0.12 : 0.04)}, ${hexToRgba(backgroundColor === 'accent' ? '#ffffff' : accentColor, backgroundColor === 'dark' ? 0.48 : 0.16)})` : undefined;

    return (
        <div
            className={`mt-auto flex max-h-[60px] min-h-12 w-full items-center justify-center break-all rounded-full border px-4 py-2 font-medium leading-7 ${isScreenshot && 'tracking-normal'}`}
            style={{
                color: textColor,
                borderColor,
                background: backgroundGradient
            }}
        >
            <div className='mb-0.5'>
                {handle}
                {!isScreenshot && handle && (
                    <Button
                        className='relative top-[3px] ml-1.5 size-4 p-0 hover:opacity-80'
                        style={{color: textColor}}
                        title='Copy handle'
                        variant='link'
                        onClick={handleCopyClick}
                    >
                        {!copied ? <LucideIcon.Copy size={12} /> : <LucideIcon.Check size={12} />}
                    </Button>
                )}
            </div>
        </div>
    );
});

HandleDisplay.displayName = 'HandleDisplay';

const ProfileCard: React.FC<ProfileCardProps> = memo(({
    isScreenshot = false,
    format = 'vertical',
    account,
    isLoading,
    bannerDataUrl,
    avatarDataUrl,
    coverImage,
    publicationIcon,
    siteTitle,
    backgroundColor,
    accentColor
}) => {
    const cardBackgroundColor = getBackgroundColor(backgroundColor, accentColor);
    const textColor = getTextColor(backgroundColor);
    const margin = isScreenshot ? 'm-12' : 'm-16 max-sm:m-8';
    const borderClass = isScreenshot ? '' : 'shadow-xl';
    const cardWidth = format === 'square' ? 'w-[422px]' : 'w-[316px]';
    const cardHeight = 'h-[422px]';

    const bannerImageSrc = isScreenshot && bannerDataUrl ? bannerDataUrl : (account?.bannerImageUrl || coverImage);
    const avatarImageSrc = isScreenshot && avatarDataUrl ? avatarDataUrl : (account?.avatarUrl || publicationIcon);
    const hasAvatar = account?.avatarUrl || publicationIcon;

    return (
        <div className={`relative z-20 flex flex-col ${margin} ${cardWidth} ${cardHeight} rounded-[32px] ${borderClass}`} style={{backgroundColor: cardBackgroundColor}}>
            <BannerSection
                bannerImageSrc={bannerImageSrc}
                avatarImageSrc={avatarImageSrc}
                account={account}
                cardBackgroundColor={cardBackgroundColor}
                isScreenshot={isScreenshot}
                accentColor={accentColor}
                backgroundColor={backgroundColor}
            />
            <div className={`flex grow flex-col items-center p-6 ${hasAvatar ? 'pt-9' : 'pt-3'} text-center ${format === 'square' ? 'flex-1 justify-center' : ''}`}>
                <H2 className={`${isScreenshot && 'tracking-normal'}`} style={{color: textColor}}>
                    {!isLoading ? account?.name : <Skeleton className='w-32' />}
                </H2>
                <span className={`mt-1.5 leading-7 ${isScreenshot && 'tracking-normal'}`} style={{color: textColor}}>
                    {!isLoading ? 'Available on Ghost, Flipboard, Threads, Bluesky, Mastodon, or wherever you get your social web feeds.' : <Skeleton className='w-28' />}
                </span>
                <HandleDisplay
                    handle={account?.handle}
                    backgroundColor={backgroundColor}
                    accentColor={accentColor}
                    isScreenshot={isScreenshot}
                    onCopy={() => {}}
                />
            </div>
        </div>
    );
});

ProfileCard.displayName = 'ProfileCard';

const SocialShareButtons = memo(({shareText}: {shareText: string}) => {
    const socialLinks = [
        {
            href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
            icon: (
                <svg aria-hidden="true" viewBox="0 0 24 24"><path className="social-x_svg__x" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>
            )
        },
        {
            href: `https://threads.net/intent/post?text=${encodeURIComponent(shareText)}`,
            icon: (
                <svg fill="none" viewBox="0 0 18 18"><g clipPath="url(#social-threads_svg__clip0_351_18008)"><path d="M13.033 8.38a5.924 5.924 0 00-.223-.102c-.13-2.418-1.452-3.802-3.67-3.816h-.03c-1.327 0-2.43.566-3.11 1.597l1.22.837c.507-.77 1.304-.934 1.89-.934h.02c.73.004 1.282.217 1.639.63.26.302.433.72.519 1.245a9.334 9.334 0 00-2.097-.101c-2.109.121-3.465 1.351-3.374 3.06.047.868.478 1.614 1.216 2.1.624.413 1.428.614 2.263.568 1.103-.06 1.969-.48 2.572-1.25.459-.585.749-1.342.877-2.296.526.317.915.735 1.13 1.236.366.854.387 2.255-.756 3.398-1.003 1.002-2.207 1.435-4.028 1.448-2.02-.015-3.547-.663-4.54-1.925-.93-1.182-1.41-2.89-1.428-5.075.018-2.185.498-3.893 1.428-5.075.993-1.262 2.52-1.91 4.54-1.925 2.034.015 3.588.666 4.62 1.934.505.622.886 1.405 1.137 2.317l1.43-.382c-.305-1.122-.784-2.09-1.436-2.892C13.52 1.35 11.587.517 9.096.5h-.01C6.6.517 4.689 1.354 3.404 2.986 2.262 4.44 1.672 6.46 1.652 8.994v.012c.02 2.534.61 4.555 1.752 6.008C4.69 16.646 6.6 17.483 9.086 17.5h.01c2.21-.015 3.768-.594 5.051-1.876 1.68-1.678 1.629-3.78 1.075-5.07-.397-.927-1.154-1.678-2.189-2.175zm-3.816 3.587c-.924.052-1.884-.363-1.932-1.252-.035-.659.47-1.394 1.99-1.482a8.9 8.9 0 01.512