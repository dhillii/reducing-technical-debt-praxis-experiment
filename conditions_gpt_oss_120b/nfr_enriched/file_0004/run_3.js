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
    stickyHeader?: boolean;
    scrolling?: boolean;
    dirty?: boolean;
    animate?: boolean;
    formSheet?: boolean;
    enableCMDS?: boolean;
    allowBackgroundInteraction?: boolean;
}

export const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

/**
 * Hook that registers Escape key handling for modal dismissal.
 */
function useEscapeHandler(modal: any, dirty: boolean, afterClose?: () => void, onCancel?: () => void) {
    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') {
                return;
            }
            const activeEl = document.activeElement;
            if (activeEl?.hasAttribute('data-kg-link-input')) {
                return;
            }
            if (activeEl && activeEl instanceof HTMLElement) {
                activeEl.blur();
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
        };
        document.addEventListener('keydown', handleEscapeKey);
        return () => document.removeEventListener('keydown', handleEscapeKey);
    }, [modal, dirty, afterClose, onCancel]);
}

/**
 * Hook that registers CMD/CTRL+S handling when enabled.
 */
function useCMDSHandler(enableCMDS: boolean, onOk?: () => void, dirty?: boolean, modal?: any, afterClose?: () => void) {
    useEffect(() => {
        if (!onOk) {
            return;
        }
        const handleCMDS = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                onOk();
            }
        };
        if (enableCMDS) {
            window.addEventListener('keydown', handleCMDS);
            return () => window.removeEventListener('keydown', handleCMDS);
        }
    }, [enableCMDS, onOk, dirty, modal, afterClose]);
}

/**
 * Build the CSS class string for the modal container.
 */
function buildModalClasses(params: {
    align: string;
    size: ModalSize;
    formSheet: boolean;
    animate: boolean;
    animationFinished: boolean;
    scrolling: boolean;
    extra?: string;
}) {
    const {align, size, formSheet, animate, animationFinished, scrolling, extra} = params;
    return clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        animate && !formSheet && !animationFinished && align === 'center' && 'animate-modal-in',
        animate && !formSheet && !animationFinished && align === 'right' && 'animate-modal-in-from-right',
        formSheet && !animationFinished && 'animate-modal-in-reverse',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
        extra
    );
}

/**
 * Build the CSS class string for the backdrop element.
 */
function buildBackdropClasses(params: {
    allowBackgroundInteraction: boolean;
    extra?: string;
}) {
    const {allowBackgroundInteraction, extra} = params;
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        extra
    );
}

/**
 * Compute header related classes based on size and other flags.
 */
function computeHeaderClasses(base: string, size: ModalSize, topRightContent?: 'close' | React.ReactNode) {
    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        base
    );
    switch (size) {
        case 'sm':
        case 'md':
        case 'lg':
            headerClasses = clsx(headerClasses, '-inset-x-8');
            break;
        case 'xl':
        case 'full':
        case 'bleed':
            headerClasses = clsx(headerClasses, '-inset-x-10');
            break;
        default:
            headerClasses = clsx(headerClasses, '-inset-x-8');
    }
    return headerClasses;
}

/**
 * Compute modal size specific classes and padding.
 */
function computeSizeClasses(params: {
    size: ModalSize;
    modalClasses: string;
    backdropClasses: string;
    paddingClasses: string;
    headerClasses: string;
}) {
    const {size, modalClasses, backdropClasses, paddingClasses, headerClasses} = params;
    let newModal = modalClasses;
    let newBackdrop = backdropClasses;
    let newPadding = paddingClasses;
    let newHeader = headerClasses;

    const sizeMap: Record<ModalSize, {modal?: string; backdrop?: string; padding?: string; header?: string}> = {
        sm: {modal: 'max-w-[480px]', backdrop: 'p-4 md:p-[8vmin]', padding: 'p-8', header: '-inset-x-8'},
        md: {modal: 'max-w-[720px]', backdrop: 'p-4 md:p-[8vmin]', padding: 'p-8', header: '-inset-x-8'},
        lg: {modal: 'max-w-[1020px]', backdrop: 'p-4 md:p-[4vmin]', padding: 'p-7', header: '-inset-x-8'},
        xl: {modal: 'max-w-[1240px]0', backdrop: 'p-4 md:p-[3vmin]', padding: 'p-10', header: '-inset-x-10 -top-10'},
        full: {modal: 'h-full', backdrop: 'p-4 md:p-[3vmin]', padding: 'p-10', header: '-inset-x-10'},
        bleed: {modal: 'h-full', padding: 'p-10', header: '-inset-x-10'}
    };

    const cfg = sizeMap[size];
    if (cfg) {
        if (cfg.modal) newModal = clsx(newModal, cfg.modal);
        if (cfg.backdrop) newBackdrop = clsx(newBackdrop, cfg.backdrop);
        if (cfg.padding) newPadding = cfg.padding;
        if (cfg.header) newHeader = clsx(newHeader, cfg.header);
    } else {
        newBackdrop = clsx(newBackdrop, 'p-4 md:p-[8vmin]');
        newPadding = 'p-8';
        newHeader = clsx(newHeader, '-inset-x-8');
    }

    return {modalClasses: newModal, backdropClasses: newBackdrop, paddingClasses: newPadding, headerClasses: newHeader};
}

/**
 * Build the style object for width/height overrides.
 */
function buildModalStyles(width?: 'full' | 'toSidebar' | number, height?: 'full' | number) {
    const styles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};
    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = `${width}px`;
    }
    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = `${height}px`;
    }
    return styles;
}

/**
 * Generate button definitions for footer when not custom.
 */
function generateButtons(params: {
    cancelLabel?: string;
    okLabel?: string;
    okColor: ButtonColor;
    okLoading: boolean;
    leftButtonProps?: ButtonProps;
    buttonsDisabled?: boolean;
    okDisabled?: boolean;
    onCancel?: () => void;
    onOk?: () => void;
    removeModal: () => void;
}) {
    const {
        cancelLabel,
        okLabel,
        okColor,
        okLoading,
        buttonsDisabled,
        okDisabled,
        onCancel,
        onOk,
        removeModal
    } = params;
    const buttons: ButtonProps[] = [];

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

    return buttons;
}

/**
 * Render footer content based on props.
 */
function renderFooterContent(params: {
    footer?: boolean | React.ReactNode;
    buttons: ButtonProps[];
    leftButtonProps?: ButtonProps;
    stickyFooter: boolean;
    paddingClasses: string;
}) {
    const {footer, buttons, leftButtonProps, stickyFooter, paddingClasses} = params;
    let content: React.ReactNode;

    if (footer) {
        content = footer;
    } else if (footer === false) {
        content = null;
    } else {
        const footerClasses = clsx(
            `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
            'flex w-full items-center justify-between'
        );
        content = (
            <div className={footerClasses}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );
    }

    return stickyFooter ? (
        <StickyFooter height={84}>{content}</StickyFooter>
    ) : (
        <>{content}</>
    );
}

/**
 * Main Modal component.
 */
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

    useEffect(() => setGlobalDirtyState(dirty), [dirty, setGlobalDirtyState]);

    useEscapeHandler(modal, dirty, afterClose, onCancel);
    useCMDSHandler(enableCMDS, onOk, dirty, modal, afterClose);

    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const buttons = generateButtons({
        cancelLabel,
        okLabel,
        okColor,
        okLoading,
        buttonsDisabled,
        okDisabled,
        onCancel,
        onOk,
        removeModal
    });

    // Base class calculations
    let modalClasses = buildModalClasses({
        align,
        size,
        formSheet,
        animate,
        animationFinished,
        scrolling
    });

    let backdropClasses = buildBackdropClasses({allowBackgroundInteraction});
    let paddingClasses = '';
    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );

    // Size specific adjustments
    const sizeResult = computeSizeClasses({
        size,
        modalClasses,
        backdropClasses,
        paddingClasses,
        headerClasses
    });
    modalClasses = sizeResult.modalClasses;
    backdropClasses = sizeResult.backdropClasses;
    paddingClasses = sizeResult.paddingClasses;
    headerClasses = sizeResult.headerClasses;

    if (stickyHeader) {
        headerClasses = clsx(
            headerClasses,
            'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );
    }

    if (!padding) {
        paddingClasses = 'p-0';
    }

    headerClasses = clsx(headerClasses, paddingClasses, 'pb-0');
    let contentClasses = clsx(paddingClasses, 'py-0');

    // Grow content for full height modals
    contentClasses = clsx(
        contentClasses,
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    // Backdrop final tweaks
    backdropClasses = clsx(backdropClasses, 'max-[800px]:!pb-20');

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    // Width/height overrides
    const modalStyles = buildModalStyles(width, height);
    if (width === 'full') {
        modalClasses = clsx(modalClasses, 'w-full');
    } else if (width === 'toSidebar') {
        modalClasses = clsx(
            modalClasses,
            'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
        );
    }
    if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

    const footerContent = renderFooterContent({
        footer,
        buttons,
        leftButtonProps,
        stickyFooter,
        paddingClasses
    });

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )} />
            <section
                ref={ref}
                className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')}
                data-testid={testId}
                style={modalStyles}
            >
                {header === false ? null : (!topRightContent || topRightContent === 'close' ? (
                    <header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
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
                    </header>
                ) : (
                    <header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        {topRightContent}
                    </header>
                ))}
                <div className={contentClasses}>{children}</div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;