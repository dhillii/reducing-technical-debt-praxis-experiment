import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {useEffect, useState, forwardRef, MouseEvent, KeyboardEvent} from 'react';
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

const useEscapeHandler = (
    onCancel: (() => void) | undefined,
    dirty: boolean,
    modal: ReturnType<typeof useModal>,
    afterClose: (() => void) | undefined
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
    }, [onCancel, dirty, modal, afterClose]);
};

const useCmdSHandler = (onOk: (() => void) | undefined, enableCMDS: boolean) => {
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

const getSizeConfig = (size: ModalSize | undefined) => {
    const base = {
        modal: '',
        backdrop: '',
        padding: 'p-8',
        header: '-inset-x-8',
    };

    switch (size) {
        case 'sm':
            return {
                ...base,
                modal: 'max-w-[480px]',
                backdrop: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                header: '-inset-x-8',
            };
        case 'md':
            return {
                ...base,
                modal: 'max-w-[720px]',
                backdrop: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                header: '-inset-x-8',
            };
        case 'lg':
            return {
                ...base,
                modal: 'max-w-[1020px]',
                backdrop: 'p-4 md:p-[4vmin]',
                padding: 'p-7',
                header: '-inset-x-8',
            };
        case 'xl':
            return {
                ...base,
                modal: 'max-w-[1240px]0',
                backdrop: 'p-4 md:p-[3vmin]',
                padding: 'p-10',
                header: '-inset-x-10 -top-10',
            };
        case 'full':
            return {
                ...base,
                modal: 'h-full',
                backdrop: 'p-4 md:p-[3vmin]',
                padding: 'p-10',
                header: '-inset-x-10',
            };
        case 'bleed':
            return {
                ...base,
                modal: 'h-full',
                backdrop: '',
                padding: 'p-10',
                header: '-inset-x-10',
            };
        default:
            return {
                ...base,
                backdrop: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                header: '-inset-x-8',
            };
    }
};

const getModalStyles = (
    width: 'full' | 'toSidebar' | number | undefined,
    height: 'full' | number | undefined
) => {
    const styles: React.CSSProperties = {};

    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = `${width}px`;
    }

    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = `${height}px`;
    }

    return styles;
};

const getWidthClasses = (width: 'full' | 'toSidebar' | number | undefined) => {
    if (width === 'full') return 'w-full';
    if (width === 'toSidebar')
        return 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]';
    return '';
};

const getHeightClasses = (height: 'full' | number | undefined) => (height === 'full' ? 'h-full' : '');

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
        allowBackgroundInteraction = false,
    } = props;

    const modal = useModal();
    const {setGlobalDirtyState} = useGlobalDirtyState();
    const [animationFinished, setAnimationFinished] = useState(false);

    useEffect(() => setGlobalDirtyState(dirty), [dirty, setGlobalDirtyState]);
    useEscapeHandler(onCancel, dirty, modal, afterClose);
    useCmdSHandler(onOk, enableCMDS);

    useEffect(() => {
        const id = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(id);
    }, []);

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
    }

    const sizeCfg = getSizeConfig(size);
    const modalBaseClasses = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
        animate && !formSheet && !animationFinished && {
            center: 'animate-modal-in',
            right: 'animate-modal-in-from-right',
        }[align],
        formSheet && !animationFinished && 'animate-modal-in-reverse',
        sizeCfg.modal,
        getWidthClasses(width),
        getHeightClasses(height)
    );

    const backdropBaseClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        backDrop && !formSheet && topLevelBackdropClasses,
        formSheet && 'bg-[rgba(98,109,121,0.08)]',
        sizeCfg.backdrop,
        'max-[800px]:!pb-20'
    );

    const headerBaseClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
        sizeCfg.header,
        padding ? sizeCfg.padding : 'p-0',
        'pb-0'
    );

    const contentBaseClasses = clsx(
        padding ? sizeCfg.padding : 'p-0',
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    const footerBaseClasses = clsx(
        `${padding ? sizeCfg.padding : 'p-0'} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    const modalStyles = getModalStyles(width, height);

    const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) removeModal();
    };

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
            <header className={headerBaseClasses}>
                {title && <Heading level={3}>{title}</Heading>}
                {(!topRightContent || topRightContent === 'close') ? closeWrapper : topRightContent}
            </header>
        );
    };

    const renderFooter = () => {
        if (footer) return footer;
        if (footer === false) return null;

        const footerContent = (
            <div className={footerBaseClasses}>
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
        <div className={backdropBaseClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <section
                ref={ref}
                className={clsx(modalBaseClasses, allowBackgroundInteraction && 'pointer-events-auto')}
                data-testid={testId}
                style={modalStyles}
            >
                {renderHeader()}
                <div className={contentBaseClasses}>{children}</div>
                {renderFooter()}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';
export default Modal;