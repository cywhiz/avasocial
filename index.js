// ── Constants ──────────────────────────────────────────────────────────────
const TOTAL_POSES = 4;
const HOLD_SECONDS = 10;
const CONFIDENCE_THRESHOLD = 0.7;
const SKELETON_COLOR = '#E83E8C'; // on-theme pink
const JOINT_COLOR = '#C2185B';    // deep rose

// ── State ──────────────────────────────────────────────────────────────────
let video;
let poseNet;
let pose;
let skeleton;
let brain;

const posesArray = ['1', '2', '3', '4'];

let targetLabel;
let errorCounter = 0;
let iterationCounter = 0;
let poseCounter = 0;
let timeLeft = HOLD_SECONDS;
let isPlaying = false;
let classifyScheduled = false;

// ── DOM helpers ────────────────────────────────────────────────────────────
const el = (id) => document.getElementById(id);

// ── Error handler ──────────────────────────────────────────────────────────
window.onerror = function (msg, url, lineNo, columnNo, error) {
  console.error(`[${lineNo}:${columnNo}] ${msg}`, error);
  const msgEl = el('message');
  if (msgEl) msgEl.innerText = 'Error: ' + msg;
  return false;
};

// ── Image preloading ───────────────────────────────────────────────────────
function preloadPoseImages() {
  posesArray.forEach(p => {
    const img = new Image();
    img.src = 'img/' + p + '.png';
  });
  // Also preload congrats image
  const c = new Image();
  c.src = 'img/congrats.jpg';
}

// ── Progress bar ───────────────────────────────────────────────────────────
function updateProgress(index) {
  const pct = ((index + 1) / TOTAL_POSES) * 100;
  const bar = el('progress-bar');
  const label = el('progress-text');
  if (bar) bar.style.width = pct + '%';
  if (label) label.innerText = `Pose ${index + 1} of ${TOTAL_POSES}`;
}

// ── p5.js setup ────────────────────────────────────────────────────────────
function setup() {
  console.log('Setup started');
  preloadPoseImages();

  const msgEl = el('message');

  if (typeof ml5 === 'undefined') {
    if (msgEl) msgEl.innerText = 'Error: ml5 not loaded. Check your connection.';
    return;
  }

  if (msgEl) msgEl.innerText = 'Initializing camera...';

  var canvas = createCanvas(640, 480);
  canvas.parent('webcam');
  canvas.style('width', '100%');
  canvas.style('height', 'auto');
  canvas.style('display', 'block');

  // Request video with error handling for camera permission denial
  video = createCapture(VIDEO, () => {
    // Success callback – camera is accessible
    el('camera-error').style.display = 'none';
  });
  video.size(640, 480);
  video.hide();

  // Watch for camera failure
  video.elt.addEventListener('error', handleCameraError);

  poseNet = ml5.poseNet(video, modelLoaded);
  poseNet.on('pose', gotPoses);

  // Initialise UI state
  poseCounter = 0;
  targetLabel = posesArray[poseCounter];
  updateProgress(poseCounter);

  el('poseName').innerText = 'Pose #' + targetLabel;
  updateTimerDisplay(HOLD_SECONDS);
  el('poseImage').src = 'img/' + targetLabel + '.png';

  errorCounter = 0;
  iterationCounter = 0;
  timeLeft = HOLD_SECONDS;

  // Load neural network (debug OFF for production performance)
  brain = ml5.neuralNetwork({
    inputs: 34,
    outputs: 4,
    task: 'classification',
    debug: false,
  });

  brain.load(
    {
      model: 'model/model.json',
      metadata: 'model/model_meta.json',
      weights: 'model/model.weights.bin',
    },
    brainLoaded
  );
}

// ── Camera error ───────────────────────────────────────────────────────────
function handleCameraError() {
  const camErr = el('camera-error');
  const webcamEl = el('webcam');
  if (camErr) camErr.style.display = 'flex';
  // Hide the p5 canvas
  if (webcamEl) {
    const canvas = webcamEl.querySelector('canvas');
    if (canvas) canvas.style.display = 'none';
  }
}

// Also catch permission denial via navigator API timing
setTimeout(() => {
  if (typeof video !== 'undefined' && video && video.elt) {
    const v = video.elt;
    if (v.readyState === 0 && v.srcObject === null) {
      handleCameraError();
    }
  }
}, 5000);

// ── Model callbacks ────────────────────────────────────────────────────────
function modelLoaded() {
  console.log('PoseNet ready');
  const msgEl = el('message');
  if (msgEl) msgEl.innerText = 'PoseNet ready. Loading neural network...';
}

function brainLoaded() {
  console.log('Neural network ready!');
  const msgEl = el('message');
  if (msgEl) {
    msgEl.innerText = 'Ready! Click Start to begin.';
    msgEl.classList.remove('pulsing-text');
  }
}

// ── Game flow ──────────────────────────────────────────────────────────────
function startGame() {
  const overlay = el('instruction-screen');
  overlay.style.opacity = '0';

  setTimeout(() => {
    overlay.style.display = 'none';

    const gameInterface = el('game-interface');
    gameInterface.style.display = 'flex';
    gameInterface.style.opacity = '0';
    setTimeout(() => {
      gameInterface.style.transition = 'opacity 0.5s';
      gameInterface.style.opacity = '1';
    }, 50);

    isPlaying = true;
    el('message').innerText = 'Strike a pose!';
    scheduleClassify(100);
  }, 300);
}

function scheduleClassify(delay) {
  if (classifyScheduled || !isPlaying) return;
  classifyScheduled = true;
  setTimeout(() => {
    classifyScheduled = false;
    classifyPose();
  }, delay);
}

function classifyPose() {
  if (!isPlaying) return;

  if (pose) {
    const inputs = pose.keypoints.map(kp => [kp.position.x, kp.position.y]).flat();
    brain.classify(inputs, gotResult);
  } else {
    scheduleClassify(100);
  }
}

function gotResult(error, results) {
  if (!isPlaying) return;

  if (error) {
    console.error('classify error', error);
    scheduleClassify(200);
    return;
  }

  const top = results[0];
  const timerEl = el('timer');

  if (top.confidence > CONFIDENCE_THRESHOLD && top.label === targetLabel) {
    // Correct pose held!
    timerEl.classList.add('holding');
    iterationCounter++;

    if (iterationCounter >= HOLD_SECONDS) {
      iterationCounter = 0;
      timerEl.classList.remove('holding');
      nextPose();
    } else {
      timeLeft--;
      updateTimerDisplay(timeLeft);
      scheduleClassify(HOLD_SECONDS * 100);
    }
  } else {
    // Wrong pose
    timerEl.classList.remove('holding');
    errorCounter++;

    if (errorCounter >= HOLD_SECONDS) {
      // Reset timer with shake feedback
      iterationCounter = 0;
      timeLeft = HOLD_SECONDS;
      updateTimerDisplay(timeLeft);
      timerEl.classList.remove('shake');
      // Force reflow to restart animation
      void timerEl.offsetWidth;
      timerEl.classList.add('shake');
      errorCounter = 0;
    }
    scheduleClassify(100);
  }
}

function gotPoses(poses) {
  if (poses.length > 0) {
    pose = poses[0].pose;
    skeleton = poses[0].skeleton;
  }
}

// ── p5.js draw loop ────────────────────────────────────────────────────────
function draw() {
  push();
  translate(video.width, 0);
  scale(-1, 1);
  image(video, 0, 0, video.width, video.height);

  if (pose) {
    // Skeleton lines
    stroke(SKELETON_COLOR);
    strokeWeight(4);
    noFill();
    for (let i = 0; i < skeleton.length; i++) {
      const a = skeleton[i][0];
      const b = skeleton[i][1];
      line(a.position.x, a.position.y, b.position.x, b.position.y);
    }

    // Joints
    fill(JOINT_COLOR);
    stroke('white');
    strokeWeight(2);
    for (let i = 0; i < pose.keypoints.length; i++) {
      const { x, y } = pose.keypoints[i].position;
      ellipse(x, y, 14, 14);
    }
  }
  pop();
}

// ── Pose transitions ───────────────────────────────────────────────────────
function nextPose() {
  if (poseCounter >= TOTAL_POSES - 1) {
    showCompletion();
  } else {
    errorCounter = 0;
    iterationCounter = 0;
    poseCounter++;
    targetLabel = posesArray[poseCounter];

    updateProgress(poseCounter);
    el('poseName').innerText = 'Pose #' + targetLabel;
    el('message').innerText = '✅ Well done! Next pose incoming…';

    const poseImg = el('poseImage');
    poseImg.style.opacity = '0';
    poseImg.style.transform = 'scale(0.92)';
    setTimeout(() => {
      poseImg.src = 'img/' + targetLabel + '.png';
      poseImg.style.opacity = '1';
      poseImg.style.transform = 'scale(1)';
    }, 250);

    timeLeft = HOLD_SECONDS;
    updateTimerDisplay(timeLeft);
    scheduleClassify(4000);
  }
}

function showCompletion() {
  isPlaying = false;
  document.body.classList.add('completion-mode');
  document.querySelector('.col-webcam').style.display = 'none';

  const colPose = document.querySelector('.col-pose');
  colPose.style.flex = '1';

  const card = document.querySelector('.col-pose .glass-card');
  if (card) { 
    card.style.maxWidth = '750px'; 
    card.style.padding = '50px'; 
  }

  const poseArea = el('pose');
  if (poseArea) poseArea.style.justifyContent = 'center';

  const msgEl = el('message');
  msgEl.innerText = '';
  msgEl.style.display = 'none';

  // Update progress bar to 100%
  const bar = el('progress-bar');
  const label = el('progress-text');
  if (bar) bar.style.width = '100%';
  if (label) label.innerText = 'Complete! 🎉';

  const poseNameEl = el('poseName');
  poseNameEl.innerHTML = '🎉 Congratulations! 🎉';
  poseNameEl.style.fontFamily = "'Pacifico', cursive";
  poseNameEl.style.textTransform = "none";
  poseNameEl.style.fontSize = "3rem";

  const poseImg = el('poseImage');
  poseImg.src = 'img/congrats.jpg';
  poseImg.style.maxWidth = '100%';
  poseImg.style.margin = '20px auto';
  poseImg.style.border = 'none';
  poseImg.style.boxShadow = '0 10px 40px rgba(194,24,91,0.25)';
  poseImg.style.borderRadius = '20px';

  if (!el('congrats-text')) {
    poseImg.insertAdjacentHTML(
      'afterend',
      `<div id="congrats-text" class="congrats-text">You Did It!</div>`
    );
  }

  const timerEl = el('timer');
  if (timerEl) {
    timerEl.outerHTML = `<button id="restart-btn" onclick="restartGame()">Try Again</button>`;
  }

  const skipBtn = el('skip-btn');
  if (skipBtn) skipBtn.style.display = 'none';
}

// ── Restart (soft reset — no full page reload) ─────────────────────────────
function restartGame() {
  // Reset state
  document.body.classList.remove('completion-mode');
  poseCounter = 0;
  errorCounter = 0;
  iterationCounter = 0;
  timeLeft = HOLD_SECONDS;
  isPlaying = false;
  classifyScheduled = false;
  pose = null;
  skeleton = null;
  targetLabel = posesArray[0];

  // Restore layout
  const colWebcam = document.querySelector('.col-webcam');
  if (colWebcam) colWebcam.style.display = '';

  const colPose = document.querySelector('.col-pose');
  if (colPose) colPose.style.flex = '';

  const card = document.querySelector('.col-pose .card');
  if (card) { card.style.maxWidth = ''; card.style.padding = ''; }

  // Restore message bar
  const msgEl = el('message');
  msgEl.style.display = '';
  msgEl.innerText = 'Ready! Click Start to begin.';

  // Remove congrats text if injected
  const ct = el('congrats-text');
  if (ct) ct.remove();

  // Restore timer (replace restart-btn with timer div)
  const restartBtn = el('restart-btn');
  if (restartBtn) {
    restartBtn.outerHTML = `<div id="timer" class="pulse-timer">${HOLD_SECONDS}</div>`;
  }

  // Restore skip btn
  const skipBtn = el('skip-btn');
  if (skipBtn) skipBtn.style.display = '';

  // Reset pose image
  const poseImg = el('poseImage');
  poseImg.src = 'img/' + targetLabel + '.png';
  poseImg.style.maxWidth = '';
  poseImg.style.margin = '';
  poseImg.style.border = '';
  poseImg.style.boxShadow = '';

  const poseNameEl = el('poseName');
  poseNameEl.innerText = 'Pose #' + targetLabel;
  poseNameEl.style = '';
  updateProgress(0);

  // Hide game interface and show instruction screen
  const gameInterface = el('game-interface');
  if (gameInterface) {
    gameInterface.style.display = 'none';
    gameInterface.style.opacity = '0';
  }

  const overlay = el('instruction-screen');
  overlay.style.opacity = '1';
  overlay.style.display = 'flex';
}

// ── Skip pose ──────────────────────────────────────────────────────────────
function skipPose() {
  if (!isPlaying) return;

  if (poseCounter < TOTAL_POSES - 1) {
    errorCounter = 0;
    iterationCounter = 0;
    poseCounter++;
    targetLabel = posesArray[poseCounter];

    updateProgress(poseCounter);
    el('poseName').innerText = 'Pose #' + targetLabel;

    const poseImg = el('poseImage');
    poseImg.style.opacity = '0';
    poseImg.style.transform = 'scale(0.92)';
    setTimeout(() => {
      poseImg.src = 'img/' + targetLabel + '.png';
      poseImg.style.opacity = '1';
      poseImg.style.transform = 'scale(1)';
    }, 250);

    timeLeft = HOLD_SECONDS;
    updateTimerDisplay(timeLeft);
    scheduleClassify(100);
  } else {
    showCompletion();
  }
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && el('instruction-screen').style.display !== 'none') {
    startGame();
  } else if (e.code === 'Space' && isPlaying) {
    e.preventDefault();
    skipPose();
  }
});

// ── Timer Helper ───────────────────────────────────────────────────────────
function updateTimerDisplay(time) {
  const timerEl = el('timer');
  if (!timerEl) return;
  timerEl.innerText = time;

  // Reversing colors: starts red (work), ends green (success)
  if (time <= 3) {
    timerEl.style.setProperty('--timer-color', '#34c759'); // Green (Almost done/Success)
  } else if (time <= 6) {
    timerEl.style.setProperty('--timer-color', '#ff9500'); // Orange (Halfway)
  } else {
    timerEl.style.setProperty('--timer-color', '#ff3b30'); // Red (Starting/Work)
  }
}
