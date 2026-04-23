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

/* Hook: handle Escape key to close modal */
function useEscapeKey(modal: any, dirty: boolean, afterClose?: () => void, onCancel?: () => void) {
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

/* Hook: handle CMD/CTRL+S shortcut */
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

/* Build button list for default footer */
function buildDefaultButtons(params: {
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

    const btns: ButtonProps[] = [];

    if (cancelLabel) {
        btns.push({
            key: 'cancel-modal',
            label: cancelLabel,
            color: 'outline',
            onClick: onCancel ? onCancel : removeModal,
            disabled: buttonsDisabled
        });
    }

    if (okLabel) {
        btns.push({
            key: 'ok-modal',
            label: okLabel,
            color: okColor,
            className: 'min-w-[80px]',
            onClick: onOk,
            disabled: buttonsDisabled || okDisabled,
            loading: okLoading
        });
    }

    return btns;
}

/* Compute size‑specific class fragments */
function getSizeClassConfig(size: ModalSize | undefined) {
    switch (size) {
        case 'sm':
            return {maxW: 'max-w-[480px]', backdropPad: 'p-4 md:p-[8vmin]', pad: 'p-8', headerInset: '-inset-x-8'};
        case 'md':
            return {maxW: 'max-w-[720px]', backdropPad: 'p-4 md:p-[8vmin]', pad: 'p-8', headerInset: '-inset-x-8'};
        case 'lg':
            return {maxW: 'max-w-[1020px]', backdropPad: 'p-4 md:p-[4vmin]', pad: 'p-7', headerInset: '-inset-x-8'};
        case 'xl':
            return {maxW: 'max-w-[1240px]0', backdropPad: 'p-4 md:p-[3vmin]', pad: 'p-10', headerInset: '-inset-x-10 -top-10'};
        case 'full':
            return {fullHeight: true, backdropPad: 'p-4 md:p-[3vmin]', pad: 'p-10', headerInset: '-inset-x-10'};
        case 'bleed':
            return {fullHeight: true, pad: 'p-10', headerInset: '-inset-x-10'};
        default:
            return {backdropPad: 'p-4 md:p-[8vmin]', pad: 'p-8', headerInset: '-inset-x-8'};
    }
}

/* Compute modal inline styles and extra class tweaks for width/height props */
function getDimensionStyles(params: {
    width?: 'full' | 'toSidebar' | number;
    height?: 'full' | number;
    modalClasses: string;
}) {
    const {width, height, modalClasses: baseClasses} = params;
    const styles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string} = {};
    let modalClasses = baseClasses;

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

    return {styles, modalClasses};
}

/* Render header based on props */
function renderHeader(params: {
    header?: boolean;
    title?: string;
    topRightContent?: 'close' | React.ReactNode;
    hideXOnMobile?: boolean;
    headerClasses: string;
    removeModal: () => void;
}) {
    const {header, title, topRightContent, hideXOnMobile, headerClasses, removeModal} = params;
    if (header === false) return null;

    const closeBtn = (
        <Button
            className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100'
            icon='close'
            iconColorClass='text-black dark:text-white'
            size='sm'
            testId='close-modal'
            unstyled
            onClick={removeModal}
        />
    );

    if (!topRightContent || topRightContent === 'close') {
        return (
            <header className={headerClasses}>
                {title && <Heading level={3}>{title}</Heading>}
                <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                    {closeBtn}
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

/* Render footer (default or custom) */
function renderFooter(params: {
    footer?: boolean | React.ReactNode;
    stickyFooter: boolean;
    leftButtonProps?: ButtonProps;
    buttons: ButtonProps[];
    paddingClasses: string;
}) {
    const {footer, stickyFooter, leftButtonProps, buttons, paddingClasses} = params;

    const defaultFooter = (
        <div className={clsx(`${paddingClasses} ${stickyFooter ? 'py-6' : ''}`, 'flex w-full items-center justify-between')}>
            <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
            <div className='flex gap-3'>
                <ButtonGroup buttons={buttons} />
            </div>
        </div>
    );

    const content = footer === true ? defaultFooter : footer ?? defaultFooter;

    return stickyFooter ? <StickyFooter height={84}>{content}</StickyFooter> : <>{content}</>;
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

    useEffect(() => setGlobalDirtyState(dirty), [dirty, setGlobalDirtyState]);
    useEscapeKey(modal, dirty, afterClose, onCancel);
    useCMDSHandler(onOk, enableCMDS);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    // Animation completion flag
    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

    // Build default button set
    const buttons = buildDefaultButtons({
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

    // Base modal classes
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

    // Backdrop base classes
    let backdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none'
    );

    // Size‑specific tweaks
    const sizeConfig = getSizeClassConfig(size);
    if (sizeConfig.maxW) modalClasses = clsx(modalClasses, sizeConfig.maxW);
    if (sizeConfig.fullHeight) modalClasses = clsx(modalClasses, 'h-full');
    backdropClasses = clsx(backdropClasses, sizeConfig.backdropPad ?? '');
    let paddingClasses = sizeConfig.pad ?? 'p-8';
    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        sizeConfig.headerInset ?? ''
    );

    if (stickyHeader) {
        headerClasses = clsx(headerClasses, 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black');
    }

    if (!padding) paddingClasses = 'p-0';

    // Apply dimension overrides
    const {styles: modalStyles, modalClasses: finalModalClasses} = getDimensionStyles({
        width,
        height,
        modalClasses
    });
    modalClasses = finalModalClasses;

    // Content wrapper classes
    let contentClasses = clsx(paddingClasses, 'py-0', ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow'));

    // Backdrop final tweaks
    backdropClasses = clsx(backdropClasses, 'max-[800px]:!pb-20');

    // Header final composition
    headerClasses = clsx(headerClasses, paddingClasses, 'pb-0');

    // Backdrop click handler
    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    // Footer rendering
    const footerContent = renderFooter({
        footer,
        stickyFooter,
        leftButtonProps,
        buttons,
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
                {renderHeader({
                    header,
                    title,
                    topRightContent,
                    hideXOnMobile,
                    headerClasses,
                    removeModal
                })}
                <div className={contentClasses}>{children}</div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;