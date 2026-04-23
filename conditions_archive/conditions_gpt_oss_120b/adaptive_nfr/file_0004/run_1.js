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

/** Configuration for each modal size */
const sizeConfig: Record<
    ModalSize,
    {
        modalClass: string;
        backdropClass: string;
        paddingClass: string;
        headerClass: string;
    }
> = {
    sm: {
        modalClass: 'max-w-[480px]',
        backdropClass: 'p-4 md:p-[8vmin]',
        paddingClass: 'p-8',
        headerClass: '-inset-x-8'
    },
    md: {
        modalClass: 'max-w-[720px]',
        backdropClass: 'p-4 md:p-[8vmin]',
        paddingClass: 'p-8',
        headerClass: '-inset-x-8'
    },
    lg: {
        modalClass: 'max-w-[1020px]',
        backdropClass: 'p-4 md:p-[4vmin]',
        paddingClass: 'p-7',
        headerClass: '-inset-x-8'
    },
    xl: {
        modalClass: 'max-w-[1240px]0',
        backdropClass: 'p-4 md:p-[3vmin]',
        paddingClass: 'p-10',
        headerClass: '-inset-x-10 -top-10'
    },
    full: {
        modalClass: 'h-full',
        backdropClass: 'p-4 md:p-[3vmin]',
        paddingClass: 'p-10',
        headerClass: '-inset-x-10'
    },
    bleed: {
        modalClass: 'h-full',
        backdropClass: '',
        paddingClass: 'p-10',
        headerClass: '-inset-x-10'
    }
};

/** Default configuration when size is not one of the predefined keys */
const defaultSizeConfig = {
    modalClass: '',
    backdropClass: 'p-4 md:p-[8vmin]',
    paddingClass: 'p-8',
    headerClass: '-inset-x-8'
};

/** Determines if the modal should grow based on size/height */
function shouldGrow(size: ModalSize, height: ModalProps['height']): boolean {
    return (
        size === 'full' ||
        size === 'bleed' ||
        height === 'full' ||
        typeof height === 'number'
    );
}

/** Returns the appropriate animation class based on alignment and state */
function getAnimationClass(
    animate: boolean,
    formSheet: boolean,
    animationFinished: boolean,
    align: ModalProps['align']
): string | false {
    if (!animate || formSheet || animationFinished) {
        return false;
    }
    if (align === 'center') return 'animate-modal-in';
    if (align === 'right') return 'animate-modal-in-from-right';
    return false;
}

/** Handles removal of the modal with dirty check */
function useRemoveModal(
    dirty: boolean,
    modal: ReturnType<typeof useModal>,
    afterClose?: () => void
) {
    return () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };
}

/** Handles backdrop click to close modal */
function handleBackdropClick(
    e: React.MouseEvent<HTMLDivElement>,
    backDropClick: boolean,
    removeModal: () => void
) {
    if (e.target === e.currentTarget && backDropClick) {
        removeModal();
    }
}

/** Builds class list for modal container */
function buildModalClasses(
    base: string,
    align: ModalProps['align'],
    size: ModalSize,
    formSheet: boolean,
    animateClass: string | false,
    scrolling: boolean,
    stickyHeader: boolean
) {
    const alignClass = {
        center: 'mx-auto',
        left: 'mr-auto',
        right: 'ml-auto'
    }[align];

    const classes = [
        base,
        alignClass,
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        animateClass,
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
    ];

    if (stickyHeader) {
        classes.push('sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black');
    }

    return clsx(...classes);
}

/** Builds class list for backdrop */
function buildBackdropClasses(base: string, allowBackgroundInteraction: boolean) {
    return clsx(
        base,
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none'
    );
}

/** Builds class list for header */
function buildHeaderClasses(
    base: string,
    topRightContent: ModalProps['topRightContent'],
    extra: string
) {
    const needsFlex = !topRightContent || topRightContent !== 'close';
    return clsx(base, needsFlex && 'flex items-center justify-between gap-5', extra);
}

/** Builds class list for footer */
function buildFooterClasses(paddingClass: string, stickyFooter: boolean) {
    return clsx(
        `${paddingClass} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );
}

/** Main Modal component */
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
    const removeModal = useRemoveModal(dirty, modal, afterClose);

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
        if (!onOk) return;
        const handleCMDS = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                onOk();
            }
        };
        if (enableCMDS) {
            window.addEventListener('keydown', handleCMDS);
            return () => window.removeEventListener('keydown', handleCMDS);
        }
    }, [onOk, enableCMDS]);

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

    const {modalClass, backdropClass, paddingClass, headerClass} =
        sizeConfig[size] ?? defaultSizeConfig;

    const animationClass = getAnimationClass(animate, formSheet, animationFinished, align);
    const modalClasses = buildModalClasses(
        clsx(
            'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
            modalClass
        ),
        align,
        size,
        formSheet,
        animationClass,
        scrolling,
        stickyHeader
    );

    const backdropClasses = buildBackdropClasses(
        clsx(backdropClass),
        allowBackgroundInteraction
    );

    const finalPaddingClass = padding ? paddingClass : 'p-0';
    const headerClasses = buildHeaderClasses(
        headerClass,
        topRightContent,
        finalPaddingClass
    );

    const contentClasses = clsx(
        finalPaddingClass,
        'py-0',
        shouldGrow(size, height) && 'grow'
    );

    const footerClasses = buildFooterClasses(finalPaddingClass, stickyFooter);

    const modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = `${width}px`;
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
        modalStyles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

    let footerContent: React.ReactNode;
    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        // No footer, ensure content has no bottom padding
        // (contentClasses already includes padding, so we add extra class here)
        // This mirrors original behavior where contentClasses received 'pb-0'
        // via later concatenation.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _ = (contentClasses += ' pb-0 ');
    } else {
        footerContent = (
            <div className={footerClasses}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );
    }

    footerContent = stickyFooter ? (
        <StickyFooter height={84}>{footerContent}</StickyFooter>
    ) : (
        <>{footerContent}</>
    );

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={e => handleBackdropClick(e, backDropClick, removeModal)}>
            <div
                className={clsx(
                    'pointer-events-none fixed inset-0 z-0',
                    backDrop && !formSheet && topLevelBackdropClasses,
                    formSheet && 'bg-[rgba(98,109,121,0.08)]'
                )}
            />
            <section
                ref={ref}
                className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')}
                data-testid={testId}
                style={modalStyles}
            >
                {header === false ? null : topRightContent && topRightContent !== 'close' ? (
                    <header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        {topRightContent}
                    </header>
                ) : (
                    <header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        <div
                            className={clsx(
                                `${topRightContent !== 'close' && 'md:!invisible md:!hidden'}`,
                                hideXOnMobile && 'hidden',
                                'absolute right-6 top-6'
                            )}
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
                )}
                <div className={contentClasses}>{children}</div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;