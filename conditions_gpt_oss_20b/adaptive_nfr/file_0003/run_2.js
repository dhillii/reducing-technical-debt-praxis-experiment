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

const getBackgroundColor = (backgroundColor: 'light' | 'dark' | 'accent', accentColor?: string) => {
    const map: Record<'light' | 'dark' | 'accent', string> = {
        light: '#fff',
        dark: '#15171a',
        accent: accentColor || '#15171a'
    };
    return map[backgroundColor];
};

const getTextColor = (backgroundColor: 'light' | 'dark' | 'accent') => {
    const map: Record<'light' | 'dark' | 'accent', string> = {
        light: '#15171a',
        dark: '#fff',
        accent: '#fff'
    };
    return map[backgroundColor];
};

const getGradient = (backgroundColor: 'light' | 'dark' | 'accent', accentColor?: string) => {
    const map: Record<'light' | 'dark' | 'accent', string> = {
        light: `linear-gradient(to bottom left, #EBEEF0, ${hexToRgba('#EBEEF0', 0)})`,
        dark: `linear-gradient(to bottom left, ${hexToRgba('#1A1E22', 1)}, ${hexToRgba('#343C48', 1)})`,
        accent: `linear-gradient(to bottom left, ${hexToRgba(accentColor || '#15171a', 0.08)}, ${hexToRgba(accentColor || '#15171a', 0.06)})`
    };
    return map[backgroundColor];
};

const getDotsPatternColor = (backgroundColor: 'light' | 'dark' | 'accent') => {
    const map: Record<'light' | 'dark' | 'accent', string> = {
        light: hexToRgba('#15171a', 0.025),
        dark: hexToRgba('#15171a', 0.23),
        accent: 'rgba(0, 0, 0, 0.02)'
    };
    return map[backgroundColor];
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

const SocialLink = ({href, icon, title}: {href: string, icon: JSX.Element, title: string}) => (
    <a className='flex h-[34px] w-10 items-center justify-center rounded-sm bg-white px-3 shadow-xs hover:bg-gray-50 [&_svg]:size-4' href={href} rel="noopener noreferrer" target='_blank' title={title}>
        {icon}
    </a>
);

const CopyButton = ({onClick, isProcessing, backgroundColor}: {onClick: () => void, isProcessing: boolean, backgroundColor: 'light' | 'dark' | 'accent'}) => (
    <Button className={`min-w-[160px] dark:bg-black dark:text-white dark:hover:bg-black/90 ${backgroundColor === 'dark' && 'bg-white text-black hover:bg-gray-50 dark:bg-white dark:text-black dark:hover:bg-gray-50/90'}`} onClick={onClick}>
        {isProcessing ? <LoadingIndicator color={`${backgroundColor === 'dark' ? 'dark' : 'light'}`} size='sm' /> : <LucideIcon.Copy />}
        {!isProcessing && 'Copy image'}
    </Button>
);

const useCopyImage = (profileCardRef: React.RefObject<HTMLDivElement>, backgroundColor: 'light' | 'dark' | 'accent') => {
    const [isProcessing, setIsProcessing] = useState(false);

    const handleCopy = useCallback(async () => {
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
    }, [profileCardRef, isProcessing, backgroundColor]);

    return {handleCopy, isProcessing};
};

const Profile: React.FC<ProfileProps> = ({account, isLoading}) => {
    const {data: siteData} = useBrowseSite();
    const accentColor = siteData?.site?.accent_color;
    const coverImage = siteData?.site?.cover_image;
    const publicationIcon = siteData?.site?.icon;
    const profileCardRef = useRef<HTMLDivElement>(null);
    const [backgroundColor, setBackgroundColor] = useState<'light' | 'dark' | 'accent'>('light');
    const [cardFormat, setCardFormat] = useState<'vertical' | 'square'>('vertical');
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

    const {handleCopy, isProcessing} = useCopyImage(profileCardRef, backgroundColor);

    const socialLinks = [
        {
            href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
            icon: <svg aria-hidden="true" viewBox="0 0 24 24"><path className="social-x_svg__x" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>,
            title: 'Tweet'
        },
        {
            href: `https://threads.net/intent/post?text=${encodeURIComponent(shareText)}`,
            icon: <svg fill="none" viewBox="0 0 18 18"><g clipPath="url(#social-threads_svg__clip0_351_18008)"><path d="M13.033 8.38a5.924 5.924 0 00-.223-.102c-.13-2.418-1.452-3.802-3.67-3.816h-.03c-1.327 0-2.43.566-3.11 1.597l1.22.837c.507-.77 1.304-.934 1.89-.934h.02c.73.004 1.282.217 1.639.63.26.302.433.72.519 1.245a9.334 9.334 0 00-2.097-.101c-2.109.121-3.465 1.351-3.374 3.06.047.868.478 1.614 1.216 2.1.624.413 1.428.614 2.263.568 1.103-.06 1.969-.48 2.572-1.25.459-.585.749-1.342.877-2.296.526.317.915.735 1.13 1.236.366.854.387 2.255-.756 3.398-1.003 1.002-2.207 1.435-4.028 1.448-2.02-.015-3.547-.663-4.54-1.925-.93-1.182-1.41-2.89-1.428-5.075.018-2.185.498-3.893 1.428-5.075.993-1.262 2.52-1.91 4.54-1.925 2.034.015 3.588.666 4.62 1.934.505.622.886 1.405 1.137 2.317l1.43-.382c-.305-1.122-.784-2.09-1.436-2.892C13.52 1.35 11.587.517 9.096.5h-..."/></g><defs><clipPath id="social-threads_svg__clip0_351_18008"><path d="M0 0h17v17H0z" fill="#fff" transform="translate(.5 .5)"/></clipPath></defs></svg>,
            title: 'Threads'
        },
        {
            href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareText)}`,
            icon: <svg fill="none" viewBox="0 0 40 40"><title>social-facebook</title><path className="social-facebook_svg__fb" d="M20 40.004c11.046 0 20-8.955 20-20 0-11.046-8.954-20-20-20s-20 8.954-20 20c0 11.045 8.954 20 20 20z" fill="#1977f3"></path><path d="M27.785 25.785l.886-5.782h-5.546V16.25c0-1.58.773-3.125 3.26-3.125h2.522V8.204s-2.29-.39-4.477-.39c-4.568 0-7.555 2.767-7.555 7.781v..."/></svg>,
            title: 'Facebook'
        },
        {
            href: `http://www.linkedin.com/shareArticle?mini=true&title=${encodeURIComponent(shareText)}`,
            icon: <svg fill="none" viewBox="0 0 16 16"><g clipPath="url(#social-linkedin_svg__clip0_537_833)"><path className="social-linkedin_svg__linkedin" clipRule="evenodd" d="M1.778 16h12.444c.982 0 1.778-.796 1.778-1.778V1.778C16 .796 15.204 0 14.222 0H1.778C.796 0 0 .796 0 1.778v12.444C0 15.204.796 16 1.778 16z" fill="#007ebb" fillRule="evenodd"></path><path clipRule="evenodd" d="M13.778 13.778h-2.374V9.734c0-1.109-.421-1.729-1.299-1.729-.955 0-..."/></g><defs><clipPath id="social-linkedin_svg__clip0_537_833"><path d="M0 0h16v16H0z" fill="#fff"/></clipPath></defs></svg>,
            title: 'LinkedIn'
        }
    ];

    return (
        <TooltipProvider delayDuration={0}>
            <div className='flex flex-col gap-5'>
                <div className='flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3'>
                    <H2>Share your profile</H2>
                    <div className='flex gap-4'>
                        <ToggleGroup defaultValue='light' type='single' value={backgroundColor} onValueChange={(value) => {
                            if (value) {
                                setBackgroundColor(value as 'light' | 'dark' | 'accent');
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
                        <ToggleGroup defaultValue='vertical' type='single' value={cardFormat} onValueChange={(value) => {
                            if (value) {
                                setCardFormat(value as 'vertical' | 'square');
                            }
                        }}>
                            <Tooltip>
                                <TooltipTrigger>
                                    <ToggleGroupItem aria-label='Vertical' value='vertical'>
                                        <LucideIcon.RectangleVertical className='size-4' />
                                    </ToggleGroupItem>
                                </TooltipTrigger>
                                <TooltipContent>Vertical</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger>
                                    <ToggleGroupItem aria-label='Square' value='square'>
                                        <LucideIcon.Square className='size-4' />
                                    </ToggleGroupItem>
                                </TooltipTrigger>
                                <TooltipContent>Square</TooltipContent>
                            </Tooltip>
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
                            {socialLinks.map((link, idx) => (
                                <SocialLink key={idx} href={link.href} icon={link.icon} title={link.title} />
                            ))}
                        </div>
                        <CopyButton onClick={handleCopy} isProcessing={isProcessing} backgroundColor={backgroundColor} />
                    </div>
                    {(account?.bannerImageUrl || coverImage) &&
                    <DotsPattern className={`absolute left-1/2 top-1/2 h-[600px] w-[598px] -translate-x-1/2 -translate-y-1/2 ${backgroundColor === 'dark' && 'z-10'}`} style={{color: getDotsPatternColor(backgroundColor)}} />
                    }
                    <div className='absolute inset-0' style={{background: getGradient(backgroundColor, accentColor)}} />
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
                            background: getGradient(backgroundColor, accentColor)
                        }}
                    />
                    <img className='absolute left-1/2 top-12 mt-0.5 max-w-none -translate-x-1/2' src={cardFormat === 'square' ? ProfileCardShadowSquare : ProfileCardShadow} style={{width: cardFormat === 'square' ? '572px' : '466px'}} />
                </div>
            </div>
        </TooltipProvider>
    );
};

export default Profile;