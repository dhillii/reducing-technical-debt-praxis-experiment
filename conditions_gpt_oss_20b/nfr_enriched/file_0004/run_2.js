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

/** Handles the Escape key to close the modal. */
const handleEscapeKey = (
    event: KeyboardEvent,
    modal: ReturnType<typeof useModal>,
    dirty: boolean,
    afterClose: (() => void) | undefined,
    onCancel: (() => void) | undefined
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

/** Handles Cmd/Ctrl+S to trigger onOk. */
const handleCMDS = (e: KeyboardEvent, onOk: () => void) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        onOk();
    }
};

/** Removes the modal after confirming dirty state. */
const removeModal = (
    modal: ReturnType<typeof useModal>,
    dirty: boolean,
    afterClose: (() => void) | undefined
) => {
    confirmIfDirty(dirty, () => {
        modal.remove();
        afterClose?.();
    });
};

/** Computes modal, backdrop, header, content, and footer classes based on props and state. */
const computeClasses = (
    props: ModalProps,
    animationFinished: boolean
) => {
    const {
        size = 'md',
        align = 'center',
        formSheet = false,
        animate = true,
        scrolling = true,
        stickyHeader = false,
        stickyFooter = false,
        padding = true,
        backDrop = true,
        allowBackgroundInteraction = false,
        topRightContent,
        hideXOnMobile = false
    } = props;

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

    let backdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none'
    );

    let paddingClasses = '';
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
            modalClasses = clsx(modalClasses, 'max-w-[480px]');
            backdropClasses = clsx(backdropClasses, 'p-4 md:p-[8vmin]');
            paddingClasses = 'p-8';
            headerClasses = clsx(headerClasses, '-inset-x-8');
            break;
        case 'md':
            modalClasses = clsx(modalClasses, 'max-w-[720px]');
            backdropClasses = clsx(backdropClasses, 'p-4 md:p-[8vmin]');
            paddingClasses = 'p-8';
            headerClasses = clsx(headerClasses, '-inset-x-8');
            break;
        case 'lg':
            modalClasses = clsx(modalClasses, 'max-w-[1020px]');
            backdropClasses = clsx(backdropClasses, 'p-4 md:p-[4vmin]');
            paddingClasses = 'p-7';
            headerClasses = clsx(headerClasses, '-inset-x-8');
            break;
        case 'xl':
            modalClasses = clsx(modalClasses, 'max-w-[1240px]0');
            backdropClasses = clsx(backdropClasses, 'p-4 md:p-[3vmin]');
            paddingClasses = 'p-10';
            headerClasses = clsx(headerClasses, '-inset-x-10 -top-10');
            break;
        case 'full':
            modalClasses = clsx(modalClasses, 'h-full');
            backdropClasses = clsx(backdropClasses, 'p-4 md:p-[3vmin]');
            paddingClasses = 'p-10';
            headerClasses = clsx(headerClasses, '-inset-x-10');
            break;
        case 'bleed':
            modalClasses = clsx(modalClasses, 'h-full');
            paddingClasses = 'p-10';
            headerClasses = clsx(headerClasses, '-inset-x-10');
            break;
        default:
            backdropClasses = clsx(backdropClasses, 'p-4 md:p-[8vmin]');
            paddingClasses = 'p-8';
            headerClasses = clsx(headerClasses, '-inset-x-8');
            break;
    }

    if (!padding) {
        paddingClasses = 'p-0';
    }

    const contentClasses = clsx(
        paddingClasses,
        'py-0',
        ((size === 'full' || size === 'bleed' || props.height === 'full' || typeof props.height === 'number') && 'grow')
    );

    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    backdropClasses = clsx(backdropClasses, 'max-[800px]:!pb-20');

    return {
        modalClasses,
        backdropClasses,
        headerClasses,
        contentClasses,
        footerClasses,
        paddingClasses
    };
};

/** Builds the footer content based on props. */
const buildFooterContent = (
    props: ModalProps,
    buttons: ButtonProps[],
    footerClasses: string,
    stickyFooter: boolean
) => {
    let footerContent: React.ReactNode;
    if (props.footer) {
        footerContent = props.footer;
    } else if (props.footer === false) {
        footerContent = null;
    } else {
        footerContent = (
            <div className={footerClasses}>
                <div>
                    {props.leftButtonProps && <Button {...props.leftButtonProps} />}
                </div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons}/>
                </div>
            </div>
        );
    }

    return stickyFooter
        ? <StickyFooter height={84}>{footerContent}</StickyFooter>
        : <>{footerContent}</>;
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
        const listener = (e: KeyboardEvent) => handleEscapeKey(e, modal, dirty, afterClose, onCancel);
        document.addEventListener('keydown', listener);
        return () => document.removeEventListener('keydown', listener);
    }, [modal, dirty, afterClose, onCancel]);

    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

    useEffect(() => {
        if (!onOk) return;
        const listener = (e: KeyboardEvent) => handleCMDS(e, onOk);
        if (enableCMDS) {
            window.addEventListener('keydown', listener);
            return () => window.removeEventListener('keydown', listener);
        }
    }, [onOk, enableCMDS]);

    const buttons: ButtonProps[] = [];
    if (!footer) {
        if (cancelLabel) {
            buttons.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: onCancel ?? (() => removeModal(modal, dirty, afterClose)),
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

    const {modalClasses, backdropClasses, headerClasses, contentClasses, footerClasses, paddingClasses} =
        computeClasses({size, align, formSheet, animate, scrolling, stickyHeader, stickyFooter, padding, backDrop, allowBackgroundInteraction, topRightContent, hideXOnMobile, title, topRightContent, hideXOnMobile, header, footer, leftButtonProps, okLabel, okColor, okLoading, cancelLabel, buttonsDisabled, okDisabled, children, backDropClick, stickyFooter, stickyHeader, dirty, animate, formSheet, enableCMDS, allowBackgroundInteraction}, animationFinished);

    const footerContent = buildFooterContent({footer, leftButtonProps, stickyFooter}, buttons, footerClasses, stickyFooter);

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal(modal, dirty, afterClose);
        }
    };

    const modalStyles: Record<string, string> = {};
    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = `${width}px`;
    } else if (width === 'full') {
        modalClasses = clsx(modalClasses, 'w-full');
    } else if (width === 'toSidebar') {
        modalClasses = clsx(
            modalClasses,
            'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
        );
    }

    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

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
                            <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal.bind(null, modal, dirty, afterClose)} />
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