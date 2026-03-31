```typescript
import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {useEffect, useState, forwardRef, useCallback} from 'react';
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

const MODAL_SIZE_CONFIG: Record<ModalSize, {maxWidth: string; backdropPadding: string; padding: string; headerInset: string}> = {
    sm: {maxWidth: 'max-w-[480px]', backdropPadding: 'p-4 md:p-[8vmin]', padding: 'p-8', headerInset: '-inset-x-8'},
    md: {maxWidth: 'max-w-[720px]', backdropPadding: 'p-4 md:p-[8vmin]', padding: 'p-8', headerInset: '-inset-x-8'},
    lg: {maxWidth: 'max-w-[1020px]', backdropPadding: 'p-4 md:p-[4vmin]', padding: 'p-7', headerInset: '-inset-x-8'},
    xl: {maxWidth: 'max-w-[1240px]', backdropPadding: 'p-4 md:p-[3vmin]', padding: 'p-10', headerInset: '-inset-x-10 -top-10'},
    full: {maxWidth: 'h-full', backdropPadding: 'p-4 md:p-[3vmin]', padding: 'p-10', headerInset: '-inset-x-10'},
    bleed: {maxWidth: 'h-full', backdropPadding: '', padding: 'p-10', headerInset: '-inset-x-10'}
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

    const removeModal = useCallback(() => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    }, [dirty, modal, afterClose]);

    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            const activeEl = document.activeElement;
            if (activeEl?.hasAttribute('data-kg-link-input')) return;

            if (document.activeElement instanceof HTMLElement) {
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
        };

        document.addEventListener('keydown', handleEscapeKey);
        return () => document.removeEventListener('keydown', handleEscapeKey);
    }, [onCancel, removeModal]);

    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

    useEffect(() => {
        if (!onOk || !enableCMDS) return;

        const handleCMDS = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                onOk();
            }
        };

        window.addEventListener('keydown', handleCMDS);
        return () => window.removeEventListener('keydown', handleCMDS);
    }, [onOk, enableCMDS]);

    const buildButtons = (): ButtonProps[] => {
        const buttons: ButtonProps[] = [];

        if (footer) return buttons;

        if (cancelLabel) {
            buttons.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: onCancel || removeModal,
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

    const getSizeConfig = () => MODAL_SIZE_CONFIG[size] || MODAL_SIZE_CONFIG.md;
    const sizeConfig = getSizeConfig();

    const buildModalClasses = (): string => {
        const baseClasses = 'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black';
        const alignClasses = {
            center: 'mx-auto',
            left: 'mr-auto',
            right: 'ml-auto'
        }[align];
        const roundedClass = size !== 'bleed' ? 'rounded' : '';
        const shadowClass = formSheet ? 'shadow-md' : 'shadow-xl';
        const animationClass = animate && !formSheet && !animationFinished
            ? align === 'right' ? 'animate-modal-in-from-right' : 'animate-modal-in'
            : formSheet && !animationFinished ? 'animate-modal-in-reverse' : '';
        const scrollClass = scrolling ? 'overflow-y-auto' : 'overflow-y-hidden';

        return clsx(baseClasses, alignClasses, roundedClass, shadowClass, animationClass, scrollClass, sizeConfig.maxWidth);
    };

    const buildBackdropClasses = (): string => {
        const baseClasses = 'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]';
        const pointerClass = allowBackgroundInteraction ? 'pointer-events-none' : '';
        const paddingClass = size === 'bleed' ? '' : sizeConfig.backdropPadding;

        return clsx(baseClasses, pointerClass, paddingClass, 'max-[800px]:!pb-20');
    };

    const buildHeaderClasses = (): string => {
        const baseClasses = (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5';
        const stickyClasses = stickyHeader ? 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black' : '';
        const paddingClass = padding ? sizeConfig.padding : 'p-0';

        return clsx(baseClasses, stickyClasses, paddingClass, 'pb-0', sizeConfig.headerInset);
    };

    const buildContentClasses = (): string => {
        const paddingClass = padding ? sizeConfig.padding : 'p-0';
        const growClass = (size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') ? 'grow' : '';

        return clsx(paddingClass, 'py-0', growClass);
    };

    const buildModalStyles = (): React.CSSProperties => {
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
    };

    const applyWidthClasses = (classes: string): string => {
        if (typeof width === 'number') return classes;
        if (width === 'full') return clsx(classes, 'w-full');
        if (width === 'toSidebar') return clsx(classes, 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]');
        return classes;
    };

    const applyHeightClasses = (classes: string): string => {
        if (typeof height === 'number') return classes;
        if (height === 'full') return clsx(classes, 'h-full');
        return classes;
    };

    const renderHeader = (): React.ReactNode => {
        if (header === false) return null;

        const headerClasses = buildHeaderClasses();
        const closeButtonClasses = `${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`;

        return (
            <header className={headerClasses}>
                {title && <Heading level={3}>{title}</Heading>}
                {!topRightContent || topRightContent === 'close' ? (
                    <div className={closeButtonClasses}>
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
                ) : (
                    topRightContent
                )}
            </header>
        );
    };

    const renderFooter = (): React.ReactNode => {
        if (footer === false) return null;

        if (footer) {
            return stickyFooter ? <StickyFooter height={84}>{footer}</StickyFooter> : footer;
        }

        const buttons = buildButtons();
        const footerClasses = clsx(
            padding ? sizeConfig.padding : 'p-0',
            stickyFooter ? 'py-6' : '',
            'flex w-full items-center justify-between'
        );

        const footerContent = (
            <div className={footerClasses}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons} />
                </div>
            </div>
        );

        return stickyFooter ? <StickyFooter height={84}>{footerContent}</StickyFooter> : footerContent;
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    let modalClasses = buildModalClasses();
    modalClasses = applyWidthClasses(modalClasses);
    modalClasses = applyHeightClasses(modalClasses);

    const backdropClasses = buildBackdropClasses();
    const contentClasses = buildContentClasses();
    const modalStyles = buildModalStyles();

    const backdropOverlayClasses = clsx(
        'pointer-events-none fixed inset-0 z-0',
        (backDrop && !formSheet) && topLevelBackdropClasses,
        formSheet && 'bg-[rgba(98,109,121,0.08)]'
    );

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={backdropOverlayClasses} />
            <section
                ref={ref}
                className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')}
                data-testid={testId}
                style={modalStyles}
            >
                {renderHeader()}
                <div className={contentClasses}>{children}</div>
                {renderFooter()}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;
```