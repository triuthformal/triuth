def parse_expression(expression, start_ix, mapping):
    """Parse and evaluate process spaces expression in prefix form."""
    token = expression[start_ix]
    if token in ('-', '/', 'robust'):
        arg, end_ix = parse_expression(expression, start_ix + 1, mapping)
        if token == '-':
            result = 'g'
            if arg == 'r': result = 'e'
            if arg == 'e': result = 'r'
        elif token == '/':
            result = 'e'
            if arg == 'r': result = 'g'
            if arg == 'e': result = 'r'
        elif token == 'robust':
            result = (arg != 'r')
        return result, end_ix
    if token == 'not':
        arg, end_ix = parse_expression(expression, start_ix + 1, mapping)
        return not arg, end_ix
    elif token in ('||', '[=', '==', 'oplus', 'meet', 'join', 'lpop'):
        left, left_end_ix = parse_expression(expression, start_ix + 1, mapping)
        right, right_end_ix = parse_expression(expression, left_end_ix, mapping)
        if token == '||':
            result = 'e'
            if left == 'r' and right != 'e': result = 'r'
            if left != 'e' and right == 'r': result = 'r'
            if left == 'g' and right == 'g': result = 'g'
        elif token == '[=':
            result = left >= right
        elif token == '==':
            result = left == right
        elif token == 'oplus':
            result = 'r'
            if left == 'e' and right != 'r': result = 'e'
            if left != 'r' and right == 'e': result = 'e'
            if left == 'g' and right == 'g': result = 'g'
        elif token == 'meet':
            result = 'g'
            if left == 'e' and right != 'g': result = 'e'
            if left != 'g' and right == 'e': result = 'e'
            if left == 'r' and right == 'r': result = 'r'
        elif token == 'join':
            result = 'g'
            if left == 'r' and right != 'g': result = 'r'
            if left != 'g' and right == 'r': result = 'r'
            if left == 'e' and right == 'e': result = 'e'
        elif token == 'lpop':
            result = 'e'
            if left == 'e' and right != 'e': result = 'r'
            if left != 'r' and right == 'r': result = 'r'
            if left == 'g' and right == 'g': result = 'g'
        return result, right_end_ix
    elif token in ('and', 'or', 'implies', 'equiv'):
        left, left_end_ix = parse_expression(expression, start_ix + 1, mapping)
        right, right_end_ix = parse_expression(expression, left_end_ix, mapping)
        if token == 'and':
            result = left and right
        if token == 'or':
            result = left or right
        if token == 'implies':
            result = not left or right
        if token == 'equiv':
            result = left == right
        return result, right_end_ix
    elif token in ('top', 'bot', 'phi'):
        if token == 'top':
            return 'e', start_ix + 1
        if token == 'bot':
            return 'r', start_ix + 1
        if token == 'phi':
            return 'g', start_ix + 1
    else:
        return mapping[token], start_ix + 1

import io

# buf = io.StringIO()
# print("Hello", file=buf)
# print("World", file=buf)

# s = buf.getvalue()

def generate_triuth_table(expression):
    """Generate a tri-uth table for a process spaces expression."""
    buf = io.StringIO()

    print(expression, file=buf)
    variables = set(token for token in expression.split()
        if not token in ('-', '/', 'robust', '||', '[=', '==', 'oplus', 'meet', 'join', 'lpop',
                         'not', 'and', 'or', 'implies', 'equiv', 'top', 'bot', 'phi'))
    num_vars = len(variables)
    for i in range(3 ** num_vars):
        values = [i // 3** j% 3 for j in range(num_vars-1, -1, -1)]
        map_dict = {0: 'r', 1: 'g', 2: 'e'}
        values = [map_dict[value] for value in values]
        mapping = dict(zip(variables, values))
        expr_copy = expression.split()
        result, _ = parse_expression(expr_copy, 0, mapping)
        print(mapping, result, file=buf)

    return buf.getvalue()


# Example usage: verification theorem
expression = 'equiv [= A B robust || - A B'
generate_triuth_table(expression)

# expression = 'implies and [= phi || Gamma A [= phi || Delta B [= phi || || Gamma Delta oplus A B'
# generate_triuth_table(expression)

# expression = '[= phi || A - A'
# generate_triuth_table(expression)

# expression = 'implies and [= phi || Gamma A [= phi || Delta - A [= phi || Gamma Delta'
# generate_triuth_table(expression)

# defining lollipop in process spaces
expression = 'equiv lpop A B || - A B'
generate_triuth_table(expression)

# a rule from last paragraph on page 2 of https://www.cs.unibo.it/~dallago/TLLALINEARITY2020/MLL+MIX_as_a_Logic_of_Influence_and_Causation.pdf
expression = 'lpop oplus A || X B || oplus A X B'
generate_triuth_table(expression)

# MIX inference rule from https://www.pls-lab.org/en/Mix_rule
expression = 'implies and robust G robust D robust || G D'
generate_triuth_table(expression)


def process(s: str) -> str:
    s = s.strip()
    if not s:
        return "Please type a prefix expression using process spaces operators and any symbols for variables."

    return f"Your expression: {s}\nTriuth table:\n{generate_triuth_table(s)}"
    
