const cardWidth = format === 'square' ? 'w-[422px]' : 'w-[316px]';
        const cardHeight = 'h-[422px]';

        const bannerImageSrc = isScreenshot && bannerDataUrl ? bannerDataUrl : (account?.bannerImageUrl || coverImage);
        const avatarImageSrc = isScreenshot && avatarDataUrl ? avatarDataUrl : (account?.avatarUrl || publicationIcon);

        const handleCopy = useCallback(async () => {
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
        }, [account?.handle]);

        const renderBanner = () => {
            if (bannerImageSrc) {
                return (
                    <img
                        alt={account?.name}
                        className='size-full rounded-[26px] rounded-b-none object-cover'
                        referrerPolicy='no-referrer'
                        src={bannerImageSrc}
                    />
                );
            }
            return (
                <div className='relative size-full overflow-hidden rounded-[26px] rounded-b-none' style={{background: `linear-gradient(to bottom, ${hexToRgba(backgroundColor === 'accent' ? '#ffffff' : accentColor || '#15171a', 1)}, ${hexToRgba(backgroundColor === 'accent' ? '#ffffff' : accentColor || '#15171a', 0.5)})`}}>
                    <DotsPattern className='absolute' style={{color: backgroundColor === 'accent' ? hexToRgba(accentColor || '#15171a', 0.2) : 'rgba(255, 255, 255, 0.2)', top: isScreenshot ? '-42px' : '-84px', left: isScreenshot ? '-69px' : '-138px'}} />
                </div>
            );
        };

        const renderAvatar = () => {
            if (!avatarImageSrc) {
                return null;
            }
            return (
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
            );
        };

        const renderHandleCopyButton = () => {
            if (!account?.handle || isScreenshot) {
                return null;
            }
            const isDark = backgroundColor !== 'light';
            return (
                <Button
                    className='relative top-[3px] ml-1.5 size-4 p-0 hover:opacity-80'
                    style={{color: isDark ? '#fff' : accentColor}}
                    title='Copy handle'
                    variant='link'
                    onClick={handleCopy}
                >
                    {!copied ? <LucideIcon.Copy size={12} /> : <LucideIcon.Check size={12} />}
                </Button>
            );
        };

        const renderHandleDiv = () => {
            const isDark = backgroundColor !== 'light';
            const isAccent = backgroundColor === 'accent';
            const buttonColor = isDark ? '#fff' : accentColor;
            const borderColor = accentColor ? hexToRgba(isAccent ? '#ffffff' : accentColor, isDark ? 0.7 : 0.2) : undefined;
            const gradient = accentColor ? `linear-gradient(to top right, ${hexToRgba(isAccent ? '#ffffff' : accentColor, isAccent ? 0.12 : 0.04)}, ${hexToRgba(isAccent ? '#ffffff' : accentColor, isAccent ? 0.48 : 0.16)})` : undefined;

            return (
                <div
                    className={`mt-auto flex max-h-[60px] min-h-12 w-full items-center justify-center break-all rounded-full border px-4 py-2 font-medium leading-7 ${isScreenshot && 'tracking-normal'}`}
                    style={{
                        color: buttonColor,
                        borderColor,
                        background: gradient
                    }}
                >
                    <div className='mb-0.5'>
                        {account?.handle}
                        {renderHandleCopyButton()}
                    </div>
                </div>
            );
        };

        return (
            <div className={`relative z-20 flex flex-col ${margin} ${cardWidth} ${cardHeight} rounded-[32px] ${borderClass} ${format === 'square' ? 'flex flex-col' : ''}`} style={{backgroundColor: cardBackgroundColor}}>
                <div className='relative h-48 p-2'>
                    {renderBanner()}
                    {renderAvatar()}
                </div>
                <div className={`flex grow flex-col items-center p-6 ${(account?.avatarUrl || publicationIcon) ? 'pt-9' : 'pt-3'} text-center ${format === 'square' ? 'flex-1 justify-center' : ''}`}>
                    <H2 className={`${isScreenshot && 'tracking-normal'}`} style={{color: textColor}}>{!isLoading ? account?.name : <Skeleton className='w-32' />}</H2>
                    <span className={`mt-1.5 leading-7 ${isScreenshot && 'tracking-normal'}`} style={{color: textColor}}>{!isLoading ? 'Available on Ghost, Flipboard, Threads, Bluesky, Mastodon, or wherever you get your social web feeds.' : <Skeleton className='w-28' />}</span>
                    {renderHandleDiv()}
                </div>
            </div>
        );
    }