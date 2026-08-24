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

const getModalSizeClasses = (size: ModalSize, formSheet: boolean) => {
    const baseBackdrop = 'p-4 md:p-[8vmin]';
    const basePadding = 'p-8';
    const baseHeaderInset = '-inset-x-8';

    if (size === 'sm') {
        return {
            modal: 'max-w-[480px]',
            backdrop: `${baseBackdrop}`,
            padding: 'p-8',
            header: '-inset-x-8'
        };
    }
    if (size === 'md') {
        return {
            modal: 'max-w-[720px]',
            backdrop: `${baseBackdrop}`,
            padding: 'p-8',
            header: '-inset-x-8'
        };
    }
    if (size === 'lg') {
        return {
            modal: 'max-w-[1020px]',
            backdrop: 'p-4 md:p-[4vmin]',
            padding: 'p-7',
            header: '-inset-x-8'
        };
    }
    if (size === 'xl') {
        return {
            modal: 'max-w-[1240px]0',
            backdrop: 'p-4 md:p-[3vmin]',
            padding: 'p-10',
            header: '-inset-x-10 -top-10'
        };
    }
    if (size === 'full') {
        return {
            modal: 'h-full',
            backdrop: 'p-4 md:p-[3vmin]',
            padding: 'p-10',
            header: '-inset-x-10'
        };
    }
    if (size === 'bleed') {
        return {
            modal: 'h-full',
            padding: 'p-10',
            header: '-inset-x-10'
        };
    }
    return {
        modal: '',
        backdrop: `${baseBackdrop}`,
        padding: 'p-8',
        header: '-inset-x-8'
    };
};

const getAnimationClasses = (animate: boolean, formSheet: boolean, animationFinished: boolean, align: string) => {
    if (!animate || formSheet || animationFinished) return '';
    if (align === 'center') return 'animate-modal-in';
    if (align === 'right') return 'animate-modal-in-from-right';
    return '';
};

const buildButtons = (
    okLabel: string,
    cancelLabel: string,
    buttonsDisabled: boolean,
    okDisabled: boolean,
    okLoading: boolean,
    okColor: ButtonColor,
    onOk?: () => void,
    onCancel?: () => void,
    removeModal: () => void,
    leftButtonProps?: ButtonProps
): {leftButtons?: React.ReactNode; centerButtons?: React.ReactNode} => {
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

    if (leftButtonProps) {
        return {leftButtons: <Button {...leftButtonProps} />, centerButtons: <ButtonGroup buttons={buttons} />};
    }

    return {centerButtons: <ButtonGroup buttons={buttons} />};
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

    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    const removeModal = () => confirmIfDirty(dirty, () => {
        modal.remove();
        afterClose?.();
    });

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            const activeEl = document.activeElement;
            if (activeEl?.hasAttribute('data-kg-link-input')) return;

            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }

            setTimeout(() => {
                onCancel ? onCancel() : removeModal();
            }, 0);
            event.stopPropagation();
        };

        document.addEventListener('keydown', handleEscapeKey);
        return () => document.removeEventListener('keydown', handleEscapeKey);
    }, [modal, dirty, afterClose, onCancel]);

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

    const sizeClasses = getModalSizeClasses(size, formSheet);
    const animationClasses = getAnimationClasses(animate, formSheet, animationFinished, align);

    const modalClasses = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        animationClasses,
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
        sizeClasses.modal,
        size === 'full' || size === 'bleed' ? 'h-full' : ''
    );

    const paddingVal = padding ? sizeClasses.padding : 'p-0';
    const backdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        sizeClasses.backdrop,
        'max-[800px]:!pb-20'
    );

    const headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader ? 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black' : '',
        paddingVal,
        'pb-0',
        sizeClasses.header
    );

    const contentClasses = clsx(
        paddingVal,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    const footerClasses = clsx(
        `${paddingVal} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    const modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = width + 'px';
    } else if (width === 'full') {
        modalClasses += ' w-full';
    } else if (width === 'toSidebar') {
        modalClasses += ' w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]';
    }

    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = height + 'px';
    } else if (height === 'full') {
        modalClasses += ' h-full';
    }

    const {leftButtons, centerButtons} = buildButtons(
        okLabel,
        cancelLabel,
        buttonsDisabled || false,
        okDisabled || false,
        okLoading || false,
        okColor,
        onOk,
        onCancel,
        removeModal,
        leftButtonProps
    );

    let footerContent: React.ReactNode;
    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        contentClasses += ' pb-0 ';
        footerContent = null;
    } else {
        footerContent = (
            <div className={footerClasses}>
                {leftButtons}
                {centerButtons}
            </div>
        );
    }

    footerContent = stickyFooter ? (
        <StickyFooter height={84}>{footerContent}</StickyFooter>
    ) : footerContent;

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={(e) => {
            if (e.target === e.currentTarget && backDropClick) {
                removeModal();
            }
        }}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section ref={ref} className={clsx(
                modalClasses,
                allowBackgroundInteraction && 'pointer-events-auto'
            )} data-testid={testId} style={modalStyles}>
                {header === false ? '' : (
                    topRightContent && topRightContent !== 'close' ? (
                        <header className={headerClasses}>
                            {title && <Heading level={3}>{title}</Heading>}
                            {topRightContent}
                        </header>
                    ) : (
                        <header className={headerClasses}>
                            {title && <Heading level={3}>{title}</Heading>}
                            <div className={`${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
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