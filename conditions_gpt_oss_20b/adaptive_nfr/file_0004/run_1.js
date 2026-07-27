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
    stickyHeader?:boolean;
    scrolling?: boolean;
    dirty?: boolean;
    animate?: boolean;
    formSheet?: boolean;
    enableCMDS?: boolean;
    allowBackgroundInteraction?: boolean;
}

export const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

/**
 * Configuration for modal size variants.
 */
const sizeConfigs: Record<string, {
    modalClass: string;
    backdropClass: string;
    paddingClass: string;
    headerClass: string;
}> = {
    sm: {
        modalClass: 'max-w-[480px]',
        backdropClass: 'p-4 md:p-[8vmin]',
        paddingClass: 'p-8',
        headerClass: '-inset-x-8',
    },
    md: {
        modalClass: 'max-w-[720px]',
        backdropClass: 'p-4 md:p-[8vmin]',
        paddingClass: 'p-8',
        headerClass: '-inset-x-8',
    },
    lg: {
        modalClass: 'max-w-[1020px]',
        backdropClass: 'p-4 md:p-[4vmin]',
        paddingClass: 'p-7',
        headerClass: '-inset-x-8',
    },
    xl: {
        modalClass: 'max-w-[1240px]0',
        backdropClass: 'p-4 md:p-[3vmin]',
        paddingClass: 'p-10',
        headerClass: '-inset-x-10 -top-10',
    },
    full: {
        modalClass: 'h-full',
        backdropClass: 'p-4 md:p-[3vmin]',
        paddingClass: 'p-10',
        headerClass: '-inset-x-10',
    },
    bleed: {
        modalClass: 'h-full',
        backdropClass: '',
        paddingClass: 'p-10',
        headerClass: '-inset-x-10',
    },
};

/**
 * Returns size configuration for a given size value.
 */
function getSizeConfig(size: string) {
    return sizeConfigs[size] ?? {
        modalClass: '',
        backdropClass: 'p-4 md:p-[8vmin]',
        paddingClass: 'p-8',
        headerClass: '-inset-x-8',
    };
}

/**
 * Computes modal classes based on props and size configuration.
 */
function computeModalClasses(props: ModalProps, sizeConfig: ReturnType<typeof getSizeConfig>, animationFinished: boolean) {
    const {
        align = 'center',
        size = 'md',
        formSheet = false,
        animate = true,
        scrolling = true,
    } = props;
    let classes = clsx(
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
        sizeConfig.modalClass
    );
    return classes;
}

/**
 * Computes backdrop classes based on props and size configuration.
 */
function computeBackdropClasses(props: ModalProps, sizeConfig: ReturnType<typeof getSizeConfig>) {
    const {allowBackgroundInteraction = false} = props;
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        sizeConfig.backdropClass
    );
}

/**
 * Computes header classes based on props and size configuration.
 */
function computeHeaderClasses(props: ModalProps, sizeConfig: ReturnType<typeof getSizeConfig>) {
    const {topRightContent, stickyHeader = false, hideXOnMobile = false} = props;
    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
        sizeConfig.headerClass
    );
    return headerClasses;
}

/**
 * Computes content classes based on props and size configuration.
 */
function computeContentClasses(props: ModalProps, sizeConfig: ReturnType<typeof getSizeConfig>, animationFinished: boolean) {
    const {height, size = 'md'} = props;
    const paddingClasses = sizeConfig.paddingClass;
    let classes = clsx(
        paddingClasses,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );
    return classes;
}

/**
 * Computes footer classes based on props.
 */
function computeFooterClasses(props: ModalProps) {
    const {padding = true, stickyFooter = false} = props;
    const paddingClasses = padding ? 'p-8' : 'p-0';
    return clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );
}

/**
 * Computes modal inline styles based on width and height props.
 */
function computeModalStyles(props: ModalProps) {
    const {width, height} = props;
    const styles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};
    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = `${width}px`;
    } else if (width === 'full') {
        // handled via class
    } else if (width === 'toSidebar') {
        // handled via class
    }
    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        // handled via class
    }
    return styles;
}

/**
 * Handles modal removal with dirty check.
 */
function useRemoveModal(modal: any, dirty: boolean, afterClose?: () => void) {
    return () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };
}

/**
 * Handles Escape key to close modal.
 */
function useEscapeKeyHandler(modal: any, dirty: boolean, afterClose?: () => void, onCancel?: () => void) {
    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            const activeEl = document.activeElement;
            if (activeEl?.hasAttribute('data-kg-link-input')) return;
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
        };
        document.addEventListener('keydown', handleEscapeKey);
        return () => document.removeEventListener('keydown', handleEscapeKey);
    }, [modal, dirty, afterClose, onCancel]);
}

/**
 * Handles Cmd/Ctrl+S to trigger onOk.
 */
function useCMDSHandler(onOk?: () => void, enableCMDS = true) {
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
}

/**
 * Builds button array for modal footer.
 */
function buildButtons(props: ModalProps) {
    const {
        cancelLabel,
        okLabel,
        okColor = 'black',
        okLoading = false,
        okDisabled = false,
        buttonsDisabled = false,
        onOk,
        onCancel,
        removeModal,
    } = props;
    const buttons: ButtonProps[] = [];
    if (!props.footer) {
        if (cancelLabel) {
            buttons.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: onCancel ?? removeModal,
                disabled: buttonsDisabled,
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
                loading: okLoading,
            });
        }
    }
    return buttons;
}

/**
 * Builds footer content based on props.
 */
function buildFooterContent(props: ModalProps, buttons: ButtonProps[], leftButtonProps?: ButtonProps) {
    const {footer, stickyFooter = false} = props;
    let footerContent: React.ReactNode;
    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        footerContent = null;
    } else {
        footerContent = (
            <div className={computeFooterClasses(props)}>
                <div>
                    {leftButtonProps && <Button {...leftButtonProps} />}
                </div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons}/>
                </div>
            </div>
        );
    }
    return stickyFooter ? (
        <StickyFooter height={84}>{footerContent}</StickyFooter>
    ) : (
        <>{footerContent}</>
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

    useEffect(() => setGlobalDirtyState(dirty), [dirty, setGlobalDirtyState]);

    useEscapeKeyHandler(modal, dirty, afterClose, onCancel);
    useCMDSHandler(onOk, enableCMDS);

    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

    const sizeConfig = getSizeConfig(size);
    const modalClasses = computeModalClasses({size, align, formSheet, animate, scrolling, ...{sizeConfig, animationFinished}}, sizeConfig, animationFinished);
    const backdropClasses = computeBackdropClasses({allowBackgroundInteraction, ...{sizeConfig}}, sizeConfig);
    const headerClasses = computeHeaderClasses({topRightContent, stickyHeader, hideXOnMobile, ...{sizeConfig}}, sizeConfig);
    const contentClasses = computeContentClasses({height, size, ...{sizeConfig}}, sizeConfig, animationFinished);
    const modalStyles = computeModalStyles({width, height});

    const removeModal = useRemoveModal(modal, dirty, afterClose);

    const buttons = buildButtons({
        cancelLabel,
        okLabel,
        okColor,
        okLoading,
        okDisabled,
        buttonsDisabled,
        onOk,
        onCancel,
        removeModal,
        footer,
        leftButtonProps,
    });

    const footerContent = buildFooterContent({footer, stickyFooter, leftButtonProps}, buttons, leftButtonProps);

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
                    !topRightContent || topRightContent === 'close' ? (
                        <header className={headerClasses}>
                            {title && <Heading level={3}>{title}</Heading>}
                            <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                                <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                            </div>
                        </header>
                    ) : (
                        <header className={headerClasses}>
                            {title && <Heading level={3}>{title}</Heading>}
                            {topRightContent}
                        </header>
                    )
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