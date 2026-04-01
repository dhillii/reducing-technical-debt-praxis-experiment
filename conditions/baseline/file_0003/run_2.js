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

type ProfileProps = {
    account?: Account
    isLoading: boolean
}

type ProfileCardProps = {
    isScreenshot?: boolean
    format?: 'vertical' | 'square'
    account?: Account
    isLoading: boolean
    bannerDataUrl: string | null
    avatarDataUrl: string | null
    coverImage?: string
    publicationIcon?: string
    siteTitle?: string
    backgroundColor: 'light' | 'dark' | 'accent'
    accentColor?: string
}

const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const COLOR_MAP = {
    light: {background: '#fff', text: '#15171a'},
    dark: {background: '#15171a', text: '#fff'},
    accent: {background: 'accent', text: '#fff'}
} as const;

const getColorConfig = (backgroundColor: 'light' | 'dark' | 'accent', accentColor?: string) => {
    if (backgroundColor === 'accent') {
        return {background: accentColor || '#15171a', text: '#fff'};
    }
    return COLOR_MAP[backgroundColor];
};

const GRADIENT_MAP = {
    light: `linear-gradient(to bottom left, #EBEEF0, ${hexToRgba('#EBEEF0', 0)})`,
    dark: `linear-gradient(to bottom left, ${hexToRgba('#1A1E22', 1)}, ${hexToRgba('#343C48', 1)})`,
    accent: (accentColor?: string) => `linear-gradient(to bottom left, ${hexToRgba(accentColor || '#15171a', 0.08)}, ${hexToRgba(accentColor || '#15171a', 0.06)})`
} as const;

const DOTS_PATTERN_COLOR_MAP = {
    light: hexToRgba('#15171a', 0.025),
    dark: hexToRgba('#15171a', 0.23),
    accent: 'rgba(0, 0, 0, 0.02)'
} as const;

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
    const [copied, setCopied] = useState(false);
    const copyTimeoutRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (copyTimeoutRef.current) {
            window.clearTimeout(copyTimeoutRef.current);
        }
    }, []);

    const handleCopy = async () => {
        if (!account?.handle || !navigator?.clipboard?.writeText) {
            toast.error('Unable to copy handle');
            return;
        }
        try {
            await navigator.clipboard.writeText(account.handle);
            setCopied(true);
            toast.success('Handle copied');
            if (copyTimeoutRef.current) {
                window.clearTimeout(copyTimeoutRef.current);
            }
            copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy handle');
            setCopied(false);
        }
    };

    const colorConfig = getColorConfig(backgroundColor, accentColor);
    const cardBackgroundColor = colorConfig.background;
    const textColor = colorConfig.text;
    const margin = isScreenshot ? 'm-12' : 'm-16 max-sm:m-8';
    const borderClass = isScreenshot ? '' : 'shadow-xl';
    const cardWidth = format === 'square' ? 'w-[422px]' : 'w-[316px]';
    const cardHeight = 'h-[422px]';

    const bannerImageSrc = isScreenshot && bannerDataUrl ? bannerDataUrl : (account?.bannerImageUrl || coverImage);
    const avatarImageSrc = isScreenshot && avatarDataUrl ? avatarDataUrl : (account?.avatarUrl || publicationIcon);

    const bannerGradientColor = backgroundColor === 'accent' ? '#ffffff' : accentColor || '#15171a';
    const bannerGradient = `linear-gradient(to bottom, ${hexToRgba(bannerGradientColor, 1)}, ${hexToRgba(bannerGradientColor, 0.5)})`;
    const dotsPatternColor = backgroundColor === 'accent' ? hexToRgba(accentColor || '#15171a', 0.2) : 'rgba(255, 255, 255, 0.2)';

    const handleBorderColor = backgroundColor !== 'light' ? '#fff' : accentColor;
    const handleBorderColorRgba = accentColor ? hexToRgba(backgroundColor === 'accent' ? '#ffffff' : accentColor, backgroundColor !== 'light' ? 0.7 : 0.2) : undefined;
    const handleGradient = accentColor ? `linear-gradient(to top right, ${hexToRgba(backgroundColor === 'accent' ? '#ffffff' : accentColor, backgroundColor === 'dark' ? 0.12 : 0.04)}, ${hexToRgba(backgroundColor === 'accent' ? '#ffffff' : accentColor, backgroundColor === 'dark' ? 0.48 : 0.16)})` : undefined;

    return (
        <div className={`relative z-20 flex flex-col ${margin} ${cardWidth} ${cardHeight} rounded-[32px] ${borderClass} ${format === 'square' ? 'flex flex-col' : ''}`} style={{backgroundColor: cardBackgroundColor}}>
            <div className='relative h-48 p-2'>
                {bannerImageSrc ?
                    <img
                        alt={account?.name}
                        className='size-full rounded-[26px] rounded-b-none object-cover'
                        referrerPolicy='no-referrer'
                        src={bannerImageSrc}
                    /> :
                    <div className='relative size-full overflow-hidden rounded-[26px] rounded-b-none' style={{background: bannerGradient}}>
                        <DotsPattern className='absolute' style={{color: dotsPatternColor, top: isScreenshot ? '-42px' : '-84px', left: isScreenshot ? '-69px' : '-138px'}} />
                    </div>
                }
                {avatarImageSrc &&
                    <div className='absolute bottom-0 left-1/2 -mb-8 -translate-x-1/2 rounded-full border-8 [&>div]:!size-16 [&_img]:!size-16' style={{borderColor: cardBackgroundColor}}>
                        <APAvatar
                            author={
                                {
                                    icon: {
                                        url: avatarImageSrc || ''
                                    },
                                    name: account?.name || siteTitle || '',
                                    handle: account?.handle
                                }
                            }
                            size='md'
                        />
                    </div>
                }
            </div>
            <div className={`flex grow flex-col items-center p-6 ${(account?.avatarUrl || publicationIcon) ? 'pt-9' : 'pt-3'} text-center ${format === 'square' ? 'flex-1 justify-center' : ''}`}>
                <H2 className={`${isScreenshot && 'tracking-normal'}`} style={{color: textColor}}>{!isLoading ? account?.name : <Skeleton className='w-32' />}</H2>
                <span className={`mt-1.5 leading-7 ${isScreenshot && 'tracking-normal'}`} style={{color: textColor}}>{!isLoading ? 'Available on Ghost, Flipboard, Threads, Bluesky, Mastodon, or wherever you get your social web feeds.' : <Skeleton className='w-28' />}</span>
                <div
                    className={`mt-auto flex max-h-[60px] min-h-12 w-full items-center justify-center break-all rounded-full border px-4 py-2 font-medium leading-7 ${isScreenshot && 'tracking-normal'}`}
                    style={{
                        color: handleBorderColor,
                        borderColor: handleBorderColorRgba,
                        background: handleGradient
                    }}
                >
                    <div className='mb-0.5'>
                        {account?.handle}
                        {!isScreenshot && account?.handle && (
                            <Button
                                className='relative top-[3px] ml-1.5 size-4 p-0 hover:opacity-80'
                                style={{color: handleBorderColor}}
                                title='Copy handle'
                                variant='link'
                                onClick={handleCopy}
                            >
                                {!copied ?
                                    <LucideIcon.Copy size={12} /> :
                                    <LucideIcon.Check size={12} />
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

const Profile: React.FC<ProfileProps> = ({account, isLoading}) => {
    const {data: siteData} = useBrowseSite();
    const accentColor = siteData?.site?.accent_color;
    const coverImage = siteData?.site?.cover_image;
    const publicationIcon = siteData?.site?.icon;
    const profileCardRef = useRef<HTMLDivElement>(null);
    const [backgroundColor, setBackgroundColor] = useState<'light' | 'dark' | 'accent'>('light');
    const [cardFormat, setCardFormat] = useState<'vertical' | 'square'>('vertical');
    const [isProcessing, setIsProcessing] = useState(false);
    const [bannerDataUrl, setBannerDataUrl] = useState<string | null>(null);
    const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
    const shareText = `${account?.name} is now available across the social web, on ${account?.handle}`;

    const convertImagesToDataUrls = useCallback(async () => {
        if (account?.bannerImageUrl || coverImage) {
            const bannerUrl = account?.bannerImageUrl || coverImage;
            if (bannerUrl) {
                const dataUrl = await imageUrlToDataUrl(bannerUrl);
                setBannerDataUrl(dataUrl);
            }
        }

        if (account?.avatarUrl || publicationIcon) {
            const avatarUrl = account?.avatarUrl || publicationIcon;
            if (avatarUrl) {
                const dataUrl = await imageUrlToDataUrl(avatarUrl);
                setAvatarDataUrl(dataUrl);
            }
        }
    }, [account?.bannerImageUrl, account?.avatarUrl, coverImage, publicationIcon]);

    useEffect(() => {
        let isMounted = true;

        const convert = async () => {
            await convertImagesToDataUrls();
        };

        if (isMounted) {
            convert();
        }

        return () => {
            isMounted = false;
        };
    }, [convertImagesToDataUrls]);

    const getGradient = () => {
        if (backgroundColor === 'accent') {
            return GRADIENT_MAP.accent(accentColor);
        }
        return GRADIENT_MAP[backgroundColor];
    };

    const getDotsPatternColor = () => {
        return DOTS_PATTERN_COLOR_MAP[backgroundColor];
    };

    const captureCanvasAsBlob = async (): Promise<Blob> => {
        return new Promise(async (resolve, reject) => {
            try {
                const canvas = await html2canvas(profileCardRef.current!, {
                    backgroundColor: 'transparent',
                    scale: 2,
                    logging: false,
                    useCORS: true,
                    allowTaint: true,
                    imageTimeout: 0
                });

                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to create blob'));
                    }
                }, 'image/png');
            } catch (error) {
                reject(error);
            }
        });
    };

    const copyImageToClipboard = async () => {
        try {
            const blob = await captureCanvasAsBlob();
            const clipboardItem = new ClipboardItem({'image/png': Promise.resolve(blob)});
            await navigator.clipboard.write([clipboardItem]);
            toast.success('Image copied to clipboard');
        } catch {
            toast.error('Failed to copy image');
        }
    };

    const handleCopy = async () => {
        if (!profileCardRef.current || isProcessing) {
            return;
        }

        setIsProcessing(true);

        await new Promise((resolve) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(resolve);
            });
        });

        try {
            if (!navigator.clipboard || !('write' in navigator.clipboard) || typeof ClipboardItem === 'undefined') {
                throw new Error('Clipboard API not supported in this browser');
            }

            await copyImageToClipboard();
        } catch {
            toast.error('Failed to copy image');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleBackgroundColorChange = (value: string) => {
        if (value) {
            setBackgroundColor(value as 'light' | 'dark' | 'accent');
        }
    };

    const handleCardFormatChange = (value: string) => {
        if (value) {
            setCardFormat(value as 'vertical' | 'square');
        }
    };

    const cardDimensions = cardFormat === 'square' ? {width: '518px'} : {width: '412px'};
    const shadowImage = cardFormat === 'square' ? ProfileCardShadowSquare : ProfileCardShadow;
    const shadowWidth = cardFormat === 'square' ? '572px' : '466px';

    return (
        <TooltipProvider delayDuration={0}>
            <div className='flex flex-col gap-5'>
                <div className='flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3'>
                    <H2>Share your profile</H2>
                    <div className='flex gap-4'>
                        <ToggleGroup defaultValue='light' type='single' value={backgroundColor} onValueChange={handleBackgroundColorChange}>
                            <Tooltip>
                                <TooltipTrigger>
                                    <ToggleGroupItem aria-label='Light' value='light'>