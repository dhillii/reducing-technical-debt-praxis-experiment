import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {useEffect, useState, forwardRef} from 'react';
import useGlobalDirtyState from '../../hooks/use-global-dirty-state';
import {confirmIfDirty} from '../../utils/modals';
import Button, {ButtonProps} from '../button';
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
    okColor?: string;
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
        });

        event.stopPropagation();
    };

    useEffect(() => {
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

    const removeModal = () => confirmIfDirty(dirty, () => {
        modal.remove();
        afterClose?.();
    });

    const buildButtons = (): ButtonProps[] => {
        const buttons: ButtonProps[] = [];

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

        return buttons;
    };

    const buildFooterContent = (buttons: ButtonProps[]) => {
        if (footer) return footer;
        if (footer === false) return null;

        const footerClasses = clsx(
            'flex w-full items-center justify-between',
            stickyFooter ? 'py-6' : 'py-4'
        );

        return (
            <div className={footerClasses}>
                <div>
                    {leftButtonProps && <Button {...leftButtonProps} />}
                </div>
                <div className="flex gap-3">
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );
    };

    const applySizeClasses = (modalClasses: string, paddingClasses: string, headerClasses: string, size: ModalSize) => {
        switch (size) {
        case 'sm':
            return {
                modal: clsx(modalClasses, 'max-w-[480px]'),
                padding: 'p-8',
                header: clsx(headerClasses, '-inset-x-8'),
                backdrop: clsx('fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]', 'p-4 md:p-[8vmin]')
            };
        case 'md':
            return {
                modal: clsx(modalClasses, 'max-w-[720px]'),
                padding: 'p-8',
                header: clsx(headerClasses, '-inset-x-8'),
                backdrop: clsx('fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]', 'p-4 md:p-[8vmin]')
            };
        case 'lg':
            return {
                modal: clsx(modalClasses, 'max-w-[1020px]'),
                padding: 'p-7',
                header: clsx(headerClasses, '-inset-x-8'),
                backdrop: clsx('fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]', 'p-4 md:p-[4vmin]')
            };
        case 'xl':
            return {
                modal: clsx(modalClasses, 'max-w-[1240px]'),
                padding: 'p-10',
                header: clsx(headerClasses, '-inset-x-10 -top-10'),
                backdrop: clsx('fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]', 'p-4 md:p-[3vmin]')
            };
        case 'full':
            return {
                modal: clsx(modalClasses, 'h-full'),
                padding: 'p-10',
                header: clsx(headerClasses, '-inset-x-10'),
                backdrop: clsx('fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]', 'p-4 md:p-[3vmin]')
            };
        case 'bleed':
            return {
                modal: clsx(modalClasses, 'h-full'),
                padding: 'p-10',
                header: clsx(headerClasses, '-inset-x-10'),
                backdrop: clsx('fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]', 'p-4 md:p-[8vmin]')
            };
        default:
            return {
                modal: modalClasses,
                padding: 'p-8',
                header: clsx(headerClasses, '-inset-x-8'),
                backdrop: clsx('fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]', 'p-4 md:p-[8vmin]')
            };
        }
    };

    // Apply modal base classes
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

    let paddingClasses = '';
    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );

    if (stickyHeader) {
        headerClasses = clsx(headerClasses, 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black');
    }

    const sizeClasses = applySizeClasses(modalClasses, paddingClasses, headerClasses, size);

    modalClasses = sizeClasses.modal;
    paddingClasses = sizeClasses.padding;
    headerClasses = sizeClasses.header;

    if (!padding) paddingClasses = 'p-0';

    let backdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        'max-[800px]:!pb-20',
        sizeClasses.backdrop
    );

    if (backDrop && !formSheet) {
        backdropClasses = clsx(backdropClasses, 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]');
    } else if (formSheet) {
        backdropClasses = clsx(backdropClasses, 'bg-[rgba(98,109,121,0.08)]');
    }

    const footerContent = buildFooterContent(buildButtons());
    const stickyFooterContent = stickyFooter ? <StickyFooter height={84}>{footerContent}</StickyFooter> : footerContent;

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    // Width and height styles
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

    const contentClasses = clsx(
        paddingClasses,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    const headerContent = header === false ? '' : (
        <header className={clsx(headerClasses, paddingClasses, 'pb-0')}>
            {title && <Heading level={3}>{title}</Heading>}
            <div
                className={`${!topRightContent || topRightContent === 'close' 
                    ? `${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`
                    : ''
                }`}
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

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section ref={ref} className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')} data-testid={testId} style={modalStyles}>
                {headerContent}
                <div className={contentClasses}>
                    {children}
                </div>
                {stickyFooterContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;