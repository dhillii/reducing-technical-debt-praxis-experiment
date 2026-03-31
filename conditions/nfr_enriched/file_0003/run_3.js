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

type SocialLink = {
    href: string;
    label: string;
    icon: React.ReactNode;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const BACKGROUND_COLORS: Record<BackgroundColor, string> = {
    light: '#fff',
    dark: '#15171a',
    accent: '',
};

const TEXT_COLORS: Record<BackgroundColor, string> = {
    light: '#15171a',
    dark: '#fff',
    accent: '#fff',
};

const GRADIENTS: Record<BackgroundColor, (accentColor?: string) => string> = {
    light: () => `linear-gradient(to bottom left, #EBEEF0, ${hexToRgba('#EBEEF0', 0)})`,
    dark: () => `linear-gradient(to bottom left, ${hexToRgba('#1A1E22', 1)}, ${hexToRgba('#343C48', 1)})`,
    accent: (accentColor) => `linear-gradient(to bottom left, ${hexToRgba(accentColor || '#15171a', 0.08)}, ${hexToRgba(accentColor || '#15171a', 0.06)})`,
};

const DOTS_PATTERN_COLORS: Record<BackgroundColor, string> = {
    light: hexToRgba('#15171a', 0.025),
    dark: hexToRgba('#15171a', 0.23),
    accent: 'rgba(0, 0, 0, 0.02)',
};

const CARD_DIMENSIONS: Record<CardFormat, {width: string; screenshotWidth: string}> = {
    vertical: {width: 'w-[316px]', screenshotWidth: '412px'},
    square: {width: 'w-[422px]', screenshotWidth: '518px'},
};

// ─── Utilities ───────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function resolveImageSrc(isScreenshot: boolean, dataUrl: string | null, remoteUrl?: string): string | undefined {
    return (isScreenshot && dataUrl) ? dataUrl : remoteUrl || undefined;
}

async function captureElementAsBlob(element: HTMLElement): Promise<Blob> {
    const canvas = await html2canvas(element, {
        backgroundColor: 'transparent',
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 0,
    });

    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
            blob ? resolve(blob) : reject(new Error('Failed to create blob'));
        }, 'image/png');
    });
}

function isClipboardImageSupported(): boolean {
    return !!(navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined');
}

async function waitForNextFrames(count = 2): Promise<void> {
    for (let i = 0; i < count; i++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useCopyHandle(handle?: string) {
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
        }
    }, []);

    const copy = useCallback(async () => {
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
    }, [handle]);

    return {copied, copy};
}

function useImageDataUrls(
    bannerUrl?: string,
    avatarUrl?: string
): {bannerDataUrl: string | null; avatarDataUrl: string | null} {
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
        let active = true;
        if (active) {
            convert();
        }
        return () => {
            active = false;
        };
    }, [convert]);

    return {bannerDataUrl, avatarDataUrl};
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const CardBanner: React.FC<{
    src?: string;
    altText?: string;
    backgroundColor: BackgroundColor;
    accentColor?: string;
    isScreenshot: boolean;
}> = ({src, altText, backgroundColor, accentColor, isScreenshot}) => {
    const fallbackColor = backgroundColor === 'accent' ? '#ffffff' : (accentColor || '#15171a');
    const dotsColor = backgroundColor === 'accent'
        ? hexToRgba(accentColor || '#15171a', 0.2)
        : 'rgba(255, 255, 255, 0.2)';

    if (src) {
        return (
            <img
                alt={altText}
                className='size-full rounded-[26px] rounded-b-none object-cover'
                referrerPolicy='no-referrer'
                src={src}
            />
        );
    }

    return (
        <div
            className='relative size-full overflow-hidden rounded-[26px] rounded-b-none'
            style={{background: `linear-gradient(to bottom, ${hexToRgba(fallbackColor, 1)}, ${hexToRgba(fallbackColor, 0.5)})`}}
        >
            <DotsPattern
                className='absolute'
                style={{
                    color: dotsColor,
                    top: isScreenshot ? '-42px' : '-84px',
                    left: isScreenshot ? '-69px' : '-138px',
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
}> = ({handle, backgroundColor, accentColor, isScreenshot}) => {
    const {copied, copy} = useCopyHandle(handle);

    const accentBase = backgroundColor === 'accent' ? '#ffffff' : (accentColor || undefined);
    const borderAlpha = backgroundColor !== 'light' ? 0.7 : 0.2;
    const bgAlphaFrom = backgroundColor === 'dark' ? 0.12 : 0.04;
    const bgAlphaTo = backgroundColor === 'dark' ? 0.48 : 0.16;

    return (
        <div
            className={`mt-auto flex max-h-[60px] min-h-12 w-full items-center justify-center break-all rounded-full border px-4 py-2 font-medium leading-7 ${isScreenshot ? 'tracking-normal' : ''}`}
            style={{
                color: backgroundColor !== 'light' ? '#fff' : accentColor,
                borderColor: accentBase ? hexToRgba(accentBase, borderAlpha) : undefined,
                background: accentBase
                    ? `linear-gradient(to top right, ${hexToRgba(accentBase, bgAlphaFrom)}, ${hexToRgba(accentBase, bgAlphaTo)})`
                    : undefined,
            }}
        >
            <div className='mb-0.5'>
                {handle}
                {!isScreenshot && handle && (
                    <Button
                        className='relative top-[3px] ml-1.5 size-4 p-0 hover:opacity-80'
                        style={{color: backgroundColor !== 'light' ? '#fff' : accentColor}}
                        title='Copy handle'
                        variant='link'
                        onClick={copy}
                    >
                        {copied ? <LucideIcon.Check size={12} /> : <LucideIcon.Copy size={12} />}
                    </Button>
                )}
            </div>
        </div>
    );
};

const SocialShareLink: React.FC<{href: string; label: string; children: React.ReactNode}> = ({href, label, children}) => (
    <a
        aria-label={label}
        className='flex h-[34px] w-10 items-center justify-center rounded-sm bg-white px-3 shadow-xs hover:bg-gray-50 [&_svg]:size-4'
        href={href}
        rel='noopener noreferrer'
        target='_blank'
    >
        {children}
    </a>
);

const ColorToggleItem: React.FC<{value: string; label: string; children: React.ReactNode}> = ({value, label, children}) => (
    <Tooltip>
        <TooltipTrigger>
            <ToggleGroupItem aria-label={label} value={value}>
                {children}
            </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
    </Tooltip>
);

const FormatToggleItem: React.FC<{value: string; label: string; icon: React.ReactNode}> = ({value, label, icon}) => (
    <Tooltip>
        <TooltipTrigger>
            <ToggleGroupItem aria-label={label} value={value}>
                {icon}
            </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
    </Tooltip>
);

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
    accentColor,
}) => {
    const cardBackgroundColor = backgroundColor === 'accent'
        ? (accentColor || '#15171a')
        : BACKGROUND_COLORS[backgroundColor];
    const textColor = TEXT_COLORS[backgroundColor];

    const margin = isScreenshot ? 'm-12' : 'm-16 max-sm:m-8';
    const borderClass = isScreenshot ? '' : 'shadow-xl';
    const cardWidth = CARD_DIMENSIONS[format].width;
    const hasAvatar = !!(account?.avatarUrl || publicationIcon);

    const bannerSrc = resolveImageSrc(isScreenshot, bannerDataUrl, account?.bannerImageUrl || coverImage);
    const avatarSrc = resolveImageSrc(isScreenshot, avatarDataUrl, account?.avatarUrl || publicationIcon);

    return (
        <div
            className={`relative z-20 flex flex-col ${margin} ${cardWidth} h-[422px] rounded-[32px] ${borderClass}`}
            style={{backgroundColor: cardBackgroundColor}}
        >
            <div className='relative h-48 p-2'>
                <CardBanner
                    accentColor={accentColor}
                    altText={account?.name}
                    backgroundColor={backgroundColor}
                    isScreenshot={isScreenshot}
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
                                handle: account?.handle,
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
                <span className={`mt-1.5 leading-7 ${isScreenshot ? 'tracking-normal' : ''}`} style={{color: textColor}}>
                    {isLoading
                        ? <Skeleton className='w-28' />
                        : 'Available on Ghost, Flipboard, Threads, Bluesky, Mastodon, or wherever you get your social web feeds.'
                    }
                </span>
                <CardHandle
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

// ─── Profile ─────────────────────────────────