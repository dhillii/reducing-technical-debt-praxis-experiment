import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {useEffect, useState, forwardRef, useMemo, MouseEvent} from 'react';
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

function useEscapeHandler(
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

            if (activeEl instanceof HTMLElement) activeEl.blur();

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

function useAnimationFinished(setFinished: React.Dispatch<React.SetStateAction<boolean>>) {
    useEffect(() => {
        const timeout = setTimeout(() => setFinished(true), 250);
        return () => clearTimeout(timeout);
    }, [setFinished]);
}

function useCMDSHandler(enableCMDS: boolean | undefined, onOk?: () => void) {
    useEffect(() => {
        if (!enableCMDS || !onOk) return;
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                onOk();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [enableCMDS, onOk]);
}

function generateButtons(
    cancelLabel: string | undefined,
    okLabel: string | undefined,
    okColor: ButtonColor,
    okLoading: boolean,
    leftButtonProps: ButtonProps | undefined,
    onCancel: (() => void) | undefined,
    onOk: (() => void) | undefined,
    buttonsDisabled: boolean | undefined,
    okDisabled: boolean | undefined
): ButtonProps[] {
    const buttons: ButtonProps[] = [];

    if (cancelLabel) {
        buttons.push({
            key: 'cancel-modal',
            label: cancelLabel,
            color: 'outline',
            onClick: onCancel ?? (() => {}),
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

    return buttons;
}

function computeModalClasses(params: {
    align: 'center' | 'left' | 'right';
    size: ModalSize;
    formSheet: boolean;
    animate: boolean;
    animationFinished: boolean;
    scrolling: boolean;
}) {
    const {align, size, formSheet, animate, animationFinished, scrolling} = params;
    let base = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
    );

    if (animate && !formSheet && !animationFinished) {
        base = clsx(
            base,
            align === 'center' && 'animate-modal-in',
            align === 'right' && 'animate-modal-in-from-right'
        );
    }

    if (formSheet && !animationFinished) {
        base = clsx(base, 'animate-modal-in-reverse');
    }

    return base;
}

function computeBackdropClasses(backDrop: boolean, formSheet: boolean, allowBackgroundInteraction: boolean) {
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        backDrop && !formSheet && topLevelBackdropClasses,
        formSheet && 'bg-[rgba(98,109,121,0.08)]'
    );
}

function computeSizeClasses(size: ModalSize) {
    switch (size) {
        case 'sm':
            return {maxW: 'max-w-[480px]', padding: 'p-8', headerInset: '-inset-x-8', backdropPad: 'p-4 md:p-[8vmin]'};
        case 'md':
            return {maxW: 'max-w-[720px]', padding: 'p-8', headerInset: '-inset-x-8', backdropPad: 'p-4 md:p-[8vmin]'};
        case 'lg':
            return {maxW: 'max-w-[1020px]', padding: 'p-7', headerInset: '-inset-x-8', backdropPad: 'p-4 md:p-[4vmin]'};
        case 'xl':
            return {maxW: 'max-w-[1240px]0', padding: 'p-10', headerInset: '-inset-x-10 -top-10', backdropPad: 'p-4 md:p-[3vmin]'};
        case 'full':
            return {heightFull: true, padding: 'p-10', headerInset: '-inset-x-10', backdropPad: 'p-4 md:p-[3vmin]'};
        case 'bleed':
            return {heightFull: true, padding: 'p-10', headerInset: '-inset-x-10'};
        default:
            return {padding: 'p-8', headerInset: '-inset-x-8', backdropPad: 'p-4 md:p-[8vmin]'};
    }
}

function computeFooterClasses(padding: string, stickyFooter: boolean) {
    return clsx(
        `${padding} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
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
    useEscapeHandler(modal, dirty, afterClose, onCancel);
    useAnimationFinished(setAnimationFinished);
    useCMDSHandler(enableCMDS, onOk);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const buttons = useMemo(() => generateButtons(
        cancelLabel,
        okLabel,
        okColor,
        okLoading,
        leftButtonProps,
        onCancel,
        onOk,
        buttonsDisabled,
        okDisabled
    ), [cancelLabel, okLabel, okColor, okLoading, leftButtonProps, onCancel, onOk, buttonsDisabled, okDisabled]);

    const sizeClasses = useMemo(() => computeSizeClasses(size), [size]);

    const modalClasses = useMemo(() => {
        let cls = computeModalClasses({align, size, formSheet, animate, animationFinished, scrolling});
        if (sizeClasses.maxW) cls = clsx(cls, sizeClasses.maxW);
        if (sizeClasses.heightFull) cls = clsx(cls, 'h-full');
        if (width === 'full') cls = clsx(cls, 'w-full');
        if (width === 'toSidebar') {
            cls = clsx(
                cls,
                'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
            );
        }
        if (typeof width === 'number') {
            // width handled via inline style
        }
        if (height === 'full') cls = clsx(cls, 'h-full');
        return cls;
    }, [align, size, formSheet, animate, animationFinished, scrolling, sizeClasses, width, height]);

    const backdropClasses = useMemo(() => {
        let cls = computeBackdropClasses(backDrop, formSheet, allowBackgroundInteraction);
        if (sizeClasses.backdropPad) cls = clsx(cls, sizeClasses.backdropPad);
        return clsx(cls, 'max-[800px]:!pb-20');
    }, [backDrop, formSheet, allowBackgroundInteraction, sizeClasses.backdropPad]);

    const paddingClasses = padding ? sizeClasses.padding : 'p-0';
    const headerClasses = useMemo(() => {
        let base = clsx(
            (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
            stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
            sizeClasses.headerInset
        );
        return clsx(base, paddingClasses, 'pb-0');
    }, [topRightContent, stickyHeader, sizeClasses.headerInset, paddingClasses]);

    const contentClasses = useMemo(() => {
        let base = clsx(paddingClasses, 'py-0');
        if (size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') {
            base = clsx(base, 'grow');
        }
        return base;
    }, [paddingClasses, size, height]);

    const footerClasses = useMemo(() => computeFooterClasses(paddingClasses, stickyFooter), [paddingClasses, stickyFooter]);

    const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const modalStyles: React.CSSProperties = {};
    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = `${width}px`;
    }
    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = `${height}px`;
    }

    const footerContent = useMemo(() => {
        if (footer) return footer;
        if (footer === false) return null;
        const inner = (
            <div className={footerClasses}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );
        return stickyFooter ? <StickyFooter height={84}>{inner}</StickyFooter> : <>{inner}</>;
    }, [footer, footerClasses, leftButtonProps, buttons, stickyFooter]);

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <section
                ref={ref}
                className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')}
                data-testid={testId}
                style={modalStyles}
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