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
    account?: Account
    isLoading: boolean
}

type ProfileCardProps = {
    isScreenshot?: boolean
    format?: CardFormat
    account?: Account
    isLoading: boolean
    bannerDataUrl: string | null
    avatarDataUrl: string | null
    coverImage?: string
    publicationIcon?: string
    siteTitle?: string
    backgroundColor: BackgroundColor
    accentColor?: string
}

const hexToRgba = (hex: string, alpha: number) => {
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

const GRADIENTS: Record<BackgroundColor, (accentColor?: string) => string> = {
    light: () => `linear-gradient(to bottom left, #EBEEF0, ${hexToRgba('#EBEEF0', 0)})`,
    dark: () => `linear-gradient(to bottom left, ${hexToRgba('#1A1E22', 1)}, ${hexToRgba('#343C48', 1)})`,
    accent: (accentColor = '#15171a') => `linear-gradient(to bottom left, ${hexToRgba(accentColor, 0.08)}, ${hexToRgba(accentColor, 0.06)})`
};

const DOTS_PATTERN_COLORS: Record<BackgroundColor, string> = {
    light: hexToRgba('#15171a', 0.025),
    dark: hexToRgba('#15171a', 0.23),
    accent: 'rgba(0, 0, 0, 0.02)'
};

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

const useCopyCardImage = (
    cardRef: React.RefObject<HTMLDivElement>,
    backgroundColor: BackgroundColor
) => {
    const [isProcessing, setIsProcessing] = useState(false);

    const copy = async () => {
        if (!cardRef.current || isProcessing) {
            return;
        }

        setIsProcessing(true);

        await new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });

        try {
            if (!navigator.clipboard || !('write' in navigator.clipboard) || typeof ClipboardItem === 'undefined') {
                throw new Error('Clipboard API not supported in this browser');
            }

            const blobPromise = new Promise<Blob>(async (resolve, reject) => {
                try {
                    const canvas = await html2canvas(cardRef.current!, {
                        backgroundColor: 'transparent',
                        scale: 2,
                        logging: false,
                        useCORS: true,
                        allowTaint: true,
                        imageTimeout: 0
                    });
                    canvas.toBlob((blob) => {
                        blob ? resolve(blob) : reject(new Error('Failed to create blob'));
                    }, 'image/png');
                } catch (error) {
                    reject(error);
                }
            });

            await navigator.clipboard.write([new ClipboardItem({'image/png': blobPromise})]);
            toast.success('Image copied to clipboard');
        } catch {
            toast.error('Failed to copy image');
        }

        setIsProcessing(false);
    };

    return {isProcessing, copy};
};

const HandleBadge: React.FC<{
    handle?: string
    backgroundColor: BackgroundColor
    accentColor?: string
    isScreenshot: boolean
    onCopy: () => void
    copied: boolean
}> = ({handle, backgroundColor, accentColor, isScreenshot, onCopy, copied}) => {
    const accentBase = backgroundColor === 'accent' ? '#ffffff' : accentColor;
    const isLight = backgroundColor === 'light';
    const isDark = backgroundColor === 'dark';

    return (
        <div
            className={`mt-auto flex max-h-[60px] min-h-12 w-full items-center justify-center break-all rounded-full border px-4 py-2 font-medium leading-7 ${isScreenshot && 'tracking-normal'}`}
            style={{
                color: !isLight ? '#fff' : accentColor,
                borderColor: accentBase ? hexToRgba(accentBase, !isLight ? 0.7 : 0.2) : undefined,
                background: accentBase
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

    const cardBackgroundColor = backgroundColor === 'accent'
        ? (accentColor || '#15171a')
        : BACKGROUND_COLORS[backgroundColor];
    const textColor = TEXT_COLORS[backgroundColor];

    const margin = isScreenshot ? 'm-12' : 'm-16 max-sm:m-8';
    const borderClass = isScreenshot ? '' : 'shadow-xl';
    const cardWidth = format === 'square' ? 'w-[422px]' : 'w-[316px]';

    const bannerImageSrc = isScreenshot && bannerDataUrl ? bannerDataUrl : (account?.bannerImageUrl || coverImage);
    const avatarImageSrc = isScreenshot && avatarDataUrl ? avatarDataUrl : (account?.avatarUrl || publicationIcon);
    const hasAvatar = Boolean(account?.avatarUrl || publicationIcon);

    const gradientBase = backgroundColor === 'accent' ? '#ffffff' : (accentColor || '#15171a');

    return (
        <div
            className={`relative z-20 flex flex-col ${margin} ${cardWidth} h-[422px] rounded-[32px] ${borderClass}`}
            style={{backgroundColor: cardBackgroundColor}}
        >
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
                        style={{background: `linear-gradient(to bottom, ${hexToRgba(gradientBase, 1)}, ${hexToRgba(gradientBase, 0.5)})`}}
                    >
                        <DotsPattern
                            className='absolute'
                            style={{
                                color: backgroundColor === 'accent' ? hexToRgba(accentColor || '#15171a', 0.2) : 'rgba(255, 255, 255, 0.2)',
                                top: isScreenshot ? '-42px' : '-84px',
                                left: isScreenshot ? '-69px' : '-138px'
                            }}
                        />
                    </div>
                )}
                {avatarImageSrc && (
                    <div
                        className='absolute bottom-0 left-1/2 -mb-8 -translate-x-1/2 rounded-full border-8 [&>div]:!size-16 [&_img]:!size-16'
                        style={{borderColor: cardBackgroundColor}}
                    >
                        <APAvatar
                            author={{
                                icon: {url: avatarImageSrc},
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
                    {!isLoading ? account?.name : <Skeleton className='w-32' />}
                </H2>
                <span className={`mt-1.5 leading-7 ${isScreenshot && 'tracking-normal'}`} style={{color: textColor}}>
                    {!isLoading
                        ? 'Available on Ghost, Flipboard, Threads, Bluesky, Mastodon, or wherever you get your social web feeds.'
                        : <Skeleton className='w-28' />
                    }
                </span>
                <HandleBadge
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

const SOCIAL_LINKS = [
    {
        name: 'X',
        href: (text: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
        icon: (
            <svg aria-hidden="true" viewBox="0 0 24 24">
                <path className="social-x_svg__x" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
        )
    },
    {
        name: 'Threads',
        href: (text: string) => `https://threads.net/intent/post?text=${encodeURIComponent(text)}`,
        icon: (
            <svg fill="none" viewBox="0 0 18 18">
                <g clipPath="url(#social-threads_svg__clip0_351_18008)">
                    <path d="M13.033 8.38a5.924 5.924 0 00-.223-.102c-.13-2.418-1.452-3.802-3.67-3.816h-.03c-1.327 0-2.43.566-3.11 1.597l1.22.837c.507-.77 1.304-.934 1.89-.934h.02c.73.004 1.282.217 1.639.63.26.302.433.72.519 1.245a9.334 9.334 0 00-2.097-.101c-2.109.121-3.465 1.351-3.374 3.06.047.868.478 1.614 1.216 2.1.624.413 1.428.614 2.263.568 1.103-.06 1.969-.48 2.572-1.25.459-.585.749-1.342.877-2.296.526.317.915.735 1.13 1.236.366.854.387 2.255-.756 3.398-1.003 1.002-2.207 1.435-4.028 1.448-2.02-.015-3.547-.663-4.54-1.925-.93-1.182-1.41-2.89-1.428-5.075.018-2.185.498-3.893 1.428-5.075.993-1.262 2.52-1.91 4.54-1.925 2.034.015 3.588.666 4.62 1.934.505.622.886