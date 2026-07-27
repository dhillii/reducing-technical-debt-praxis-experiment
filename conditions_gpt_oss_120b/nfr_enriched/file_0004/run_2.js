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

/* Escape key handling */
function useEscapeHandler(modal: any, dirty: boolean, afterClose?: () => void, onCancel?: () => void) {
    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

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

/* CMD+S handling */
function useCMDSHandler(enableCMDS: boolean, dirty: boolean, onOk?: () => void, modal: any, afterClose?: () => void) {
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
            return () => window.removeEventListener('keydown', handleCMDS);
        }
    }, [enableCMDS, dirty, onOk, modal, afterClose]);
}

/* Build button list */
function buildButtons(params: {
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

/* Size based class configuration */
const sizeConfig: Record<ModalSize, {
    modalMax?: string;
    backdropPadding?: string;
    padding?: string;
    headerInset?: string;
}> = {
    sm: {modalMax: 'max-w-[480px]', backdropPadding: 'p-4 md:p-[8vmin]', padding: 'p-8', headerInset: '-inset-x-8'},
    md: {modalMax: 'max-w-[720px]', backdropPadding: 'p-4 md:p-[8vmin]', padding: 'p-8', headerInset: '-inset-x-8'},
    lg: {modalMax: 'max-w-[1020px]', backdropPadding: 'p-4 md:p-[4vmin]', padding: 'p-7', headerInset: '-inset-x-8'},
    xl: {modalMax: 'max-w-[1240px]0', backdropPadding: 'p-4 md:p-[3vmin]', padding: 'p-10', headerInset: '-inset-x-10 -top-10'},
    full: {modalMax: undefined, backdropPadding: 'p-4 md:p-[3vmin]', padding: 'p-10', headerInset: '-inset-x-10'},
    bleed: {modalMax: undefined, backdropPadding: undefined, padding: 'p-10', headerInset: '-inset-x-10'}
};

/* Compute classes based on props */
function computeClasses(options: {
    size: ModalSize;
    align: 'center' | 'left' | 'right';
    formSheet: boolean;
    animate: boolean;
    animationFinished: boolean;
    scrolling: boolean;
    stickyHeader: boolean;
    padding: boolean;
}) {
    const {
        size,
        align,
        formSheet,
        animate,
        animationFinished,
        scrolling,
        stickyHeader,
        padding
    } = options;

    const baseModal = clsx(
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

    const cfg = sizeConfig[size];
    const modal = cfg?.modalMax ? clsx(baseModal, cfg.modalMax) : baseModal;
    const backdrop = cfg?.backdropPadding ? clsx('fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]', cfg.backdropPadding) : clsx('fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]');
    const paddingCls = padding ? (cfg?.padding ?? 'p-8') : 'p-0';
    const header = clsx(
        (!options.topRightContent || options.topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
        cfg?.headerInset ?? '-inset-x-8',
        paddingCls,
        'pb-0'
    );

    return {modal, backdrop, paddingCls, header};
}

/* Backdrop click handler */
function useBackdropClick(backDropClick: boolean, removeModal: () => void) {
    return (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };
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
    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

    useEscapeHandler(modal, dirty, afterClose, onCancel);
    useCMDSHandler(enableCMDS, dirty, onOk, modal, afterClose);

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

    const {modal: modalClassesBase, backdrop: backdropBase, paddingCls, header: headerBase} = computeClasses({
        size,
        align,
        formSheet,
        animate,
        animationFinished,
        scrolling,
        stickyHeader,
        padding,
        topRightContent,
        hideXOnMobile
    });

    let modalClasses = modalClassesBase;
    let backdropClasses = backdropBase;

    if (allowBackgroundInteraction) {
        backdropClasses = clsx(backdropClasses, 'pointer-events-none');
        modalClasses = clsx(modalClasses, 'pointer-events-auto');
    }

    if (backDrop && !formSheet) {
        backdropClasses = clsx(backdropClasses, topLevelBackdropClasses);
    }
    if (formSheet) {
        backdropClasses = clsx(backdropClasses, 'bg-[rgba(98,109,121,0.08)]');
    }

    const modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = `${width}px`;
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
        modalStyles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

    const handleBackdropClick = useBackdropClick(backDropClick, removeModal);

    let footerContent: React.ReactNode;
    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        // no footer, adjust content padding later
    } else {
        const footerClasses = clsx(
            `${paddingCls} ${stickyFooter ? 'py-6' : ''}`,
            'flex w-full items-center justify-between'
        );
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

    const contentClasses = clsx(
        paddingCls,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    const finalHeaderClasses = clsx(headerBase, paddingCls, 'pb-0');

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <section
                ref={ref}
                className={modalClasses}
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