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
    stickyHeader?:boolean;
    scrolling?: boolean;
    dirty?: boolean;
    animate?: boolean;
    formSheet?: boolean;
    enableCMDS?: boolean;
    allowBackgroundInteraction?: boolean;
}

export const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

const handleEscapeKey = (
    event: KeyboardEvent,
    modal: ReturnType<typeof useModal>,
    dirty: boolean,
    afterClose?: () => void,
    onCancel?: () => void
) => {
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

const handleCMDS = (event: KeyboardEvent, onOk: () => void) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        onOk();
    }
};

const removeModal = (
    modal: ReturnType<typeof useModal>,
    dirty: boolean,
    afterClose?: () => void
) => {
    confirmIfDirty(dirty, () => {
        modal.remove();
        afterClose?.();
    });
};

const computeModalClasses = (
    props: ModalProps,
    animationFinished: boolean
) => {
    const {
        align = 'center',
        size = 'md',
        formSheet = false,
        animate = true,
        scrolling = true
    } = props;
    return clsx(
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
};

const computeBackdropClasses = (props: ModalProps) => {
    const {allowBackgroundInteraction = false} = props;
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none'
    );
};

const computeHeaderClasses = (
    props: ModalProps,
    size: ModalSize,
    topRightContent?: 'close' | React.ReactNode,
    stickyHeader?: boolean
) => {
    const {align = 'center'} = props;
    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );
    if (stickyHeader) {
        headerClasses = clsx(
            headerClasses,
            'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );
    }
    switch (size) {
        case 'sm':
        case 'md':
            headerClasses = clsx(headerClasses, '-inset-x-8');
            break;
        case 'lg':
            headerClasses = clsx(headerClasses, '-inset-x-8');
            break;
        case 'xl':
            headerClasses = clsx(headerClasses, '-inset-x-10 -top-10');
            break;
        case 'full':
        case 'bleed':
            headerClasses = clsx(headerClasses, '-inset-x-10');
            break;
        default:
            headerClasses = clsx(headerClasses, '-inset-x-8');
    }
    return headerClasses;
};

const computeFooterClasses = (
    props: ModalProps,
    size: ModalSize,
    padding: boolean,
    stickyFooter?: boolean
) => {
    const paddingClasses = padding ? 'p-8' : 'p-0';
    return clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );
};

const computeContentClasses = (
    props: ModalProps,
    size: ModalSize,
    height?: 'full' | number,
    padding: boolean
) => {
    const paddingClasses = padding ? 'p-8' : 'p-0';
    let contentClasses = clsx(
        paddingClasses,
        'py-0'
    );
    if ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number')) {
        contentClasses = clsx(contentClasses, 'grow');
    }
    return contentClasses;
};

const computeModalStyles = (
    width?: 'full' | 'toSidebar' | number,
    height?: 'full' | number
) => {
    const styles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};
    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = `${width}px`;
    } else if (width === 'full') {
        // handled in classes
    } else if (width === 'toSidebar') {
        // handled in classes
    }
    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        // handled in classes
    }
    return styles;
};

const getButtons = (props: ModalProps) => {
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
        footer
    } = props;
    const buttons: ButtonProps[] = [];
    if (!footer) {
        if (cancelLabel) {
            buttons.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: onCancel ? onCancel : () => {},
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
    return buttons;
};

const getFooterContent = (
    props: ModalProps,
    buttons: ButtonProps[],
    leftButtonProps?: ButtonProps,
    stickyFooter?: boolean,
    footerClasses?: string
) => {
    const {footer, stickyFooter: sf = false} = props;
    let footerContent: React.ReactNode;
    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        footerContent = null;
    } else {
        footerContent = (
            <div className={footerClasses!}>
                <div>
                    {leftButtonProps && <Button {...leftButtonProps} />}
                </div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons}/>
                </div>
            </div>
        );
    }
    return sf ? (
        <StickyFooter height={84}>
            {footerContent}
        </StickyFooter>
    ) : (
        <>
            {footerContent}
        </>
    );
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
        const handler = (e: KeyboardEvent) => handleEscapeKey(e, modal, dirty, afterClose, onCancel);
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [modal, dirty, afterClose, onCancel]);

    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

    useEffect(() => {
        if (onOk && enableCMDS) {
            const handler = (e: KeyboardEvent) => handleCMDS(e, onOk);
            window.addEventListener('keydown', handler);
            return () => window.removeEventListener('keydown', handler);
        }
    }, [onOk, enableCMDS]);

    const buttons = getButtons({
        cancelLabel,
        okLabel,
        okColor,
        okLoading,
        okDisabled,
        buttonsDisabled,
        onOk,
        onCancel,
        leftButtonProps,
        footer
    });

    const modalClasses = computeModalClasses({size, align, formSheet, animate, scrolling}, animationFinished);
    const backdropClasses = computeBackdropClasses({allowBackgroundInteraction});
    const headerClasses = computeHeaderClasses({size, align, topRightContent, stickyHeader}, size, topRightContent, stickyHeader);
    const footerClasses = computeFooterClasses({size, padding, stickyFooter}, size, padding, stickyFooter);
    const contentClasses = computeContentClasses({size, padding, height}, size, height, padding);
    const modalStyles = computeModalStyles(width, height);

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal(modal, dirty, afterClose);
        }
    };

    const footerContent = getFooterContent(
        {footer, stickyFooter},
        buttons,
        leftButtonProps,
        stickyFooter,
        footerClasses
    );

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section ref={ref} className={clsx(
                modalClasses,
                allowBackgroundInteraction && 'pointer-events-auto'
            )} data-testid={testId} style={modalStyles}>
                {header === false ? '' : (!topRightContent || topRightContent === 'close' ?
                    (<header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                            <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={() => removeModal(modal, dirty, afterClose)} />
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