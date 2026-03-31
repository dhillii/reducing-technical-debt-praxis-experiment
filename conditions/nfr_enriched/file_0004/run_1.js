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
     * Possible values are: `sm`, `md`, `lg`, `xl`, `full`, `bleed`. You can also use any number to set an arbitrary width.
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

// Size-based configuration lookup
const SIZE_CONFIG: Record<string, {maxWidth?: string; backdropPadding?: string; padding: string; headerInset: string; headerTop?: string}> = {
    sm: {maxWidth: 'max-w-[480px]', backdropPadding: 'p-4 md:p-[8vmin]', padding: 'p-8', headerInset: '-inset-x-8'},
    md: {maxWidth: 'max-w-[720px]', backdropPadding: 'p-4 md:p-[8vmin]', padding: 'p-8', headerInset: '-inset-x-8'},
    lg: {maxWidth: 'max-w-[1020px]', backdropPadding: 'p-4 md:p-[4vmin]', padding: 'p-7', headerInset: '-inset-x-8'},
    xl: {maxWidth: 'max-w-[1240px]', backdropPadding: 'p-4 md:p-[3vmin]', padding: 'p-10', headerInset: '-inset-x-10', headerTop: '-top-10'},
    full: {backdropPadding: 'p-4 md:p-[3vmin]', padding: 'p-10', headerInset: '-inset-x-10'},
    bleed: {padding: 'p-10', headerInset: '-inset-x-10'},
    default: {backdropPadding: 'p-4 md:p-[8vmin]', padding: 'p-8', headerInset: '-inset-x-8'}
};

function useAnimationFinished(animate: boolean): boolean {
    const [animationFinished, setAnimationFinished] = useState(false);

    useEffect(() => {
        if (!animate) {
            return;
        }
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, [animate]);

    return animationFinished;
}

function useEscapeKey(handler: (e: KeyboardEvent) => void) {
    useEffect(() => {
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [handler]);
}

function useCmdS(onOk: (() => void) | undefined, enabled: boolean) {
    useEffect(() => {
        if (!onOk || !enabled) {
            return;
        }
        const handleCMDS = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                onOk();
            }
        };
        window.addEventListener('keydown', handleCMDS);
        return () => window.removeEventListener('keydown', handleCMDS);
    });
}

function buildModalButtons(
    footer: boolean | React.ReactNode,
    cancelLabel: string,
    okLabel: string,
    okColor: ButtonColor,
    okLoading: boolean,
    buttonsDisabled: boolean | undefined,
    okDisabled: boolean | undefined,
    onCancel: (() => void) | undefined,
    removeModal: () => void,
    onOk: (() => void) | undefined
): ButtonProps[] {
    if (footer) {
        return [];
    }

    const buttons: ButtonProps[] = [];

    if (cancelLabel) {
        buttons.push({
            key: 'cancel-modal',
            label: cancelLabel,
            color: 'outline',
            onClick: onCancel ?? removeModal,
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
}

function buildModalStyles(
    width: ModalProps['width'],
    height: ModalProps['height']
): {styles: React.CSSProperties; widthClasses: string} {
    const styles: React.CSSProperties = {};
    let widthClasses = '';

    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = `${width}px`;
    } else if (width === 'full') {
        widthClasses = 'w-full';
    } else if (width === 'toSidebar') {
        widthClasses = 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]';
    }

    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        widthClasses = clsx(widthClasses, 'h-full');
    }

    return {styles, widthClasses};
}

function buildSizeClasses(
    size: ModalSize,
    padding: boolean,
    stickyHeader: boolean,
    topRightContent: ModalProps['topRightContent'],
    animationFinished: boolean,
    animate: boolean,
    formSheet: boolean,
    align: string,
    scrolling: boolean,
    allowBackgroundInteraction: boolean
) {
    const config = SIZE_CONFIG[size] ?? SIZE_CONFIG.default;
    const paddingClasses = padding ? config.padding : 'p-0';

    const baseModalClasses = clsx(
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
        config.maxWidth,
        (size === 'full' || size === 'bleed') && 'h-full'
    );

    const baseBackdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        config.backdropPadding,
        'max-[800px]:!pb-20'
    );

    const baseHeaderClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
        config.headerInset,
        config.headerTop,
        paddingClasses,
        'pb-0'
    );

    const contentClasses = clsx(
        paddingClasses,
        'py-0'
    );

    return {paddingClasses, baseModalClasses, baseBackdropClasses, baseHeaderClasses, contentClasses};
}

function ModalHeader({
    header,
    headerClasses,
    title,
    topRightContent,
    hideXOnMobile,
    removeModal
}: {
    header: boolean | undefined;
    headerClasses: string;
    title: string | undefined;
    topRightContent: ModalProps['topRightContent'];
    hideXOnMobile: boolean;
    removeModal: () => void;
}) {
    if (header === false) {
        return null;
    }

    const titleElement = title ? <Heading level={3}>{title}</Heading> : null;

    if (!topRightContent || topRightContent === 'close') {
        return (
            <header className={headerClasses}>
                {titleElement}
                <div className={clsx(
                    'absolute right-6 top-6',
                    topRightContent !== 'close' && 'md:!invisible md:!hidden',
                    hideXOnMobile && 'hidden'
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
        );
    }

    return (
        <header className={headerClasses}>
            {titleElement}
            {topRightContent}
        </header>
    );
}

function ModalFooter({
    footer,
    footerClasses,
    leftButtonProps,
    buttons,
    stickyFooter,
    contentClassesSetter
}: {
    footer: boolean | React.ReactNode;
    footerClasses: string;
    leftButtonProps: ButtonProps | undefined;
    buttons: ButtonProps[];
    stickyFooter: boolean;
    contentClassesSetter: (extra: string) => void;
}) {
    let footerContent: React.ReactNode = null;

    if (footer) {
        footerContent = footer as React.ReactNode;
    } else if (footer === false) {
        contentClassesSetter(' pb-0 ');
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

    if (!footerContent) {
        return null;
    }

    if (stickyFooter) {
        return <StickyFooter height={84}>{footerContent}</StickyFooter>;
    }

    return <>{footerContent}</>;
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
    const animationFinished = useAnimationFinished(animate);

    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    const removeModal = React.useCallback(() => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    }, [dirty, modal, afterClose]);

    useEscapeKey(React.useCallback((event: KeyboardEvent) => {
        if (event.key !== 'Escape') {
            return;
        }

        const activeEl = document.activeElement;
        if (activeEl?.hasAttribute('data-kg-link-input')) {
            return;
        }

        if (activeEl instanceof HTMLElement) {
            activeEl.blur();
        }

        setTimeout(() => {
            if (onCancel) {
                onCancel();
            } else {
                removeModal();
            }
        });

        event.stopPropagation();
    }, [onCancel, removeModal]));

    useCmdS(onOk, enableCMDS);

    const {
        paddingClasses,
        baseModalClasses,
        baseBackdropClasses,
        baseHeaderClasses,
        contentClasses: baseContentClasses
    } = buildSizeClasses(size, padding, stickyHeader, topRightContent, animationFinished, animate, formSheet, align, scrolling, allowBackgroundInteraction);

    const {styles: modalStyles, widthClasses} = buildModalStyles(width, height);

    const modalClasses = clsx(baseModalClasses, widthClasses, allowBackgroundInteraction && 'pointer-events-auto');

    const buttons = buildModalButtons(
        footer,
        cancelLabel,
        okLabel,
        okColor,
        okLoading,
        buttonsDisabled,
        okDisabled,
        onCancel,
        removeModal,
        onOk
    );

    const footerClasses = clsx(
        paddingClasses,
        stickyFooter && 'py-6',
        'flex w-full items-center justify-between'
    );

    const needsGrow = size === 'full' || size === 'bleed' || height === 'full' || typeof height ===