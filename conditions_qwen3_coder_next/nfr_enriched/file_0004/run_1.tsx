import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {useEffect, useState, forwardRef} from 'react';
import useGlobalDirtyState from '../../hooks/use-global-dirty-state';
import {confirmIfDirty} from '../../utils/modals';
import Button from '../button';
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
    okColor?: string;
    okLoading?: boolean;
    cancelLabel?: string;
    leftButtonProps?: object;
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
        const handleEscapeKey = createEscapeKeyHandler(
            modal,
            dirty,
            afterClose,
            onCancel,
            formSheet
        );
        document.addEventListener('keydown', handleEscapeKey);
        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [modal, dirty, afterClose, onCancel, formSheet]);

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

    const buttons = createModalButtons(
        footer,
        cancelLabel,
        okLabel,
        onCancel,
        onOk,
        buttonsDisabled,
        okDisabled,
        okLoading,
        okColor,
        removeModal,
        leftButtonProps
    );

    const {
        modalClasses,
        backdropClasses,
        headerClasses,
        contentClasses,
        footerClasses,
        paddingClasses,
        modalStyles
    } = useModalLayout(
        size,
        align,
        footer,
        padding,
        stickyHeader,
        stickyFooter,
        scrolling,
        backDrop,
        formSheet,
        animate,
        animationFinished,
        width,
        height,
        allowBackgroundInteraction
    );

    const footerContent = createFooterContent(
        footer,
        footerClasses,
        leftButtonProps,
        buttons,
        stickyFooter
    );

    return (
        <div className={backdropClasses} id="modal-backdrop" onMouseDown={handleBackdropClick(backDropClick, removeModal)}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section
                ref={ref}
                className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')}
                data-testid={testId}
                style={modalStyles}
            >
                {createHeader(header, title, topRightContent, hideXOnMobile, removeModal, headerClasses)}
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

// Helper functions extracting responsibilities:

/**
 * Creates header element based on configuration
 */
function createHeader(header, title, topRightContent, hideXOnMobile, removeModal, headerClasses) {
    if (header === false) return '';

    if (!topRightContent || topRightContent === 'close') {
        return (
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
        );
    }

    return (
        <header className={headerClasses}>
            {title && <Heading level={3}>{title}</Heading>}
            {topRightContent}
        </header>
    );
}

/**
 * Creates handleBackDropClick handler with specific behavior
 */
function handleBackdropClick(backDropClick, removeModal) {
    return function(e) {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };
}

/**
 * Extracts modal button creation logic
 */
function createModalButtons(
    footer,
    cancelLabel,
    okLabel,
    onCancel,
    onOk,
    buttonsDisabled,
    okDisabled,
    okLoading,
    okColor,
    removeModal,
    leftButtonProps
) {
    const buttons = [];

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

    return buttons;
}

/**
 * Creates footer content based on configuration
 */
function createFooterContent(footer, footerClasses, leftButtonProps, buttons, stickyFooter) {
    let footerContent;

    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        // Just a marker, no content needed
    } else {
        footerContent = (
            <div className={footerClasses}>
                <div>
                    {leftButtonProps && <Button {...leftButtonProps} />}
                </div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );
    }

    return stickyFooter
        ? <StickyFooter height={84}>{footerContent}</StickyFooter>
        : footerContent;
}

/**
 * Extracts modal layout configuration into single responsibility function
 */
function useModalLayout(
    size,
    align,
    footer,
    padding,
    stickyHeader,
    stickyFooter,
    scrolling,
    backDrop,
    formSheet,
    animate,
    animationFinished,
    width,
    height,
    allowBackgroundInteraction
) {
    let modalClasses;
    let backdropClasses;
    let headerClasses;
    let contentClasses;
    let footerClasses;
    let paddingClasses;
    let modalStyles = {};

    // Base modal classes
    modalClasses = clsx(
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

    // Base backdrop classes
    backdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none'
    );

    // Header classes base
    headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );

    if (stickyHeader) {
        headerClasses = clsx(
            headerClasses,
            'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );
    }

    // Size-specific styles
    const sizeConfig = getSizeConfig(size);
    modalClasses = clsx(modalClasses, sizeConfig.modal);
    backdropClasses = clsx(backdropClasses, sizeConfig.backdrop);
    paddingClasses = sizeConfig.padding;
    headerClasses = clsx(headerClasses, sizeConfig.header);

    if (!padding) {
        paddingClasses = 'p-0';
    }

    modalClasses = clsx(modalClasses);

    headerClasses = clsx(
        headerClasses,
        paddingClasses,
        'pb-0'
    );

    contentClasses = clsx(
        paddingClasses,
        'py-0'
    );

    backdropClasses = clsx(
        backdropClasses,
        'max-[800px]:!pb-20'
    );

    footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    contentClasses = clsx(
        contentClasses,
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    // Width / Height styling
    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = width + 'px';
    } else if (width === 'full') {
        modalClasses = clsx(modalClasses, 'w-full');
    } else if (width === 'toSidebar') {
        modalClasses = clsx(
            modalClasses,
            'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
        );
    }

    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = height + 'px';
    } else if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

    return {modalClasses, backdropClasses, headerClasses, contentClasses, footerClasses, paddingClasses, modalStyles};
}

/**
 * Returns size-based configuration values for modal layout
 */
function getSizeConfig(size) {
    switch (size) {
    case 'sm':
        return {
            modal: 'max-w-[480px]',
            backdrop: 'p-4 md:p-[8vmin]',
            padding: 'p-8',
            header: '-inset-x-8'
        };
    case 'md':
        return {
            modal: 'max-w-[720px]',
            backdrop: 'p-4 md:p-[8vmin]',
            padding: 'p-8',
            header: '-inset-x-8'
        };
    case 'lg':
        return {
            modal: 'max-w-[1020px]',
            backdrop: 'p-4 md:p-[4vmin]',
            padding: 'p-7',
            header: '-inset-x-8'
        };
    case 'xl':
        return {
            modal: 'max-w-[1240px]0',
            backdrop: 'p-4 md:p-[3vmin]',
            padding: 'p-10',
            header: '-inset-x-10 -top-10'
        };
    case 'full':
    case 'bleed':
        return {
            modal: 'h-full',
            backdrop: size === 'full' ? 'p-4 md:p-[3vmin]' : 'p-4 md:p-[8vmin]',
            padding: 'p-10',
            header: '-inset-x-10'
        };
    default:
        return {
            modal: '',
            backdrop: 'p-4 md:p-[8vmin]',
            padding: 'p-8',
            header: '-inset-x-8'
        };
    }
}

/**
 * Creates escape key handler that follows modal behavior
 */
function createEscapeKeyHandler(modal, dirty, afterClose, onCancel, formSheet) {
    return function(event) {
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
            }, 0);

            event.stopPropagation();
        }
    };
}