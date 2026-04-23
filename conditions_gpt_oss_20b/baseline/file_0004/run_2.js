import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {useEffect, useState, forwardRef, useCallback} from 'react';
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
    sm: {maxW: '480px', pad: 'p-8', header: '-inset-x-8', backdrop: 'p-4 md:p-[8vmin]'},
    md: {maxW: '720px', pad: 'p-8', header: '-inset-x-8', backdrop: 'p-4 md:p-[8vmin]'},
    lg: {maxW: '1020px', pad: 'p-7', header: '-inset-x-8', backdrop: 'p-4 md:p-[4vmin]'},
    xl: {maxW: '1240px', pad: 'p-10', header: '-inset-x-10 -top-10', backdrop: 'p-4 md:p-[3vmin]'},
    full: {maxW: 'full', pad: 'p-10', header: '-inset-x-10', backdrop: 'p-4 md:p-[3vmin]'},
    bleed: {maxW: 'full', pad: 'p-10', header: '-inset-x-10', backdrop: 'p-4 md:p-[8vmin]'},
};

const getModalClasses = (props: ModalProps, animationFinished: boolean) => {
    const {
        size = 'md',
        align = 'center',
        formSheet = false,
        animate = true,
        scrolling = true,
    } = props;
    const base = [
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
    ];
    if (!formSheet && !animationFinished) {
        if (align === 'center') base.push('animate-modal-in');
        if (align === 'right') base.push('animate-modal-in-from-right');
    }
    if (formSheet && !animationFinished) base.push('animate-modal-in-reverse');
    if (sizeConfig[size]) base.push(`max-w-[${sizeConfig[size].maxW}]`);
    return clsx(base);
};

const getBackdropClasses = (props: ModalProps) => {
    const {allowBackgroundInteraction = false} = props;
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        'max-[800px]:!pb-20'
    );
};

const getPaddingClasses = (props: ModalProps) => {
    const {padding = true} = props;
    return padding ? 'p-8' : 'p-0';
};

const getHeaderClasses = (props: ModalProps, size: ModalSize) => {
    const {topRightContent, stickyHeader = false} = props;
    let base = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
    );
    if (sizeConfig[size]) base = clsx(base, sizeConfig[size].header);
    return base;
};

const getContentClasses = (props: ModalProps, size: ModalSize) => {
    const {height, padding = true} = props;
    let base = clsx(
        padding ? 'p-8' : 'p-0',
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );
    return base;
};

const getFooterContent = (props: ModalProps, buttons: ButtonProps[], footerContent: React.ReactNode) => {
    const {footer, stickyFooter = false, leftButtonProps} = props;
    let content: React.ReactNode;
    if (footer === false) {
        content = null;
    } else if (footer) {
        content = footer;
    } else {
        content = (
            <div className={`${footer ? '' : 'pb-0'} flex w-full items-center justify-between`}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );
    }
    return stickyFooter ? <StickyFooter height={84}>{content}</StickyFooter> : content;
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

    useEffect(() => setGlobalDirtyState(dirty), [dirty, setGlobalDirtyState]);

    const removeModal = useCallback(() => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    }, [dirty, modal, afterClose]);

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            const activeEl = document.activeElement;
            if (activeEl?.hasAttribute('data-kg-link-input')) return;
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            setTimeout(() => {
                if (onCancel) onCancel();
                else removeModal();
            });
            event.stopPropagation();
        };
        document.addEventListener('keydown', handleEscapeKey);
        return () => document.removeEventListener('keydown', handleEscapeKey);
    }, [onCancel, removeModal]);

    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

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

    const modalClasses = getModalClasses({size, align, formSheet, animate, scrolling}, animationFinished);
    const backdropClasses = getBackdropClasses({allowBackgroundInteraction});
    const paddingClasses = getPaddingClasses({padding});
    const headerClasses = getHeaderClasses({topRightContent, stickyHeader}, size);
    const contentClasses = getContentClasses({height, padding}, size);
    const footerContent = getFooterContent({footer, stickyFooter, leftButtonProps}, buttons, footer);

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) removeModal();
    };

    const modalStyles: Record<string, string> = {};
    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = `${width}px`;
    } else if (width === 'full') {
        modalClasses = clsx(modalClasses, 'w-full');
    } else if (width === 'toSidebar') {
        modalClasses = clsx(modalClasses, 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]');
    }
    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section ref={ref} className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')} data-testid={testId} style={modalStyles}>
                {header !== false && (
                    <header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        {topRightContent === 'close' ? (
                            <div className={`${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                                <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                            </div>
                        ) : (
                            <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                                {topRightContent}
                            </div>
                        )}
                    </header>
                )}
                <div className={contentClasses}>{children}</div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;