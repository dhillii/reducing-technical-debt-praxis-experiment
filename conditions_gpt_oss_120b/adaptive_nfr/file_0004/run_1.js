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
    /**
     * Possible values are: `sm`, `md`, `lg`, `xl, `full`, `bleed`. Yu can also use any number to set an arbitrary width.
     */
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

type SizeConfig = {
    modalClass: string;
    backdropClass: string;
    paddingClass: string;
    headerClassAdd: string;
};

const sizeConfigMap: Record<ModalSize | 'default', SizeConfig> = {
    sm: {
        modalClass: 'max-w-[480px]',
        backdropClass: 'p-4 md:p-[8vmin]',
        paddingClass: 'p-8',
        headerClassAdd: '-inset-x-8'
    },
    md: {
        modalClass: 'max-w-[720px]',
        backdropClass: 'p-4 md:p-[8vmin]',
        paddingClass: 'p-8',
        headerClassAdd: '-inset-x-8'
    },
    lg: {
        modalClass: 'max-w-[1020px]',
        backdropClass: 'p-4 md:p-[4vmin]',
        paddingClass: 'p-7',
        headerClassAdd: '-inset-x-8'
    },
    xl: {
        modalClass: 'max-w-[1240px]0',
        backdropClass: 'p-4 md:p-[3vmin]',
        paddingClass: 'p-10',
        headerClassAdd: '-inset-x-10 -top-10'
    },
    full: {
        modalClass: 'h-full',
        backdropClass: 'p-4 md:p-[3vmin]',
        paddingClass: 'p-10',
        headerClassAdd: '-inset-x-10'
    },
    bleed: {
        modalClass: 'h-full',
        backdropClass: '',
        paddingClass: 'p-10',
        headerClassAdd: '-inset-x-10'
    },
    default: {
        modalClass: '',
        backdropClass: 'p-4 md:p-[8vmin]',
        paddingClass: 'p-8',
        headerClassAdd: '-inset-x-8'
    }
};

/**
 * Retrieves configuration for a given modal size.
 */
function getSizeConfig(size: ModalSize | undefined): SizeConfig {
    return sizeConfigMap[size ?? 'default'] ?? sizeConfigMap['default'];
}

/**
 * Determines if the modal should grow based on size/height props.
 */
function shouldGrow(size: ModalSize | undefined, height: 'full' | number | undefined): boolean {
    return (
        size === 'full' ||
        size === 'bleed' ||
        height === 'full' ||
        typeof height === 'number'
    );
}

/**
 * Returns the appropriate width styles for the modal.
 */
function getWidthStyles(width: 'full' | 'toSidebar' | number | undefined, modalClasses: string): {modalClasses: string; styles: {[key: string]: string}} {
    const styles: {[key: string]: string} = {};
    let updatedClasses = modalClasses;

    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = `${width}px`;
    } else if (width === 'full') {
        updatedClasses = clsx(updatedClasses, 'w-full');
    } else if (width === 'toSidebar') {
        updatedClasses = clsx(
            updatedClasses,
            'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
        );
    }

    return {modalClasses: updatedClasses, styles};
}

/**
 * Returns the appropriate height styles for the modal.
 */
function getHeightStyles(height: 'full' | number | undefined, modalClasses: string): {modalClasses: string; styles: {[key: string]: string}} {
    const styles: {[key: string]: string} = {};
    let updatedClasses = modalClasses;

    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        updatedClasses = clsx(updatedClasses, 'h-full');
    }

    return {modalClasses: updatedClasses, styles};
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
    });

    const buttons: ButtonProps[] = [];

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    if (!footer) {
        if (cancelLabel) {
            buttons.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: onCancel ? onCancel : removeModal,
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

    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );

    if (stickyHeader) {
        headerClasses = clsx(
            headerClasses,
            'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );
    }

    const {modalClass, backdropClass, paddingClass, headerClassAdd} = getSizeConfig(size);
    modalClasses = clsx(modalClasses, modalClass);
    if (backdropClass) {
        backdropClasses = clsx(backdropClasses, backdropClass);
    }
    let paddingClasses = paddingClass;
    headerClasses = clsx(headerClasses, headerClassAdd);

    if (!padding) {
        paddingClasses = 'p-0';
    }

    headerClasses = clsx(headerClasses, paddingClasses, 'pb-0');

    let contentClasses = clsx(paddingClasses, 'py-0');

    backdropClasses = clsx(backdropClasses, 'max-[800px]:!pb-20');

    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    contentClasses = clsx(
        contentClasses,
        shouldGrow(size, height) && 'grow'
    );

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const {modalClasses: widthAdjustedClasses, styles: widthStyles} = getWidthStyles(width, modalClasses);
    modalClasses = widthAdjustedClasses;

    const {modalClasses: heightAdjustedClasses, styles: heightStyles} = getHeightStyles(height, modalClasses);
    modalClasses = heightAdjustedClasses;

    const modalStyles: {[key: string]: string} = {...widthStyles, ...heightStyles};

    let footerContent;
    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        contentClasses = clsx(contentClasses, 'pb-0');
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

    footerContent = stickyFooter ? (
        <StickyFooter height={84}>
            {footerContent}
        </StickyFooter>
    ) : (
        <>{footerContent}</>
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
                {header === false ? '' : (!topRightContent || topRightContent === 'close' ? (
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
                ))}
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