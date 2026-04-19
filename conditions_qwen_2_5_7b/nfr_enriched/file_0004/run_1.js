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

    /**
     * Possible values are: `sm`, `md`, `lg`, `xl, `full`, `bleed`. Yu can also use any number to set an arbitrary width.
     */
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
            if (event.key === 'Escape') {
                // Don't close modal if user is in Koenig's link input (which handles ESC itself)
                const activeEl = document.activeElement;
                if (activeEl?.hasAttribute('data-kg-link-input')) {
                    return;
                }

                // Fix for Safari - if an element in the modal is focused, closing it will jump to
                // the bottom of the page because Safari tries to focus the "next" element in the DOM
                if (document.activeElement && document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
                // Close the modal on the next tick so that the blur registers
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

                // Prevent the event from bubbling up to the window level
                event.stopPropagation();
            }
        };

        document.addEventListener('keydown', handleEscapeKey);

        // Clean up the event listener when the modal is closed
        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [modal, dirty, afterClose, onCancel]);

    // The animation classes apply a transform to the modal, which breaks anything inside using position:fixed
    // We should remove the class as soon as the animation is finished
    useEffect(() => {
        const timeout = setTimeout(() => {
            setAnimationFinished(true);
        }, 250);

        return () => clearTimeout(timeout);
    }, []);

    useEffect(() => {
        if (onOk) {
            const handleCMDS = (e: KeyboardEvent) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    onOk();
                }
            };
            if (enableCMDS) {
                window.addEventListener('keydown', handleCMDS);
                return () => {
                    window.removeEventListener('keydown', handleCMDS);
                };
            }
        }
    });

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const getButtons = () => {
        const buttons: ButtonProps[] = [];

        if (cancelLabel) {
            buttons.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: (onCancel ? onCancel : () => {
                    removeModal();
                }),
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

    const getModalClasses = () => {
        const modalClasses = clsx(
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

        switch (size) {
            case 'sm':
                modalClasses = clsx(
                    modalClasses,
                    'max-w-[480px]'
                );
                break;
            case 'md':
                modalClasses = clsx(
                    modalClasses,
                    'max-w-[720px]'
                );
                break;
            case 'lg':
                modalClasses = clsx(
                    modalClasses,
                    'max-w-[1020px]'
                );
                break;
            case 'xl':
                modalClasses = clsx(
                    modalClasses,
                    'max-w-[1240px]'
                );
                break;
            case 'full':
                modalClasses = clsx(
                    modalClasses,
                    'h-full'
                );
                break;
            case 'bleed':
                modalClasses = clsx(
                    modalClasses,
                    'h-full'
                );
                break;
            default:
                break;
        }

        if (!padding) {
            modalClasses = clsx(
                modalClasses,
                'p-0'
            );
        }

        return modalClasses;
    };

    const getBackdropClasses = () => {
        const backdropClasses = clsx(
            'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
            allowBackgroundInteraction && 'pointer-events-none'
        );

        if (!backDrop) {
            backdropClasses = clsx(
                backdropClasses,
                'pointer-events-none'
            );
        }

        if (backDropClick) {
            backdropClasses = clsx(
                backdropClasses,
                'pointer-events-auto'
            );
        }

        return backdropClasses;
    };

    const getHeaderClasses = () => {
        const headerClasses = clsx(
            (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
        );

        if (stickyHeader) {
            headerClasses = clsx(
                headerClasses,
                'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
            );
        }

        return headerClasses;
    };

    const getContentClasses = () => {
        const contentClasses = clsx(
            padding ? 'p-8' : 'p-0',
            'py-0'
        );

        if (size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') {
            contentClasses = clsx(
                contentClasses,
                'grow'
            );
        }

        return contentClasses;
    };

    const getFooterClasses = () => {
        const footerClasses = clsx(
            padding ? 'p-8' : 'p-0',
            'flex w-full items-center justify-between'
        );

        if (stickyFooter) {
            footerClasses = clsx(
                footerClasses,
                'py-6'
            );
        }

        return footerClasses;
    };

    const getFooterContent = () => {
        if (footer) {
            return footer;
        } else if (footer === false) {
            return '';
        } else {
            return (
                <div className={getFooterClasses()}>
                    <div>
                        {leftButtonProps && <Button {...leftButtonProps} />}
                    </div>
                    <div className='flex gap-3'>
                        <ButtonGroup buttons={getButtons()} />
                    </div>
                </div>
            );
        }
    };

    const getFooter = () => {
        if (stickyFooter) {
            return (
                <StickyFooter height={84}>
                    {getFooterContent()}
                </StickyFooter>
            );
        } else {
            return getFooterContent();
        }
    };

    const getModalStyles = () => {
        const modalStyles: { width?: string; height?: string; maxWidth?: string; maxHeight?: string; } = {};

        if (typeof width === 'number') {
            modalStyles.width = '100%';
            modalStyles.maxWidth = width + 'px';
        } else if (width === 'full') {
            modalStyles.width = '100%';
        } else if (width === 'toSidebar') {
            modalStyles.width = '100%';
            modalStyles.maxWidth = 'calc(100dvw_-_280px)';
            modalStyles['min-[1280px]'] = { maxWidth: 'calc(100dvw_-_320px)' };
        }

        if (typeof height === 'number') {
            modalStyles.height = '100%';
            modalStyles.maxHeight = height + 'px';
        } else if (height === 'full') {
            modalStyles.height = '100%';
        }

        return modalStyles;
    };

    const getHeader = () => {
        if (header === false) {
            return '';
        } else if (topRightContent === 'close' || !topRightContent) {
            return (
                <header className={getHeaderClasses()}>
                    {title && <Heading level={3}>{title}</Heading>}
                    <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                        <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                    </div>
                </header>
            );
        } else {
            return (
                <header className={getHeaderClasses()}>
                    {title && <Heading level={3}>{title}</Heading>}
                    {topRightContent}
                </header>
            );
        }
    };

    return (
        <div className={getBackdropClasses()} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section ref={ref} className={getModalClasses()} data-testid={testId} style={getModalStyles()}>
                {getHeader()}
                <div className={getContentClasses()}>
                    {children}
                </div>
                {getFooter()}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;