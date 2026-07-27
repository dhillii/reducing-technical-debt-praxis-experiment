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
 * Returns configuration strings for a given modal size.
 * @param size - The size of the modal.
 */
function getSizeConfig(size: ModalSize | string) {
    switch (size) {
        case 'sm':
            return {
                modalAdd: 'max-w-[480px]',
                backdropAdd: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                headerAdd: '-inset-x-8',
            };
        case 'md':
            return {
                modalAdd: 'max-w-[720px]',
                backdropAdd: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                headerAdd: '-inset-x-8',
            };
        case 'lg':
            return {
                modalAdd: 'max-w-[1020px]',
                backdropAdd: 'p-4 md:p-[4vmin]',
                padding: 'p-7',
                headerAdd: '-inset-x-8',
            };
        case 'xl':
            return {
                modalAdd: 'max-w-[1240px]0',
                backdropAdd: 'p-4 md:p-[3vmin]',
                padding: 'p-10',
                headerAdd: '-inset-x-10 -top-10',
            };
        case 'full':
            return {
                modalAdd: 'h-full',
                backdropAdd: 'p-4 md:p-[3vmin]',
                padding: 'p-10',
                headerAdd: '-inset-x-10',
            };
        case 'bleed':
            return {
                modalAdd: 'h-full',
                backdropAdd: '',
                padding: 'p-10',
                headerAdd: '-inset-x-10',
            };
        default:
            return {
                modalAdd: '',
                backdropAdd: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                headerAdd: '-inset-x-8',
            };
    }
}

/**
 * Builds the modal class string based on props and animation state.
 */
function buildModalClasses(props: ModalProps, animationFinished: boolean) {
    const {
        align = 'center',
        size = 'md',
        formSheet = false,
        animate = true,
        scrolling = true,
    } = props;
    const base = clsx(
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
    const sizeConfig = getSizeConfig(size);
    return clsx(base, sizeConfig.modalAdd);
}

/**
 * Builds the backdrop class string based on props.
 */
function buildBackdropClasses(props: ModalProps) {
    const {allowBackgroundInteraction = false} = props;
    const base = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none'
    );
    const sizeConfig = getSizeConfig(props.size || 'md');
    return clsx(base, sizeConfig.backdropAdd);
}

/**
 * Builds the header class string based on props.
 */
function buildHeaderClasses(props: ModalProps) {
    const {topRightContent, stickyHeader = false} = props;
    let header = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );
    if (stickyHeader) {
        header = clsx(
            header,
            'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );
    }
    const sizeConfig = getSizeConfig(props.size || 'md');
    return clsx(header, sizeConfig.headerAdd);
}

/**
 * Builds the content class string based on props.
 */
function buildContentClasses(props: ModalProps, sizeConfig: ReturnType<typeof getSizeConfig>) {
    const {padding = true, height, size = 'md'} = props;
    let paddingClasses = padding ? sizeConfig.padding : 'p-0';
    let content = clsx(
        paddingClasses,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );
    return content;
}

/**
 * Builds the modal inline styles based on width and height.
 */
function buildModalStyles(width?: 'full' | 'toSidebar' | number, height?: 'full' | number) {
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
}

/**
 * Handles removal of the modal with dirty check.
 */
function useRemoveModal(modal: any, dirty: boolean, afterClose?: () => void) {
    return () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };
}

/**
 * Builds the footer content based on props.
 */
function buildFooterContent(
    props: ModalProps,
    buttons: ButtonProps[],
    footerClasses: string,
    leftButtonProps?: ButtonProps
) {
    const {footer, stickyFooter = false} = props;
    let footerContent: React.ReactNode;
    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        footerContent = null;
    } else {
        footerContent = (
            <div className={footerClasses}>
                <div>
                    {leftButtonProps && <Button {...leftButtonProps} />}
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
}

/**
 * Renders the header section.
 */
function renderHeader(
    props: ModalProps,
    headerClasses: string,
    removeModal: () => void
) {
    const {title, topRightContent, hideXOnMobile = false} = props;
    if (topRightContent && topRightContent !== 'close') {
        return (
            <header className={headerClasses}>
                {title && <Heading level={3}>{title}</Heading>}
                {topRightContent}
            </header>
        );
    }
    return (
        <header className={headerClasses}>
            {title && <Heading level={3}>{title}</Heading>}
            <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
            </div>
        </header>
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

    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                const activeEl = document.activeElement;
                if (activeEl?.hasAttribute('data-kg-link-input')) {
                    return;
                }
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
            }
        };
        document.addEventListener('keydown', handleEscapeKey);
        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [modal, dirty, afterClose, onCancel]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setAnimationFinished(true);
        }, 250);
        return () => clearTimeout(timeout);
    }, []);

    useEffect(() => {
        if (onOk) {
            const handleCMDS = (e: KeyboardEvent) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    onOk();
                }
            };
            if (enableCMDS) {
                window.addEventListener('keydown', handleCMDS);
                return () => {
                    window.removeEventListener('keydown', handleCMDS);
                };
            }
        }
    }, [onOk, enableCMDS]);

    const buttons: ButtonProps[] = [];
    if (!footer) {
        if (cancelLabel) {
            buttons.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: onCancel ? onCancel : () => removeModal(),
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

    const sizeConfig = getSizeConfig(size);
    const modalClasses = buildModalClasses({size, align, formSheet, animate, scrolling}, animationFinished);
    const backdropClasses = buildBackdropClasses({allowBackgroundInteraction});
    const headerClasses = buildHeaderClasses({topRightContent, stickyHeader});
    const contentClasses = buildContentClasses({padding, height, size}, sizeConfig);
    const modalStyles = buildModalStyles(width, height);

    const removeModal = useRemoveModal(modal, dirty, afterClose);

    const footerClasses = clsx(
        `${sizeConfig.padding} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    const footerContent = buildFooterContent({footer, stickyFooter}, buttons, footerClasses, leftButtonProps);

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
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
                {header === false ? '' : renderHeader({title, topRightContent, hideXOnMobile}, headerClasses, removeModal)}
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