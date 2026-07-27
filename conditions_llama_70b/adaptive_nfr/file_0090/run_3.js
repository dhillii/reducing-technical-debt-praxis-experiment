// Define a type for the schema kinds
type SchemaKind = 'child' | 'relationship' | 'form' | 'conditional' | 'object' | 'array';

// Define a type for the schema
type Schema = {
  kind: SchemaKind;
  [key: string]: any;
};

// Define a type for the visitor function
type Visitor = (schema: Schema, value: unknown, path: ReadonlyPropPath) => void;

// Define a type for the prop path
type ReadonlyPropPath = readonly (string | number)[];

// Define a type for the document features
type DocumentFeatures = {
  [key: string]: any;
};

// Define a type for the child field options
type ChildFieldOptions = {
  [key: string]: any;
};

// Define a type for the component schema
type ComponentSchema = {
  kind: SchemaKind;
  [key: string]: any;
};

// Define a type for the document features for child field
type DocumentFeaturesForChildField = {
  kind: 'inline' | 'block';
  [key: string]: any;
};

// Define a type for the path to child field with options
type PathToChildFieldWithOption = {
  path: ReadonlyPropPath;
  options: ChildFieldOptions;
};

// Define a function to find child prop paths for prop
function findChildPropPathsForProp(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const handlers: { [key in SchemaKind]: (value: any, schema: ComponentSchema, path: ReadonlyPropPath) => PathToChildFieldWithOption[] } = {
    form: () => [],
    relationship: () => [],
    child: () => [{ path, options: schema.options }],
    conditional: (value, schema, path) =>
      findChildPropPathsForProp(
        value.value,
        schema.values[value.discriminant],
        path.concat('value')
      ),
    object: (value, schema, path) => {
      const paths: PathToChildFieldWithOption[] = [];
      Object.keys(schema.fields).forEach((key) =>
        paths.push(...findChildPropPathsForProp(value[key], schema.fields[key], path.concat(key)))
      );
      return paths;
    },
    array: (value, schema, path) => {
      const paths: PathToChildFieldWithOption[] = [];
      (value as any[]).forEach((val, i) =>
        paths.push(...findChildPropPathsForProp(val, schema.element, path.concat(i)))
      );
      return paths;
    },
  };

  return handlers[schema.kind](value, schema, path);
}

// Define a function to find child prop paths
function findChildPropPaths(
  value: Record<string, any>,
  props: Record<string, ComponentSchema>
): { path: ReadonlyPropPath | undefined; options: ChildFieldOptions }[] {
  const propPaths = findChildPropPathsForProp(value, { kind: 'object', fields: props }, []);
  if (propPaths.length) return propPaths;

  return [
    {
      path: undefined,
      options: { kind: 'inline', placeholder: '' },
    },
  ];
}

// Define a function to get document features for child field
function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildFieldOptions
): DocumentFeaturesForChildField {
  const inlineMarksFromOptions = options.formatting?.inlineMarks;

  const inlineMarks =
    inlineMarksFromOptions === 'inherit'
      ? 'inherit'
      : (Object.fromEntries(
          Object.keys(editorDocumentFeatures.formatting.inlineMarks).map((mark) => {
            return [mark as Mark, !!(inlineMarksFromOptions || {})[mark as Mark]];
          })
        ) as Record<Mark, boolean>);

  if (options.kind === 'inline') {
    return {
      kind: 'inline',
      inlineMarks,
      documentFeatures: {
        links: options.links === 'inherit',
        relationships: options.relationships === 'inherit',
      },
      softBreaks: options.formatting?.softBreaks === 'inherit',
    };
  }

  return {
    kind: 'block',
    inlineMarks,
    softBreaks: options.formatting?.softBreaks === 'inherit',
    documentFeatures: {
      layouts: [],
      dividers: options.dividers === 'inherit' ? editorDocumentFeatures.dividers : false,
      formatting: {
        alignment:
          options.formatting?.alignment === 'inherit'
            ? editorDocumentFeatures.formatting.alignment
            : {
                center: false,
                end: false,
              },
        blockTypes:
          options.formatting?.blockTypes === 'inherit'
            ? editorDocumentFeatures.formatting.blockTypes
            : {
                blockquote: false,
                code: false,
              },
        headingLevels:
          options.formatting?.headingLevels === 'inherit'
            ? editorDocumentFeatures.formatting.headingLevels
            : options.formatting?.headingLevels || [],
        listTypes:
          options.formatting?.listTypes === 'inherit'
            ? editorDocumentFeatures.formatting.listTypes
            : {
                ordered: false,
                unordered: false,
              },
      },
      links: options.links === 'inherit',
      relationships: options.relationships === 'inherit',
    },
    componentBlocks: options.componentBlocks === 'inherit',
  };
}

// Define a function to get schema at prop path
function getSchemaAtPropPath(
  path: ReadonlyPropPath,
  value: Record<string, unknown>,
  props: Record<string, ComponentSchema>
): undefined | ComponentSchema {
  const handlers: { [key in SchemaKind]: (path: ReadonlyPropPath, value: unknown, schema: ComponentSchema) => undefined | ComponentSchema } = {
    child: () => undefined,
    form: () => undefined,
    relationship: () => undefined,
    conditional: (path, value, schema) => {
      const key = path.shift();
      if (key === 'discriminant') return getSchemaAtPropPath(path, (value as any).discriminant, schema.discriminant);
      if (key === 'value') return getSchemaAtPropPath(path, (value as any).value, schema.values[(value as any).discriminant]);
      return undefined;
    },
    object: (path, value, schema) => {
      const key = path.shift();
      return getSchemaAtPropPath(path, (value as any)[key], schema.fields[key]);
    },
    array: (path, value, schema) => {
      const index = path.shift();
      return getSchemaAtPropPath(path, (value as any)[index], schema.element);
    },
  };

  return handlers[props.kind](path, value, props);
}

// Define a function to client side validate prop
function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  const handlers: { [key in SchemaKind]: (schema: ComponentSchema, value: unknown) => boolean } = {
    child: () => true,
    relationship: () => true,
    form: (schema, value) => schema.validate(value),
    conditional: (schema, value) => {
      if (!('discriminant' in value) || !('value' in value)) return false;
      if (!schema.discriminant.validate(value.discriminant)) return false;
      return clientSideValidateProp(
        schema.values[(value as any).discriminant as string],
        (value as any).value
      );
    },
    object: (schema, value) => {
      for (const [key, childProp] of Object.entries(schema.fields)) {
        if (!clientSideValidateProp(childProp, (value as any)[key])) return false;
      }
      return true;
    },
    array: (schema, value) => {
      if (!Array.isArray(value)) return false;
      for (const innerVal of value) {
        if (!clientSideValidateProp(schema.element, innerVal)) return false;
      }
      return true;
    },
  };

  return handlers[schema.kind](schema, value);
}

// Define a function to get ancestor schemas
function getAncestorSchemas(
  rootSchema: ComponentSchema,
  path: ReadonlyPropPath,
  value: unknown
): ComponentSchema[] {
  const ancestors: ComponentSchema[] = [];
  const currentPath = [...path];
  let currentProp = rootSchema;
  let currentValue = value;
  while (currentPath.length) {
    ancestors.push(currentProp);
    const key = currentPath.shift();
    if (currentProp.kind === 'array') {
      currentProp = currentProp.element;
      currentValue = (currentValue as any)[key];
    } else if (currentProp.kind === 'conditional') {
      currentProp = currentProp.values[(value as any).discriminant];
      currentValue = (currentValue as any).value;
    } else if (currentProp.kind === 'object') {
      currentValue = (currentValue as any)[key];
      currentProp = currentProp.fields[key];
    } else if (
      currentProp.kind === 'child' ||
      currentProp.kind === 'form' ||
      currentProp.kind === 'relationship'
    ) {
      throw new Error(`unexpected prop "${key}"`);
    } else {
      throw new Error(`unexpected schema kind "${currentProp.kind}"`);
    }
  }
  return ancestors;
}

// Define a function to get value at prop path
function getValueAtPropPath(value: unknown, inputPath: ReadonlyPropPath): unknown {
  const path = [...inputPath];
  while (path.length) {
    const key = path.shift();
    value = (value as any)[key];
  }
  return value;
}

// Define a function to traverse props
function traverseProps(
  schema: ComponentSchema,
  value: unknown,
  visitor: Visitor,
  path: ReadonlyPropPath = []
): void {
  const handlers: { [key in SchemaKind]: (schema: ComponentSchema, value: unknown, visitor: Visitor, path: ReadonlyPropPath) => void } = {
    form: (schema, value, visitor, path) => visitor(schema, value, path),
    relationship: (schema, value, visitor, path) => visitor(schema, value, path),
    child: (schema, value, visitor, path) => visitor(schema, value, path),
    object: (schema, value, visitor, path) => {
      for (const [key, childProp] of Object.entries(schema.fields)) {
        traverseProps(childProp, (value as any)[key], visitor, [...path, key]);
      }
      visitor(schema, value, path);
    },
    array: (schema, value, visitor, path) => {
      for (const [idx, val] of (value as unknown[]).entries()) {
        traverseProps(schema.element, val, visitor, path.concat(idx));
      }
      visitor(schema, value, path);
    },
    conditional: (schema, value, visitor, path) => {
      const discriminant: string | boolean = (value as any).discriminant;
      visitor(schema, discriminant, path.concat('discriminant'));
      traverseProps(
        schema.values[discriminant.toString()],
        (value as any).value,
        visitor,
        path.concat('value')
      );
      visitor(schema, value, path);
    },
  };

  handlers[schema.kind](schema, value, visitor, path);
}

// Define a function to replace value at prop path
function replaceValueAtPropPath(
  schema: ComponentSchema,
  value: unknown,
  newValue: unknown,
  path: ReadonlyPropPath
): unknown {
  if (path.length === 0) return newValue;

  const [key, ...newPath] = path;

  const handlers: { [key in SchemaKind]: (schema: ComponentSchema, value: unknown, newValue: unknown, path: ReadonlyPropPath) => unknown } = {
    object: (schema, value, newValue, path) => {
      return {
        ...(value as any),
        [key]: replaceValueAtPropPath(schema.fields[key], (value as any)[key], newValue, newPath),
      };
    },
    conditional: (schema, value, newValue, path) => {
      const conditionalValue = value as { discriminant: string | boolean; value: unknown };
      return {
        discriminant: conditionalValue.discriminant,
        value: replaceValueAtPropPath(schema.values[key], conditionalValue.value, newValue, newPath),
      };
    },
    array: (schema, value, newValue, path) => {
      const prevVal = value as unknown[];
      const newVal = [...prevVal];
      setKeysForArrayValue(newVal, getKeysForArrayValue(prevVal));
      newVal[key as number] = replaceValueAtPropPath(
        schema.element,
        newVal[key as number],
        newValue,
        newPath
      );
      return newVal;
    },
  };

  return handlers[schema.kind](schema, value, newValue, path);
}

// Define a function to get placeholder text for prop path
function getPlaceholderTextForPropPath(
  propPath: ReadonlyPropPath,
  fields: Record<string, ComponentSchema>,
  formProps: Record<string, any>
): string {
  const field = getSchemaAtPropPath(propPath, formProps, fields);
  if (field?.kind === 'child') return field.options.placeholder;
  return '';
}