```typescript
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
    stickyHeader?: boolean;
    scrolling?: boolean;
    dirty?: boolean;
    animate?: boolean;
    formSheet?: boolean;
    enableCMDS?: boolean;
    allowBackgroundInteraction?: boolean;
}

export const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

// Helper: Build button array for footer
const buildFooterButtons = (
    footer: boolean | React.ReactNode,
    okLabel: string,
    cancelLabel: string,
    okColor: ButtonColor,
    buttonsDisabled: boolean | undefined,
    okDisabled: boolean | undefined,
    okLoading: boolean,
    onOk: (() => void) | undefined,
    onCancel: (() => void) | undefined,
    removeModal: () => void
): ButtonProps[] => {
    if (footer) {
        return [];
    }

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
};

// Helper: Get size-specific classes
interface SizeClasses {
    modal: string;
    backdrop: string;
    padding: string;
    header: string;
}

const getSizeClasses = (size: ModalSize, baseHeaderClasses: string): SizeClasses => {
    const sizeConfig: Record<ModalSize, SizeClasses> = {
        sm: {
            modal: 'max-w-[480px]',
            backdrop: 'p-4 md:p-[8vmin]',
            padding: 'p-8',
            header: clsx(baseHeaderClasses, '-inset-x-8')
        },
        md: {
            modal: 'max-w-[720px]',
            backdrop: 'p-4 md:p-[8vmin]',
            padding: 'p-8',
            header: clsx(baseHeaderClasses, '-inset-x-8')
        },
        lg: {
            modal: 'max-w-[1020px]',
            backdrop: 'p-4 md:p-[4vmin]',
            padding: 'p-7',
            header: clsx(baseHeaderClasses, '-inset-x-8')
        },
        xl: {
            modal: 'max-w-[1240px]',
            backdrop: 'p-4 md:p-[3vmin]',
            padding: 'p-10',
            header: clsx(baseHeaderClasses, '-inset-x-10 -top-10')
        },
        full: {
            modal: 'h-full',
            backdrop: 'p-4 md:p-[3vmin]',
            padding: 'p-10',
            header: clsx(baseHeaderClasses, '-inset-x-10')
        },
        bleed: {
            modal: 'h-full',
            backdrop: '',
            padding: 'p-10',
            header: clsx(baseHeaderClasses, '-inset-x-10')
        }
    };

    return sizeConfig[size];
};

// Helper: Build modal classes
const buildModalClasses = (
    align: 'center' | 'left' | 'right',
    size: ModalSize,
    formSheet: boolean,
    animate: boolean,
    animationFinished: boolean,
    scrolling: boolean,
    sizeClasses: SizeClasses
): string => {
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
        sizeClasses.modal
    );
};

// Helper: Build backdrop classes
const buildBackdropClasses = (
    size: ModalSize,
    formSheet: boolean,
    allowBackgroundInteraction: boolean,
    sizeClasses: SizeClasses
): string => {
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        sizeClasses.backdrop,
        'max-[800px]:!pb-20'
    );
};

// Helper: Apply width styles
const applyWidthStyles = (
    width: 'full' | 'toSidebar' | number | undefined,
    modalClasses: string
): {classes: string; styles: {width?: string; maxWidth?: string}} => {
    const styles: {width?: string; maxWidth?: string} = {};

    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = width + 'px';
    } else if (width === 'full') {
        modalClasses = clsx(modalClasses, 'w-full');
    } else if (width === 'toSidebar') {
        modalClasses = clsx(
            modalClasses,
            'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
        );
    }

    return {classes: modalClasses, styles};
};

// Helper: Apply height styles
const applyHeightStyles = (
    height: 'full' | number | undefined,
    modalClasses: string
): {classes: string; styles: {height?: string; maxHeight?: string}} => {
    const styles: {height?: string; maxHeight?: string} = {};

    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = height + 'px';
    } else if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

    return {classes: modalClasses, styles};
};

// Helper: Build content classes
const buildContentClasses = (
    paddingClasses: string,
    size: ModalSize,
    height: 'full' | number | undefined
): string => {
    return clsx(
        paddingClasses,
        'py-0',
        (size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow'
    );
};

// Helper: Build footer classes
const buildFooterClasses = (paddingClasses: string, stickyFooter: boolean): string => {
    return clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );
};

// Helper: Render footer content
const renderFooterContent = (
    footer: boolean | React.ReactNode,
    stickyFooter: boolean,
    footerClasses: string,
    buttons: ButtonProps[],
    leftButtonProps: ButtonProps | undefined
): React.ReactNode => {
    if (footer && footer !== true) {
        return footer;
    }

    if (footer === false) {
        return null;
    }

    const footerBody = (
        <div className={footerClasses}>
            <div>
                {leftButtonProps && <Button {...leftButtonProps} />}
            </div>
            <div className='flex gap-3'>
                <ButtonGroup buttons={buttons} />
            </div>
        </div>
    );

    return stickyFooter ? (
        <StickyFooter height={84}>
            {footerBody}
        </StickyFooter>
    ) : (
        footerBody
    );
};

// Helper: Render header
const renderHeader = (
    header: boolean | undefined,
    title: string | undefined,
    topRightContent: 'close' | React.ReactNode | undefined,
    hideXOnMobile: boolean,
    headerClasses: string,
    removeModal: () => void
): React.ReactNode => {
    if (header === false) {
        return null;
    }

    const showCloseButton = !topRightContent || topRightContent === 'close';

    return (
        <header className={headerClasses}>
            {title && <Heading level={3}>{title}</Heading>}
            {showCloseButton ? (
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
            ) : (
                topRightContent
            )}
        </header>
    );
};

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

    // Sync dirty state globally
    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    // Handle escape key
    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') {
                return;
            }

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
        };

        document.addEventListener('keydown', handleEscapeKey);
        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [modal, dirty, afterClose, onCancel]);

    // Handle animation finish
    useEffect(() => {
        const timeout = setTimeout(() => {
            setAnimationFinished(true);
        }, 250);

        return () => clearTimeout(timeout);
    }, []);

    // Handle CMD+S / CTRL+S
    useEffect(() => {
        if (!onOk || !enableCMDS) {
            return;
        }

        const handleCMDS = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                onOk();
            }
        };

        window.addEventListener('keydown', handleCMDS);
        return () => {
            window.removeEventListener('keydown', handleCMDS);
        };
    }, [onOk, enableCMDS]);

    // Remove modal with dirty check
    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    // Build button array
    const buttons = buildFooterButtons(
        footer,
        okLabel,
        cancelLabel,
        okColor,
        buttonsDisabled,
        okDisabled,
        okLoading,
        onOk,
        onCancel,
        removeModal
    );

    // Get size-specific classes
    const baseHeaderClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );

    const stickyHeaderClasses = stickyHeader
        ? clsx(baseHeaderClasses, 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black')
        : baseHeaderClasses;

    const sizeClasses = getSizeClasses(size, stickyHeaderClasses);

    // Build modal classes
    let modalClasses = buildModalClasses(
        align,
        size,
        formSheet,
        animate,
        animationFinished,
        scrolling,
        sizeClasses
    );

    // Build backdrop classes
    let backdropClasses = buildBackdropClasses(size, formSheet, allowBackgroundInteraction, sizeClasses);

    // Apply padding
    let paddingClasses = padding ? sizeClasses.padding : 'p-0';

    // Apply width styles
    const widthResult = applyWidthStyles(width, modalClasses);
    modalClasses = widthResult.classes;
    const modalStyles = widthResult.styles;

    // Apply height styles
    const heightResult = applyHeightStyles(height, modalClasses);
    modalClasses = heightResult.classes;
    Object.assign(modalStyles, heightResult.styles);

    // Build content classes
    const contentClasses = buildContentClasses(paddingClasses, size, height);

    // Build footer classes
    const footerClasses = buildFooterClasses(paddingClasses, stickyFooter);

    // Build header classes
    const headerClasses = clsx(sizeClasses.header, paddingClasses, 'pb-0');

    // Handle backdrop click
    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    // Render footer content
    const footerContent = renderFooterContent(footer, stickyFooter, footerClasses, buttons, leftButtonProps);

    // Render header
    const headerContent = renderHeader(header, title, topRightContent, hideXOnMobile, headerClasses, removeModal);

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section
                ref={ref}
                className={clsx(
                    modalClasses,
                    allowBackgroundInteraction && 'pointer-events-auto'
                )}
                data-testid={testId}
                style={modalStyles}
            >
                {headerContent}
                <div className={contentClasses}>
                    {children}
                </div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;
```