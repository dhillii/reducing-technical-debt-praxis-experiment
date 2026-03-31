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

const CARD_DIMENSIONS: Record<CardFormat, {width: string; screenshotWidth: string}> = {
    vertical: {width: 'w-[316px]', screenshotWidth: '412px'},
    square: {width: 'w-[422px]', screenshotWidth: '518px'},
};

// ─── Utilities ───────────────────────────────────────────────────────────────

const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const resolveBackgroundColor = (backgroundColor: BackgroundColor, accentColor?: string): string => {
    if (backgroundColor === 'accent') {
        return accentColor || '#15171a';
    }
    return BACKGROUND_COLORS[backgroundColor];
};

const resolveTextColor = (backgroundColor: BackgroundColor): string => TEXT_COLORS[backgroundColor];

const getAccentBase = (backgroundColor: BackgroundColor, accentColor?: string): string =>
    backgroundColor === 'accent' ? '#ffffff' : accentColor || '#15171a';

const captureCanvasBlob = (element: HTMLElement): Promise<Blob> =>
    new Promise(async (resolve, reject) => {
        try {
            const canvas = await html2canvas(element, {
                backgroundColor: 'transparent',
                scale: 2,
                logging: false,
                useCORS: true,
                allowTaint: true,
                imageTimeout: 0,
            });
            canvas.toBlob((blob) => {
                blob ? resolve(blob) : reject(new Error('Failed to create blob'));
            }, 'image/png');
        } catch (error) {
            reject(error);
        }
    });

const waitForDoubleFrame = (): Promise<void> =>
    new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

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

const useCopyImage = (
    ref: React.RefObject<HTMLDivElement>,
    backgroundColor: BackgroundColor
) => {
    const [isProcessing, setIsProcessing] = useState(false);

    const copy = async () => {
        if (!ref.current || isProcessing) {
            return;
        }

        setIsProcessing(true);
        await waitForDoubleFrame();

        try {
            if (!navigator.clipboard || !('write' in navigator.clipboard) || typeof ClipboardItem === 'undefined') {
                throw new Error('Clipboard API not supported');
            }

            const blobPromise = captureCanvasBlob(ref.current);
            await navigator.clipboard.write([new ClipboardItem({'image/png': blobPromise})]);
            toast.success('Image copied to clipboard');
        } catch {
            toast.error('Failed to copy image');
        } finally {
            setIsProcessing(false);
        }
    };

    return {isProcessing, copy};
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const CardBanner: React.FC<{
    bannerSrc?: string;
    avatarSrc?: string;
    accountName?: string;
    siteTitle?: string;
    handle?: string;
    cardBackgroundColor: string;
    backgroundColor: BackgroundColor;
    accentColor?: string;
    isScreenshot: boolean;
}> = ({bannerSrc, avatarSrc, accountName, siteTitle, handle, cardBackgroundColor, backgroundColor, accentColor, isScreenshot}) => {
    const accentBase = getAccentBase(backgroundColor, accentColor);

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
                            handle,
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
                    : undefined,
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

const ColorToggle: React.FC<{
    value: BackgroundColor;
    accentColor?: string;
    onChange: (value: BackgroundColor) => void;
}> = ({value, accentColor, onChange}) => {
    const options: Array<{value: BackgroundColor; label: string; swatch: React.ReactNode}> = [
        {
            value: 'light',
            label: 'Light',
            swatch: <div className='size-4 rounded-full border border-gray-500 dark:border-0 dark:bg-white' />,
        },
        {
            value: 'dark',
            label: 'Dark',
            swatch: <div className='size-4 rounded-full bg-black dark:border dark:border-gray-700 dark:bg-transparent' />,
        },
        {
            value: 'accent',
            label: 'Accent color',
            swatch: <div className='size-4 rounded-full' style={{backgroundColor: accentColor}} />,
        },
    ];

    return (
        <ToggleGroup
            defaultValue='light'
            type='single'
            value={value}
            onValueChange={(v) => v && onChange(v as BackgroundColor)}
        >
            {options.map((opt) => (
                <Tooltip key={opt.value}>
                    <TooltipTrigger>
                        <ToggleGroupItem aria-label={opt.label} value={opt.value}>
                            {opt.swatch}
                        </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent>{opt.label}</TooltipContent>
                </Tooltip>
            ))}
        </ToggleGroup>
    );
};

const FormatToggle: React.FC<{
    value: CardFormat;
    onChange: (value: CardFormat) => void;
}> = ({value, onChange}) => {
    const options: Array<{value: CardFormat; label: string; icon: React.ReactNode}> = [
        {value: 'vertical', label: 'Vertical', icon: <LucideIcon.RectangleVertical className='size-4' />},
        {value: 'square', label: 'Square', icon: <LucideIcon.Square className='size-4' />},
    ];

    return (
        <ToggleGroup
            defaultValue='vertical'
            type='single'
            value={value}
            onValueChange={(v) => v && onChange(v as CardFormat)}
        >
            {options.map((opt) => (
                <Tooltip key={opt.value}>
                    <TooltipTrigger>
                        <ToggleGroupItem aria-label={opt.label} value={opt.value}>
                            {opt.icon}
                        </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent>{opt.label}</TooltipContent>
                </Tooltip>
            ))}
        </ToggleGroup>
    );
};

const SocialLinks: React.FC<{shareText: string}> = ({shareText}) => {
    const encoded = encodeURIComponent(shareText);

    const links: SocialLink[] = [
        {
            href: `https://twitter.com/intent/tweet?text=${encoded}`,
            label: 'Share on X',
            icon: (
                <svg aria-hidden='true' viewBox='0 0 24 24'>
                    <path className='social-x_svg__x' d='M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' />
                </svg>
            ),
        },
        {
            href: `https://threads.net/intent/post?text=${encoded}`,
            label: 'Share on Threads',
            icon: (
                <svg fill='none' viewBox='0 0 18 18'>
                    <g clipPath='url(#social-threads_svg__clip0_351_18008)'>
                        <path d='M13.033 8.38a5.924 5.924 0 00-.223-.102c-.13-2.418-1.452-3.802-3.67-3.816h-.03c-1.327