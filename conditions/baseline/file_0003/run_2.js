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

    const copyHandle = async (handle?: string) => {
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

    return { copied, copyHandle, cleanup };
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
// hooks/useCopyImage.ts
import { RefObject, useState } from 'react';
import html2canvas from 'html2canvas-objectfit-fix';
import { toast } from 'sonner';

const isClipboardSupported = () =>
    !!navigator.clipboard &&
    'write' in navigator.clipboard &&
    typeof ClipboardItem !== 'undefined';

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

const waitForNextFrames = () =>
    new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

export const useCopyImage = (ref: RefObject<HTMLElement>) => {
    const [isProcessing, setIsProcessing] = useState(false);

    const copyImage = async () => {
        if (!ref.current || isProcessing) return;

        setIsProcessing(true);
        await waitForNextFrames();

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

    return { isProcessing, copyImage };
};
```

## Utility Functions

```typescript
// utils/profileCard.ts
export const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

type BackgroundColor = 'light' | 'dark' | 'accent';

const BG_COLORS: Record<BackgroundColor, string> = {
    light: '#fff',
    dark: '#15171a',
    accent: '#15171a',
};

const TEXT_COLORS: Record<BackgroundColor, string> = {
    light: '#15171a',
    dark: '#fff',
    accent: '#fff',
};

export const getCardBackgroundColor = (
    backgroundColor: BackgroundColor,
    accentColor?: string
) => backgroundColor === 'accent' ? (accentColor || BG_COLORS.accent) : BG_COLORS[backgroundColor];

export const getTextColor = (backgroundColor: BackgroundColor) =>
    TEXT_COLORS[backgroundColor];

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

export const getHandleBoxStyles = (
    backgroundColor: BackgroundColor,
    accentColor?: string
) => {
    const isLight = backgroundColor === 'light';
    const isAccent = backgroundColor === 'accent';
    const colorKey = isAccent ? '#ffffff' : (accentColor || '#15171a');

    return {
        color: !isLight ? '#fff' : accentColor,
        borderColor: accentColor
            ? hexToRgba(colorKey, !isLight ? 0.7 : 0.2)
            : undefined,
        background: accentColor
            ? `linear-gradient(to top right, ${hexToRgba(colorKey, backgroundColor === 'dark' ? 0.12 : 0.04)}, ${hexToRgba(colorKey, backgroundColor === 'dark' ? 0.48 : 0.16)})`
            : undefined,
    };
};
```

## Smaller Sub-Components

```tsx
// components/ProfileCardBanner.tsx
import DotsPattern from './dots-pattern';
import APAvatar from '@src/components/global/ap-avatar';
import { hexToRgba } from '@src/utils/profileCard';
import { Account } from '@src/api/activitypub';

type BackgroundColor = 'light' | 'dark' | 'accent';

type ProfileCardBannerProps = {
    bannerImageSrc?: string;
    avatarImageSrc?: string;
    account?: Account;
    siteTitle?: string;
    cardBackgroundColor: string;
    backgroundColor: BackgroundColor;
    accentColor?: string;
    isScreenshot: boolean;
};

export const ProfileCardBanner: React.FC<ProfileCardBannerProps> = ({
    bannerImageSrc,
    avatarImageSrc,
    account,
    siteTitle,
    cardBackgroundColor,
    backgroundColor,
    accentColor,
    isScreenshot,
}) => {
    const gradientColor = backgroundColor === 'accent'
        ? '#ffffff'
        : (accentColor || '#15171a');

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
                <div
                    className='relative size-full overflow-hidden rounded-[26px] rounded-b-none'
                    style={{
                        background: `linear-gradient(to bottom, ${hexToRgba(gradientColor, 1)}, ${hexToRgba(gradientColor, 0.5)})`,
                    }}
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
};
```

```tsx
// components/SocialShareLinks.tsx
type SocialLink = {
    href: string;
    icon: React.ReactNode;
    label: string;
};

const XIcon = () => (
    <svg aria-hidden="true" viewBox="0 0 24 24">
        <path className="social-x_svg__x" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
);

// ... other icon components

type SocialShareLinksProps = { shareText: string };

export const SocialShareLinks: React.FC<SocialShareLinksProps> = ({ shareText }) => {
    const encoded = encodeURIComponent(shareText);

    const links: SocialLink[] = [
        { href: `https://twitter.com/intent/tweet?text=${encoded}`, icon: <XIcon />, label: 'Share on X' },
        { href: `https://threads.net/intent/post?text=${encoded}`, icon: <ThreadsIcon />, label: 'Share on Threads' },
        { href: `https://www.facebook.com/sharer/sharer.php?u=`, icon: <FacebookIcon />, label: 'Share on Facebook' },
        { href: `http://www.linkedin.com/shareArticle?mini=true&title=${encoded}`, icon: <LinkedInIcon />, label: 'Share on LinkedIn' },
    ];

    return (
        <div className='flex items-center gap-2'>
            {links.map(({ href, icon, label }) => (
                <a
                    key={label}
                    aria-label={label}
                    className='flex h-[34px] w-10 items-center justify-center rounded-sm bg-white px-3 shadow-xs hover:bg-gray-50 [&_svg]:size-4'
                    href={href}
                    rel="noopener noreferrer"
                    target='_blank'
                >
                    {icon}
                </a>
            ))}
        </div>
    );
};
```

```tsx
// components/ColorToggleGroup.tsx
import { LucideIcon, ToggleGroup, ToggleGroupItem, Tooltip, TooltipContent, TooltipTrigger } from '@tryghost/shade';

type ColorOption = { value: string; label: string; element: React.ReactNode };
type FormatOption = { value: string; label: string; icon: React.ReactNode };

type TooltipToggleGroupProps<T extends string> = {
    value: T;
    options: Array<{ value: T; label: string; element: React.ReactNode }>;
    onChange: (value: T) => void;
};

export const TooltipToggleGroup = <T extends string>({
    value,
    options,
    onChange,
}: TooltipToggleGroupProps<T>) => (
    <ToggleGroup
        defaultValue={options[0]?.value}
        type='single'
        value={value}
        onValueChange={(v) => v && onChange(v as T)}
    >
        {options.map(({ value: optValue, label, element }) => (
            <Tooltip key={optValue}>
                <TooltipTrigger>
                    <ToggleGroupItem aria-label={label} value={optValue}>
                        {element}
                    </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
            </Tooltip>
        ))}
    </ToggleGroup>
);
```

## Refactored Main Components

```tsx
// ProfileCard.tsx
import { memo, useEffect } from 'react';
import { Button, H2, LucideIcon, Skeleton } from '@tryghost/shade';
import { Account } from '@src/api/activitypub';
import { ProfileCardBanner } from './ProfileCardBanner';
import { useCopyHandle } from '@src/hooks/useClipboard';
import {
    getCardBackgroundColor,
    getTextColor,
    getHandleBoxStyles,
} from '@src/utils/profileCard';

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
    const { copied, copyHandle, cleanup } = useCopyHandle();

    useEffect(() => cleanup, []);

    const cardBackgroundColor = getCardBackgroundColor(backgroundColor, accentColor);
    const textColor = getTextColor(backgroundColor);
    const handleBoxStyles = getHandleBoxStyles(backgroundColor, accentColor);

    const margin = isScreenshot ? 'm-12' : 'm-16 max-sm:m-8';
    const cardWidth = format === 'square' ? 'w-[422px]' : 'w-[316px]';
    const hasAvatar = !!(account?.avatarUrl || publicationIcon);

    const bannerImageSrc = isScreenshot && bannerDataUrl
        ? bannerDataUrl
        : (account?.bannerImageUrl || coverImage);

    const avatarImageSrc = isScreenshot && avatarDataUrl
        ? avatarDataUrl
        : (account?.avatarUrl || publicationIcon);

    return (
        <div
            className={`relative z-20 flex flex-col ${margin} ${cardWidth} h-[422px] rounded-[32px] ${isScreenshot ? '' : 'shadow-xl'}`}
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

                <div
                    className={`mt-auto flex max-h-[60px] min-h-12 w-full items-center justify-center break-all rounded-full border px-4 py-2 font-medium leading-7 ${isScreenshot ? 'tracking-normal' : ''}`}
                    style={handleBoxStyles}
                >
                    <div className='mb-0.5'>
                        {account?.handle}
                        {!isScreenshot && account?.handle && (
                            <Button
                                className='relative top-[3px] ml-1.5 size-4 p-0 hover:opacity-80'
                                style={{ color: backgroundColor !== 'light' ? '#fff' : accentColor }}
                                title='Copy handle'
                                variant='link'
                                onClick={() => copyHandle(account.handle)}
                            >
                                {copied
                                    ? <LucideIcon.Check size={12} />
                                    : <LucideIcon.Copy size={12} />
                                }
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

ProfileCard.displayName = 'ProfileCard';

export default ProfileCard;
```

```tsx
// Profile.tsx
import { useRef, useState } from 'react';
import { Button, H2, LoadingIndicator, LucideIcon, TooltipProvider } from '@tryghost/shade';
import { Account } from '@src/api/activitypub';
import { useBrowseSite } from '@tryghost/admin-x-framework/api/site';
import ProfileCard from './ProfileCard';
import { SocialShareLinks } from './SocialShareLinks';
import { TooltipToggleGroup } from './ColorToggleGroup';
import DotsPattern from './dots-pattern';
import ProfileCardShadow from '@assets/images/profile-card-shadow.png';
import ProfileCardShadowSquare from '@assets/images/profile-card-shadow-square.png';
import { useImageDataUrls } from '@src/hooks/useImageDataUrls';
import { useCopyImage } from '@src/hooks/useCopyImage';
import { getGradient, getDotsPatternColor } from '@src/utils/profileCard';

type BackgroundColor = 'light' | 'dark' | 'accent';
type CardFormat = 'vertical' | 'square';

type ProfileProps = {
    account?: Account;
    isLoading: boolean;
};

const COLOR_OPTIONS = (accentColor?: string) => [
    {
        value: 'light' as BackgroundColor,
        label: 'Light',
        element: <div className='size-4 rounded-full border border-gray-500 dark:border-0 dark:bg-white' />,
    },
    {
        value: 'dark' as BackgroundColor,
        label: 'Dark',
        element: <div className='size-4 rounded-full bg-black dark:border dark:border-gray-700 dark:bg-transparent' />,
    },
    {
        value: 'accent' as BackgroundColor,
        label: 'Accent color',
        element: <div className='size-4 rounded-full' style={{ backgroundColor: accentColor }} />,
    },
];

const FORMAT_OPTIONS = [
    {
        value: 'vertical' as CardFormat,
        label: 'Vertical',
        element: <LucideIcon.RectangleVertical className='size-4' />,
    },
    {
        value: 'square' as CardFormat,
        label: 'Square',
        element: <LucideIcon.Square className='size-4' />,
    },
];

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

    const profileCardRef = useRef<HTMLDivElement>(null);
    const { bannerDataUrl, avatarDataUrl } = useImageDataUrls(
        account?.bannerImageUrl || coverImage,
        account?.avatarUrl || publicationIcon
    );
    const { isProcessing, copyImage } = useCopyImage(profileCardRef);

    const shareText = `${account?.name} is now available across the social web, on ${account?.handle}`;
    const hasBanner = !!(account?.bannerImageUrl || coverImage);

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
                {/* Header Controls */}
                <div className='flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3'>
                    <H2>Share your profile</H2>
                    <div className='flex gap-4'>
                        <TooltipToggleGroup
                            options={COLOR_OPTIONS(accentColor)}
                            value={backgroundColor}
                            onChange={setBackgroundColor}
                        />
                        <TooltipToggleGroup
                            options={FORMAT_OPTIONS}
                            value={cardFormat}
                            onChange={setCardFormat}
                        />
                    </div>
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
                            className={`absolute left-1/2 top-1/2 h-[600px] w-[598px] -translate-x-1/2 -translate-y-1/2 ${backgroundColor === 'dark' ? 'z-10' : ''}`}
                            style={{ color: getDotsPatternColor(backgroundColor) }}
                        />
                    )}
                    <div className='absolute inset-0' style={{ background: getGradient(backgroundColor, accentColor) }} />
                </div>

                {/* Hidden Screenshot Clone */}
                <div
                    ref={profileCardRef}
                    className='fixed left-[-9999px] top-0 z-[-1] flex w-fit justify-center overflow-hidden rounded-2xl bg-gray-50'
                    style={{ width: CARD_WIDTHS[cardFormat], fontFamily: 'system-ui' }}
                >
                    <ProfileCard {...sharedCardProps} isScreenshot={true} />

                    {hasBanner && (
                        <DotsPattern
                            className={`absolute left-[-62.5px] top-[-44px] h-[600px] w-[598px] ${backgroundColor === 'dark' ? 'z-10' : ''}`}
                            style={{ color: getDotsPatternColor(backgroundColor) }}
                        />
                    )}
                    <div
                        className='absolute left-0 top-0 size-full'
                        style={{ background: getGradient(backgroundColor, accentColor) }}
                    />
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
| **Color/style logic** | Switch statements scattered throughout | Centralized lookup maps in `profileCard.ts` |
| **Repeated card props** | Duplicated across two `<ProfileCard>` instances | Shared via `sharedCardProps` object |
| **Toggle groups** | Duplicated tooltip/toggle markup | Reusable `TooltipToggleGroup` component |
| **Social links** | Inline SVGs and anchors | Extracted to `SocialShareLinks` with data-driven rendering |
| **Banner section** | Complex inline JSX | Extracted to `ProfileCardBanner` component |
| **Magic values** | Inline strings for widths/shadows | Named constants (`CARD_WIDTHS`, `SHADOW_WIDTHS`) |
| **Clipboard check** | Nested try/catch with duplication | Extracted `isClipboardSupported()` and `captureElementAsBlob()` |