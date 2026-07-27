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
    stickyHeader?:boolean;
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

    const buttons: ButtonProps[] = [];

    let contentClasses;

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    if (!footer) {
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
    }

    const getModalSizeClasses = (size: ModalSize): {modal: string; backdrop: string; padding: string; header: string} => {
        switch (size) {
            case 'sm':
                return {
                    modal: 'max-w-[480px]',
                    backdrop: 'p-4 md:p-[8vmin]',
                    padding: 'p-8',
                    header: '-inset-x-8'
                };
            case 'md':
                return {
                    modal: 'max-w-[720px]',
                    backdrop: 'p-4 md:p-[8vmin]',
                    padding: 'p-8',
                    header: '-inset-x-8'
                };
            case 'lg':
                return {
                    modal: 'max-w-[1020px]',
                    backdrop: 'p-4 md:p-[4vmin]',
                    padding: 'p-7',
                    header: '-inset-x-8'
                };
            case 'xl':
                return {
                    modal: 'max-w-[1240px]0',
                    backdrop: 'p-4 md:p-[3vmin]',
                    padding: 'p-10',
                    header: '-inset-x-10 -top-10'
                };
            case 'full':
                return {
                    modal: 'h-full',
                    backdrop: 'p-4 md:p-[3vmin]',
                    padding: 'p-10',
                    header: '-inset-x-10'
                };
            case 'bleed':
                return {
                    modal: 'h-full',
                    backdrop: 'p-4 md:p-[3vmin]',
                    padding: 'p-10',
                    header: '-inset-x-10'
                };
            default:
                return {
                    modal: '',
                    backdrop: 'p-4 md:p-[8vmin]',
                    padding: 'p-8',
                    header: '-inset-x-8'
                };
        }
    };

    const getHeaderStickyClasses = (stickyHeader: boolean, headerClasses: string): string => {
        if (stickyHeader) {
            return clsx(
                headerClasses,
                'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
            );
        }
        return headerClasses;
    };

    const getModalAnimationClasses = (
        animate: boolean,
        formSheet: boolean,
        animationFinished: boolean,
        align: 'center' | 'left' | 'right'
    ): string => {
        if (!animate || formSheet || animationFinished) {
            return '';
        }
        if (align === 'center') {
            return 'animate-modal-in';
        }
        if (align === 'right') {
            return 'animate-modal-in-from-right';
        }
        return '';
    };

    const getFormSheetAnimationClass = (formSheet: boolean, animationFinished: boolean): string => {
        if (formSheet && !animationFinished) {
            return 'animate-modal-in-reverse';
        }
        return '';
    };

    const getModalClasses = (
        baseClasses: string,
        size: ModalSize,
        formSheet: boolean,
        animationFinished: boolean,
        align: 'center' | 'left' | 'right',
        animate: boolean
    ): string => {
        const sizeClasses = getModalSizeClasses(size);
        const animationClass = getModalAnimationClasses(animate, formSheet, animationFinished, align);
        const formSheetAnimationClass = getFormSheetAnimationClass(formSheet, animationFinished);

        return clsx(
            baseClasses,
            sizeClasses.modal,
            formSheet ? 'shadow-md' : 'shadow-xl',
            animationClass,
            formSheetAnimationClass,
            scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
        );
    };

    const getBackdropClasses = (
        baseClasses: string,
        size: ModalSize,
        allowBackgroundInteraction: boolean
    ): string => {
        const sizeClasses = getModalSizeClasses(size);
        return clsx(
            baseClasses,
            allowBackgroundInteraction && 'pointer-events-none',
            sizeClasses.backdrop
        );
    };

    const getHeaderClasses = (
        baseClasses: string,
        size: ModalSize,
        stickyHeader: boolean,
        padding: boolean,
        topRightContent?: 'close' | React.ReactNode
    ): string => {
        const sizeClasses = getModalSizeClasses(size);
        let header = clsx(
            baseClasses,
            (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
            sizeClasses.header
        );

        if (stickyHeader) {
            header = getHeaderStickyClasses(header, header);
        }

        if (!padding) {
            header = clsx(header, 'p-0');
        }

        return clsx(header, 'pb-0');
    };

    const getFooterClasses = (padding: boolean, stickyFooter: boolean): string => {
        return clsx(
            `${padding ? 'p-8' : 'p-0'} ${stickyFooter ? 'py-6' : ''}`,
            'flex w-full items-center justify-between'
        );
    };

    const getContentClasses = (padding: boolean, size: ModalSize, height?: 'full' | number): string => {
        const sizeClasses = getModalSizeClasses(size);
        let content = clsx(sizeClasses.padding, 'py-0');

        if (!padding) {
            content += ' pb-0 ';
        }

        if (size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') {
            content += ' grow';
        }

        return content;
    };

    const modalClasses = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        getModalAnimationClasses(animate, formSheet, animationFinished, align),
        getFormSheetAnimationClass(formSheet, animationFinished),
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
    );

    const backdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none'
    );

    const headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );

    const headerClassesFinal = getHeaderClasses(headerClasses, size, stickyHeader, padding, topRightContent);

    const footerClasses = getFooterClasses(padding, stickyFooter);

    const contentClasses = getContentClasses(padding, size, height);

    // Set bottom padding for backdrop when the menu is on
    backdropClasses = clsx(
        backdropClasses,
        'max-[800px]:!pb-20'
    );

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const modalStyles:{width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = width + 'px';
    } else if (width === 'full') {
        modalClasses = clsx(
            modalClasses,
            'w-full'
        );
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
        modalClasses = clsx(
            modalClasses,
            'h-full'
        );
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

    footerContent = (stickyFooter ?
        <StickyFooter height={84}>
            {footerContent}
        </StickyFooter>
        :
        <>
            {footerContent}
        </>
    );

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
                {header === false ? '' : (!topRightContent || topRightContent === 'close' ?
                    (<header className={headerClassesFinal}>
                        {title && <Heading level={3}>{title}</Heading>}
                        <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                            <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                        </div>
                    </header>)
                    :
                    (<header className={headerClassesFinal}>
                        {title && <Heading level={3}>{title}</Heading>}
                        {topRightContent}
                    </header>))}
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