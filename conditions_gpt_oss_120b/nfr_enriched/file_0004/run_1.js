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

/* Helper: builds button list based on props */
function buildButtons({
    cancelLabel,
    okLabel,
    okColor,
    okLoading,
    buttonsDisabled,
    okDisabled,
    onCancel,
    onOk,
    removeModal
}: {
    cancelLabel?: string;
    okLabel?: string;
    okColor: ButtonColor;
    okLoading: boolean;
    buttonsDisabled?: boolean;
    okDisabled?: boolean;
    onCancel?: () => void;
    onOk?: () => void;
    removeModal: () => void;
}): ButtonProps[] {
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

/* Helper: computes modal class string based on size and other flags */
function computeModalClasses(params: {
    base: string;
    size: ModalSize;
    align: 'center' | 'left' | 'right';
    formSheet: boolean;
    animate: boolean;
    animationFinished: boolean;
    scrolling: boolean;
}): string {
    const {base, size, align, formSheet, animate, animationFinished, scrolling} = params;
    let classes = clsx(
        base,
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

    const sizeMap: Record<ModalSize, string> = {
        sm: 'max-w-[480px]',
        md: 'max-w-[720px]',
        lg: 'max-w-[1020px]',
        xl: 'max-w-[1240px]0',
        full: 'h-full',
        bleed: 'h-full'
    };

    if (sizeMap[size]) {
        classes = clsx(classes, sizeMap[size]);
    }

    return classes;
}

/* Helper: computes backdrop class string based on size and flags */
function computeBackdropClasses(params: {
    base: string;
    size: ModalSize;
    backDrop: boolean;
    formSheet: boolean;
    allowBackgroundInteraction: boolean;
}): string {
    const {base, size, backDrop, formSheet, allowBackgroundInteraction} = params;
    let classes = clsx(
        base,
        allowBackgroundInteraction && 'pointer-events-none'
    );

    const paddingMap: Record<ModalSize, string> = {
        sm: 'p-4 md:p-[8vmin]',
        md: 'p-4 md:p-[8vmin]',
        lg: 'p-4 md:p-[4vmin]',
        xl: 'p-4 md:p-[3vmin]',
        full: 'p-4 md:p-[3vmin]',
        bleed: ''
    };

    const padding = paddingMap[size] ?? 'p-4 md:p-[8vmin]';
    classes = clsx(classes, padding, 'max-[800px]:!pb-20');

    return classes;
}

/* Helper: computes padding and header classes */
function computePaddingAndHeader(params: {
    size: ModalSize;
    padding: boolean;
    topRightContent?: 'close' | React.ReactNode;
    hideXOnMobile: boolean;
    stickyHeader: boolean;
}): {paddingClasses: string; headerClasses: string} {
    const {size, padding, topRightContent, hideXOnMobile, stickyHeader} = params;

    const basePaddingMap: Record<ModalSize, string> = {
        sm: 'p-8',
        md: 'p-8',
        lg: 'p-7',
        xl: 'p-10',
        full: 'p-10',
        bleed: 'p-10'
    };
    let paddingClasses = padding ? (basePaddingMap[size] ?? 'p-8') : 'p-0';

    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );

    const headerInsetMap: Record<ModalSize, string> = {
        sm: '-inset-x-8',
        md: '-inset-x-8',
        lg: '-inset-x-8',
        xl: '-inset-x-10 -top-10',
        full: '-inset-x-10',
        bleed: '-inset-x-10'
    };
    headerClasses = clsx(headerClasses, headerInsetMap[size] ?? '-inset-x-8');

    if (stickyHeader) {
        headerClasses = clsx(
            headerClasses,
            'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );
    }

    return {paddingClasses, headerClasses};
}

/* Helper: builds inline style object for width/height */
function computeModalStyles(width?: 'full' | 'toSidebar' | number, height?: 'full' | number): {
    width?: string;
    height?: string;
    maxWidth?: string;
    maxHeight?: string;
    extraModalClasses?: string;
} {
    const styles: {
        width?: string;
        height?: string;
        maxWidth?: string;
        maxHeight?: string;
        extraModalClasses?: string;
    } = {};

    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = `${width}px`;
    } else if (width === 'full') {
        styles.extraModalClasses = clsx(styles.extraModalClasses, 'w-full');
    } else if (width === 'toSidebar') {
        styles.extraModalClasses = clsx(
            styles.extraModalClasses,
            'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
        );
    }

    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        styles.extraModalClasses = clsx(styles.extraModalClasses, 'h-full');
    }

    return styles;
}

/* Hook: handles Escape key to close modal */
function useEscapeHandler({
    modal,
    dirty,
    afterClose,
    onCancel
}: {
    modal: any;
    dirty: boolean;
    afterClose?: () => void;
    onCancel?: () => void;
}) {
    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            const activeEl = document.activeElement;
            if (activeEl?.hasAttribute('data-kg-link-input')) {
                return;
            }

            if (document.activeElement instanceof HTMLElement) {
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
        };

        document.addEventListener('keydown', handleEscapeKey);
        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [modal, dirty, afterClose, onCancel]);
}

/* Hook: handles CMD/CTRL+S shortcut */
function useCMDSHandler({
    enableCMDS,
    onOk
}: {
    enableCMDS?: boolean;
    onOk?: () => void;
}) {
    useEffect(() => {
        if (!onOk) return;
        const handleCMDS = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                onOk();
            }
        };
        if (enableCMDS) {
            window.addEventListener('keydown', handleCMDS);
            return () => {
                window.removeEventListener('keydown', handleCMDS);
            };
        }
    }, [enableCMDS, onOk]);
}

/* Main Modal component */
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
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

    useEscapeHandler({modal, dirty, afterClose, onCancel});
    useCMDSHandler({enableCMDS, onOk});

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const buttons = buildButtons({
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

    const modalBase = 'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black';
    const modalClasses = computeModalClasses({
        base: modalBase,
        size,
        align,
        formSheet,
        animate,
        animationFinished,
        scrolling
    });

    const backdropBase = 'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]';
    const backdropClasses = computeBackdropClasses({
        base: backdropBase,
        size,
        backDrop,
        formSheet,
        allowBackgroundInteraction
    });

    const {paddingClasses, headerClasses: baseHeaderClasses} = computePaddingAndHeader({
        size,
        padding,
        topRightContent,
        hideXOnMobile,
        stickyHeader
    });

    const {width: styleWidth, height: styleHeight, maxWidth, maxHeight, extraModalClasses} = computeModalStyles(width, height);
    const modalStyle: React.CSSProperties = {
        width: styleWidth,
        height: styleHeight,
        maxWidth,
        maxHeight
    };
    const finalModalClasses = clsx(modalClasses, extraModalClasses, allowBackgroundInteraction && 'pointer-events-auto');

    const headerClasses = clsx(
        baseHeaderClasses,
        paddingClasses,
        'pb-0'
    );

    const contentClasses = clsx(
        paddingClasses,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    let footerContent: React.ReactNode;
    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        // No footer, adjust content padding
        // (contentClasses already includes padding, additional adjustment not needed)
    } else {
        footerContent = (
            <div className={footerClasses}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );
    }

    if (stickyFooter) {
        footerContent = (
            <StickyFooter height={84}>
                {footerContent}
            </StickyFooter>
        );
    }

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )} />
            <section
                ref={ref}
                className={finalModalClasses}
                data-testid={testId}
                style={modalStyle}
            >
                {header === false ? null : (
                    topRightContent && topRightContent !== 'close' ? (
                        <header className={headerClasses}>
                            {title && <Heading level={3}>{title}</Heading>}
                            {topRightContent}
                        </header>
                    ) : (
                        <header className={headerClasses}>
                            {title && <Heading level={3}>{title}</Heading>}
                            <div className={clsx(
                                topRightContent !== 'close' && 'md:!invisible md:!hidden',
                                hideXOnMobile && 'hidden',
                                'absolute right-6 top-6'
                            )}>
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
                    )
                )}
                <div className={contentClasses}>{children}</div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;