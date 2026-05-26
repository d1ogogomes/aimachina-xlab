const tf = require('@tensorflow/tfjs');
const mobilenet = require('@tensorflow-models/mobilenet');

async function test() {
  console.log('Loading MobileNet...');
  const net = await mobilenet.load({ version: 1, alpha: 1.0 });
  console.log('MobileNet loaded.');

  // Create a 4D tensor representing a batch of 2 images of size 224x224x3
  const dummyBatch = tf.zeros([2, 224, 224, 3]);

  try {
    console.log('Trying net.infer with 4D tensor...');
    const result = net.infer(dummyBatch, true);
    console.log('Success! Result shape:', result.shape);
  } catch (err) {
    console.error('Failed as predicted!', err);
  }
}

test();
