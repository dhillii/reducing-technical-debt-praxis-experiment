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

/** Hook to handle Escape key closing logic */
function useEscapeKey(
    modal: ReturnType<typeof useModal>,
    dirty: boolean,
    afterClose?: () => void,
    onCancel?: () => void
) {
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

/** Hook to handle Cmd/Ctrl+S shortcut */
function useCMDS(onOk?: () => void, enableCMDS = true) {
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

/** Hook to manage animation finished state */
function useAnimationFinished(setAnimationFinished: React.Dispatch<React.SetStateAction<boolean>>) {
    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, [setAnimationFinished]);
}

/** Hook to sync global dirty state */
function useGlobalDirty(dirty: boolean, setGlobalDirtyState: (dirty: boolean) => void) {
    useEffect(() => setGlobalDirtyState(dirty), [dirty, setGlobalDirtyState]);
}

/** Create modal action buttons */
function createButtons(props: ModalProps): ButtonProps[] {
    const {
        cancelLabel,
        okLabel,
        okColor = 'black',
        okLoading = false,
        okDisabled = false,
        buttonsDisabled = false,
        onOk,
        onCancel,
        dirty,
        afterClose,
        modal,
    } = props;

    const buttons: ButtonProps[] = [];

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

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

/** Compute size specific classes */
function computeSizeClasses(size: ModalSize) {
    switch (size) {
        case 'sm':
            return {
                modalSize: 'max-w-[480px]',
                backdropSize: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                header: '-inset-x-8',
            };
        case 'md':
            return {
                modalSize: 'max-w-[720px]',
                backdropSize: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                header: '-inset-x-8',
            };
        case 'lg':
            return {
                modalSize: 'max-w-[1020px]',
                backdropSize: 'p-4 md:p-[4vmin]',
                padding: 'p-7',
                header: '-inset-x-8',
            };
        case 'xl':
            return {
                modalSize: 'max-w-[1240px]0',
                backdropSize: 'p-4 md:p-[3vmin]',
                padding: 'p-10',
                header: '-inset-x-10 -top-10',
            };
        case 'full':
            return {
                modalSize: 'h-full',
                backdropSize: 'p-4 md:p-[3vmin]',
                padding: 'p-10',
                header: '-inset-x-10',
            };
        case 'bleed':
            return {
                modalSize: 'h-full',
                backdropSize: '',
                padding: 'p-10',
                header: '-inset-x-10',
            };
        default:
            return {
                modalSize: '',
                backdropSize: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                header: '-inset-x-8',
            };
    }
}

/** Compute modal, backdrop, header, content, and footer classes */
function computeClasses(
    props: ModalProps,
    animationFinished: boolean
) {
    const {
        size = 'md',
        align = 'center',
        formSheet = false,
        scrolling = true,
        animate = true,
        stickyHeader = false,
        stickyFooter = false,
        padding = true,
        topRightContent,
        width,
        height,
    } = props;

    const sizeClasses = computeSizeClasses(size);

    let modalClasses = clsx(
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

    let backdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        props.allowBackgroundInteraction && 'pointer-events-none'
    );

    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );

    if (stickyHeader) {
        headerClasses = clsx(
            headerClasses,
            'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );
    }

    modalClasses = clsx(modalClasses, sizeClasses.modalSize);
    backdropClasses = clsx(backdropClasses, sizeClasses.backdropSize);
    let paddingClasses = sizeClasses.padding;
    headerClasses = clsx(headerClasses, sizeClasses.header);

    if (!padding) {
        paddingClasses = 'p-0';
    }

    const contentClasses = clsx(
        paddingClasses,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    backdropClasses = clsx(backdropClasses, 'max-[800px]:!pb-20');

    return {
        modalClasses,
        backdropClasses,
        headerClasses,
        contentClasses,
        footerClasses,
        paddingClasses,
    };
}

/** Handle backdrop click to close modal */
function handleBackdropClick(
    e: React.MouseEvent<HTMLDivElement>,
    backDropClick: boolean,
    removeModal: () => void
) {
    if (e.target === e.currentTarget && backDropClick) {
        removeModal();
    }
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

    useGlobalDirty(dirty, setGlobalDirtyState);
    useEscapeKey(modal, dirty, afterClose, onCancel);
    useCMDS(onOk, enableCMDS);
    useAnimationFinished(setAnimationFinished);

    const buttons = createButtons({
        cancelLabel,
        okLabel,
        okColor,
        okLoading,
        okDisabled,
        buttonsDisabled,
        onOk,
        onCancel,
        dirty,
        afterClose,
        modal,
        footer,
        topRightContent,
        hideXOnMobile,
        backDrop,
        backDropClick,
        stickyFooter,
        stickyHeader,
        scrolling,
        animate,
        formSheet,
        enableCMDS,
        allowBackgroundInteraction,
        size,
        align,
        width,
        height,
        testId,
        title,
        leftButtonProps,
        padding,
    });

    const {
        modalClasses,
        backdropClasses,
        headerClasses,
        contentClasses,
        footerClasses,
        paddingClasses,
    } = computeClasses({
        size,
        align,
        width,
        height,
        testId,
        title,
        okLabel,
        okColor,
        okLoading,
        cancelLabel,
        footer,
        header,
        leftButtonProps,
        buttonsDisabled,
        okDisabled,
        padding,
        onOk,
        onCancel,
        topRightContent,
        hideXOnMobile,
        afterClose,
        children,
        backDrop,
        backDropClick,
        stickyFooter,
        stickyHeader,
        scrolling,
        dirty,
        animate,
        formSheet,
        enableCMDS,
        allowBackgroundInteraction,
        dirty,
        modal,
    }, animationFinished);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    let footerContent: React.ReactNode;
    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        footerContent = null;
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
                    (backDrop && !formSheet) && topLevelBackdropClasses,
                    formSheet && 'bg-[rgba(98,109,121,0.08)]'
                )}
            />
            <section
                ref={ref}
                className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')}
                data-testid={testId}
                style={{
                    width: typeof width === 'number' ? '100%' : undefined,
                    maxWidth: typeof width === 'number' ? `${width}px` : undefined,
                    height: typeof height === 'number' ? '100%' : undefined,
                    maxHeight: typeof height === 'number' ? `${height}px` : undefined,
                }}
            >
                {header === false ? null : !topRightContent || topRightContent === 'close' ? (
                    <header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        <div
                            className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}
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
                )}
                <div className={contentClasses}>{children}</div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;