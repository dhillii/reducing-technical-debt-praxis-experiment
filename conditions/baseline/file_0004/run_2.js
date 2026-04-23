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

interface SizeConfig {
    modalMaxWidth: string;
    backdropPadding: string;
    padding: string;
    headerInset: string;
}

const SIZE_CONFIG: Record<ModalSize | 'default', SizeConfig> = {
    sm: {
        modalMaxWidth: 'max-w-[480px]',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    },
    md: {
        modalMaxWidth: 'max-w-[720px]',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    },
    lg: {
        modalMaxWidth: 'max-w-[1020px]',
        backdropPadding: 'p-4 md:p-[4vmin]',
        padding: 'p-7',
        headerInset: '-inset-x-8'
    },
    xl: {
        modalMaxWidth: 'max-w-[1240px]',
        backdropPadding: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10 -top-10'
    },
    full: {
        modalMaxWidth: 'h-full',
        backdropPadding: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10'
    },
    bleed: {
        modalMaxWidth: 'h-full',
        backdropPadding: '',
        padding: 'p-10',
        headerInset: '-inset-x-10'
    },
    default: {
        modalMaxWidth: '',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    }
};

const buildSizeClasses = (size: ModalSize): SizeConfig => {
    return SIZE_CONFIG[size] || SIZE_CONFIG.default;
};

const buildModalClasses = (
    align: string,
    size: ModalSize,
    formSheet: boolean,
    animate: boolean,
    animationFinished: boolean,
    scrolling: boolean,
    sizeConfig: SizeConfig
): string => {
    return clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        animate && !formSheet && !animationFinished && align === 'center' && 'animate-modal-in',
        animate && !formSheet && !animationFinished && align === 'right' && 'animate-modal-in-from-right',
        formSheet && !animationFinished && 'animate-modal-in-reverse',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
        sizeConfig.modalMaxWidth
    );
};

const buildBackdropClasses = (
    allowBackgroundInteraction: boolean,
    formSheet: boolean,
    sizeConfig: SizeConfig
): string => {
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        sizeConfig.backdropPadding,
        'max-[800px]:!pb-20'
    );
};

const buildHeaderClasses = (
    topRightContent: 'close' | React.ReactNode | undefined,
    stickyHeader: boolean,
    paddingClasses: string,
    sizeConfig: SizeConfig
): string => {
    return clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
        paddingClasses,
        'pb-0',
        sizeConfig.headerInset
    );
};

const buildContentClasses = (
    paddingClasses: string,
    size: ModalSize,
    height: 'full' | number | undefined
): string => {
    return clsx(
        paddingClasses,
        'py-0',
        (size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow'
    );
};

const buildFooterClasses = (paddingClasses: string, stickyFooter: boolean): string => {
    return clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );
};

const applyWidthStyles = (
    width: 'full' | 'toSidebar' | number | undefined,
    modalClasses: string
): {classes: string; styles: {width?: string; maxWidth?: string}} => {
    const styles: {width?: string; maxWidth?: string} = {};

    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = width + 'px';
    } else if (width === 'full') {
        modalClasses = clsx(modalClasses, 'w-full');
    } else if (width === 'toSidebar') {
        modalClasses = clsx(
            modalClasses,
            'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
        );
    }

    return {classes: modalClasses, styles};
};

const applyHeightStyles = (
    height: 'full' | number | undefined,
    modalClasses: string
): {classes: string; styles: {height?: string; maxHeight?: string}} => {
    const styles: {height?: string; maxHeight?: string} = {};

    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = height + 'px';
    } else if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

    return {classes: modalClasses, styles};
};

const buildFooterContent = (
    footer: boolean | React.ReactNode | undefined,
    buttons: ButtonProps[],
    leftButtonProps: ButtonProps | undefined,
    stickyFooter: boolean,
    footerClasses: string
): React.ReactNode => {
    let footerContent: React.ReactNode;

    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        return null;
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

    return stickyFooter ? (
        <StickyFooter height={84}>
            {footerContent}
        </StickyFooter>
    ) : (
        <>{footerContent}</>
    );
};

const buildButtons = (
    footer: boolean | React.ReactNode | undefined,
    cancelLabel: string | undefined,
    okLabel: string | undefined,
    okColor: ButtonColor,
    buttonsDisabled: boolean | undefined,
    okDisabled: boolean | undefined,
    okLoading: boolean,
    onCancel: (() => void) | undefined,
    onOk: (() => void) | undefined,
    removeModal: () => void
): ButtonProps[] => {
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

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            const activeEl = document.activeElement;
            if (activeEl?.hasAttribute('data-kg-link-input')) {
                return;
            }

            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }

            setTimeout(() => {
                if (onCancel) {
                    onCancel();
                } else {
                    removeModal();
                }
            });

            event.stopPropagation();
        };

        document.addEventListener('keydown', handleEscapeKey);
        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [modal, dirty, afterClose, onCancel, removeModal]);

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
        return () => {
            window.removeEventListener('keydown', handleCMDS);
        };
    }, [onOk, enableCMDS]);

    const sizeConfig = buildSizeClasses(size);
    let paddingClasses = padding ? sizeConfig.padding : 'p-0';

    const buttons = buildButtons(
        footer,
        cancelLabel,
        okLabel,
        okColor,
        buttonsDisabled,
        okDisabled,
        okLoading,
        onCancel,
        onOk,
        removeModal
    );

    let modalClasses = buildModalClasses(
        align,
        size,
        formSheet,
        animate,
        animationFinished,
        scrolling,
        sizeConfig
    );

    const backdropClasses = buildBackdropClasses(
        allowBackgroundInteraction,
        formSheet,
        sizeConfig
    );

    const headerClasses = buildHeaderClasses(
        topRightContent,
        stickyHeader,
        paddingClasses,
        sizeConfig
    );

    const contentClasses = buildContentClasses(paddingClasses, size, height);
    const footerClasses = buildFooterClasses(paddingClasses, stickyFooter);

    const widthResult = applyWidthStyles(width, modalClasses);
    modalClasses = widthResult.classes;
    const modalStyles = widthResult.styles;

    const heightResult = applyHeightStyles(height, modalClasses);
    modalClasses = heightResult.classes;
    Object.assign(modalStyles, heightResult.styles);

    const footerContent = buildFooterContent(
        footer,
        buttons,
        leftButtonProps,
        stickyFooter,
        footerClasses
    );

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const renderHeader = () => {
        if (header === false) return null;

        const showCloseButton = !topRightContent || topRightContent === 'close';

        return (
            <header className={headerClasses}>
                {title && <Heading level={3}>{title}</Heading>}
                {showCloseButton ? (
                    <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
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
                ) : (
                    topRightContent
                )}
            </header>
        );
    };

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                backDrop && !formSheet && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )} />
            <section
                ref={ref}
                className={clsx(
                    modalClasses,
                    allowBackgroundInteraction && 'pointer-events-auto'
                )}
                data-testid={testId}
                style={modalStyles}
            >
                {renderHeader()}
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