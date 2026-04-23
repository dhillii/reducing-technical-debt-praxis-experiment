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

/* ---------- Helper Hooks ---------- */

/**
 * Handles Escape key to close the modal, respecting dirty state and custom cancel logic.
 */
function useEscapeHandler(
    modal: ReturnType<typeof useModal>,
    dirty: boolean,
    onCancel?: () => void,
    afterClose?: () => void
) {
    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            const activeEl = document.activeElement as HTMLElement | null;
            if (activeEl?.hasAttribute('data-kg-link-input')) {
                return;
            }

            activeEl?.blur();

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
 * Handles CMD/CTRL+S shortcut to trigger onOk when enabled.
 */
function useCMDSHandler(onOk?: () => void, enableCMDS = true) {
    useEffect(() => {
        if (!onOk) return;

        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                onOk();
            }
        };

        if (enableCMDS) {
            window.addEventListener('keydown', handler);
            return () => window.removeEventListener('keydown', handler);
        }
    }, [onOk, enableCMDS]);
}

/* ---------- Helper Functions ---------- */

/**
 * Builds the array of button props for the footer when `footer` is not provided.
 */
function buildFooterButtons(
    cancelLabel: string | undefined,
    okLabel: string | undefined,
    okColor: ButtonColor,
    okLoading: boolean,
    onOk?: () => void,
    onCancel?: () => void,
    removeModal?: () => void,
    buttonsDisabled?: boolean,
    okDisabled?: boolean
): ButtonProps[] {
    const buttons: ButtonProps[] = [];

    if (cancelLabel) {
        buttons.push({
            key: 'cancel-modal',
            label: cancelLabel,
            color: 'outline',
            onClick: onCancel ?? removeModal ?? (() => {}),
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
 * Returns modal, backdrop and padding class strings based on size and other props.
 */
function computeSizeClasses(
    size: ModalSize | undefined,
    align: 'center' | 'left' | 'right',
    formSheet: boolean,
    animate: boolean,
    animationFinished: boolean,
    scrolling: boolean,
    stickyHeader: boolean,
    padding: boolean
) {
    let modalClasses = clsx(
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

    let backdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        // allowBackgroundInteraction handled later
    );

    let paddingClasses = padding ? 'p-8' : 'p-0';
    let headerClasses = clsx((!padding) ? '' : 'flex items-center justify-between gap-5');

    if (stickyHeader) {
        headerClasses = clsx(
            headerClasses,
            'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );
    }

    switch (size) {
        case 'sm':
            modalClasses = clsx(modalClasses, 'max-w-[480px]');
            backdropClasses = clsx(backdropClasses, 'p-4 md:p-[8vmin]');
            paddingClasses = 'p-8';
            headerClasses = clsx(headerClasses, '-inset-x-8');
            break;
        case 'md':
            modalClasses = clsx(modalClasses, 'max-w-[720px]');
            backdropClasses = clsx(backdropClasses, 'p-4 md:p-[8vmin]');
            paddingClasses = 'p-8';
            headerClasses = clsx(headerClasses, '-inset-x-8');
            break;
        case 'lg':
            modalClasses = clsx(modalClasses, 'max-w-[1020px]');
            backdropClasses = clsx(backdropClasses, 'p-4 md:p-[4vmin]');
            paddingClasses = 'p-7';
            headerClasses = clsx(headerClasses, '-inset-x-8');
            break;
        case 'xl':
            modalClasses = clsx(modalClasses, 'max-w-[1240px]0');
            backdropClasses = clsx(backdropClasses, 'p-4 md:p-[3vmin]');
            paddingClasses = 'p-10';
            headerClasses = clsx(headerClasses, '-inset-x-10 -top-10');
            break;
        case 'full':
            modalClasses = clsx(modalClasses, 'h-full');
            backdropClasses = clsx(backdropClasses, 'p-4 md:p-[3vmin]');
            paddingClasses = 'p-10';
            headerClasses = clsx(headerClasses, '-inset-x-10');
            break;
        case 'bleed':
            modalClasses = clsx(modalClasses, 'h-full');
            paddingClasses = 'p-10';
            headerClasses = clsx(headerClasses, '-inset-x-10');
            break;
        default:
            backdropClasses = clsx(backdropClasses, 'p-4 md:p-[8vmin]');
            paddingClasses = 'p-8';
            headerClasses = clsx(headerClasses, '-inset-x-8');
            break;
    }

    // final adjustments
    headerClasses = clsx(headerClasses, paddingClasses, 'pb-0');
    const contentClasses = clsx(paddingClasses, 'py-0');
    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    // backdrop extra responsive padding
    backdropClasses = clsx(backdropClasses, 'max-[800px]:!pb-20');

    return {
        modalClasses,
        backdropClasses,
        headerClasses,
        contentClasses,
        footerClasses,
        paddingClasses
    };
}

/**
 * Returns inline style object for width/height based on numeric or keyword values.
 */
function computeModalStyles(
    width: 'full' | 'toSidebar' | number | undefined,
    height: 'full' | number | undefined,
    modalClasses: string,
    setModalClasses: (cls: string) => void
) {
    const styles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = `${width}px`;
    } else if (width === 'full') {
        setModalClasses(clsx(modalClasses, 'w-full'));
    } else if (width === 'toSidebar') {
        setModalClasses(
            clsx(
                modalClasses,
                'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
            )
        );
    }

    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        setModalClasses(clsx(modalClasses, 'h-full'));
    }

    return styles;
}

/* ---------- Main Component ---------- */

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
    const [modalClasses, setModalClasses] = useState<string>('');

    // Global dirty state sync
    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    // Animation finish flag
    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

    // Escape key handling
    useEscapeHandler(modal, dirty, onCancel, afterClose);

    // CMD/CTRL+S handling
    useCMDSHandler(onOk, enableCMDS);

    // Remove modal with dirty confirmation
    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    // Build footer buttons when needed
    const footerButtons = buildFooterButtons(
        cancelLabel,
        okLabel,
        okColor,
        okLoading,
        onOk,
        onCancel,
        removeModal,
        buttonsDisabled,
        okDisabled
    );

    // Compute size‑related classes
    const {
        modalClasses: baseModalClasses,
        backdropClasses,
        headerClasses,
        contentClasses,
        footerClasses,
        paddingClasses
    } = computeSizeClasses(
        size,
        align,
        formSheet,
        animate,
        animationFinished,
        scrolling,
        stickyHeader,
        padding
    );

    // Apply width/height overrides
    const modalStyles = computeModalStyles(
        width,
        height,
        baseModalClasses,
        setModalClasses
    );

    // Ensure modalClasses reflects any width/height adjustments
    const finalModalClasses = modalClasses || baseModalClasses;

    // Backdrop click handling
    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    // Footer rendering
    let footerContent: React.ReactNode;
    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        // No footer, adjust content padding
        // (contentClasses already includes padding, we just ensure no extra space)
        footerContent = null;
    } else {
        footerContent = (
            <div className={footerClasses}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={footerButtons} />
                </div>
            </div>
        );
    }

    // Wrap sticky footer if required
    const renderedFooter = stickyFooter ? (
        <StickyFooter height={84}>{footerContent}</StickyFooter>
    ) : (
        <>{footerContent}</>
    );

    // Header rendering
    const renderHeader = () => {
        if (header === false) return null;

        const closeButton = (
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
        );

        if (!topRightContent || topRightContent === 'close') {
            return (
                <header className={headerClasses}>
                    {title && <Heading level={3}>{title}</Heading>}
                    {closeButton}
                </header>
            );
        }

        return (
            <header className={headerClasses}>
                {title && <Heading level={3}>{title}</Heading>}
                {topRightContent}
            </header>
        );
    };

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )} />
            <section
                ref={ref}
                className={clsx(
                    finalModalClasses,
                    allowBackgroundInteraction && 'pointer-events-auto'
                )}
                data-testid={testId}
                style={modalStyles}
            >
                {renderHeader()}
                <div className={contentClasses}>{children}</div>
                {renderedFooter}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;