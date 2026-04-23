import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {useEffect, useState, forwardRef, useMemo} from 'react';
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

    useEffect(() => setGlobalDirtyState(dirty), [dirty, setGlobalDirtyState]);

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            const activeEl = document.activeElement;
            if (activeEl?.hasAttribute('data-kg-link-input')) return;
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            setTimeout(() => {
                if (onCancel) onCancel();
                else confirmIfDirty(dirty, () => { modal.remove(); afterClose?.(); });
            });
            event.stopPropagation();
        };
        document.addEventListener('keydown', handleEscapeKey);
        return () => document.removeEventListener('keydown', handleEscapeKey);
    }, [modal, dirty, afterClose, onCancel]);

    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

    useEffect(() => {
        if (!onOk) return;
        const handleCMDS = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                onOk();
            }
        };
        if (enableCMDS) {
            window.addEventListener('keydown', handleCMDS);
            return () => window.removeEventListener('keydown', handleCMDS);
        }
    }, [onOk, enableCMDS]);

    const removeModal = () => confirmIfDirty(dirty, () => { modal.remove(); afterClose?.(); });

    const buttons: ButtonProps[] = useMemo(() => {
        if (footer) return [];
        const arr: ButtonProps[] = [];
        if (cancelLabel) arr.push({
            key: 'cancel-modal',
            label: cancelLabel,
            color: 'outline',
            onClick: onCancel ?? removeModal,
            disabled: buttonsDisabled
        });
        if (okLabel) arr.push({
            key: 'ok-modal',
            label: okLabel,
            color: okColor,
            className: 'min-w-[80px]',
            onClick: onOk,
            disabled: buttonsDisabled || okDisabled,
            loading: okLoading
        });
        return arr;
    }, [footer, cancelLabel, okLabel, onCancel, onOk, okColor, okLoading, buttonsDisabled, okDisabled]);

    const {
        modalClasses,
        backdropClasses,
        paddingClasses,
        headerClasses,
        contentClasses,
        footerClasses
    } = useMemo(() => {
        let modalCls = clsx(
            'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
            align === 'center' && 'mx-auto',
            align === 'left' && 'mr-auto',
            align === 'right' && 'ml-auto',
            size !== 'bleed' && 'rounded',
            formSheet ? 'shadow-md' : 'shadow-xl',
            animate && !formSheet && !animationFinished && align === 'center' && 'animate-modal-in',
            animate && !formSheet && !animationFinished && align === 'right' && 'animate-modal-in-from-right',
            formSheet && !animationFinished && 'animate-modal-in-reverse',
            scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
        );

        let backdropCls = clsx(
            'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
            allowBackgroundInteraction && 'pointer-events-none'
        );

        let padCls = '';
        let headCls = clsx(
            (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
        );

        if (stickyHeader) {
            headCls = clsx(headCls, 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black');
        }

        const sizeMap: Record<ModalSize, {modal: string; backdrop: string; padding: string; header: string}> = {
            sm: {modal: 'max-w-[480px]', backdrop: 'p-4 md:p-[8vmin]', padding: 'p-8', header: '-inset-x-8'},
            md: {modal: 'max-w-[720px]', backdrop: 'p-4 md:p-[8vmin]', padding: 'p-8', header: '-inset-x-8'},
            lg: {modal: 'max-w-[1020px]', backdrop: 'p-4 md:p-[4vmin]', padding: 'p-7', header: '-inset-x-8'},
            xl: {modal: 'max-w-[1240px]', backdrop: 'p-4 md:p-[3vmin]', padding: 'p-10', header: '-inset-x-10 -top-10'},
            full: {modal: 'h-full', backdrop: 'p-4 md:p-[3vmin]', padding: 'p-10', header: '-inset-x-10'},
            bleed: {modal: 'h-full', backdrop: '', padding: 'p-10', header: '-inset-x-10'}
        };

        const {modal: sizeModal, backdrop: sizeBackdrop, padding: sizePadding, header: sizeHeader} = sizeMap[size] ?? sizeMap.md;

        modalCls = clsx(modalCls, sizeModal);
        backdropCls = clsx(backdropCls, sizeBackdrop);
        padCls = sizePadding;
        headCls = clsx(headCls, sizeHeader);

        if (!padding) padCls = 'p-0';

        modalCls = clsx(modalCls);
        headCls = clsx(headCls, padCls, 'pb-0');
        const contCls = clsx(padCls, 'py-0', ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow'));
        const footCls = clsx(`${padCls} ${stickyFooter ? 'py-6' : ''}`, 'flex w-full items-center justify-between');

        backdropCls = clsx(backdropCls, 'max-[800px]:!pb-20');

        return {
            modalClasses: modalCls,
            backdropClasses: backdropCls,
            paddingClasses: padCls,
            headerClasses: headCls,
            contentClasses: contCls,
            footerClasses: footCls
        };
    }, [size, align, formSheet, animate, animationFinished, scrolling, allowBackgroundInteraction, stickyHeader, stickyFooter, padding, topRightContent, height]);

    const modalStyles: Record<string, string> = useMemo(() => {
        const styles: Record<string, string> = {};
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
    }, [width, height]);

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) removeModal();
    };

    let footerContent: React.ReactNode;
    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        footerContent = null;
    } else {
        footerContent = (
            <div className={footerClasses}>
                <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
                <div className='flex gap-3'><ButtonGroup buttons={buttons} /></div>
            </div>
        );
    }

    footerContent = stickyFooter
        ? <StickyFooter height={84}>{footerContent}</StickyFooter>
        : <>{footerContent}</>;

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                backDrop && !formSheet && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )} />
            <section ref={ref} className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')} data-testid={testId} style={modalStyles}>
                {header !== false && (
                    <header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        {topRightContent === 'close' ? (
                            <div className={`${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                                <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                            </div>
                        ) : (
                            <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                                {topRightContent}
                            </div>
                        )}
                    </header>
                )}
                <div className={contentClasses}>{children}</div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;