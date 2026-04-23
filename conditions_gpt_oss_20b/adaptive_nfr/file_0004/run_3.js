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

interface SizeConfig {
    modalMaxWidthClass?: string;
    backdropPaddingClass?: string;
    paddingClass?: string;
    headerInsetClass?: string;
}

const sizeConfigs: Record<string, SizeConfig> = {
    sm: {
        modalMaxWidthClass: 'max-w-[480px]',
        backdropPaddingClass: 'p-4 md:p-[8vmin]',
        paddingClass: 'p-8',
        headerInsetClass: '-inset-x-8',
    },
    md: {
        modalMaxWidthClass: 'max-w-[720px]',
        backdropPaddingClass: 'p-4 md:p-[8vmin]',
        paddingClass: 'p-8',
        headerInsetClass: '-inset-x-8',
    },
    lg: {
        modalMaxWidthClass: 'max-w-[1020px]',
        backdropPaddingClass: 'p-4 md:p-[4vmin]',
        paddingClass: 'p-7',
        headerInsetClass: '-inset-x-8',
    },
    xl: {
        modalMaxWidthClass: 'max-w-[1240px]0',
        backdropPaddingClass: 'p-4 md:p-[3vmin]',
        paddingClass: 'p-10',
        headerInsetClass: '-inset-x-10 -top-10',
    },
    full: {
        modalMaxWidthClass: 'h-full',
        backdropPaddingClass: 'p-4 md:p-[3vmin]',
        paddingClass: 'p-10',
        headerInsetClass: '-inset-x-10',
    },
    bleed: {
        modalMaxWidthClass: 'h-full',
        backdropPaddingClass: '',
        paddingClass: 'p-10',
        headerInsetClass: '-inset-x-10',
    },
};

const getSizeConfig = (size: string): SizeConfig => sizeConfigs[size] ?? sizeConfigs.md;

/**
 * Builds modal classes based on base classes, size config, and animation state.
 */
const buildModalClasses = (
    base: string,
    config: SizeConfig,
    options: {animate: boolean; formSheet: boolean; animationFinished: boolean; align: string; size: string}
): string => {
    const {animate, formSheet, animationFinished, align, size} = options;
    let classes = clsx(
        base,
        config.modalMaxWidthClass,
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        (animate && !formSheet && !animationFinished && align === 'center') && 'animate-modal-in',
        (animate && !formSheet && !animationFinished && align === 'right') && 'animate-modal-in-from-right',
        (formSheet && !animationFinished) && 'animate-modal-in-reverse',
        options.align === 'center' && 'overflow-y-auto',
        options.align !== 'center' && 'overflow-y-hidden'
    );
    return classes;
};

/**
 * Builds backdrop classes based on base classes and size config.
 */
const buildBackdropClasses = (base: string, config: SizeConfig, allowBackgroundInteraction: boolean): string => {
    return clsx(
        base,
        config.backdropPaddingClass,
        allowBackgroundInteraction && 'pointer-events-none',
        'max-[800px]:!pb-20'
    );
};

/**
 * Builds header classes based on base classes, size config, and sticky state.
 */
const buildHeaderClasses = (base: string, config: SizeConfig, stickyHeader: boolean): string => {
    let classes = clsx(
        base,
        config.headerInsetClass
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
 * Builds footer classes based on padding and sticky state.
 */
const buildFooterClasses = (paddingClass: string, stickyFooter: boolean): string => {
    return clsx(
        `${paddingClass} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );
};

/**
 * Builds modal styles based on width and height props.
 */
const buildModalStyles = (
    width: ModalProps['width'],
    height: ModalProps['height']
): {width?: string; height?: string; maxWidth?: string; maxHeight?: string} => {
    const styles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string} = {};
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

/**
 * Builds content classes based on padding, size, and height.
 */
const buildContentClasses = (
    paddingClass: string,
    size: ModalSize,
    height: ModalProps['height']
): string => {
    let classes = clsx(
        paddingClass,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );
    return classes;
};

/**
 * Builds footer content based on props.
 */
const buildFooterContent = (
    footer: ModalProps['footer'],
    footerClasses: string,
    buttons: ButtonProps[],
    leftButtonProps?: ButtonProps
): React.ReactNode => {
    let content: React.ReactNode;
    if (footer) {
        content = footer;
    } else if (footer === false) {
        content = null;
    } else {
        content = (
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
    return content;
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

    const config = getSizeConfig(size);

    const baseModalClasses = 'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black';
    const modalClasses = buildModalClasses(baseModalClasses, config, {
        animate,
        formSheet,
        animationFinished,
        align,
        size
    });

    const baseBackdropClasses = 'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]';
    const backdropClasses = buildBackdropClasses(baseBackdropClasses, config, allowBackgroundInteraction);

    const baseHeaderClasses = (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5';
    const headerClasses = buildHeaderClasses(baseHeaderClasses, config, stickyHeader);

    const paddingClass = padding ? config.paddingClass ?? 'p-8' : 'p-0';
    const footerClasses = buildFooterClasses(paddingClass, stickyFooter);
    const contentClasses = buildContentClasses(paddingClass, size, height);

    const modalStyles = buildModalStyles(width, height);
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

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const footerContent = buildFooterContent(footer, footerClasses, buttons, leftButtonProps);

    const finalFooter = stickyFooter ? (
        <StickyFooter height={84}>
            {footerContent}
        </StickyFooter>
    ) : (
        <>
            {footerContent}
        </>
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
                <div className={contentClasses}>
                    {children}
                </div>
                {finalFooter}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;