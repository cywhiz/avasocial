let video;
let poseNet;
let pose;
let skeleton;
let thirtysecs;
let posesArray = ['1', '2', '3', '4'];
var imgArray = new Array();
var seconds = 10;

var poseImage;

let brain;
let poseLabel;

var targetLabel;
var errorCounter;
var iterationCounter;
var poseCounter;
var target;

var timeLeft;

function setup() {
  var canvas = createCanvas(640, 480);
  canvas.parent('webcam');
  canvas.style('display', 'block');
  video = createCapture(VIDEO);
  video.hide();
  poseNet = ml5.poseNet(video, modelLoaded);
  poseNet.on('pose', gotPoses);

  poseCounter = 0;
  targetLabel = '1';
  target = posesArray[poseCounter];
  $('#poseName').text('Pose #' + target);
  timeLeft = seconds;
  $('#timer').text(timeLeft);
  errorCounter = 0;
  iterationCounter = 0;
  $('#poseImage').attr('src', 'img/' + targetLabel + '.png');

  let options = {
    inputs: 34,
    outputs: 4,
    task: 'classification',
    debug: true,
  };

  brain = ml5.neuralNetwork(options);
  const modelInfo = {
    model: 'model/model.json',
    metadata: 'model/model_meta.json',
    weights: 'model/model.weights.bin',
  };
  brain.load(modelInfo, brainLoaded);
}

function brainLoaded() {
  console.log('Model ready!');
  classifyPose();
}

function classifyPose() {
  if (pose) {
    let inputs = [];
    for (let i = 0; i < pose.keypoints.length; i++) {
      let x = pose.keypoints[i].position.x;
      let y = pose.keypoints[i].position.y;
      inputs.push(x);
      inputs.push(y);
    }
    brain.classify(inputs, gotResult);
  } else {
    console.log('Pose not found');
    setTimeout(classifyPose, seconds * 10);
  }
}

function gotResult(error, results) {
  $('#message').text('');

  if (results[0].confidence > 0.7) {
    console.log('Pose matched');
    console.log(results[0].label);
    console.log(targetLabel);
    if (results[0].label == targetLabel) {
      iterationCounter = iterationCounter + 1;

      console.log('Counting ' + iterationCounter);

      if (iterationCounter == seconds) {
        console.log('Countdown ends');
        iterationCounter = 0;
        nextPose();
      } else {
        console.log('Countdown begins');
        timeLeft = timeLeft - 1;
        if (timeLeft < seconds) {
          $('#timer').text(timeLeft);
        } else {
          $('#timer').text(timeLeft);
        }
        setTimeout(classifyPose, seconds * 100);
      }
    } else {
      errorCounter = errorCounter + 1;
      console.log('error');
      if (errorCounter >= seconds) {
        console.log('four errors');
        iterationCounter = 0;
        timeLeft = seconds;
        if (timeLeft < seconds) {
          $('#timer').text(timeLeft);
        } else {
          $('#timer').text(timeLeft);
        }
        errorCounter = 0;
        setTimeout(classifyPose, seconds * 10);
      } else {
        setTimeout(classifyPose, seconds * 10);
      }
    }
  } else {
    console.log('Wrong pose');
    setTimeout(classifyPose, seconds * 10);
  }
}

function gotPoses(poses) {
  if (poses.length > 0) {
    pose = poses[0].pose;
    skeleton = poses[0].skeleton;
  }
}

function modelLoaded() {
  // $('#rectangle').style.display = 'none';
  console.log('poseNet ready');
}

function draw() {
  push();
  // Mirror video
  translate(video.width, 0);
  scale(-1, 1);
  image(video, 0, 0, video.width, video.height);

  // Draw skeleton and key joints if pose is found
  if (pose) {
    for (let i = 0; i < skeleton.length; i++) {
      let a = skeleton[i][0];
      let b = skeleton[i][1];
      strokeWeight(3);
      stroke('yellow');

      line(a.position.x, a.position.y, b.position.x, b.position.y);
    }
    for (let i = 0; i < pose.keypoints.length; i++) {
      let x = pose.keypoints[i].position.x;
      let y = pose.keypoints[i].position.y;
      fill('blue');
      stroke('white');
      ellipse(x, y, 16, 16);
    }
  }
  pop();
}

function nextPose() {
  if (poseCounter >= 3) {
    console.log('Well done, you have learnt all poses!');
    $('#message').text('All poses complete. Well done!');
    $('#pose').html('<img id="congrats" src="img/congrats.jpg" />');
  } else {
    errorCounter = 0;
    iterationCounter = 0;
    poseCounter = poseCounter + 1;
    targetLabel = posesArray[poseCounter];
    console.log('next pose target label' + targetLabel);
    target = posesArray[poseCounter];
    $('#poseName').text('Pose #' + target);
    $('#message').text('Well done, next pose!');
    $('#poseImage').attr('src', 'img/' + targetLabel + '.png');
    console.log('classifying again');
    timeLeft = seconds;
    $('#timer').text(timeLeft);
    setTimeout(classifyPose, 4000);
  }
}
