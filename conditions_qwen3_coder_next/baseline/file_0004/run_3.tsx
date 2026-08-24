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

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            const activeEl = document.activeElement;
            if (activeEl?.hasAttribute('data-kg-link-input')) return;

            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
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

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const buttons: ButtonProps[] = [];
    if (!footer) {
        if (cancelLabel) {
            buttons.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: onCancel || removeModal,
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

    const getModalClasses = () => {
        let classes = clsx(
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

        const paddingMap: Record<string, string> = {
            sm: 'p-8',
            md: 'p-8',
            lg: 'p-7',
            xl: 'p-10',
            full: 'p-10',
            bleed: 'p-10'
        };

        const headerInsetMap: Record<string, string> = {
            sm: '-inset-x-8',
            md: '-inset-x-8',
            lg: '-inset-x-8',
            xl: '-inset-x-10 -top-10',
            full: '-inset-x-10',
            bleed: '-inset-x-10'
        };

        const backdropPaddingMap: Record<string, string> = {
            sm: 'p-4 md:p-[8vmin]',
            md: 'p-4 md:p-[8vmin]',
            lg: 'p-4 md:p-[4vmin]',
            xl: 'p-4 md:p-[3vmin]',
            full: 'p-4 md:p-[3vmin]',
            bleed: 'p-4 md:p-[8vmin]'
        };

        const sizeMap: Record<string, string> = {
            sm: 'max-w-[480px]',
            md: 'max-w-[720px]',
            lg: 'max-w-[1020px]',
            xl: 'max-w-[1240px]0',
            full: 'h-full',
            bleed: 'h-full'
        };

        if (size === 'bleed' || size === 'full') {
            classes = clsx(classes, 'h-full');
        } else if (sizeMap[size]) {
            classes = clsx(classes, sizeMap[size]);
        }

        const paddingClasses = paddingMap[size] || 'p-8';
        const headerClasses = clsx(
            (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
            stickyHeader ? 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black' : '',
            headerInsetMap[size] || '-inset-x-8',
            paddingClasses,
            'pb-0'
        );

        const backdropClasses = clsx(
            'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
            allowBackgroundInteraction && 'pointer-events-none',
            backdropPaddingMap[size] || 'p-4 md:p-[8vmin]',
            'max-[800px]:!pb-20'
        );

        const contentClasses = clsx(
            paddingClasses,
            'py-0',
            ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
        );

        return {classes, headerClasses, backdropClasses, contentClasses, paddingClasses};
    };

    const {classes: modalClasses, headerClasses, backdropClasses, contentClasses, paddingClasses} = getModalClasses();

    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    const modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = width + 'px';
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
        modalStyles.maxHeight = height + 'px';
    } else if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

    if (!padding) {
        const noPaddingClasses = 'p-0';
        modalClasses = clsx(modalClasses, noPaddingClasses);
        headerClasses = clsx(headerClasses, noPaddingClasses);
        contentClasses = clsx(contentClasses, noPaddingClasses);
    }

    let footerContent;
    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        contentClasses += ' pb-0 ';
    } else {
        footerContent = (
            <div className={footerClasses}>
                <div>
                    {leftButtonProps && <Button {...leftButtonProps} />}
                </div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons}/>
                </div>
            </div>
        );
    }

    footerContent = stickyFooter
        ? <StickyFooter height={84}>{footerContent}</StickyFooter>
        : footerContent;

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
                    !topRightContent || topRightContent === 'close' ? (
                        <header className={headerClasses}>
                            {title && <Heading level={3}>{title}</Heading>}
                            <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                                <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                            </div>
                        </header>
                    ) : (
                        <header className={headerClasses}>
                            {title && <Heading level={3}>{title}</Heading>}
                            {topRightContent}
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