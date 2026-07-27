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

const sizeConfig = {
    sm: {modal: 'max-w-[480px]', backdrop: 'p-4 md:p-[8vmin]', padding: 'p-8', header: '-inset-x-8'},
    md: {modal: 'max-w-[720px]', backdrop: 'p-4 md:p-[8vmin]', padding: 'p-8', header: '-inset-x-8'},
    lg: {modal: 'max-w-[1020px]', backdrop: 'p-4 md:p-[4vmin]', padding: 'p-7', header: '-inset-x-8'},
    xl: {modal: 'max-w-[1240px]0', backdrop: 'p-4 md:p-[3vmin]', padding: 'p-10', header: '-inset-x-10 -top-10'},
    full: {modal: 'h-full', backdrop: 'p-4 md:p-[3vmin]', padding: 'p-10', header: '-inset-x-10'},
    bleed: {modal: 'h-full', backdrop: '', padding: 'p-10', header: '-inset-x-10'}
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

    // Global dirty state sync
    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    // Escape key handling
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;

            const active = document.activeElement as HTMLElement | null;
            if (active?.hasAttribute('data-kg-link-input')) return;

            active?.blur();
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
            e.stopPropagation();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [modal, dirty, afterClose, onCancel]);

    // Animation finish flag
    useEffect(() => {
        const timer = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timer);
    }, []);

    // CMD+S handling
    useEffect(() => {
        if (!enableCMDS || !onOk) return;
        const handleCMDS = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                onOk();
            }
        };
        window.addEventListener('keydown', handleCMDS);
        return () => window.removeEventListener('keydown', handleCMDS);
    }, [enableCMDS, onOk]);

    // Build button list
    const buildButtons = (): ButtonProps[] => {
        const btns: ButtonProps[] = [];
        if (!footer) {
            if (cancelLabel) {
                btns.push({
                    key: 'cancel-modal',
                    label: cancelLabel,
                    color: 'outline',
                    onClick: onCancel ?? removeModal,
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
        }
        return btns;
    };
    const buttons = buildButtons();

    // Modal removal with dirty check
    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    // Size based classes
    const {modal: sizeModalCls = '', backdrop: sizeBackdropCls = '', padding: sizePaddingCls = '', header: sizeHeaderCls = ''} = sizeConfig[size] ?? {};

    // Base classes
    const baseModalCls = clsx(
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
        sizeModalCls
    );

    const baseBackdropCls = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        sizeBackdropCls,
        'max-[800px]:!pb-20'
    );

    const baseHeaderCls = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
        sizeHeaderCls,
        padding ? sizePaddingCls : 'p-0',
        'pb-0'
    );

    const baseContentCls = clsx(
        padding ? sizePaddingCls : 'p-0',
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    const footerCls = clsx(
        `${padding ? sizePaddingCls : ''} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    // Width / Height styles
    const modalStyles: React.CSSProperties = {};
    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = `${width}px`;
    } else if (width === 'full') {
        // width handled via class
    } else if (width === 'toSidebar') {
        // width handled via class
    }

    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = `${height}px`;
    }

    // Adjust modal classes for width/height props
    const widthClass = typeof width === 'string' ? (
        width === 'full' ? 'w-full' :
        width === 'toSidebar' ? 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]' :
        ''
    ) : '';

    const heightClass = height === 'full' ? 'h-full' : '';

    const finalModalCls = clsx(
        baseModalCls,
        widthClass,
        heightClass,
        allowBackgroundInteraction && 'pointer-events-auto'
    );

    // Backdrop click handler
    const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    // Footer content
    const renderFooter = () => {
        if (footer) {
            return footer;
        }
        if (footer === false) {
            return null;
        }
        return (
            <div className={footerCls}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className="flex gap-3">
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );
    };

    const footerContent = stickyFooter ? (
        <StickyFooter height={84}>{renderFooter()}</StickyFooter>
    ) : (
        <>{renderFooter()}</>
    );

    // Header rendering
    const renderHeader = () => {
        if (header === false) return null;
        const closeBtn = (
            <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                <Button
                    className="-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100"
                    icon="close"
                    iconColorClass="text-black dark:text-white"
                    size="sm"
                    testId="close-modal"
                    unstyled
                    onClick={removeModal}
                />
            </div>
        );
        if (!topRightContent || topRightContent === 'close') {
            return (
                <header className={baseHeaderCls}>
                    {title && <Heading level={3}>{title}</Heading>}
                    <div className={closeBtn.props?.className}>{closeBtn}</div>
                </header>
            );
        }
        return (
            <header className={baseHeaderCls}>
                {title && <Heading level={3}>{title}</Heading>}
                {topRightContent}
            </header>
        );
    };

    return (
        <div className={baseBackdropCls} id="modal-backdrop" onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )} />
            <section ref={ref} className={finalModalCls} data-testid={testId} style={modalStyles}>
                {renderHeader()}
                <div className={baseContentCls}>{children}</div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;