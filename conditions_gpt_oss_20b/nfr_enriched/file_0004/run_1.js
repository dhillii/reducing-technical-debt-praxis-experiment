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

/**
 * Handles the Escape key press to close the modal.
 */
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

/**
 * Handles Cmd/Ctrl + S to trigger onOk.
 */
const handleCMDS = (e: KeyboardEvent, onOk: () => void) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        onOk();
    }
};

/**
 * Removes the modal after confirming dirty state.
 */
const removeModal = (
    dirty: boolean,
    modal: ReturnType<typeof useModal>,
    afterClose: (() => void) | undefined
) => {
    confirmIfDirty(dirty, () => {
        modal.remove();
        afterClose?.();
    });
};

/**
 * Returns size specific class fragments.
 */
const getSizeClasses = (size: ModalSize) => {
    switch (size) {
        case 'sm':
            return {
                modalSize: 'max-w-[480px]',
                backdropPadding: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                headerInset: '-inset-x-8'
            };
        case 'md':
            return {
                modalSize: 'max-w-[720px]',
                backdropPadding: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                headerInset: '-inset-x-8'
            };
        case 'lg':
            return {
                modalSize: 'max-w-[1020px]',
                backdropPadding: 'p-4 md:p-[4vmin]',
                padding: 'p-7',
                headerInset: '-inset-x-8'
            };
        case 'xl':
            return {
                modalSize: 'max-w-[1240px]',
                backdropPadding: 'p-4 md:p-[3vmin]',
                padding: 'p-10',
                headerInset: '-inset-x-10 -top-10'
            };
        case 'full':
            return {
                modalSize: 'h-full',
                backdropPadding: 'p-4 md:p-[3vmin]',
                padding: 'p-10',
                headerInset: '-inset-x-10'
            };
        case 'bleed':
            return {
                modalSize: 'h-full',
                backdropPadding: '',
                padding: 'p-10',
                headerInset: '-inset-x-10'
            };
        default:
            return {
                modalSize: '',
                backdropPadding: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                headerInset: '-inset-x-8'
            };
    }
};

/**
 * Computes modal classes based on props and state.
 */
const computeModalClasses = (
    props: ModalProps,
    animationFinished: boolean,
    sizeClasses: ReturnType<typeof getSizeClasses>
) => {
    const {
        align = 'center',
        formSheet = false,
        animate = true,
        scrolling = true,
        stickyHeader = false
    } = props;

    let classes = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        props.size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        (animate && !formSheet && !animationFinished && align === 'center') && 'animate-modal-in',
        (animate && !formSheet && !animationFinished && align === 'right') && 'animate-modal-in-from-right',
        (formSheet && !animationFinished) && 'animate-modal-in-reverse',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
        sizeClasses.modalSize
    );

    if (stickyHeader) {
        classes = clsx(
            classes,
            'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );
    }

    return classes;
};

/**
 * Computes backdrop classes.
 */
const computeBackdropClasses = (
    props: ModalProps,
    sizeClasses: ReturnType<typeof getSizeClasses>
) => {
    const {allowBackgroundInteraction = false} = props;
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        sizeClasses.backdropPadding,
        'max-[800px]:!pb-20'
    );
};

/**
 * Computes header classes.
 */
const computeHeaderClasses = (
    props: ModalProps,
    sizeClasses: ReturnType<typeof getSizeClasses>
) => {
    const {topRightContent, hideXOnMobile = false} = props;
    let classes = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        sizeClasses.headerInset,
        hideXOnMobile && 'hidden'
    );
    return classes;
};

/**
 * Computes content classes.
 */
const computeContentClasses = (
    props: ModalProps,
    sizeClasses: ReturnType<typeof getSizeClasses>
) => {
    const {padding = true, height} = props;
    let classes = clsx(
        sizeClasses.padding,
        'py-0',
        ((props.size === 'full' || props.size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );
    if (!padding) {
        classes = clsx(classes, 'p-0');
    }
    return classes;
};

/**
 * Computes footer classes.
 */
const computeFooterClasses = (props: ModalProps, sizeClasses: ReturnType<typeof getSizeClasses>) => {
    const {stickyFooter = false} = props;
    return clsx(
        `${sizeClasses.padding} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );
};

/**
 * Computes modal inline styles based on width/height.
 */
const computeModalStyles = (props: ModalProps) => {
    const {width, height} = props;
    const styles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = `${width}px`;
    } else if (width === 'full') {
        // handled via class
    } else if (width === 'toSidebar') {
        // handled via class
    }

    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        // handled via class
    }

    return styles;
};

/**
 * Builds the footer content based on props.
 */
const buildFooterContent = (
    props: ModalProps,
    buttons: ButtonProps[],
    footerContent: React.ReactNode | undefined
) => {
    const {footer, stickyFooter = false} = props;
    let content: React.ReactNode;

    if (footer) {
        content = footer;
    } else if (footer === false) {
        content = null;
    } else {
        content = (
            <div className={footerContent as string}>
                <div>
                    {props.leftButtonProps && <Button {...props.leftButtonProps} />}
                </div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons}/>
                </div>
            </div>
        );
    }

    return stickyFooter ? (
        <StickyFooter height={84}>
            {content}
        </StickyFooter>
    ) : (
        <>{content}</>
    );
};

/**
 * Builds the header element.
 */
const buildHeader = (props: ModalProps, headerClasses: string) => {
    const {header = true, title, topRightContent, hideXOnMobile = false} = props;
    if (!header) return null;

    if (!topRightContent || topRightContent === 'close') {
        return (
            <header className={headerClasses}>
                {title && <Heading level={3}>{title}</Heading>}
                <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                    <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                </div>
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
        const handler = (event: KeyboardEvent) => handleEscapeKey(event, modal, dirty, afterClose, onCancel);
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [modal, dirty, afterClose, onCancel]);

    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

    useEffect(() => {
        if (!onOk) return;
        const handler = (e: KeyboardEvent) => handleCMDS(e, onOk);
        if (enableCMDS) {
            window.addEventListener('keydown', handler);
            return () => window.removeEventListener('keydown', handler);
        }
    }, [onOk, enableCMDS]);

    const sizeClasses = getSizeClasses(size);

    const modalClasses = computeModalClasses({size, align, formSheet, animate, scrolling, stickyHeader, backDrop, allowBackgroundInteraction, stickyFooter, padding, backDropClick, topRightContent, hideXOnMobile, okLabel, okColor, okLoading, cancelLabel, leftButtonProps, buttonsDisabled, okDisabled, header, footer, children, width, height, dirty, animate, formSheet, enableCMDS, allowBackgroundInteraction}, animationFinished, sizeClasses);

    const backdropClasses = computeBackdropClasses({allowBackgroundInteraction, backDrop, backDropClick, topRightContent, hideXOnMobile, stickyFooter, stickyHeader, scrolling, dirty, animate, formSheet, enableCMDS, allowBackgroundInteraction}, sizeClasses);

    const headerClasses = computeHeaderClasses({topRightContent, hideXOnMobile}, sizeClasses);

    const contentClasses = computeContentClasses({padding, height}, sizeClasses);

    const footerClasses = computeFooterClasses({stickyFooter}, sizeClasses);

    const modalStyles = computeModalStyles({width, height});

    const buttons: ButtonProps[] = [];

    if (!footer) {
        if (cancelLabel) {
            buttons.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: onCancel ? onCancel : () => removeModal(dirty, modal, afterClose),
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

    const footerContent = buildFooterContent({footer, stickyFooter, leftButtonProps}, buttons, footerClasses);

    const headerElement = buildHeader({header, title, topRightContent, hideXOnMobile}, headerClasses);

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal(dirty, modal, afterClose);
        }
    };

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
                {headerElement}
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