// The code behind the Deep Neural Network example — edit freely.
//
// This file is content, not logic. Each version is one way of writing the
// network on the page; each section is one box, which pops up beside the
// part of the figure it builds when the reader points at that part. To change
// what readers see, edit the strings below:
//
//   title    the box heading
//   code     the Python, verbatim (keep it short: a box is read beside the
//            part of the network it builds)
//   shape    optional one-line note on tensor shapes / parameter counts
//   explain  plain prose; a blank line starts a new paragraph, and
//            `backticks` mark inline code. Lines starting "1." or "-" are
//            a list, drawn tight even with blank lines between items
//   over     the parts of the network this box builds. Pointing at any of
//            them opens the box (click pins it); while it is open they all
//            stay lit and the rest of the network dims. Give each part ONE
//            box: a second one hides behind a small arrow in the popover
//            that readers miss. Anything else (data, training, predicting)
//            takes over: [] and gets a button under the figure. Names:
//              "input"  the 20×20 drawing grid
//              "w1"     the lines from the grid to hidden 1   (weights)
//              "h1"     the hidden 1 neurons
//              "w2"     the lines from hidden 1 to hidden 2
//              "h2"     the hidden 2 neurons
//              "w3"     the lines from hidden 2 to the output
//              "out"    the output tiles
//   alsoLights  optional: more parts to light while the box is open, without
//               pointing at them opening it (used by the bottom-row boxes)
//
// The buttons under the figure appear in the order their boxes are listed.
// Add, remove or reorder boxes at will; `id` must stay unique within its
// version.
//
// Both versions describe the same network the page runs: 400 inputs, two
// hidden layers of 25 ReLU neurons, and 11 softmax outputs (0–9 plus
// "blank"), trained with SGD (learning rate 0.05, momentum 0.9), batches
// of 64, for 30 epochs.

import type { CodeSection, CodeVersion } from "../shared/code-panel/types.js";

// Where x_train and y_train come from. Shared by both versions: the data is
// the same however the network is written.
const trainingData: CodeSection = {
  id: "data",
  title: "Training data",
  over: [],
  alsoLights: ["input", "out"],
  code: `
(x_train, y_train), (x_test, y_test) = tf.keras.datasets.mnist.load_data()

x_train = tf.image.resize(x_train[..., None] / 255, [20, 20], method="area")[..., 0]
x_test = tf.image.resize(x_test[..., None] / 255, [20, 20], method="area")[..., 0]`,
  shape: "(n, 28, 28) of 0-255 → (n, 20, 20) of 0.0-1.0",
  explain: `
We load in a commonly used dataset called the MNIST digit set (60,000 training and 
10,000 test images along with labels). The exact code can be copied and pasted.
\`x_train\` contains the images (which are essentially 400 features) and \`y_train\` is the associated labels (the number).`,
};

const matmul: CodeVersion = {
  id: "matmul",
  label: "Manual",
  sections: [
    {
      id: "input",
      title: "Input · the drawing",
      over: ["input"],
      code: `
import tensorflow as tf

# images: shape (n, 20, 20), each pixel 0.0 (blank) to 1.0 (ink)
x = tf.reshape(images, [-1, 400])`,
      shape: "(n, 20, 20) → (n, 400)",
      explain: `
The grid at the top is the input layer. Each of its 400 squares is one number
between 0 and 1: how much ink is in that square.

A network of this kind does not know the squares form a picture. \`tf.reshape\`
lays the 20 rows end to end into one row of 400 numbers. The \`-1\` means "as
many images as there are": one while you draw, thousands while training.`,
    },
    trainingData,
    {
      id: "w1",
      title: "Weights · input → hidden 1",
      over: ["w1"],
      code: `
W1 = tf.Variable(tf.random.normal([400, 25], stddev=0.07))
z1 = tf.matmul(x, W1)`,
      shape: "(n, 400) @ (400, 25) → (n, 25) · 10,000 weights",
      explain: `
\`W1\` is a table of 10,000 numbers: one row for each of the 400 pixels, one
column for each of the 25 neurons below. Every line drawn between the grid and
hidden 1 is one entry in this table. Sage lines are positive weights, plum lines
negative; thicker means larger.

\`tf.Variable\` marks the table as something training is allowed to change. It
starts as small random numbers (\`tf.random.normal\`); training turns them into
the pattern you see.

\`tf.matmul\` does the multiplying and adding. For each neuron it takes all 400
pixels, multiplies each by its weight, and adds the 400 products into one
number. That is 25 neurons × 400 multiplications, done in one call.`,
    },
    {
      id: "h1",
      title: "Hidden layer 1 · bias + ReLU",
      over: ["h1"],
      code: `
b1 = tf.Variable(tf.zeros([25]))
h1 = tf.nn.relu(z1 + b1)`,
      shape: "(n, 25) · 25 biases",
      explain: `
Each rounded square is one neuron. It owns one bias, a number added to its
weighted sum that makes the neuron easier or harder to switch on. Biases start
at zero and are learned like the weights.

\`tf.nn.relu\` is the activation: anything below zero becomes 0, anything above
passes through. That bend is what lets stacked layers draw shapes a single
straight line cannot. The shading of each square is its value in \`h1\` for your
drawing: dark is strongly on, pale is off.`,
    },
    {
      id: "w2",
      title: "Weights · hidden 1 → hidden 2",
      over: ["w2"],
      code: `
W2 = tf.Variable(tf.random.normal([25, 25], stddev=0.28))
z2 = tf.matmul(h1, W2)`,
      shape: "(n, 25) @ (25, 25) → (n, 25) · 625 weights",
      explain: `
The same move again, now from the 25 neurons of hidden 1 to the 25 of hidden 2:
a 25 × 25 table, one weight for every line between the two rows.

The input to this layer is no longer pixels. It is \`h1\`, what the first layer
made of the pixels. That is what makes the network deep: each layer works on the
previous layer's output.

The starting spread (\`stddev\`) is larger here because there are fewer inputs
per neuron. A common rule is √(2 ÷ inputs): √(2 ÷ 400) ≈ 0.07 above,
√(2 ÷ 25) ≈ 0.28 here.`,
    },
    {
      id: "h2",
      title: "Hidden layer 2 · bias + ReLU",
      over: ["h2"],
      code: `
b2 = tf.Variable(tf.zeros([25]))
h2 = tf.nn.relu(z2 + b2)`,
      shape: "(n, 25) · 25 biases",
      explain: `
Identical in form to hidden layer 1: add a bias per neuron, then ReLU.

To make the network deeper, you would repeat the last two boxes: another
weight table, another bias, another ReLU.`,
    },
    {
      id: "w3",
      title: "Weights · hidden 2 → output",
      over: ["w3"],
      code: `
W3 = tf.Variable(tf.random.normal([25, 11], stddev=0.01))
logits = tf.matmul(h2, W3)`,
      shape: "(n, 25) @ (25, 11) → (n, 11) · 275 weights",
      explain: `
The last table connects the 25 neurons of hidden 2 to the 11 outputs. The
results are called *logits*: one raw score per answer, any size, positive or
negative.

These weights start very small so that, before training, no answer is favoured.`,
    },
    {
      id: "out",
      title: "Output · softmax",
      over: ["out"],
      code: `
b3 = tf.Variable(tf.zeros([11]))
probs = tf.nn.softmax(logits + b3)
guess = tf.argmax(probs, axis=1)`,
      shape: "(n, 11) · each row sums to 1",
      explain: `
There are 11 outputs: the digits 0–9 and a "blank" answer for an empty or
scribbled grid.

\`tf.nn.softmax\` turns the 11 scores into probabilities: all positive, adding
up to 1. These are the percentages in the "Best guess" panel. \`tf.argmax\`
picks the largest, which is the tile ringed in the figure.

There is no ReLU here: the output needs to say how much it favours each answer,
not just whether it is on.`,
    },
    {
      id: "train",
      title: "Training · loss, gradients, update",
      over: [],
      alsoLights: ["w1", "h1", "w2", "h2", "w3", "out"],
      code: `
params = [W1, b1, W2, b2, W3, b3]
opt = tf.keras.optimizers.SGD(learning_rate=0.05, momentum=0.9)
data = tf.data.Dataset.from_tensor_slices((x_train, y_train))

for epoch in range(30):
    for xb, yb in data.shuffle(70000).batch(64):
        with tf.GradientTape() as tape:
            probs = forward(xb)  # your layers, input to softmax
            loss = tf.reduce_mean(
                tf.keras.losses.sparse_categorical_crossentropy(yb, probs))
        grads = tape.gradient(loss, params)
        opt.apply_gradients(zip(grads, params))`,
      shape: "10,961 numbers learned in total",
      explain: `
Training is what turns the random tables into the lines you see.

\`forward\` is yours to write: a function that takes a batch of images and
runs it through every layer of the network, from the input to the softmax.
Its pieces are in the network above.

The *loss* measures how wrong the network is: cross-entropy is small when the
probability on the correct answer is near 1, and large when it is near 0.
\`tf.GradientTape\` records the forward pass so TensorFlow can work out, for
every weight and bias, which direction would lower the loss
(\`tape.gradient\`). The optimizer then nudges each one a small step that way.

\`learning_rate\` sets the step size; \`momentum\` lets steps keep some of their
previous direction, which smooths the path. One *epoch* is one pass through
all the training images, 64 at a time.

This page's network was trained this way, with the learning rate lowered a
little each epoch.`,
    },
  ],
};

const dense: CodeVersion = {
  id: "dense",
  label: "Keras",
  sections: [
    {
      id: "input",
      title: "Library + Input",
      over: ["input"],
      code: `
import tensorflow as tf
from tensorflow.keras import layers

model = tf.keras.Sequential()
model.add(tf.keras.Input(shape=(20, 20)))
model.add(layers.Flatten())`,
      shape: "image of (20, 20) → list of (400)",
      explain: `
1. Import the libraries.
2. \`Sequential\` is a model made up of a simple sequence of layers.
3. \`Input\` defines the shape of an input, in this case, an image of 20 by 20 pixels from 0 to 1.
4. \`model.add\` adds a new entry to the sequential model.
5. \`Flatten\` converts our 20 by 20 pixels into all 400 in one row.`,
    },
    trainingData,
    {
      id: "h1",
      title: "Hidden Layer 1",
      over: ["w1", "h1"],
      code: `
model.add(layers.Dense(25, activation="relu"))`,
      shape: "400 × 25 weights + 25 biases = 10,025 parameters",
      explain: `
In Keras, you can add a layer with a single command. That command is the size of 
the layer and its activation function. \`Dense\` is a layer connecting all neurons
of the previous layer with the current one.`,
    },
    {
      id: "h2",
      title: "Hidden Layer 2",
      over: ["w2", "h2"],
      code: `
model.add(layers.Dense(25, activation="relu"))`,
      shape: "25 × 25 weights + 25 biases = 650 parameters",
      explain: `
Add another layer of 25 neurons, though with fewer weights because there were
fewer neurons in the previous layer.

Try adding more copies of this line to create a deeper network that can fit
more complex data.`,
    },
    {
      id: "out",
      title: "Output",
      over: ["w3", "out"],
      code: `
model.add(layers.Dense(11, activation="softmax"))`,
      shape: "25 × 11 weights + 11 biases = 286 parameters",
      explain: `
The final layer has 11 possible outputs and an unusual activation function. \`softmax\`
allows the network to convert its arbitrary outputs into the relative probabilities of each output.`,
    },
    {
      id: "summary",
      title: "Describe the model",
      over: [],
      alsoLights: ["w1", "h1", "w2", "h2", "w3", "out"],
      code: `
model.summary()`,
      shape: "10,961 total parameters",
      explain: `
\`summary()\` describes the shape of your whole model, as well as its size. Note that the vast majority of parameters
connect the first layer to the next. Convolutions would be a more efficient approach largely because of this step.`,
    },
    {
      id: "compile",
      title: "Choose the loss and optimizer",
      over: [],
      alsoLights: ["w1", "h1", "w2", "h2", "w3", "out"],
      code: `
model.compile(
    optimizer=tf.keras.optimizers.SGD(learning_rate=0.05, momentum=0.9),
    loss="sparse_categorical_crossentropy",
    metrics=["accuracy"],
)`,
      explain: `
\`compile\` sets how the model will learn; it does not train anything yet.

The *loss* measures how wrong one prediction is. Cross-entropy is small when
the probability on the correct answer is near 1 and large when it is near 0.
"Sparse" means the labels are plain numbers (\`7\`) rather than lists of eleven
0s and 1s.

The *optimizer* decides how to change the weights to lower the loss. SGD takes
a small step downhill (\`learning_rate\` is the step size); \`momentum\` keeps
some of the previous step's direction. \`"adam"\` is a common alternative that
adjusts the step size for each weight on its own.

\`metrics\` are only reported, not optimised: accuracy is easier to read than
loss.`,
    },
    {
      id: "fit",
      title: "Train",
      over: [],
      alsoLights: ["w1", "h1", "w2", "h2", "w3", "out"],
      code: `
model.fit(x_train, y_train, epochs=30, batch_size=64,
          validation_split=0.1)`,
      explain: `
\`fit\` runs the training loop: take 64 images, predict, measure the loss, nudge
every weight and bias, repeat. One *epoch* is one pass through all the training
images.

\`validation_split=0.1\` holds back a tenth of the images that the model never
trains on, and reports accuracy on them each epoch. If training accuracy keeps
rising while validation accuracy stalls, the model is memorising rather than
learning.`,
    },
    {
      id: "predict",
      title: "Predict",
      over: [],
      alsoLights: ["input", "out"],
      code: `
probs = model.predict(images)
guess = probs.argmax(axis=1)`,
      shape: "(n, 11) → (n,)",
      explain: `
\`predict\` runs the forward pass on new images: what this page does every time
you draw. It returns 11 probabilities per image; \`argmax\` picks the position
of the largest, which is the network's answer.`,
    },
  ],
};

export const MLP_CODE: CodeVersion[] = [matmul, dense];
