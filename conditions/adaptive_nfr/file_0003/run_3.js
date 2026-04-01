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

/** Converts hex color to rgba format */
const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Color scheme configuration for different background types */
const colorSchemes: Record<BackgroundColorType, {bg: string; text: string}> = {
    light: {bg: '#fff', text: '#15171a'},
    dark: {bg: '#15171a', text: '#fff'},
    accent: {bg: '#15171a', text: '#fff'}
};

/** Resolves background color based on type and accent color */
const resolveBackgroundColor = (backgroundColor: BackgroundColorType, accentColor?: string): string => {
    if (backgroundColor === 'accent') {
        return accentColor || colorSchemes.accent.bg;
    }
    return colorSchemes[backgroundColor].bg;
};

/** Resolves text color based on background type */
const resolveTextColor = (backgroundColor: BackgroundColorType): string => {
    return colorSchemes[backgroundColor].text;
};

/** Gradient configuration for different background types */
const gradientSchemes: Record<BackgroundColorType, (accentColor?: string) => string> = {
    light: () => `linear-gradient(to bottom left, #EBEEF0, ${hexToRgba('#EBEEF0', 0)})`,
    dark: () => `linear-gradient(to bottom left, ${hexToRgba('#1A1E22', 1)}, ${hexToRgba('#343C48', 1)})`,
    accent: (accentColor?: string) => `linear-gradient(to bottom left, ${hexToRgba(accentColor || '#15171a', 0.08)}, ${hexToRgba(accentColor || '#15171a', 0.06)})`
};

/** Dots pattern color configuration */
const dotsPatternColors: Record<BackgroundColorType, string> = {
    light: hexToRgba('#15171a', 0.025),
    dark: hexToRgba('#15171a', 0.23),
    accent: 'rgba(0, 0, 0, 0.02)'
};

/** Determines banner gradient color based on background type */
const getBannerGradientColor = (backgroundColor: BackgroundColorType, accentColor?: string): string => {
    return backgroundColor === 'accent' ? '#ffffff' : (accentColor || '#15171a');
};

/** Determines if accent color should be used for banner */
const shouldUseAccentForBanner = (backgroundColor: BackgroundColorType): boolean => {
    return backgroundColor === 'accent';
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

    const cardBackgroundColor = resolveBackgroundColor(backgroundColor, accentColor);
    const textColor = resolveTextColor(backgroundColor);
    const margin = isScreenshot ? 'm-12' : 'm-16 max-sm:m-8';
    const borderClass = isScreenshot ? '' : 'shadow-xl';

    const cardWidth = format === 'square' ? 'w-[422px]' : 'w-[316px]';
    const cardHeight = 'h-[422px]';

    const bannerImageSrc = isScreenshot && bannerDataUrl ? bannerDataUrl : (account?.bannerImageUrl || coverImage);
    const avatarImageSrc = isScreenshot && avatarDataUrl ? avatarDataUrl : (account?.avatarUrl || publicationIcon);

    const bannerGradientColor = getBannerGradientColor(backgroundColor, accentColor);
    const useAccentForBanner = shouldUseAccentForBanner(backgroundColor);

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
                        <DotsPattern className='absolute' style={{color: useAccentForBanner ? hexToRgba(accentColor || '#15171a', 0.2) : 'rgba(255, 255, 255, 0.2)', top: isScreenshot ? '-42px' : '-84px', left: isScreenshot ? '-69px' : '-138px'}} />
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
                <HandleDisplay
                    isScreenshot={isScreenshot}
                    account={account}
                    backgroundColor={backgroundColor}
                    accentColor={accentColor}
                    onCopy={handleCopy}
                    copied={copied}
                />
            </div>
        </div>
    );
});

ProfileCard.displayName = 'ProfileCard';

/** Renders the handle display section with copy button */
const HandleDisplay: React.FC<{
    isScreenshot: boolean;
    account?: Account;
    backgroundColor: BackgroundColorType;
    accentColor?: string;
    onCopy: () => void;
    copied: boolean;
}> = ({isScreenshot, account, backgroundColor, accentColor, onCopy, copied}) => {
    const isLightBg = backgroundColor === 'light';
    const textColor = isLightBg ? accentColor : '#fff';
    const borderColor = accentColor ? hexToRgba(
        shouldUseAccentForBanner(backgroundColor) ? '#ffffff' : accentColor,
        isLightBg ? 0.2 : 0.7
    ) : undefined;
    const bgGradient = accentColor ? `linear-gradient(to top right, ${hexToRgba(
        shouldUseAccentForBanner(backgroundColor) ? '#ffffff' : accentColor,
        backgroundColor === 'dark' ? 0.12 : 0.04
    )}, ${hexToRgba(
        shouldUseAccentForBanner(backgroundColor) ? '#ffffff' : accentColor,
        backgroundColor === 'dark' ? 0.48 : 0.16
    )})` : undefined;

    return (
        <div
            className={`mt-auto flex max-h-[60px] min-h-12 w-full items-center justify-center break-all rounded-full border px-4 py-2 font-medium leading-7 ${isScreenshot && 'tracking-normal'}`}
            style={{
                color: textColor,
                borderColor,
                background: bgGradient
            }}
        >
            <div className='mb-0.5'>
                {account?.handle}
                {!isScreenshot && account?.handle && (
                    <Button
                        className='relative top-[3px] ml-1.5 size-4 p-0 hover:opacity-80'
                        style={{color: textColor}}
                        title='Copy handle'
                        variant='link'
                        onClick={onCopy}
                    >
                        {!copied ?
                            <LucideIcon.Copy size={12} /> :
                            <LucideIcon.Check size={12} />
                        }
                    </Button>
                )}
            </div>
        </div>
    );
};

/** Generates canvas blob from profile card element */
const generateCardBlob = async (element: HTMLElement): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        html2canvas(element, {
            backgroundColor: 'transparent',
            scale: 2,
            logging: false,
            useCORS: true,
            allowTaint: true,
            imageTimeout: 0
        }).then((canvas) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to create blob'));
                }
            }, 'image/png');
        }).catch(reject);
    });
};

/** Copies image to clipboard using Clipboard API */
const copyImageToClipboard = async (blob: Blob): Promise<void> => {
    if (!navigator.clipboard || !('write' in navigator.clipboard) || typeof ClipboardItem === 'undefined') {
        throw new Error('Clipboard API not supported in this browser');
    }

    const clipboardItem = new ClipboardItem({
        'image/png': Promise.resolve(blob)
    });

    await navigator.clipboard.write([clipboardItem]);
};

const Profile: React.FC<ProfileProps> = ({account, isLoading}) => {
    const {data: siteData} = useBrowseSite();
    const accentColor = siteData?.site?.accent_color;
    const coverImage = siteData?.site?.cover_image;
    const publicationIcon = siteData?.site?.icon;
    const profileCardRef = useRef<HTMLDivElement>(null);
    const [backgroundColor, setBackgroundColor] = useState<BackgroundColorType>('light');
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
        const gradientFn = gradientSchemes[backgroundColor];
        return gradientFn(accentColor);
    };

    const getDotsPatternColor = () => {
        return dotsPatternColors[backgroundColor];
    };

    const handleCopy = async () => {
        if (!profileCardRef.current || isProcessing) {
            return;
        }

        setIsProcessing(true);

        // Wait for the next frame to ensure the loading indicator is painted
        await new Promise((resolve) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(resolve);
            });
        });

        try {
            const blob = await generateCardBlob(profileCardRef.current);
            await copyImageToClipboard(blob);
            toast