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
     * Possible values are: `sm`, `md`, `lg`, `xl`, `full`, `bleed`. You can also use any number to set an arbitrary width.
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
    stickyHeader?: boolean;
    scrolling?: boolean;
    dirty?: boolean;
    animate?: boolean;
    formSheet?: boolean;
    enableCMDS?: boolean;
    allowBackgroundInteraction?: boolean;
}

export const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

// Size-based configuration map
const SIZE_CONFIG: Record<string, {
    modalClass?: string;
    backdropPadding?: string;
    padding: string;
    headerInset: string;
}> = {
    sm: {
        modalClass: 'max-w-[480px]',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    },
    md: {
        modalClass: 'max-w-[720px]',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    },
    lg: {
        modalClass: 'max-w-[1020px]',
        backdropPadding: 'p-4 md:p-[4vmin]',
        padding: 'p-7',
        headerInset: '-inset-x-8'
    },
    xl: {
        modalClass: 'max-w-[1240px]',
        backdropPadding: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10 -top-10'
    },
    full: {
        modalClass: 'h-full',
        backdropPadding: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10'
    },
    bleed: {
        modalClass: 'h-full',
        padding: 'p-10',
        headerInset: '-inset-x-10'
    },
    default: {
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    }
};

function useAnimationFinished() {
    const [animationFinished, setAnimationFinished] = useState(false);

    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

    return animationFinished;
}

function useEscapeKey({
    modal,
    dirty,
    afterClose,
    onCancel
}: {
    modal: ReturnType<typeof useModal>;
    dirty: boolean;
    afterClose?: () => void;
    onCancel?: () => void;
}) {
    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') {
                return;
            }

            const activeEl = document.activeElement;
            if (activeEl?.hasAttribute('data-kg-link-input')) {
                return;
            }

            if (activeEl instanceof HTMLElement) {
                activeEl.blur();
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

        document.addEventListener('keydown', handleEscapeKey);
        return () => document.removeEventListener('keydown', handleEscapeKey);
    }, [modal, dirty, afterClose, onCancel]);
}

function useCmdS(onOk?: () => void, enableCMDS?: boolean) {
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
        return () => window.removeEventListener('keydown', handleCMDS);
    });
}

function buildModalButtons({
    footer,
    cancelLabel,
    okLabel,
    okColor,
    okLoading,
    buttonsDisabled,
    okDisabled,
    onCancel,
    removeModal
}: {
    footer: ModalProps['footer'];
    cancelLabel?: string;
    okLabel?: string;
    okColor: ButtonColor;
    okLoading: boolean;
    buttonsDisabled?: boolean;
    okDisabled?: boolean;
    onCancel?: () => void;
    removeModal: () => void;
}): ButtonProps[] {
    if (footer) {
        return [];
    }

    const buttons: ButtonProps[] = [];

    if (cancelLabel) {
        buttons.push({
            key: 'cancel-modal',
            label: cancelLabel,
            color: 'outline',
            onClick: onCancel ?? removeModal,
            disabled: buttonsDisabled
        });
    }

    if (okLabel) {
        buttons.push({
            key: 'ok-modal',
            label: okLabel,
            color: okColor,
            className: 'min-w-[80px]',
            disabled: buttonsDisabled || okDisabled,
            loading: okLoading
        });
    }

    return buttons;
}

function buildModalStyles(
    width: ModalProps['width'],
    height: ModalProps['height']
): React.CSSProperties {
    const styles: React.CSSProperties = {};

    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = `${width}px`;
    }

    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = `${height}px`;
    }

    return styles;
}

function buildModalClasses({
    size,
    align,
    formSheet,
    animate,
    animationFinished,
    scrolling,
    width,
    height,
    allowBackgroundInteraction,
    sizeConfig
}: {
    size: ModalSize;
    align: string;
    formSheet: boolean;
    animate: boolean;
    animationFinished: boolean;
    scrolling: boolean;
    width: ModalProps['width'];
    height: ModalProps['height'];
    allowBackgroundInteraction: boolean;
    sizeConfig: typeof SIZE_CONFIG[string];
}) {
    return clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        animate && !formSheet && !animationFinished && align === 'center' && 'animate-modal-in',
        animate && !formSheet && !animationFinished && align === 'right' && 'animate-modal-in-from-right',
        formSheet && !animationFinished && 'animate-modal-in-reverse',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
        sizeConfig.modalClass,
        width === 'full' && 'w-full',
        width === 'toSidebar' && 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]',
        (height === 'full' || size === 'full' || size === 'bleed') && 'h-full',
        allowBackgroundInteraction && 'pointer-events-auto'
    );
}

function buildBackdropClasses(
    sizeConfig: typeof SIZE_CONFIG[string],
    allowBackgroundInteraction: boolean
) {
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        sizeConfig.backdropPadding,
        'max-[800px]:!pb-20',
        allowBackgroundInteraction && 'pointer-events-none'
    );
}

function buildHeaderClasses(
    topRightContent: ModalProps['topRightContent'],
    stickyHeader: boolean,
    paddingClasses: string,
    sizeConfig: typeof SIZE_CONFIG[string]
) {
    return clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
        sizeConfig.headerInset,
        paddingClasses,
        'pb-0'
    );
}

interface FooterContentProps {
    footer: ModalProps['footer'];
    footerClasses: string;
    leftButtonProps?: ButtonProps;
    buttons: ButtonProps[];
    onOk?: () => void;
    stickyFooter: boolean;
}

function FooterContent({footer, footerClasses, leftButtonProps, buttons, onOk, stickyFooter}: FooterContentProps) {
    let content: React.ReactNode = null;

    if (footer) {
        content = footer as React.ReactNode;
    } else if (footer !== false) {
        // Attach onOk to the ok button
        const buttonsWithHandler = buttons.map(btn =>
            btn.key === 'ok-modal' ? {...btn, onClick: onOk} : btn
        );

        content = (
            <div className={footerClasses}>
                <div>
                    {leftButtonProps && <Button {...leftButtonProps} />}
                </div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttonsWithHandler} />
                </div>
            </div>
        );
    }

    if (!content) {
        return null;
    }

    if (stickyFooter) {
        return <StickyFooter height={84}>{content}</StickyFooter>;
    }

    return <>{content}</>;
}

interface ModalHeaderProps {
    header: ModalProps['header'];
    title?: string;
    topRightContent: ModalProps['topRightContent'];
    hideXOnMobile: boolean;
    headerClasses: string;
    removeModal: () => void;
}

function ModalHeader({header, title, topRightContent, hideXOnMobile, headerClasses, removeModal}: ModalHeaderProps) {
    if (header === false) {
        return null;
    }

    const titleElement = title ? <Heading level={3}>{title}</Heading> : null;

    if (!topRightContent || topRightContent === 'close') {
        return (
            <header className={headerClasses}>
                {titleElement}
                <div className={clsx(
                    topRightContent !== 'close' && 'md:!invisible md:!hidden',
                    hideXOnMobile && 'hidden',
                    'absolute right-6 top-6'
                )}>
                    <Button
                        className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100'
                        icon='close'
                        iconColorClass='text-black dark:text-white'
                        size='sm'
                        testId='close-modal'
                        unstyled
                        onClick={removeModal}
                    />
                </div>
            </header>
        );
    }

    return (
        <header className={headerClasses}>
            {titleElement}
            {topRightContent}
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
    const animationFinished = useAnimationFinished();

    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    useEscapeKey({modal, dirty, afterClose, onCancel});
    useCmdS(onOk, enableCMDS);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const sizeConfig = SIZE_CONFIG[size] ?? SIZE_CONFIG.default;
    const paddingClasses = padding ? sizeConfig.padding : 'p-0';

    const modalClasses = buildModalClasses({
        size, align, formSheet, animate, animationFinished,
        scrolling, width, height, allowBackgroundInteraction, sizeConfig
    });

    const backdropClasses = buildBackdropClasses(sizeConfig, allowBackgroundInteraction);
    const headerClasses = buildHeaderClasses(topRightContent