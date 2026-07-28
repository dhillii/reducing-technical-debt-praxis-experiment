FORMAT_STRING = "%-15s\t%s"

def boolean_ops():
    """
    Boolean operators
    """
    names =  ["negation", "conjunction", "disjunction", "implication", "equivalence"]
    for pair in zip(names, [Tokens.NOT, Tokens.AND, Tokens.OR, Tokens.IMP, Tokens.IFF]):
        print(FORMAT_STRING %  pair)

def equality_preds():
    """
    Equality predicates
    """
    names =  ["equality", "inequality"]
    for pair in zip(names, [Tokens.EQ, Tokens.NEQ]):
        print(FORMAT_STRING %  pair)

def binding_ops():
    """
    Binding operators
    """
    names =  ["existential", "universal", "lambda"]
    for pair in zip(names, [Tokens.EXISTS, Tokens.ALL, Tokens.LAMBDA]):
        print(FORMAT_STRING %  pair)