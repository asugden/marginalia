# littletorch

A small, readable neural-network library for teaching, in pure Python on
NumPy. It is shaped like PyTorch, so what students learn carries over:

```python
import littletorch as torch
import littletorch.nn as nn

model = nn.Sequential(nn.Conv2d(1, 8, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
                      nn.Flatten(), nn.Linear(8 * 4 * 4, 10))
opt = torch.optim.Adam(model.parameters(), lr=0.01)
loss_fn = nn.CrossEntropyLoss()

for xb, yb in torch.data.DataLoader(torch.data.TensorDataset(X, y), batch_size=64, shuffle=True):
    opt.zero_grad()
    loss_fn(model(xb), yb).backward()
    opt.step()
```

## Why it exists

PyTorch and TensorFlow can't run in the browser, where the code notebooks
run (Pyodide). littletorch needs only NumPy, so it does. It is bundled into
the notebook runtime: `import littletorch` works with nothing to install.

It is for learning how networks train, not for speed. Every operation, and
how its gradient is computed, is a few commented lines students can read:
the autograd engine is `littletorch/tensor.py`, layers and losses are
`littletorch/nn/`.

## What's in it

| | |
|---|---|
| Tensors | `tensor`, `zeros`, `ones`, `randn`, `rand`, `arange`, `stack`, `cat`, `no_grad`, `manual_seed`; arithmetic with broadcasting, `@`, `sum`/`mean`/`max`, `reshape`, `permute`, `.T`, indexing, `exp`, `log`, `relu`, `sigmoid`, `tanh`, `clamp` |
| Autograd | `requires_grad`, `.backward()`, `.grad`, gradient accumulation |
| Layers (`nn`) | `Module`, `Parameter`, `Sequential`, `Linear`, `Conv2d`, `MaxPool2d`, `Flatten`, `ReLU`, `Sigmoid`, `Tanh`, `Softmax`, `Dropout`; `state_dict` / `load_state_dict` |
| Losses | `MSELoss`, `CrossEntropyLoss` (takes logits), `BCELoss`, `BCEWithLogitsLoss` |
| Functional | `nn.functional`: the above as functions, plus stable `log_softmax` / `softmax` |
| Optimizers | `optim.SGD` (momentum, weight decay), `optim.Adam` |
| Data | `data.TensorDataset`, `data.DataLoader` (batching, shuffling) |

Defaults follow PyTorch: float32 for Python numbers, int64 for whole numbers,
and PyTorch's initialisation for `Linear` and `Conv2d`. One difference:
NumPy arrays keep their own dtype, so float64 data computes in float64.

## Tests

`littletorch/_selftest.py` checks every operation's gradient against a
finite-difference estimate (in float64) and trains an MLP and a small CNN
that must actually learn:

```
python -m littletorch._selftest
```

It runs the same way inside a notebook: `import littletorch._selftest as t; t.run()`.
