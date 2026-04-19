import { useModal } from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {
  useEffect,
  useState,
  forwardRef,
  useCallback,
} from 'react';
import useGlobalDirtyState from '../../hooks/use-global-dirty-state';
import { confirmIfDirty } from '../../utils/modals';
import Button, { ButtonColor, ButtonProps } from '../button';
import ButtonGroup from '../button-group';
import Heading from '../heading';
import StickyFooter from '../sticky-footer';

export type ModalSize =
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | 'full'
  | 'bleed';

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

export const topLevelBackdropClasses =
  'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

const useEscapeKey = (
  modal: any,
  dirty: boolean,
  afterClose: (() => void) | undefined,
  onCancel: (() => void) | undefined,
) => {
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
};

const useCMDS = (
  enableCMDS: boolean,
  onOk: (() => void) | undefined,
) => {
  useEffect(() => {
    if (!enableCMDS || !onOk) return;

    const handleCMDS = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        onOk();
      }
    };

    window.addEventListener('keydown', handleCMDS);
    return () => window.removeEventListener('keydown', handleCMDS);
  }, [enableCMDS, onOk]);
};

const buildModalClasses = (
  size: ModalSize,
  align: 'center' | 'left' | 'right',
  formSheet: boolean,
  animate: boolean,
  animationFinished: boolean,
  scrolling: boolean,
) => {
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
  );
};

const buildBackdropClasses = (
  allowBackgroundInteraction: boolean,
) => {
  return clsx(
    'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
    allowBackgroundInteraction && 'pointer-events-none',
  );
};

const buildHeaderClasses = (
  topRightContent: 'close' | React.ReactNode | undefined,
  stickyHeader: boolean,
  paddingClasses: string,
) => {
  let headerClasses = clsx(
    (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
  );

  if (stickyHeader) {
    headerClasses = clsx(
      headerClasses,
      'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
    );
  }

  return clsx(headerClasses, paddingClasses, 'pb-0');
};

const buildContentClasses = (
  paddingClasses: string,
  size: ModalSize,
  height: 'full' | number | undefined,
) => {
  let classes = clsx(paddingClasses, 'py-0');
  if (
    size === 'full' ||
    size === 'bleed' ||
    height === 'full' ||
    typeof height === 'number'
  ) {
    classes = clsx(classes, 'grow');
  }
  return classes;
};

const buildFooterClasses = (
  paddingClasses: string,
  stickyFooter: boolean,
) => {
  return clsx(
    `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
    'flex w-full items-center justify-between',
  );
};

const getFooterContent = (
  footer: boolean | React.ReactNode,
  buttons: ButtonProps[],
  leftButtonProps: ButtonProps | undefined,
  stickyFooter: boolean,
  footerClasses: string,
) => {
  let footerContent: React.ReactNode | null = null;

  if (footer) {
    footerContent = footer;
  } else if (footer === false) {
    // no footer
  } else {
    footerContent = (
      <div className={footerClasses}>
        <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
        <div className="flex gap-3">
          <ButtonGroup buttons={buttons} />
        </div>
      </div>
    );
  }

  return stickyFooter ? (
    <StickyFooter height={84}>{footerContent}</StickyFooter>
  ) : (
    <>{footerContent}</>
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
  allowBackgroundInteraction = false,
}, ref) => {
  const modal = useModal();
  const { setGlobalDirtyState } = useGlobalDirtyState();
  const [animationFinished, setAnimationFinished] = useState(false);

  useEffect(() => setGlobalDirtyState(dirty), [dirty, setGlobalDirtyState]);

  useEscapeKey(modal, dirty, afterClose, onCancel);
  useCMDS(enableCMDS, onOk);

  useEffect(() => {
    const timeout = setTimeout(() => setAnimationFinished(true), 250);
    return () => clearTimeout(timeout);
  }, []);

  const removeModal = useCallback(() => {
    confirmIfDirty(dirty, () => {
      modal.remove();
      afterClose?.();
    });
  }, [dirty, modal, afterClose]);

  const buttons: ButtonProps[] = [];
  if (!footer) {
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
  }

  const modalClasses = buildModalClasses(
    size,
    align,
    formSheet,
    animate,
    animationFinished,
    scrolling,
  );

  const backdropClasses = buildBackdropClasses(allowBackgroundInteraction);

  const paddingClasses = padding ? 'p-8' : 'p-0';

  const headerClasses = buildHeaderClasses(
    topRightContent,
    stickyHeader,
    paddingClasses,
  );

  const contentClasses = buildContentClasses(
    paddingClasses,
    size,
    height,
  );

  const footerClasses = buildFooterClasses(paddingClasses, stickyFooter);

  const footerContent = getFooterContent(
    footer,
    buttons,
    leftButtonProps,
    stickyFooter,
    footerClasses,
  );

  const modalStyles: Record<string, string> = {};

  if (typeof width === 'number') {
    modalStyles.width = '100%';
    modalStyles.maxWidth = `${width}px`;
  } else if (width === 'full') {
    modalClasses = clsx(modalClasses, 'w-full');
  } else if (width === 'toSidebar') {
    modalClasses = clsx(
      modalClasses,
      'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]',
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

  return (
    <div className={backdropClasses} id="modal-backdrop" onMouseDown={handleBackdropClick}>
      <div
        className={clsx(
          'pointer-events-none fixed inset-0 z-0',
          backDrop && !formSheet && topLevelBackdropClasses,
          formSheet && 'bg-[rgba(98,109,121,0.08)]',
        )}
      />
      <section
        ref={ref}
        className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')}
        data-testid={testId}
        style={modalStyles}
      >
        {header !== false && (
          <header className={headerClasses}>
            {title && <Heading level={3}>{title}</Heading>}
            {topRightContent === 'close' ? (
              <div
                className={`${hideXOnMobile && 'hidden'} absolute right-6 top-6`}
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
            ) : (
              topRightContent
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