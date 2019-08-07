import { GraphQLFieldResolver, defaultFieldResolver, FieldNode, Kind } from 'graphql';
import { getErrorsFromParent } from './errors';
import { handleResult } from './checkResultAndHandleErrors';
import { getResponseKeyFromInfo } from './getResponseKeyFromInfo';
import { IFieldResolver } from '../Interfaces';

// Resolver that knows how to:
// a) handle aliases for proxied schemas
// b) handle errors from proxied schemas
// c) handle external to internal enum coversion
const defaultMergedResolver: GraphQLFieldResolver<any, any> = (parent, args, context, info) => {
  if (!parent) {
    return null;
  }

  const responseKey = getResponseKeyFromInfo(info);
  const errors = getErrorsFromParent(parent, responseKey);

  // check to see if parent is not a proxied result, i.e. if parent resolver was manually overwritten
  // See https://github.com/apollographql/graphql-tools/issues/967
  if (!Array.isArray(errors)) {
    return defaultFieldResolver(parent, args, context, info);
  }

  return handleResult(info, parent[responseKey], errors);
};

export default defaultMergedResolver;

export function wrapField(
  originalResolver: IFieldResolver<any, any>,
  wrapper: string,
  fieldName: string
): IFieldResolver<any, any> {
  return (parent, args, context, info) =>
    originalResolver(parent[wrapper], args, context, { ...info, fieldName });
}

export function extractField(
  originalResolver: IFieldResolver<any, any>,
  fieldName: string
): IFieldResolver<any, any> {
  return (parent, args, context, info) => {
    const newFieldNodes: Array<FieldNode> = [];

    info.fieldNodes.forEach(fieldNode => {
      fieldNode.selectionSet.selections.forEach(selection => {
        if (selection.kind === Kind.FIELD) {
          if (selection.name.value === fieldName) {
            newFieldNodes.push(selection);
          }
        }
      });
    });

    return originalResolver(parent, args, context, {
      ...info,
      fieldName,
      fieldNodes: newFieldNodes,
    });
  }
}
