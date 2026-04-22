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
const sizeConfig: Record<ModalSize | 'default', {
    modalClass: string;
    backdropClass: string;
    paddingClass: string;
    headerClassAdd: string;
}> = {
    sm: {
        modalClass: 'max-w-[480px]',
        backdropClass: 'p-4 md:p-[8vmin]',
        paddingClass: 'p-8',
        headerClassAdd: '-inset-x-8'
    },
    md: {
        modalClass: 'max-w-[720px]',
        backdropClass: 'p-4 md:p-[8vmin]',
        paddingClass: 'p-8',
        headerClassAdd: '-inset-x-8'
    },
    lg: {
        modalClass: 'max-w-[1020px]',
        backdropClass: 'p-4 md:p-[4vmin]',
        paddingClass: 'p-7',
        headerClassAdd: '-inset-x-8'
    },
    xl: {
        modalClass: 'max-w-[1240px]0',
        backdropClass: 'p-4 md:p-[3vmin]',
        paddingClass: 'p-10',
        headerClassAdd: '-inset-x-10 -top-10'
    },
    full: {
        modalClass: 'h-full',
        backdropClass: 'p-4 md:p-[3vmin]',
        paddingClass: 'p-10',
        headerClassAdd: '-inset-x-10'
    },
    bleed: {
        modalClass: 'h-full',
        backdropClass: '',
        paddingClass: 'p-10',
        headerClassAdd: '-inset-x-10'
    },
    default: {
        modalClass: '',
        backdropClass: 'p-4 md:p-[8vmin]',
        paddingClass: 'p-8',
        headerClassAdd: '-inset-x-8'
    }
};

/** Determines if the modal should grow based on size/height */
function shouldGrow(size: ModalSize, height: 'full' | number | undefined): boolean {
    return size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number';
}

/** Returns the appropriate animation class for the given alignment */
function getAnimationClass(animate: boolean, formSheet: boolean, animationFinished: boolean, align: string): string | undefined {
    if (!animate || formSheet || animationFinished) return undefined;
    if (align === 'center') return 'animate-modal-in';
    if (align === 'right') return 'animate-modal-in-from-right';
    return undefined;
}

/** Returns the reverse animation class for form sheets */
function getFormSheetAnimationClass(formSheet: boolean, animationFinished: boolean): string | undefined {
    return formSheet && !animationFinished ? 'animate-modal-in-reverse' : undefined;
}

/** Returns the scrolling class */
function getScrollingClass(scrolling: boolean): string {
    return scrolling ? 'overflow-y-auto' : 'overflow-y-hidden';
}

/** Returns the backdrop pointer-events class */
function getBackdropPointerClass(allowBackgroundInteraction: boolean): string | undefined {
    return allowBackgroundInteraction ? 'pointer-events-none' : undefined;
}

/** Returns the sticky header class */
function getStickyHeaderClass(stickyHeader: boolean): string | undefined {
    return stickyHeader ? 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black' : undefined;
}

/** Returns the sticky footer class */
function getStickyFooterClass(stickyFooter: boolean, paddingClass: string): string {
    return `${paddingClass} ${stickyFooter ? 'py-6' : ''}`;
}

/** Returns the modal width/height style object */
function getModalStyle(width: 'full' | 'toSidebar' | number | undefined, height: 'full' | number | undefined): {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} {
    const style: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};
    if (typeof width === 'number') {
        style.width = '100%';
        style.maxWidth = `${width}px`;
    }
    if (typeof height === 'number') {
        style.height = '100%';
        style.maxHeight = `${height}px`;
    }
    return style;
}

/** Returns additional modal classes based on width/height props */
function getModalSizeClasses(width: 'full' | 'toSidebar' | number | undefined, height: 'full' | number | undefined): string {
    const classes: string[] = [];
    if (width === 'full') {
        classes.push('w-full');
    } else if (width === 'toSidebar') {
        classes.push('w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]');
    }
    if (height === 'full') {
        classes.push('h-full');
    }
    return classes.join(' ');
}

/** Returns the appropriate backdrop classes */
function getBackdropBaseClasses(backDrop: boolean, formSheet: boolean): string {
    return clsx(
        'fixed inset-0 z-0',
        backDrop && !formSheet && topLevelBackdropClasses,
        formSheet && 'bg-[rgba(98,109,121,0.08)]'
    );
}

/** Returns the appropriate header classes */
function getHeaderBaseClasses(topRightContent: 'close' | React.ReactNode | undefined): string {
    return (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5';
}

/** Returns the appropriate footer content */
function renderFooterContent(
    footer: boolean | React.ReactNode | undefined,
    buttons: ButtonProps[],
    leftButtonProps: ButtonProps | undefined,
    stickyFooter: boolean,
    paddingClass: string
) {
    let content: React.ReactNode;
    if (footer) {
        content = footer;
    } else if (footer === false) {
        content = null;
    } else {
        const footerClasses = getStickyFooterClass(stickyFooter, paddingClass);
        content = (
            <div className={clsx(footerClasses, 'flex w-full items-center justify-between')}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );
    }

    return stickyFooter ? <StickyFooter height={84}>{content}</StickyFooter> : <>{content}</>;
}

/** Returns the appropriate header JSX */
function renderHeader(
    header: boolean | undefined,
    title: string | undefined,
    topRightContent: 'close' | React.ReactNode | undefined,
    hideXOnMobile: boolean,
    removeModal: () => void,
    headerClasses: string
) {
    if (header === false) {
        return null;
    }

    const closeButton = (
        <Button
            className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100'
            icon='close'
            iconColorClass='text-black dark:text-white'
            size='sm'
            testId='close-modal'
            unstyled
            onClick={removeModal}
        />
    );

    if (!topRightContent || topRightContent === 'close') {
        return (
            <header className={headerClasses}>
                {title && <Heading level={3}>{title}</Heading>}
                <div className={clsx(`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`)}>
                    {closeButton}
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

    const baseModalClasses = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        getAnimationClass(animate, formSheet, animationFinished, align),
        getFormSheetAnimationClass(formSheet, animationFinished),
        getScrollingClass(scrolling)
    );

    const baseBackdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        getBackdropPointerClass(allowBackgroundInteraction)
    );

    const sizeInfo = sizeConfig[size] ?? sizeConfig['default'];
    let modalClasses = clsx(baseModalClasses, sizeInfo.modalClass, getModalSizeClasses(width, height));
    let backdropClasses = clsx(baseBackdropClasses, sizeInfo.backdropClass);
    let paddingClasses = sizeInfo.paddingClass;
    let headerClasses = clsx(getHeaderBaseClasses(topRightContent), getStickyHeaderClass(stickyHeader), sizeInfo.headerClassAdd);

    if (!padding) {
        paddingClasses = 'p-0';
    }

    const contentClasses = clsx(paddingClasses, 'py-0', shouldGrow(size, height) && 'grow');

    const footerClasses = getStickyFooterClass(stickyFooter, paddingClasses);

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const modalStyles = getModalStyle(width, height);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const footerContent = renderFooterContent(footer, buttons, leftButtonProps, stickyFooter, paddingClasses);

    return (
        <div className={clsx(backdropClasses, 'max-[800px]:!pb-20')} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={getBackdropBaseClasses(backDrop, formSheet)}></div>
            <section
                ref={ref}
                className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')}
                data-testid={testId}
                style={modalStyles}
            >
                {renderHeader(header, title, topRightContent, hideXOnMobile, removeModal, headerClasses)}
                <div className={contentClasses}>{children}</div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;