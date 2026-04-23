import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {
    useEffect,
    useState,
    forwardRef,
    MouseEvent,
    KeyboardEvent,
    ReactNode,
    CSSProperties
} from 'react';
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
    footer?: boolean | ReactNode;
    header?: boolean;
    padding?: boolean;
    onOk?: () => void;
    onCancel?: () => void;
    topRightContent?: 'close' | ReactNode;
    hideXOnMobile?: boolean;
    afterClose?: () => void;
    children?: ReactNode;
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

export const topLevelBackdropClasses =
    'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

const useEscapeHandler = (
    onCancel: (() => void) | undefined,
    dirty: boolean,
    afterClose: (() => void) | undefined,
    modal: ReturnType<typeof useModal>
) => {
    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            const activeEl = document.activeElement as HTMLElement | null;
            if (activeEl?.hasAttribute('data-kg-link-input')) return;

            activeEl?.blur();

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
    }, [onCancel, dirty, afterClose, modal]);
};

const useCmdSaveHandler = (onOk: (() => void) | undefined, enableCMDS: boolean) => {
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
};

const getSizeConfig = (
    size: ModalSize | undefined,
    width: number | undefined,
    height: number | undefined
) => {
    const base = {
        modal: '',
        backdrop: '',
        padding: 'p-8',
        header: '-inset-x-8',
    };

    switch (size) {
        case 'sm':
            return {
                ...base,
                modal: 'max-w-[480px]',
                backdrop: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                header: '-inset-x-8',
            };
        case 'md':
            return {
                ...base,
                modal: 'max-w-[720px]',
                backdrop: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                header: '-inset-x-8',
            };
        case 'lg':
            return {
                ...base,
                modal: 'max-w-[1020px]',
                backdrop: 'p-4 md:p-[4vmin]',
                padding: 'p-7',
                header: '-inset-x-8',
            };
        case 'xl':
            return {
                ...base,
                modal: 'max-w-[1240px]0',
                backdrop: 'p-4 md:p-[3vmin]',
                padding: 'p-10',
                header: '-inset-x-10 -top-10',
            };
        case 'full':
            return {
                ...base,
                modal: 'h-full',
                backdrop: 'p-4 md:p-[3vmin]',
                padding: 'p-10',
                header: '-inset-x-10',
            };
        case 'bleed':
            return {
                ...base,
                modal: 'h-full',
                backdrop: '',
                padding: 'p-10',
                header: '-inset-x-10',
            };
        default:
            return {
                ...base,
                backdrop: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                header: '-inset-x-8',
            };
    }
};

const getModalClasses = ({
    align,
    size,
    formSheet,
    animate,
    animationFinished,
    scrolling,
}: {
    align: 'center' | 'left' | 'right';
    size: ModalSize | undefined;
    formSheet: boolean;
    animate: boolean;
    animationFinished: boolean;
    scrolling: boolean;
}) => {
    const base = [
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
    ];

    if (animate && !formSheet && !animationFinished) {
        if (align === 'center') base.push('animate-modal-in');
        else if (align === 'right') base.push('animate-modal-in-from-right');
    }

    if (formSheet && !animationFinished) base.push('animate-modal-in-reverse');

    return clsx(base);
};

const getBackdropClasses = (
    allowBackgroundInteraction: boolean,
    backDrop: boolean,
    formSheet: boolean
) => {
    const base = [
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
    ];
    if (backDrop && !formSheet) base.push(topLevelBackdropClasses);
    if (formSheet) base.push('bg-[rgba(98,109,121,0.08)]');
    return clsx(base);
};

const getHeaderClasses = (
    topRightContent: 'close' | ReactNode | undefined,
    stickyHeader: boolean,
    baseHeader: string
) => {
    const base = [
        !topRightContent || topRightContent === 'close' ? '' : 'flex items-center justify-between gap-5',
        baseHeader,
    ];
    if (stickyHeader) base.push('sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black');
    return clsx(base);
};

const getFooterContent = ({
    footer,
    cancelLabel,
    okLabel,
    okColor,
    okLoading,
    okDisabled,
    buttonsDisabled,
    leftButtonProps,
    onOk,
    onCancel,
    removeModal,
}: {
    footer: boolean | ReactNode | undefined;
    cancelLabel: string | undefined;
    okLabel: string | undefined;
    okColor: ButtonColor;
    okLoading: boolean;
    okDisabled: boolean | undefined;
    buttonsDisabled: boolean | undefined;
    leftButtonProps?: ButtonProps;
    onOk?: () => void;
    onCancel?: () => void;
    removeModal: () => void;
}) => {
    if (footer) return footer;
    if (footer === false) return null;

    const buttons: ButtonProps[] = [];

    if (cancelLabel) {
        buttons.push({
            key: 'cancel-modal',
            label: cancelLabel,
            color: 'outline',
            onClick: onCancel ?? removeModal,
            disabled: buttonsDisabled,
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
            loading: okLoading,
        });
    }

    return (
        <div className={clsx('flex w-full items-center justify-between')}>
            <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
            <div className="flex gap-3">
                <ButtonGroup buttons={buttons} />
            </div>
        </div>
    );
};

const Modal = forwardRef<HTMLElement, ModalProps>((props, ref) => {
    const {
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
        allowBackgroundInteraction = false,
    } = props;

    const modal = useModal();
    const {setGlobalDirtyState} = useGlobalDirtyState();
    const [animationFinished, setAnimationFinished] = useState(false);

    useEffect(() => setGlobalDirtyState(dirty), [dirty, setGlobalDirtyState]);

    useEffect(() => {
        const timer = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timer);
    }, []);

    useEscapeHandler(onCancel, dirty, afterClose, modal);
    useCmdSaveHandler(onOk, enableCMDS);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const sizeConfig = getSizeConfig(size, typeof width === 'number' ? width : undefined, typeof height === 'number' ? height : undefined);

    const modalClasses = getModalClasses({
        align,
        size,
        formSheet,
        animate,
        animationFinished,
        scrolling,
    });

    const backdropClasses = clsx(
        getBackdropClasses(allowBackgroundInteraction, backDrop, formSheet),
        sizeConfig.backdrop,
        'max-[800px]:!pb-20'
    );

    const headerClasses = getHeaderClasses(topRightContent, stickyHeader, clsx(sizeConfig.header, padding ? sizeConfig.padding : 'p-0'));

    const contentClasses = clsx(
        padding ? sizeConfig.padding : 'p-0',
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    const footerClasses = clsx(
        `${padding ? sizeConfig.padding : 'p-0'} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    const modalStyles: CSSProperties = {};

    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = `${width}px`;
    } else if (width === 'full') {
        modalClasses.concat('w-full');
    } else if (width === 'toSidebar') {
        modalClasses.concat(
            'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
        );
    }

    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        modalClasses.concat('h-full');
    }

    const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const footerContent = getFooterContent({
        footer,
        cancelLabel,
        okLabel,
        okColor,
        okLoading,
        okDisabled,
        buttonsDisabled,
        leftButtonProps,
        onOk,
        onCancel,
        removeModal,
    });

    const renderedFooter = stickyFooter ? (
        <StickyFooter height={84}>{footerContent}</StickyFooter>
    ) : (
        <>{footerContent}</>
    );

    return (
        <div className={backdropClasses} id="modal-backdrop" onMouseDown={handleBackdropClick}>
            <section
                ref={ref}
                className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')}
                data-testid={testId}
                style={modalStyles}
            >
                {header === false ? null : (
                    <header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        {topRightContent && topRightContent !== 'close' ? (
                            topRightContent
                        ) : (
                            <div
                                className={clsx(
                                    topRightContent !== 'close' && 'md:!invisible md:!hidden',
                                    hideXOnMobile && 'hidden',
                                    'absolute right-6 top-6'
                                )}
                            >
                                <Button
                                    className="-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100"
                                    icon="close"
                                    iconColorClass="text-black dark:text-white"
                                    size="sm"
                                    testId="close-modal"
                                    unstyled
                                    onClick={removeModal}
                                />
                            </div>
                        )}
                    </header>
                )}
                <div className={contentClasses}>{children}</div>
                {renderedFooter}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';
export default Modal;