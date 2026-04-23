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
    stickyHeader?: boolean;
    scrolling?: boolean;
    dirty?: boolean;
    animate?: boolean;
    formSheet?: boolean;
    enableCMDS?: boolean;
    allowBackgroundInteraction?: boolean;
}

export const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

// Helper: Build button array for modal footer
const buildModalButtons = (
    footer: boolean | React.ReactNode,
    cancelLabel: string | undefined,
    okLabel: string | undefined,
    okColor: ButtonColor,
    buttonsDisabled: boolean | undefined,
    okDisabled: boolean | undefined,
    okLoading: boolean,
    onCancel: (() => void) | undefined,
    onOk: (() => void) | undefined,
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
            onClick: onOk,
            disabled: buttonsDisabled || okDisabled,
            loading: okLoading
        });
    }

    return buttons;
};

// Helper: Get size-specific styling configuration
interface SizeConfig {
    modalMaxWidth: string;
    backdropPadding: string;
    padding: string;
    headerInset: string;
}

const getSizeConfig = (size: ModalSize): SizeConfig => {
    switch (size) {
    case 'sm':
        return {
            modalMaxWidth: 'max-w-[480px]',
            backdropPadding: 'p-4 md:p-[8vmin]',
            padding: 'p-8',
            headerInset: '-inset-x-8'
        };
    case 'md':
        return {
            modalMaxWidth: 'max-w-[720px]',
            backdropPadding: 'p-4 md:p-[8vmin]',
            padding: 'p-8',
            headerInset: '-inset-x-8'
        };
    case 'lg':
        return {
            modalMaxWidth: 'max-w-[1020px]',
            backdropPadding: 'p-4 md:p-[4vmin]',
            padding: 'p-7',
            headerInset: '-inset-x-8'
        };
    case 'xl':
        return {
            modalMaxWidth: 'max-w-[1240px]',
            backdropPadding: 'p-4 md:p-[3vmin]',
            padding: 'p-10',
            headerInset: '-inset-x-10 -top-10'
        };
    case 'full':
        return {
            modalMaxWidth: '',
            backdropPadding: 'p-4 md:p-[3vmin]',
            padding: 'p-10',
            headerInset: '-inset-x-10'
        };
    case 'bleed':
        return {
            modalMaxWidth: '',
            backdropPadding: '',
            padding: 'p-10',
            headerInset: '-inset-x-10'
        };
    default:
        return {
            modalMaxWidth: '',
            backdropPadding: 'p-4 md:p-[8vmin]',
            padding: 'p-8',
            headerInset: '-inset-x-8'
        };
    }
};

// Helper: Build modal classes based on props
const buildModalClasses = (
    size: ModalSize,
    align: 'center' | 'left' | 'right',
    formSheet: boolean,
    animate: boolean,
    animationFinished: boolean,
    scrolling: boolean,
    sizeConfig: SizeConfig
): string => {
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
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
        sizeConfig.modalMaxWidth,
        size === 'full' && 'h-full',
        size === 'bleed' && 'h-full'
    );
};

// Helper: Build backdrop classes
const buildBackdropClasses = (
    size: ModalSize,
    formSheet: boolean,
    allowBackgroundInteraction: boolean,
    sizeConfig: SizeConfig
): string => {
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        sizeConfig.backdropPadding,
        'max-[800px]:!pb-20'
    );
};

// Helper: Build header classes
const buildHeaderClasses = (
    topRightContent: 'close' | React.ReactNode | undefined,
    stickyHeader: boolean,
    sizeConfig: SizeConfig,
    paddingClasses: string
): string => {
    let classes = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );

    if (stickyHeader) {
        classes = clsx(
            classes,
            'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );
    }

    return clsx(
        classes,
        paddingClasses,
        'pb-0',
        sizeConfig.headerInset
    );
};

// Helper: Apply width styling to modal
const applyWidthStyling = (
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
        modalClasses = clsx(
            modalClasses,
            'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
        );
    }

    return {classes: modalClasses, styles};
};

// Helper: Apply height styling to modal
const applyHeightStyling = (
    height: 'full' | number | undefined,
    modalClasses: string,
    styles: {width?: string; maxWidth?: string}
): {classes: string; styles: {width?: string; maxWidth?: string; height?: string; maxHeight?: string}} => {
    const updatedStyles = {...styles};

    if (typeof height === 'number') {
        updatedStyles.height = '100%';
        updatedStyles.maxHeight = height + 'px';
    } else if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

    return {classes: modalClasses, styles: updatedStyles};
};

// Helper: Build footer content
const buildFooterContent = (
    footer: boolean | React.ReactNode,
    buttons: ButtonProps[],
    leftButtonProps: ButtonProps | undefined,
    footerClasses: string,
    stickyFooter: boolean
): React.ReactNode => {
    let footerContent: React.ReactNode;

    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        return null;
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

    return stickyFooter ? (
        <StickyFooter height={84}>
            {footerContent}
        </StickyFooter>
    ) : (
        <>{footerContent}</>
    );
};

// Helper: Handle escape key press
const setupEscapeKeyHandler = (
    modal: ReturnType<typeof useModal>,
    dirty: boolean,
    onCancel: (() => void) | undefined,
    afterClose: (() => void) | undefined,
    removeModal: () => void
): (() => void) => {
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
};

// Helper: Setup CMD+S keyboard shortcut
const setupCmdSHandler = (onOk: (() => void) | undefined, enableCMDS: boolean): (() => void) | null => {
    if (!onOk || !enableCMDS) {
        return null;
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
        const removeModal = () => {
            confirmIfDirty(dirty, () => {
                modal.remove();
                afterClose?.();
            });
        };

        return setupEscapeKeyHandler(modal, dirty, onCancel, afterClose, removeModal);
    }, [modal, dirty, afterClose, onCancel]);

    useEffect(() => {
        const cleanup = setupCmdSHandler(onOk, enableCMDS);
        return cleanup || undefined;
    }, [onOk, enableCMDS]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setAnimationFinished(true);
        }, 250);

        return () => clearTimeout(timeout);
    }, []);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const sizeConfig = getSizeConfig(size);
    const finalPaddingClasses = padding ? sizeConfig.padding : 'p-0';

    const buttons = buildModalButtons(
        footer,
        cancelLabel,
        okLabel,
        okColor,
        buttonsDisabled,
        okDisabled,
        okLoading,
        onCancel,
        onOk,
        removeModal
    );

    let modalClasses = buildModalClasses(
        size,
        align,
        formSheet,
        animate,
        animationFinished,
        scrolling,
        sizeConfig
    );

    let backdropClasses = buildBackdropClasses(
        size,
        formSheet,
        allowBackgroundInteraction,
        sizeConfig
    );

    const headerClasses = buildHeaderClasses(
        topRightContent,
        stickyHeader,
        sizeConfig,
        finalPaddingClasses
    );

    const {classes: widthStyledClasses, styles: widthStyles} = applyWidthStyling(width, modalClasses);
    const {classes: finalModalClasses, styles: finalModalStyles} = applyHeightStyling(height, widthStyledClasses, widthStyles);

    const contentClasses = clsx(
        finalPaddingClasses,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    const footerClasses = clsx(
        `${finalPaddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    let footerContent = buildFooterContent(footer, buttons, leftButtonProps, footerClasses, stickyFooter);
    if (footer === false) {
        footerContent = null;
    }

    const headerContent = header === false ? null : (!topRightContent || topRightContent === 'close' ?
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
        </header>)
    );

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section ref={ref} className={clsx(
                finalModalClasses,
                allowBackgroundInteraction && 'pointer-events-auto'
            )} data-testid={testId} style={finalModalStyles}>
                {headerContent}
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