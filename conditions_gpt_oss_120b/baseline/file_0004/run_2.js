import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {
    useEffect,
    useState,
    forwardRef,
    useCallback,
    useMemo,
    MouseEvent,
    KeyboardEvent
} from 'react';
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

export const topLevelBackdropClasses =
    'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

const sizeConfig: Record<
    ModalSize,
    {
        modalMaxWidth?: string;
        backdropPadding?: string;
        padding?: string;
        headerInset?: string;
    }
> = {
    sm: {
        modalMaxWidth: 'max-w-[480px]',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    },
    md: {
        modalMaxWidth: 'max-w-[720px]',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    },
    lg: {
        modalMaxWidth: 'max-w-[1020px]',
        backdropPadding: 'p-4 md:p-[4vmin]',
        padding: 'p-7',
        headerInset: '-inset-x-8'
    },
    xl: {
        modalMaxWidth: 'max-w-[1240px]0',
        backdropPadding: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10 -top-10'
    },
    full: {
        modalMaxWidth: undefined,
        backdropPadding: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10'
    },
    bleed: {
        modalMaxWidth: undefined,
        backdropPadding: undefined,
        padding: 'p-10',
        headerInset: '-inset-x-10'
    }
};

const Modal = forwardRef<HTMLElement, ModalProps>((props, ref) => {
    const {
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
    } = props;

    const modal = useModal();
    const {setGlobalDirtyState} = useGlobalDirtyState();
    const [animationFinished, setAnimationFinished] = useState(false);

    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    const removeModal = useCallback(() => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    }, [dirty, modal, afterClose]);

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            const activeEl = document.activeElement as HTMLElement | null;
            if (activeEl?.hasAttribute('data-kg-link-input')) return;

            activeEl?.blur();
            setTimeout(() => {
                if (onCancel) {
                    onCancel();
                } else {
                    removeModal();
                }
            });
            event.stopPropagation();
        };
        document.addEventListener('keydown', handleEscapeKey);
        return () => document.removeEventListener('keydown', handleEscapeKey);
    }, [onCancel, removeModal]);

    useEffect(() => {
        const timer = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!onOk || !enableCMDS) return;
        const handleCMDS = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                onOk();
            }
        };
        window.addEventListener('keydown', handleCMDS);
        return () => window.removeEventListener('keydown', handleCMDS);
    }, [onOk, enableCMDS]);

    const buttons: ButtonProps[] = useMemo(() => {
        if (footer) return [];
        const btns: ButtonProps[] = [];
        if (cancelLabel) {
            btns.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: onCancel ?? removeModal,
                disabled: buttonsDisabled
            });
        }
        if (okLabel) {
            btns.push({
                key: 'ok-modal',
                label: okLabel,
                color: okColor,
                className: 'min-w-[80px]',
                onClick: onOk,
                disabled: buttonsDisabled || okDisabled,
                loading: okLoading
            });
        }
        return btns;
    }, [
        footer,
        cancelLabel,
        okLabel,
        okColor,
        okLoading,
        onOk,
        onCancel,
        removeModal,
        buttonsDisabled,
        okDisabled
    ]);

    const {
        modalClasses,
        backdropClasses,
        paddingClasses,
        headerClasses,
        contentClasses,
        footerClasses,
        modalStyles
    } = useMemo(() => {
        const cfg = sizeConfig[size] ?? sizeConfig['md'];
        const baseModal = clsx(
            'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
            align === 'center' && 'mx-auto',
            align === 'left' && 'mr-auto',
            align === 'right' && 'ml-auto',
            size !== 'bleed' && 'rounded',
            formSheet ? 'shadow-md' : 'shadow-xl',
            scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
            (animate && !formSheet && !animationFinished && align === 'center') && 'animate-modal-in',
            (animate && !formSheet && !animationFinished && align === 'right') && 'animate-modal-in-from-right',
            (formSheet && !animationFinished) && 'animate-modal-in-reverse'
        );

        const modalWithSize = cfg.modalMaxWidth
            ? clsx(baseModal, cfg.modalMaxWidth)
            : baseModal;

        const modalWithWidth = (() => {
            if (typeof width === 'number') {
                return modalWithSize;
            }
            if (width === 'full') {
                return clsx(modalWithSize, 'w-full');
            }
            if (width === 'toSidebar') {
                return clsx(
                    modalWithSize,
                    'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
                );
            }
            return modalWithSize;
        })();

        const modalWithHeight = (() => {
            if (typeof height === 'number') {
                return modalWithWidth;
            }
            if (height === 'full') {
                return clsx(modalWithWidth, 'h-full');
            }
            return modalWithWidth;
        })();

        const backdrop = clsx(
            'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
            allowBackgroundInteraction && 'pointer-events-none',
            cfg.backdropPadding,
            'max-[800px]:!pb-20'
        );

        const padCls = padding ? cfg.padding ?? '' : 'p-0';
        const headerBase = clsx(
            (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
            stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
            cfg.headerInset,
            padCls,
            'pb-0'
        );

        const content = clsx(
            padCls,
            'py-0',
            (size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow'
        );

        const footerCls = clsx(
            `${padCls} ${stickyFooter ? 'py-6' : ''}`,
            'flex w-full items-center justify-between'
        );

        const styles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string} = {};
        if (typeof width === 'number') {
            styles.width = '100%';
            styles.maxWidth = `${width}px`;
        }
        if (typeof height === 'number') {
            styles.height = '100%';
            styles.maxHeight = `${height}px`;
        }

        return {
            modalClasses: modalWithHeight,
            backdropClasses: backdrop,
            paddingClasses: padCls,
            headerClasses: headerBase,
            contentClasses: content,
            footerClasses: footerCls,
            modalStyles: styles
        };
    }, [
        size,
        align,
        formSheet,
        scrolling,
        animate,
        animationFinished,
        width,
        height,
        allowBackgroundInteraction,
        topRightContent,
        stickyHeader,
        padding,
        stickyFooter
    ]);

    const handleBackdropClick = useCallback(
        (e: MouseEvent<HTMLDivElement>) => {
            if (e.target === e.currentTarget && backDropClick) {
                removeModal();
            }
        },
        [backDropClick, removeModal]
    );

    const renderFooter = useMemo(() => {
        if (footer) {
            return footer;
        }
        if (footer === false) {
            return null;
        }
        return (
            <div className={footerClasses}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className="flex gap-3">
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );
    }, [footer, footerClasses, leftButtonProps, buttons]);

    const footerContent = stickyFooter ? (
        <StickyFooter height={84}>{renderFooter}</StickyFooter>
    ) : (
        <>{renderFooter}</>
    );

    return (
        <div className={backdropClasses} id="modal-backdrop" onMouseDown={handleBackdropClick}>
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
                {header === false ? null : topRightContent && topRightContent !== 'close' ? (
                    <header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        {topRightContent}
                    </header>
                ) : (
                    <header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        <div
                            className={clsx(
                                `${topRightContent !== 'close' && 'md:!invisible md:!hidden'}`,
                                hideXOnMobile && 'hidden',
                                'absolute right-6 top-6'
                            )}
                        >
                            <Button
                                className="-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100"
                                icon="close"
                                iconColorClass="text-black dark:text-white"
                                size="sm"
                                testId="close-modal"
                                unstyled
                                onClick={removeModal}
                            />
                        </div>
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