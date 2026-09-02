# Decision Tree Classifiers

A twelve-step walkable lesson. Arrow keys advance it, so it can be run from the
front of a room; the "your turn" steps let a reader work the same material
alone. Every figure is live — the same components in a different configuration —
so nothing is a screenshot of a result the page cannot recompute.

## The confusion it is built to fix

A finished tree diagram shows a chain of questions, each on a different feature.
It is very easy to read that chain as a ranked list of features chosen up front.
It is not. Splits are chosen **locally**, from whatever rows reach a node, and
the winner on one branch has nothing to do with the winner on the other.

Three steps take that reading apart:

- **Step 2** forces each feature to the root in turn. On a dataset with one row
  per leaf, every ordering classifies perfectly and all candidates score
  *exactly* equal — so the order such a diagram appears to endorse carries no
  information at all.
- **Step 4** scores every candidate, losers included, before revealing the
  winner.
- **Step 6** scores them again separately on each branch, in the same order, and
  the winner changes.

The rest builds on that: a noise feature losing on its own; a binary feature
being exhausted once used; the threshold search a continuous feature adds; the
same continuous feature being revisited deeper; greedy growing failing on an
interaction; and finally regression.

## Notation

The node holds a plain-English **question** and the two edges are always
labelled **no** and **yes**. Binary and continuous splits therefore render
identically, and no threshold arithmetic leaks into the diagram. Where the two
genuinely differ is the search behind them, and that belongs in the gain chart.

## On binary features

Binary features are not a simplification here. Indicator matrices are how a
great deal of real tabular data arrives, and on binary data a feature really is
exhausted the moment it is split on — every row below shares its value, so
splitting again scores zero. Steps 1–7 and 10 are entirely binary. Exactly one
step adds a continuous column, and it adds only that, so any new behaviour is
attributable to the column type and nothing else.

## Greedy vs optimal

Step 10 uses a dataset where comfort is the XNOR of two features. Both score
*exactly* zero at the root — split on either alone and each side is half
comfortable — while a decoy carrying incidental signal scores above zero and
gets taken. The exhaustive depth-2 tree is perfect; the greedy one reaches 75%.
The two decisive features scoring below literal noise is the picture worth
pausing on.
