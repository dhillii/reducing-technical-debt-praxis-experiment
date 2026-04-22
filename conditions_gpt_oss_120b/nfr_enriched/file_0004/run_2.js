import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {useEffect, useState, forwardRef, MouseEvent, KeyboardEvent} from 'react';
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

/** Handles Escape key to close the modal, respecting dirty state and custom cancel logic. */
function useEscapeHandler(
    onCancel: (() => void) | undefined,
    dirty: boolean,
    afterClose: (() => void) | undefined,
    modal: ReturnType<typeof useModal>
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
    }, [onCancel, dirty, afterClose, modal]);
}

/** Handles CMD/CTRL+S shortcut when enabled. */
function useCMDSHandler(onOk: (() => void) | undefined, enableCMDS: boolean) {
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
}

/* ---------- Utility Functions ---------- */

/** Builds the button list for the default footer. */
function buildDefaultButtons(
    cancelLabel: string | undefined,
    okLabel: string | undefined,
    okColor: ButtonColor,
    okLoading: boolean,
    buttonsDisabled: boolean | undefined,
    okDisabled: boolean | undefined,
    onCancel: (() => void) | undefined,
    onOk: (() => void) | undefined,
    removeModal: () => void
): ButtonProps[] {
    const buttons: ButtonProps[] = [];

    if (cancelLabel) {
        buttons.push({
            key: 'cancel-modal',
            label: cancelLabel,
            color: 'outline',
            onClick: onCancel ?? removeModal,
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

/** Returns modal, backdrop and padding class strings based on size and other props. */
function computeSizeClasses(
    size: ModalSize | undefined,
    align: 'center' | 'left' | 'right',
    formSheet: boolean,
    animate: boolean,
    animationFinished: boolean,
    scrolling: boolean
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

    let paddingClasses = '';
    let headerClasses = clsx((!true) ? '' : 'flex items-center justify-between gap-5'); // placeholder, refined later

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

    return {modalClasses, backdropClasses, paddingClasses, headerClasses};
}

/** Adjusts classes for sticky header/footer and padding overrides. */
function applyStickyAndPadding(
    stickyHeader: boolean,
    stickyFooter: boolean,
    headerClasses: string,
    paddingClasses: string,
    allowBackgroundInteraction: boolean,
    backDrop: boolean,
    formSheet: boolean
) {
    let updatedHeader = headerClasses;
    if (stickyHeader) {
        updatedHeader = clsx(
            updatedHeader,
            'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );
    }

    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    const backdrop = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none'
    );

    const backdropOverlay = clsx(
        'pointer-events-none fixed inset-0 z-0',
        (backDrop && !formSheet) && topLevelBackdropClasses,
        formSheet && 'bg-[rgba(98,109,121,0.08)]'
    );

    return {updatedHeader, footerClasses, backdrop, backdropOverlay};
}

/** Generates inline styles for width/height based on props. */
function getModalStyles(
    width: 'full' | 'toSidebar' | number | undefined,
    height: 'full' | number | undefined,
    modalClasses: string,
    setModalClasses: (c: string) => void
) {
    const styles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string} = {};

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

/** Renders the modal header based on props. */
function renderHeader(
    title: string | undefined,
    topRightContent: 'close' | React.ReactNode | undefined,
    hideXOnMobile: boolean,
    removeModal: () => void,
    headerClasses: string
) {
    if (topRightContent && topRightContent !== 'close') {
        return (
            <header className={headerClasses}>
                {title && <Heading level={3}>{title}</Heading>}
                {topRightContent}
            </header>
        );
    }

    return (
        <header className={headerClasses}>
            {title && <Heading level={3}>{title}</Heading>}
            <div
                className={clsx(
                    `${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`
                )}
            >
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

    // Animation completion flag
    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

    // Escape key handling
    useEscapeHandler(onCancel, dirty, afterClose, modal);

    // CMD/CTRL+S handling
    useCMDSHandler(onOk, enableCMDS);

    // Remove modal with dirty confirmation
    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    // Build default button list when footer not supplied
    const defaultButtons = (!footer) ? buildDefaultButtons(
        cancelLabel,
        okLabel,
        okColor,
        okLoading,
        buttonsDisabled,
        okDisabled,
        onCancel,
        onOk,
        removeModal
    ) : [];

    // Compute size‑related classes
    const {
        modalClasses: baseModalClasses,
        backdropClasses: baseBackdropClasses,
        paddingClasses,
        headerClasses: baseHeaderClasses
    } = computeSizeClasses(size, align, formSheet, animate, animationFinished, scrolling);

    // Apply sticky and padding adjustments
    const {
        updatedHeader: finalHeaderClasses,
        footerClasses,
        backdrop: backdropBase,
        backdropOverlay
    } = applyStickyAndPadding(
        stickyHeader,
        stickyFooter,
        baseHeaderClasses,
        paddingClasses,
        allowBackgroundInteraction,
        backDrop,
        formSheet
    );

    // Apply padding override
    const effectivePadding = padding ? paddingClasses : 'p-0';

    // Update modal classes state (needed for width/height adjustments)
    useEffect(() => {
        setModalClasses(baseModalClasses);
    }, [baseModalClasses]);

    // Inline styles for width/height
    const modalStyles = getModalStyles(width, height, modalClasses, setModalClasses);

    // Content wrapper classes
    const contentClasses = clsx(
        effectivePadding,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    // Backdrop click handling
    const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    // Footer rendering
    let footerContent: React.ReactNode;
    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        footerContent = null;
    } else {
        footerContent = (
            <div className={footerClasses}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={defaultButtons} />
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

    // Final backdrop class composition
    const finalBackdropClasses = clsx(
        backdropBase,
        'max-[800px]:!pb-20',
        allowBackgroundInteraction && 'pointer-events-none'
    );

    return (
        <div className={finalBackdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={backdropOverlay} />
            <section
                ref={ref}
                className={clsx(
                    modalClasses,
                    allowBackgroundInteraction && 'pointer-events-auto'
                )}
                data-testid={testId}
                style={modalStyles}
            >
                {header === false ? null : renderHeader(title, topRightContent, hideXOnMobile, removeModal, finalHeaderClasses)}
                <div className={contentClasses}>{children}</div>
                {renderedFooter}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;