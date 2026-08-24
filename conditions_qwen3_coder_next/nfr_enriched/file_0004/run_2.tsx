useEffect(() => {
    setGlobalDirtyState(dirty);
}, [dirty, setGlobalDirtyState]);

const handleEscapeKey = useCallback((event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;

    const activeEl = document.activeElement;
    if (activeEl?.hasAttribute('data-kg-link-input')) return;

    const blurActiveElement = () => {
        if (document.activeElement && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
    };

    const closeWithCheck = () => {
        if (onCancel) {
            onCancel();
        } else {
            confirmIfDirty(dirty, () => {
                modal.remove();
                afterClose?.();
            });
        }
    };

    blurActiveElement();
    setTimeout(closeWithCheck);
    event.stopPropagation();
}, [modal, dirty, afterClose, onCancel, onOk === undefined]);

useEffect(() => {
    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
}, [handleEscapeKey]);

useEffect(() => {
    const timeout = setTimeout(() => setAnimationFinished(true), 250);
    return () => clearTimeout(timeout);
}, []);

useEffect(() => {
    if (!onOk || !enableCMDS) return;

    const handleCMDS = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            onOk();
        }
    };

    window.addEventListener('keydown', handleCMDS);
    return () => window.removeEventListener('keydown', handleCMDS);
}, [onOk, enableCMDS]);

const getOkButtonProps = useCallback((): ButtonProps => ({
    key: 'ok-modal',
    label: okLabel,
    color: okColor,
    className: 'min-w-[80px]',
    onClick: onOk,
    disabled: buttonsDisabled || okDisabled,
    loading: okLoading
}));

const getCancelButtonProps = useCallback((): ButtonProps => ({
    key: 'cancel-modal',
    label: cancelLabel,
    color: 'outline',
    onClick: onCancel ?? removeModal,
    disabled: buttonsDisabled
}));

const constructButtons = useCallback((): ButtonProps[] => {
    if (footer) return [];

    const buttons: ButtonProps[] = [];
    if (cancelLabel) buttons.push(getCancelButtonProps());
    if (okLabel) buttons.push(getOkButtonProps());
    return buttons;
}, [footer, cancelLabel, okLabel, onCancel, onOk, buttonsDisabled, okDisabled, okLoading, okColor]);

const getBackdropClasses = useCallback(() => clsx(
    'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
    allowBackgroundInteraction && 'pointer-events-none'
), [allowBackgroundInteraction]);

const getModalClasses = useCallback(() => {
    const commonClasses = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        (animate && !formSheet && !animationFinished && align === 'center') && 'animate-modal-in',
        (animate && !formSheet && !animationFinished && align === 'right') && 'animate-modal-in-from-right',
        (formSheet && !animationFinished) && 'animate-modal-in-reverse',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
    );

    return commonClasses;
}, [align, size, animate, formSheet, animationFinished, scrolling]);

const applySizeSpecificClasses = useCallback((modal: string, backdrop: string, pad: string, header: string, s: ModalSize) => {
    // Helper to centralize size-specific class application
    switch (s) {
        case 'sm':
            return {
                modal: clsx(modal, 'max-w-[480px]'),
                backdrop: clsx(backdrop, 'p-4 md:p-[8vmin]'),
                padding: 'p-8',
                header: clsx(header, '-inset-x-8')
            };
        case 'md':
            return {
                modal: clsx(modal, 'max-w-[720px]'),
                backdrop: clsx(backdrop, 'p-4 md:p-[8vmin]'),
                padding: 'p-8',
                header: clsx(header, '-inset-x-8')
            };
        case 'lg':
            return {
                modal: clsx(modal, 'max-w-[1020px]'),
                backdrop: clsx(backdrop, 'p-4 md:p-[4vmin]'),
                padding: 'p-7',
                header: clsx(header, '-inset-x-8')
            };
        case 'xl':
            return {
                modal: clsx(modal, 'max-w-[1240px]0'),
                backdrop: clsx(backdrop, 'p-4 md:p-[3vmin]'),
                padding: 'p-10',
                header: clsx(header, '-inset-x-10 -top-10')
            };
        case 'full':
            return {
                modal: clsx(modal, 'h-full'),
                backdrop: clsx(backdrop, 'p-4 md:p-[3vmin]'),
                padding: 'p-10',
                header: clsx(header, '-inset-x-10')
            };
        case 'bleed':
            return {
                modal: clsx(modal, 'h-full'),
                padding: 'p-10',
                header: clsx(header, '-inset-x-10')
            };
        default:
            return {
                modal,
                backdrop: clsx(backdrop, 'p-4 md:p-[8vmin]'),
                padding: 'p-8',
                header: clsx(header, '-inset-x-8')
            };
    }
}, [animate, formSheet, animationFinished]);

const applyFooterClasses = useCallback((pad: string) => clsx(
    `${pad} ${stickyFooter ? 'py-6' : ''}`,
    'flex w-full items-center justify-between'
), [stickyFooter]);

const applyContentClasses = useCallback((pad: string, s: ModalSize, h: ModalProps['height']) => clsx(
    pad,
    'py-0',
    ((s === 'full' || s === 'bleed' || h === 'full' || typeof h === 'number') && 'grow')
), []);

const getHeaderClasses = useCallback((pad: string, topRight: ModalProps['topRightContent'], hideMobile: boolean) => {
    let base = clsx(
        (!topRight || topRight === 'close') ? '' : 'flex items-center justify-between gap-5'
    );
    if (stickyHeader) {
        base = clsx(base, 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black');
    }
    return clsx(base, pad, 'pb-0', hideMobile && 'md:!invisible md:!hidden');
}, [stickyHeader]);

const renderHeader = useCallback(() => {
    const headerContent = (
        <header className={getHeaderClasses(paddingClasses, topRightContent, hideXOnMobile)}>
            {title && <Heading level={3}>{title}</Heading>}
            {!topRightContent || topRightContent === 'close' ? (
                <div className={`absolute right-6 top-6 ${hideXOnMobile && 'hidden'}`}>
                    <Button
                        className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100'
                        icon='close'
                        iconColorClass='text-black dark:text-white'
                        size='sm'
                        testId='close-modal'
                        unstyled
                        onClick={removeModal}
                    />
                </div>
            ) : topRightContent}
        </header>
    );

    return header === false ? '' : headerContent;
}, [title, topRightContent, hideXOnMobile, header, paddingClasses, stickyHeader]);

const renderButtons = useCallback(() => {
    if (!footer) return null;
    if (footer === false) return <div className="pb-0" />;

    const footerClasses = applyFooterClasses(paddingClasses);
    return (
        <div className={footerClasses}>
            <div>
                {leftButtonProps && <Button {...leftButtonProps} />}
            </div>
            <div className="flex gap-3">
                <ButtonGroup buttons={buttons} />
            </div>
        </div>
    );
}, [footer, leftButtonProps, paddingClasses, buttons]);

const renderFooterContent = useCallback(() => {
    let content = footer ? footer : footer === false ? null : renderButtons();

    if (!content) {
        contentClasses += ' pb-0 ';
    } else if (stickyFooter) {
        content = <StickyFooter height={84}>{content}</StickyFooter>;
    }

    return content;
}, [footer, renderButtons, stickyFooter, paddingClasses]);

const renderBackdrop = useCallback(() => (
    <div
        className={backdropClasses}
        id='modal-backdrop'
        onMouseDown={handleBackdropClick}
    >
        <div className={clsx(
            'pointer-events-none fixed inset-0 z-0',
            (backDrop && !formSheet) && topLevelBackdropClasses,
            formSheet && 'bg-[rgba(98,109,121,0.08)]'
        )}></div>
    </div>
), [backdropClasses, backDrop, formSheet, handleBackdropClick]);

const modalStyles = useMemo(() => {
    const styles: { width?: string; height?: string; maxWidth?: string; maxHeight?: string } = {};

    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = `${width}px`;
    } else if (width === 'full') {
        modalClasses = clsx(modalClasses, 'w-full');
    } else if (width === 'toSidebar') {
        modalClasses = clsx(
            modalClasses,
            'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
        );
    }

    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

    return styles;
}, [width, height]); // Only deps that affect modalStyles

const buttons = constructButtons();
const backdropClasses = getBackdropClasses();
const modalClassesBase = getModalClasses();
const { modal: modalClassesFinal, backdrop: backdropClassesFinal, padding: paddingClasses, header: headerClassesBase } = applySizeSpecificClasses(
    modalClassesBase, backdropClasses, '', '', size
);
const headerClasses = getHeaderClasses(paddingClasses, topRightContent, hideXOnMobile);
const contentClassesFinal = applyContentClasses(paddingClasses, size, height);
const footerContent = renderFooterContent();

backdropClassesFinal = clsx(backdropClassesFinal, 'max-[800px]:!pb-20');

return (
    <div className={backdropClassesFinal}>
        {renderBackdrop()}
        <section ref={ref} className={clsx(
            modalClassesFinal,
            allowBackgroundInteraction && 'pointer-events-auto'
        )} data-testid={testId} style={modalStyles}>
            {renderHeader()}
            <div className={contentClassesFinal}>
                {children}
            </div>
            {footerContent}
        </section>
    </div>
);