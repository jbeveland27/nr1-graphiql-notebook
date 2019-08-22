
const { visit } = require('graphql/language/visitor');

const listToMap = (list, keyAccessor, valueAccessor) => {
  valueAccessor = valueAccessor || ((v) => v)
  return list.reduce((map, item) => {
    map[keyAccessor(item)] = valueAccessor(item)
    return map
  }, {})
}

const wrap = (value) => Array.isArray(value) ? value : [value]

const flatten = (list) => list.reduce((flattened, item) => flattened.concat(wrap(item)), [])

const buildNamedFragmentMap = (queryDoc) => {
  let namedFragments = {}

  visit(queryDoc, {
    FragmentDefinition(node) {
      let fragmentName = node.name.value
      let fragmentFields = node.selectionSet.selections
      namedFragments[fragmentName] = fragmentFields
    }
  })

  return namedFragments
}

const inlineFragments = (queryDoc) => {
  const namedFragments = buildNamedFragmentMap(queryDoc)
  return visit(queryDoc, {
    enter: {
      FragmentSpread(node) { return namedFragments[node.name.value] },
      InlineFragment(node) { return node.selectionSet && node.selectionSet.selections }
    },

    leave: {
      Field(node) {
        if (node.selectionSet) {
          node.selectionSet.selections = flatten(node.selectionSet.selections)
        }
        return node
      },
    }
  })
}

const buildContextTree = (queryDoc) => {
  return visit(queryDoc, {
    enter: {
      FragmentDefinition() {
        return null
      }
    },
    leave: {
      Document(node) {
        return {
          ...node.definitions[0],
          context: {}
        } //TODO too fragile?
      },

      Name(node) {
        return node.value
      },

      SelectionSet(node) {
        return listToMap(node.selections, ({name}) => name)
      },

      Argument(node) {
        return {
          name: node.name,
          kind: node.value.kind,
          value: node.value.value
        }
      },

      Field(node) {
        let name = node.alias || node.name
        return {
          name,
          context: {
            arguments: listToMap(node.arguments, ({name}) => name),
          },
          selectionSet: node.selectionSet
        }
      }
    }
  })
}

function pop(list) {
  return [last(list), list.slice(0, -1)]
}

function last(list) {
  return list[list.length-1]
}

export function generate(queryDoc) {
  return buildContextTree(inlineFragments(queryDoc))
}

export function findFieldContext(contextNode, path) {
  if (Number.isInteger(last(path))) return findFieldContext(contextNode, path.slice(0,-1))
  if (path.length === 0) return contextNode.context || {}
  let [nextField, remainingPath] = pop(path)
  let nextNode = contextNode.selectionSet[nextField]
  return findFieldContext(nextNode, remainingPath)
}
