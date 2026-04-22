import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {
    useEffect,
    useState,
    forwardRef,
    MouseEvent,
    KeyboardEvent,
    CSSProperties
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

type SizeConfig = {
    modalMax?: string;
    backdropPad?: string;
    padding?: string;
    headerInset?: string;
};

const sizeMap: Record<ModalSize, SizeConfig> = {
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
        modalMax: 'h-full',
        backdropPad: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10'
    },
    bleed: {
        modalMax: 'h-full',
        padding: 'p-10',
        headerInset: '-inset-x-10'
    }
};

const useEscapeHandler = (
    modal: ReturnType<typeof useModal>,
    dirty: boolean,
    afterClose?: () => void,
    onCancel?: () => void
) => {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;

            const active = document.activeElement as HTMLElement | null;
            if (active?.hasAttribute('data-kg-link-input')) return;

            active?.blur();
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
            e.stopPropagation();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [modal, dirty, afterClose, onCancel]);
};

const useCMDSHandler = (onOk?: () => void, enableCMDS = true) => {
    useEffect(() => {
        if (!onOk || !enableCMDS) return;
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                onOk();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onOk, enableCMDS]);
};

const computeModalStyles = (
    width?: 'full' | 'toSidebar' | number,
    height?: 'full' | number
): CSSProperties => {
    const style: CSSProperties = {};
    if (typeof width === 'number') {
        style.width = '100%';
        style.maxWidth = `${width}px`;
    }
    if (typeof height === 'number') {
        style.height = '100%';
        style.maxHeight = `${height}px`;
    }
    return style;
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

    useEffect(() => setGlobalDirtyState(dirty), [dirty, setGlobalDirtyState]);

    useEffect(() => {
        const timer = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timer);
    }, []);

    useEscapeHandler(modal, dirty, afterClose, onCancel);
    useCMDSHandler(onOk, enableCMDS);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const buttons: ButtonProps[] = [];
    if (!footer) {
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
    }

    const sizeCfg = sizeMap[size] ?? sizeMap['md'];
    const baseModalClasses = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
        sizeCfg.modalMax
    );

    const animationClass = animate && !formSheet && !animationFinished && {
        center: 'animate-modal-in',
        right: 'animate-modal-in-from-right',
        default: ''
    }[align] ?? '';

    const modalClasses = clsx(baseModalClasses, animationClass, {
        'w-full': width === 'full',
        'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]':
            width === 'toSidebar'
    });

    const backdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        sizeCfg.backdropPad,
        'max-[800px]:!pb-20'
    );

    const paddingClasses = padding ? sizeCfg.padding ?? '' : 'p-0';
    const headerBase = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
        sizeCfg.headerInset,
        paddingClasses,
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

    const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const modalStyles = computeModalStyles(width, height);

    const renderHeader = () => {
        if (header === false) return null;
        const closeBtn = (
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
        const closeWrapper = (
            <div
                className={clsx(
                    `${topRightContent !== 'close' && 'md:!invisible md:!hidden'}`,
                    hideXOnMobile && 'hidden',
                    'absolute right-6 top-6'
                )}
            >
                {closeBtn}
            </div>
        );

        return (
            <header className={headerBase}>
                {title && <Heading level={3}>{title}</Heading>}
                {(!topRightContent || topRightContent === 'close') ? closeWrapper : topRightContent}
            </header>
        );
    };

    const renderFooter = () => {
        if (footer) {
            return footer;
        }
        if (footer === false) {
            return null;
        }
        const footerContent = (
            <div className={footerClasses}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );
        return stickyFooter ? (
            <StickyFooter height={84}>{footerContent}</StickyFooter>
        ) : (
            <>{footerContent}</>
        );
    };

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
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
                {renderHeader()}
                <div className={contentClasses}>{children}</div>
                {renderFooter()}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;