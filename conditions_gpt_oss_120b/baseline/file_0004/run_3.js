import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {
    useEffect,
    useState,
    forwardRef,
    useCallback,
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

const sizeMap: Record<
    ModalSize,
    {
        modalMax?: string;
        backdropPad?: string;
        padding?: string;
        headerInset?: string;
    }
> = {
    sm: {
        modalMax: 'max-w-[480px]',
        backdropPad: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    },
    md: {
        modalMax: 'max-w-[720px]',
        backdropPad: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    },
    lg: {
        modalMax: 'max-w-[1020px]',
        backdropPad: 'p-4 md:p-[4vmin]',
        padding: 'p-7',
        headerInset: '-inset-x-8'
    },
    xl: {
        modalMax: 'max-w-[1240px]0',
        backdropPad: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10 -top-10'
    },
    full: {
        modalMax: '',
        backdropPad: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10'
    },
    bleed: {
        modalMax: '',
        backdropPad: '',
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

    const handleEscapeKey = useCallback(
        (event: KeyboardEvent) => {
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
        },
        [onCancel, removeModal]
    );

    useEffect(() => {
        document.addEventListener('keydown', handleEscapeKey);
        return () => document.removeEventListener('keydown', handleEscapeKey);
    }, [handleEscapeKey]);

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

    const buildButtons = (): ButtonProps[] => {
        const btns: ButtonProps[] = [];

        if (!footer) {
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
        }
        return btns;
    };

    const buttons = buildButtons();

    const computeClasses = () => {
        const cfg = sizeMap[size] ?? sizeMap['md'];
        const baseModal = clsx(
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
            cfg.modalMax
        );

        const baseBackdrop = clsx(
            'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
            allowBackgroundInteraction && 'pointer-events-none',
            backDrop && !formSheet && topLevelBackdropClasses,
            formSheet && 'bg-[rgba(98,109,121,0.08)]',
            cfg.backdropPad,
            'max-[800px]:!pb-20'
        );

        const basePadding = padding ? cfg.padding : 'p-0';
        const baseHeader = clsx(
            (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
            stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
            basePadding,
            cfg.headerInset,
            'pb-0'
        );

        const baseContent = clsx(
            basePadding,
            'py-0',
            ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
        );

        const baseFooter = clsx(
            `${basePadding} ${stickyFooter ? 'py-6' : ''}`,
            'flex w-full items-center justify-between'
        );

        return {
            modal: baseModal,
            backdrop: baseBackdrop,
            header: baseHeader,
            content: baseContent,
            footer: baseFooter,
            padding: basePadding
        };
    };

    const {modal: modalClasses, backdrop: backdropClasses, header: headerClasses, content: contentClasses, footer: footerClasses, padding: paddingClasses} = computeClasses();

    const modalStyles: React.CSSProperties = {};
    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = `${width}px`;
    } else if (width === 'full') {
        modalClasses.concat(' w-full');
    } else if (width === 'toSidebar') {
        modalClasses.concat(
            'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
        );
    }

    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        modalClasses.concat(' h-full');
    }

    const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const renderFooter = () => {
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
    };

    const footerContent = stickyFooter ? (
        <StickyFooter height={84}>{renderFooter()}</StickyFooter>
    ) : (
        renderFooter()
    );

    const renderHeader = () => {
        if (header === false) return null;
        const closeBtn = (
            <div
                className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${
                    hideXOnMobile && 'hidden'
                } absolute right-6 top-6`}
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
        );

        if (!topRightContent || topRightContent === 'close') {
            return (
                <header className={headerClasses}>
                    {title && <Heading level={3}>{title}</Heading>}
                    {closeBtn}
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

    return (
        <div className={backdropClasses} id="modal-backdrop" onMouseDown={handleBackdropClick}>
            <section
                ref={ref}
                className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')}
                data-testid={testId}
                style={modalStyles}
            >
                {renderHeader()}
                <div className={contentClasses}>{children}</div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;