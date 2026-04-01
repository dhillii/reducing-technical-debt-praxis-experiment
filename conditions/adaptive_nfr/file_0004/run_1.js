```typescript
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

/** Configuration for modal sizes with their styling properties */
interface SizeConfig {
    modalMaxWidth: string;
    backdropPadding: string;
    padding: string;
    headerInset: string;
}

/** Lookup table for modal size configurations */
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

/** Determines if modal should have full height */
const isFullHeight = (size: ModalSize): boolean => size === 'full' || size === 'bleed';

/** Determines if backdrop padding should be applied */
const shouldApplyBackdropPadding = (size: ModalSize): boolean => size !== 'bleed';

/** Determines if size config applies modal max-width class */
const shouldApplyModalMaxWidth = (size: ModalSize): boolean => size !== 'full' && size !== 'bleed';

/** Applies align-based classes to modal */
const getAlignClasses = (align: 'center' | 'left' | 'right'): string => {
    const alignMap: Record<string, string> = {
        center: 'mx-auto',
        left: 'mr-auto',
        right: 'ml-auto'
    };
    return alignMap[align] || '';
};

/** Applies animation classes based on conditions */
const getAnimationClasses = (animate: boolean, formSheet: boolean, animationFinished: boolean, align: 'center' | 'left' | 'right'): string => {
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

/** Applies form sheet animation classes */
const getFormSheetAnimationClasses = (formSheet: boolean, animationFinished: boolean): string => {
    return (formSheet && !animationFinished) ? 'animate-modal-in-reverse' : '';
};

/** Applies scroll behavior classes */
const getScrollClasses = (scrolling: boolean): string => {
    return scrolling ? 'overflow-y-auto' : 'overflow-y-hidden';
};

/** Applies shadow classes based on form sheet mode */
const getShadowClasses = (formSheet: boolean): string => {
    return formSheet ? 'shadow-md' : 'shadow-xl';
};

/** Applies border radius based on size */
const getBorderRadiusClasses = (size: ModalSize): string => {
    return size !== 'bleed' ? 'rounded' : '';
};

/** Applies width-specific modal classes */
const getWidthClasses = (width?: 'full' | 'toSidebar' | number): string => {
    if (width === 'full') {
        return 'w-full';
    }
    if (width === 'toSidebar') {
        return 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]';
    }
    return '';
};

/** Applies height-specific modal classes */
const getHeightClasses = (height?: 'full' | number): string => {
    return height === 'full' ? 'h-full' : '';
};

/** Determines if content should grow to fill available space */
const shouldContentGrow = (size: ModalSize, height?: 'full' | number): boolean => {
    return size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number';
};

/** Applies backdrop interaction classes */
const getBackdropInteractionClasses = (allowBackgroundInteraction: boolean): string => {
    return allowBackgroundInteraction ? 'pointer-events-none' : '';
};

/** Applies backdrop styling based on form sheet and backdrop settings */
const getBackdropStyleClasses = (backDrop: boolean, formSheet: boolean): string => {
    if (backDrop && !formSheet) {
        return topLevelBackdropClasses;
    }
    if (formSheet) {
        return 'bg-[rgba(98,109,121,0.08)]';
    }
    return '';
};

/** Applies header top right content layout classes */
const getHeaderLayoutClasses = (topRightContent?: 'close' | React.ReactNode): string => {
    return (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5';
};

/** Applies sticky header classes */
const getStickyHeaderClasses = (stickyHeader: boolean, baseClasses: string): string => {
    if (!stickyHeader) {
        return baseClasses;
    }
    return clsx(baseClasses, 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black');
};

/** Applies section pointer events based on background interaction */
const getSectionPointerClasses = (allowBackgroundInteraction: boolean): string => {
    return allowBackgroundInteraction ? 'pointer-events-auto' : '';
};

/** Determines if close button should be visible on mobile */
const getCloseButtonVisibilityClasses = (topRightContent?: 'close' | React.ReactNode, hideXOnMobile?: boolean): string => {
    const invisibleOnMd = topRightContent !== 'close' ? 'md:!invisible md:!hidden' : '';
    const hiddenOnMobile = hideXOnMobile ? 'hidden' : '';
    return `${invisibleOnMd} ${hiddenOnMobile}`;
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
                // Don't close modal if user is in Koenig's link input (which handles ESC itself)
                const activeEl = document.activeElement;
                if (activeEl?.hasAttribute('data-kg-link-input')) {
                    return;
                }

                // Fix for Safari - if an element in the modal is focused, closing it will jump to
                // the bottom of the page because Safari tries to focus the "next" element in the DOM
                if (document.activeElement && document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
                // Close the modal on the next tick so that the blur registers
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

                // Prevent the event from bubbling up to the window level
                event.stopPropagation();
            }
        };

        document.addEventListener('keydown', handleEscapeKey);

        // Clean up the event listener when the modal is closed
        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [modal, dirty, afterClose, onCancel]);

    // The animation classes apply a transform to the modal, which breaks anything inside using position:fixed
    // We should remove the class as soon as the animation is finished
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

    /** Builds button array for footer */
    const buildButtons = (): ButtonProps[] => {
        const buttonList: ButtonProps[] = [];

        if (!footer) {
            if (cancelLabel) {
                buttonList.push({
                    key: 'cancel-modal',
                    label: cancelLabel,
                    color: 'outline',
                    onClick: (onCancel ? onCancel : removeModal),
                    disabled: buttonsDisabled
                });
            }

            if (okLabel) {
                buttonList.push({
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

        return buttonList;
    };

    const buttons = buildButtons();

    // Get size configuration
    const sizeConfig = SIZE_CONFIG[size] || SIZE_CONFIG.default;

    // Build modal classes
    let modalClasses = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        getAlignClasses(align),
        getBorderRadiusClasses(size),
        getShadowClasses(formSheet),
        getAnimationClasses(animate, formSheet, animationFinished, align),
        getFormSheetAnimationClasses(formSheet, animationFinished),
        getScrollClasses(scrolling),
        shouldApplyModalMaxWidth(size) && sizeConfig.modalMaxWidth
    );

    // Build backdrop classes
    let backdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        getBackdropInteractionClasses(allowBackgroundInteraction),
        shouldApplyBackdropPadding(size) && sizeConfig.backdropPadding
    );

    // Build header classes
    let headerClasses = clsx(
        getHeaderLayoutClasses(topRightContent),
        getStickyHeaderClasses(stickyHeader, '')
    );

    let paddingClasses = padding ? sizeConfig.padding : 'p-0';

    headerClasses = clsx(
        headerClasses,
        paddingClasses,
        'pb-0',
        sizeConfig.headerInset
    );

    let contentClasses = clsx(
        paddingClasses,
        'py-0',
        shouldContentGrow(size, height) && 'grow'
    );

    // Set bottom padding for backdrop when the menu is on
    backdropClasses = clsx(