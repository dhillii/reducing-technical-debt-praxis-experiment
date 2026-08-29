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
    stickyHeader?:boolean;
    scrolling?: boolean;
    dirty?: boolean;
    animate?: boolean;
    formSheet?: boolean;
    enableCMDS?: boolean;
    allowBackgroundInteraction?: boolean;
}

export const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

// Handle escape key press to close modal
const useEscapeKeyHandler = (modal: ReturnType<typeof useModal>, dirty: boolean, afterClose: (() => void) | undefined, onCancel: (() => void) | undefined) => {
    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                // Don't close modal if user is in Koenig's link input (which handles ESC itself)
                const activeEl = document.activeElement;
                if (activeEl?.hasAttribute('data-kg-link-input')) {
                    return;
                }

                // Fix for Safari - if an element in the modal is focused, closing it will jump to
                // the bottom of the page because Safari tries to focus the "next" element in the DOM
                if (document.activeElement && document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
                // Close the modal on the next tick so that the blur registers
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

                // Prevent the event from bubbling up to the window level
                event.stopPropagation();
            }
        };

        document.addEventListener('keydown', handleEscapeKey);

        // Clean up the event listener when the modal is closed
        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [modal, dirty, afterClose, onCancel]);
};

// Handle CMD+S keyboard shortcut
const useCMDSShortcut = (onOk: (() => void) | undefined, enableCMDS: boolean) => {
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
};

// Manage animation state for modal
const useAnimationState = (setAnimationFinished: React.Dispatch<React.SetStateAction<boolean>>) => {
    useEffect(() => {
        const timeout = setTimeout(() => {
            setAnimationFinished(true);
        }, 250);

        return () => clearTimeout(timeout);
    }, []);
};

// Generate button configuration for modal footer
const generateButtons = (
    cancelLabel: string | undefined,
    okLabel: string,
    buttonsDisabled: boolean | undefined,
    okDisabled: boolean | undefined,
    okLoading: boolean,
    okColor: ButtonColor,
    onOk: (() => void) | undefined,
    onCancel: (() => void) | undefined,
    removeModal: () => void,
    dirty: boolean
): ButtonProps[] => {
    const buttons: ButtonProps[] = [];

    if (cancelLabel) {
        buttons.push({
            key: 'cancel-modal',
            label: cancelLabel,
            color: 'outline',
            onClick: (onCancel ? onCancel : () => {
                removeModal();
            }),
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

    return buttons;
};

// Calculate modal classes based on size and other properties
const calculateModalClasses = (
    size: ModalSize,
    align: 'center' | 'left' | 'right',
    formSheet: boolean,
    animate: boolean,
    animationFinished: boolean,
    scrolling: boolean
) => {
    return clsx(
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
};

// Calculate backdrop classes
const calculateBackdropClasses = (
    allowBackgroundInteraction: boolean
) => {
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none'
    );
};

// Calculate padding classes based on size
const calculatePaddingClasses = (size: ModalSize, padding: boolean) => {
    if (!padding) {
        return 'p-0';
    }

    switch (size) {
    case 'sm':
    case 'md':
        return 'p-8';
    case 'lg':
        return 'p-7';
    case 'xl':
    case 'full':
    case 'bleed':
        return 'p-10';
    default:
        return 'p-8';
    }
};

// Calculate header classes
const calculateHeaderClasses = (
    topRightContent: 'close' | React.ReactNode | undefined,
    stickyHeader: boolean,
    paddingClasses: string
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

    return clsx(
        headerClasses,
        paddingClasses,
        'pb-0'
    );
};

// Calculate content classes
const calculateContentClasses = (
    paddingClasses: string,
    size: ModalSize,
    height: 'full' | number | undefined
) => {
    const baseClasses = clsx(
        paddingClasses,
        'py-0'
    );

    return clsx(
        baseClasses,
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );
};

// Calculate footer classes
const calculateFooterClasses = (
    paddingClasses: string,
    stickyFooter: boolean
) => {
    return clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );
};

// Calculate size-specific classes
const calculateSizeSpecificClasses = (
    size: ModalSize,
    modalClasses: string,
    backdropClasses: string,
    paddingClasses: string,
    headerClasses: string
) => {
    switch (size) {
    case 'sm':
        return {
            modalClasses: clsx(modalClasses, 'max-w-[480px]'),
            backdropClasses: clsx(backdropClasses, 'p-4 md:p-[8vmin]'),
            paddingClasses,
            headerClasses: clsx(headerClasses, '-inset-x-8')
        };

    case 'md':
        return {
            modalClasses: clsx(modalClasses, 'max-w-[720px]'),
            backdropClasses: clsx(backdropClasses, 'p-4 md:p-[8vmin]'),
            paddingClasses,
            headerClasses: clsx(headerClasses, '-inset-x-8')
        };

    case 'lg':
        return {
            modalClasses: clsx(modalClasses, 'max-w-[1020px]'),
            backdropClasses: clsx(backdropClasses, 'p-4 md:p-[4vmin]'),
            paddingClasses,
            headerClasses: clsx(headerClasses, '-inset-x-8')
        };

    case 'xl':
        return {
            modalClasses: clsx(modalClasses, 'max-w-[1240px]0'),
            backdropClasses: clsx(backdropClasses, 'p-4 md:p-[3vmin]'),
            paddingClasses,
            headerClasses: clsx(headerClasses, '-inset-x-10 -top-10')
        };

    case 'full':
        return {
            modalClasses: clsx(modalClasses, 'h-full'),
            backdropClasses: clsx(backdropClasses, 'p-4 md:p-[3vmin]'),
            paddingClasses,
            headerClasses: clsx(headerClasses, '-inset-x-10')
        };

    case 'bleed':
        return {
            modalClasses: clsx(modalClasses, 'h-full'),
            backdropClasses,
            paddingClasses,
            headerClasses: clsx(headerClasses, '-inset-x-10')
        };

    default:
        return {
            modalClasses,
            backdropClasses: clsx(backdropClasses, 'p-4 md:p-[8vmin]'),
            paddingClasses,
            headerClasses: clsx(headerClasses, '-inset-x-8')
        };
    }
};

// Handle backdrop click to close modal
const useBackdropClickHandler = (
    backDropClick: boolean,
    removeModal: () => void
) => {
    return (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };
};

// Calculate modal styles based on width and height props
const calculateModalStyles = (
    width: 'full' | 'toSidebar' | number | undefined,
    height: 'full' | number | undefined,
    modalClasses: string
) => {
    const modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

    let updatedModalClasses = modalClasses;

    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = width + 'px';
    } else if (width === 'full') {
        updatedModalClasses = clsx(modalClasses, 'w-full');
    } else if (width === 'toSidebar') {
        updatedModalClasses = clsx(
            modalClasses,
            'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
        );
    }

    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = height + 'px';
    } else if (height === 'full') {
        updatedModalClasses = clsx(modalClasses, 'h-full');
    }

    return {modalStyles, modalClasses: updatedModalClasses};
};

// Generate footer content
const generateFooterContent = (
    footer: boolean | React.ReactNode | undefined,
    stickyFooter: boolean,
    footerClasses: string,
    leftButtonProps: ButtonProps | undefined,
    buttons: ButtonProps[]
) => {
    let footerContent;

    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        // Content padding handled in contentClasses
        footerContent = null;
    } else {
        footerContent = (
            <div className={footerClasses}>
                <div>
                    {leftButtonProps && <Button {...leftButtonProps} />}
                </div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons}/>
                </div>
            </div>
        );
    }

    return stickyFooter ? 
        <StickyFooter height={84}>
            {footerContent}
        </StickyFooter> : 
        footerContent;
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

    useEscapeKeyHandler(modal, dirty, afterClose, onCancel);
    useCMDSShortcut(onOk, enableCMDS);
    useAnimationState(setAnimationFinished);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const buttons = generateButtons(
        cancelLabel,
        okLabel,
        buttonsDisabled,
        okDisabled,
        okLoading,
        okColor,
        onOk,
        onCancel,
        removeModal,
        dirty
    );

    let modalClasses = calculateModalClasses(size, align, formSheet, animate, animationFinished, scrolling);
    let backdropClasses = calculateBackdropClasses(allowBackgroundInteraction);
    const paddingClasses = calculatePaddingClasses(size, padding);
    
    // Set bottom padding for backdrop when the menu is on
    backdropClasses = clsx(backdropClasses, 'max-[800px]:!pb-20');
    
    const headerClasses = calculateHeaderClasses(topRightContent, stickyHeader, paddingClasses);
    const contentClasses = calculateContentClasses(paddingClasses, size, height);
    const footerClasses = calculateFooterClasses(paddingClasses, stickyFooter);
    
    const sizeClasses = calculateSizeSpecificClasses(size, modalClasses, backdropClasses, paddingClasses, headerClasses);
    modalClasses = sizeClasses.modalClasses;
    backdropClasses = sizeClasses.backdropClasses;
    
    const {modalStyles, modalClasses: updatedModalClasses} = calculateModalStyles(width, height, modalClasses);
    modalClasses = updatedModalClasses;

    const handleBackdropClick = useBackdropClickHandler(backDropClick, removeModal);

    const footerContent = generateFooterContent(footer, stickyFooter, footerClasses, leftButtonProps, buttons);

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

export default Modal;