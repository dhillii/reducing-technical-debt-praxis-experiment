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

const buildModalClasses = (
    base: string,
    align: string,
    size: ModalSize,
    formSheet: boolean,
    animationFinished: boolean,
    scrolling: boolean
): string => {
    const alignClasses = align === 'center' ? 'mx-auto' : align === 'left' ? 'mr-auto' : 'ml-auto';
    const sizeClasses = size !== 'bleed' ? 'rounded' : '';
    const shadowClasses = formSheet ? 'shadow-md' : 'shadow-xl';
    const animationClasses = !formSheet && !animationFinished
        ? (align === 'center' ? 'animate-modal-in' : align === 'right' ? 'animate-modal-in-from-right' : '')
        : '';
    const scrollClasses = scrolling ? 'overflow-y-auto' : 'overflow-y-hidden';

    return clsx(
        base,
        alignClasses,
        sizeClasses,
        shadowClasses,
        animationClasses,
        scrollClasses
    );
};

const buildBackdropClasses = (
    base: string,
    size: ModalSize,
    allowBackgroundInteraction: boolean
): string => {
    const interactionClass = allowBackgroundInteraction ? 'pointer-events-none' : '';
    const paddingClass = size === 'bleed' ? '' : 'p-4 md:p-[8vmin]';
    return clsx(base, paddingClass, interactionClass);
};

const buildHeaderClasses = (
    base: string,
    topRightContent: 'close' | React.ReactNode,
    stickyHeader: boolean,
    paddingClass: string
): string => {
    const contentClass = (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5';
    const stickyClass = stickyHeader ? 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black' : '';
    return clsx(base, contentClass, stickyClass, paddingClass, 'pb-0');
};

const buildFooterContent = (
    leftButtonProps: ButtonProps | undefined,
    buttons: ButtonProps[],
    stickyFooter: boolean,
    paddingClass: string,
    footerContent: React.ReactNode
): React.ReactNode => {
    const footerClasses = clsx(`${paddingClass} ${stickyFooter ? 'py-6' : ''}`, 'flex w-full items-center justify-between');
    const leftButton = leftButtonProps ? <Button {...leftButtonProps} /> : null;
    const rightButtons = <ButtonGroup buttons={buttons} />;

    if (stickyFooter) {
        return (
            <StickyFooter height={84}>
                <div className={footerClasses}>
                    <div>{leftButton}</div>
                    <div className='flex gap-3'>{rightButtons}</div>
                </div>
            </StickyFooter>
        );
    }

    return (
        <>
            <div className={footerClasses}>
                <div>{leftButton}</div>
                <div className='flex gap-3'>{rightButtons}</div>
            </div>
        </>
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
        return () => document.removeEventListener('keydown', handleEscapeKey);
    }, [modal, dirty, afterClose, onCancel]);

    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
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
            return () => window.removeEventListener('keydown', handleCMDS);
        }
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

    const baseModalClasses = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        formSheet ? 'shadow-md' : 'shadow-xl',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
    );

    const modalClasses = buildModalClasses(
        baseModalClasses,
        align,
        size,
        formSheet,
        animationFinished,
        scrolling
    );

    const backdropClasses = buildBackdropClasses(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        size,
        allowBackgroundInteraction
    );

    const paddingClass = padding ? '' : 'p-0';
    const headerClasses = buildHeaderClasses(
        '',
        topRightContent,
        stickyHeader,
        paddingClass
    );

    const contentClasses = clsx(paddingClass, 'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    const footerContent = (() => {
        if (footer === false) {
            return null;
        }
        if (footer) {
            return footer;
        }

        const footerClasses = clsx(`${paddingClass} ${stickyFooter ? 'py-6' : ''}`, 'flex w-full items-center justify-between');
        const leftButton = leftButtonProps ? <Button {...leftButtonProps} /> : null;
        const rightButtons = <ButtonGroup buttons={buttons} />;

        if (stickyFooter) {
            return (
                <StickyFooter height={84}>
                    <div className={footerClasses}>
                        <div>{leftButton}</div>
                        <div className='flex gap-3'>{rightButtons}</div>
                    </div>
                </StickyFooter>
            );
        }

        return (
            <div className={footerClasses}>
                <div>{leftButton}</div>
                <div className='flex gap-3'>{rightButtons}</div>
            </div>
        );
    })();

    const modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string} = {};

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
                {header === false ? null : (
                    <header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                            <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                        </div>
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