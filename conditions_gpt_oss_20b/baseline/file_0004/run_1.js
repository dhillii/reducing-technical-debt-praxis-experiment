import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {useEffect, useState, forwardRef, useCallback, useMemo} from 'react';
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

const getModalClasses = (props: ModalProps, animationFinished: boolean) => {
    const {
        size = 'md',
        align = 'center',
        formSheet = false,
        animate = true,
        scrolling = true,
    } = props;
    let classes = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        (animate && !formSheet && !animationFinished && align === 'center') && 'animate-modal-in',
        (animate && !formSheet && !animationFinished && align === 'right') && 'animate-modal-in-from-right',
        (formSheet && !animationFinished) && 'animate-modal-in-reverse',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
    );

    switch (size) {
        case 'sm':
            classes = clsx(classes, 'max-w-[480px]');
            break;
        case 'md':
            classes = clsx(classes, 'max-w-[720px]');
            break;
        case 'lg':
            classes = clsx(classes, 'max-w-[1020px]');
            break;
        case 'xl':
            classes = clsx(classes, 'max-w-[1240px]');
            break;
        case 'full':
        case 'bleed':
            classes = clsx(classes, 'h-full');
            break;
        default:
            break;
    }
    return classes;
};

const getBackdropClasses = (props: ModalProps) => {
    const {allowBackgroundInteraction = false} = props;
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none'
    );
};

const getPaddingClasses = (props: ModalProps) => {
    const {padding = true} = props;
    return padding ? 'p-8' : 'p-0';
};

const getHeaderClasses = (props: ModalProps, size: ModalSize, topRightContent: ModalProps['topRightContent'], stickyHeader: boolean) => {
    const {align = 'center', hideXOnMobile = false} = props;
    let classes = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
    );

    switch (size) {
        case 'sm':
        case 'md':
            classes = clsx(classes, '-inset-x-8');
            break;
        case 'xl':
            classes = clsx(classes, '-inset-x-10 -top-10');
            break;
        case 'full':
        case 'bleed':
            classes = clsx(classes, '-inset-x-10');
            break;
        default:
            classes = clsx(classes, '-inset-x-8');
            break;
    }

    return clsx(classes, getPaddingClasses(props), 'pb-0');
};

const getContentClasses = (props: ModalProps, size: ModalSize, height: ModalProps['height']) => {
    const paddingClasses = getPaddingClasses(props);
    let classes = clsx(paddingClasses, 'py-0');
    if (size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') {
        classes = clsx(classes, 'grow');
    }
    return classes;
};

const getFooterClasses = (props: ModalProps) => {
    const {padding = true, stickyFooter = false} = props;
    const paddingClasses = getPaddingClasses(props);
    return clsx(`${paddingClasses} ${stickyFooter ? 'py-6' : ''}`, 'flex w-full items-center justify-between');
};

const getFooterContent = (props: ModalProps, buttons: ButtonProps[], leftButtonProps?: ButtonProps) => {
    const {footer, stickyFooter = false} = props;
    let content: React.ReactNode;
    if (footer === false) {
        content = null;
    } else if (footer) {
        content = footer;
    } else {
        content = (
            <div className={getFooterClasses(props)}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );
    }
    return stickyFooter ? <StickyFooter height={84}>{content}</StickyFooter> : content;
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

    const removeModal = useCallback(() => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    }, [dirty, modal, afterClose]);

    const buttons: ButtonProps[] = useMemo(() => {
        const arr: ButtonProps[] = [];
        if (!footer) {
            if (cancelLabel) {
                arr.push({
                    key: 'cancel-modal',
                    label: cancelLabel,
                    color: 'outline',
                    onClick: onCancel ?? removeModal,
                    disabled: buttonsDisabled
                });
            }
            if (okLabel) {
                arr.push({
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
        return arr;
    }, [footer, cancelLabel, okLabel, okColor, okLoading, onOk, onCancel, removeModal, buttonsDisabled, okDisabled]);

    const modalClasses = useMemo(() => getModalClasses({size, align, formSheet, animate, scrolling}, animationFinished), [size, align, formSheet, animate, scrolling, animationFinished]);

    const backdropClasses = useMemo(() => getBackdropClasses({allowBackgroundInteraction}), [allowBackgroundInteraction]);

    const headerClasses = useMemo(() => getHeaderClasses({align, hideXOnMobile, stickyHeader, topRightContent}, size, topRightContent, stickyHeader), [align, hideXOnMobile, stickyHeader, topRightContent, size]);

    const contentClasses = useMemo(() => getContentClasses({padding}, size, height), [padding, size, height]);

    const footerContent = useMemo(() => getFooterContent({footer, stickyFooter, padding}, buttons, leftButtonProps), [footer, stickyFooter, padding, buttons, leftButtonProps]);

    const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) removeModal();
    }, [backDropClick, removeModal]);

    const modalStyles: React.CSSProperties = useMemo(() => {
        const styles: React.CSSProperties = {};
        if (typeof width === 'number') {
            styles.width = '100%';
            styles.maxWidth = `${width}px`;
        } else if (width === 'full') {
            modalClasses = clsx(modalClasses, 'w-full');
        } else if (width === 'toSidebar') {
            modalClasses = clsx(modalClasses, 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]');
        }
        if (typeof height === 'number') {
            styles.height = '100%';
            styles.maxHeight = `${height}px`;
        } else if (height === 'full') {
            modalClasses = clsx(modalClasses, 'h-full');
        }
        return styles;
    }, [width, height, modalClasses]);

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section ref={ref} className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')} data-testid={testId} style={modalStyles}>
                {header === false ? null : (
                    !topRightContent || topRightContent === 'close' ? (
                        <header className={headerClasses}>
                            {title && <Heading level={3}>{title}</Heading>}
                            <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                                <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                            </div>
                        </header>
                    ) : (
                        <header className={headerClasses}>
                            {title && <Heading level={3}>{title}</Heading>}
                            {topRightContent}
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