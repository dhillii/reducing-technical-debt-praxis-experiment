# Refactored Profile Component

Here's the refactored code with reduced complexity through extraction of custom hooks, smaller components, and utility functions:

## Custom Hooks

```typescript
// hooks/useClipboard.ts
import { useRef, useState } from 'react';
import { toast } from 'sonner';

export const useCopyHandle = () => {
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<number | null>(null);

    const cleanup = () => {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };

    const copy = async (handle?: string) => {
        if (!handle || !navigator?.clipboard?.writeText) {
            toast.error('Unable to copy handle');
            return;
        }
        try {
            await navigator.clipboard.writeText(handle);
            setCopied(true);
            toast.success('Handle copied');
            cleanup();
            timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy handle');
            setCopied(false);
        }
    };

    return { copied, copy, cleanup };
};
```

```typescript
// hooks/useImageDataUrls.ts
import { useCallback, useEffect, useState } from 'react';
import { imageUrlToDataUrl } from '@src/utils/image';

type ImageUrls = {
    bannerUrl?: string;
    avatarUrl?: string;
};

export const useImageDataUrls = ({ bannerUrl, avatarUrl }: ImageUrls) => {
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
// hooks/useCopyImage.ts
import { RefObject, useState } from 'react';
import html2canvas from 'html2canvas-objectfit-fix';
import { toast } from 'sonner';

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

const waitForNextFrame = () =>
    new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );

const isClipboardSupported = () =>
    !!navigator.clipboard &&
    'write' in navigator.clipboard &&
    typeof ClipboardItem !== 'undefined';

export const useCopyImage = (ref: RefObject<HTMLElement>) => {
    const [isProcessing, setIsProcessing] = useState(false);

    const copy = async () => {
        if (!ref.current || isProcessing) return;

        setIsProcessing(true);
        await waitForNextFrame();

        try {
            if (!isClipboardSupported()) {
                throw new Error('Clipboard API not supported');
            }

            const blobPromise = captureElementAsBlob(ref.current);
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blobPromise }),
            ]);
            toast.success('Image copied to clipboard');
        } catch {
            toast.error('Failed to copy image');
        } finally {
            setIsProcessing(false);
        }
    };

    return { isProcessing, copy };
};
```

## Utility Functions

```typescript
// utils/profileCardStyles.ts
type BackgroundColor = 'light' | 'dark' | 'accent';

export const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const FALLBACK_COLOR = '#15171a';

export const getCardBackgroundColor = (
    backgroundColor: BackgroundColor,
    accentColor?: string
): string => ({
    light: '#fff',
    dark: '#15171a',
    accent: accentColor || FALLBACK_COLOR,
}[backgroundColor]);

export const getTextColor = (backgroundColor: BackgroundColor): string => ({
    light: '#15171a',
    dark: '#fff',
    accent: '#fff',
}[backgroundColor]);

export const getGradient = (
    backgroundColor: BackgroundColor,
    accentColor?: string
): string => ({
    light: `linear-gradient(to bottom left, #EBEEF0, ${hexToRgba('#EBEEF0', 0)})`,
    dark: `linear-gradient(to bottom left, ${hexToRgba('#1A1E22', 1)}, ${hexToRgba('#343C48', 1)})`,
    accent: `linear-gradient(to bottom left, ${hexToRgba(accentColor || FALLBACK_COLOR, 0.08)}, ${hexToRgba(accentColor || FALLBACK_COLOR, 0.06)})`,
}[backgroundColor]);

export const getDotsPatternColor = (backgroundColor: BackgroundColor): string => ({
    light: hexToRgba('#15171a', 0.025),
    dark: hexToRgba('#15171a', 0.23),
    accent: 'rgba(0, 0, 0, 0.02)',
}[backgroundColor]);

export const getHandleStyles = (
    backgroundColor: BackgroundColor,
    accentColor?: string
) => {
    const isLight = backgroundColor === 'light';
    const isAccent = backgroundColor === 'accent';
    const colorKey = isAccent ? '#ffffff' : accentColor;

    return {
        color: !isLight ? '#fff' : accentColor,
        borderColor: colorKey
            ? hexToRgba(colorKey, !isLight ? 0.7 : 0.2)
            : undefined,
        background: colorKey
            ? `linear-gradient(to top right, ${hexToRgba(colorKey, backgroundColor === 'dark' ? 0.12 : 0.04)}, ${hexToRgba(colorKey, backgroundColor === 'dark' ? 0.48 : 0.16)})`
            : undefined,
    };
};

export const getBannerGradient = (
    backgroundColor: BackgroundColor,
    accentColor?: string
): string => {
    const color = backgroundColor === 'accent' ? '#ffffff' : accentColor || FALLBACK_COLOR;
    return `linear-gradient(to bottom, ${hexToRgba(color, 1)}, ${hexToRgba(color, 0.5)})`;
};
```

## Smaller Sub-Components

```tsx
// components/ProfileCardBanner.tsx
import React from 'react';
import APAvatar from '@src/components/global/ap-avatar';
import DotsPattern from './dots-pattern';
import { Account } from '@src/api/activitypub';
import { getBannerGradient, hexToRgba } from '@src/utils/profileCardStyles';

type BackgroundColor = 'light' | 'dark' | 'accent';

type ProfileCardBannerProps = {
    account?: Account;
    bannerImageSrc?: string;
    avatarImageSrc?: string;
    backgroundColor: BackgroundColor;
    accentColor?: string;
    cardBackgroundColor: string;
    isScreenshot: boolean;
    siteTitle?: string;
};

export const ProfileCardBanner: React.FC<ProfileCardBannerProps> = ({
    account,
    bannerImageSrc,
    avatarImageSrc,
    backgroundColor,
    accentColor,
    cardBackgroundColor,
    isScreenshot,
    siteTitle,
}) => (
    <div className='relative h-48 p-2'>
        {bannerImageSrc ? (
            <img
                alt={account?.name}
                className='size-full rounded-[26px] rounded-b-none object-cover'
                referrerPolicy='no-referrer'
                src={bannerImageSrc}
            />
        ) : (
            <div
                className='relative size-full overflow-hidden rounded-[26px] rounded-b-none'
                style={{ background: getBannerGradient(backgroundColor, accentColor) }}
            >
                <DotsPattern
                    className='absolute'
                    style={{
                        color: backgroundColor === 'accent'
                            ? hexToRgba(accentColor || '#15171a', 0.2)
                            : 'rgba(255, 255, 255, 0.2)',
                        top: isScreenshot ? '-42px' : '-84px',
                        left: isScreenshot ? '-69px' : '-138px',
                    }}
                />
            </div>
        )}
        {avatarImageSrc && (
            <div
                className='absolute bottom-0 left-1/2 -mb-8 -translate-x-1/2 rounded-full border-8 [&>div]:!size-16 [&_img]:!size-16'
                style={{ borderColor: cardBackgroundColor }}
            >
                <APAvatar
                    author={{
                        icon: { url: avatarImageSrc },
                        name: account?.name || siteTitle || '',
                        handle: account?.handle,
                    }}
                    size='md'
                />
            </div>
        )}
    </div>
);
```

```tsx
// components/ProfileCardHandle.tsx
import React from 'react';
import { Button, LucideIcon } from '@tryghost/shade';
import { getHandleStyles } from '@src/utils/profileCardStyles';

type BackgroundColor = 'light' | 'dark' | 'accent';

type ProfileCardHandleProps = {
    handle?: string;
    backgroundColor: BackgroundColor;
    accentColor?: string;
    isScreenshot: boolean;
    copied: boolean;
    onCopy: () => void;
};

export const ProfileCardHandle: React.FC<ProfileCardHandleProps> = ({
    handle,
    backgroundColor,
    accentColor,
    isScreenshot,
    copied,
    onCopy,
}) => (
    <div
        className={`mt-auto flex max-h-[60px] min-h-12 w-full items-center justify-center break-all rounded-full border px-4 py-2 font-medium leading-7 ${isScreenshot && 'tracking-normal'}`}
        style={getHandleStyles(backgroundColor, accentColor)}
    >
        <div className='mb-0.5'>
            {handle}
            {!isScreenshot && handle && (
                <Button
                    className='relative top-[3px] ml-1.5 size-4 p-0 hover:opacity-80'
                    style={{ color: backgroundColor !== 'light' ? '#fff' : accentColor }}
                    title='Copy handle'
                    variant='link'
                    onClick={onCopy}
                >
                    {copied
                        ? <LucideIcon.Check size={12} />
                        : <LucideIcon.Copy size={12} />
                    }
                </Button>
            )}
        </div>
    </div>
);
```

```tsx
// components/SocialShareLinks.tsx
import React from 'react';

const SOCIAL_LINKS = [
    {
        key: 'twitter',
        href: (text: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
        icon: (
            <svg aria-hidden="true" viewBox="0 0 24 24">
                <path className="social-x_svg__x" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
        ),
    },
    {
        key: 'threads',
        href: (text: string) => `https://threads.net/intent/post?text=${encodeURIComponent(text)}`,
        icon: (
            <svg fill="none" viewBox="0 0 18 18">
                {/* threads icon paths */}
            </svg>
        ),
    },
    {
        key: 'facebook',
        href: () => `https://www.facebook.com/sharer/sharer.php?u=`,
        icon: (
            <svg fill="none" viewBox="0 0 40 40">
                {/* facebook icon paths */}
            </svg>
        ),
    },
    {
        key: 'linkedin',
        href: (text: string) => `http://www.linkedin.com/shareArticle?mini=true&title=${encodeURIComponent(text)}`,
        icon: (
            <svg fill="none" viewBox="0 0 16 16">
                {/* linkedin icon paths */}
            </svg>
        ),
    },
];

type SocialShareLinksProps = {
    shareText: string;
};

export const SocialShareLinks: React.FC<SocialShareLinksProps> = ({ shareText }) => (
    <div className='flex items-center gap-2'>
        {SOCIAL_LINKS.map(({ key, href, icon }) => (
            <a
                key={key}
                className='flex h-[34px] w-10 items-center justify-center rounded-sm bg-white px-3 shadow-xs hover:bg-gray-50 [&_svg]:size-4'
                href={href(shareText)}
                rel="noopener noreferrer"
                target='_blank'
            >
                {icon}
            </a>
        ))}
    </div>
);
```

```tsx
// components/ColorToggleGroup.tsx
import React from 'react';
import { LucideIcon, ToggleGroup, ToggleGroupItem, Tooltip, TooltipContent, TooltipTrigger } from '@tryghost/shade';

type BackgroundColor = 'light' | 'dark' | 'accent';
type CardFormat = 'vertical' | 'square';

type ColorOption = {
    value: BackgroundColor;
    label: string;
    className: string;
    style?: React.CSSProperties;
};

type FormatOption = {
    value: CardFormat;
    label: string;
    icon: React.ReactNode;
};

type ColorToggleGroupProps = {
    backgroundColor: BackgroundColor;
    cardFormat: CardFormat;
    accentColor?: string;
    onColorChange: (value: BackgroundColor) => void;
    onFormatChange: (value: CardFormat) => void;
};

export const CardControls: React.FC<ColorToggleGroupProps> = ({
    backgroundColor,
    cardFormat,
    accentColor,
    onColorChange,
    onFormatChange,
}) => {
    const colorOptions: ColorOption[] = [
        { value: 'light', label: 'Light', className: 'size-4 rounded-full border border-gray-500 dark:border-0 dark:bg-white' },
        { value: 'dark', label: 'Dark', className: 'size-4 rounded-full bg-black dark:border dark:border-gray-700 dark:bg-transparent' },
        { value: 'accent', label: 'Accent color', className: 'size-4 rounded-full', style: { backgroundColor: accentColor } },
    ];

    const formatOptions: FormatOption[] = [
        { value: 'vertical', label: 'Vertical', icon: <LucideIcon.RectangleVertical className='size-4' /> },
        { value: 'square', label: 'Square', icon: <LucideIcon.Square className='size-4' /> },
    ];

    return (
        <div className='flex gap-4'>
            <ToggleGroup
                defaultValue='light'
                type='single'
                value={backgroundColor}
                onValueChange={(v) => v && onColorChange(v as BackgroundColor)}
            >
                {colorOptions.map(({ value, label, className, style }) => (
                    <Tooltip key={value}>
                        <TooltipTrigger>
                            <ToggleGroupItem aria-label={label} value={value}>
                                <div className={className} style={style} />
                            </ToggleGroupItem>
                        </TooltipTrigger>
                        <TooltipContent>{label}</TooltipContent>
                    </Tooltip>
                ))}
            </ToggleGroup>

            <ToggleGroup
                defaultValue='vertical'
                type='single'
                value={cardFormat}
                onValueChange={(v) => v && onFormatChange(v as CardFormat)}
            >
                {formatOptions.map(({ value, label, icon }) => (
                    <Tooltip key={value}>
                        <TooltipTrigger>
                            <ToggleGroupItem aria-label={label} value={value}>
                                {icon}
                            </ToggleGroupItem>
                        </TooltipTrigger>
                        <TooltipContent>{label}</TooltipContent>
                    </Tooltip>
                ))}
            </ToggleGroup>
        </div>
    );
};
```

## Refactored Main Components

```tsx
// ProfileCard.tsx
import React, { memo, useEffect } from 'react';
import { H2, Skeleton } from '@tryghost/shade';
import { Account } from '@src/api/activitypub';
import { ProfileCardBanner } from './ProfileCardBanner';
import { ProfileCardHandle } from './ProfileCardHandle';
import { getCardBackgroundColor, getTextColor } from '@src/utils/profileCardStyles';
import { useCopyHandle } from '@src/hooks/useClipboard';

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
    accentColor,
}) => {
    const { copied, copy, cleanup } = useCopyHandle();

    useEffect(() => cleanup, [cleanup]);

    const cardBackgroundColor = getCardBackgroundColor(backgroundColor, accentColor);
    const textColor = getTextColor(backgroundColor);
    const margin = isScreenshot ? 'm-12' : 'm-16 max-sm:m-8';
    const borderClass = isScreenshot ? '' : 'shadow-xl';
    const cardWidth = format === 'square' ? 'w-[422px]' : 'w-[316px]';

    const bannerImageSrc = (isScreenshot && bannerDataUrl)
        ? bannerDataUrl
        : (account?.bannerImageUrl || coverImage);

    const avatarImageSrc = (isScreenshot && avatarDataUrl)
        ? avatarDataUrl
        : (account?.avatarUrl || publicationIcon);

    const hasAvatar = !!(account?.avatarUrl || publicationIcon);

    return (
        <div
            className={`relative z-20 flex flex-col ${margin} ${cardWidth} h-[422px] rounded-[32px] ${borderClass}`}
            style={{ backgroundColor: cardBackgroundColor }}
        >
            <ProfileCardBanner
                account={account}
                accentColor={accentColor}
                avatarImageSrc={avatarImageSrc}
                backgroundColor={backgroundColor}
                bannerImageSrc={bannerImageSrc}
                cardBackgroundColor={cardBackgroundColor}
                isScreenshot={isScreenshot}
                siteTitle={siteTitle}
            />
            <div className={`flex grow flex-col items-center p-6 ${hasAvatar ? 'pt-9' : 'pt-3'} text-center ${format === 'square' ? 'flex-1 justify-center' : ''}`}>
                <H2
                    className={isScreenshot ? 'tracking-normal' : ''}
                    style={{ color: textColor }}
                >
                    {isLoading ? <Skeleton className='w-32' /> : account?.name}
                </H2>
                <span
                    className={`mt-1.5 leading-7 ${isScreenshot ? 'tracking-normal' : ''}`}
                    style={{ color: textColor }}
                >
                    {isLoading
                        ? <Skeleton className='w-28' />
                        : 'Available on Ghost, Flipboard, Threads, Bluesky, Mastodon, or wherever you get your social web feeds.'
                    }
                </span>
                <ProfileCardHandle
                    accentColor={accentColor}
                    backgroundColor={backgroundColor}
                    copied={copied}
                    handle={account?.handle}
                    isScreenshot={isScreenshot}
                    onCopy={() => copy(account?.handle)}
                />
            </div>
        </div>
    );
});

ProfileCard.displayName = 'ProfileCard';

export default ProfileCard;
```

```tsx
// Profile.tsx
import React, { useRef, useState } from 'react';
import ProfileCard from './ProfileCard';
import ProfileCardShadow from '@assets/images/profile-card-shadow.png';
import ProfileCardShadowSquare from '@assets/images/profile-card-shadow-square.png';
import DotsPattern from './dots-pattern';
import { Account } from '@src/api/activitypub';
import { Button, H2, LoadingIndicator, LucideIcon, TooltipProvider } from '@tryghost/shade';
import { CardControls } from './CardControls';
import { SocialShareLinks } from './SocialShareLinks';
import { getDotsPatternColor, getGradient } from '@src/utils/profileCardStyles';
import { useBrowseSite } from '@tryghost/admin-x-framework/api/site';
import { useCopyImage } from '@src/hooks/useCopyImage';
import { useImageDataUrls } from '@src/hooks/useImageDataUrls';

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

    const profileCardRef = useRef<HTMLDivElement>(null);
    const [backgroundColor, setBackgroundColor] = useState<BackgroundColor>('light');
    const [cardFormat, setCardFormat] = useState<CardFormat>('vertical');

    const { bannerDataUrl, avatarDataUrl } = useImageDataUrls({
        bannerUrl: account?.bannerImageUrl || site?.cover_image,
        avatarUrl: account?.avatarUrl || site?.icon,
    });

    const { isProcessing, copy: copyImage } = useCopyImage(profileCardRef);

    const shareText = `${account?.name} is now available across the social web, on ${account?.handle}`;
    const hasBanner = !!(account?.bannerImageUrl || site?.cover_image);
    const dotsColor = getDotsPatternColor(backgroundColor);
    const gradient = getGradient(backgroundColor, site?.accent_color);

    const sharedCardProps = {
        accentColor: site?.accent_color,
        account,
        avatarDataUrl,
        backgroundColor,
        bannerDataUrl,
        coverImage: site?.cover_image,
        format: cardFormat,
        isLoading,
        publicationIcon: site?.icon,
        siteTitle: site?.title,
    };

    return (
        <TooltipProvider delayDuration={0}>
            <div className='flex flex-col gap-5'>
                <div className='flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3'>
                    <H2>Share your profile</H2>
                    <CardControls
                        accentColor={site?.accent_color}
                        backgroundColor={backgroundColor}
                        cardFormat={cardFormat}
                        onColorChange={setBackgroundColor}
                        onFormatChange={setCardFormat}
                    />
                </div>

                <div className='relative flex flex-col items-center overflow-hidden rounded-2xl bg-gray-50'>
                    <ProfileCard {...sharedCardProps} />

                    <div className='relative z-20 flex w-full items-center justify-between gap-4 px-6 pb-6 max-sm:mt-4 max-sm:flex-col'>
                        <SocialShareLinks shareText={shareText} />
                        <Button
                            className={`min-w-[160px] dark:bg-black dark:text-white dark:hover:bg-black/90 ${backgroundColor === 'dark' && 'bg-white text-black hover:bg-gray-50 dark:bg-white dark:text-black dark:hover:bg-gray-50/90'}`}
                            onClick={copyImage}
                        >
                            {isProcessing
                                ? <LoadingIndicator color={backgroundColor === 'dark' ? 'dark' : 'light'} size='sm' />
                                : <><LucideIcon.Copy /> Copy image</>
                            }
                        </Button>
                    </div>

                    {hasBanner && (
                        <DotsPattern
                            className={`absolute left-1/2 top-1/2 h-[600px] w-[598px] -translate-x-1/2 -translate-y-1/2 ${backgroundColor === 'dark' && 'z-10'}`}
                            style={{ color: dotsColor }}
                        />
                    )}
                    <div className='absolute inset-0' style={{ background: gradient }} />
                </div>

                {/* Hidden clone for screenshots */}
                <div
                    ref={profileCardRef}
                    className='fixed left-[-9999px] top-0 z-[-1] flex w-fit justify-center overflow-hidden rounded-2xl bg-gray-50'
                    style={{ width: CARD_WIDTHS[cardFormat], fontFamily: 'system-ui' }}
                >
                    <ProfileCard {...sharedCardProps} isScreenshot />

                    {hasBanner && (
                        <DotsPattern
                            className={`absolute left-[-62.5px] top-[-44px] h-[600px] w-[598px] ${backgroundColor === 'dark' && 'z-10'}`}
                            style={{ color: dotsColor }}
                        />
                    )}
                    <div className='absolute left-0 top-0 size-full' style={{ background: gradient }} />
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

| Concern | Before | After |
|---|---|---|
| **State logic** | Inline in components | Extracted to `useCopyHandle`, `useCopyImage`, `useImageDataUrls` |
| **Style computation** | Switch statements scattered throughout | Centralized lookup maps in `profileCardStyles.ts` |
| **Component size** | 2 large monolithic components | 6 focused, single-responsibility components |
| **Duplication** | `ProfileCard` rendered twice with identical props | Shared `sharedCardProps` object |
| **Social links** | 4 hardcoded `<a>` tags | Data-driven `SOCIAL_LINKS` array |
| **Toggle groups** | Verbose repeated JSX | Data-driven `colorOptions`/`formatOptions` arrays |
| **Constants** | Magic strings inline | Named constants (`CARD_WIDTHS`, `SHADOW_WIDTHS`) |