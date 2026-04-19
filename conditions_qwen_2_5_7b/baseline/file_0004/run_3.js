```typescript
import { useModal } from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, { useEffect, useState, forwardRef } from 'react';
import useGlobalDirtyState from '../../hooks/use-global-dirty-state';
import { confirmIfDirty } from '../../utils/modals';
import Button, { ButtonColor, ButtonProps } from '../button';
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
    const { setGlobalDirtyState } = useGlobalDirtyState();
    const [animationFinished, setAnimationFinished] = useState(false);

    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (activeElementIsKoenigLinkInput()) return;
                if (document.activeElement) document.activeElement.blur();
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

    if (!footer) {
        if (cancelLabel) {
            buttons.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: (onCancel ? onCancel : () => removeModal()),
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

    const modalClasses = getModalClasses(size, align, animate, formSheet, animationFinished, padding);
    const backdropClasses = getBackdropClasses(backDrop, allowBackgroundInteraction);
    const paddingClasses = getPaddingClasses(padding);
    const headerClasses = getHeaderClasses(topRightContent, hideXOnMobile, stickyHeader);
    const contentClasses = getContentClasses(size, height, padding, stickyFooter);
    const footerClasses = getFooterClasses(stickyFooter, padding);
    const footerContent = getFooterContent(footer, buttons, leftButtonProps, onOk, onCancel, removeModal);

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const modalStyles: { width?: string; height?: string; maxWidth?: string; maxHeight?: string } = getModalStyles(width, height);

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

const getModalClasses = (size: ModalSize, align: 'center' | 'left' | 'right', animate: boolean, formSheet: boolean, animationFinished: boolean, padding: boolean) => {
    const baseClasses = 'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black';
    const alignClasses = {
        center: 'mx-auto',
        left: 'mr-auto',
        right: 'ml-auto'
    };
    const formSheetClasses = formSheet ? 'shadow-md' : 'shadow-xl';
    const animationClasses = {
        center: animate && !formSheet && !animationFinished && 'animate-modal-in',
        right: animate && !formSheet && !animationFinished && 'animate-modal-in-from-right',
        formSheet: formSheet && !animationFinished && 'animate-modal-in-reverse'
    };
    const overflowClasses = scrolling ? 'overflow-y-auto' : 'overflow-y-hidden';

    return clsx(
        baseClasses,
        alignClasses[align],
        size !== 'bleed' && 'rounded',
        formSheetClasses,
        animationClasses[align],
        overflowClasses
    );
};

const getBackdropClasses = (backDrop: boolean, allowBackgroundInteraction: boolean) => {
    const baseClasses = 'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]';
    const pointerEventsClasses = allowBackgroundInteraction ? 'pointer-events-none' : '';

    return clsx(baseClasses, pointerEventsClasses);
};

const getPaddingClasses = (padding: boolean) => padding ? 'p-8' : 'p-0';

const getHeaderClasses = (topRightContent: 'close' | React.ReactNode, hideXOnMobile: boolean, stickyHeader: boolean) => {
    const baseClasses = 'flex items-center justify-between gap-5';
    const stickyClasses = stickyHeader ? 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black' : '';

    return clsx(
        baseClasses,
        topRightContent === 'close' || !topRightContent ? '' : stickyClasses
    );
};

const getContentClasses = (size: ModalSize, height: 'full' | number, padding: boolean, stickyFooter: boolean) => {
    const baseClasses = 'py-0';
    const growClasses = size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number' ? 'grow' : '';
    const paddingClasses = padding ? 'p-8' : 'p-0';

    return clsx(baseClasses, paddingClasses, growClasses);
};

const getFooterClasses = (stickyFooter: boolean, padding: boolean) => {
    const baseClasses = 'flex w-full items-center justify-between';
    const paddingClasses = padding ? 'p-8' : 'p-0';
    const stickyClasses = stickyFooter ? 'py-6' : '';

    return clsx(baseClasses, paddingClasses, stickyClasses);
};

const getFooterContent = (footer: boolean | React.ReactNode, buttons: ButtonProps[], leftButtonProps: ButtonProps | undefined, onOk: () => void, onCancel: () => void, removeModal: () => void) => {
    if (footer === false) return '';
    if (footer === false) return ' pb-0 ';
    if (footer === false) return <div className='pb-0' />;

    return (
        <div className={footerClasses}>
            <div>
                {leftButtonProps && <Button {...leftButtonProps} />}
            </div>
            <div className='flex gap-3'>
                <ButtonGroup buttons={buttons} />
            </div>
        </div>
    );
};

const getModalStyles = (width: 'full' | 'toSidebar' | number, height: 'full' | number) => {
    const styles: { width?: string; height?: string; maxWidth?: string; maxHeight?: string } = {};

    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = width + 'px';
    } else if (width === 'full') {
        styles.width = 'full';
    } else if (width === 'toSidebar') {
        styles.width = 'full';
        styles.maxWidth = 'calc(100dvw_-_280px)';
        styles['min-[1280px]'] = { maxWidth: 'calc(100dvw_-_320px)' };
    }

    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = height + 'px';
    } else if (height === 'full') {
        styles.height = 'full';
    }

    return styles;
};

const activeElementIsKoenigLinkInput = () => {
    const activeEl = document.activeElement;
    return activeEl?.hasAttribute('data-kg-link-input');
};

const removeModal = () => {
    confirmIfDirty(dirty, () => {
        modal.remove();
        afterClose?.();
    });
};
```