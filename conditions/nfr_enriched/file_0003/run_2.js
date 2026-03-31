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
    label: string;
    href: string;
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

function resolveAccentBase(backgroundColor: BackgroundColor, accentColor?: string): string {
    return backgroundColor === 'accent' ? '#ffffff' : (accentColor || '#15171a');
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

async function waitForDoubleFrame(): Promise<void> {
    return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
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

function useCopyImage(elementRef: React.RefObject<HTMLDivElement>) {
    const [isProcessing, setIsProcessing] = useState(false);

    const copy = useCallback(async () => {
        if (!elementRef.current || isProcessing) {
            return;
        }

        setIsProcessing(true);
        await waitForDoubleFrame();

        try {
            if (!navigator.clipboard || !('write' in navigator.clipboard) || typeof ClipboardItem === 'undefined') {
                throw new Error('Clipboard API not supported');
            }

            const blobPromise = captureElementAsBlob(elementRef.current);
            await navigator.clipboard.write([new ClipboardItem({'image/png': blobPromise})]);
            toast.success('Image copied to clipboard');
        } catch {
            toast.error('Failed to copy image');
        } finally {
            setIsProcessing(false);
        }
    }, [elementRef, isProcessing]);

    return {isProcessing, copy};
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const BannerArea: React.FC<{
    bannerSrc?: string;
    avatarSrc?: string;
    accountName?: string;
    accountHandle?: string;
    siteTitle?: string;
    backgroundColor: BackgroundColor;
    accentColor?: string;
    cardBackgroundColor: string;
    isScreenshot: boolean;
}> = ({bannerSrc, avatarSrc, accountName, accountHandle, siteTitle, backgroundColor, accentColor, cardBackgroundColor, isScreenshot}) => {
    const accentBase = resolveAccentBase(backgroundColor, accentColor);

    return (
        <div className='relative h-48 p-2'>
            {bannerSrc ? (
                <img
                    alt={accountName}
                    className='size-full rounded-[26px] rounded-b-none object-cover'
                    referrerPolicy='no-referrer'
                    src={bannerSrc}
                />
            ) : (
                <div
                    className='relative size-full overflow-hidden rounded-[26px] rounded-b-none'
                    style={{background: `linear-gradient(to bottom, ${hexToRgba(accentBase, 1)}, ${hexToRgba(accentBase, 0.5)})`}}
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
            )}
            {avatarSrc && (
                <div
                    className='absolute bottom-0 left-1/2 -mb-8 -translate-x-1/2 rounded-full border-8 [&>div]:!size-16 [&_img]:!size-16'
                    style={{borderColor: cardBackgroundColor}}
                >
                    <APAvatar
                        author={{
                            icon: {url: avatarSrc},
                            name: accountName || siteTitle || '',
                            handle: accountHandle,
                        }}
                        size='md'
                    />
                </div>
            )}
        </div>
    );
};

const HandleBadge: React.FC<{
    handle?: string;
    backgroundColor: BackgroundColor;
    accentColor?: string;
    isScreenshot: boolean;
}> = ({handle, backgroundColor, accentColor, isScreenshot}) => {
    const {copied, copy} = useCopyHandle(handle);
    const accentBase = resolveAccentBase(backgroundColor, accentColor);
    const isLight = backgroundColor === 'light';

    const badgeStyle = {
        color: !isLight ? '#fff' : accentColor,
        borderColor: accentColor ? hexToRgba(accentBase, !isLight ? 0.7 : 0.2) : undefined,
        background: accentColor
            ? `linear-gradient(to top right, ${hexToRgba(accentBase, backgroundColor === 'dark' ? 0.12 : 0.04)}, ${hexToRgba(accentBase, backgroundColor === 'dark' ? 0.48 : 0.16)})`
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
                        style={{color: !isLight ? '#fff' : accentColor}}
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

const SocialShareLinks: React.FC<{shareText: string}> = ({shareText}) => {
    const encoded = encodeURIComponent(shareText);

    const links: SocialLink[] = [
        {
            label: 'X',
            href: `https://twitter.com/intent/tweet?text=${encoded}`,
            icon: (
                <svg aria-hidden='true' viewBox='0 0 24 24'>
                    <path className='social-x_svg__x' d='M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' />
                </svg>
            ),
        },
        {
            label: 'Threads',
            href: `https://threads.net/intent/post?text=${encoded}`,
            icon: (
                <svg fill='none' viewBox='0 0 18 18'>
                    <g clipPath='url(#social-threads_svg__clip0_351_18008)'>
                        <path d='M13.033 8.38a5.924 5.924 0 00-.223-.102c-.13-2.418-1.452-3.802-3.67-3.816h-.03c-1.327 0-2.43.566-3.11 1.597l1.22.837c.507-.77 1.304-.934 1.89-.934h.02c.73.004 1.282.217 1.639.63.26.302.433.72.519 1.245a9.334 9.334 0 00-2.097-.101c-2.109.121-3.465 1.351-3.374 3.06.047.868.478 1.614 1.216 2.1.624.413 1.428.614 2.263.568 1.103-.06 1.969-.48 2.572-1.25.459-.585.749-1.342.877-2.296.526.317.915.735 1.13 1.236.366.854.387 2.255-.756 3.398-1.003 1.002-2.207 1.435-4.028 1.448-2.02-.015-3.547-.663-4.54-1.925-.93-1.182-1.41-2.89-1.428-5.075.018-2.185.498-3.893 1.428-5.075.993-1.262 2.52-1.91 4.54-1.925 2.034.015 3.588.666 4.62 1.934.505.622.886 1.405 1.137 2.317l1.43-.382c-.305-1.122-.784-2.09-1.436-2.892C13.52 1.35 11.587.517 9.096.5h-.01C6.6.517 4.689 1.354 3.404 2.986 2.262 4.44 1.672 6.46 1.652 8.994v.012c.02 2.534.61 4.555 1.752 6.008C4.69 16.646 6.6 17.483 9.086 17.5h.01c2.21-.015 3.768-.594 5.051-1.876 1.68-1.678 1.629-3.78 1.075-5.07-.397-.927-