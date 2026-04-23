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

/** Configuration for modal sizes */
interface SizeConfig {
    modalMaxWidth: string;
    backdropPadding: string;
    padding: string;
    headerInset: string;
}

/** Size configuration lookup table */
const SIZE_CONFIG: Record<ModalSize | 'default', SizeConfig> = {
    sm: {
        modalMaxWidth: 'max-w-[480px]',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    },
    md: {
        modalMaxWidth: 'max-w-[720px]',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    },
    lg: {
        modalMaxWidth: 'max-w-[1020px]',
        backdropPadding: 'p-4 md:p-[4vmin]',
        padding: 'p-7',
        headerInset: '-inset-x-8'
    },
    xl: {
        modalMaxWidth: 'max-w-[1240px]0',
        backdropPadding: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10 -top-10'
    },
    full: {
        modalMaxWidth: 'h-full',
        backdropPadding: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10'
    },
    bleed: {
        modalMaxWidth: 'h-full',
        backdropPadding: '',
        padding: 'p-10',
        headerInset: '-inset-x-10'
    },
    default: {
        modalMaxWidth: '',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    }
};

/** Get size configuration for modal */
const getSizeConfig = (size: ModalSize): SizeConfig => {
    return SIZE_CONFIG[size] || SIZE_CONFIG.default;
};

/** Check if element is a Koenig link input */
const isKoenigLinkInput = (element: Element | null): boolean => {
    return element?.hasAttribute('data-kg-link-input') ?? false;
};

/** Blur active element safely */
const blurActiveElement = (): void => {
    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
};

/** Check if size requires full height */
const isFullHeightSize = (size: ModalSize): boolean => {
    return size === 'full' || size === 'bleed';
};

/** Check if content should grow */
const shouldContentGrow = (size: ModalSize, height?: 'full' | number): boolean => {
    return isFullHeightSize(size) || height === 'full' || typeof height === 'number';
};

/** Build modal classes based on alignment and animation state */
const buildModalClasses = (
    align: string,
    size: ModalSize,
    formSheet: boolean,
    animate: boolean,
    animationFinished: boolean,
    scrolling: boolean,
    sizeConfig: SizeConfig
): string => {
    const baseClasses = 'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black';
    const alignClass = align === 'center' ? 'mx-auto' : align === 'left' ? 'mr-auto' : 'ml-auto';
    const roundedClass = size !== 'bleed' ? 'rounded' : '';
    const shadowClass = formSheet ? 'shadow-md' : 'shadow-xl';
    const scrollClass = scrolling ? 'overflow-y-auto' : 'overflow-y-hidden';
    
    let animationClass = '';
    if (animate && !formSheet && !animationFinished) {
        animationClass = align === 'right' ? 'animate-modal-in-from-right' : 'animate-modal-in';
    }
    if (formSheet && !animationFinished) {
        animationClass = 'animate-modal-in-reverse';
    }

    return clsx(
        baseClasses,
        alignClass,
        roundedClass,
        shadowClass,
        animationClass,
        scrollClass,
        sizeConfig.modalMaxWidth
    );
};

/** Build backdrop classes */
const buildBackdropClasses = (
    allowBackgroundInteraction: boolean,
    formSheet: boolean,
    backDrop: boolean,
    sizeConfig: SizeConfig
): string => {
    const baseClasses = 'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]';
    const pointerClass = allowBackgroundInteraction ? 'pointer-events-none' : '';
    const paddingClass = sizeConfig.backdropPadding;

    return clsx(
        baseClasses,
        pointerClass,
        paddingClass,
        'max-[800px]:!pb-20'
    );
};

/** Build header classes */
const buildHeaderClasses = (
    topRightContent: 'close' | React.ReactNode | undefined,
    stickyHeader: boolean,
    paddingClasses: string,
    sizeConfig: SizeConfig
): string => {
    const baseClass = (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5';
    const stickyClass = stickyHeader ? 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black' : '';

    return clsx(
        baseClass,
        stickyClass,
        sizeConfig.headerInset,
        paddingClasses,
        'pb-0'
    );
};

/** Build button array for footer */
const buildButtons = (
    footer: boolean | React.ReactNode,
    cancelLabel: string | undefined,
    okLabel: string | undefined,
    okColor: ButtonColor,
    buttonsDisabled: boolean | undefined,
    okDisabled: boolean | undefined,
    okLoading: boolean,
    onCancel: (() => void) | undefined,
    removeModal: () => void
): ButtonProps[] => {
    if (footer) {
        return [];
    }

    const buttons: ButtonProps[] = [];

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
            onClick: onCancel,
            disabled: buttonsDisabled || okDisabled,
            loading: okLoading
        });
    }

    return buttons;
};

/** Apply width styles to modal */
const applyWidthStyles = (
    width: 'full' | 'toSidebar' | number | undefined,
    modalClasses: string
): {classes: string; styles: {width?: string; maxWidth?: string}} => {
    const styles: {width?: string; maxWidth?: string} = {};

    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = width + 'px';
    } else if (width === 'full') {
        modalClasses = clsx(modalClasses, 'w-full');
    } else if (width === 'toSidebar') {
        modalClasses = clsx(modalClasses, 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]');
    }

    return {classes: modalClasses, styles};
};

/** Apply height styles to modal */
const applyHeightStyles = (
    height: 'full' | number | undefined,
    modalClasses: string,
    styles: {width?: string; maxWidth?: string}
): {classes: string; styles: {width?: string; maxWidth?: string; height?: string; maxHeight?: string}} => {
    const updatedStyles = {...styles} as {width?: string; maxWidth?: string; height?: string; maxHeight?: string};

    if (typeof height === 'number') {
        updatedStyles.height = '100%';
        updatedStyles.maxHeight = height + 'px';
    } else if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

    return {classes: modalClasses, styles: updatedStyles};
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
                if (isKoenigLinkInput(document.activeElement)) {
                    return;
                }

                blurActiveElement();

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
        if (onOk && enableCMDS) {
            const handleCMDS = (e: KeyboardEvent) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    onOk();
                }
            };
            window.addEventListener('keydown', handleCMDS);
            return () => {
                window.removeEventListener('keydown', handleCMDS);
            };
        }
    }, [onOk, enableCMDS]);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const sizeConfig = getSizeConfig(size);
    let paddingClasses = padding ? sizeConfig.padding : 'p-0';

    const buttons = buildButtons(
        footer,
        cancelLabel,
        okLabel,
        okColor,
        buttonsDisabled,
        okDisabled,
        okLoading,
        onCancel,
        removeModal
    );

    let modalClasses = buildModalClasses(
        align,
        size,
        formSheet,
        animate,
        animationFinished,
        scrolling,
        sizeConfig
    );

    let backdropClasses = buildBackdropClasses(
        allowBackgroundInteraction,
        formSheet,
        backDrop,
        sizeConfig
    );

    let headerClasses = buildHeaderClasses(
        topRightContent,
        stickyHeader,
        paddingClasses,
        sizeConfig
    );

    let contentClasses = clsx(
        paddingClasses,
        'py-0',
        shouldContentGrow(size, height) && 'grow'
    );

    const {classes: widthAppliedClasses, styles: widthStyles} = applyWidthStyles(width, modalClasses);
    const {classes: finalModalClasses, styles: finalStyles} = applyHeightStyles(height, widthAppliedClasses, widthStyles);

    modalClasses = finalModalClasses;
    const modalStyles = finalStyles;

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

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

    footerContent = (stickyFooter ?
        <StickyFooter height={84}>
            {footerContent}
        </StickyFooter>
        :
        <>
            {footerContent}
        </>
    );

    const renderHeader = () => {
        if (header === false) {
            return '';
        }

        const showCloseButton = !topRightContent || topRightContent === 'close';

        if (showCloseButton) {
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
                {renderHeader()}
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