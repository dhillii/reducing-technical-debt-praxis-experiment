# Refactored Profile Component

## Key Changes Made

1. **Extracted custom hooks** (`useClipboard`, `useImageDataUrls`, `useCardStyles`) to separate concerns
2. **Extracted components** (`SocialShareLinks`, `ColorToggleGroup`, `FormatToggleGroup`, `ScreenshotCard`) to reduce component size
3. **Simplified style computation** using lookup maps instead of switch statements
4. **Eliminated duplicate logic** (gradient/color calculations, shared ProfileCard props)
5. **Cleaned up the blob/clipboard logic** by flattening nested try/catch

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

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Utilities ───────────────────────────────────────────────────────────────

const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const BACKGROUND_COLORS: Record<BackgroundColor, string> = {
    light: '#fff',
    dark: '#15171a',
    accent: '' // resolved dynamically
};

const TEXT_COLORS: Record<BackgroundColor, string> = {
    light: '#15171a',
    dark: '#fff',
    accent: '#fff'
};

const resolveBackgroundColor = (backgroundColor: BackgroundColor, accentColor?: string): string =>
    backgroundColor === 'accent' ? (accentColor || '#15171a') : BACKGROUND_COLORS[backgroundColor];

// ─── Custom Hooks ─────────────────────────────────────────────────────────────

function useClipboard() {
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
        }
    }, []);

    const copyText = useCallback(async (text: string) => {
        if (!navigator?.clipboard?.writeText) {
            toast.error('Unable to copy handle');
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
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
    }, []);

    return {copied, copyText};
}

function useImageDataUrls(
    bannerUrl: string | undefined,
    avatarUrl: string | undefined
) {
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
}

function useCardStyles(backgroundColor: BackgroundColor, accentColor?: string) {
    const accentOrDark = accentColor || '#15171a';

    const getGradient = (): string => {
        const gradients: Record<BackgroundColor, string> = {
            light: `linear-gradient(to bottom left, #EBEEF0, ${hexToRgba('#EBEEF0', 0)})`,
            dark: `linear-gradient(to bottom left, ${hexToRgba('#1A1E22', 1)}, ${hexToRgba('#343C48', 1)})`,
            accent: `linear-gradient(to bottom left, ${hexToRgba(accentOrDark, 0.08)}, ${hexToRgba(accentOrDark, 0.06)})`
        };
        return gradients[backgroundColor];
    };

    const getDotsPatternColor = (): string => {
        const colors: Record<BackgroundColor, string> = {
            light: hexToRgba('#15171a', 0.025),
            dark: hexToRgba('#15171a', 0.23),
            accent: 'rgba(0, 0, 0, 0.02)'
        };
        return colors[backgroundColor];
    };

    return {getGradient, getDotsPatternColor};
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SOCIAL_LINKS = [
    {
        label: 'X',
        getHref: (text: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
        icon: (
            <svg aria-hidden="true" viewBox="0 0 24 24">
                <path className="social-x_svg__x" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
        )
    },
    {
        label: 'Threads',
        getHref: (text: string) => `https://threads.net/intent/post?text=${encodeURIComponent(text)}`,
        icon: (
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
        )
    },
    {
        label: 'Facebook',
        getHref: () => 'https://www.facebook.com/sharer/sharer.php?u=',
        icon: (
            <svg fill="none" viewBox="0 0 40 40">
                <title>social-facebook</title>
                <path className="social-facebook_svg__fb" d="M20 40.004c11.046 0 20-8.955 20-20 0-11.046-8.954-20-20-20s-20 8.954-20 20c0 11.045 8.954 20 20 20z" fill="#1977f3" />
                <path d="M27.785 25.785l.886-5.782h-5.546V16.25c0-1.58.773-3.125 3.26-3.125h2.522V8.204s-2.29-.39-4.477-.39c-4.568 0-7.555 2.767-7.555 7.781v4.408h-5.08v5.782h5.08v13.976a20.08 20.08 0 003.125.242c1.063 0 2.107-.085 3.125-.242V25.785h4.66z" fill="#fff" />
            </svg>
        )
    },
    {
        label: 'LinkedIn',
        getHref: (text: string) => `http://www.linkedin.com/shareArticle?mini=true&title=${encodeURIComponent(text)}`,
        icon: (
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
        )
    }
];

const SocialShareLinks: React.FC<{shareText: string}> = ({shareText}) => (
    <div className='flex items-center gap-2'>
        {SOCIAL_LINKS.map(({label, getHref, icon}) => (
            <a
                key={label}
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

const ColorToggleGroup: React.FC<{
    value: BackgroundColor;
    accentColor?: string;
    onChange: (value: BackgroundColor) => void;
}> = ({value, accentColor, onChange}) => {
    const options = [
        {
            value: 'light' as const,
            label: 'Light',
            swatch: <div className='size-4 rounded-full border border-gray-500 dark:border-0 dark:bg-white' />
        },
        {
            value: 'dark' as const,
            label: 'Dark',
            swatch: <div className='size-4 rounded-full bg-black dark:border dark:border-gray-700 dark:bg-transparent' />
        },
        {
            value: 'accent' as const,
            label: 'Accent color',
            swatch: <div className='size-4 rounded-full' style={{backgroundColor: accentColor}} />
        }
    ];

    return (
        <ToggleGroup
            defaultValue='light'
            type='single'
            value={value}
            onValueChange={(v) => v && onChange(v as BackgroundColor)}
        >
            {options.map(({value: optValue, label, swatch}) => (
                <Tooltip key={optValue}>
                    <TooltipTrigger>
                        <ToggleGroupItem aria-label={label} value={optValue}>
                            {swatch}
                        </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                </Tooltip>
            ))}
        </ToggleGroup>
    );
};

const FormatToggleGroup: React.FC<{
    value: CardFormat;
    onChange: (value: CardFormat) => void;
}> = ({value, onChange}) => {
    const options = [
        {value: 'vertical' as const, label: 'Vertical', icon: <LucideIcon.RectangleVertical className='size-4' />},
        {value: 'square' as const, label: 'Square', icon: <LucideIcon.Square className='size-4' />}
    ];

    return (
        <ToggleGroup
            defaultValue='vertical'
            type='single'
            value={value}
            onValueChange={(v) => v && onChange(v as CardFormat)}
        >
            {options.map(({value: optValue, label, icon}) => (
                <Tooltip key={optValue}>
                    <TooltipTrigger>
                        <ToggleGroupItem aria-label={label} value={optValue}>
                            {icon}
                        </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                </Tooltip>
            ))}
        </ToggleGroup>
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
    const {copied, copyText} = useClipboard();

    const cardBackgroundColor = resolveBackgroundColor(backgroundColor, accentColor);
    const textColor = TEXT_COLORS[backgroundColor];
    const accentOrDark = accentColor || '#15171a';
    const isLight = backgroundColor === 'light';
    const isAccent = backgroundColor === 'accent';

    const margin = isScreenshot ? 'm-12' : 'm-16 max-sm:m-8';
    const borderClass = isScreenshot ? '' : 'shadow-xl';
    const cardWidth = format === 'square' ? 'w-[422px]' : 'w-[316px]';
    const trackingClass = isScreenshot ? 'tracking-normal' : '';

    const bannerSrc = (isScreenshot && bannerDataUrl) ? bannerDataUrl : (account?.bannerImageUrl || coverImage);
    const avatarSrc = (isScreenshot && avatarDataUrl) ? avatarDataUrl : (account?.avatarUrl || publicationIcon);
    const hasAvatar = Boolean(account?.avatarUrl || publicationIcon);

    // Banner gradient when no image
    const bannerGradientColor = isAccent ? '#ffffff' : accentOrDark;
    const bannerGradient = `linear-gradient(to bottom, ${hexToRgba(bannerGradientColor, 1)}, ${hexToRgba(bannerGradientColor, 0.5)})`;
    const dotsColor = isAccent ? hexToRgba(accentOrDark, 0.2) : 'rgba(255, 255, 255, 0.2)';
    const dotsOffset = isScreenshot ? {top: '-42px', left: '-69px'} : {top: '-84px', left: '-138px'};

    // Handle pill styles
    const pillTextColor = !isLight ? '#fff' : accentColor;
    const pillAccentBase = isAccent ? '#ffffff' : accentOrDark;
    const pillBorderAlpha = !isLight ? 0.7 : 0.2;
    const pillBgAlpha1 = backgroundColor === 'dark' ? 0.12 : 0.04;
    const pillBgAlpha2 = backgroundColor === 'dark' ? 0.48 : 0.16;

    return (
        <div
            className={`relative z-20 flex flex-col ${margin} ${cardWidth} h-[422px] rounded-[32px] ${borderClass}`}
            style={{backgroundColor: cardBackgroundColor}}
        >
            {/* Banner */}
            <div className='relative h-48 p-2'>
                {bannerSrc
                    ? (
                        <img
                            alt={account?.name}
                            className='size-full rounded-[26px] rounded-b-none object-cover'
                            referrerPolicy='no-referrer'
                            src={bannerSrc}
                        />
                    )
                    : (
                        <div
                            className='relative size-full overflow-hidden rounded-[26px] rounded-b-none'
                            style={{background: bannerGradient}}
                        >
                            <DotsPattern
                                className='absolute'
                                style={{color: dotsColor, ...dotsOffset}}
                            />
                        </div>
                    )
                }

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

            {/* Body */}
            <div className={`flex grow flex-col items-center p-6 ${hasAvatar ? 'pt-9' : 'pt-3'} text-center ${format === 'square' ? 'flex-1 justify-center' : ''}`}>
                <H2 className={trackingClass} style={{color: textColor}}>
                    {!isLoading ? account?.name : <Skeleton className='w-32' />}
                </H2>

                <span className={`mt-1.5 leading-7 ${trackingClass}`} style={{color: textColor}}>
                    {!isLoading
                        ? 'Available on Ghost, Flipboard, Threads, Bluesky, Mastodon, or wherever you get your social web feeds.'
                        : <Skeleton className='w-28' />
                    }
                </span>

                {/* Handle pill */}
                <div
                    className={`mt-auto flex max-h-[60px] min-h-12 w-full items-center justify-center break-all rounded-full border px-4 py-2 font-medium leading-7 ${trackingClass}`}
                    style={{
                        color: pillTextColor,
                        borderColor: accentColor ? hexToRgba(pillAccentBase, pillBorderAlpha) : undefined,
                        background: accentColor
                            ? `linear-gradient(to top right, ${hexToRgba(pillAccentBase, pillBgAlpha1)}, ${hexToRgba(pillAccentBase, pillBgAlpha2)})`
                            : undefined
                    }}
                >
                    <div className='mb-0.5'>
                        {account?.handle}
                        {!isScreenshot && account?.handle && (
                            <Button
                                className='relative top-[3px] ml-1.5 size-4 p-0 hover:opacity-80'
                                style={{color: pillTextColor}}
                                title='Copy handle'
                                variant='link'
                                onClick={() => account.handle && copyText(account.handle)}
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

// ─── Screenshot Card (hidden clone) ──────────────────────────────────────────

const ScreenshotCard: React.FC<{
    cardRef: React.RefObject<HTMLDivElement>;
    cardFormat: CardFormat;
    dotsPatternColor: string;
    gradient: string;
    cardProps: Omit<ProfileCardProps, 'isScreenshot'>;
    hasBanner: boolean;
    isDark: boolean;
}> = ({cardRef, cardFormat, dotsPatternColor, gradient, cardProps, hasBanner, isDark}) => (
    <div
        ref={cardRef}
        className='fixed left-[-9999px] top-0 z-[-1] flex w-fit justify-center overflow-hidden rounded-2xl bg-gray-50'
        style={{
            width: cardFormat === 'square' ? '518px' : '412px',
            fontFamily: 'system-ui'
        }}
    >
        <ProfileCard {...cardProps} isScreenshot={true} />

        {hasBanner && (
            <DotsPattern
                className={`absolute left-[-62.5px] top-[-44px] h-[600px] w-[598px] ${isDark ? 'z-10' : ''}`}
                style={{color: dotsPatternColor}}
            />
        )}

        <div className='absolute left-0 top-0 size-full' style={{background: gradient}} />

        <img
            className='absolute left-1/2 top-12 mt-0.5 max-w-none -translate-x-1/2'
            src={cardFormat === 'square' ? ProfileCardShadowSquare : ProfileCardShadow}
            style={{width: cardFormat === 'square' ? '572px' : '466px'}}
        />
    </div>
);

// ─── Profile (main export) ────────────────────────────────────────────────────

const Profile: React.FC<ProfileProps> = ({account, isLoading}) => {
    const {data: siteData} = useBrowseSite();
    const site = siteData?.site;
    const accentColor = site?.accent_color;
    const coverImage = site?.cover_image;
    const publicationIcon = site?.icon;

    const profileCardRef = useRef<HTMLDivElement>(null);
    const [backgroundColor, setBackgroundColor] = useState<BackgroundColor>('light');
    const [cardFormat, setCardFormat] = useState<CardFormat>('vertical');
    const [isProcessing, setIsProcessing] = useState(false);

    const bannerUrl = account?.bannerImageUrl || coverImage;
    const avatarUrl = account?.avatarUrl || publicationIcon;
    const {bannerDataUrl, avatarDataUrl} = useImageDataUrls(bannerUrl, avatarUrl);
    const {getGradient, getDotsPatternColor} = useCardStyles(backgroundColor, accentColor);

    const shareText = `${account?.name} is now available across the social web, on ${account?.handle}`;

    const sharedCardProps: Omit<ProfileCardProps, 'isScreenshot'> = {
        accentColor,
        account,
        avatarDataUrl,
        backgroundColor,
        bannerDataUrl,
        coverImage,
        format: cardFormat,
        isLoading,
        publicationIcon,
        siteTitle: site?.title
    };

    const captureToClipboard = useCallback(async () => {
        if (!profileCardRef.current || isProcessing) {
            return;
        }

        if (!navigator.clipboard || !('write' in navigator.clipboard) || typeof ClipboardItem === 'undefined') {
            toast.error('Clipboard API not supported in this browser');
            return;
        }

        setIsProcessing(true);

        // Allow the loading indicator to paint before capturing
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });

        try {
            const canvas = await html2canvas(profileCardRef.current, {
                backgroundColor: 'transparent',
                scale: 2,
                logging: false,
                useCORS: true,
                allowTaint: true,
                imageTimeout: 0
            });

            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(b => b ? resolve(b) : reject(new Error('Failed to create blob')), 'image/png');
            });

            await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]);
            toast.success('Image copied to clipboard');
        } catch {
            toast.error('Failed to copy image');
        } finally {
            setIsProcessing(false);
        }
    }, [isProcessing]);

    const hasBanner = Boolean(account?.bannerImageUrl || coverImage);
    const isDark = backgroundColor === 'dark';

    return (
        <TooltipProvider delayDuration={0}>
            <div className='flex flex-col gap-5'>
                {/* Header */}
                <div className='flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3'>
                    <H2>Share your profile</H2>
                    <div className='flex gap-4'>
                        <ColorToggleGroup
                            accentColor={accentColor}
                            value={backgroundColor}
                            onChange={setBackgroundColor}
                        />
                        <FormatToggleGroup value={cardFormat} onChange={setCardFormat} />
                    </div>
                </div>

                {/* Preview card */}
                <div className='relative flex flex-col items-center overflow-hidden rounded-2xl bg-gray-50'>
                    <ProfileCard {...sharedCardProps} />

                    {/* Footer: share links + copy button */}
                    <div className='relative z-20 flex w-full items-center justify-between gap-4 px-6 pb-6 max-sm:mt-4 max-sm:flex-col'>
                        <SocialShareLinks shareText={shareText} />
                        <Button
                            className={`min-w-[160px] dark:bg-black dark:text-white dark:hover:bg-black/90 ${isDark && 'bg-white text-black hover:bg-gray-50 dark:bg-white dark:text-black dark:hover:bg-gray-50/90'}`}
                            onClick={captureToClipboard}
                        >
                            {isProcessing
                                ? <LoadingIndicator color={isDark ? 'dark' : 'light'} size='sm' />
                                : <LucideIcon.Copy />
                            }
                            {!isProcessing && 'Copy image'}
                        </Button>
                    </div>

                    {hasBanner && (
                        <DotsPattern
                            className={`absolute left-1/2 top-1/2 h-[600px] w-[598px] -translate-x-1/2 -translate-y-1/2 ${isDark ? 'z-10' : ''}`}
                            style={{color: getDotsPatternColor()}}
                        />
                    )}
                    <div className='absolute inset-0' style={{background: getGradient()}} />
                </div>

                {/* Hidden screenshot clone */}
                <ScreenshotCard
                    cardFormat={cardFormat}
                    cardProps={sharedCardProps}
                    cardRef={profileCardRef}
                    dotsPatternColor={getDotsPatternColor()}
                    gradient={getGradient()}
                    hasBanner={hasBanner}
                    isDark={isDark}
                />
            </div>
        </TooltipProvider>
    );
};

export default Profile;
```

## Summary of Refactoring Decisions

| Problem | Solution |
|---|---|
| `switch` statements for colors/gradients | Lookup maps (`Record<BackgroundColor, string>`) |
| Inline clipboard logic in `ProfileCard` | `useClipboard` hook |
| Inline image conversion logic | `useImageDataUrls` hook |
| Gradient/dots color logic scattered | `useCardStyles` hook |
| Repeated `ProfileCard` prop lists | `sharedCardProps` object spread |
| Monolithic `handleCopy` with nested try/catch | Flattened with `finally`, extracted `captureToClipboard` |
| Inline social link JSX (4× repeated anchor pattern) | `SOCIAL_LINKS` data array + `SocialShareLinks` component |
| Inline toggle groups with repeated `Tooltip` wrappers | `ColorToggleGroup` / `FormatToggleGroup` components driven by option arrays |
| Hidden screenshot div mixed into `Profile` JSX | `ScreenshotCard` component |
| Repeated accent color resolution logic | `resolveBackgroundColor` utility |