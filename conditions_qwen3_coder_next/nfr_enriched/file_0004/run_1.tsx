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

/**
 * Determines whether a modal should respond to Escape key.
 * Excludes Koenig link input and avoids focus jump in Safari.
 */
const shouldIgnoreEscapeKey = (): boolean => {
    const activeEl = document.activeElement;
    return !!(activeEl?.hasAttribute('data-kg-link-input'));
};

/**
 * Safely kick off modal removal with dirty state confirmation.
 */
const safelyRemoveModal = (dirty: boolean, modal: ReturnType<typeof useModal>, afterClose?: () => void): void => {
    confirmIfDirty(dirty, () => {
        modal.remove();
        afterClose?.();
    });
};

/**
 * Build a list of modal buttons based on configuration props.
 */
const buildButtons = (options: {
    okLabel: string;
    okColor: ButtonColor;
    okLoading: boolean;
    cancelLabel?: string;
    buttonsDisabled: boolean;
    okDisabled: boolean;
    onCancel?: () => void;
    onOk?: () => void;
    dirty: boolean;
    modal: ReturnType<typeof useModal>;
    afterClose?: () => void;
}): ButtonProps[] => {
    const {
        okLabel, okColor, okLoading, cancelLabel,
        buttonsDisabled, okDisabled, onCancel, onOk,
        dirty, modal, afterClose
    } = options;

    const buttons: ButtonProps[] = [];

    if (cancelLabel) {
        buttons.push({
            key: 'cancel-modal',
            label: cancelLabel,
            color: 'outline',
            onClick: onCancel || (() => safelyRemoveModal(dirty, modal, afterClose)),
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

/**
 * Returns class string for modal container based on alignment and animation state.
 */
const getModalAnimationClasses = (options: {
    animate: boolean;
    formSheet: boolean;
    animationFinished: boolean;
    align: 'center' | 'left' | 'right';
}): string => {
    const {animate, formSheet, animationFinished, align} = options;

    if (!animate || formSheet) {
        return '';
    }

    if (animationFinished) {
        return '';
    }

    switch (align) {
        case 'center': return 'animate-modal-in';
        case 'left': return 'animate-modal-in';
        case 'right': return 'animate-modal-in-from-right';
        default: return '';
    }
};

/**
 * Returns padding string based on modal size.
 */
const getPaddingClassesBySize = (size: string): string => {
    switch (size) {
        case 'sm': return 'p-8';
        case 'md': return 'p-8';
        case 'lg': return 'p-7';
        case 'xl': return 'p-10';
        case 'full': return 'p-10';
        case 'bleed': return 'p-10';
        default: return 'p-8';
    }
};

/**
 * Returns header inset classes based on modal size.
 */
const getHeaderPaddingClassesBySize = (size: string): string => {
    switch (size) {
        case 'sm': return '-inset-x-8';
        case 'md': return '-inset-x-8';
        case 'lg': return '-inset-x-8';
        case 'xl': return '-inset-x-10 -top-10';
        case 'full': return '-inset-x-10';
        case 'bleed': return '-inset-x-10';
        default: return '-inset-x-8';
    }
};

/**
 * Returns max-width class for the modal based on size.
 */
const getMaxWidthBySize = (size: string): string => {
    switch (size) {
        case 'sm': return 'max-w-[480px]';
        case 'md': return 'max-w-[720px]';
        case 'lg': return 'max-w-[1020px]';
        case 'xl': return 'max-w-[1240px]0';
        case 'full': return 'h-full';
        case 'bleed': return 'h-full';
        default: return '';
    };
};

/**
 * Returns backdrop padding class based on modal size.
 */
const getBackdropPaddingBySize = (size: string): string => {
    switch (size) {
        case 'sm': return 'p-4 md:p-[8vmin]';
        case 'md': return 'p-4 md:p-[8vmin]';
        case 'lg': return 'p-4 md:p-[4vmin]';
        case 'xl': return 'p-4 md:p-[3vmin]';
        case 'full': return 'p-4 md:p-[3vmin]';
        case 'bleed': return '';
        default: return 'p-4 md:p-[8vmin]';
    }
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

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (shouldIgnoreEscapeKey()) return;

                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }

                setTimeout(() => {
                    if (onCancel) {
                        onCancel();
                    } else {
                        safelyRemoveModal(dirty, modal, afterClose);
                    }
                });

                event.stopPropagation();
            }
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
        if (enableCMDS && onOk) {
            const handleCMDS = (e: KeyboardEvent) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    onOk();
                }
            };

            window.addEventListener('keydown', handleCMDS);
            return () => window.removeEventListener('keydown', handleCMDS);
        }
    }, [enableCMDS, onOk]);

    const buttons = buildButtons({
        okLabel,
        okColor,
        okLoading,
        cancelLabel,
        buttonsDisabled: !!buttonsDisabled,
        okDisabled: !!okDisabled,
        onCancel,
        onOk,
        dirty,
        modal,
        afterClose
    });

    const baseModalClasses = 'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black';
    const alignClasses = {
        center: 'mx-auto',
        left: 'mr-auto',
        right: 'ml-auto'
    }[align];

    const modalClasses = clsx(
        baseModalClasses,
        alignClasses,
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        getModalAnimationClasses({animate, formSheet, animationFinished, align}),
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
    );

    const backdropClassesBase = 'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]';
    const backdropPadding = getBackdropPaddingBySize(size);

    const backdropClasses = clsx(
        backdropClassesBase,
        allowBackgroundInteraction && 'pointer-events-none',
        backdropPadding
    );

    const paddingBySize = getPaddingClassesBySize(size);
    const headerPaddingBySize = getHeaderPaddingClassesBySize(size);

    const paddingClasses = padding ? paddingBySize : 'p-0';

    const headerClassesBase = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );

    const headerClasses = clsx(
        headerClassesBase,
        paddingClasses,
        stickyHeader ? 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black' : '',
        headerPaddingBySize,
        'pb-0'
    );

    const contentClasses = clsx(
        paddingClasses,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            safelyRemoveModal(dirty, modal, afterClose);
        }
    };

    const modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = `${width}px`;
    } else if (width === 'full') {
        // no-op; handled via class
    } else if (width === 'toSidebar') {
        modalClasses.split(' ').push(
            'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
        );
    }

    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        modalClasses.split(' ').push('h-full');
    }

    let footerContent;
    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        contentClasses.split(' ').push('pb-0');
    } else {
        footerContent = (
            <div className={footerClasses}>
                <div>
                    {leftButtonProps && <Button {...leftButtonProps} />}
                </div>
                <div className="flex gap-3">
                    <ButtonGroup buttons={buttons}/>
                </div>
            </div>
        );
    }

    footerContent = stickyFooter ? (
        <StickyFooter height={84}>
            {footerContent}
        </StickyFooter>
    ) : (
        <>
            {footerContent}
        </>
    );

    const backdropOverlayClasses = clsx(
        'pointer-events-none fixed inset-0 z-0',
        (backDrop && !formSheet) && topLevelBackdropClasses,
        formSheet && 'bg-[rgba(98,109,121,0.08)]'
    );

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={backdropOverlayClasses}></div>
            <section ref={ref} className={clsx(
                modalClasses,
                allowBackgroundInteraction && 'pointer-events-auto'
            )} data-testid={testId} style={modalStyles}>
                {header === false ? '' : (!topRightContent || topRightContent === 'close' ?
                    (<header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                            <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={() => safelyRemoveModal(dirty, modal, afterClose)} />
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