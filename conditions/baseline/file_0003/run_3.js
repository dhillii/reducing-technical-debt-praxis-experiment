# Refactored Profile Component

Here's the refactored code with reduced complexity through extraction of custom hooks, smaller components, and utility functions:

## Custom Hooks

```typescript
// hooks/useClipboard.ts
import { useRef, useState } from 'react';
import { toast } from 'sonner';

export const useCopyHandle = (handle?: string) => {
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<number | null>(null);

    const cleanup = () => {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };

    const copy = async () => {
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

type ImageSources = {
    bannerUrl?: string;
    avatarUrl?: string;
};

export const useImageDataUrls = ({ bannerUrl, avatarUrl }: ImageSources) => {
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

const captureCanvas = async (element: HTMLElement): Promise<Blob> => {
    const canvas = await html2canvas(element, {
        backgroundColor: 'transparent',
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 0,
    });

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            blob => (blob ? resolve(blob) : reject(new Error('Failed to create blob'))),
            'image/png'
        );
    });
};

const waitForPaint = () =>
    new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );

export const useCopyImage = (ref: RefObject<HTMLDivElement>) => {
    const [isProcessing, setIsProcessing] = useState(false);

    const copy = async () => {
        if (!ref.current || isProcessing) return;

        const isSupported =
            navigator.clipboard &&
            'write' in navigator.clipboard &&
            typeof ClipboardItem !== 'undefined';

        if (!isSupported) {
            toast.error('Clipboard API not supported in this browser');
            return;
        }

        setIsProcessing(true);
        await waitForPaint();

        try {
            const blob = await captureCanvas(ref.current);
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
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
// utils/profileCard.ts
export const hexToRgba = (hex: string, alpha: number): string => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

type BackgroundColor = 'light' | 'dark' | 'accent';

const BG_COLORS: Record<BackgroundColor, string> = {
    light: '#fff',
    dark: '#15171a',
    accent: '',
};

const TEXT_COLORS: Record<BackgroundColor, string> = {
    light: '#15171a',
    dark: '#fff',
    accent: '#fff',
};

export const getCardBackgroundColor = (
    backgroundColor: BackgroundColor,
    accentColor?: string
): string => {
    if (backgroundColor === 'accent') return accentColor || '#15171a';
    return BG_COLORS[backgroundColor];
};

export const getCardTextColor = (backgroundColor: BackgroundColor): string =>
    TEXT_COLORS[backgroundColor];

export const getGradient = (
    backgroundColor: BackgroundColor,
    accentColor?: string
): string => {
    const gradients: Record<BackgroundColor, string> = {
        light: `linear-gradient(to bottom left, #EBEEF0, ${hexToRgba('#EBEEF0', 0)})`,
        dark: `linear-gradient(to bottom left, ${hexToRgba('#1A1E22', 1)}, ${hexToRgba('#343C48', 1)})`,
        accent: `linear-gradient(to bottom left, ${hexToRgba(accentColor || '#15171a', 0.08)}, ${hexToRgba(accentColor || '#15171a', 0.06)})`,
    };
    return gradients[backgroundColor];
};

export const getDotsPatternColor = (
    backgroundColor: BackgroundColor
): string => {
    const colors: Record<BackgroundColor, string> = {
        light: hexToRgba('#15171a', 0.025),
        dark: hexToRgba('#15171a', 0.23),
        accent: 'rgba(0, 0, 0, 0.02)',
    };
    return colors[backgroundColor];
};
```

## Smaller Sub-components

```typescript
// components/ProfileCardBanner.tsx
import DotsPattern from './dots-pattern';
import APAvatar from '@src/components/global/ap-avatar';
import { hexToRgba } from '@src/utils/profileCard';
import { Account } from '@src/api/activitypub';

type ProfileCardBannerProps = {
    bannerImageSrc?: string;
    avatarImageSrc?: string;
    account?: Account;
    siteTitle?: string;
    isScreenshot: boolean;
    backgroundColor: 'light' | 'dark' | 'accent';
    accentColor?: string;
    cardBackgroundColor: string;
};

export const ProfileCardBanner: React.FC<ProfileCardBannerProps> = ({
    bannerImageSrc,
    avatarImageSrc,
    account,
    siteTitle,
    isScreenshot,
    backgroundColor,
    accentColor,
    cardBackgroundColor,
}) => {
    const gradientColor = backgroundColor === 'accent'
        ? '#ffffff'
        : accentColor || '#15171a';

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

```typescript
// components/ProfileCardHandle.tsx
import { Button, LucideIcon } from '@tryghost/shade';
import { hexToRgba } from '@src/utils/profileCard';

type ProfileCardHandleProps = {
    handle?: string;
    isScreenshot: boolean;
    copied: boolean;
    onCopy: () => void;
    backgroundColor: 'light' | 'dark' | 'accent';
    accentColor?: string;
};

const getHandleStyles = (
    backgroundColor: 'light' | 'dark' | 'accent',
    accentColor?: string
) => {
    const isLight = backgroundColor === 'light';
    const isAccent = backgroundColor === 'accent';
    const colorKey = isAccent ? '#ffffff' : accentColor;

    return {
        color: !isLight ? '#fff' : accentColor,
        borderColor: accentColor
            ? hexToRgba(colorKey || '#15171a', !isLight ? 0.7 : 0.2)
            : undefined,
        background: accentColor
            ? `linear-gradient(to top right, ${hexToRgba(colorKey || '#15171a', backgroundColor === 'dark' ? 0.12 : 0.04)}, ${hexToRgba(colorKey || '#15171a', backgroundColor === 'dark' ? 0.48 : 0.16)})`
            : undefined,
    };
};

export const ProfileCardHandle: React.FC<ProfileCardHandleProps> = ({
    handle,
    isScreenshot,
    copied,
    onCopy,
    backgroundColor,
    accentColor,
}) => {
    const isLight = backgroundColor === 'light';

    return (
        <div
            className={`mt-auto flex max-h-[60px] min-h-12 w-full items-center justify-center break-all rounded-full border px-4 py-2 font-medium leading-7 ${isScreenshot && 'tracking-normal'}`}
            style={getHandleStyles(backgroundColor, accentColor)}
        >
            <div className='mb-0.5'>
                {handle}
                {!isScreenshot && handle && (
                    <Button
                        className='relative top-[3px] ml-1.5 size-4 p-0 hover:opacity-80'
                        style={{ color: !isLight ? '#fff' : accentColor }}
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
};
```

```typescript
// components/SocialShareLinks.tsx
const SHARE_LINKS = [
    {
        name: 'X',
        getHref: (text: string) =>
            `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
        icon: (
            <svg aria-hidden="true" viewBox="0 0 24 24">
                <path className="social-x_svg__x" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
        ),
    },
    {
        name: 'Threads',
        getHref: (text: string) =>
            `https://threads.net/intent/post?text=${encodeURIComponent(text)}`,
        icon: (/* Threads SVG */),
    },
    {
        name: 'Facebook',
        getHref: () => `https://www.facebook.com/sharer/sharer.php?u=`,
        icon: (/* Facebook SVG */),
    },
    {
        name: 'LinkedIn',
        getHref: (text: string) =>
            `http://www.linkedin.com/shareArticle?mini=true&title=${encodeURIComponent(text)}`,
        icon: (/* LinkedIn SVG */),
    },
];

type SocialShareLinksProps = { shareText: string };

export const SocialShareLinks: React.FC<SocialShareLinksProps> = ({ shareText }) => (
    <div className='flex items-center gap-2'>
        {SHARE_LINKS.map(({ name, getHref, icon }) => (
            <a
                key={name}
                className='flex h-[34px] w-10 items-center justify-center rounded-sm bg-white px-3 shadow-xs hover:bg-gray-50 [&_svg]:size-4'
                href={getHref(shareText)}
                rel="noopener noreferrer"
                target='_blank'
            >
                {icon}
            </a>
        ))}
    </div>
);
```

```typescript
// components/ColorToggle.tsx
import { LucideIcon, ToggleGroup, ToggleGroupItem, Tooltip, TooltipContent, TooltipTrigger } from '@tryghost/shade';

type ColorOption = { value: 'light' | 'dark' | 'accent'; label: string; dot: React.ReactNode };

const getColorOptions = (accentColor?: string): ColorOption[] => [
    {
        value: 'light',
        label: 'Light',
        dot: <div className='size-4 rounded-full border border-gray-500 dark:border-0 dark:bg-white' />,
    },
    {
        value: 'dark',
        label: 'Dark',
        dot: <div className='size-4 rounded-full bg-black dark:border dark:border-gray-700 dark:bg-transparent' />,
    },
    {
        value: 'accent',
        label: 'Accent color',
        dot: <div className='size-4 rounded-full' style={{ backgroundColor: accentColor }} />,
    },
];

type FormatOption = { value: 'vertical' | 'square'; label: string; icon: React.ReactNode };

const FORMAT_OPTIONS: FormatOption[] = [
    { value: 'vertical', label: 'Vertical', icon: <LucideIcon.RectangleVertical className='size-4' /> },
    { value: 'square', label: 'Square', icon: <LucideIcon.Square className='size-4' /> },
];

const TooltipToggleItem = <T extends string>({
    value,
    label,
    children,
}: {
    value: T;
    label: string;
    children: React.ReactNode;
}) => (
    <Tooltip>
        <TooltipTrigger>
            <ToggleGroupItem aria-label={label} value={value}>
                {children}
            </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
    </Tooltip>
);

type CardControlsProps = {
    backgroundColor: 'light' | 'dark' | 'accent';
    cardFormat: 'vertical' | 'square';
    accentColor?: string;
    onBackgroundChange: (value: 'light' | 'dark' | 'accent') => void;
    onFormatChange: (value: 'vertical' | 'square') => void;
};

export const CardControls: React.FC<CardControlsProps> = ({
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
            onValueChange={value => value && onBackgroundChange(value as 'light' | 'dark' | 'accent')}
        >
            {getColorOptions(accentColor).map(({ value, label, dot }) => (
                <TooltipToggleItem key={value} label={label} value={value}>
                    {dot}
                </TooltipToggleItem>
            ))}
        </ToggleGroup>

        <ToggleGroup
            defaultValue='vertical'
            type='single'
            value={cardFormat}
            onValueChange={value => value && onFormatChange(value as 'vertical' | 'square')}
        >
            {FORMAT_OPTIONS.map(({ value, label, icon }) => (
                <TooltipToggleItem key={value} label={label} value={value}>
                    {icon}
                </TooltipToggleItem>
            ))}
        </ToggleGroup>
    </div>
);
```

## Refactored Main Components

```typescript
// ProfileCard.tsx
import { memo, useEffect } from 'react';
import { H2, Skeleton } from '@tryghost/shade';
import { Account } from '@src/api/activitypub';
import { ProfileCardBanner } from './ProfileCardBanner';
import { ProfileCardHandle } from './ProfileCardHandle';
import { getCardBackgroundColor, getCardTextColor } from '@src/utils/profileCard';
import { useCopyHandle } from '@src/hooks/useClipboard';

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
    backgroundColor: 'light' | 'dark' | 'accent';
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
    const { copied, copy, cleanup } = useCopyHandle(account?.handle);

    useEffect(() => cleanup, [cleanup]);

    const cardBackgroundColor = getCardBackgroundColor(backgroundColor, accentColor);
    const textColor = getCardTextColor(backgroundColor);
    const margin = isScreenshot ? 'm-12' : 'm-16 max-sm:m-8';
    const cardWidth = format === 'square' ? 'w-[422px]' : 'w-[316px]';

    const bannerImageSrc = isScreenshot && bannerDataUrl
        ? bannerDataUrl
        : account?.bannerImageUrl || coverImage;

    const avatarImageSrc = isScreenshot && avatarDataUrl
        ? avatarDataUrl
        : account?.avatarUrl || publicationIcon;

    const hasAvatar = Boolean(account?.avatarUrl || publicationIcon);

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
            <div
                className={`flex grow flex-col items-center p-6 text-center ${hasAvatar ? 'pt-9' : 'pt-3'} ${format === 'square' ? 'flex-1 justify-center' : ''}`}
            >
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
                    onCopy={copy}
                />
            </div>
        </div>
    );
});

ProfileCard.displayName = 'ProfileCard';

export default ProfileCard;
```

```typescript
// Profile.tsx
import { useRef, useState } from 'react';
import { Button, H2, LoadingIndicator, LucideIcon, TooltipProvider } from '@tryghost/shade';
import { Account } from '@src/api/activitypub';
import { useBrowseSite } from '@tryghost/admin-x-framework/api/site';
import ProfileCard from './ProfileCard';
import DotsPattern from './dots-pattern';
import { SocialShareLinks } from './SocialShareLinks';
import { CardControls } from './CardControls';
import { useImageDataUrls } from '@src/hooks/useImageDataUrls';
import { useCopyImage } from '@src/hooks/useCopyImage';
import { getGradient, getDotsPatternColor } from '@src/utils/profileCard';
import ProfileCardShadow from '@assets/images/profile-card-shadow.png';
import ProfileCardShadowSquare from '@assets/images/profile-card-shadow-square.png';

type ProfileProps = {
    account?: Account;
    isLoading: boolean;
};

const CARD_WIDTHS = { square: '518px', vertical: '412px' } as const;
const SHADOW_WIDTHS = { square: '572px', vertical: '466px' } as const;

const Profile: React.FC<ProfileProps> = ({ account, isLoading }) => {
    const { data: siteData } = useBrowseSite();
    const site = siteData?.site;

    const accentColor = site?.accent_color;
    const coverImage = site?.cover_image;
    const publicationIcon = site?.icon;

    const [backgroundColor, setBackgroundColor] = useState<'light' | 'dark' | 'accent'>('light');
    const [cardFormat, setCardFormat] = useState<'vertical' | 'square'>('vertical');

    const { bannerDataUrl, avatarDataUrl } = useImageDataUrls({
        bannerUrl: account?.bannerImageUrl || coverImage,
        avatarUrl: account?.avatarUrl || publicationIcon,
    });

    const profileCardRef = useRef<HTMLDivElement>(null);
    const { isProcessing, copy: copyImage } = useCopyImage(profileCardRef);

    const shareText = `${account?.name} is now available across the social web, on ${account?.handle}`;
    const hasBanner = Boolean(account?.bannerImageUrl || coverImage);
    const shadowSrc = cardFormat === 'square' ? ProfileCardShadowSquare : ProfileCardShadow;

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

    return (
        <TooltipProvider delayDuration={0}>
            <div className='flex flex-col gap-5'>
                <div className='flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3'>
                    <H2>Share your profile</H2>
                    <CardControls
                        accentColor={accentColor}
                        backgroundColor={backgroundColor}
                        cardFormat={cardFormat}
                        onBackgroundChange={setBackgroundColor}
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
                            style={{ color: getDotsPatternColor(backgroundColor) }}
                        />
                    )}
                    <div className='absolute inset-0' style={{ background: getGradient(backgroundColor, accentColor) }} />
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
                            style={{ color: getDotsPatternColor(backgroundColor) }}
                        />
                    )}
                    <div className='absolute left-0 top-0 size-full' style={{ background: getGradient(backgroundColor, accentColor) }} />
                    <img
                        className='absolute left-1/2 top-12 mt-0.5 max-w-none -translate-x-1/2'
                        src={shadowSrc}
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

| Before | After |
|--------|-------|
| Single 400+ line file | Split into focused modules |
| Inline `switch` statements | Lookup objects (`Record<K, V>`) |
| Duplicated `ProfileCard` rendering | Shared `sharedCardProps` spread |
| Inline clipboard/canvas logic | `useCopyHandle`, `useCopyImage` hooks |
| Inline image conversion | `useImageDataUrls` hook |
| Repeated tooltip/toggle pattern | `TooltipToggleItem` + data-driven `CardControls` |
| Hardcoded social link JSX | Data-driven `SHARE_LINKS` array |
| Mixed concerns in components | Single-responsibility components |