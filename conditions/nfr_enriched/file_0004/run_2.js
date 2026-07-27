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

// Helper: Build size-specific classes
const getSizeClasses = (size: ModalSize, padding: boolean) => {
    const paddingMap: Record<ModalSize, string> = {
        'sm': 'p-8',
        'md': 'p-8',
        'lg': 'p-7',
        'xl': 'p-10',
        'full': 'p-10',
        'bleed': 'p-10'
    };

    const modalMaxWidthMap: Record<ModalSize, string | null> = {
        'sm': 'max-w-[480px]',
        'md': 'max-w-[720px]',
        'lg': 'max-w-[1020px]',
        'xl': 'max-w-[1240px]0',
        'full': '',
        'bleed': ''
    };

    const backdropPaddingMap: Record<ModalSize, string | null> = {
        'sm': 'p-4 md:p-[8vmin]',
        'md': 'p-4 md:p-[8vmin]',
        'lg': 'p-4 md:p-[4vmin]',
        'xl': 'p-4 md:p-[3vmin]',
        'full': 'p-4 md:p-[3vmin]',
        'bleed': ''
    };

    const headerInsetMap: Record<ModalSize, string> = {
        'sm': '-inset-x-8',
        'md': '-inset-x-8',
        'lg': '-inset-x-8',
        'xl': '-inset-x-10 -top-10',
        'full': '-inset-x-10',
        'bleed': '-inset-x-10'
    };

    const paddingClasses = padding ? paddingMap[size] : 'p-0';

    return {
        paddingClasses,
        modalMaxWidth: modalMaxWidthMap[size],
        backdropPadding: backdropPaddingMap[size],
        headerInset: headerInsetMap[size]
    };
};

// Helper: Build modal classes
const buildModalClasses = (
    align: string,
    size: ModalSize,
    formSheet: boolean,
    animate: boolean,
    animationFinished: boolean,
    scrolling: boolean,
    modalMaxWidth: string | null,
    padding: boolean
) => {
    const sizeClasses = getSizeClasses(size, padding);
    
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
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
        modalMaxWidth,
        (size === 'full' || size === 'bleed') && 'h-full'
    );
};

// Helper: Build backdrop classes
const buildBackdropClasses = (
    allowBackgroundInteraction: boolean,
    backdropPadding: string | null,
    formSheet: boolean
) => {
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        backdropPadding,
        'max-[800px]:!pb-20'
    );
};

// Helper: Build header classes
const buildHeaderClasses = (
    topRightContent: string | React.ReactNode | undefined,
    stickyHeader: boolean,
    headerInset: string,
    paddingClasses: string
) => {
    return clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
        headerInset,
        paddingClasses,
        'pb-0'
    );
};

// Helper: Build content classes
const buildContentClasses = (
    paddingClasses: string,
    size: ModalSize,
    height: 'full' | number | undefined
) => {
    return clsx(
        paddingClasses,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );
};

// Helper: Build footer classes
const buildFooterClasses = (paddingClasses: string, stickyFooter: boolean) => {
    return clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );
};

// Helper: Build modal styles
const buildModalStyles = (
    width: 'full' | 'toSidebar' | number | undefined,
    height: 'full' | number | undefined
) => {
    const styles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = width + 'px';
    }

    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = height + 'px';
    }

    return styles;
};

// Helper: Get modal width classes
const getModalWidthClasses = (width: 'full' | 'toSidebar' | number | undefined) => {
    if (width === 'full') {
        return 'w-full';
    } else if (width === 'toSidebar') {
        return 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]';
    }
    return '';
};

// Helper: Get modal height classes
const getModalHeightClasses = (height: 'full' | number | undefined) => {
    return height === 'full' ? 'h-full' : '';
};

// Helper: Build button array
const buildButtons = (
    footer: boolean | React.ReactNode,
    cancelLabel: string | undefined,
    okLabel: string | undefined,
    okColor: ButtonColor,
    buttonsDisabled: boolean | undefined,
    okDisabled: boolean | undefined,
    okLoading: boolean,
    onCancel: (() => void) | undefined,
    removeModal: () => void
): ButtonProps[] => {
    if (footer) {
        return [];
    }

    const buttons: ButtonProps[] = [];

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
            onClick: undefined,
            disabled: buttonsDisabled || okDisabled,
            loading: okLoading
        });
    }

    return buttons;
};

// Helper: Handle escape key press
const setupEscapeKeyHandler = (
    modal: any,
    dirty: boolean,
    afterClose: (() => void) | undefined,
    onCancel: (() => void) | undefined,
    removeModal: () => void
) => {
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
                    removeModal();
                }
            });

            event.stopPropagation();
        }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => {
        document.removeEventListener('keydown', handleEscapeKey);
    };
};

// Helper: Setup CMD+S handler
const setupCmdSHandler = (onOk: (() => void) | undefined, enableCMDS: boolean) => {
    if (!onOk || !enableCMDS) {
        return () => {};
    }

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
};

// Helper: Render footer content
const renderFooterContent = (
    footer: boolean | React.ReactNode,
    leftButtonProps: ButtonProps | undefined,
    buttons: ButtonProps[],
    footerClasses: string,
    stickyFooter: boolean
) => {
    let footerContent;

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
                    <ButtonGroup buttons={buttons}/>
                </div>
            </div>
        );
    }

    return stickyFooter ? (
        <StickyFooter height={84}>
            {footerContent}
        </StickyFooter>
    ) : (
        <>
            {footerContent}
        </>
    );
};

// Helper: Render header
const renderHeader = (
    header: boolean | undefined,
    topRightContent: 'close' | React.ReactNode | undefined,
    title: string | undefined,
    headerClasses: string,
    hideXOnMobile: boolean,
    removeModal: () => void
) => {
    if (header === false) {
        return null;
    }

    if (!topRightContent || topRightContent === 'close') {
        return (
            <header className={headerClasses}>
                {title && <Heading level={3}>{title}</Heading>}
                <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                    <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                </div>
            </header>
        );
    }

    return (
        <header className={headerClasses}>
            {title && <Heading level={3}>{title}</Heading>}
            {topRightContent}
        </header>
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

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    useEffect(() => {
        return setupEscapeKeyHandler(modal, dirty, afterClose, onCancel, removeModal);
    }, [modal, dirty, afterClose, onCancel]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setAnimationFinished(true);
        }, 250);

        return () => clearTimeout(timeout);
    }, []);

    useEffect(() => {
        return setupCmdSHandler(onOk, enableCMDS);
    }, [onOk, enableCMDS]);

    const sizeClasses = getSizeClasses(size, padding);
    const buttons = buildButtons(footer, cancelLabel, okLabel, okColor, buttonsDisabled, okDisabled, okLoading, onCancel, removeModal);
    
    const modalClasses = clsx(
        buildModalClasses(align, size, formSheet, animate, animationFinished, scrolling, sizeClasses.modalMaxWidth, padding),
        getModalWidthClasses(width),
        getModalHeightClasses(height)
    );

    const backdropClasses = buildBackdropClasses(allowBackgroundInteraction, sizeClasses.backdropPadding, formSheet);
    const headerClasses = buildHeaderClasses(topRightContent, stickyHeader, sizeClasses.headerInset, sizeClasses.paddingClasses);
    const contentClasses = buildContentClasses(sizeClasses.paddingClasses, size, height);
    const footerClasses = buildFooterClasses(sizeClasses.paddingClasses, stickyFooter);
    const modalStyles = buildModalStyles(width, height);

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const footerContent = renderFooterContent(footer, leftButtonProps, buttons, footerClasses, stickyFooter);
    const headerContent = renderHeader(header, topRightContent, title, headerClasses, hideXOnMobile, removeModal);

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