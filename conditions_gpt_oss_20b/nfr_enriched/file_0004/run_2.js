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

/**
 * Handles the Escape key to close the modal.
 */
const useEscapeKey = (
    modal: ReturnType<typeof useModal>,
    dirty: boolean,
    afterClose?: () => void,
    onCancel?: () => void
) => {
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
};

/**
 * Handles Cmd/Ctrl+S to trigger onOk.
 */
const useCMDS = (onOk?: () => void, enableCMDS = true) => {
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
};

/**
 * Handles animation finish state.
 */
const useAnimationFinished = (setAnimationFinished: React.Dispatch<React.SetStateAction<boolean>>) => {
    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, [setAnimationFinished]);
};

/**
 * Creates the array of button props for the modal footer.
 */
const createButtons = (
    cancelLabel?: string,
    okLabel?: string,
    okColor?: ButtonColor,
    okLoading?: boolean,
    onOk?: () => void,
    onCancel?: () => void,
    buttonsDisabled?: boolean,
    okDisabled?: boolean
): ButtonProps[] => {
    const buttons: ButtonProps[] = [];
    if (cancelLabel) {
        buttons.push({
            key: 'cancel-modal',
            label: cancelLabel,
            color: 'outline',
            onClick: onCancel ?? (() => {}),
            disabled: buttonsDisabled
        });
    }
    if (okLabel) {
        buttons.push({
            key: 'ok-modal',
            label: okLabel,
            color: okColor ?? 'black',
            className: 'min-w-[80px]',
            onClick: onOk ?? (() => {}),
            disabled: buttonsDisabled ?? false || okDisabled ?? false,
            loading: okLoading ?? false
        });
    }
    return buttons;
};

/**
 * Computes the modal container classes.
 */
const computeModalClasses = (
    props: ModalProps,
    animationFinished: boolean,
    align: 'center' | 'left' | 'right',
    size: ModalSize,
    formSheet: boolean,
    scrolling: boolean,
    animate: boolean,
    animationFinishedState: boolean
) => {
    const {
        size: modalSize = 'md',
        formSheet: isFormSheet = false,
        scrolling: isScrolling = true,
        animate: isAnimate = true
    } = props;

    let classes = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        modalSize !== 'bleed' && 'rounded',
        isFormSheet ? 'shadow-md' : 'shadow-xl',
        (isAnimate && !isFormSheet && !animationFinishedState && align === 'center') && 'animate-modal-in',
        (isAnimate && !isFormSheet && !animationFinishedState && align === 'right') && 'animate-modal-in-from-right',
        (isFormSheet && !animationFinishedState) && 'animate-modal-in-reverse',
        isScrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
    );

    switch (modalSize) {
        case 'sm':
            classes = clsx(classes, 'max-w-[480px]');
            break;
        case 'md':
            classes = clsx(classes, 'max-w-[720px]');
            break;
        case 'lg':
            classes = clsx(classes, 'max-w-[1020px]');
            break;
        case 'xl':
            classes = clsx(classes, 'max-w-[1240px]');
            break;
        case 'full':
            classes = clsx(classes, 'h-full');
            break;
        case 'bleed':
            classes = clsx(classes, 'h-full');
            break;
        default:
            break;
    }

    return classes;
};

/**
 * Computes the backdrop container classes.
 */
const computeBackdropClasses = (
    props: ModalProps,
    allowBackgroundInteraction: boolean
) => {
    const {backDrop = true} = props;
    let classes = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none'
    );

    switch (props.size) {
        case 'sm':
        case 'md':
            classes = clsx(classes, 'p-4 md:p-[8vmin]');
            break;
        case 'lg':
            classes = clsx(classes, 'p-4 md:p-[4vmin]');
            break;
        case 'xl':
            classes = clsx(classes, 'p-4 md:p-[3vmin]');
            break;
        case 'full':
        case 'bleed':
            classes = clsx(classes, 'p-4 md:p-[3vmin]');
            break;
        default:
            classes = clsx(classes, 'p-4 md:p-[8vmin]');
            break;
    }

    classes = clsx(classes, 'max-[800px]:!pb-20');
    return classes;
};

/**
 * Computes padding classes based on size and padding flag.
 */
const computePaddingClasses = (size: ModalSize, padding: boolean) => {
    let paddingClasses = '';
    switch (size) {
        case 'sm':
        case 'md':
            paddingClasses = 'p-8';
            break;
        case 'lg':
            paddingClasses = 'p-7';
            break;
        case 'xl':
            paddingClasses = 'p-10';
            break;
        case 'full':
        case 'bleed':
            paddingClasses = 'p-10';
            break;
        default:
            paddingClasses = 'p-8';
            break;
    }
    if (!padding) paddingClasses = 'p-0';
    return paddingClasses;
};

/**
 * Computes header classes.
 */
const computeHeaderClasses = (
    topRightContent: 'close' | React.ReactNode | undefined,
    stickyHeader: boolean,
    size: ModalSize
) => {
    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );
    if (stickyHeader) {
        headerClasses = clsx(
            headerClasses,
            'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );
    }
    switch (size) {
        case 'sm':
        case 'md':
            headerClasses = clsx(headerClasses, '-inset-x-8');
            break;
        case 'lg':
            headerClasses = clsx(headerClasses, '-inset-x-8');
            break;
        case 'xl':
            headerClasses = clsx(headerClasses, '-inset-x-10 -top-10');
            break;
        case 'full':
        case 'bleed':
            headerClasses = clsx(headerClasses, '-inset-x-10');
            break;
        default:
            headerClasses = clsx(headerClasses, '-inset-x-8');
            break;
    }
    return headerClasses;
};

/**
 * Computes content classes.
 */
const computeContentClasses = (
    paddingClasses: string,
    size: ModalSize,
    height: 'full' | number | undefined
) => {
    let contentClasses = clsx(paddingClasses, 'py-0');
    if (
        size === 'full' ||
        size === 'bleed' ||
        height === 'full' ||
        typeof height === 'number'
    ) {
        contentClasses = clsx(contentClasses, 'grow');
    }
    return contentClasses;
};

/**
 * Computes footer classes.
 */
const computeFooterClasses = (paddingClasses: string, stickyFooter: boolean) => {
    return clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );
};

/**
 * Handles backdrop click to close modal.
 */
const handleBackdropClick = (
    e: React.MouseEvent<HTMLDivElement>,
    backDropClick: boolean,
    removeModal: () => void
) => {
    if (e.target === e.currentTarget && backDropClick) {
        removeModal();
    }
};

/**
 * Main Modal component.
 */
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

    // Global dirty state
    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    // Escape key handling
    useEscapeKey(modal, dirty, afterClose, onCancel);

    // Cmd/Ctrl+S handling
    useCMDS(onOk, enableCMDS);

    // Animation finished
    useAnimationFinished(setAnimationFinished);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const buttons = createButtons(
        cancelLabel,
        okLabel,
        okColor,
        okLoading,
        onOk,
        onCancel,
        buttonsDisabled,
        okDisabled
    );

    const modalClasses = computeModalClasses(
        {size, formSheet, scrolling, animate},
        animationFinished,
        align,
        size,
        formSheet,
        scrolling,
        animate,
        animationFinished
    );

    const backdropClasses = computeBackdropClasses(
        {size, backDrop},
        allowBackgroundInteraction
    );

    const paddingClasses = computePaddingClasses(size, padding);
    const headerClasses = computeHeaderClasses(topRightContent, stickyHeader, size);
    const contentClasses = computeContentClasses(paddingClasses, size, height);
    const footerClasses = computeFooterClasses(paddingClasses, stickyFooter);

    const modalStyles: {
        width?: string;
        height?: string;
        maxWidth?: string;
        maxHeight?: string;
    } = {};

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