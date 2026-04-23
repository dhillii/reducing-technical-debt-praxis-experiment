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

    /* Global dirty state sync */
    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    /* Escape key handling */
    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            const activeEl = document.activeElement;
            if (activeEl?.hasAttribute('data-kg-link-input')) return;

            if (document.activeElement && document.activeElement instanceof HTMLElement) {
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

        document.addEventListener('keydown', handleEscapeKey);
        return () => document.removeEventListener('keydown', handleEscapeKey);
    }, [modal, dirty, afterClose, onCancel]);

    /* Animation finished flag */
    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

    /* CMD+S handling */
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

    /* Modal removal with dirty check */
    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    /* Buttons construction */
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

    /* Class calculations */
    const modalClasses = computeModalClasses({
        size,
        align,
        formSheet,
        animate,
        animationFinished,
        scrolling,
        width,
        height,
        stickyFooter
    });

    const backdropClasses = computeBackdropClasses({
        allowBackgroundInteraction,
        size,
        backDrop
    });

    const paddingClasses = computePaddingClasses(size, padding);
    const headerClasses = computeHeaderClasses({
        size,
        topRightContent,
        stickyHeader,
        paddingClasses
    });

    const contentClasses = computeContentClasses({
        size,
        height,
        paddingClasses
    });

    const footerClasses = computeFooterClasses({
        paddingClasses,
        stickyFooter
    });

    const footerContent = computeFooterContent({
        footer,
        buttons,
        leftButtonProps,
        footerClasses,
        stickyFooter
    });

    /* Backdrop click handling */
    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    /* Modal styles */
    const modalStyles: Record<string, string> = {};
    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = `${width}px`;
    } else if (width === 'full') {
        modalStyles.width = '100%';
    } else if (width === 'toSidebar') {
        modalStyles.width = '100%';
    }

    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        modalStyles.height = '100%';
    }

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section ref={ref} className={clsx(
                modalClasses,
                allowBackgroundInteraction && 'pointer-events-auto'
            )} data-testid={testId} style={modalStyles}>
                {header !== false && (
                    <header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        {topRightContent === 'close' ? (
                            <div className={`${hideXOnMobile ? 'hidden' : ''} absolute right-6 top-6`}>
                                <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                            </div>
                        ) : (
                            topRightContent
                        )}
                    </header>
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

/* Helper functions */

function computeModalClasses({
    size,
    align,
    formSheet,
    animate,
    animationFinished,
    scrolling,
    width,
    height,
    stickyFooter
}: {
    size: ModalSize;
    align: 'center' | 'left' | 'right';
    formSheet: boolean;
    animate: boolean;
    animationFinished: boolean;
    scrolling: boolean;
    width?: 'full' | 'toSidebar' | number;
    height?: 'full' | number;
    stickyFooter: boolean;
}) {
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

    if (width === 'full') classes = clsx(classes, 'w-full');
    if (width === 'toSidebar') classes = clsx(classes, 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]');
    if (height === 'full') classes = clsx(classes, 'h-full');

    switch (size) {
        case 'sm':
            classes = clsx(classes, 'max-w-[480px]');
            break;
        case 'md':
            classes = clsx(classes, 'max-w-[720px]');
            break;
        case 'lg':
            classes = clsx(classes, 'max-w-[1020px]');
            break;
        case 'xl':
            classes = clsx(classes, 'max-w-[1240px]');
            break;
        case 'full':
        case 'bleed':
            classes = clsx(classes, 'h-full');
            break;
        default:
            break;
    }

    return classes;
}

function computeBackdropClasses({
    allowBackgroundInteraction,
    size,
    backDrop
}: {
    allowBackgroundInteraction: boolean;
    size: ModalSize;
    backDrop: boolean;
}) {
    let classes = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none'
    );

    switch (size) {
        case 'sm':
        case 'md':
            classes = clsx(classes, 'p-4 md:p-[8vmin]');
            break;
        case 'lg':
            classes = clsx(classes, 'p-4 md:p-[4vmin]');
            break;
        case 'xl':
            classes = clsx(classes, 'p-4 md:p-[3vmin]');
            break;
        case 'full':
        case 'bleed':
            classes = clsx(classes, 'p-4 md:p-[3vmin]');
            break;
        default:
            classes = clsx(classes, 'p-4 md:p-[8vmin]');
            break;
    }

    classes = clsx(classes, 'max-[800px]:!pb-20');
    return classes;
}

function computePaddingClasses(size: ModalSize, padding: boolean) {
    if (!padding) return 'p-0';
    switch (size) {
        case 'sm':
        case 'md':
            return 'p-8';
        case 'lg':
            return 'p-7';
        case 'xl':
            return 'p-10';
        case 'full':
        case 'bleed':
            return 'p-10';
        default:
            return 'p-8';
    }
}

function computeHeaderClasses({
    size,
    topRightContent,
    stickyHeader,
    paddingClasses
}: {
    size: ModalSize;
    topRightContent?: 'close' | React.ReactNode;
    stickyHeader: boolean;
    paddingClasses: string;
}) {
    let classes = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );

    if (stickyHeader) {
        classes = clsx(classes, 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black');
    }

    switch (size) {
        case 'sm':
        case 'md':
            classes = clsx(classes, '-inset-x-8');
            break;
        case 'lg':
            classes = clsx(classes, '-inset-x-8');
            break;
        case 'xl':
            classes = clsx(classes, '-inset-x-10 -top-10');
            break;
        case 'full':
        case 'bleed':
            classes = clsx(classes, '-inset-x-10');
            break;
        default:
            classes = clsx(classes, '-inset-x-8');
            break;
    }

    classes = clsx(classes, paddingClasses, 'pb-0');
    return classes;
}

function computeContentClasses({
    size,
    height,
    paddingClasses
}: {
    size: ModalSize;
    height?: 'full' | number;
    paddingClasses: string;
}) {
    let classes = clsx(paddingClasses, 'py-0');
    if (size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') {
        classes = clsx(classes, 'grow');
    }
    return classes;
}

function computeFooterClasses({
    paddingClasses,
    stickyFooter
}: {
    paddingClasses: string;
    stickyFooter: boolean;
}) {
    return clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );
}

function computeFooterContent({
    footer,
    buttons,
    leftButtonProps,
    footerClasses,
    stickyFooter
}: {
    footer?: boolean | React.ReactNode;
    buttons: ButtonProps[];
    leftButtonProps?: ButtonProps;
    footerClasses: string;
    stickyFooter: boolean;
}) {
    let content: React.ReactNode;
    if (footer) {
        content = footer;
    } else if (footer === false) {
        content = null;
    } else {
        content = (
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

    return stickyFooter ? (
        <StickyFooter height={84}>
            {content}
        </StickyFooter>
    ) : (
        <>{content}</>
    );
}