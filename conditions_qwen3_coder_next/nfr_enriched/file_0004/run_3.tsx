import { useModal } from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, { useEffect, useState, forwardRef, useCallback } from 'react';
import useGlobalDirtyState from '../../hooks/use-global-dirty-state';
import { confirmIfDirty } from '../../utils/modals';
import Button, { ButtonProps } from '../button';
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

function getModalSizeClasses(size: ModalSize | string): {
    modalClasses: string;
    backdropClasses: string;
    paddingClasses: string;
    headerClasses: string;
} {
    switch (size) {
        case 'sm':
            return {
                modalClasses: 'max-w-[480px]',
                backdropClasses: 'p-4 md:p-[8vmin]',
                paddingClasses: 'p-8',
                headerClasses: '-inset-x-8'
            };
        case 'md':
            return {
                modalClasses: 'max-w-[720px]',
                backdropClasses: 'p-4 md:p-[8vmin]',
                paddingClasses: 'p-8',
                headerClasses: '-inset-x-8'
            };
        case 'lg':
            return {
                modalClasses: 'max-w-[1020px]',
                backdropClasses: 'p-4 md:p-[4vmin]',
                paddingClasses: 'p-7',
                headerClasses: '-inset-x-8'
            };
        case 'xl':
            return {
                modalClasses: 'max-w-[1240px]0',
                backdropClasses: 'p-4 md:p-[3vmin]',
                paddingClasses: 'p-10',
                headerClasses: '-inset-x-10 -top-10'
            };
        case 'full':
            return {
                modalClasses: 'h-full',
                backdropClasses: 'p-4 md:p-[3vmin]',
                paddingClasses: 'p-10',
                headerClasses: '-inset-x-10'
            };
        case 'bleed':
            return {
                modalClasses: 'h-full',
                paddingClasses: 'p-10',
                headerClasses: '-inset-x-10'
            };
        default:
            return {
                modalClasses: '',
                backdropClasses: 'p-4 md:p-[8vmin]',
                paddingClasses: 'p-8',
                headerClasses: '-inset-x-8'
            };
    }
}

function getModalSizeTailwindClasses(size: ModalSize | string, formSheet: boolean): string {
    const baseClasses = [
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black'
    ];
    const alignClasses = {
        center: 'mx-auto',
        left: 'mr-auto',
        right: 'ml-auto'
    };
    const sizeSpecific = !formSheet ? 'rounded' : 'shadow-md';
    const shadowClass = formSheet ? 'shadow-md' : 'shadow-xl';
    const animationClasses = (formSheet ? '' : 'animate-modal-in') +
        (size === 'right' ? 'animate-modal-in-from-right' : '');
    
    baseClasses.push(alignClasses[formSheet ? 'center' : 'center']);
    baseClasses.push(size !== 'bleed' ? 'rounded' : '');
    baseClasses.push(shadowClass);
    return clsx(baseClasses);
}

function buildButtonList(
    okLabel: string,
    cancelLabel: string,
    okColor: string,
    onOk?: () => void,
    onCancel?: () => void,
    buttonsDisabled?: boolean,
    okDisabled?: boolean,
    okLoading?: boolean,
    dirty?: boolean,
    modal:ReturnType<typeof useModal>,
    afterClose?: () => void
): { buttons: ButtonProps[], removeModal: () => void } {
    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

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

    return { buttons, removeModal };
}

function buildHeader(
    title: string | undefined,
    topRightContent: 'close' | React.ReactNode | undefined,
    hideXOnMobile: boolean,
    onRemove: () => void
): React.ReactNode {
    const shouldHideClose = !topRightContent || topRightContent === 'close';

    if (!shouldHideClose) {
        return (
            <header className="flex items-center justify-between gap-5">
                {title && <Heading level={3}>{title}</Heading>}
                {topRightContent}
            </header>
        );
    }

    return (
        <header>
            {title && <Heading level={3}>{title}</Heading>}
            <div className={`absolute right-6 top-6 ${hideXOnMobile ? 'hidden' : 'md:!invisible md:!hidden'}`}>
                <Button
                    className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100'
                    icon='close'
                    iconColorClass='text-black dark:text-white'
                    size='sm'
                    testId='close-modal'
                    unstyled
                    onClick={onRemove}
                />
            </div>
        </header>
    );
}

function buildBackdropClasses({
    formSheet,
    allowBackgroundInteraction,
    backDrop
}: {
    formSheet: boolean;
    allowBackgroundInteraction: boolean;
    backDrop: boolean;
}): string {
    let classes = 'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]';

    if (allowBackgroundInteraction) {
        classes += ' pointer-events-none';
    }

    if (backDrop && !formSheet) {
        classes = clsx(classes, topLevelBackdropClasses);
    } else if (formSheet) {
        classes += ' bg-[rgba(98,109,121,0.08)]';
    }

    return clsx(classes, 'max-[800px]:!pb-20');
}

function buildFooterContent(
    footer: boolean | React.ReactNode,
    footerClasses: string,
    leftButtonProps?: ButtonProps,
    buttons?: ButtonProps[]
): React.ReactNode {
    if (footer === false) return ' pb-0 ';
    if (footer) return footer;

    return (
        <div className={footerClasses}>
            <div>
                {leftButtonProps && <Button {...leftButtonProps} />}
            </div>
            <div className='flex gap-3'>
                {buttons && <ButtonGroup buttons={buttons} />}
            </div>
        </div>
    );
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
    header = true,
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

    // --- Effects ---

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
            });

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

    // --- Derived values ---

    const { buttons, removeModal } = buildButtonList(
        okLabel, cancelLabel, okColor, onOk, onCancel,
        buttonsDisabled, okDisabled, okLoading,
        dirty, modal, afterClose
    );

    const modalSizeClasses = getModalSizeClasses(size);

    const modalClassesBase = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        !formSheet && size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        animate && !animationFinished && formSheet && 'animate-modal-in-reverse',
        animate && !animationFinished && !formSheet && align === 'center' && 'animate-modal-in',
        animate && !animationFinished && !formSheet && align === 'right' && 'animate-modal-in-from-right',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
    );

    const paddingClasses = padding ? modalSizeClasses.paddingClasses : 'p-0';
    const srcHeaderClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader ? 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black' : '',
        modalSizeClasses.headerClasses,
        paddingClasses,
        'pb-0'
    );
    const contentClasses = clsx(
        paddingClasses,
        'py-0',
        (size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow'
    );
    const backdropClasses = buildBackdropClasses({ formSheet, allowBackgroundInteraction, backDrop });
    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    const modalStyles: { width?: string; height?: string; maxWidth?: string; maxHeight?: string; } = {};

    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = `${width}px`;
    } else if (width === 'full') {
        modalClassesBase += ' w-full';
    } else if (width === 'toSidebar') {
        modalClassesBase += ' w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]';
    }

    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        modalClassesBase += ' h-full';
    }

    const shouldRenderStickyFooter = stickyFooter;
    const footerContentBase = buildFooterContent(
        footer,
        footerClasses,
        leftButtonProps,
        buttons
    ) as React.ReactNode;

    const footerContent = shouldRenderStickyFooter ? (
        <StickyFooter height={84}>{footerContentBase}</StickyFooter>
    ) : (
        <>{footerContentBase}</>
    );

    const headerContent = header ? (
        buildHeader(title, topRightContent, hideXOnMobile, removeModal)
    ) : null;

    const backdropClickHandler = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    }, [backDropClick, removeModal]);

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={backdropClickHandler}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section ref={ref}
                className={clsx(modalClassesBase, allowBackgroundInteraction && 'pointer-events-auto')}
                data-testid={testId}
                style={modalStyles}
            >
                {headerContent}
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