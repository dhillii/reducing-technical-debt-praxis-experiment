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

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Replace Conditional with Polymorphism for ModalSize handling
// ─────────────────────────────────────────────────────────────────────────────────────────────────

interface ModalSizeConfig {
    maxWidth?: string;
    paddingClasses: string;
    headerInset: string;
    backdropPadding: string;
}

const sizeConfigMap: Record<ModalSize, ModalSizeConfig> = {
    sm: {
        maxWidth: 'max-w-[480px]',
        paddingClasses: 'p-8',
        headerInset: '-inset-x-8',
        backdropPadding: 'p-4 md:p-[8vmin]'
    },
    md: {
        maxWidth: 'max-w-[720px]',
        paddingClasses: 'p-8',
        headerInset: '-inset-x-8',
        backdropPadding: 'p-4 md:p-[8vmin]'
    },
    lg: {
        maxWidth: 'max-w-[1020px]',
        paddingClasses: 'p-7',
        headerInset: '-inset-x-8',
        backdropPadding: 'p-4 md:p-[4vmin]'
    },
    xl: {
        maxWidth: 'max-w-[1240px]0',
        paddingClasses: 'p-10',
        headerInset: '-inset-x-10 -top-10',
        backdropPadding: 'p-4 md:p-[3vmin]'
    },
    full: {
        maxWidth: undefined,
        paddingClasses: 'p-10',
        headerInset: '-inset-x-10',
        backdropPadding: 'p-4 md:p-[3vmin]'
    },
    bleed: {
        maxWidth: undefined,
        paddingClasses: 'p-10',
        headerInset: '-inset-x-10',
        backdropPadding: 'p-4 md:p-[3vmin]'
    }
};

const getBackdropPaddingBySize = (size: ModalSize, defaultPadding: string): string => {
    return sizeConfigMap[size]?.backdropPadding ?? defaultPadding;
};

const getPaddingClassesBySize = (size: ModalSize, paddingOverride: boolean): string => {
    if (!paddingOverride) return 'p-0';
    return sizeConfigMap[size]?.paddingClasses ?? 'p-8';
};

const getHeaderInsetBySize = (size: ModalSize): string => {
    return sizeConfigMap[size]?.headerInset ?? '-inset-x-8';
};

const getMaxWidthBySize = (size: ModalSize): string[] => {
    const config = sizeConfigMap[size];
    return config?.maxWidth ? [config.maxWidth] : [];
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Predicate functions to decompose complex conditionals
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const isCenterAlign = (align: string): boolean => align === 'center';
const isRightAlign = (align: string): boolean => align === 'right';
const isFormSheet = (formSheet: boolean): boolean => formSheet;

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Extract button configuration logic
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const buildCancelButton = (cancelLabel: string, onCancel: (() => void) | undefined, buttonsDisabled: boolean, removeModal: () => void): ButtonProps => ({
    key: 'cancel-modal',
    label: cancelLabel,
    color: 'outline',
    onClick: onCancel ?? removeModal,
    disabled: buttonsDisabled
});

const buildOkButton = (okLabel: string, okColor: string, onOk: (() => void) | undefined, buttonsDisabled: boolean, okDisabled: boolean, okLoading: boolean): ButtonProps => ({
    key: 'ok-modal',
    label: okLabel,
    color: okColor,
    className: 'min-w-[80px]',
    onClick: onOk,
    disabled: buttonsDisabled || okDisabled,
    loading: okLoading
});

const buildButtonList = (
    footer: ModalProps['footer'],
    cancelLabel: string,
    okLabel: string,
    onCancel: (() => void) | undefined,
    onOk: (() => void) | undefined,
    okColor: string,
    buttonsDisabled: boolean,
    okDisabled: boolean,
    okLoading: boolean,
    removeModal: () => void
): ButtonProps[] => {
    const buttons: ButtonProps[] = [];

    if (footer === false) {
        if (cancelLabel) {
            buttons.push(buildCancelButton(cancelLabel, onCancel, buttonsDisabled, removeModal));
        }

        if (okLabel) {
            buttons.push(buildOkButton(okLabel, okColor, onOk, buttonsDisabled, okDisabled, okLoading));
        }
    }

    return buttons;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Modal component
// ─────────────────────────────────────────────────────────────────────────────────────────────────

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
    leftButtonOptions: leftButtonProps,
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
        const timeout = setTimeout(() => {
            setAnimationFinished(true);
        }, 250);
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

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const buttons = buildButtonList(
        footer,
        cancelLabel,
        okLabel,
        onCancel,
        onOk,
        okColor,
        buttonsDisabled,
        okDisabled,
        okLoading,
        removeModal
    );

    let modalClasses = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        isCenterAlign(align) && 'mx-auto',
        align === 'left' && 'mr-auto',
        isRightAlign(align) && 'ml-auto',
        size !== 'bleed' && 'rounded',
        isFormSheet(formSheet) ? 'shadow-md' : 'shadow-xl',
        animate && !isFormSheet(formSheet) && !animationFinished && isCenterAlign(align) && 'animate-modal-in',
        animate && !isFormSheet(formSheet) && !animationFinished && isRightAlign(align) && 'animate-modal-in-from-right',
        isFormSheet(formSheet) && !animationFinished && 'animate-modal-in-reverse',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
    );

    const backdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none'
    );

    // Compose padding and header classes based on size
    const paddingClasses = getPaddingClassesBySize(size, padding);
    const headerInset = getHeaderInsetBySize(size);
    const backdropPadding = getBackdropPaddingBySize(size, 'p-4 md:p-[8vmin]');

    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );

    if (stickyHeader) {
        headerClasses = clsx(
            headerClasses,
            'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );
    }

    headerClasses = clsx(headerClasses, paddingClasses, '-inset-x-0'.replace('-inset-x-0', headerInset), 'pb-0');

    const contentClasses = clsx(paddingClasses, 'py-0');

    // Modal size-specific styling
    modalClasses = clsx(
        modalClasses,
        ...getMaxWidthBySize(size)
    );

    let backdropContent = clsx(
        backdropClasses,
        backdropPadding
    );

    backdropContent = clsx(backdropContent, 'max-[800px]:!pb-20');

    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    if (['full', 'bleed'].includes(size) || height === 'full' || typeof height === 'number') {
        contentClasses += ' grow';
    }

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

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

    let footerContent;
    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        contentClasses += ' pb-0 ';
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
        footerContent
    );

    return (
        <div
            className={backdropContent as string}
            id='modal-backdrop'
            onMouseDown={handleBackdropClick}
        >
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !isFormSheet(formSheet)) && topLevelBackdropClasses,
                isFormSheet(formSheet) && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section
                ref={ref}
                className={clsx(
                    modalClasses,
                    allowBackgroundInteraction && 'pointer-events-auto'
                )}
                data-testid={testId}
                style={modalStyles}
            >
                {header === false ? '' : (
                    (!topRightContent || topRightContent === 'close') ? (
                        <header className={headerClasses}>
                            {title && <Heading level={3}>{title}</Heading>}
                            <div
                                className={
                                    `${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`
                                }
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
                    ) : (
                        <header className={headerClasses}>
                            {title && <Heading level={3}>{title}</Heading>}
                            {topRightContent}
                        </header>
                    )
                )}
                <div className={contentClasses as string}>{children}</div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;