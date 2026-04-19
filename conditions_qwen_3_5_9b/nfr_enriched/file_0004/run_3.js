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

const getSizeClasses = (size: ModalSize): {
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

const generateButtons = (
    cancelLabel: string,
    okLabel: string,
    okColor: ButtonColor,
    okLoading: boolean,
    buttonsDisabled: boolean,
    okDisabled: boolean,
    onOk: () => void,
    onCancel: () => void,
    removeModal: () => void
): ButtonProps[] => {
    const buttons: ButtonProps[] = [];

    if (!cancelLabel) {
        return buttons;
    }

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

    return buttons;
};

const generateFooterContent = (
    footer: boolean | React.ReactNode,
    leftButtonProps: ButtonProps,
    buttons: ButtonProps[],
    footerClasses: string,
    stickyFooter: boolean
): React.ReactNode => {
    let footerContent;

    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        footerContent = null;
    } else {
        footerContent = (
            <div className={footerClasses}>
                <div>
                    {leftButtonProps && <Button {...leftButtonProps} />}
                </div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );
    }

    return stickyFooter ?
        <StickyFooter height={84}>
            {footerContent}
        </StickyFooter>
        :
        <>{footerContent}</>;
};

const handleEscapeKey = (
    event: KeyboardEvent,
    onCancel: () => void,
    dirty: boolean,
    afterClose: () => void,
    modal: ReturnType<typeof useModal>
): void => {
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

const handleCMDS = (
    e: KeyboardEvent,
    onOk: () => void
): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        onOk();
    }
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

    const sizeClasses = getSizeClasses(size);
    const buttons = generateButtons(
        cancelLabel,
        okLabel,
        okColor,
        okLoading,
        buttonsDisabled,
        okDisabled,
        onOk,
        onCancel,
        removeModal
    );
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
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
        sizeClasses.modal
    );
    const backdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        sizeClasses.backdrop
    );
    const paddingClasses = padding ? sizeClasses.padding : 'p-0';
    const headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
        sizeClasses.header
    );
    const contentClasses = clsx(
        paddingClasses,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );
    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );
    const modalStyles = {
        width: typeof width === 'number' ? '100%' : undefined,
        maxWidth: typeof width === 'number' ? `${width}px` : undefined,
        height: typeof height === 'number' ? '100%' : undefined,
        maxHeight: typeof height === 'number' ? `${height}px` : undefined
    };
    const footerContent = generateFooterContent(
        footer,
        leftButtonProps,
        buttons,
        footerClasses,
        stickyFooter
    );

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            handleEscapeKey(
                event,
                onCancel,
                dirty,
                afterClose,
                modal
            );
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
        if (onOk) {
            const handleCMDS = (e: KeyboardEvent) => {
                handleCMDS(e, onOk);
            };
            if (enableCMDS) {
                window.addEventListener('keydown', handleCMDS);
                return () => {
                    window.removeEventListener('keydown', handleCMDS);
                };
            }
        }
    });

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
```