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

type BackgroundColorType = 'light' | 'dark' | 'accent';

const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Strategy object for background color configurations */
const backgroundColorStrategies: Record<BackgroundColorType, {bg: string; text: string}> = {
    light: {bg: '#fff', text: '#15171a'},
    dark: {bg: '#15171a', text: '#fff'},
    accent: {bg: '', text: '#fff'} // bg computed dynamically
};

/** Get background color based on theme */
const getBackgroundColor = (backgroundColor: BackgroundColorType, accentColor?: string): string => {
    if (backgroundColor === 'accent') {
        return accentColor || '#15171a';
    }
    return backgroundColorStrategies[backgroundColor].bg;
};

/** Get text color based on theme */
const getTextColor = (backgroundColor: BackgroundColorType): string => {
    return backgroundColorStrategies[backgroundColor].text;
};

/** Strategy object for gradient configurations */
const gradientStrategies: Record<BackgroundColorType, (accentColor?: string) => string> = {
    light: () => `linear-gradient(to bottom left, #EBEEF0, ${hexToRgba('#EBEEF0', 0)})`,
    dark: () => `linear-gradient(to bottom left, ${hexToRgba('#1A1E22', 1)}, ${hexToRgba('#343C48', 1)})`,
    accent: (accentColor?: string) => `linear-gradient(to bottom left, ${hexToRgba(accentColor || '#15171a', 0.08)}, ${hexToRgba(accentColor || '#15171a', 0.06)})`
};

/** Get gradient based on background color */
const getGradient = (backgroundColor: BackgroundColorType, accentColor?: string): string => {
    return gradientStrategies[backgroundColor](accentColor);
};

/** Strategy object for dots pattern color configurations */
const dotsPatternColorStrategies: Record<BackgroundColorType, (accentColor?: string) => string> = {
    light: () => hexToRgba('#15171a', 0.025),
    dark: () => hexToRgba('#15171a', 0.23),
    accent: () => 'rgba(0, 0, 0, 0.02)'
};

/** Get dots pattern color based on background color */
const getDotsPatternColor = (backgroundColor: BackgroundColorType, accentColor?: string): string => {
    return dotsPatternColorStrategies[backgroundColor](accentColor);
};

/** Determine if accent color should be used for gradient/pattern */
const shouldUseAccentForGradient = (backgroundColor: BackgroundColorType): boolean => {
    return backgroundColor === 'accent';
};

/** Get gradient color for banner fallback */
const getBannerGradientColor = (backgroundColor: BackgroundColorType, accentColor?: string): string => {
    return shouldUseAccentForGradient(backgroundColor) ? '#ffffff' : (accentColor || '#15171a');
};

/** Get pattern color opacity for banner fallback */
const getBannerPatternColor = (backgroundColor: BackgroundColorType, accentColor?: string): string => {
    return shouldUseAccentForGradient(backgroundColor) 
        ? hexToRgba(accentColor || '#15171a', 0.2)
        : 'rgba(255, 255, 255, 0.2)';
};

/** Get handle display color based on background */
const getHandleDisplayColor = (backgroundColor: BackgroundColorType, accentColor?: string): string => {
    return backgroundColor !== 'light' ? '#fff' : (accentColor || '#15171a');
};

/** Get handle border color with opacity */
const getHandleBorderColor = (backgroundColor: BackgroundColorType, accentColor?: string): string | undefined => {
    if (!accentColor) return undefined;
    const opacity = backgroundColor !== 'light' ? 0.7 : 0.2;
    return hexToRgba(shouldUseAccentForGradient(backgroundColor) ? '#ffffff' : accentColor, opacity);
};

/** Get handle background gradient */
const getHandleBackgroundGradient = (backgroundColor: BackgroundColorType, accentColor?: string): string | undefined => {
    if (!accentColor) return undefined;
    const color = shouldUseAccentForGradient(backgroundColor) ? '#ffffff' : accentColor;
    const startOpacity = backgroundColor === 'dark' ? 0.12 : 0.04;
    const endOpacity = backgroundColor === 'dark' ? 0.48 : 0.16;
    return `linear-gradient(to top right, ${hexToRgba(color, startOpacity)}, ${hexToRgba(color, endOpacity)})`;
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

    const cardBackgroundColor = getBackgroundColor(backgroundColor, accentColor);
    const textColor = getTextColor(backgroundColor);
    const margin = isScreenshot ? 'm-12' : 'm-16 max-sm:m-8';
    const borderClass = isScreenshot ? '' : 'shadow-xl';

    const cardWidth = format === 'square' ? 'w-[422px]' : 'w-[316px]';
    const cardHeight = 'h-[422px]';

    const bannerImageSrc = isScreenshot && bannerDataUrl ? bannerDataUrl : (account?.bannerImageUrl || coverImage);
    const avatarImageSrc = isScreenshot && avatarDataUrl ? avatarDataUrl : (account?.avatarUrl || publicationIcon);

    const bannerGradientColor = getBannerGradientColor(backgroundColor, accentColor);
    const bannerPatternColor = getBannerPatternColor(backgroundColor, accentColor);
    const handleDisplayColor = getHandleDisplayColor(backgroundColor, accentColor);
    const handleBorderColor = getHandleBorderColor(backgroundColor, accentColor);
    const handleBackgroundGradient = getHandleBackgroundGradient(backgroundColor, accentColor);

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
                    <div className='relative size-full overflow-hidden rounded-[26px] rounded-b-none' style={{background: `linear-gradient(to bottom, ${hexToRgba(bannerGradientColor, 1)}, ${hexToRgba(bannerGradientColor, 0.5)})`}}>
                        <DotsPattern className='absolute' style={{color: bannerPatternColor, top: isScreenshot ? '-42px' : '-84px', left: isScreenshot ? '-69px' : '-138px'}} />
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
                        color: handleDisplayColor,
                        borderColor: handleBorderColor,
                        background: handleBackgroundGradient
                    }}
                >
                    <div className='mb-0.5'>
                        {account?.handle}
                        {!isScreenshot && account?.handle && (
                            <Button
                                className='relative top-[3px] ml-1.5 size-4 p-0 hover:opacity-80'
                                style={{color: handleDisplayColor}}
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

/** Validate clipboard API availability */
const isClipboardApiAvailable = (): boolean => {
    return !!(navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined');
};

/** Create blob from canvas */
const createBlobFromCanvas = (canvas: HTMLCanvasElement): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Failed to create blob'));
            }
        }, 'image/png');
    });
};

/** Render profile card to canvas and copy to clipboard */
const copyProfileCardToClipboard = async (profileCardRef: React.RefObject<HTMLDivElement>): Promise<void> => {
    if (!profileCardRef.current) {
        throw new Error('Profile card reference not available');
    }

    const canvas = await html2canvas(profileCardRef.current, {
        backgroundColor: 'transparent',
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 0
    });

    const blob = await createBlobFromCanvas(canvas);
    const clipboardItem = new ClipboardItem({'image/png': Promise.resolve(blob)});
    await navigator.clipboard.write([clipboardItem]);
};

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

        const convert = async