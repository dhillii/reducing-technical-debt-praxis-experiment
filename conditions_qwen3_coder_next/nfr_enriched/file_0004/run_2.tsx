import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {useEffect, useState, forwardRef} from 'react';
import useGlobalDirtyState from '../../hooks/use-global-dirty-state';
import {confirmIfDirty} from '../../utils/modals';
import Button, {ButtonColor, ButtonProps} from '../button';
import ButtonGroup from '../button-group';
import Heading from '../heading';
import StickyFooter from '../sticky-footer';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'bleed';

export interface ModalProps {

    /**
     * Possible values are: `sm`, `md`, `lg`, `xl, `full`, `bleed`. Yu can also use any number to set an arbitrary width.
     */
    size?: ModalSize;
    width?: 'full' | 'toSidebar' | number;
    height?: 'full' | number;
    align?: 'center' | 'left' | 'right';

    testId?: string;
    title?: string;
    okLabel?: string;
    okColor?: ButtonColor;
    okLoading?: boolean;
    cancelLabel?: string;
    leftButtonProps?: ButtonProps;
    buttonsDisabled?: boolean;
    okDisabled?: boolean;
    footer?: boolean | React.ReactNode;
    header?: boolean;
    padding?: boolean;
    onOk?: () => void;
    onCancel?: () => void;
    topRightContent?: 'close' | React.ReactNode;
    hideXOnMobile?: boolean;
    afterClose?: () => void;
    children?: React.ReactNode;
    backDrop?: boolean;
    backDropClick?: boolean;
    stickyFooter?: boolean;
    stickyHeader?:boolean;
    scrolling?: boolean;
    dirty?: boolean;
    animate?: boolean;
    formSheet?: boolean;
    enableCMDS?: boolean;
    allowBackgroundInteraction?: boolean;
}

export const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

// Extracted helper: Determine modal size configuration
function getModalSizeConfig(size: ModalSize | string) {
    const configs: Record<string, {
        maxWidth?: string;
        padding?: string;
        headerInset?: string;
        backdropPadding?: string;
    }> = {
        sm: {maxWidth: 'max-w-[480px]', padding: 'p-8', headerInset: '-inset-x-8', backdropPadding: 'p-4 md:p-[8vmin]'},
        md: {maxWidth: 'max-w-[720px]', padding: 'p-8', headerInset: '-inset-x-8', backdropPadding: 'p-4 md:p-[8vmin]'},
        lg: {maxWidth: 'max-w-[1020px]', padding: 'p-7', headerInset: '-inset-x-8', backdropPadding: 'p-4 md:p-[4vmin]'},
        xl: {maxWidth: 'max-w-[1240px]0', padding: 'p-10', headerInset: '-inset-x-10 -top-10', backdropPadding: 'p-4 md:p-[3vmin]'},
        full: {padding: 'p-10', headerInset: '-inset-x-10', backdropPadding: 'p-4 md:p-[3vmin]'},
        bleed: {padding: 'p-10', headerInset: '-inset-x-10', backdropPadding: 'p-4 md:p-[8vmin]'}
    };
    return configs[size] || {padding: 'p-8', headerInset: '-inset-x-8', backdropPadding: 'p-4 md:p-[8vmin]'};
}

// Extracted helper: Build modal classes based on props and state
function buildModalClasses({
    align,
    size,
    formSheet,
    animate,
    animationFinished,
    scrolling,
    width,
    height,
    modalClasses
}: {
    align: string;
    size: ModalSize | string;
    formSheet: boolean;
    animate: boolean;
    animationFinished: boolean;
    scrolling: boolean;
    width?: string | number;
    height?: string | number;
    modalClasses: string;
}) {
    const sizeConfig = getModalSizeConfig(size);
    const baseClasses = clsx(
        modalClasses,
        sizeConfig.maxWidth,
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

    if (width === 'full') {
        return clsx(baseClasses, 'w-full');
    } else if (width === 'toSidebar') {
        return clsx(baseClasses, 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]');
    } else if (height === 'full') {
        return clsx(baseClasses, 'h-full');
    }
    return baseClasses;
}

// Extracted helper: Build backdrop classes based on props
function buildBackdropClasses({
    allowBackgroundInteraction,
    formSheet,
    size,
    backdropClasses
}: {
    allowBackgroundInteraction: boolean;
    formSheet: boolean;
    size: ModalSize | string;
    backdropClasses: string;
}) {
    const sizeConfig = getModalSizeConfig(size);
    return clsx(
        backdropClasses,
        allowBackgroundInteraction && 'pointer-events-none',
        sizeConfig.backdropPadding,
        'max-[800px]:!pb-20',
        formSheet && 'bg-[rgba(98,109,121,0.08)]'
    );
}

// Extracted helper: Build header classes based on props
function buildHeaderClasses({
    topRightContent,
    hideXOnMobile,
    stickyHeader,
    paddingClasses,
    headerClasses
}: {
    topRightContent?: 'close' | React.ReactNode;
    hideXOnMobile: boolean;
    stickyHeader: boolean;
    paddingClasses: string;
    headerClasses: string;
}) {
    const baseClasses = clsx(
        headerClasses,
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        paddingClasses,
        'pb-0'
    );

    return stickyHeader
        ? clsx(baseClasses, 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black')
        : baseClasses;
}

// Extracted helper: Build content classes based on props
function buildContentClasses({
    paddingClasses,
    size,
    height,
    contentClasses
}: {
    paddingClasses: string;
    size: ModalSize | string;
    height?: string | number;
    contentClasses: string;
}) {
    return clsx(
        contentClasses,
        paddingClasses,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );
}

// Extracted helper: Build footer classes based on props
function buildFooterClasses({
    paddingClasses,
    stickyFooter,
    footerClasses
}: {
    paddingClasses: string;
    stickyFooter: boolean;
    footerClasses: string;
}) {
    return clsx(
        footerClasses,
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );
}

// Extracted helper: Build modal styles based on width/height props
function buildModalStyles({
    width,
    height
}: {
    width?: string | number;
    height?: string | number;
}) {
    const styles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = width + 'px';
    }
    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = height + 'px';
    }

    return styles;
}

// Extracted helper: Build footer content based on props
function buildFooterContent({
    footer,
    footerClasses,
    leftButtonProps,
    buttons,
    stickyFooter
}: {
    footer: boolean | React.ReactNode;
    footerClasses: string;
    leftButtonProps?: ButtonProps;
    buttons: ButtonProps[];
    stickyFooter: boolean;
}) {
    if (footer) {
        return footer;
    } else if (footer === false) {
        return null;
    }

    const content = (
        <div className={footerClasses}>
            <div>
                {leftButtonProps && <Button {...leftButtonProps} />}
            </div>
            <div className='flex gap-3'>
                <ButtonGroup buttons={buttons}/>
            </div>
        </div>
    );

    return stickyFooter ? <StickyFooter height={84}>{content}</StickyFooter> : content;
}

// Extracted helper: Build modal header JSX
function buildModalHeader({
    header,
    title,
    topRightContent,
    hideXOnMobile,
    headerClasses,
    removeModal
}: {
    header: boolean | undefined;
    title?: string;
    topRightContent?: 'close' | React.ReactNode;
    hideXOnMobile: boolean;
    headerClasses: string;
    removeModal: () => void;
}) {
    if (header === false) {
        return null;
    }

    const closeSection = (
        <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
            <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
        </div>
    );

    return (
        <header className={headerClasses}>
            {title && <Heading level={3}>{title}</Heading>}
            {topRightContent === 'close' ? closeSection : topRightContent ? topRightContent : closeSection}
        </header>
    );
}

const Modal = forwardRef<HTMLElement, ModalProps>(({
    size = 'md',
    align = 'center',
    width,
    height,
    testId,
    title,
    okLabel = 'OK',
    okLoading = false,
    cancelLabel = 'Cancel',
    footer,
    header,
    leftButtonProps,
    buttonsDisabled,
    okDisabled,
    padding = true,
    onOk,
    okColor = 'black',
    onCancel,
    topRightContent,
    hideXOnMobile = false,
    afterClose,
    children,
    backDrop = true,
    backDropClick = true,
    stickyFooter = false,
    stickyHeader = false,
    scrolling = true,
    dirty = false,
    animate = true,
    formSheet = false,
    enableCMDS = true,
    allowBackgroundInteraction = false
}, ref) => {
    const modal = useModal();
    const {setGlobalDirtyState} = useGlobalDirtyState();
    const [animationFinished, setAnimationFinished] = useState(false);

    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                const activeEl = document.activeElement;
                if (activeEl?.hasAttribute('data-kg-link-input')) {
                    return;
                }

                if (document.activeElement && document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }

                setTimeout(() => {
                    if (onCancel) {
                        onCancel();
                    } else {
                        confirmIfDirty(dirty, () => {
                            modal.remove();
                            afterClose?.();
                        });
                    }
                });

                event.stopPropagation();
            }
        };

        document.addEventListener('keydown', handleEscapeKey);

        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [modal, dirty, afterClose, onCancel]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setAnimationFinished(true);
        }, 250);

        return () => clearTimeout(timeout);
    }, []);

    useEffect(() => {
        if (onOk && enableCMDS) {
            const handleCMDS = (e: KeyboardEvent) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    onOk();
                }
            };
            window.addEventListener('keydown', handleCMDS);
            return () => window.removeEventListener('keydown', handleCMDS);
        }
    }, [onOk, enableCMDS]);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const buttons: ButtonProps[] = [];

    if (!footer) {
        if (cancelLabel) {
            buttons.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: onCancel ? onCancel : removeModal,
                disabled: buttonsDisabled
            });
        }

        if (okLabel) {
            buttons.push({
                key: 'ok-modal',
                label: okLabel,
                color: okColor,
                className: 'min-w-[80px]',
                onClick: onOk,
                disabled: buttonsDisabled || okDisabled,
                loading: okLoading
            });
        }
    }

    const paddingClasses = padding ? getModalSizeConfig(size).padding || 'p-8' : 'p-0';

    const modalClasses = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black'
    );

    const backdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]'
    );

    const headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );

    const contentClasses = clsx(
        paddingClasses,
        'py-0'
    );

    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    const finalModalClasses = buildModalClasses({
        align,
        size,
        formSheet,
        animate,
        animationFinished,
        scrolling,
        width,
        height,
        modalClasses
    });

    const finalBackdropClasses = buildBackdropClasses({
        allowBackgroundInteraction,
        formSheet,
        size,
        backdropClasses
    });

    const finalHeaderClasses = buildHeaderClasses({
        topRightContent,
        hideXOnMobile,
        stickyHeader,
        paddingClasses,
        headerClasses
    });

    const finalContentClasses = buildContentClasses({
        paddingClasses,
        size,
        height,
        contentClasses
    });

    const finalFooterClasses = buildFooterClasses({
        paddingClasses,
        stickyFooter,
        footerClasses
    });

    const modalStyles = buildModalStyles({width, height});

    const footerContent = buildFooterContent({
        footer,
        footerClasses: finalFooterClasses,
        leftButtonProps,
        buttons,
        stickyFooter
    });

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    return (
        <div className={finalBackdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section ref={ref} className={clsx(
                finalModalClasses,
                allowBackgroundInteraction && 'pointer-events-auto'
            )} data-testid={testId} style={modalStyles}>
                {buildModalHeader({
                    header,
                    title,
                    topRightContent,
                    hideXOnMobile,
                    headerClasses: finalHeaderClasses,
                    removeModal
                })}
                <div className={finalContentClasses}>
                    {children}
                </div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;