import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.119.1/build/three.module.min.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.119.1/examples/jsm/controls/OrbitControls.min.js";
import { VRButton } from "https://cdn.jsdelivr.net/npm/three@0.119.1/examples/jsm/webxr/VRButton.min.js";
import { XRControllerModelFactory } from "https://cdn.jsdelivr.net/npm/three@0.119.1/examples/jsm/webxr/XRControllerModelFactory.min.js";

var container;
var camera, scene, renderer;
var controller1, controller2;
var controllerGrip1, controllerGrip2;

var raycaster, intersected = [];
var tempMatrix = new THREE.Matrix4();

var controls, group;

var dolly;
var cameraVector = new THREE.Vector3(); // reuse this vector
// a variable to store the values from the last polling of the gamepads
const prevGamePads = new Map();

// default values for speed movement of each axis
var speedFactor = [0.1, 0.1, 0.1, 0.1];

init();
animate();

function init() {
  container = document.createElement("div");
  document.body.appendChild(container);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x808080);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(0, 1.6, 3);

  // Replace the plain floor with a grid helper (which is already wireframe)
  const gridHelper = new THREE.GridHelper(100, 100, 0xeeeeee, 0x888888);
  scene.add(gridHelper);

  // Lighting
  scene.add(new THREE.HemisphereLight(0x808080, 0x606060));

  var light = new THREE.DirectionalLight(0xffffff);
  light.position.set(0, 200, 0);
  light.castShadow = true;
  light.shadow.camera.top = 200;
  light.shadow.camera.bottom = -200;
  light.shadow.camera.right = 200;
  light.shadow.camera.left = -200;
  light.shadow.mapSize.set(4096, 4096);
  scene.add(light);

  // Group for random objects
  group = new THREE.Group();
  scene.add(group);

  var geometries = [
    new THREE.BoxBufferGeometry(0.2, 0.2, 0.2),
    new THREE.ConeBufferGeometry(0.2, 0.2, 64),
    new THREE.CylinderBufferGeometry(0.2, 0.2, 0.2, 64),
    new THREE.IcosahedronBufferGeometry(0.2, 3),
    new THREE.TorusBufferGeometry(0.2, 0.04, 64, 32)
  ];

  // Create 100 random objects with wireframe materials
  for (var i = 0; i < 100; i++) {
    var geometry = geometries[Math.floor(Math.random() * geometries.length)];
    var material = new THREE.MeshStandardMaterial({
      color: Math.random() * 0xffffff,
      roughness: 0.7,
      side: THREE.DoubleSide,
      metalness: 0.0,
      wireframe: true // all materials in wireframe mode
    });

    var object = new THREE.Mesh(geometry, material);

    object.position.x = Math.random() * 200 - 100;
    object.position.y = Math.random() * 100;
    object.position.z = Math.random() * 200 - 100;

    object.rotation.x = Math.random() * 2 * Math.PI;
    object.rotation.y = Math.random() * 2 * Math.PI;
    object.rotation.z = Math.random() * 2 * Math.PI;

    object.scale.setScalar(Math.random() * 20 + 0.5);

    object.castShadow = true;
    object.receiveShadow = true;

    group.add(object);
  }

  // Renderer setup
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.xr.enabled = true;
  // increases the resolution on Quest
  renderer.xr.setFramebufferScaleFactor(2.0);
  container.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.6, 0);
  controls.update();

  // Setup controllers
  controller1 = renderer.xr.getController(0);
  controller1.name = "left";
  controller1.addEventListener("selectstart", onSelectStart);
  controller1.addEventListener("selectend", onSelectEnd);
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  controller2.name = "right";
  controller2.addEventListener("selectstart", onSelectStart);
  controller2.addEventListener("selectend", onSelectEnd);
  scene.add(controller2);

  var controllerModelFactory = new XRControllerModelFactory();

  controllerGrip1 = renderer.xr.getControllerGrip(0);
  controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
  scene.add(controllerGrip1);

  controllerGrip2 = renderer.xr.getControllerGrip(1);
  controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
  scene.add(controllerGrip2);

  // Raycaster geometry for controller pointers
  var rayGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1)
  ]);

  var line = new THREE.Line(rayGeo);
  line.name = "line";
  line.scale.z = 5;

  controller1.add(line.clone());
  controller2.add(line.clone());

  raycaster = new THREE.Raycaster();

  // Create a dolly for the camera and reparent controllers to it
  dolly = new THREE.Group();
  dolly.position.set(0, 0, 0);
  dolly.name = "dolly";
  scene.add(dolly);
  dolly.add(camera);
  dolly.add(controller1);
  dolly.add(controller2);
  dolly.add(controllerGrip1);
  dolly.add(controllerGrip2);

  window.addEventListener("resize", onWindowResize, false);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onSelectStart(event) {
  var controller = event.target;

  var intersections = getIntersections(controller);

  if (intersections.length > 0) {
    var intersection = intersections[0];
    var object = intersection.object;
    object.material.emissive.b = 1;
    controller.attach(object);
    controller.userData.selected = object;
  }
}

function onSelectEnd(event) {
  var controller = event.target;
  if (controller.userData.selected !== undefined) {
    var object = controller.userData.selected;
    object.material.emissive.b = 0;
    group.attach(object);
    controller.userData.selected = undefined;
  }
}

function getIntersections(controller) {
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  return raycaster.intersectObjects(group.children);
}

function intersectObjects(controller) {
  // Do not highlight if already selected
  if (controller.userData.selected !== undefined) return;

  var line = controller.getObjectByName("line");
  var intersections = getIntersections(controller);

  if (intersections.length > 0) {
    var intersection = intersections[0];
    // Provide haptic feedback if intersecting an object
    const session = renderer.xr.getSession();
    if (session) { // only in a WebXR session
      for (const sourceXR of session.inputSources) {
        if (!sourceXR.gamepad) continue;
        if (
          sourceXR.gamepad.hapticActuators &&
          sourceXR.gamepad.hapticActuators[0] &&
          sourceXR.handedness == controller.name
        ) {
          // Only pulse the defined haptic actuator
          sourceXR.gamepad.hapticActuators[0].pulse(0.8, 100);
        }
      }
    }

    var object = intersection.object;
    object.material.emissive.r = 1;
    intersected.push(object);

    line.scale.z = intersection.distance;
  } else {
    line.scale.z = 50;
  }
}

function cleanIntersected() {
  while (intersected.length) {
    var object = intersected.pop();
    object.material.emissive.r = 0;
  }
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render() {
  cleanIntersected();

  intersectObjects(controller1);
  intersectObjects(controller2);

  // Poll gamepad data to move/rotate the dolly
  dollyMove();

  renderer.render(scene, camera);
}

function dollyMove() {
  var handedness = "unknown";

  // Determine if we are in an XR session
  const session = renderer.xr.getSession();
  let i = 0;

  if (session) {
    let xrCamera = renderer.xr.getCamera(camera);
    xrCamera.getWorldDirection(cameraVector);

    if (isIterable(session.inputSources)) {
      for (const source of session.inputSources) {
        if (source && source.handedness) {
          handedness = source.handedness; // left or right controller
        }
        if (!source.gamepad) continue;
        const controller = renderer.xr.getController(i++);
        const old = prevGamePads.get(source);
        const data = {
          handedness: handedness,
          buttons: source.gamepad.buttons.map((b) => b.value),
          axes: source.gamepad.axes.slice(0)
        };
        if (old) {
          data.buttons.forEach((value, i) => {
            if (value !== old.buttons[i] || Math.abs(value) > 0.8) {
              if (value === 1) {
                if (data.handedness == "left") {
                  if (i == 1) {
                    dolly.rotateY(-THREE.Math.degToRad(1));
                  }
                  if (i == 3) {
                    // Reset teleport to home position
                    dolly.position.x = 0;
                    dolly.position.y = 5;
                    dolly.position.z = 0;
                  }
                } else {
                  if (i == 1) {
                    dolly.rotateY(THREE.Math.degToRad(1));
                  }
                }
              } else {
                if (i == 1) {
                  if (data.handedness == "left") {
                    dolly.rotateY(-THREE.Math.degToRad(Math.abs(value)));
                  } else {
                    dolly.rotateY(THREE.Math.degToRad(Math.abs(value)));
                  }
                }
              }
            }
          });
          data.axes.forEach((value, i) => {
            if (Math.abs(value) > 0.2) {
              speedFactor[i] > 1 ? (speedFactor[i] = 1) : (speedFactor[i] *= 1.001);
              console.log(value, speedFactor[i], i);
              if (i == 2) {
                if (data.handedness == "left") {
                  dolly.position.x -= cameraVector.z * speedFactor[i] * data.axes[2];
                  dolly.position.z += cameraVector.x * speedFactor[i] * data.axes[2];
                  if (source.gamepad.hapticActuators && source.gamepad.hapticActuators[0]) {
                    var pulseStrength = Math.abs(data.axes[2]) + Math.abs(data.axes[3]);
                    if (pulseStrength > 0.75) {
                      pulseStrength = 0.75;
                    }
                    source.gamepad.hapticActuators[0].pulse(pulseStrength, 100);
                  }
                } else {
                  dolly.rotateY(-THREE.Math.degToRad(data.axes[2]));
                }
                controls.update();
              }
              if (i == 3) {
                if (data.handedness == "left") {
                  dolly.position.y -= speedFactor[i] * data.axes[3];
                  if (source.gamepad.hapticActuators && source.gamepad.hapticActuators[0]) {
                    var pulseStrength = Math.abs(data.axes[3]);
                    if (pulseStrength > 0.75) {
                      pulseStrength = 0.75;
                    }
                    source.gamepad.hapticActuators[0].pulse(pulseStrength, 100);
                  }
                } else {
                  dolly.position.x -= cameraVector.x * speedFactor[i] * data.axes[3];
                  dolly.position.z -= cameraVector.z * speedFactor[i] * data.axes[3];
                  if (source.gamepad.hapticActuators && source.gamepad.hapticActuators[0]) {
                    var pulseStrength = Math.abs(data.axes[2]) + Math.abs(data.axes[3]);
                    if (pulseStrength > 0.75) {
                      pulseStrength = 0.75;
                    }
                    source.gamepad.hapticActuators[0].pulse(pulseStrength, 100);
                  }
                }
                controls.update();
              }
            } else {
              if (Math.abs(value) > 0.025) {
                speedFactor[i] = 0.025;
              }
            }
          });
        }
        prevGamePads.set(source, data);
      }
    }
  }
}

function isIterable(obj) {
  if (obj == null) {
    return false;
  }
  return typeof obj[Symbol.iterator] === "function";
}
