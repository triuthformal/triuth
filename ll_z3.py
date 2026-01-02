import os

## Importing the z3 module
from z3 import *

# # set_param('verbose', 10)

# set_param('parallel.enable', True)
# set_param('smt.random_seed', 100)
# set_param('timeout', 0)  # unlimited timeout
# set_param('smt.phase_selection', 5)

# # Optionally set memory cap (not always respected on all systems)
# set_param('memory_high_watermark', 64000)  # in MB (e.g., 16 GB)

# proc = psutil.Process(os.getpid())
# print(f"Memory used: {proc.memory_info().rss / (1024 * 1024):.2f} MB")


## Declarations
ll = Solver()
F = DeclareSort('F')
entails = Function('entails', F, F, BoolSort())
par = Function('par', F, F, F)
tensor = Function('tensor', F, F, F)
lpop = Function('lollipop', F, F, F)
dual = Function('dual', F, F)
x, y, z, w, I = Consts('x y z w I', F)



# ## Given rules
ll.add(ForAll([x], entails(x, x))) # rule (i)
ll.add(ForAll([x,y,z], Implies(And(
entails(x,y), entails(y,z)), entails(x, z)))) # rule (o)
ll.add(ForAll([w,x,y,z], Implies(And(
entails(w,x), entails(y,z)), entails(tensor(w, y), tensor(x, z)))))
# rule (tensor)
ll.add(ForAll([w,x,y,z],
entails(w,tensor(tensor(x,y),z)) == entails(w, tensor(x, tensor(y, z)))))
# rule (a)
ll.add(ForAll([x,y],
entails(x,tensor(I,y)) == entails(x,y))) # rule (l)
ll.add(ForAll([x,y],
entails(x,tensor(y,I)) == entails(x,y))) # rule (r)
ll.add(ForAll([w,x,y],
entails(w,tensor(x,y)) == entails(w,tensor(y,x)))) # rule (b)
ll.add(ForAll([x,y,z],
entails(tensor(x,y),z) == entails(y,lpop(x,z)))) # rule (c)

# Derived rules (all "unsat")
# ll.add(Not(ForAll([x,y], entails(tensor(x,lpop(x,y)),y)))) # rule (ev)
# ll.add(Not(ForAll([x,y,z], entails(tensor(lpop(x,y),lpop(y,z)),lpop(x,z))))) # internal composition rule

## Given rules for dual and par
ll.add(ForAll([x], dual(x) == lpop(x, I))) # dual
ll.add(ForAll([x,y], par(x, y) == lpop(dual(x), y))) # par

## Given rules for top and zero
top, zero = Consts('top zero', F)
ll.add(ForAll([x], entails(x, top)))
ll.add(ForAll([x], entails(zero, x)))


def process_all(strings: list[str]) -> void:
    stripped = [s.strip() for s in strings]
    for s in stripped:
      ll.add(s)
    # return "test1"
    
    res = ll.check()
    if res == unsat:
      return "The constraint set is unsatisfiable"
    # else
    try:
      return ll.model()
    except Exception as e:
      None
