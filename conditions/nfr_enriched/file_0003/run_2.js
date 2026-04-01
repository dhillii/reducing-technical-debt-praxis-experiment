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

// Utility: Convert hex color to rgba format
const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Utility: Get background color based on theme
const getBackgroundColorValue = (backgroundColor: BackgroundColorType, accentColor?: string): string => {
    switch (backgroundColor) {
    case 'light':
        return '#fff';
    case 'dark':
        return '#15171a';
    case 'accent':
        return accentColor || '#15171a';
    default:
        return '#fff';
    }
};

// Utility: Get text color based on theme
const getTextColorValue = (backgroundColor: BackgroundColorType): string => {
    switch (backgroundColor) {
    case 'light':
        return '#15171a';
    case 'dark':
        return '#fff';
    case 'accent':
        return '#fff';
    default:
        return '#15171a';
    }
};

// Utility: Get gradient background based on theme
const getGradientBackground = (backgroundColor: BackgroundColorType, accentColor?: string): string => {
    switch (backgroundColor) {
    case 'light':
        return `linear-gradient(to bottom left, #EBEEF0, ${hexToRgba('#EBEEF0', 0)})`;
    case 'dark':
        return `linear-gradient(to bottom left, ${hexToRgba('#1A1E22', 1)}, ${hexToRgba('#343C48', 1)})`;
    case 'accent':
        return `linear-gradient(to bottom left, ${hexToRgba(accentColor || '#15171a', 0.08)}, ${hexToRgba(accentColor || '#15171a', 0.06)})`;
    default:
        return `linear-gradient(to bottom left, #EBEEF0, ${hexToRgba('#EBEEF0', 0)})`;
    }
};

// Utility: Get dots pattern color based on theme
const getDotsPatternColorValue = (backgroundColor: BackgroundColorType): string => {
    switch (backgroundColor) {
    case 'light':
        return hexToRgba('#15171a', 0.025);
    case 'dark':
        return hexToRgba('#15171a', 0.23);
    case 'accent':
        return 'rgba(0, 0, 0, 0.02)';
    default:
        return hexToRgba('#15171a', 0.025);
    }
};

// Component: Banner section with image or gradient
const ProfileCardBanner = memo(({
    bannerImageSrc,
    account,
    backgroundColor,
    accentColor,
    isScreenshot
}: {
    bannerImageSrc?: string
    account?: Account
    backgroundColor: BackgroundColorType
    accentColor?: string
    isScreenshot: boolean
}) => {
    const gradientColor = backgroundColor === 'accent' ? '#ffffff' : accentColor || '#15171a';
    const patternColor = backgroundColor === 'accent' ? hexToRgba(accentColor || '#15171a', 0.2) : 'rgba(255, 255, 255, 0.2)';
    const patternOffset = isScreenshot ? '-42px' : '-84px';

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
                <div className='relative size-full overflow-hidden rounded-[26px] rounded-b-none' style={{background: `linear-gradient(to bottom, ${hexToRgba(gradientColor, 1)}, ${hexToRgba(gradientColor, 0.5)})`}}>
                    <DotsPattern className='absolute' style={{color: patternColor, top: patternOffset, left: isScreenshot ? '-69px' : '-138px'}} />
                </div>
            )}
        </div>
    );
});

ProfileCardBanner.displayName = 'ProfileCardBanner';

// Component: Avatar section
const ProfileCardAvatar = memo(({
    avatarImageSrc,
    account,
    siteTitle,
    cardBackgroundColor
}: {
    avatarImageSrc?: string
    account?: Account
    siteTitle?: string
    cardBackgroundColor: string
}) => {
    if (!avatarImageSrc) {
        return null;
    }

    return (
        <div className='absolute bottom-0 left-1/2 -mb-8 -translate-x-1/2 rounded-full border-8 [&>div]:!size-16 [&_img]:!size-16' style={{borderColor: cardBackgroundColor}}>
            <APAvatar
                author={{
                    icon: {url: avatarImageSrc},
                    name: account?.name || siteTitle || '',
                    handle: account?.handle
                }}
                size='md'
            />
        </div>
    );
});

ProfileCardAvatar.displayName = 'ProfileCardAvatar';

// Component: Handle display with copy button
const ProfileCardHandle = memo(({
    account,
    backgroundColor,
    accentColor,
    isScreenshot,
    onCopy
}: {
    account?: Account
    backgroundColor: BackgroundColorType
    accentColor?: string
    isScreenshot: boolean
    onCopy: () => void
}) => {
    const [copied, setCopied] = useState(false);
    const copyTimeoutRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (copyTimeoutRef.current) {
            window.clearTimeout(copyTimeoutRef.current);
        }
    }, []);

    const handleCopyClick = async () => {
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

    const textColor = backgroundColor !== 'light' ? '#fff' : accentColor;
    const borderColor = accentColor ? hexToRgba(backgroundColor === 'accent' ? '#ffffff' : accentColor, backgroundColor !== 'light' ? 0.7 : 0.2) : undefined;
    const backgroundGradient = accentColor ? `linear-gradient(to top right, ${hexToRgba(backgroundColor === 'accent' ? '#ffffff' : accentColor, backgroundColor === 'dark' ? 0.12 : 0.04)}, ${hexToRgba(backgroundColor === 'accent' ? '#ffffff' : accentColor, backgroundColor === 'dark' ? 0.48 : 0.16)})` : undefined;

    return (
        <div
            className={`mt-auto flex max-h-[60px] min-h-12 w-full items-center justify-center break-all rounded-full border px-4 py-2 font-medium leading-7 ${isScreenshot && 'tracking-normal'}`}
            style={{
                color: textColor,
                borderColor,
                background: backgroundGradient
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
                        onClick={handleCopyClick}
                    >
                        {!copied ? <LucideIcon.Copy size={12} /> : <LucideIcon.Check size={12} />}
                    </Button>
                )}
            </div>
        </div>
    );
});

ProfileCardHandle.displayName = 'ProfileCardHandle';

// Component: Profile card content section
const ProfileCardContent = memo(({
    account,
    isLoading,
    backgroundColor,
    accentColor,
    isScreenshot,
    publicationIcon
}: {
    account?: Account
    isLoading: boolean
    backgroundColor: BackgroundColorType
    accentColor?: string
    isScreenshot: boolean
    publicationIcon?: string
}) => {
    const textColor = getTextColorValue(backgroundColor);
    const hasAvatar = account?.avatarUrl || publicationIcon;

    return (
        <div className={`flex grow flex-col items-center p-6 ${hasAvatar ? 'pt-9' : 'pt-3'} text-center`}>
            <H2 className={`${isScreenshot && 'tracking-normal'}`} style={{color: textColor}}>
                {!isLoading ? account?.name : <Skeleton className='w-32' />}
            </H2>
            <span className={`mt-1.5 leading-7 ${isScreenshot && 'tracking-normal'}`} style={{color: textColor}}>
                {!isLoading ? 'Available on Ghost, Flipboard, Threads, Bluesky, Mastodon, or wherever you get your social web feeds.' : <Skeleton className='w-28' />}
            </span>
            <ProfileCardHandle
                account={account}
                accentColor={accentColor}
                backgroundColor={backgroundColor}
                isScreenshot={isScreenshot}
                onCopy={() => {}}
            />
        </div>
    );
});

ProfileCardContent.displayName = 'ProfileCardContent';

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
    const cardBackgroundColor = getBackgroundColorValue(backgroundColor, accentColor);
    const margin = isScreenshot ? 'm-12' : 'm-16 max-sm:m-8';
    const borderClass = isScreenshot ? '' : 'shadow-xl';
    const cardWidth = format === 'square' ? 'w-[422px]' : 'w-[316px]';
    const cardHeight = 'h-[422px]';

    const bannerImageSrc = isScreenshot && bannerDataUrl ? bannerDataUrl : (account?.bannerImageUrl || coverImage);
    const avatarImageSrc = isScreenshot && avatarDataUrl ? avatarDataUrl : (account?.avatarUrl || publicationIcon);

    return (
        <div className={`relative z-20 flex flex-col ${margin} ${cardWidth} ${cardHeight} rounded-[32px] ${borderClass}`} style={{backgroundColor: cardBackgroundColor}}>
            <ProfileCardBanner
                account={account}
                accentColor={accentColor}
                backgroundColor={backgroundColor}
                bannerImageSrc={bannerImageSrc}
                isScreenshot={isScreenshot}
            />
            <ProfileCardAvatar
                account={account}
                avatarImageSrc={avatarImageSrc}
                cardBackgroundColor={cardBackgroundColor}
                siteTitle={siteTitle}
            />
            <ProfileCardContent
                account={account}
                accentColor={accentColor}
                backgroundColor={backgroundColor}
                isLoading={isLoading}
                isScreenshot={isScreenshot}
                publicationIcon={publicationIcon}
            />
        </div>
    );
});

ProfileCard.displayName = 'ProfileCard';

// Component: Background color toggle controls
const BackgroundColorToggle = memo(({
    backgroundColor,
    accentColor,
    onChange
}: {
    backgroundColor: BackgroundColorType
    accentColor?: string
    onChange: (value: BackgroundColorType) => void
}) => (
    <ToggleGroup defaultValue='light' type='single' value={backgroundColor} onValueChange={(value) => {
        if (value) {
            onChange(value as BackgroundColorType);
        }
    }}>
        <Tooltip>
            <TooltipTrigger>
                <ToggleGroupItem aria-label='Light' value='light'>
                    <div className='size-4 rounded-full border border-gray-500 dark:border-0 dark:bg-white' />
                </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>Light</TooltipContent>
        </Tooltip>
        <Tooltip>
            <TooltipTrigger>
                <ToggleGroupItem aria-label='Dark' value='dark'>
                    <div className='size-4 rounded-full bg-black dark:border dark:border-gray-700 dark:bg-transparent' />
                </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>Dark</TooltipContent>
        </Tooltip>
        <Tooltip>
            <TooltipTrigger>
                <ToggleGroupItem aria-label='Accent color' value='accent'>
                    <div className='size-4 rounded-full' style={{backgroundColor: accentColor}} />
                </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>Accent color</TooltipContent>
        </Tooltip>
    </ToggleGroup>
));

BackgroundColorToggle.displayName = 'BackgroundColorToggle';

// Component: Card format toggle controls
const CardFormatToggle = memo(({
    cardFormat,
    onChange
}: {
    cardFormat: 'vertical' | 'square'
    onChange: (value: 'vertical' | 'square') => void
}) => (
    <ToggleGroup defaultValue='vertical' type='single' value={cardFormat} onValueChange={(value) => {
        if (value) {
            onChange(value as 'vertical' | 'square');
        }
    }}>
        <Tooltip>
            <TooltipTrigger>
                <ToggleGroupItem aria