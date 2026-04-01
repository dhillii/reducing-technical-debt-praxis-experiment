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

/** Maps background color to CSS color value */
const backgroundColorMap: Record<BackgroundColorType, (accentColor?: string) => string> = {
    light: () => '#fff',
    dark: () => '#15171a',
    accent: (accentColor?: string) => accentColor || '#15171a'
};

/** Maps background color to text color value */
const textColorMap: Record<BackgroundColorType, string> = {
    light: '#15171a',
    dark: '#fff',
    accent: '#fff'
};

/** Maps background color to gradient background */
const gradientMap: Record<BackgroundColorType, (accentColor?: string) => string> = {
    light: () => `linear-gradient(to bottom left, #EBEEF0, ${hexToRgba('#EBEEF0', 0)})`,
    dark: () => `linear-gradient(to bottom left, ${hexToRgba('#1A1E22', 1)}, ${hexToRgba('#343C48', 1)})`,
    accent: (accentColor?: string) => `linear-gradient(to bottom left, ${hexToRgba(accentColor || '#15171a', 0.08)}, ${hexToRgba(accentColor || '#15171a', 0.06)})`
};

/** Maps background color to dots pattern color */
const dotsPatternColorMap: Record<BackgroundColorType, (accentColor?: string) => string> = {
    light: () => hexToRgba('#15171a', 0.025),
    dark: () => hexToRgba('#15171a', 0.23),
    accent: () => 'rgba(0, 0, 0, 0.02)'
};

/** Gets background color for the given background color type */
const getBackgroundColor = (backgroundColor: BackgroundColorType, accentColor?: string): string => {
    return backgroundColorMap[backgroundColor](accentColor);
};

/** Gets text color for the given background color type */
const getTextColor = (backgroundColor: BackgroundColorType): string => {
    return textColorMap[backgroundColor];
};

/** Gets gradient for the given background color type */
const getGradient = (backgroundColor: BackgroundColorType, accentColor?: string): string => {
    return gradientMap[backgroundColor](accentColor);
};

/** Gets dots pattern color for the given background color type */
const getDotsPatternColor = (backgroundColor: BackgroundColorType, accentColor?: string): string => {
    return dotsPatternColorMap[backgroundColor](accentColor);
};

/** Determines if accent color should be used for banner gradient */
const shouldUseAccentForBanner = (backgroundColor: BackgroundColorType): boolean => {
    return backgroundColor === 'accent';
};

/** Gets the appropriate color for banner gradient */
const getBannerGradientColor = (backgroundColor: BackgroundColorType, accentColor?: string): string => {
    return shouldUseAccentForBanner(backgroundColor) ? '#ffffff' : (accentColor || '#15171a');
};

/** Gets the appropriate color for handle button text */
const getHandleButtonTextColor = (backgroundColor: BackgroundColorType, accentColor?: string): string => {
    return backgroundColor !== 'light' ? '#fff' : accentColor || '#000';
};

/** Gets the appropriate border color for handle button */
const getHandleButtonBorderColor = (backgroundColor: BackgroundColorType, accentColor?: string): string | undefined => {
    return accentColor ? hexToRgba(
        shouldUseAccentForBanner(backgroundColor) ? '#ffffff' : accentColor,
        backgroundColor !== 'light' ? 0.7 : 0.2
    ) : undefined;
};

/** Gets the appropriate background gradient for handle button */
const getHandleButtonBackground = (backgroundColor: BackgroundColorType, accentColor?: string): string | undefined => {
    return accentColor ? `linear-gradient(to top right, ${hexToRgba(
        shouldUseAccentForBanner(backgroundColor) ? '#ffffff' : accentColor,
        backgroundColor === 'dark' ? 0.12 : 0.04
    )}, ${hexToRgba(
        shouldUseAccentForBanner(backgroundColor) ? '#ffffff' : accentColor,
        backgroundColor === 'dark' ? 0.48 : 0.16
    )})` : undefined;
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
                        <DotsPattern className='absolute' style={{color: shouldUseAccentForBanner(backgroundColor) ? hexToRgba(accentColor || '#15171a', 0.2) : 'rgba(255, 255, 255, 0.2)', top: isScreenshot ? '-42px' : '-84px', left: isScreenshot ? '-69px' : '-138px'}} />
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
                        color: getHandleButtonTextColor(backgroundColor, accentColor),
                        borderColor: getHandleButtonBorderColor(backgroundColor, accentColor),
                        background: getHandleButtonBackground(backgroundColor, accentColor)
                    }}
                >
                    <div className='mb-0.5'>
                        {account?.handle}
                        {!isScreenshot && account?.handle && (
                            <Button
                                className='relative top-[3px] ml-1.5 size-4 p-0 hover:opacity-80'
                                style={{color: getHandleButtonTextColor(backgroundColor, accentColor)}}
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

    /** Generates canvas blob from profile card element */
    const generateCanvasBlob = async (): Promise<Blob> => {
        return new Promise<Blob>(async (resolve, reject) => {
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

    /** Checks if clipboard API is available */
    const isClipboardAvailable = (): boolean => {
        return !!(navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined');
    };

    /** Waits for next animation frame */
    const waitForNextFrame = (): Promise<void> => {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(resolve);
            });
        });
    };

    const handleCopy = async () => {
        if (!profileCardRef.current || isProcessing) {
            return;
        }

        setIsProcessing(true);

        // Wait for the next frame to ensure