"""littletorch — a small, readable neural-network library for teaching.

PyTorch-shaped, so what you learn here carries over:

    import littletorch as torch
    import littletorch.nn as nn

    model = nn.Sequential(nn.Linear(2, 16), nn.ReLU(), nn.Linear(16, 1))
    opt = torch.optim.SGD(model.parameters(), lr=0.1)
    loss = nn.MSELoss()(model(x), y)
    opt.zero_grad(); loss.backward(); opt.step()

It runs on NumPy alone, so it works anywhere NumPy does, including in the
browser. It's for learning how networks train, not for speed: every
operation, and how its gradient is computed, is a few lines in tensor.py and
nn/functional.py that you can read.
"""

from . import data, nn, optim
from .tensor import (
    Tensor,
    arange,
    cat,
    from_numpy,
    is_grad_enabled,
    manual_seed,
    no_grad,
    ones,
    rand,
    randn,
    stack,
    tensor,
    zeros,
)

__version__ = "0.1.0"

__all__ = [
    "Tensor", "tensor", "from_numpy", "zeros", "ones", "randn", "rand", "arange", "stack", "cat",
    "no_grad", "is_grad_enabled", "manual_seed", "nn", "optim", "data", "__version__",
]
