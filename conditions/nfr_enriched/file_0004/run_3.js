```typescript
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

// Helper function to build size-specific classes
const getSizeClasses = (size: ModalSize, padding: boolean) => {
    const sizeConfig: Record<ModalSize, {modal: string; backdrop: string; padding: string; header: string}> = {
        sm: {
            modal: 'max-w-[480px]',
            backdrop: 'p-4 md:p-[8vmin]',
            padding: 'p-8',
            header: '-inset-x-8'
        },
        md: {
            modal: 'max-w-[720px]',
            backdrop: 'p-4 md:p-[8vmin]',
            padding: 'p-8',
            header: '-inset-x-8'
        },
        lg: {
            modal: 'max-w-[1020px]',
            backdrop: 'p-4 md:p-[4vmin]',
            padding: 'p-7',
            header: '-inset-x-8'
        },
        xl: {
            modal: 'max-w-[1240px]',
            backdrop: 'p-4 md:p-[3vmin]',
            padding: 'p-10',
            header: '-inset-x-10 -top-10'
        },
        full: {
            modal: 'h-full',
            backdrop: 'p-4 md:p-[3vmin]',
            padding: 'p-10',
            header: '-inset-x-10'
        },
        bleed: {
            modal: 'h-full',
            backdrop: '',
            padding: 'p-10',
            header: '-inset-x-10'
        }
    };

    const config = sizeConfig[size] || sizeConfig.md;
    return {
        ...config,
        padding: padding ? config.padding : 'p-0'
    };
};

// Helper function to build modal style object
const getModalStyles = (width?: 'full' | 'toSidebar' | number, height?: 'full' | number) => {
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

// Helper function to build width-specific modal classes
const getWidthClasses = (width?: 'full' | 'toSidebar' | number) => {
    if (width === 'full') {
        return 'w-full';
    }
    if (width === 'toSidebar') {
        return 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]';
    }
    return '';
};

// Helper function to build height-specific modal classes
const getHeightClasses = (height?: 'full' | number) => {
    return height === 'full' ? 'h-full' : '';
};

// Helper function to build button array
const buildButtonArray = (
    footer: boolean | React.ReactNode,
    cancelLabel: string | undefined,
    okLabel: string | undefined,
    okColor: ButtonColor,
    buttonsDisabled: boolean | undefined,
    okDisabled: boolean | undefined,
    okLoading: boolean,
    onCancel: (() => void) | undefined,
    removeModal: () => void,
    onOk: (() => void) | undefined
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
            onClick: onOk,
            disabled: buttonsDisabled || okDisabled,
            loading: okLoading
        });
    }

    return buttons;
};

// Helper function to build footer content
const buildFooterContent = (
    footer: boolean | React.ReactNode,
    buttons: ButtonProps[],
    leftButtonProps: ButtonProps | undefined,
    footerClasses: string,
    stickyFooter: boolean
): React.ReactNode => {
    if (footer === true) {
        return null;
    }

    if (footer === false) {
        return null;
    }

    if (typeof footer === 'object' && footer !== null) {
        const content = footer;
        return stickyFooter ? (
            <StickyFooter height={84}>{content}</StickyFooter>
        ) : (
            <>{content}</>
        );
    }

    const defaultFooter = (
        <div className={footerClasses}>
            <div>
                {leftButtonProps && <Button {...leftButtonProps} />}
            </div>
            <div className='flex gap-3'>
                <ButtonGroup buttons={buttons} />
            </div>
        </div>
    );

    return stickyFooter ? (
        <StickyFooter height={84}>{defaultFooter}</StickyFooter>
    ) : (
        <>{defaultFooter}</>
    );
};

// Helper function to setup escape key handler
const setupEscapeKeyHandler = (
    onCancel: (() => void) | undefined,
    dirty: boolean,
    modal: any,
    afterClose: (() => void) | undefined,
    removeModal: () => void
) => {
    const handleEscapeKey = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') {
            return;
        }

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
                confirmIfDirty(dirty, () => {
                    modal.remove();
                    afterClose?.();
                });
            }
        });

        event.stopPropagation();
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => {
        document.removeEventListener('keydown', handleEscapeKey);
    };
};

// Helper function to setup CMD+S handler
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
        return setupEscapeKeyHandler(onCancel, dirty, modal, afterClose, removeModal);
    }, [modal, dirty, afterClose, onCancel]);

    useEffect(() => {
        return setupCmdSHandler(onOk, enableCMDS);
    }, [onOk, enableCMDS]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setAnimationFinished(true);
        }, 250);

        return () => clearTimeout(timeout);
    }, []);

    // Get size-specific classes
    const sizeClasses = getSizeClasses(size, padding);
    const modalStyles = getModalStyles(width, height);

    // Build base modal classes
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
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
        sizeClasses.modal,
        getWidthClasses(width),
        getHeightClasses(height)
    );

    // Build backdrop classes
    let backdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        size !== 'bleed' && sizeClasses.backdrop,
        'max-[800px]:!pb-20'
    );

    // Build header classes
    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        sizeClasses.header,
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
        sizeClasses.padding,
        'pb-0'
    );

    // Build content classes
    let contentClasses = clsx(
        sizeClasses.padding,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    // Build footer classes
    const footerClasses = clsx(
        `${sizeClasses.padding} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    // Build buttons array
    const buttons = buildButtonArray(
        footer,
        cancelLabel,
        okLabel,
        okColor,
        buttonsDisabled,
        okDisabled,
        okLoading,
        onCancel,
        removeModal,
        onOk
    );

    // Build footer content
    const footerContent = buildFooterContent(footer, buttons, leftButtonProps, footerClasses, stickyFooter);

    // Update content classes if footer is false
    if (footer === false) {
        contentClasses = clsx(contentClasses, 'pb-0');
    }

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const renderHeader = () => {
        if (header === false) {
            return null;
        }

        if (!topRightContent || topRightContent === 'close') {
            return (
                <header className={headerClasses}>
                    {title && <Heading level={3}>{title}</Heading>}
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
                </header>
            );
        }

        return (
            <header className={headerClasses}>
                {title && <Heading level={3}>{title}</Heading>}