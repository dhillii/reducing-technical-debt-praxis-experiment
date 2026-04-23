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

/** Configuration for each modal size variant */
interface SizeConfig {
    modalMaxWidth: string;
    backdropPadding: string;
    padding: string;
    headerInset: string;
    fullHeight?: boolean;
}

/** Lookup table for modal size configurations */
const SIZE_CONFIG: Record<ModalSize, SizeConfig> = {
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
        modalMaxWidth: '',
        backdropPadding: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10',
        fullHeight: true
    },
    bleed: {
        modalMaxWidth: '',
        backdropPadding: '',
        padding: 'p-10',
        headerInset: '-inset-x-10',
        fullHeight: true
    }
};

/** Get default size config for unknown sizes */
const getDefaultSizeConfig = (): SizeConfig => ({
    modalMaxWidth: '',
    backdropPadding: 'p-4 md:p-[8vmin]',
    padding: 'p-8',
    headerInset: '-inset-x-8'
});

/** Get size configuration, falling back to defaults */
const getSizeConfig = (size: ModalSize): SizeConfig => {
    return SIZE_CONFIG[size] || getDefaultSizeConfig();
};

/** Apply alignment classes to modal */
const getAlignmentClasses = (align: 'center' | 'left' | 'right'): string => {
    const alignMap: Record<string, string> = {
        center: 'mx-auto',
        left: 'mr-auto',
        right: 'ml-auto'
    };
    return alignMap[align] || '';
};

/** Determine animation class based on conditions */
const getAnimationClass = (animate: boolean, formSheet: boolean, animationFinished: boolean, align: 'center' | 'left' | 'right'): string => {
    if (!animate || formSheet || animationFinished) {
        return '';
    }
    if (align === 'right') {
        return 'animate-modal-in-from-right';
    }
    if (align === 'center') {
        return 'animate-modal-in';
    }
    return '';
};

/** Determine form sheet animation class */
const getFormSheetAnimationClass = (formSheet: boolean, animationFinished: boolean): string => {
    return (formSheet && !animationFinished) ? 'animate-modal-in-reverse' : '';
};

/** Build modal classes */
const buildModalClasses = (
    align: 'center' | 'left' | 'right',
    size: ModalSize,
    formSheet: boolean,
    animationFinished: boolean,
    animate: boolean,
    scrolling: boolean
): string => {
    const sizeConfig = getSizeConfig(size);
    const baseClasses = 'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black';
    const alignmentClass = getAlignmentClasses(align);
    const roundedClass = size !== 'bleed' ? 'rounded' : '';
    const shadowClass = formSheet ? 'shadow-md' : 'shadow-xl';
    const animationClass = getAnimationClass(animate, formSheet, animationFinished, align);
    const formSheetAnimationClass = getFormSheetAnimationClass(formSheet, animationFinished);
    const scrollClass = scrolling ? 'overflow-y-auto' : 'overflow-y-hidden';
    const maxWidthClass = sizeConfig.modalMaxWidth;
    const fullHeightClass = sizeConfig.fullHeight ? 'h-full' : '';

    return clsx(
        baseClasses,
        alignmentClass,
        roundedClass,
        shadowClass,
        animationClass,
        formSheetAnimationClass,
        scrollClass,
        maxWidthClass,
        fullHeightClass
    );
};

/** Build backdrop classes */
const buildBackdropClasses = (size: ModalSize, formSheet: boolean, allowBackgroundInteraction: boolean): string => {
    const sizeConfig = getSizeConfig(size);
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
    size: ModalSize,
    padding: boolean
): string => {
    const sizeConfig = getSizeConfig(size);
    const baseClasses = (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5';
    const stickyClass = stickyHeader ? 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black' : '';
    const paddingClass = padding ? sizeConfig.padding : 'p-0';
    const insetClass = sizeConfig.headerInset;

    return clsx(
        baseClasses,
        stickyClass,
        paddingClass,
        insetClass,
        'pb-0'
    );
};

/** Build content classes */
const buildContentClasses = (size: ModalSize, height: 'full' | number | undefined, padding: boolean): string => {
    const sizeConfig = getSizeConfig(size);
    const paddingClass = padding ? sizeConfig.padding : 'p-0';
    const growClass = (size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') ? 'grow' : '';

    return clsx(
        paddingClass,
        'py-0',
        growClass
    );
};

/** Build footer classes */
const buildFooterClasses = (size: ModalSize, stickyFooter: boolean, padding: boolean): string => {
    const sizeConfig = getSizeConfig(size);
    const paddingClass = padding ? sizeConfig.padding : 'p-0';
    const stickyClass = stickyFooter ? 'py-6' : '';

    return clsx(
        paddingClass,
        stickyClass,
        'flex w-full items-center justify-between'
    );
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
    modalClasses: string
): {classes: string; styles: {height?: string; maxHeight?: string}} => {
    const styles: {height?: string; maxHeight?: string} = {};

    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = height + 'px';
    } else if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

    return {classes: modalClasses, styles};
};

/** Check if should show close button */
const shouldShowCloseButton = (topRightContent: 'close' | React.ReactNode | undefined): boolean => {
    return !topRightContent || topRightContent === 'close';
};

/** Build button array for footer */
const buildButtonArray = (
    footer: boolean | React.ReactNode,
    cancelLabel: string | undefined,
    okLabel: string | undefined,
    okColor: ButtonColor,
    buttonsDisabled: boolean | undefined,
    okDisabled: boolean | undefined,
    okLoading: boolean,
    onCancel: (() => void) | undefined,
    removeModal: () => void,
    onOk: (() => void) | undefined
): ButtonProps[] => {
    const buttons: ButtonProps[] = [];

    if (!footer) {
        if (cancelLabel) {
            buttons.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: (onCancel ? onCancel : removeModal),
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

    const buttons = buildButtonArray(
        footer,
        cancelLabel,
        okLabel,
        okColor,
        buttonsDisabled,
        okDisabled,
        okLoading,
        onCancel,
        removeModal,
        onOk
    );

    let modalClasses = buildModalClasses(align, size, formSheet, animationFinished, animate, scrolling);
    let backdropClasses = buildBackdropClasses(size, formSheet, allowBackgroundInteraction);
    let headerClasses = buildHeaderClasses(topRightContent, stickyHeader, size, padding);
    let contentClasses = buildContentClasses(size, height, padding);
    const footerClasses = buildFooterClasses(size, stickyFooter, padding);

    const widthResult = applyWidthStyles(width, modalClasses);
    modalClasses = widthResult.classes;
    const modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string} = {...widthResult.styles};

    const heightResult = applyHeightStyles(height, modalClasses);
    modalClasses = heightResult.classes;
    Object.assign(modalStyles, heightResult.styles);

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

    const showCloseButton = shouldShowCloseButton(topRightContent);

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => {
            if (e.target === e.currentTarget && backDropClick) {
                removeModal();
            }
        }}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section ref={ref} className={clsx(
                modalClasses,
                allowBackgroundInteraction && 'pointer-events-auto'
            )} data-testid={testId} style={modalStyles}>
                {header === false ? '' : (showCloseButton ?
                    (<header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                            <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
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