import router, { useRouter } from 'next/router'
import {
  type FormEvent,
  Fragment,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Button } from '@keystar/ui/button'
import { AlertDialog, DialogContainer, DialogTrigger } from '@keystar/ui/dialog'
import { Icon } from '@keystar/ui/icon'
import { fileWarningIcon } from '@keystar/ui/icon/icons/fileWarningIcon'
import { Box, VStack } from '@keystar/ui/layout'
import { ProgressCircle } from '@keystar/ui/progress'
import { SlotProvider } from '@keystar/ui/slots'
import { toastQueue } from '@keystar/ui/toast'
import { Heading, Text } from '@keystar/ui/typography'

import { CombinedGraphQLErrors, gql, useMutation } from '../../../../admin-ui/apollo'
import { CreateButtonLink } from '../../../../admin-ui/components/CreateButtonLink'
import { ErrorDetailsDialog } from '../../../../admin-ui/components/Errors'
import { GraphQLErrorNotice } from '../../../../admin-ui/components/GraphQLErrorNotice'
import { PageContainer } from '../../../../admin-ui/components/PageContainer'
import { useList, useListItem } from '../../../../admin-ui/context'
import {
  deserializeItemToValue,
  Fields,
  serializeValueToOperationItem,
  useHasChanges,
  useInvalidFields,
} from '../../../../admin-ui/utils'
import type {
  ActionMeta,
  BaseListTypeInfo,
  ConditionalFilter,
  ConditionalFilterCase,
  ListMeta,
} from '../../../../types'
import { BaseToolbar, ColumnLayout, ItemPageHeader, StickySidebar } from './common'

type ItemPageProps = {
  listKey: string
}

/**
 * Returns a stable callback that always invokes the latest version of `callback`.
 */
function useEventCallback<Func extends (...args: any[]) => unknown>(callback: Func): Func {
  const callbackRef = useRef(callback)
  const cb = useCallback((...args: any[]) => {
    return callbackRef.current(...args)
  }, [])
  useEffect(() => {
    callbackRef.current = callback
  })
  return cb as any
}

/**
 * Renders a delete confirmation dialog with corrected spacing after the strong element.
 */
function DeleteButton({
  list,
  itemId,
  itemLabel,
}: {
  list: ListMeta
  itemId: string
  itemLabel: string
}) {
  const [errorDialogValue, setErrorDialogValue] = useState<Error | null>(null)
  const router = useRouter()
  const [deleteItem] = useMutation(
    gql`mutation ($id: ID!) {
      ${list.graphql.names.deleteMutationName}(where: { id: $id }) {
        id
      }
    }`,
    { variables: { id: itemId } }
  )

  return (
    <Fragment>
      <DialogTrigger>
        <Button tone="critical">Delete</Button>
        <AlertDialog
          tone="critical"
          title="Delete item"
          cancelLabel="Cancel"
          primaryActionLabel="Yes, delete"
          onPrimaryAction={async () => {
            try {
              await deleteItem()
            } catch (err: any) {
              toastQueue.critical('Unable to delete item', {
                actionLabel: 'Details',
                onAction: () => setErrorDialogValue(err),
                shouldCloseOnAction: true,
              })
              return
            }

            toastQueue.neutral(`${list.singular} deleted.`, {
              timeout: 5000,
            })
            router.push(list.isSingleton ? '/' : `/${list.path}`)
          }}
        >
          <Text>
            Are you sure you want to delete <strong style={{ fontWeight: 600 }}>{itemLabel}</strong>?
            This action cannot be undone.
          </Text>
        </AlertDialog>
      </DialogTrigger>

      <DialogContainer onDismiss={() => setErrorDialogValue(null)} isDismissable>
        {errorDialogValue && (
          <ErrorDetailsDialog title="Unable to delete item" error={errorDialogValue} />
        )}
      </DialogContainer>
    </Fragment>
  )
}

/**
 * Simple placeholder UI for when an item cannot be found.
 */
function ItemNotFound(props: PropsWithChildren) {
  return (
    <VStack
      alignItems="center"
      backgroundColor="surface"
      borderRadius="medium"
      gap="large"
      justifyContent="center"
      minHeight="scale.3000"
      padding="xlarge"
    >
      <Icon src={fileWarningIcon} color="neutralEmphasis" size="large" />
      <Heading align="center">Not found</Heading>
      <SlotProvider slots={{ text: { align: 'center', maxWidth: 'scale.5000' } }}>
        {props.children}
      </SlotProvider>
    </VStack>
  )
}

/**
 * Renders a reset confirmation dialog.
 */
function ResetButton(props: { onReset: () => void; hasChanges?: boolean }) {
  return (
    <DialogTrigger>
      <Button tone="accent" isDisabled={!props.hasChanges}>
        Reset
      </Button>
      <AlertDialog
        title="Reset changes"
        cancelLabel="Cancel"
        primaryActionLabel="Yes, reset"
        autoFocusButton="primary"
        onPrimaryAction={props.onReset}
      >
        Are you sure? Lost changes cannot be recovered.
      </AlertDialog>
    </DialogTrigger>
  )
}

/**
 * Form component for editing an item.
 */
function ItemForm({
  listKey,
  initialValue,
  itemLabel,
  onSaveSuccess,
  fieldModes,
  fieldPositions,
  isRequireds,
}: {
  listKey: string
  initialValue: Record<string, unknown>
  itemLabel: string
  onSaveSuccess: () => void
  fieldModes: Record<string, ConditionalFilter<'edit' | 'read' | 'hidden', BaseListTypeInfo>>
  isRequireds: Record<string, ConditionalFilterCase<BaseListTypeInfo>>
  fieldPositions: Record<string, 'form' | 'sidebar'>
}) {
  const list = useList(listKey)
  const itemId = initialValue.id as string
  const [updateError, setUpdateError] = useState<Error | null>(null)
  const [update, { loading, error }] = useMutation(
    gql`mutation ($id: ID!, $data: ${list.graphql.names.updateInputName}!) {
      item: ${list.graphql.names.updateMutationName}(where: { id: $id }, data: $data) {
        id
      }
    }`,
    { errorPolicy: 'all' }
  )

  const [value, setValue] = useState(() => initialValue)
  function resetValueState() {
    setValue(() => initialValue)
  }
  useEffect(() => resetValueState(), [initialValue])

  const invalidFields = useInvalidFields(list.fields, value, isRequireds)
  const [forceValidation, setForceValidation] = useState(false)
  const onSave = useEventCallback(async (e: FormEvent<HTMLFormElement>) => {
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    const newForceValidation = invalidFields.size !== 0
    setForceValidation(newForceValidation)
    if (newForceValidation) return

    const { error: _error } = await update({
      variables: {
        id: itemId,
        data: serializeValueToOperationItem('update', list.fields, value, initialValue),
      },
    })

    const error = CombinedGraphQLErrors.is(_error)
      ? _error.errors.find(x => x.path === undefined || x.path?.length === 1)
      : _error
    if (error) {
      toastQueue.critical('Unable to save item', {
        actionLabel: 'Details',
        onAction: () => setUpdateError(new Error(error.message)),
        shouldCloseOnAction: true,
      })
      return
    }

    toastQueue.positive(`Saved changes to ${list.singular.toLocaleLowerCase()}.`, {
      timeout: 5000,
    })

    onSaveSuccess()
  })

  const hasChangedFields = useHasChanges('update', list.fields, value, initialValue)

  return (
    <Fragment>
      <form onSubmit={onSave} style={{ display: 'contents' }}>
        {/*
          Workaround for react-aria "bug" where pressing enter in a form field
          moves focus to the submit button.
          See: https://github.com/adobe/react-spectrum/issues/5940
        */}
        <button type="submit" style={{ display: 'none' }} />
        <VStack gap="large" gridArea="main" marginTop="xlarge" minWidth={0}>
          <GraphQLErrorNotice
            errors={
              CombinedGraphQLErrors.is(error)
                ? error.errors.filter(x => x.path === undefined || x.path?.length === 1)
                : [error]
            }
          />
          <Fields
            view="itemView"
            position="form"
            fields={list.fields}
            groups={list.groups}
            forceValidation={forceValidation}
            invalidFields={invalidFields}
            fieldModes={fieldModes}
            fieldPositions={fieldPositions}
            onChange={useCallback(value => setValue(value), [setValue])}
            value={value}
            isRequireds={isRequireds}
          />
        </VStack>

        <StickySidebar>
          <Fields
            view="itemView"
            position="sidebar"
            fields={list.fields}
            groups={list.groups}
            forceValidation={forceValidation}
            invalidFields={invalidFields}
            onChange={useCallback(value => setValue(value), [setValue])}
            value={value}
            fieldModes={fieldModes}
            fieldPositions={fieldPositions}
            isRequireds={isRequireds}
          />
        </StickySidebar>

        <BaseToolbar>
          <Button
            isDisabled={!hasChangedFields}
            isPending={loading}
            prominence="high"
            type="submit"
          >
            Save
          </Button>
          <ResetButton hasChanges={hasChangedFields} onReset={resetValueState} />
          <Box flex />
          {!list.hideDelete ? (
            <DeleteButton list={list} itemId={itemId} itemLabel={itemLabel} />
          ) : null}
        </BaseToolbar>
      </form>

      <DialogContainer onDismiss={() => setUpdateError(null)} isDismissable>
        {updateError && <ErrorDetailsDialog title="Unable to save item" error={updateError} />}
      </DialogContainer>
    </Fragment>
  )
}

/**
 * Determines the appropriate not-found UI based on list configuration and item ID.
 */
function renderItemNotFound(list: ListMeta, itemId: string | undefined): JSX.Element {
  if (list.isSingleton) {
    if (itemId === '1') {
      return (
        <ItemNotFound>
          <Text>“{list.label}” doesn’t exist, or you don’t have access to it.</Text>
          {!list.hideCreate && <CreateButtonLink list={list} />}
        </ItemNotFound>
      )
    }
    return (
      <ItemNotFound>
        <Text>
          An item with ID <strong>“{itemId}”</strong> does not exist.
        </Text>
      </ItemNotFound>
    )
  }

  return (
    <ItemNotFound>
      <Text>
        The item with ID <strong>“{itemId}”</strong> doesn’t exist, or you don’t have
        access to it.
      </Text>
    </ItemNotFound>
  )
}

/**
 * Handles navigation after an action is performed.
 */
function handleActionNavigation(
  navigation: ActionMeta['itemView']['navigation'],
  resultId: string | null,
  itemId: string | undefined,
  list: ListMeta,
  router: ReturnType<typeof useRouter>,
  refetch: () => void
) {
  const navigationMap: Record<
    ActionMeta['itemView']['navigation'],
    () => void
  > = {
    follow: () => {
      if (resultId === itemId) {
        refetch()
      } else if (resultId) {
        router.push(`/${list.path}/${resultId}`)
      } else {
        router.push(list.isSingleton ? '/' : `/${list.path}`)
      }
    },
    refetch: () => {
      refetch()
    },
    // default fallback
    none: () => {
      router.push(list.isSingleton ? '/' : `/${list.path}`)
    },
  }

  const navigate = navigationMap[navigation] ?? navigationMap.none
  navigate()
}

/**
 * Page component for displaying a single item.
 */
export const getItemPage = (props: ItemPageProps) => () => <ItemPage {...props} />

function ItemPage({ listKey }: ItemPageProps) {
  const list = useList(listKey)
  const id_ = useRouter().query.id
  const [itemId] = Array.isArray(id_) ? id_ : [id_]
  const { data, error, loading, refetch } = useListItem(listKey, itemId ?? null)
  const item = data?.item
  const itemLabel_ = item?.[list.labelField] ?? item?.id
  const itemLabel = typeof itemLabel_ === 'string' ? itemLabel_ : (itemId ?? '')

  const pageLoading = loading || itemId === undefined
  const pageLabel = itemLabel || itemId
  const pageTitle = list.isSingleton || typeof pageLabel !== 'string' ? list.label : pageLabel
  const initialValue = useMemo(() => {
    if (!item) return null
    return deserializeItemToValue(list.fields, item)
  }, [list.fields, data?.item])

  const { actionsInContext, fieldModes, fieldPositions, isRequireds } = useMemo(() => {
    const actionModes = Object.fromEntries(
      Object.entries(list.actions).map(([k, v]) => [k, v.itemView.actionMode])
    )
    const fieldModes = Object.fromEntries(
      Object.entries(list.fields).map(([k, v]) => [k, v.itemView.fieldMode])
    )
    const fieldPositions = Object.fromEntries(
      Object.entries(list.fields).map(([k, v]) => [k, v.itemView.fieldPosition])
    )
    const isRequireds = Object.fromEntries(
      Object.entries(list.fields).map(([k, v]) => [k, v.itemView.isRequired])
    )
    for (const field of data?.keystone?.adminMeta?.list?.fields ?? []) {
      if (
        !field?.itemView ||
        !field.key ||
        !field.itemView.fieldMode ||
        !field.itemView.fieldPosition ||
        !field.itemView.isRequired
      )
        continue
      fieldModes[field.key] = field.itemView.fieldMode
      fieldPositions[field.key] = field.itemView.fieldPosition
      isRequireds[field.key] = field.itemView.isRequired
    }
    for (const action of data?.keystone?.adminMeta?.list?.actions ?? []) {
      if (!action?.itemView?.actionMode || !action.key) continue
      actionModes[action.key] = action.itemView.actionMode
    }

    const actionsInContext = list.actions
      .map(action => ({
        ...action,
        itemView: {
          ...action.itemView,
          actionMode: actionModes[action.key],
        },
      }))
      .filter(action => action.itemView.actionMode !== 'hidden')

    return {
      actionsInContext,
      fieldModes,
      fieldPositions,
      isRequireds,
    }
  }, [data?.keystone?.adminMeta, list.fields])

  function onAction(action: ActionMeta, resultId: string | null) {
    handleActionNavigation(
      action.itemView.navigation,
      resultId,
      itemId,
      list,
      router,
      refetch
    )
  }

  return (
    <PageContainer
      title={pageTitle}
      header={
        <ItemPageHeader
          list={list}
          actions={actionsInContext}
          label={typeof pageLabel !== 'string' ? 'Loading...' : pageLabel}
          title={pageTitle}
          item={item ?? null}
          onAction={onAction}
        />
      }
    >
      {pageLoading ? (
        <VStack height="100%" alignItems="center" justifyContent="center">
          <ProgressCircle aria-label="loading item data" size="large" isIndeterminate />
        </VStack>
      ) : (
        <ColumnLayout>
          <Box marginY="xlarge">
            <GraphQLErrorNotice errors={[error]} />
            {item == null && renderItemNotFound(list, itemId)}
          </Box>
          {initialValue && (
            <ItemForm
              fieldModes={fieldModes}
              fieldPositions={fieldPositions}
              isRequireds={isRequireds}
              listKey={listKey}
              itemLabel={itemLabel}
              initialValue={initialValue}
              onSaveSuccess={refetch}
            />
          )}
        </ColumnLayout>
      )}
    </PageContainer>
  )
}