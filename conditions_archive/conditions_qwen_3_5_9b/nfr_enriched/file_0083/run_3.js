```typescript
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
            Are you sure you want to delete{' '}
            <strong style={{ fontWeight: 600 }}>{itemLabel}</strong>
            ? This action cannot be undone.
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

function computeFieldConfig(
  list: ListMeta,
  data?: { keystone?: { adminMeta?: { list?: { fields?: any[]; actions?: any[] } } } }
) {
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
}

function handleActionNavigation(
  action: ActionMeta,
  resultId: string | null,
  itemId: string | null,
  list: ListMeta,
  refetch: () => void
) {
  const { navigation } = action.itemView

  if ((navigation === 'follow' && resultId === itemId) || navigation === 'refetch') {
    refetch()
  } else if (navigation === 'follow' && resultId) {
    router.push(`/${list.path}/${resultId}`)
  } else {
    router.push(list.isSingleton ? '/' : `/${list.path}`)
  }
}

function computePageMetadata(
  loading: boolean,
  itemId: string | null,
  itemLabel: string | null,
  list: ListMeta
) {
  const pageLoading = loading || itemId === undefined
  const pageLabel = itemLabel || itemId
  const pageTitle = list.isSingleton || typeof pageLabel !== 'string' ? list.label : pageLabel

  return { pageLoading, pageLabel, pageTitle }
}

function computeInitialValue(
  item: any,
  list: ListMeta
): Record<string, unknown> | null {
  if (!item) return null
  return deserializeItemToValue(list.fields, item)
}

function getItemNotFoundContent(
  list: ListMeta,
  itemId: string | null,
  hideCreate: boolean
) {
  if (list.isSingleton) {
    if (itemId === '1') {
      return (
        <ItemNotFound>
          <Text>
            &ldquo;{list.label}&rdquo; doesn&apos;t exist, or you don&apos;t have access to it.
          </Text>
          {!hideCreate && <CreateButtonLink list={list} />}
        </ItemNotFound>
      )
    }
    return (
      <ItemNotFound>
        <Text>
          An item with ID{' '}
          <strong style={{ fontWeight: 600 }}>{`"${itemId}"`}</strong> does not exist.
        </Text>
      </ItemNotFound>
    )
  }
  return (
    <ItemNotFound>
      <Text>
        The item with ID{' '}
        <strong style={{ fontWeight: 600 }}>{`"${itemId}"`}</strong> doesn&apos;t exist, or you don&apos;t have
        access to it.
      </Text>
    </ItemNotFound>
  )
}

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

export const getItemPage = (props: ItemPageProps) => () => <ItemPage {...props} />

function ItemPage({ listKey }: ItemPageProps) {
  const list = useList(listKey)
  const id_ = useRouter().query.id
  const [itemId] = Array.isArray(id_) ? id_ : [id_]
  const { data, error, loading, refetch } = useListItem(listKey, itemId ?? null)
  const item = data?.item
  const itemLabel_ = item?.[list.labelField] ?? item?.id
  const itemLabel = typeof itemLabel_ === 'string' ? itemLabel_ : (itemId ?? '')

  const { pageLoading, pageLabel, pageTitle } = useMemo(
    () => computePageMetadata(loading, itemId, itemLabel, list),
    [loading, itemId, itemLabel, list]
  )

  const initialValue = useMemo(
    () => computeInitialValue(item, list),
    [item, list]
  )

  const { actionsInContext, fieldModes, fieldPositions, isRequireds } = useMemo(
    () => computeFieldConfig(list, data?.keystone?.adminMeta),
    [list, data?.keystone?.adminMeta]
  )

  function onAction(action: ActionMeta, resultId: string | null) {
    handleActionNavigation(action, resultId, itemId, list, refetch)
  }

  const notFoundContent = useMemo(
    () => getItemNotFoundContent(list, itemId, list.hideCreate),
    [list, itemId, list.hideCreate]
  )

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
            {item == null && notFoundContent}
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
          </Box>
        </ColumnLayout>
      )}
    </PageContainer>
  )
}
```