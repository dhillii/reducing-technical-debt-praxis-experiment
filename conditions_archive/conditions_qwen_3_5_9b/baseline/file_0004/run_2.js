```typescript
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

const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

const getModalSizeClasses = (size: ModalSize): {
    modal: string;
    backdrop: string;
    padding: string;
    header: string;
} => {
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
                modal: 'max-w-[1240px]',
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

const getAnimationClasses = (
    animate: boolean,
    formSheet: boolean,
    animationFinished: boolean,
    align: 'center' | 'left' | 'right'
): string => {
    if (!animate || formSheet || animationFinished) {
        return '';
    }
    
    switch (align) {
        case 'center':
            return 'animate-modal-in';
        case 'right':
            return 'animate-modal-in-from-right';
        default:
            return '';
    }
};

const getBackdropClasses = (
    allowBackgroundInteraction: boolean,
    size: ModalSize,
    formSheet: boolean
): string => {
    const sizeClasses = getModalSizeClasses(size);
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        sizeClasses.backdrop
    );
};

const getModalClasses = (
    size: ModalSize,
    align: 'center' | 'left' | 'right',
    formSheet: boolean,
    animationFinished: boolean,
    scrolling: boolean
): string => {
    const sizeClasses = getModalSizeClasses(size);
    const animationClasses = getAnimationClasses(
        true,
        formSheet,
        animationFinished,
        align
    );
    
    return clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        animationClasses,
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
        sizeClasses.modal
    );
};

const getHeaderClasses = (
    topRightContent: 'close' | React.ReactNode,
    stickyHeader: boolean,
    padding: string
): string => {
    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );
    
    if (stickyHeader) {
        headerClasses = clsx(
            headerClasses,
            'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );
    }
    
    return clsx(headerClasses, padding, 'pb-0');
};

const getFooterClasses = (
    padding: string,
    stickyFooter: boolean
): string => {
    return clsx(
        `${padding} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );
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

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                const activeEl = document.activeElement;
                if (activeEl?.hasAttribute('data-kg-link-input')) {
                    return;
                }

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
            }
        };

        document.addEventListener('keydown', handleEscapeKey);

        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [modal, dirty, afterClose, onCancel]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setAnimationFinished(true);
        }, 250);

        return () => clearTimeout(timeout);
    }, []);

    useEffect(() => {
        if (onOk && enableCMDS) {
            const handleCMDS = (e: KeyboardEvent) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    onOk();
                }
            };
            window.addEventListener('keydown', handleCMDS);
            return () => {
                window.removeEventListener('keydown', handleCMDS);
            };
        }
    }, [onOk, enableCMDS]);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const buildButtons = (): ButtonProps[] => {
        const buttons: ButtonProps[] = [];

        if (!footer) {
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
        }

        return buttons;
    };

    const sizeClasses = getModalSizeClasses(size);
    const modalClasses = getModalClasses(
        size,
        align,
        formSheet,
        animationFinished,
        scrolling
    );
    const backdropClasses = getBackdropClasses(
        allowBackgroundInteraction,
        size,
        formSheet
    );
    const headerClasses = getHeaderClasses(
        topRightContent,
        stickyHeader,
        padding ? sizeClasses.padding : 'p-0'
    );
    const footerClasses = getFooterClasses(
        padding ? sizeClasses.padding : 'p-0',
        stickyFooter
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

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const buildFooterContent = (): React.ReactNode => {
        if (footer === false) {
            return null;
        }

        if (footer) {
            return footer;
        }

        const buttons = buildButtons();
        const leftButton = leftButtonProps ? <Button {...leftButtonProps} /> : null;

        return (
            <div className={footerClasses}>
                <div>
                    {leftButton}
                </div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons}/>
                </div>
            </div>
        );
    };

    const footerContent = stickyFooter ?
        <StickyFooter height={84}>
            {buildFooterContent()}
        </StickyFooter>
        :
        buildFooterContent();

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
                {header === false ? '' : (
                    topRightContent === 'close' || !topRightContent ?
                        (<header className={headerClasses}>
                            {title && <Heading level={3}>{title}</Heading>}
                            <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                                <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                            </div>
                        </header>)
                        :
                        (<header className={headerClasses}>
                            {title && <Heading level={3}>{title}</Heading>}
                            {topRightContent}
                        </header>)
                )}
                <div className={clsx(
                    padding ? sizeClasses.padding : 'p-0',
                    'py-0',
                    ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
                )}>
                    {children}
                </div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;
```