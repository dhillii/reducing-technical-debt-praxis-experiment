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

type SizeConfig = {
    modalAdd?: string;
    backdropAdd?: string;
    padding?: string;
    headerAdd?: string;
};

const sizeConfigMap: Record<ModalSize, SizeConfig> = {
    sm: {
        modalAdd: 'max-w-[480px]',
        backdropAdd: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerAdd: '-inset-x-8'
    },
    md: {
        modalAdd: 'max-w-[720px]',
        backdropAdd: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerAdd: '-inset-x-8'
    },
    lg: {
        modalAdd: 'max-w-[1020px]',
        backdropAdd: 'p-4 md:p-[4vmin]',
        padding: 'p-7',
        headerAdd: '-inset-x-8'
    },
    xl: {
        modalAdd: 'max-w-[1240px]0',
        backdropAdd: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerAdd: '-inset-x-10 -top-10'
    },
    full: {
        modalAdd: 'h-full',
        backdropAdd: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerAdd: '-inset-x-10'
    },
    bleed: {
        modalAdd: 'h-full',
        padding: 'p-10',
        headerAdd: '-inset-x-10'
    }
};

/**
 * Returns configuration for a given modal size.
 */
function getSizeConfig(size: ModalSize | undefined): SizeConfig {
    return size && size in sizeConfigMap ? sizeConfigMap[size as ModalSize] : {
        backdropAdd: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerAdd: '-inset-x-8'
    };
}

/**
 * Determines if the modal should grow based on size/height props.
 */
function shouldGrow(size: ModalSize | undefined, height: 'full' | number | undefined): boolean {
    return size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number';
}

/**
 * Builds the footer JSX based on props.
 */
function buildFooterContent(
    footer: boolean | React.ReactNode | undefined,
    leftButtonProps: ButtonProps | undefined,
    buttons: ButtonProps[],
    stickyFooter: boolean,
    paddingClasses: string
) {
    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    let content: React.ReactNode;
    if (footer) {
        content = footer;
    } else {
        content = (
            <div className={footerClasses}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );
    }

    return stickyFooter ? (
        <StickyFooter height={84}>{content}</StickyFooter>
    ) : (
        <>{content}</>
    );
}

/**
 * Computes width‑related style and class adjustments.
 */
function applyWidth(
    width: 'full' | 'toSidebar' | number | undefined,
    modalClasses: string,
    modalStyles: Record<string, string>
) {
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
    return {modalClasses, modalStyles};
}

/**
 * Computes height‑related style and class adjustments.
 */
function applyHeight(
    height: 'full' | number | undefined,
    modalClasses: string,
    modalStyles: Record<string, string>
) {
    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }
    return {modalClasses, modalStyles};
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
                onClick: onCancel ?? (() => removeModal()),
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

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const baseModalClasses = clsx(
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

    const baseBackdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none'
    );

    const sizeConfig = getSizeConfig(size);
    const modalClasses = clsx(
        baseModalClasses,
        sizeConfig.modalAdd
    );

    const backdropClasses = clsx(
        baseBackdropClasses,
        sizeConfig.backdropAdd,
        'max-[800px]:!pb-20'
    );

    const paddingClasses = padding ? (sizeConfig.padding ?? '') : 'p-0';

    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
        sizeConfig.headerAdd,
        paddingClasses,
        'pb-0'
    );

    let contentClasses = clsx(
        paddingClasses,
        'py-0',
        shouldGrow(size, height) && 'grow'
    );

    const modalStyles: Record<string, string> = {};

    const widthResult = applyWidth(width, modalClasses, modalStyles);
    const heightResult = applyHeight(height, widthResult.modalClasses, widthResult.modalStyles);

    const finalModalClasses = clsx(
        heightResult.modalClasses,
        allowBackgroundInteraction && 'pointer-events-auto'
    );

    const footerContent = buildFooterContent(footer, leftButtonProps, buttons, stickyFooter, paddingClasses);

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )} />
            <section
                ref={ref}
                className={finalModalClasses}
                data-testid={testId}
                style={heightResult.modalStyles}
            >
                {header === false ? null : (
                    topRightContent && topRightContent !== 'close' ? (
                        <header className={headerClasses}>
                            {title && <Heading level={3}>{title}</Heading>}
                            {topRightContent}
                        </header>
                    ) : (
                        <header className={headerClasses}>
                            {title && <Heading level={3}>{title}</Heading>}
                            <div className={clsx(
                                topRightContent !== 'close' && 'md:!invisible md:!hidden',
                                hideXOnMobile && 'hidden',
                                'absolute right-6 top-6'
                            )}>
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
                    )
                )}
                <div className={contentClasses}>{children}</div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;