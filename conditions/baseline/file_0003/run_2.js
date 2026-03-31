```tsx
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

type BackgroundColor = 'light' | 'dark' | 'accent';
type CardFormat = 'vertical' | 'square';

type ProfileProps = {
    account?: Account;
    isLoading: boolean;
};

type ProfileCardProps = {
    isScreenshot?: boolean;
    format?: CardFormat;
    account?: Account;
    isLoading: boolean;
    bannerDataUrl: string | null;
    avatarDataUrl: string | null;
    coverImage?: string;
    publicationIcon?: string;
    siteTitle?: string;
    backgroundColor: BackgroundColor;
    accentColor?: string;
};

type SocialLink = {
    href: string;
    icon: React.ReactNode;
    label: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const BACKGROUND_COLORS: Record<BackgroundColor, string> = {
    light: '#fff',
    dark: '#15171a',
    accent: ''
};

const TEXT_COLORS: Record<BackgroundColor, string> = {
    light: '#15171a',
    dark: '#fff',
    accent: '#fff'
};

const getCardBackgroundColor = (backgroundColor: BackgroundColor, accentColor?: string): string => {
    if (backgroundColor === 'accent') {
        return accentColor || '#15171a';
    }
    return BACKGROUND_COLORS[backgroundColor];
};

const getTextColor = (backgroundColor: BackgroundColor): string => TEXT_COLORS[backgroundColor];

const getAccentBase = (backgroundColor: BackgroundColor, accentColor?: string): string =>
    backgroundColor === 'accent' ? '#ffffff' : accentColor || '#15171a';

// ─── Hooks ───────────────────────────────────────────────────────────────────

const useCopyHandle = (handle?: string) => {
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
        }
    }, []);

    const copy = async () => {
        if (!handle || !navigator?.clipboard?.writeText) {
            toast.error('Unable to copy handle');
            return;
        }
        try {
            await navigator.clipboard.writeText(handle);
            setCopied(true);
            toast.success('Handle copied');
            if (timeoutRef.current) {
                window.clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy handle');
            setCopied(false);
        }
    };

    return {copied, copy};
};

const useImageDataUrls = (
    bannerUrl?: string,
    avatarUrl?: string
) => {
    const [bannerDataUrl, setBannerDataUrl] = useState<string | null>(null);
    const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);

    const convert = useCallback(async () => {
        if (bannerUrl) {
            setBannerDataUrl(await imageUrlToDataUrl(bannerUrl));
        }
        if (avatarUrl) {
            setAvatarDataUrl(await imageUrlToDataUrl(avatarUrl));
        }
    }, [bannerUrl, avatarUrl]);

    useEffect(() => {
        convert();
    }, [convert]);

    return {bannerDataUrl, avatarDataUrl};
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const CardBanner: React.FC<{
    src?: string;
    name?: string;
    backgroundColor: BackgroundColor;
    accentColor?: string;
    isScreenshot: boolean;
}> = ({src, name, backgroundColor, accentColor, isScreenshot}) => {
    const accentBase = getAccentBase(backgroundColor, accentColor);

    if (src) {
        return (
            <img
                alt={name}
                className='size-full rounded-[26px] rounded-b-none object-cover'
                referrerPolicy='no-referrer'
                src={src}
            />
        );
    }

    return (
        <div
            className='relative size-full overflow-hidden rounded-[26px] rounded-b-none'
            style={{background: `linear-gradient(to bottom, ${hexToRgba(accentBase, 1)}, ${hexToRgba(accentBase, 0.5)})`}}
        >
            <DotsPattern
                className='absolute'
                style={{
                    color: backgroundColor === 'accent'
                        ? hexToRgba(accentColor || '#15171a', 0.2)
                        : 'rgba(255, 255, 255, 0.2)',
                    top: isScreenshot ? '-42px' : '-84px',
                    left: isScreenshot ? '-69px' : '-138px'
                }}
            />
        </div>
    );
};

const CardHandle: React.FC<{
    handle?: string;
    backgroundColor: BackgroundColor;
    accentColor?: string;
    isScreenshot: boolean;
    onCopy: () => void;
    copied: boolean;
}> = ({handle, backgroundColor, accentColor, isScreenshot, onCopy, copied}) => {
    const accentBase = getAccentBase(backgroundColor, accentColor);
    const isLight = backgroundColor === 'light';
    const isDark = backgroundColor === 'dark';

    return (
        <div
            className={`mt-auto flex max-h-[60px] min-h-12 w-full items-center justify-center break-all rounded-full border px-4 py-2 font-medium leading-7 ${isScreenshot && 'tracking-normal'}`}
            style={{
                color: !isLight ? '#fff' : accentColor,
                borderColor: accentColor ? hexToRgba(accentBase, !isLight ? 0.7 : 0.2) : undefined,
                background: accentColor
                    ? `linear-gradient(to top right, ${hexToRgba(accentBase, isDark ? 0.12 : 0.04)}, ${hexToRgba(accentBase, isDark ? 0.48 : 0.16)})`
                    : undefined
            }}
        >
            <div className='mb-0.5'>
                {handle}
                {!isScreenshot && handle && (
                    <Button
                        className='relative top-[3px] ml-1.5 size-4 p-0 hover:opacity-80'
                        style={{color: !isLight ? '#fff' : accentColor}}
                        title='Copy handle'
                        variant='link'
                        onClick={onCopy}
                    >
                        {copied ? <LucideIcon.Check size={12} /> : <LucideIcon.Copy size={12} />}
                    </Button>
                )}
            </div>
        </div>
    );
};

// ─── ProfileCard ─────────────────────────────────────────────────────────────

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
    const {copied, copy} = useCopyHandle(account?.handle);

    const cardBackgroundColor = getCardBackgroundColor(backgroundColor, accentColor);
    const textColor = getTextColor(backgroundColor);
    const margin = isScreenshot ? 'm-12' : 'm-16 max-sm:m-8';
    const borderClass = isScreenshot ? '' : 'shadow-xl';
    const cardWidth = format === 'square' ? 'w-[422px]' : 'w-[316px]';
    const hasAvatar = Boolean(account?.avatarUrl || publicationIcon);

    const bannerSrc = isScreenshot && bannerDataUrl ? bannerDataUrl : (account?.bannerImageUrl || coverImage);
    const avatarSrc = isScreenshot && avatarDataUrl ? avatarDataUrl : (account?.avatarUrl || publicationIcon);

    return (
        <div
            className={`relative z-20 flex flex-col ${margin} ${cardWidth} h-[422px] rounded-[32px] ${borderClass}`}
            style={{backgroundColor: cardBackgroundColor}}
        >
            <div className='relative h-48 p-2'>
                <CardBanner
                    accentColor={accentColor}
                    backgroundColor={backgroundColor}
                    isScreenshot={isScreenshot}
                    name={account?.name}
                    src={bannerSrc}
                />
                {avatarSrc && (
                    <div
                        className='absolute bottom-0 left-1/2 -mb-8 -translate-x-1/2 rounded-full border-8 [&>div]:!size-16 [&_img]:!size-16'
                        style={{borderColor: cardBackgroundColor}}
                    >
                        <APAvatar
                            author={{
                                icon: {url: avatarSrc},
                                name: account?.name || siteTitle || '',
                                handle: account?.handle
                            }}
                            size='md'
                        />
                    </div>
                )}
            </div>

            <div className={`flex grow flex-col items-center p-6 ${hasAvatar ? 'pt-9' : 'pt-3'} text-center ${format === 'square' ? 'flex-1 justify-center' : ''}`}>
                <H2 className={isScreenshot ? 'tracking-normal' : ''} style={{color: textColor}}>
                    {isLoading ? <Skeleton className='w-32' /> : account?.name}
                </H2>
                <span className={`mt-1.5 leading-7 ${isScreenshot && 'tracking-normal'}`} style={{color: textColor}}>
                    {isLoading
                        ? <Skeleton className='w-28' />
                        : 'Available on Ghost, Flipboard, Threads, Bluesky, Mastodon, or wherever you get your social web feeds.'
                    }
                </span>
                <CardHandle
                    accentColor={accentColor}
                    backgroundColor={backgroundColor}
                    copied={copied}
                    handle={account?.handle}
                    isScreenshot={isScreenshot}
                    onCopy={copy}
                />
            </div>
        </div>
    );
});

ProfileCard.displayName = 'ProfileCard';

// ─── Social Icons ─────────────────────────────────────────────────────────────

const XIcon = () => (
    <svg aria-hidden='true' viewBox='0 0 24 24'>
        <path className='social-x_svg__x' d='M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' />
    </svg>
);

const ThreadsIcon = () => (
    <svg fill='none' viewBox='0 0 18 18'>
        <g clipPath='url(#social-threads_svg__clip0_351_18008)'>
            <path d='M13.033 8.38a5.924 5.924 0 00-.223-.102c-.13-2.418-1.452-3.802-3.67-3.816h-.03c-1.327 0-2.43.566-3.11 1.597l1.22.837c.507-.77 1.304-.934 1.89-.934h.02c.73.004 1.282.217 1.639.63.26.302.433.72.519 1.245a9.334 9.334 0 00-2.097-.101c-2.109.121-3.465 1.351-3.374 3.06.047.868.478 1.614 1.216 2.1.624.413 1.428.614 2.263.568 1.103-.06 1.969-.48 2.572-1.25.459-.585.749-1.342.877-2.296.526.317.915.735 1.13 1.236.366.854.387 2.255-.756 3.398-1.003 1.002-2.207 1.435-4.028 1.448-2.02-.015-3.547-.663-4.54-1.925-.93-1.182-1.41-2.89-1.428-5.075.018-2.185.498-3.893 1.428-5.075.993-1.262 2.52-1.91 4.54-1.925 2.034.015 3.588.666 4.62 1.934.505.622.886 1.405 1.137 2.317l1.43-.382c-.305-1.122-.784-2.09-1.436-2.892C13.52 1.35 11.587.517 9.096.5h-.01C6.6.517 4.689 1.354 3.404 2.986 2.262 4.44 1.672 6.46 1.652 8.994v.012c.02 2.534.61 4.555 1.752 6.008C4.69 16.646 6.6 17.483 9.086 17.5h.01c2.21-.015 3.768-.594 5.051-1.876 1.68-1.678 1.629-3.78 1.075-5.07-.397-.927-1.154-1.678-2.189-2.175zm-3.816 3.587c-.924.052-1.884-.363-1.932-1.252-.035-.659.47-1.394 1.99-1.482a8.9 8.9 0 01.512-.014c.552 0 1.068.053 1.538.156-.175 2.187-1.203 2.542-2.108 2.592z' fill='#000' />
        </g>
        <defs>
            <clipPath id='social-threads_svg__clip0_351_18008'>
                <path d='M0 0h17v17H0z' fill='#fff