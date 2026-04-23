import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {useEffect, useState, forwardRef, MouseEvent} from 'react';
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

/**
 * Handles CMD/CTRL+S shortcut to trigger onOk when enabled.
 */
function useCMDSHandler(onOk: (() => void) | undefined, enableCMDS: boolean) {
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

/* ---------- Class & Style Builders ---------- */

function buildModalClasses(
    size: ModalSize,
    align: 'center' | 'left' | 'right',
    formSheet: boolean,
    animate: boolean,
    animationFinished: boolean,
    scrolling: boolean
) {
    const base = clsx(
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

    const sizeMap: Record<ModalSize, string> = {
        sm: 'max-w-[480px]',
        md: 'max-w-[720px]',
        lg: 'max-w-[1020px]',
        xl: 'max-w-[1240px]0',
        full: '',
        bleed: ''
    };

    return clsx(base, sizeMap[size] ?? '');
}

function buildBackdropClasses(backDrop: boolean, formSheet: boolean, allowBackgroundInteraction: boolean) {
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        backDrop && !formSheet && topLevelBackdropClasses,
        formSheet && 'bg-[rgba(98,109,121,0.08)]'
    );
}

function buildPaddingClasses(padding: boolean) {
    return padding ? 'p-8' : 'p-0';
}

function buildHeaderClasses(
    topRightContent: 'close' | React.ReactNode | undefined,
    stickyHeader: boolean,
    size: ModalSize
) {
    const base = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
        size === 'xl' ? '-inset-x-10 -top-10' : '-inset-x-8'
    );
    return base;
}

function buildFooterClasses(paddingClasses: string, stickyFooter: boolean) {
    return clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );
}

function buildContentClasses(paddingClasses: string, size: ModalSize, height: 'full' | number | undefined) {
    const growCondition =
        size === 'full' ||
        size === 'bleed' ||
        height === 'full' ||
        typeof height === 'number';
    return clsx(paddingClasses, 'py-0', growCondition && 'grow');
}

/**
 * Generates button definitions for the default footer.
 */
function generateDefaultButtons(
    cancelLabel: string | undefined,
    okLabel: string | undefined,
    okColor: ButtonColor,
    okLoading: boolean,
    onOk: (() => void) | undefined,
    onCancel: (() => void) | undefined,
    removeModal: () => void,
    buttonsDisabled: boolean | undefined,
    okDisabled: boolean | undefined
): ButtonProps[] {
    const buttons: ButtonProps[] = [];

    if (cancelLabel) {
        buttons.push({
            key: 'cancel-modal',
            label: cancelLabel,
            color: 'outline',
            onClick: onCancel ?? removeModal,
            disabled: !!buttonsDisabled
        });
    }

    if (okLabel) {
        buttons.push({
            key: 'ok-modal',
            label: okLabel,
            color: okColor,
            className: 'min-w-[80px]',
            onClick: onOk,
            disabled: !!buttonsDisabled || !!okDisabled,
            loading: okLoading
        });
    }

    return buttons;
}

/**
 * Computes inline style object for width/height based on props.
 */
function computeModalStyles(width: 'full' | 'toSidebar' | number | undefined, height: 'full' | number | undefined) {
    const styles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string} = {};

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
 * Returns additional class adjustments for width/height specific values.
 */
function applySizeSpecificClasses(
    classes: string,
    width: 'full' | 'toSidebar' | number | undefined,
    height: 'full' | number | undefined
) {
    let updated = classes;

    if (width === 'full') {
        updated = clsx(updated, 'w-full');
    } else if (width === 'toSidebar') {
        updated = clsx(
            updated,
            'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
        );
    }

    if (height === 'full') {
        updated = clsx(updated, 'h-full');
    }

    return updated;
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

    // Sync global dirty state
    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    // Animation finish flag
    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

    // Escape key handling
    useEscapeHandler(onCancel, dirty, afterClose, modal);

    // CMD/CTRL+S handling
    useCMDSHandler(onOk, enableCMDS);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const defaultButtons = generateDefaultButtons(
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

    const modalClassesBase = buildModalClasses(size, align, formSheet, animate, animationFinished, scrolling);
    const modalClasses = applySizeSpecificClasses(modalClassesBase, width, height);

    const backdropClasses = buildBackdropClasses(backDrop, formSheet, allowBackgroundInteraction);
    const paddingClasses = buildPaddingClasses(padding);
    const headerClasses = buildHeaderClasses(topRightContent, stickyHeader, size);
    const footerClasses = buildFooterClasses(paddingClasses, stickyFooter);
    const contentClasses = buildContentClasses(paddingClasses, size, height);
    const modalStyles = computeModalStyles(width, height);

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
        // No footer, ensure content bottom padding is removed
        footerContent = null;
    } else {
        footerContent = (
            <div className={footerClasses}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className="flex gap-3">
                    <ButtonGroup buttons={defaultButtons} />
                </div>
            </div>
        );
    }

    const renderedFooter = stickyFooter ? (
        <StickyFooter height={84}>{footerContent}</StickyFooter>
    ) : (
        <>{footerContent}</>
    );

    // Header rendering
    const renderHeader = () => {
        if (header === false) return null;

        const closeButton = (
            <Button
                className="-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100"
                icon="close"
                iconColorClass="text-black dark:text-white"
                size="sm"
                testId="close-modal"
                unstyled
                onClick={removeModal}
            />
        );

        const closeWrapper = (
            <div
                className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}
            >
                {closeButton}
            </div>
        );

        if (!topRightContent || topRightContent === 'close') {
            return (
                <header className={headerClasses}>
                    {title && <Heading level={3}>{title}</Heading>}
                    {closeWrapper}
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
        <div className={backdropClasses} id="modal-backdrop" onMouseDown={handleBackdropClick}>
            <section
                ref={ref}
                className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')}
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