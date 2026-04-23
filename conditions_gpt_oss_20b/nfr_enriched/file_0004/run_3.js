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

const useEscapeKey = (modal: any, dirty: boolean, afterClose?: () => void, onCancel?: () => void) => {
    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            const activeEl = document.activeElement;
            if (activeEl?.hasAttribute('data-kg-link-input')) return;
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
        return () => document.removeEventListener('keydown', handleEscapeKey);
    }, [modal, dirty, afterClose, onCancel]);
};

const useCMDS = (onOk?: () => void, enableCMDS = true) => {
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
};

const useAnimation = () => {
    const [animationFinished, setAnimationFinished] = useState(false);
    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);
    return animationFinished;
};

const useGlobalDirty = (dirty: boolean) => {
    const {setGlobalDirtyState} = useGlobalDirtyState();
    useEffect(() => setGlobalDirtyState(dirty), [dirty, setGlobalDirtyState]);
};

const createButtons = (props: ModalProps, removeModal: () => void) => {
    const {
        cancelLabel,
        okLabel,
        okColor = 'black',
        okLoading = false,
        okDisabled = false,
        buttonsDisabled = false,
        onOk,
        onCancel,
        leftButtonProps,
        footer,
        stickyFooter,
        stickyHeader,
        header,
        topRightContent,
        hideXOnMobile,
        testId,
        title,
        size,
        align,
        width,
        height,
        backDrop,
        backDropClick,
        scrolling,
        dirty,
        animate,
        formSheet,
        enableCMDS,
        allowBackgroundInteraction,
    } = props;
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
    return buttons;
};

const computeModalClasses = (
    props: ModalProps,
    animationFinished: boolean,
    size: ModalSize,
    align: 'center' | 'left' | 'right',
    formSheet: boolean,
    scrolling: boolean,
    animate: boolean,
    width: 'full' | 'toSidebar' | number | undefined,
    height: 'full' | number | undefined,
    backDrop: boolean,
    backDropClick: boolean,
    stickyFooter: boolean,
    stickyHeader: boolean,
    padding: boolean,
    dirty: boolean,
    enableCMDS: boolean,
    allowBackgroundInteraction: boolean,
    animationFinishedState: boolean
) => {
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
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
    );

    if (width === 'full') {
        modalClasses = clsx(modalClasses, 'w-full');
    } else if (width === 'toSidebar') {
        modalClasses = clsx(
            modalClasses,
            'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
        );
    }

    if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

    return modalClasses;
};

const computeBackdropClasses = (backDrop: boolean, allowBackgroundInteraction: boolean) => {
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        backDrop && !formSheet && topLevelBackdropClasses
    );
};

const computePaddingClasses = (size: ModalSize, padding: boolean) => {
    let paddingClasses = '';
    switch (size) {
        case 'sm':
        case 'md':
            paddingClasses = 'p-8';
            break;
        case 'lg':
            paddingClasses = 'p-7';
            break;
        case 'xl':
            paddingClasses = 'p-10';
            break;
        case 'full':
        case 'bleed':
            paddingClasses = 'p-10';
            break;
        default:
            paddingClasses = 'p-8';
    }
    if (!padding) paddingClasses = 'p-0';
    return paddingClasses;
};

const computeHeaderClasses = (
    topRightContent: 'close' | React.ReactNode | undefined,
    stickyHeader: boolean,
    paddingClasses: string
) => {
    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );
    if (stickyHeader) {
        headerClasses = clsx(headerClasses, 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black');
    }
    headerClasses = clsx(headerClasses, paddingClasses, 'pb-0');
    return headerClasses;
};

const computeContentClasses = (
    paddingClasses: string,
    size: ModalSize,
    height: 'full' | number | undefined
) => {
    let contentClasses = clsx(paddingClasses, 'py-0');
    if (
        size === 'full' ||
        size === 'bleed' ||
        height === 'full' ||
        typeof height === 'number'
    ) {
        contentClasses = clsx(contentClasses, 'grow');
    }
    return contentClasses;
};

const computeFooterClasses = (paddingClasses: string, stickyFooter: boolean) => {
    return clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );
};

const handleBackdropClick = (
    e: React.MouseEvent<HTMLDivElement>,
    backDropClick: boolean,
    removeModal: () => void
) => {
    if (e.target === e.currentTarget && backDropClick) {
        removeModal();
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
    const animationFinished = useAnimation();
    useGlobalDirty(dirty);
    useEscapeKey(modal, dirty, afterClose, onCancel);
    useCMDS(onOk, enableCMDS);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const buttons = createButtons({size, align, width, height, backDrop, backDropClick, stickyFooter, stickyHeader, header, topRightContent, hideXOnMobile, testId, title, okLabel, okColor, okLoading, okDisabled, buttonsDisabled, onOk, onCancel, leftButtonProps, footer, stickyFooter, stickyHeader, header, topRightContent, hideXOnMobile, testId, title, size, align, width, height, backDrop, backDropClick, scrolling, dirty, animate, formSheet, enableCMDS, allowBackgroundInteraction}, removeModal);

    const modalClasses = computeModalClasses(
        {size, align, width, height, backDrop, backDropClick, stickyFooter, stickyHeader, header, topRightContent, hideXOnMobile, testId, title, okLabel, okColor, okLoading, okDisabled, buttonsDisabled, onOk, onCancel, leftButtonProps, footer, stickyFooter, stickyHeader, header, topRightContent, hideXOnMobile, testId, title, size, align, width, height, backDrop, backDropClick, scrolling, dirty, animate, formSheet, enableCMDS, allowBackgroundInteraction},
        animationFinished,
        size,
        align,
        formSheet,
        scrolling,
        animate,
        width,
        height,
        backDrop,
        backDropClick,
        stickyFooter,
        stickyHeader,
        padding,
        dirty,
        enableCMDS,
        allowBackgroundInteraction,
        animationFinished
    );

    const backdropClasses = computeBackdropClasses(backDrop, allowBackgroundInteraction);

    const paddingClasses = computePaddingClasses(size, padding);

    const headerClasses = computeHeaderClasses(topRightContent, stickyHeader, paddingClasses);

    const contentClasses = computeContentClasses(paddingClasses, size, height);

    const footerClasses = computeFooterClasses(paddingClasses, stickyFooter);

    let footerContent: React.ReactNode;
    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        footerContent = <div className={contentClasses} />;
    } else {
        footerContent = (
            <div className={footerClasses}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );
    }

    footerContent = stickyFooter ? (
        <StickyFooter height={84}>{footerContent}</StickyFooter>
    ) : (
        <>{footerContent}</>
    );

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={e => handleBackdropClick(e, backDropClick, removeModal)}>
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
                style={{
                    width: typeof width === 'number' ? '100%' : undefined,
                    maxWidth: typeof width === 'number' ? `${width}px` : undefined,
                    height: typeof height === 'number' ? '100%' : undefined,
                    maxHeight: typeof height === 'number' ? `${height}px` : undefined,
                }}
            >
                {header === false ? null : !topRightContent || topRightContent === 'close' ? (
                    <header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        <div
                            className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}
                        >
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
                ) : (
                    <header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        {topRightContent}
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