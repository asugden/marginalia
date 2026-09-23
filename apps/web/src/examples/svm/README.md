# Support vector machines

Draw a straight line between two classes, then let a linear SVM draw its own.
The reader's task is the SVM's task: split the classes and leave the widest
street between them.

Static and unauthenticated, generated in the browser from a seed. The data
comes from [`shared/classification`](../shared/classification/README.md),
shared with the naive Bayes example: the same shapes, and the same true
curves along each feature, so a student can carry what they learned about a
shape from one page to the other.

## What it is built to show

- **The street.** The reader's line shows its street: dotted edges out to the
  nearest point it gets right on each side, with those points ringed. After
  fitting, the SVM's street is a grey band and its support vectors are ringed.
  They alone fix the line.
- **Train vs test,** as on the naive Bayes page: fitting reveals 600 held-out
  points, and the next edit hides them again.
- **What a line can and cannot do.** Round and tilted can both be split by a
  line. Tilted is where the SVM clearly beats naive Bayes (about 97% against
  78% on held-out points), because its line can lie at any angle. Interleaved
  (a checkerboard) cannot be split by any line.

## Choices

- **Two classes, two features.** Three classes need more than one line, and
  one feature makes the line a threshold.
- **The line is oriented automatically.** Which class goes on which side is
  whichever scores better on the points shown, which is what a fit would do.
- **C is fixed at 1.** The page is about the street, not the tuning. The fit
  is dual coordinate descent (Hsieh et al., 2008), with the bias carried as a
  constant third feature, so it is regularised slightly.
- **No numeric street width.** The reader's street (the gap to the nearest
  correct point) and the soft-margin SVM's (which lets points inside) are
  measured differently, so the two are compared by eye, not by number.
- When the SVM gives up on a checkerboard and calls every point one class,
  its street is wider than the plot and is not drawn.

## Colour

Points, true distributions and regions follow style.md §11 "Category" (class
hue; dot = data, soft fill = truth, wash = prediction). Lines, streets and
rings separate classes rather than belonging to one, so they are ink: the
reader's line solid, the SVM's dashed.

## Files

```
svm.ts        the reader's line and street, the SVM fit, and drawing helpers
SvmPlot.tsx   the shared joint plot with both lines, streets and rings
SvmPage.tsx   the page
```
