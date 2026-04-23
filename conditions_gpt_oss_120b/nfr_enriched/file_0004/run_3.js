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

/**
 * Handles Escape key to close the modal, respecting dirty state and custom cancel logic.
 */
function useEscapeHandler(
    onCancel: (() => void) | undefined,
    dirty: boolean,
    afterClose: (() => void) | undefined,
    modal: {remove: () => void}
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

/* ---------- Class Computation ---------- */

function computeModalClasses(params: {
    align: string;
    size: ModalSize;
    formSheet: boolean;
    animate: boolean;
    animationFinished: boolean;
    scrolling: boolean;
}) {
    const {align, size, formSheet, animate, animationFinished, scrolling} = params;
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
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
    );
}

function computeSizeSpecificClasses(
    size: ModalSize,
    baseModal: string,
    baseBackdrop: string,
    baseHeader: string
) {
    let modal = baseModal;
    let backdrop = baseBackdrop;
    let header = baseHeader;
    let padding = 'p-8';

    switch (size) {
        case 'sm':
            modal = clsx(modal, 'max-w-[480px]');
            backdrop = clsx(backdrop, 'p-4 md:p-[8vmin]');
            header = clsx(header, '-inset-x-8');
            break;
        case 'md':
            modal = clsx(modal, 'max-w-[720px]');
            backdrop = clsx(backdrop, 'p-4 md:p-[8vmin]');
            header = clsx(header, '-inset-x-8');
            break;
        case 'lg':
            modal = clsx(modal, 'max-w-[1020px]');
            backdrop = clsx(backdrop, 'p-4 md:p-[4vmin]');
            padding = 'p-7';
            header = clsx(header, '-inset-x-8');
            break;
        case 'xl':
            modal = clsx(modal, 'max-w-[1240px]0');
            backdrop = clsx(backdrop, 'p-4 md:p-[3vmin]');
            padding = 'p-10';
            header = clsx(header, '-inset-x-10 -top-10');
            break;
        case 'full':
            modal = clsx(modal, 'h-full');
            backdrop = clsx(backdrop, 'p-4 md:p-[3vmin]');
            padding = 'p-10';
            header = clsx(header, '-inset-x-10');
            break;
        case 'bleed':
            modal = clsx(modal, 'h-full');
            padding = 'p-10';
            header = clsx(header, '-inset-x-10');
            break;
        default:
            backdrop = clsx(backdrop, 'p-4 md:p-[8vmin]');
            header = clsx(header, '-inset-x-8');
            break;
    }

    return {modal, backdrop, header, padding};
}

function computeBackdropClasses(base: string, allowBackgroundInteraction: boolean) {
    return clsx(
        base,
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        'max-[800px]:!pb-20'
    );
}

function computeHeaderClasses(base: string, topRightContent: React.ReactNode | undefined, stickyHeader: boolean) {
    let classes = clsx(base, (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5');
    if (stickyHeader) {
        classes = clsx(classes, 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black');
    }
    return classes;
}

/* ---------- Button & Footer Generation ---------- */

function buildActionButtons(params: {
    cancelLabel?: string;
    okLabel?: string;
    okColor: ButtonColor;
    okLoading: boolean;
    leftButtonProps?: ButtonProps;
    onOk?: () => void;
    onCancel?: () => void;
    removeModal: () => void;
    buttonsDisabled?: boolean;
    okDisabled?: boolean;
}) {
    const {
        cancelLabel,
        okLabel,
        okColor,
        okLoading,
        onOk,
        onCancel,
        removeModal,
        buttonsDisabled,
        okDisabled
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

function renderFooterContent(params: {
    footer?: boolean | React.ReactNode;
    leftButtonProps?: ButtonProps;
    buttons: ButtonProps[];
    stickyFooter: boolean;
    padding: string;
}) {
    const {footer, leftButtonProps, buttons, stickyFooter, padding} = params;

    const footerClasses = clsx(
        `${padding} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    const defaultFooter = (
        <div className={footerClasses}>
            <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
            <div className='flex gap-3'>
                <ButtonGroup buttons={buttons} />
            </div>
        </div>
    );

    const content = footer === true ? defaultFooter : footer ?? defaultFooter;

    return stickyFooter ? <StickyFooter height={84}>{content}</StickyFooter> : <>{content}</>;
}

/* ---------- Modal Component ---------- */

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
    useEffect(() => setTimeout(() => setAnimationFinished(true), 250), []);
    useEscapeHandler(onCancel, dirty, afterClose, modal);
    useCMDSHandler(onOk, enableCMDS);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const actionButtons = buildActionButtons({
        cancelLabel,
        okLabel,
        okColor,
        okLoading,
        onOk,
        onCancel,
        removeModal,
        buttonsDisabled,
        okDisabled
    });

    const baseModalClasses = computeModalClasses({
        align,
        size,
        formSheet,
        animate,
        animationFinished,
        scrolling
    });

    const baseBackdrop = backDrop ? '' : '';
    const baseHeader = '';

    const {modal: sizeModal, backdrop: sizeBackdrop, header: sizeHeader, padding: sizePadding} = computeSizeSpecificClasses(
        size,
        baseModalClasses,
        baseBackdrop,
        baseHeader
    );

    const finalBackdropClasses = computeBackdropClasses(sizeBackdrop, allowBackgroundInteraction);
    const finalHeaderClasses = computeHeaderClasses(sizeHeader, topRightContent, stickyHeader);
    const finalModalClasses = clsx(
        sizeModal,
        allowBackgroundInteraction && 'pointer-events-auto'
    );

    const contentPadding = padding ? sizePadding : 'p-0';
    const contentClasses = clsx(
        contentPadding,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    const modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = `${width}px`;
    } else if (width === 'full') {
        finalModalClasses && (finalModalClasses as any);
    } else if (width === 'toSidebar') {
        // handled via class addition below
    }

    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        // handled via class addition below
    }

    // Apply width/height specific classes
    const widthClass = typeof width === 'string' ? (
        width === 'full' ? 'w-full' :
        width === 'toSidebar' ? 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]' :
        ''
    ) : '';

    const heightClass = height === 'full' ? 'h-full' : '';

    const finalModalWithSize = clsx(finalModalClasses, widthClass, heightClass);

    const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const footerContent = renderFooterContent({
        footer,
        leftButtonProps,
        buttons: actionButtons,
        stickyFooter,
        padding: contentPadding
    });

    return (
        <div className={finalBackdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                backDrop && !formSheet && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )} />
            <section
                ref={ref}
                className={finalModalWithSize}
                data-testid={testId}
                style={modalStyles}
            >
                {header === false ? null : (
                    topRightContent && topRightContent !== 'close' ? (
                        <header className={finalHeaderClasses}>
                            {title && <Heading level={3}>{title}</Heading>}
                            {topRightContent}
                        </header>
                    ) : (
                        <header className={finalHeaderClasses}>
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