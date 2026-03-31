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

const getBackgroundColor = (backgroundColor: BackgroundColor, accentColor?: string): string => {
    if (backgroundColor === 'accent') {
        return accentColor || '#15171a';
    }
    return BACKGROUND_COLORS[backgroundColor];
};

const getTextColor = (backgroundColor: BackgroundColor): string => TEXT_COLORS[backgroundColor];

const getGradient = (backgroundColor: BackgroundColor, accentColor?: string): string => {
    switch (backgroundColor) {
    case 'light':
        return `linear-gradient(to bottom left, #EBEEF0, ${hexToRgba('#EBEEF0', 0)})`;
    case 'dark':
        return `linear-gradient(to bottom left, ${hexToRgba('#1A1E22', 1)}, ${hexToRgba('#343C48', 1)})`;
    case 'accent':
        return `linear-gradient(to bottom left, ${hexToRgba(accentColor || '#15171a', 0.08)}, ${hexToRgba(accentColor || '#15171a', 0.06)})`;
    }
};

const getDotsPatternColor = (backgroundColor: BackgroundColor): string => {
    switch (backgroundColor) {
    case 'light':
        return hexToRgba('#15171a', 0.025);
    case 'dark':
        return hexToRgba('#15171a', 0.23);
    case 'accent':
        return 'rgba(0, 0, 0, 0.02)';
    }
};

const getBannerGradientColor = (backgroundColor: BackgroundColor, accentColor?: string): string => {
    return backgroundColor === 'accent' ? '#ffffff' : (accentColor || '#15171a');
};

const getHandleBoxStyles = (backgroundColor: BackgroundColor, accentColor?: string) => {
    const gradientBase = getBannerGradientColor(backgroundColor, accentColor);
    const isLight = backgroundColor === 'light';
    const isDark = backgroundColor === 'dark';

    return {
        color: !isLight ? '#fff' : accentColor,
        borderColor: accentColor ? hexToRgba(gradientBase, !isLight ? 0.7 : 0.2) : undefined,
        background: accentColor
            ? `linear-gradient(to top right, ${hexToRgba(gradientBase, isDark ? 0.12 : 0.04)}, ${hexToRgba(gradientBase, isDark ? 0.48 : 0.16)})`
            : undefined
    };
};

const useClipboardCopy = () => {
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
        }
    }, []);

    const copyText = async (text: string) => {
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
    };

    return {copied, copyText};
};

const useImageDataUrls = (
    bannerUrl?: string,
    avatarUrl?: string
) => {
    const [bannerDataUrl, setBannerDataUrl] = useState<string | null>(null);
    const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);

    const convertImages = useCallback(async () => {
        if (bannerUrl) {
            const dataUrl = await imageUrlToDataUrl(bannerUrl);
            setBannerDataUrl(dataUrl);
        }
        if (avatarUrl) {
            const dataUrl = await imageUrlToDataUrl(avatarUrl);
            setAvatarDataUrl(dataUrl);
        }
    }, [bannerUrl, avatarUrl]);

    useEffect(() => {
        convertImages();
    }, [convertImages]);

    return {bannerDataUrl, avatarDataUrl};
};

const useCardImageCopy = (
    cardRef: React.RefObject<HTMLDivElement>,
    backgroundColor: BackgroundColor
) => {
    const [isProcessing, setIsProcessing] = useState(false);

    const copyImage = async () => {
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
        } finally {
            setIsProcessing(false);
        }
    };

    return {isProcessing, copyImage};
};

// Sub-components

type BannerProps = {
    bannerImageSrc?: string
    avatarImageSrc?: string
    account?: Account
    siteTitle?: string
    backgroundColor: BackgroundColor
    accentColor?: string
    cardBackgroundColor: string
    isScreenshot: boolean
}

const CardBanner: React.FC<BannerProps> = ({
    bannerImageSrc,
    avatarImageSrc,
    account,
    siteTitle,
    backgroundColor,
    accentColor,
    cardBackgroundColor,
    isScreenshot
}) => {
    const gradientColor = getBannerGradientColor(backgroundColor, accentColor);

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
                    style={{background: `linear-gradient(to bottom, ${hexToRgba(gradientColor, 1)}, ${hexToRgba(gradientColor, 0.5)})`}}
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
    );
};

type HandleBoxProps = {
    handle?: string
    backgroundColor: BackgroundColor
    accentColor?: string
    isScreenshot: boolean
    onCopy: () => void
    copied: boolean
}

const HandleBox: React.FC<HandleBoxProps> = ({handle, backgroundColor, accentColor, isScreenshot, onCopy, copied}) => (
    <div
        className={`mt-auto flex max-h-[60px] min-h-12 w-full items-center justify-center break-all rounded-full border px-4 py-2 font-medium leading-7 ${isScreenshot && 'tracking-normal'}`}
        style={getHandleBoxStyles(backgroundColor, accentColor)}
    >
        <div className='mb-0.5'>
            {handle}
            {!isScreenshot && handle && (
                <Button
                    className='relative top-[3px] ml-1.5 size-4 p-0 hover:opacity-80'
                    style={{color: backgroundColor !== 'light' ? '#fff' : accentColor}}
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
    const {copied, copyText} = useClipboardCopy();

    const cardBackgroundColor = getBackgroundColor(backgroundColor, accentColor);
    const textColor = getTextColor(backgroundColor);
    const margin = isScreenshot ? 'm-12' : 'm-16 max-sm:m-8';
    const borderClass = isScreenshot ? '' : 'shadow-xl';
    const cardWidth = format === 'square' ? 'w-[422px]' : 'w-[316px]';
    const hasAvatar = Boolean(account?.avatarUrl || publicationIcon);

    const bannerImageSrc = isScreenshot && bannerDataUrl ? bannerDataUrl : (account?.bannerImageUrl || coverImage);
    const avatarImageSrc = isScreenshot && avatarDataUrl ? avatarDataUrl : (account?.avatarUrl || publicationIcon);

    return (
        <div
            className={`relative z-20 flex flex-col ${margin} ${cardWidth} h-[422px] rounded-[32px] ${borderClass}`}
            style={{backgroundColor: cardBackgroundColor}}
        >
            <CardBanner
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
                <H2 className={isScreenshot ? 'tracking-normal' : ''} style={{color: textColor}}>
                    {!isLoading ? account?.name : <Skeleton className='w-32' />}
                </H2>
                <span className={`mt-1.5 leading-7 ${isScreenshot && 'tracking-normal'}`} style={{color: textColor}}>
                    {!isLoading
                        ? 'Available on Ghost, Flipboard, Threads, Bluesky, Mastodon, or wherever you get your social web feeds.'
                        : <Skeleton className='w-28' />
                    }
                </span>
                <HandleBox
                    accentColor={accentColor}
                    backgroundColor={backgroundColor}
                    copied={copied}
                    handle={account?.handle}
                    isScreenshot={isScreenshot}
                    onCopy={() => account?.handle && copyText(account.handle)}
                />
            </div>
        </div>
    );
});

ProfileCard.displayName = 'ProfileCard';

// Social share links

type SocialLink = {
    href: string
    icon: React.ReactNode
    label: string
}

const SocialShareLinks: React.FC<{shareText: string}> = ({shareText}) => {
    const links: SocialLink[] = [
        {
            label: 'X',
            href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
            icon: (
                <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path className="social-x_svg__x" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126