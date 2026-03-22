# Refactored Profile Component

Here's the refactored code with reduced complexity through extraction of custom hooks, smaller components, and utility functions:

## Custom Hooks

```typescript
// hooks/useClipboard.ts
import { useRef, useState } from 'react';
import { toast } from 'sonner';

export const useHandleCopy = (handle?: string) => {
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    }, []);

    const copyHandle = async () => {
        if (!handle || !navigator?.clipboard?.writeText) {
            toast.error('Unable to copy handle');
            return;
        }
        try {
            await navigator.clipboard.writeText(handle);
            setCopied(true);
            toast.success('Handle copied');
            if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
            timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy handle');
            setCopied(false);
        }
    };

    return { copied, copyHandle };
};
```

```typescript
// hooks/useImageDataUrls.ts
import { useCallback, useEffect, useState } from 'react';
import { imageUrlToDataUrl } from '@src/utils/image';

export const useImageDataUrls = (bannerUrl?: string, avatarUrl?: string) => {
    const [bannerDataUrl, setBannerDataUrl] = useState<string | null>(null);
    const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);

    const convert = useCallback(async () => {
        if (bannerUrl) setBannerDataUrl(await imageUrlToDataUrl(bannerUrl));
        if (avatarUrl) setAvatarDataUrl(await imageUrlToDataUrl(avatarUrl));
    }, [bannerUrl, avatarUrl]);

    useEffect(() => {
        convert();
    }, [convert]);

    return { bannerDataUrl, avatarDataUrl };
};
```

```typescript
// hooks/useCardScreenshot.ts
import { useRef, useState } from 'react';
import html2canvas from 'html2canvas-objectfit-fix';
import { toast } from 'sonner';

const waitForNextFrame = () => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
});

const captureElementAsBlob = async (element: HTMLElement): Promise<Blob> => {
    const canvas = await html2canvas(element, {
        backgroundColor: 'transparent',
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 0,
    });

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            blob ? resolve(blob) : reject(new Error('Failed to create blob'));
        }, 'image/png');
    });
};

export const useCardScreenshot = () => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const copyImage = async () => {
        if (!cardRef.current || isProcessing) return;

        if (!navigator.clipboard || !('write' in navigator.clipboard) || typeof ClipboardItem === 'undefined') {
            toast.error('Clipboard API not supported in this browser');
            return;
        }

        setIsProcessing(true);
        await waitForNextFrame();

        try {
            const blobPromise = captureElementAsBlob(cardRef.current);
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
            toast.success('Image copied to clipboard');
        } catch {
            toast.error('Failed to copy image');
        } finally {
            setIsProcessing(false);
        }
    };

    return { cardRef, isProcessing, copyImage };
};
```

## Utility Functions

```typescript
// utils/profileCardStyles.ts
export const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

type BackgroundColor = 'light' | 'dark' | 'accent';

const CARD_COLORS = {
    light: { bg: '#fff', text: '#15171a' },
    dark: { bg: '#15171a', text: '#fff' },
    accent: { bg: null, text: '#fff' },
} as const;

export const getCardBackgroundColor = (backgroundColor: BackgroundColor, accentColor?: string) => {
    if (backgroundColor === 'accent') return accentColor || '#15171a';
    return CARD_COLORS[backgroundColor].bg;
};

export const getCardTextColor = (backgroundColor: BackgroundColor) => {
    return CARD_COLORS[backgroundColor].text;
};

export const getGradient = (backgroundColor: BackgroundColor, accentColor?: string) => {
    const gradients: Record<BackgroundColor, string> = {
        light: `linear-gradient(to bottom left, #EBEEF0, ${hexToRgba('#EBEEF0', 0)})`,
        dark: `linear-gradient(to bottom left, ${hexToRgba('#1A1E22', 1)}, ${hexToRgba('#343C48', 1)})`,
        accent: `linear-gradient(to bottom left, ${hexToRgba(accentColor || '#15171a', 0.08)}, ${hexToRgba(accentColor || '#15171a', 0.06)})`,
    };
    return gradients[backgroundColor];
};

export const getDotsPatternColor = (backgroundColor: BackgroundColor) => {
    const colors: Record<BackgroundColor, string> = {
        light: hexToRgba('#15171a', 0.025),
        dark: hexToRgba('#15171a', 0.23),
        accent: 'rgba(0, 0, 0, 0.02)',
    };
    return colors[backgroundColor];
};
```

## Smaller Sub-Components

```tsx
// components/SocialShareLinks.tsx
import React from 'react';

const SOCIAL_LINK_CLASS = 'flex h-[34px] w-10 items-center justify-center rounded-sm bg-white px-3 shadow-xs hover:bg-gray-50 [&_svg]:size-4';

const XIcon = () => (
    <svg aria-hidden="true" viewBox="0 0 24 24">
        <path className="social-x_svg__x" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
);

const ThreadsIcon = () => (
    <svg fill="none" viewBox="0 0 18 18">
        <g clipPath="url(#social-threads_svg__clip0_351_18008)">
            <path d="M13.033 8.38a5.924 5.924 0 00-.223-.102c-.13-2.418-1.452-3.802-3.67-3.816h-.03c-1.327 0-2.43.566-3.11 1.597l1.22.837c.507-.77 1.304-.934 1.89-.934h.02c.73.004 1.282.217 1.639.63.26.302.433.72.519 1.245a9.334 9.334 0 00-2.097-.101c-2.109.121-3.465 1.351-3.374 3.06.047.868.478 1.614 1.216 2.1.624.413 1.428.614 2.263.568 1.103-.06 1.969-.48 2.572-1.25.459-.585.749-1.342.877-2.296.526.317.915.735 1.13 1.236.366.854.387 2.255-.756 3.398-1.003 1.002-2.207 1.435-4.028 1.448-2.02-.015-3.547-.663-4.54-1.925-.93-1.182-1.41-2.89-1.428-5.075.018-2.185.498-3.893 1.428-5.075.993-1.262 2.52-1.91 4.54-1.925 2.034.015 3.588.666 4.62 1.934.505.622.886 1.405 1.137 2.317l1.43-.382c-.305-1.122-.784-2.09-1.436-2.892C13.52 1.35 11.587.517 9.096.5h-.01C6.6.517 4.689 1.354 3.404 2.986 2.262 4.44 1.672 6.46 1.652 8.994v.012c.02 2.534.61 4.555 1.752 6.008C4.69 16.646 6.6 17.483 9.086 17.5h.01c2.21-.015 3.768-.594 5.051-1.876 1.68-1.678 1.629-3.78 1.075-5.07-.397-.927-1.154-1.678-2.189-2.175zm-3.816 3.587c-.924.052-1.884-.363-1.932-1.252-.035-.659.47-1.394 1.99-1.482a8.9 8.9 0 01.512-.014c.552 0 1.068.053 1.538.156-.175 2.187-1.203 2.542-2.108 2.592z" fill="#000" />
        </g>
        <defs>
            <clipPath id="social-threads_svg__clip0_351_18008">
                <path d="M0 0h17v17H0z" fill="#fff" transform="translate(.5 .5)" />
            </clipPath>
        </defs>
    </svg>
);

const FacebookIcon = () => (
    <svg fill="none" viewBox="0 0 40 40">
        <title>social-facebook</title>
        <path className="social-facebook_svg__fb" d="M20 40.004c11.046 0 20-8.955 20-20 0-11.046-8.954-20-20-20s-20 8.954-20 20c0 11.045 8.954 20 20 20z" fill="#1977f3" />
        <path d="M27.785 25.785l.886-5.782h-5.546V16.25c0-1.58.773-3.125 3.26-3.125h2.522V8.204s-2.29-.39-4.477-.39c-4.568 0-7.555 2.767-7.555 7.781v4.408h-5.08v5.782h5.08v13.976a20.08 20.08 0 003.125.242c1.063 0 2.107-.085 3.125-.242V25.785h4.66z" fill="#fff" />
    </svg>
);

const LinkedInIcon = () => (
    <svg fill="none" viewBox="0 0 16 16">
        <g clipPath="url(#social-linkedin_svg__clip0_537_833)">
            <path className="social-linkedin_svg__linkedin" clipRule="evenodd" d="M1.778 16h12.444c.982 0 1.778-.796 1.778-1.778V1.778C16 .796 15.204 0 14.222 0H1.778C.796 0 0 .796 0 1.778v12.444C0 15.204.796 16 1.778 16z" fill="#007ebb" fillRule="evenodd" />
            <path clipRule="evenodd" d="M13.778 13.778h-2.374V9.734c0-1.109-.421-1.729-1.299-1.729-.955 0-1.453.645-1.453 1.729v4.044H6.363V6.074h2.289v1.038s.688-1.273 2.322-1.273c1.634 0 2.804.997 2.804 3.061v4.878zM3.634 5.065c-.78 0-1.411-.636-1.411-1.421s.631-1.422 1.41-1.422c.78 0 1.411.637 1.411 1.422 0 .785-.631 1.421-1.41 1.421zm-1.182 8.713h2.386V6.074H2.452v7.704z" fill="#fff" fillRule="evenodd" />
        </g>
        <defs>
            <clipPath id="social-linkedin_svg__clip0_537_833">
                <path d="M0 0h16v16H0z" fill="#fff" />
            </clipPath>
        </defs>
    </svg>
);

type SocialShareLinksProps = {
    shareText: string;
};

export const SocialShareLinks: React.FC<SocialShareLinksProps> = ({ shareText }) => {
    const encoded = encodeURIComponent(shareText);
    const links = [
        { href: `https://twitter.com/intent/tweet?text=${encoded}`, icon: <XIcon /> },
        { href: `https://threads.net/intent/post?text=${encoded}`, icon: <ThreadsIcon /> },
        { href: 'https://www.facebook.com/sharer/sharer.php?u=', icon: <FacebookIcon /> },
        { href: `http://www.linkedin.com/shareArticle?mini=true&title=${encoded}`, icon: <LinkedInIcon /> },
    ];

    return (
        <div className='flex items-center gap-2'>
            {links.map(({ href, icon }) => (
                <a key={href} className={SOCIAL_LINK_CLASS} href={href} rel="noopener noreferrer" target='_blank'>
                    {icon}
                </a>
            ))}
        </div>
    );
};
```

```tsx
// components/ColorFormatToolbar.tsx
import React from 'react';
import { LucideIcon, ToggleGroup, ToggleGroupItem, Tooltip, TooltipContent, TooltipTrigger } from '@tryghost/shade';

type BackgroundColor = 'light' | 'dark' | 'accent';
type CardFormat = 'vertical' | 'square';

type ColorFormatToolbarProps = {
    backgroundColor: BackgroundColor;
    cardFormat: CardFormat;
    accentColor?: string;
    onBackgroundChange: (value: BackgroundColor) => void;
    onFormatChange: (value: CardFormat) => void;
};

const TooltipToggleItem = ({ value, label, children }: { value: string; label: string; children: React.ReactNode }) => (
    <Tooltip>
        <TooltipTrigger>
            <ToggleGroupItem aria-label={label} value={value}>
                {children}
            </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
    </Tooltip>
);

export const ColorFormatToolbar: React.FC<ColorFormatToolbarProps> = ({
    backgroundColor,
    cardFormat,
    accentColor,
    onBackgroundChange,
    onFormatChange,
}) => (
    <div className='flex gap-4'>
        <ToggleGroup
            defaultValue='light'
            type='single'
            value={backgroundColor}
            onValueChange={(v) => v && onBackgroundChange(v as BackgroundColor)}
        >
            <TooltipToggleItem label='Light' value='light'>
                <div className='size-4 rounded-full border border-gray-500 dark:border-0 dark:bg-white' />
            </TooltipToggleItem>
            <TooltipToggleItem label='Dark' value='dark'>
                <div className='size-4 rounded-full bg-black dark:border dark:border-gray-700 dark:bg-transparent' />
            </TooltipToggleItem>
            <TooltipToggleItem label='Accent color' value='accent'>
                <div className='size-4 rounded-full' style={{ backgroundColor: accentColor }} />
            </TooltipToggleItem>
        </ToggleGroup>

        <ToggleGroup
            defaultValue='vertical'
            type='single'
            value={cardFormat}
            onValueChange={(v) => v && onFormatChange(v as CardFormat)}
        >
            <TooltipToggleItem label='Vertical' value='vertical'>
                <LucideIcon.RectangleVertical className='size-4' />
            </TooltipToggleItem>
            <TooltipToggleItem label='Square' value='square'>
                <LucideIcon.Square className='size-4' />
            </TooltipToggleItem>
        </ToggleGroup>
    </div>
);
```

## Refactored Main Components

```tsx
// ProfileCard.tsx
import { memo } from 'react';
import APAvatar from '@src/components/global/ap-avatar';
import DotsPattern from './dots-pattern';
import { Account } from '@src/api/activitypub';
import { Button, H2, LucideIcon, Skeleton } from '@tryghost/shade';
import { hexToRgba, getCardBackgroundColor, getCardTextColor } from './utils/profileCardStyles';
import { useHandleCopy } from './hooks/useClipboard';

type BackgroundColor = 'light' | 'dark' | 'accent';

type ProfileCardProps = {
    isScreenshot?: boolean;
    format?: 'vertical' | 'square';
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

const CardBanner: React.FC<{
    src?: string;
    name?: string;
    backgroundColor: BackgroundColor;
    accentColor?: string;
    isScreenshot: boolean;
}> = ({ src, name, backgroundColor, accentColor, isScreenshot }) => {
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

    const gradientColor = backgroundColor === 'accent' ? '#ffffff' : (accentColor || '#15171a');
    return (
        <div
            className='relative size-full overflow-hidden rounded-[26px] rounded-b-none'
            style={{ background: `linear-gradient(to bottom, ${hexToRgba(gradientColor, 1)}, ${hexToRgba(gradientColor, 0.5)})` }}
        >
            <DotsPattern
                className='absolute'
                style={{
                    color: backgroundColor === 'accent' ? hexToRgba(accentColor || '#15171a', 0.2) : 'rgba(255, 255, 255, 0.2)',
                    top: isScreenshot ? '-42px' : '-84px',
                    left: isScreenshot ? '-69px' : '-138px',
                }}
            />
        </div>
    );
};

const CardAvatar: React.FC<{
    src: string;
    name: string;
    handle?: string;
    borderColor: string;
}> = ({ src, name, handle, borderColor }) => (
    <div
        className='absolute bottom-0 left-1/2 -mb-8 -translate-x-1/2 rounded-full border-8 [&>div]:!size-16 [&_img]:!size-16'
        style={{ borderColor }}
    >
        <APAvatar
            author={{ icon: { url: src }, name, handle }}
            size='md'
        />
    </div>
);

const HandleBadge: React.FC<{
    handle?: string;
    isScreenshot: boolean;
    backgroundColor: BackgroundColor;
    accentColor?: string;
}> = ({ handle, isScreenshot, backgroundColor, accentColor }) => {
    const { copied, copyHandle } = useHandleCopy(handle);

    const accentBase = backgroundColor === 'accent' ? '#ffffff' : (accentColor || '#15171a');
    const isLight = backgroundColor === 'light';
    const isDark = backgroundColor === 'dark';

    const badgeStyle = {
        color: !isLight ? '#fff' : accentColor,
        borderColor: accentColor ? hexToRgba(accentBase, !isLight ? 0.7 : 0.2) : undefined,
        background: accentColor
            ? `linear-gradient(to top right, ${hexToRgba(accentBase, isDark ? 0.12 : 0.04)}, ${hexToRgba(accentBase, isDark ? 0.48 : 0.16)})`
            : undefined,
    };

    return (
        <div
            className={`mt-auto flex max-h-[60px] min-h-12 w-full items-center justify-center break-all rounded-full border px-4 py-2 font-medium leading-7 ${isScreenshot && 'tracking-normal'}`}
            style={badgeStyle}
        >
            <div className='mb-0.5'>
                {handle}
                {!isScreenshot && handle && (
                    <Button
                        className='relative top-[3px] ml-1.5 size-4 p-0 hover:opacity-80'
                        style={{ color: !isLight ? '#fff' : accentColor }}
                        title='Copy handle'
                        variant='link'
                        onClick={copyHandle}
                    >
                        {copied ? <LucideIcon.Check size={12} /> : <LucideIcon.Copy size={12} />}
                    </Button>
                )}
            </div>
        </div>
    );
};

export const ProfileCard: React.FC<ProfileCardProps> = memo(({
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
    accentColor,
}) => {
    const cardBackgroundColor = getCardBackgroundColor(backgroundColor, accentColor);
    const textColor = getCardTextColor(backgroundColor);

    const margin = isScreenshot ? 'm-12' : 'm-16 max-sm:m-8';
    const borderClass = isScreenshot ? '' : 'shadow-xl';
    const cardWidth = format === 'square' ? 'w-[422px]' : 'w-[316px]';

    const bannerSrc = (isScreenshot && bannerDataUrl) ? bannerDataUrl : (account?.bannerImageUrl || coverImage);
    const avatarSrc = (isScreenshot && avatarDataUrl) ? avatarDataUrl : (account?.avatarUrl || publicationIcon);
    const hasAvatar = Boolean(account?.avatarUrl || publicationIcon);

    return (
        <div
            className={`relative z-20 flex flex-col ${margin} ${cardWidth} h-[422px] rounded-[32px] ${borderClass}`}
            style={{ backgroundColor: cardBackgroundColor }}
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
                    <CardAvatar
                        borderColor={cardBackgroundColor}
                        handle={account?.handle}
                        name={account?.name || siteTitle || ''}
                        src={avatarSrc}
                    />
                )}
            </div>

            <div className={`flex grow flex-col items-center p-6 ${hasAvatar ? 'pt-9' : 'pt-3'} text-center ${format === 'square' ? 'flex-1 justify-center' : ''}`}>
                <H2 className={isScreenshot ? 'tracking-normal' : ''} style={{ color: textColor }}>
                    {isLoading ? <Skeleton className='w-32' /> : account?.name}
                </H2>
                <span className={`mt-1.5 leading-7 ${isScreenshot ? 'tracking-normal' : ''}`} style={{ color: textColor }}>
                    {isLoading
                        ? <Skeleton className='w-28' />
                        : 'Available on Ghost, Flipboard, Threads, Bluesky, Mastodon, or wherever you get your social web feeds.'
                    }
                </span>
                <HandleBadge
                    accentColor={accentColor}
                    backgroundColor={backgroundColor}
                    handle={account?.handle}
                    isScreenshot={isScreenshot}
                />
            </div>
        </div>
    );
});

ProfileCard.displayName = 'ProfileCard';
```

```tsx
// Profile.tsx (main component)
import React, { useState } from 'react';
import ProfileCardShadow from '@assets/images/profile-card-shadow.png';
import ProfileCardShadowSquare from '@assets/images/profile-card-shadow-square.png';
import DotsPattern from './dots-pattern';
import { ProfileCard } from './ProfileCard';
import { SocialShareLinks } from './components/SocialShareLinks';
import { ColorFormatToolbar } from './components/ColorFormatToolbar';
import { useImageDataUrls } from './hooks/useImageDataUrls';
import { useCardScreenshot } from './hooks/useCardScreenshot';
import { getGradient, getDotsPatternColor } from './utils/profileCardStyles';
import { Account } from '@src/api/activitypub';
import { Button, H2, LoadingIndicator, LucideIcon, TooltipProvider } from '@tryghost/shade';
import { useBrowseSite } from '@tryghost/admin-x-framework/api/site';

type BackgroundColor = 'light' | 'dark' | 'accent';
type CardFormat = 'vertical' | 'square';

type ProfileProps = {
    account?: Account;
    isLoading: boolean;
};

const CARD_WIDTHS: Record<CardFormat, string> = {
    square: '518px',
    vertical: '412px',
};

const SHADOW_WIDTHS: Record<CardFormat, string> = {
    square: '572px',
    vertical: '466px',
};

const Profile: React.FC<ProfileProps> = ({ account, isLoading }) => {
    const { data: siteData } = useBrowseSite();
    const site = siteData?.site;

    const accentColor = site?.accent_color;
    const coverImage = site?.cover_image;
    const publicationIcon = site?.icon;

    const [backgroundColor, setBackgroundColor] = useState<BackgroundColor>('light');
    const [cardFormat, setCardFormat] = useState<CardFormat>('vertical');

    const bannerUrl = account?.bannerImageUrl || coverImage;
    const avatarUrl = account?.avatarUrl || publicationIcon;
    const { bannerDataUrl, avatarDataUrl } = useImageDataUrls(bannerUrl, avatarUrl);
    const { cardRef, isProcessing, copyImage } = useCardScreenshot();

    const shareText = `${account?.name} is now available across the social web, on ${account?.handle}`;
    const hasBanner = Boolean(account?.bannerImageUrl || coverImage);

    const sharedCardProps = {
        accentColor,
        account,
        avatarDataUrl,
        backgroundColor,
        bannerDataUrl,
        coverImage,
        format: cardFormat,
        isLoading,
        publicationIcon,
        siteTitle: site?.title,
    };

    const copyButtonClass = [
        'min-w-[160px] dark:bg-black dark:text-white dark:hover:bg-black/90',
        backgroundColor === 'dark' && 'bg-white text-black hover:bg-gray-50 dark:bg-white dark:text-black dark:hover:bg-gray-50/90',
    ].filter(Boolean).join(' ');

    return (
        <TooltipProvider delayDuration={0}>
            <div className='flex flex-col gap-5'>
                {/* Header */}
                <div className='flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3'>
                    <H2>Share your profile</H2>
                    <ColorFormatToolbar
                        accentColor={accentColor}
                        backgroundColor={backgroundColor}
                        cardFormat={cardFormat}
                        onBackgroundChange={setBackgroundColor}
                        onFormatChange={setCardFormat}
                    />
                </div>

                {/* Preview Card */}
                <div className='relative flex flex-col items-center overflow-hidden rounded-2xl bg-gray-50'>
                    <ProfileCard {...sharedCardProps} />

                    <div className='relative z-20 flex w-full items-center justify-between gap-4 px-6 pb-6 max-sm:mt-4 max-sm:flex-col'>
                        <SocialShareLinks shareText={shareText} />
                        <Button className={copyButtonClass} onClick={copyImage}>
                            {isProcessing
                                ? <LoadingIndicator color={backgroundColor === 'dark' ? 'dark' : 'light'} size='sm' />
                                : <><LucideIcon.Copy /> Copy image</>
                            }
                        </Button>
                    </div>

                    {hasBanner && (
                        <DotsPattern
                            className={`absolute left-1/2 top-1/2 h-[600px] w-[598px] -translate-x-1/2 -translate-y-1/2 ${backgroundColor === 'dark' && 'z-10'}`}
                            style={{ color: getDotsPatternColor(backgroundColor) }}
                        />
                    )}
                    <div className='absolute inset-0' style={{ background: getGradient(backgroundColor, accentColor) }} />
                </div>

                {/* Hidden Screenshot Clone */}
                <div
                    ref={cardRef}
                    className='fixed left-[-9999px] top-0 z-[-1] flex w-fit justify-center overflow-hidden rounded-2xl bg-gray-50'
                    style={{ width: CARD_WIDTHS[cardFormat], fontFamily: 'system-ui' }}
                >
                    <ProfileCard {...sharedCardProps} isScreenshot />

                    {hasBanner && (
                        <DotsPattern
                            className={`absolute left-[-62.5px] top-[-44px] h-[600px] w-[598px] ${backgroundColor === 'dark' && 'z-10'}`}
                            style={{ color: getDotsPatternColor(backgroundColor) }}
                        />
                    )}
                    <div className='absolute left-0 top-0 size-full' style={{ background: getGradient(backgroundColor, accentColor) }} />
                    <img
                        className='absolute left-1/2 top-12 mt-0.5 max-w-none -translate-x-1/2'
                        src={cardFormat === 'square' ? ProfileCardShadowSquare : ProfileCardShadow}
                        style={{ width: SHADOW_WIDTHS[cardFormat] }}
                    />
                </div>
            </div>
        </TooltipProvider>
    );
};

export default Profile;
```

## Key Improvements

| Area | Before | After |
|------|--------|-------|
| **Component size** | Single 300+ line file | Split into focused modules |
| **Custom hooks** | Logic inline in components | `useHandleCopy`, `useImageDataUrls`, `useCardScreenshot` |
| **Style utilities** | Switch statements repeated inline | Centralized lookup tables in `profileCardStyles.ts` |
| **Sub-components** | Monolithic JSX | `CardBanner`, `CardAvatar`, `HandleBadge`, `SocialShareLinks`, `ColorFormatToolbar` |
| **Social links** | 4 hardcoded `<a>` blocks | Data-driven array with icon components |
| **Tooltip pattern** | Repeated 3-element structure | `TooltipToggleItem` wrapper |
| **Shared props** | Repeated prop lists | `sharedCardProps` object spread |
| **Error handling** | Nested try/catch | Flattened with early returns and `finally` |