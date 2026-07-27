import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {useEffect, useState, forwardRef, useMemo, MouseEvent} from 'react';
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

type SizeConfig = {
    maxWidth?: string;
    backdropPadding?: string;
    padding?: string;
    headerInset?: string;
};

const sizeMap: Record<ModalSize, SizeConfig> = {
    sm: {maxWidth: 'max-w-[480px]', backdropPadding: 'p-4 md:p-[8vmin]', padding: 'p-8', headerInset: '-inset-x-8'},
    md: {maxWidth: 'max-w-[720px]', backdropPadding: 'p-4 md:p-[8vmin]', padding: 'p-8', headerInset: '-inset-x-8'},
    lg: {maxWidth: 'max-w-[1020px]', backdropPadding: 'p-4 md:p-[4vmin]', padding: 'p-7', headerInset: '-inset-x-8'},
    xl: {maxWidth: 'max-w-[1240px]0', backdropPadding: 'p-4 md:p-[3vmin]', padding: 'p-10', headerInset: '-inset-x-10 -top-10'},
    full: {maxWidth: undefined, backdropPadding: 'p-4 md:p-[3vmin]', padding: 'p-10', headerInset: '-inset-x-10'},
    bleed: {maxWidth: undefined, backdropPadding: undefined, padding: 'p-10', headerInset: '-inset-x-10'}
};

function useEscapeHandler(modal: any, dirty: boolean, afterClose?: () => void, onCancel?: () => void) {
    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            const activeEl = document.activeElement as HTMLElement | null;
            if (activeEl?.hasAttribute('data-kg-link-input')) return;

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

function computeClasses({
    size,
    align,
    formSheet,
    animate,
    animationFinished,
    scrolling,
    stickyHeader,
    topRightContent,
    padding,
    stickyFooter,
    height,
    width,
    allowBackgroundInteraction,
    backDrop
}: {
    size: ModalSize;
    align: string;
    formSheet: boolean;
    animate: boolean;
    animationFinished: boolean;
    scrolling: boolean;
    stickyHeader: boolean;
    topRightContent?: 'close' | React.ReactNode;
    padding: boolean;
    stickyFooter: boolean;
    height?: 'full' | number;
    width?: 'full' | 'toSidebar' | number;
    allowBackgroundInteraction: boolean;
    backDrop: boolean;
}) {
    const baseModal = clsx(
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
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
    );

    const sizeCfg = sizeMap[size] ?? sizeMap['md'];
    const modalWithSize = clsx(baseModal, sizeCfg.maxWidth);
    const backdrop = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        backDrop && !formSheet && topLevelBackdropClasses,
        formSheet && 'bg-[rgba(98,109,121,0.08)]',
        sizeCfg.backdropPadding
    );

    const paddingCls = padding ? (sizeCfg.padding ?? 'p-8') : 'p-0';
    const headerCls = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        sizeCfg.headerInset,
        paddingCls,
        'pb-0'
    );
    const contentCls = clsx(paddingCls, 'py-0', ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow'));
    const footerCls = clsx(`${paddingCls} ${stickyFooter ? 'py-6' : ''}`, 'flex w-full items-center justify-between');

    const modalStyle: React.CSSProperties = {};
    if (typeof width === 'number') {
        modalStyle.width = '100%';
        modalStyle.maxWidth = `${width}px`;
    } else if (width === 'full') {
        modalStyle.width = '100%';
    } else if (width === 'toSidebar') {
        modalStyle.width = '100%';
        modalStyle.maxWidth = 'calc(100dvw - 280px)';
    }

    if (typeof height === 'number') {
        modalStyle.height = '100%';
        modalStyle.maxHeight = `${height}px`;
    } else if (height === 'full') {
        modalStyle.height = '100%';
    }

    return {
        modalClasses: modalWithSize,
        backdropClasses: backdrop,
        headerClasses: headerCls,
        contentClasses: contentCls,
        footerClasses: footerCls,
        modalStyle
    };
}

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
        const timer = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timer);
    }, []);

    useEscapeHandler(modal, dirty, afterClose, onCancel);
    useCMDSHandler(onOk, enableCMDS);

    const {
        modalClasses,
        backdropClasses,
        headerClasses,
        contentClasses,
        footerClasses,
        modalStyle
    } = useMemo(() => computeClasses({
        size,
        align,
        formSheet,
        animate,
        animationFinished,
        scrolling,
        stickyHeader,
        topRightContent,
        padding,
        stickyFooter,
        height,
        width,
        allowBackgroundInteraction,
        backDrop
    }), [
        size,
        align,
        formSheet,
        animate,
        animationFinished,
        scrolling,
        stickyHeader,
        topRightContent,
        padding,
        stickyFooter,
        height,
        width,
        allowBackgroundInteraction,
        backDrop
    ]);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const buttons: ButtonProps[] = [];
    if (!footer) {
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
    }

    const footerContent = useMemo(() => {
        if (footer) {
            return footer;
        }
        if (footer === false) {
            return null;
        }
        const inner = (
            <div className={footerClasses}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );
        return stickyFooter ? <StickyFooter height={84}>{inner}</StickyFooter> : <>{inner}</>;
    }, [footer, footerClasses, leftButtonProps, buttons, stickyFooter]);

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <section
                ref={ref}
                className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')}
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