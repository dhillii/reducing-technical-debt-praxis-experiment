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

/** Background color mapping for card */
const getBackgroundColor = (backgroundColor: 'light' | 'dark' | 'accent', accentColor?: string) => {
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

/** Text color mapping for card */
const getTextColor = (backgroundColor: 'light' | 'dark' | 'accent') => {
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
                    <div className='relative size-full overflow-hidden rounded-[26px] rounded-b-none' style={{background: `linear-gradient(to bottom, ${hexToRgba(backgroundColor === 'accent' ? '#ffffff' : accentColor || '#15171a', 1)}, ${hexToRgba(backgroundColor === 'accent' ? '#ffffff' : accentColor || '#15171a', 0.5)})`}}>
                        <DotsPattern className='absolute' style={{color: backgroundColor === 'accent' ? hexToRgba(accentColor || '#15171a', 0.2) : 'rgba(255, 255, 255, 0.2)', top: isScreenshot ? '-42px' : '-84px', left: isScreenshot ? '-69px' : '-138px'}} />
                    </div>
                }
                {avatarImageSrc &&
                    <div className='absolute bottom-0 left-1/2 -mb-8 -translate-x-1/2 rounded-full border-8 [&>div]:!size-16 [&_img]:!size-16' style={{borderColor: cardBackgroundColor}}>
                        <APAvatar
                            author={{
                                icon: {url: avatarImageSrc || ''},
                                name: account?.name || siteTitle || '',
                                handle: account?.handle
                            }}
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
                        color: backgroundColor !== 'light' ? '#fff' : accentColor,
                        borderColor: accentColor ? hexToRgba(backgroundColor === 'accent' ? '#ffffff' : accentColor, backgroundColor !== 'light' ? 0.7 : 0.2) : undefined,
                        background: accentColor ? `linear-gradient(to top right, ${hexToRgba(backgroundColor === 'accent' ? '#ffffff' : accentColor, backgroundColor === 'dark' ? 0.12 : 0.04)}, ${hexToRgba(backgroundColor === 'accent' ? '#ffffff' : accentColor, backgroundColor === 'dark' ? 0.48 : 0.16)})` : undefined
                    }}
                >
                    <div className='mb-0.5'>
                        {account?.handle}
                        {!isScreenshot && account?.handle && (
                            <Button
                                className='relative top-[3px] ml-1.5 size-4 p-0 hover:opacity-80'
                                style={{color: backgroundColor !== 'light' ? '#fff' : accentColor}}
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

/** Gradient mapping for background colors */
const gradientMap: Record<'light' | 'dark' | 'accent', string> = {
    light: `linear-gradient(to bottom left, #EBEEF0, ${hexToRgba('#EBEEF0', 0)})`,
    dark: `linear-gradient(to bottom left, ${hexToRgba('#1A1E22', 1)}, ${hexToRgba('#343C48', 1)})`,
    accent: `linear-gradient(to bottom left, ${hexToRgba('#15171a', 0.08)}, ${hexToRgba('#15171a', 0.06)})`
};

/** Dots pattern color mapping for background colors */
const dotsPatternColorMap: Record<'light' | 'dark' | 'accent', string> = {
    light: hexToRgba('#15171a', 0.025),
    dark: hexToRgba('#15171a', 0.23),
    accent: 'rgba(0, 0, 0, 0.02)'
};

const getGradient = (backgroundColor: 'light' | 'dark' | 'accent') => gradientMap[backgroundColor] ?? gradientMap.light;
const getDotsPatternColor = (backgroundColor: 'light' | 'dark' | 'accent') => dotsPatternColorMap[backgroundColor] ?? dotsPatternColorMap.light;

/** Social link data */
const socialLinks = [
    {
        name: 'Twitter',
        href: (shareText: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
        icon: (
            <svg aria-hidden="true" viewBox="0 0 24 24"><path className="social-x_svg__x" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>
        )
    },
    {
        name: 'Threads',
        href: (shareText: string) => `https://threads.net/intent/post?text=${encodeURIComponent(shareText)}`,
        icon: (
            <svg fill="none" viewBox="0 0 18 18"><g clipPath="url(#social-threads_svg__clip0_351_18008)"><path d="M13.033 8.38a5.924  ..."></path></g><defs><clipPath id="social-threads_svg__clip0_351_18008"><path d="M0 0h17v17H0z" fill="#fff" transform="translate(.5 .5)"></path></clipPath></defs></svg>
        )
    },
    {
        name: 'Facebook',
        href: () => `https://www.facebook.com/sharer/sharer.php?u=`,
        icon: (
            <svg fill="none" viewBox="0 0 40 40"><title>social-facebook</title><path className="social-facebook_svg__fb" d="M20 40.004c11.046 0 20-8.955 20-20 0-11.046-8.954-20-20-20s-20 8.954-20 20c0 11.045 8.954 20 20 20z" fill="#1977f3"></path><path d="M27.785 25..."></path></svg>
        )
    },
    {
        name: 'LinkedIn',
        href: (shareText: string) => `http://www.linkedin.com/shareArticle?mini=true&title=${encodeURIComponent(shareText)}`,
        icon: (
            <svg fill="none" viewBox="0 0 16 16"><g clipPath="url(#social-linkedin_svg__clip0_537_833)"><path className="social-linkedin_svg__linkedin" clipRule="evenodd" d="M1.778 16h12.444c.982 0 1.778-.796 1.778-1.778V1.778C16 .796 15.204 0 14.222 0H1.778C.796 0 0 .796 0 1.778v12.444C0 15.204.796 16 1.778 16z"></path></g></svg>
        )
    }
] as const;

/** Toggle group item wrapper */
const ToggleGroupItemWrapper = ({
    value,
    children,
    onChange
}: {
    value: string
    children: React.ReactNode
    onChange: (value: string | null) => void
}) => (
    <Tooltip>
        <TooltipTrigger>
            <ToggleGroupItem aria-label={value} value={value}>
                {children}
            </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>{value}</TooltipContent>
    </Tooltip>
);

/** Profile component */
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

    /** Copy image to clipboard */
    const handleCopyImage = async () => {
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

            const blobPromise = new Promise<Blob>(async (resolve, reject) => {
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

            const clipboardItem = new ClipboardItem({
                'image/png': blobPromise
            });

            await navigator.clipboard.write([clipboardItem]);
            toast.success('Image copied to clipboard');
        } catch {
            toast.error('Failed to copy image');
        } finally {
            setIsProcessing(false);
        }
    };

    /** Handlers for toggle groups */
    const handleBackgroundColorChange = (value: string | null) => {
        if (value) {
            setBackgroundColor(value as 'light' | 'dark' | 'accent');
        }
    };

    const handleCardFormatChange = (value: string | null) => {
        if (value) {
            setCardFormat(value as 'vertical' | 'square');
        }
    };

    return (
        <TooltipProvider delayDuration={0}>
            <div className='flex flex-col gap-5'>
                <div className='flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3'>
                    <H2>Share your profile</H2>
                    <div className='flex gap-4'>
                        <ToggleGroup defaultValue='light' type='single' value={backgroundColor} onValueChange={handleBackgroundColorChange}>
                            <ToggleGroupItemWrapper value='light' onChange={handleBackgroundColorChange}>
                                <div className='size-4 rounded-full border border-gray-500 dark:border-0 dark:bg-white' />
                            </ToggleGroupItemWrapper>
                            <ToggleGroupItemWrapper value='dark' onChange={handleBackgroundColorChange}>
                                <div className='size-4 rounded-full bg-black dark:border dark:border-gray-700 dark:bg-transparent' />
                            </ToggleGroupItemWrapper>
                            <ToggleGroupItemWrapper value='accent' onChange={handleBackgroundColorChange}>
                                <div className='size-4 rounded-full' style={{backgroundColor: accentColor}} />
                            </ToggleGroupItemWrapper>
                        </ToggleGroup>
                        <ToggleGroup defaultValue='vertical' type='single' value={cardFormat} onValueChange={handleCardFormatChange}>
                            <ToggleGroupItemWrapper value='vertical' onChange={handleCardFormatChange}>
                                <LucideIcon.RectangleVertical className='size-4' />
                            </ToggleGroupItemWrapper>
                            <ToggleGroupItemWrapper value='square' onChange={handleCardFormatChange}>
                                <LucideIcon.Square className='size-4' />
                            </ToggleGroupItemWrapper>
                        </ToggleGroup>
                    </div>
                </div>
                <div className='relative flex flex-col items-center overflow-hidden rounded-2xl bg-gray-50'>
                    <ProfileCard
                        accentColor={accentColor}
                        account={account}
                        avatarDataUrl={avatarDataUrl}
                        backgroundColor={backgroundColor}
                        bannerDataUrl={bannerDataUrl}
                        coverImage={coverImage}
                        format={cardFormat}
                        isLoading={isLoading}
                        publicationIcon={publicationIcon}
                        siteTitle={siteData?.site?.title}
                    />
                    <div className='relative z-20 flex w-full items-center justify-between gap-4 px-6 pb-6 max-sm:mt-4 max-sm:flex-col'>
                        <div className='flex items-center gap-2'>
                            {socialLinks.map(({name, href, icon}) => (
                                <a
                                    key={name}
                                    className='flex h-[34px] w-10 items-center justify-center rounded-sm bg-white px-3 shadow-xs hover:bg-gray-50 [&_svg]:size-4'
                                    href={href(shareText)}
                                    rel="noopener noreferrer"
                                    target='_blank'
                                >
                                    {icon}
                                </a>
                            ))}
                        </div>
                        <Button className={`min-w-[160px] dark:bg-black dark:text-white dark:hover:bg-black/90 ${backgroundColor === 'dark' && 'bg-white text-black hover:bg-gray-50 dark:bg-white dark:text-black dark:hover:bg-gray-50/90'}`} onClick={handleCopyImage}>
                            {isProcessing ? <LoadingIndicator color={`${backgroundColor === 'dark' ? 'dark' : 'light'}`} size='sm' /> : <LucideIcon.Copy />}
                            {!isProcessing && 'Copy image'}
                        </Button>
                    </div>
                    {(account?.bannerImageUrl || coverImage) &&
                        <DotsPattern className={`absolute left-1/2 top-1/2 h-[600px] w-[598px] -translate-x-1/2 -translate-y-1/2 ${backgroundColor === 'dark' && 'z-10'}`} style={{color: getDotsPatternColor(backgroundColor)}} />
                    }
                    <div className='absolute inset-0' style={{background: getGradient(backgroundColor)}} />
                </div>

                {/* Hidden clone for screenshots */}
                <div
                    ref={profileCardRef}
                    className='fixed left-[-9999px] top-0 z-[-1] flex w-fit justify-center overflow-hidden rounded-2xl bg-gray-50'
                    style={{
                        width: cardFormat === 'square' ? '518px' : '412px',
                        fontFamily: 'system-ui'
                    }}
                >
                    <ProfileCard
                        accentColor={accentColor}
                        account={account}
                        avatarDataUrl={avatarDataUrl}
                        backgroundColor={backgroundColor}
                        bannerDataUrl={bannerDataUrl}
                        coverImage={coverImage}
                        format={cardFormat}
                        isLoading={isLoading}
                        isScreenshot={true}
                        publicationIcon={publicationIcon}
                        siteTitle={siteData?.site?.title}
                    />
                    {(account?.bannerImageUrl || coverImage) &&
                        <DotsPattern className={`absolute left-[-62.5px] top-[-44px] h-[600px] w-[598px] ${backgroundColor === 'dark' && 'z-10'}`} style={{color: getDotsPatternColor(backgroundColor)}} />
                    }
                    <div
                        className='absolute left-0 top-0 size-full'
                        style={{
                            background: getGradient(backgroundColor)
                        }}
                    />
                    <img className='absolute left-1/2 top-12 mt-0.5 max-w-none -translate-x-1/2' src={cardFormat === 'square' ? ProfileCardShadowSquare : ProfileCardShadow} style={{width: cardFormat === 'square' ? '572px' : '466px'}} />
                </div>
            </div>
        </TooltipProvider>
    );
};

export default Profile;