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
    fullHeight?: boolean;
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
    },
    default: {
        modalMaxWidth: '',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    }
};

/** Get size configuration, falling back to default */
const getSizeConfig = (size: ModalSize | string): SizeConfig => {
    return SIZE_CONFIG[size as ModalSize] || SIZE_CONFIG.default;
};

/** Determine if modal should have full height */
const shouldHaveFullHeight = (size: ModalSize, height?: 'full' | number): boolean => {
    const config = getSizeConfig(size);
    return config.fullHeight === true || size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number';
};

/** Determine animation class based on conditions */
const getAnimationClass = (animate: boolean, formSheet: boolean, animationFinished: boolean, align: string): string => {
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

/** Determine alignment classes */
const getAlignmentClasses = (align: string): string => {
    switch (align) {
    case 'left':
        return 'mr-auto';
    case 'right':
        return 'ml-auto';
    case 'center':
    default:
        return 'mx-auto';
    }
};

/** Determine backdrop classes based on size */
const getBackdropClasses = (size: ModalSize, allowBackgroundInteraction: boolean, formSheet: boolean): string => {
    const config = getSizeConfig(size);
    const baseClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none'
    );

    if (size === 'bleed') {
        return baseClasses;
    }

    return clsx(baseClasses, config.backdropPadding);
};

/** Build button array from props */
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
        return {classes: modalClasses, styles};
    }

    if (width === 'full') {
        return {classes: clsx(modalClasses, 'w-full'), styles};
    }

    if (width === 'toSidebar') {
        return {
            classes: clsx(modalClasses, 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'),
            styles
        };
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
        return {classes: modalClasses, styles};
    }

    if (height === 'full') {
        return {classes: clsx(modalClasses, 'h-full'), styles};
    }

    return {classes: modalClasses, styles};
};

/** Render modal header based on topRightContent */
const renderHeader = (
    headerClasses: string,
    title: string | undefined,
    topRightContent: 'close' | React.ReactNode | undefined,
    hideXOnMobile: boolean,
    removeModal: () => void
): React.ReactNode => {
    const isCloseButton = !topRightContent || topRightContent === 'close';

    return (
        <header className={headerClasses}>
            {title && <Heading level={3}>{title}</Heading>}
            {isCloseButton ? (
                <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                    <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                </div>
            ) : (
                topRightContent
            )}
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

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

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
                        removeModal();
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
        if (!onOk || !enableCMDS) {
            return;
        }

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
    }, [onOk, enableCMDS]);

    const sizeConfig = getSizeConfig(size);
    let paddingClasses = padding ? sizeConfig.padding : 'p-0';

    let modalClasses = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        getAlignmentClasses(align),
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        getAnimationClass(animate, formSheet, animationFinished, align),
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
        sizeConfig.modalMaxWidth
    );

    if (size === 'full' || size === 'bleed') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

    let backdropClasses = getBackdropClasses(size, allowBackgroundInteraction, formSheet);

    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );

    if (stickyHeader) {
        headerClasses = clsx(
            headerClasses,
            'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );
    }

    headerClasses = clsx(
        headerClasses,
        paddingClasses,
        'pb-0',
        sizeConfig.headerInset
    );

    let contentClasses = clsx(
        paddingClasses,
        'py-0',
        shouldHaveFullHeight(size, height) && 'grow'
    );

    backdropClasses = clsx(
        backdropClasses,
        'max-[800px]:!pb-20'
    );

    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

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

    const widthResult