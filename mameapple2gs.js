// include: shell.js
// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module != 'undefined' ? Module : {};

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)
// license:BSD-3-Clause
// copyright-holders:Grant Galitz, Katelyn Gadd
/***************************************************************************

  JSMAME web audio backend v0.4

  Original by katelyn gadd - kg at luminance dot org ; @antumbral on twitter
  Substantial changes by taisel

***************************************************************************/

var jsmame_web_audio = (function () {

  var context = null;
  var gain_node = null;
  var eventNode = null;
  var sampleScale = 32766;
  var inputBuffer = new Float32Array(44100);
  var bufferSize = 44100;
  var start = 0;
  var rear = 0;
  var watchDogDateLast = null;
  var watchDogTimerEvent = null;

  function lazy_init() {
    //Make
    if (context) {
      //Return if already created:
      return;
    }
    if (typeof AudioContext != "undefined") {
      //Standard context creation:
      context = new AudioContext();
    }
    else if (typeof webkitAudioContext != "undefined") {
      //Older webkit context creation:
      context = new webkitAudioContext();
    }
    else {
      //API not found!
      return;
    }
    //Generate a volume control node:
    gain_node = context.createGain();
    //Set initial volume to 1:
    gain_node.gain.value = 1.0;
    //Connect volume node to output:
    gain_node.connect(context.destination);
    //Initialize the streaming event:
    init_event();
  };

  function init_event() {
    //Generate a streaming node point:
    if (typeof context.createScriptProcessor == "function") {
      //Current standard compliant way:
      eventNode = context.createScriptProcessor(4096, 0, 2);
    }
    else {
      //Deprecated way:
      eventNode = context.createJavaScriptNode(4096, 0, 2);
    }
    //Make our tick function the audio callback function:
    eventNode.onaudioprocess = tick;
    //Connect stream to volume control node:
    eventNode.connect(gain_node);
    //Workarounds for browser issues:
    initializeWatchDog();
  };

  function initializeWatchDog() {
    watchDogDateLast = (new Date()).getTime();
    if (watchDogTimerEvent === null) {
      watchDogTimerEvent = setInterval(function () {
        var timeDiff = (new Date()).getTime() - watchDogDateLast;
        if (timeDiff > 500) {
          //WORKAROUND FOR FIREFOX BUG:
          //TODO: decide if we want to user agent sniff Firefox here,
          //since Google Chrome doesn't need this:
          disconnect_old_event();
          init_event();

          //Work around autoplay restrictions in Chrome 71+ https://developers.google.com/web/updates/2017/09/autoplay-policy-changes#webaudio
          if (context) {
            context.resume();
          }
        }
      }, 500);
    }
  };

  function disconnect_old_event() {
    //Disconnect from audio graph:
    eventNode.disconnect();
    //IIRC there was a firefox bug that did not GC this event when nulling the node itself:
    eventNode.onaudioprocess = null;
    //Null the glitched/unused node:
    eventNode = null;
  };

  function stream_sink_update(
    pBuffer,           // pointer into emscripten heap. int16 samples
    samples_this_frame // int. number of samples at pBuffer address.
  ) {
    lazy_init();
    if (!context) return;

    for (
      var i = 0,
      l = samples_this_frame | 0;
      i < l;
      i++
    ) {
      var offset =
        // divide by sizeof(int16_t) since pBuffer is offset
        //  in bytes
        ((pBuffer / 2) | 0) +
        ((i * 2) | 0);

      var left_sample = HEAP16[offset];
      var right_sample = HEAP16[(offset + 1) | 0];

      // normalize from signed int16 to signed float
      var left_sample_float = left_sample / sampleScale;
      var right_sample_float = right_sample / sampleScale;

      inputBuffer[rear++] = left_sample_float;
      inputBuffer[rear++] = right_sample_float;
      if (rear == bufferSize) {
        rear = 0;
      }
      if (start == rear) {
        start += 2;
        if (start == bufferSize) {
          start = 0;
        }
      }
    }
  };

  function tick(event) {
    //Find all output channels:
    for (var bufferCount = 0, buffers = []; bufferCount < 2; ++bufferCount) {
      buffers[bufferCount] = event.outputBuffer.getChannelData(bufferCount);
    }
    //Copy samples from the input buffer to the Web Audio API:
    for (var index = 0; index < 4096 && start != rear; ++index) {
      buffers[0][index] = inputBuffer[start++];
      buffers[1][index] = inputBuffer[start++];
      if (start == bufferSize) {
        start = 0;
      }
    }
    //Pad with latest if we're underrunning:
    var idx = (index == 0 ? bufferSize : index) - 1;
    while (index < 4096) {
      buffers[0][index] = buffers[0][idx];
      buffers[1][index++] = buffers[1][idx];
    }
    //Deep inside the bowels of vendors bugs,
    //we're using watchdog for a firefox bug,
    //where the user agent decides to stop firing events
    //if the user agent lags out due to system load.
    //Don't even ask....
    watchDogDateLast = (new Date()).getTime();
  }

  function get_context() {
    return context;
  };

  function sample_count() {
    //TODO get someone to call this from the emulator,
    //so the emulator can do proper audio buffering by
    //knowing how many samples are left:
    if (!context) {
      //Use impossible value as an error code:
      return -1;
    }
    var count = rear - start;
    if (start > rear) {
      count += bufferSize;
    }
    return count;
  }

  return {
    stream_sink_update: stream_sink_update,
    get_context: get_context,
    sample_count: sample_count
  };

})();

window.jsmame_stream_sink_update = jsmame_web_audio.stream_sink_update;
window.jsmame_sample_count = jsmame_web_audio.sample_count;


// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = Object.assign({}, Module);

var arguments_ = [];
var thisProgram = './this.program';
var quit_ = (status, toThrow) => {
  throw toThrow;
};

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).

// Attempt to auto-detect the environment
var ENVIRONMENT_IS_WEB = typeof window == 'object';
var ENVIRONMENT_IS_WORKER = typeof importScripts == 'function';
// N.b. Electron.js environment is simultaneously a NODE-environment, but
// also a web environment.
var ENVIRONMENT_IS_NODE = typeof process == 'object' && typeof process.versions == 'object' && typeof process.versions.node == 'string';
var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;

if (Module['ENVIRONMENT']) {
  throw new Error('Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)');
}

// `/` should be present at the end if `scriptDirectory` is not empty
var scriptDirectory = '';
function locateFile(path) {
  if (Module['locateFile']) {
    return Module['locateFile'](path, scriptDirectory);
  }
  return scriptDirectory + path;
}

// Hooks that are implemented differently in different runtime environments.
var read_,
  readAsync,
  readBinary;

if (ENVIRONMENT_IS_NODE) {
  if (typeof process == 'undefined' || !process.release || process.release.name !== 'node') throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

  var nodeVersion = process.versions.node;
  var numericVersion = nodeVersion.split('.').slice(0, 3);
  numericVersion = (numericVersion[0] * 10000) + (numericVersion[1] * 100) + (numericVersion[2].split('-')[0] * 1);
  var minVersion = 160000;
  if (numericVersion < 160000) {
    throw new Error('This emscripten-generated code requires node v16.0.0 (detected v' + nodeVersion + ')');
  }

  // `require()` is no-op in an ESM module, use `createRequire()` to construct
  // the require()` function.  This is only necessary for multi-environment
  // builds, `-sENVIRONMENT=node` emits a static import declaration instead.
  // TODO: Swap all `require()`'s with `import()`'s?
  // These modules will usually be used on Node.js. Load them eagerly to avoid
  // the complexity of lazy-loading.
  var fs = require('fs');
  var nodePath = require('path');

  if (ENVIRONMENT_IS_WORKER) {
    scriptDirectory = nodePath.dirname(scriptDirectory) + '/';
  } else {
    scriptDirectory = __dirname + '/';
  }

  // include: node_shell_read.js
  read_ = (filename, binary) => {
    // We need to re-wrap `file://` strings to URLs. Normalizing isn't
    // necessary in that case, the path should already be absolute.
    filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
    return fs.readFileSync(filename, binary ? undefined : 'utf8');
  };

  readBinary = (filename) => {
    var ret = read_(filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  readAsync = (filename, onload, onerror, binary = true) => {
    // See the comment in the `read_` function.
    filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
    fs.readFile(filename, binary ? undefined : 'utf8', (err, data) => {
      if (err) onerror(err);
      else onload(binary ? data.buffer : data);
    });
  };
  // end include: node_shell_read.js
  if (!Module['thisProgram'] && process.argv.length > 1) {
    thisProgram = process.argv[1].replace(/\\/g, '/');
  }

  arguments_ = process.argv.slice(2);

  if (typeof module != 'undefined') {
    module['exports'] = Module;
  }

  process.on('uncaughtException', (ex) => {
    // suppress ExitStatus exceptions from showing an error
    if (ex !== 'unwind' && !(ex instanceof ExitStatus) && !(ex.context instanceof ExitStatus)) {
      throw ex;
    }
  });

  quit_ = (status, toThrow) => {
    process.exitCode = status;
    throw toThrow;
  };

  Module['inspect'] = () => '[Emscripten Module object]';

} else
  if (ENVIRONMENT_IS_SHELL) {

    if ((typeof process == 'object' && typeof require === 'function') || typeof window == 'object' || typeof importScripts == 'function') throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

    if (typeof read != 'undefined') {
      read_ = read;
    }

    readBinary = (f) => {
      if (typeof readbuffer == 'function') {
        return new Uint8Array(readbuffer(f));
      }
      let data = read(f, 'binary');
      assert(typeof data == 'object');
      return data;
    };

    readAsync = (f, onload, onerror) => {
      setTimeout(() => onload(readBinary(f)));
    };

    if (typeof clearTimeout == 'undefined') {
      globalThis.clearTimeout = (id) => { };
    }

    if (typeof setTimeout == 'undefined') {
      // spidermonkey lacks setTimeout but we use it above in readAsync.
      globalThis.setTimeout = (f) => (typeof f == 'function') ? f() : abort();
    }

    if (typeof scriptArgs != 'undefined') {
      arguments_ = scriptArgs;
    } else if (typeof arguments != 'undefined') {
      arguments_ = arguments;
    }

    if (typeof quit == 'function') {
      quit_ = (status, toThrow) => {
        // Unlike node which has process.exitCode, d8 has no such mechanism. So we
        // have no way to set the exit code and then let the program exit with
        // that code when it naturally stops running (say, when all setTimeouts
        // have completed). For that reason, we must call `quit` - the only way to
        // set the exit code - but quit also halts immediately.  To increase
        // consistency with node (and the web) we schedule the actual quit call
        // using a setTimeout to give the current stack and any exception handlers
        // a chance to run.  This enables features such as addOnPostRun (which
        // expected to be able to run code after main returns).
        setTimeout(() => {
          if (!(toThrow instanceof ExitStatus)) {
            let toLog = toThrow;
            if (toThrow && typeof toThrow == 'object' && toThrow.stack) {
              toLog = [toThrow, toThrow.stack];
            }
            err(`exiting due to exception: ${toLog}`);
          }
          quit(status);
        });
        throw toThrow;
      };
    }

    if (typeof print != 'undefined') {
      // Prefer to use print/printErr where they exist, as they usually work better.
      if (typeof console == 'undefined') console = /** @type{!Console} */({});
      console.log = /** @type{!function(this:Console, ...*): undefined} */ (print);
      console.warn = console.error = /** @type{!function(this:Console, ...*): undefined} */ (typeof printErr != 'undefined' ? printErr : print);
    }

  } else

    // Note that this includes Node.js workers when relevant (pthreads is enabled).
    // Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
    // ENVIRONMENT_IS_NODE.
    if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
      if (ENVIRONMENT_IS_WORKER) { // Check worker, not web, since window could be polyfilled
        scriptDirectory = self.location.href;
      } else if (typeof document != 'undefined' && document.currentScript) { // web
        scriptDirectory = document.currentScript.src;
      }
      // blob urls look like blob:http://site.com/etc/etc and we cannot infer anything from them.
      // otherwise, slice off the final part of the url to find the script directory.
      // if scriptDirectory does not contain a slash, lastIndexOf will return -1,
      // and scriptDirectory will correctly be replaced with an empty string.
      // If scriptDirectory contains a query (starting with ?) or a fragment (starting with #),
      // they are removed because they could contain a slash.
      if (scriptDirectory.indexOf('blob:') !== 0) {
        scriptDirectory = scriptDirectory.substr(0, scriptDirectory.replace(/[?#].*/, "").lastIndexOf('/') + 1);
      } else {
        scriptDirectory = '';
      }

      if (!(typeof window == 'object' || typeof importScripts == 'function')) throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

      // Differentiate the Web Worker from the Node Worker case, as reading must
      // be done differently.
      {
        // include: web_or_worker_shell_read.js
        read_ = (url) => {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url, false);
          xhr.send(null);
          return xhr.responseText;
        }

        if (ENVIRONMENT_IS_WORKER) {
          readBinary = (url) => {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            xhr.responseType = 'arraybuffer';
            xhr.send(null);
            return new Uint8Array(/** @type{!ArrayBuffer} */(xhr.response));
          };
        }

        readAsync = (url, onload, onerror) => {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.responseType = 'arraybuffer';
          xhr.onload = () => {
            if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
              onload(xhr.response);
              return;
            }
            onerror();
          };
          xhr.onerror = onerror;
          xhr.send(null);
        }

        // end include: web_or_worker_shell_read.js
      }
    } else {
      throw new Error('environment detection error');
    }

var out = Module['print'] || console.log.bind(console);
var err = Module['printErr'] || console.error.bind(console);

// Merge back in the overrides
Object.assign(Module, moduleOverrides);
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = null;
checkIncomingModuleAPI();

// Emit code to handle expected values on the Module object. This applies Module.x
// to the proper local x. This has two benefits: first, we only emit it if it is
// expected to arrive, and second, by using a local everywhere else that can be
// minified.

if (Module['arguments']) arguments_ = Module['arguments']; legacyModuleProp('arguments', 'arguments_');

if (Module['thisProgram']) thisProgram = Module['thisProgram']; legacyModuleProp('thisProgram', 'thisProgram');

if (Module['quit']) quit_ = Module['quit']; legacyModuleProp('quit', 'quit_');

// perform assertions in shell.js after we set up out() and err(), as otherwise if an assertion fails it cannot print the message
// Assertions on removed incoming Module JS APIs.
assert(typeof Module['memoryInitializerPrefixURL'] == 'undefined', 'Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['pthreadMainPrefixURL'] == 'undefined', 'Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['cdInitializerPrefixURL'] == 'undefined', 'Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['filePackagePrefixURL'] == 'undefined', 'Module.filePackagePrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['read'] == 'undefined', 'Module.read option was removed (modify read_ in JS)');
assert(typeof Module['readAsync'] == 'undefined', 'Module.readAsync option was removed (modify readAsync in JS)');
assert(typeof Module['readBinary'] == 'undefined', 'Module.readBinary option was removed (modify readBinary in JS)');
assert(typeof Module['setWindowTitle'] == 'undefined', 'Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)');
assert(typeof Module['TOTAL_MEMORY'] == 'undefined', 'Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY');
legacyModuleProp('asm', 'wasmExports');
legacyModuleProp('read', 'read_');
legacyModuleProp('readAsync', 'readAsync');
legacyModuleProp('readBinary', 'readBinary');
legacyModuleProp('setWindowTitle', 'setWindowTitle');
var IDBFS = 'IDBFS is no longer included by default; build with -lidbfs.js';
var PROXYFS = 'PROXYFS is no longer included by default; build with -lproxyfs.js';
var WORKERFS = 'WORKERFS is no longer included by default; build with -lworkerfs.js';
var FETCHFS = 'FETCHFS is no longer included by default; build with -lfetchfs.js';
var ICASEFS = 'ICASEFS is no longer included by default; build with -licasefs.js';
var JSFILEFS = 'JSFILEFS is no longer included by default; build with -ljsfilefs.js';
var OPFS = 'OPFS is no longer included by default; build with -lopfs.js';

var NODEFS = 'NODEFS is no longer included by default; build with -lnodefs.js';

assert(!ENVIRONMENT_IS_SHELL, "shell environment detected but not enabled at build time.  Add 'shell' to `-sENVIRONMENT` to enable.");


// end include: shell.js
// include: preamble.js
// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

var wasmBinary;
if (Module['wasmBinary']) wasmBinary = Module['wasmBinary']; legacyModuleProp('wasmBinary', 'wasmBinary');

if (typeof WebAssembly != 'object') {
  abort('no native wasm support detected');
}

// include: base64Utils.js
// Converts a string of base64 into a byte array (Uint8Array).
function intArrayFromBase64(s) {
  if (typeof ENVIRONMENT_IS_NODE != 'undefined' && ENVIRONMENT_IS_NODE) {
    var buf = Buffer.from(s, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
  }

  var decoded = atob(s);
  var bytes = new Uint8Array(decoded.length);
  for (var i = 0; i < decoded.length; ++i) {
    bytes[i] = decoded.charCodeAt(i);
  }
  return bytes;
}

// If filename is a base64 data URI, parses and returns data (Buffer on node,
// Uint8Array otherwise). If filename is not a base64 data URI, returns undefined.
function tryParseAsDataURI(filename) {
  if (!isDataURI(filename)) {
    return;
  }

  return intArrayFromBase64(filename.slice(dataURIPrefix.length));
}
// end include: base64Utils.js
// Wasm globals

var wasmMemory;

//========================================
// Runtime essentials
//========================================

// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS;

// In STRICT mode, we only define assert() when ASSERTIONS is set.  i.e. we
// don't define it at all in release modes.  This matches the behaviour of
// MINIMAL_RUNTIME.
// TODO(sbc): Make this the default even without STRICT enabled.
/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed' + (text ? ': ' + text : ''));
  }
}

// We used to include malloc/free by default in the past. Show a helpful error in
// builds with assertions.

// Memory management

var HEAP,
  /** @type {!Int8Array} */
  HEAP8,
  /** @type {!Uint8Array} */
  HEAPU8,
  /** @type {!Int16Array} */
  HEAP16,
  /** @type {!Uint16Array} */
  HEAPU16,
  /** @type {!Int32Array} */
  HEAP32,
  /** @type {!Uint32Array} */
  HEAPU32,
  /** @type {!Float32Array} */
  HEAPF32,
  /** @type {!Float64Array} */
  HEAPF64;

function updateMemoryViews() {
  var b = wasmMemory.buffer;
  Module['HEAP8'] = HEAP8 = new Int8Array(b);
  Module['HEAP16'] = HEAP16 = new Int16Array(b);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(b);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(b);
  Module['HEAP32'] = HEAP32 = new Int32Array(b);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(b);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(b);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(b);
}

assert(!Module['STACK_SIZE'], 'STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time')

assert(typeof Int32Array != 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray != undefined && Int32Array.prototype.set != undefined,
  'JS engine does not provide full typed array support');

// If memory is defined in wasm, the user can't provide it, or set INITIAL_MEMORY
assert(!Module['wasmMemory'], 'Use of `wasmMemory` detected.  Use -sIMPORTED_MEMORY to define wasmMemory externally');
assert(!Module['INITIAL_MEMORY'], 'Detected runtime INITIAL_MEMORY setting.  Use -sIMPORTED_MEMORY to define wasmMemory dynamically');

// include: runtime_stack_check.js
// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  var max = _emscripten_stack_get_end();
  assert((max & 3) == 0);
  // If the stack ends at address zero we write our cookies 4 bytes into the
  // stack.  This prevents interference with SAFE_HEAP and ASAN which also
  // monitor writes to address zero.
  if (max == 0) {
    max += 4;
  }
  // The stack grow downwards towards _emscripten_stack_get_end.
  // We write cookies to the final two words in the stack and detect if they are
  // ever overwritten.
  HEAPU32[((max) >> 2)] = 0x02135467;
  HEAPU32[(((max) + (4)) >> 2)] = 0x89BACDFE;
  // Also test the global address 0 for integrity.
  HEAPU32[((0) >> 2)] = 1668509029;
}

function checkStackCookie() {
  if (ABORT) return;
  var max = _emscripten_stack_get_end();
  // See writeStackCookie().
  if (max == 0) {
    max += 4;
  }
  var cookie1 = HEAPU32[((max) >> 2)];
  var cookie2 = HEAPU32[(((max) + (4)) >> 2)];
  if (cookie1 != 0x02135467 || cookie2 != 0x89BACDFE) {
    abort(`Stack overflow! Stack cookie has been overwritten at ${ptrToString(max)}, expected hex dwords 0x89BACDFE and 0x2135467, but received ${ptrToString(cookie2)} ${ptrToString(cookie1)}`);
  }
  // Also test the global address 0 for integrity.
  if (HEAPU32[((0) >> 2)] != 0x63736d65 /* 'emsc' */) {
    abort('Runtime error: The application has corrupted its heap memory area (address zero)!');
  }
}
// end include: runtime_stack_check.js
// include: runtime_assertions.js
// Endianness check
(function () {
  var h16 = new Int16Array(1);
  var h8 = new Int8Array(h16.buffer);
  h16[0] = 0x6373;
  if (h8[0] !== 0x73 || h8[1] !== 0x63) throw 'Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)';
})();

// end include: runtime_assertions.js
var __ATPRERUN__ = []; // functions called before the runtime is initialized
var __ATINIT__ = []; // functions called during startup
var __ATMAIN__ = []; // functions called when main() is to be run
var __ATEXIT__ = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the main() is called

var runtimeInitialized = false;

function preRun() {
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function initRuntime() {
  assert(!runtimeInitialized);
  runtimeInitialized = true;

  checkStackCookie();


  if (!Module["noFSInit"] && !FS.init.initialized)
    FS.init();
  FS.ignorePermissions = false;

  TTY.init();
  SOCKFS.root = FS.mount(SOCKFS, {}, null);
  PIPEFS.root = FS.mount(PIPEFS, {}, null);
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();

  callRuntimeCallbacks(__ATMAIN__);
}

function postRun() {
  checkStackCookie();

  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }

  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}

function addOnExit(cb) {
}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

// include: runtime_math.js
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/fround

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/trunc

assert(Math.imul, 'This browser does not support Math.imul(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.fround, 'This browser does not support Math.fround(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.clz32, 'This browser does not support Math.clz32(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.trunc, 'This browser does not support Math.trunc(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
// end include: runtime_math.js
// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// Module.preRun (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
}

function addRunDependency(id) {
  runDependencies++;

  Module['monitorRunDependencies']?.(runDependencies);

  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval != 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(() => {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            err('still waiting on run dependencies:');
          }
          err(`dependency: ${dep}`);
        }
        if (shown) {
          err('(end of list)');
        }
      }, 10000);
    }
  } else {
    err('warning: run dependency added without ID');
  }
}

function removeRunDependency(id) {
  runDependencies--;

  Module['monitorRunDependencies']?.(runDependencies);

  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    err('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}

/** @param {string|number=} what */
function abort(what) {
  Module['onAbort']?.(what);

  what = 'Aborted(' + what + ')';
  // TODO(sbc): Should we remove printing and leave it up to whoever
  // catches the exception?
  err(what);

  ABORT = true;
  EXITSTATUS = 1;

  // Use a wasm runtime error, because a JS error might be seen as a foreign
  // exception, which means we'd run destructors on it. We need the error to
  // simply make the program stop.
  // FIXME This approach does not work in Wasm EH because it currently does not assume
  // all RuntimeErrors are from traps; it decides whether a RuntimeError is from
  // a trap or not based on a hidden field within the object. So at the moment
  // we don't have a way of throwing a wasm trap from JS. TODO Make a JS API that
  // allows this in the wasm spec.

  // Suppress closure compiler warning here. Closure compiler's builtin extern
  // defintion for WebAssembly.RuntimeError claims it takes no arguments even
  // though it can.
  // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure gets fixed.
  /** @suppress {checkTypes} */
  var e = new WebAssembly.RuntimeError(what);

  // Throw the error whether or not MODULARIZE is set because abort is used
  // in code paths apart from instantiation where an exception is expected
  // to be thrown when abort is called.
  throw e;
}

// include: memoryprofiler.js
// end include: memoryprofiler.js
// include: URIUtils.js
// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

/**
 * Indicates whether filename is a base64 data URI.
 * @noinline
 */
var isDataURI = (filename) => filename.startsWith(dataURIPrefix);

/**
 * Indicates whether filename is delivered via file protocol (as opposed to http/https)
 * @noinline
 */
var isFileURI = (filename) => filename.startsWith('file://');
// end include: URIUtils.js
function createExportWrapper(name) {
  return function () {
    assert(runtimeInitialized, `native function \`${name}\` called before runtime initialization`);
    var f = wasmExports[name];
    assert(f, `exported native function \`${name}\` not found`);
    return f.apply(null, arguments);
  };
}

// include: runtime_exceptions.js
// Base Emscripten EH error class
class EmscriptenEH extends Error { }

class EmscriptenSjLj extends EmscriptenEH { }

class CppException extends EmscriptenEH {
  constructor(excPtr) {
    super(excPtr);
    this.excPtr = excPtr;
    const excInfo = getExceptionMessage(excPtr);
    this.name = excInfo[0];
    this.message = excInfo[1];
  }
}
// end include: runtime_exceptions.js
var wasmBinaryFile;
wasmBinaryFile = 'mame.wasm';
if (!isDataURI(wasmBinaryFile)) {
  wasmBinaryFile = locateFile(wasmBinaryFile);
}

function getBinarySync(file) {
  if (file == wasmBinaryFile && wasmBinary) {
    return new Uint8Array(wasmBinary);
  }
  if (readBinary) {
    return readBinary(file);
  }
  throw "both async and sync fetching of the wasm failed";
}

function getBinaryPromise(binaryFile) {
  // If we don't have the binary yet, try to load it asynchronously.
  // Fetch has some additional restrictions over XHR, like it can't be used on a file:// url.
  // See https://github.com/github/fetch/pull/92#issuecomment-140665932
  // Cordova or Electron apps are typically loaded from a file:// url.
  // So use fetch if it is available and the url is not a file, otherwise fall back to XHR.
  if (!wasmBinary
    && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)) {
    if (typeof fetch == 'function'
      && !isFileURI(binaryFile)
    ) {
      return fetch(binaryFile, { credentials: 'same-origin' }).then((response) => {
        if (!response['ok']) {
          throw "failed to load wasm binary file at '" + binaryFile + "'";
        }
        return response['arrayBuffer']();
      }).catch(() => getBinarySync(binaryFile));
    }
    else if (readAsync) {
      // fetch is not available or url is file => try XHR (readAsync uses XHR internally)
      return new Promise((resolve, reject) => {
        readAsync(binaryFile, (response) => resolve(new Uint8Array(/** @type{!ArrayBuffer} */(response))), reject)
      });
    }
  }

  // Otherwise, getBinarySync should be able to get it synchronously
  return Promise.resolve().then(() => getBinarySync(binaryFile));
}

function instantiateArrayBuffer(binaryFile, imports, receiver) {
  return getBinaryPromise(binaryFile).then((binary) => {
    return WebAssembly.instantiate(binary, imports);
  }).then((instance) => {
    return instance;
  }).then(receiver, (reason) => {
    err(`failed to asynchronously prepare wasm: ${reason}`);

    // Warn on some common problems.
    if (isFileURI(wasmBinaryFile)) {
      err(`warning: Loading from a file URI (${wasmBinaryFile}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`);
    }
    abort(reason);
  });
}

function instantiateAsync(binary, binaryFile, imports, callback) {
  if (!binary &&
    typeof WebAssembly.instantiateStreaming == 'function' &&
    !isDataURI(binaryFile) &&
    // Don't use streaming for file:// delivered objects in a webview, fetch them synchronously.
    !isFileURI(binaryFile) &&
    // Avoid instantiateStreaming() on Node.js environment for now, as while
    // Node.js v18.1.0 implements it, it does not have a full fetch()
    // implementation yet.
    //
    // Reference:
    //   https://github.com/emscripten-core/emscripten/pull/16917
    !ENVIRONMENT_IS_NODE &&
    typeof fetch == 'function') {
    return fetch(binaryFile, { credentials: 'same-origin' }).then((response) => {
      // Suppress closure warning here since the upstream definition for
      // instantiateStreaming only allows Promise<Repsponse> rather than
      // an actual Response.
      // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure is fixed.
      /** @suppress {checkTypes} */
      var result = WebAssembly.instantiateStreaming(response, imports);

      return result.then(
        callback,
        function (reason) {
          // We expect the most common failure cause to be a bad MIME type for the binary,
          // in which case falling back to ArrayBuffer instantiation should work.
          err(`wasm streaming compile failed: ${reason}`);
          err('falling back to ArrayBuffer instantiation');
          return instantiateArrayBuffer(binaryFile, imports, callback);
        });
    });
  }
  return instantiateArrayBuffer(binaryFile, imports, callback);
}

// Create the wasm instance.
// Receives the wasm imports, returns the exports.
function createWasm() {
  // prepare imports
  var info = {
    'env': wasmImports,
    'wasi_snapshot_preview1': wasmImports,
  };
  // Load the wasm module and create an instance of using native support in the JS engine.
  // handle a generated wasm instance, receiving its exports and
  // performing other necessary setup
  /** @param {WebAssembly.Module=} module*/
  function receiveInstance(instance, module) {
    wasmExports = instance.exports;



    wasmMemory = wasmExports['memory'];

    assert(wasmMemory, "memory not found in wasm exports");
    // This assertion doesn't hold when emscripten is run in --post-link
    // mode.
    // TODO(sbc): Read INITIAL_MEMORY out of the wasm file in post-link mode.
    //assert(wasmMemory.buffer.byteLength === 134217728);
    updateMemoryViews();

    wasmTable = wasmExports['__indirect_function_table'];

    assert(wasmTable, "table not found in wasm exports");

    addOnInit(wasmExports['__wasm_call_ctors']);

    removeRunDependency('wasm-instantiate');
    return wasmExports;
  }
  // wait for the pthread pool (if any)
  addRunDependency('wasm-instantiate');

  // Prefer streaming instantiation if available.
  // Async compilation can be confusing when an error on the page overwrites Module
  // (for example, if the order of elements is wrong, and the one defining Module is
  // later), so we save Module and check it later.
  var trueModule = Module;
  function receiveInstantiationResult(result) {
    // 'result' is a ResultObject object which has both the module and instance.
    // receiveInstance() will swap in the exports (to Module.asm) so they can be called
    assert(Module === trueModule, 'the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?');
    trueModule = null;
    // TODO: Due to Closure regression https://github.com/google/closure-compiler/issues/3193, the above line no longer optimizes out down to the following line.
    // When the regression is fixed, can restore the above PTHREADS-enabled path.
    receiveInstance(result['instance']);
  }

  // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
  // to manually instantiate the Wasm module themselves. This allows pages to
  // run the instantiation parallel to any other async startup actions they are
  // performing.
  // Also pthreads and wasm workers initialize the wasm instance through this
  // path.
  if (Module['instantiateWasm']) {

    try {
      return Module['instantiateWasm'](info, receiveInstance);
    } catch (e) {
      err(`Module.instantiateWasm callback failed with error: ${e}`);
      return false;
    }
  }

  instantiateAsync(wasmBinary, wasmBinaryFile, info, receiveInstantiationResult);
  return {}; // no exports yet; we'll fill them in later
}

// Globals used by JS i64 conversions (see makeSetValue)
var tempDouble;
var tempI64;

// include: runtime_debug.js
function legacyModuleProp(prop, newName, incomming = true) {
  if (!Object.getOwnPropertyDescriptor(Module, prop)) {
    Object.defineProperty(Module, prop, {
      configurable: true,
      get() {
        let extra = incomming ? ' (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)' : '';
        abort(`\`Module.${prop}\` has been replaced by \`${newName}\`` + extra);

      }
    });
  }
}

function ignoredModuleProp(prop) {
  if (Object.getOwnPropertyDescriptor(Module, prop)) {
    abort(`\`Module.${prop}\` was supplied but \`${prop}\` not included in INCOMING_MODULE_JS_API`);
  }
}

// forcing the filesystem exports a few things by default
function isExportedByForceFilesystem(name) {
  return name === 'FS_createPath' ||
    name === 'FS_createDataFile' ||
    name === 'FS_createPreloadedFile' ||
    name === 'FS_unlink' ||
    name === 'addRunDependency' ||
    // The old FS has some functionality that WasmFS lacks.
    name === 'FS_createLazyFile' ||
    name === 'FS_createDevice' ||
    name === 'removeRunDependency';
}

function missingGlobal(sym, msg) {
  if (typeof globalThis !== 'undefined') {
    Object.defineProperty(globalThis, sym, {
      configurable: true,
      get() {
        warnOnce(`\`${sym}\` is not longer defined by emscripten. ${msg}`);
        return undefined;
      }
    });
  }
}

missingGlobal('buffer', 'Please use HEAP8.buffer or wasmMemory.buffer');
missingGlobal('asm', 'Please use wasmExports instead');

function missingLibrarySymbol(sym) {
  if (typeof globalThis !== 'undefined' && !Object.getOwnPropertyDescriptor(globalThis, sym)) {
    Object.defineProperty(globalThis, sym, {
      configurable: true,
      get() {
        // Can't `abort()` here because it would break code that does runtime
        // checks.  e.g. `if (typeof SDL === 'undefined')`.
        var msg = `\`${sym}\` is a library symbol and not included by default; add it to your library.js __deps or to DEFAULT_LIBRARY_FUNCS_TO_INCLUDE on the command line`;
        // DEFAULT_LIBRARY_FUNCS_TO_INCLUDE requires the name as it appears in
        // library.js, which means $name for a JS name with no prefix, or name
        // for a JS name like _name.
        var librarySymbol = sym;
        if (!librarySymbol.startsWith('_')) {
          librarySymbol = '$' + sym;
        }
        msg += ` (e.g. -sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE='${librarySymbol}')`;
        if (isExportedByForceFilesystem(sym)) {
          msg += '. Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you';
        }
        warnOnce(msg);
        return undefined;
      }
    });
  }
  // Any symbol that is not included from the JS libary is also (by definition)
  // not exported on the Module object.
  unexportedRuntimeSymbol(sym);
}

function unexportedRuntimeSymbol(sym) {
  if (!Object.getOwnPropertyDescriptor(Module, sym)) {
    Object.defineProperty(Module, sym, {
      configurable: true,
      get() {
        var msg = `'${sym}' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`;
        if (isExportedByForceFilesystem(sym)) {
          msg += '. Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you';
        }
        abort(msg);
      }
    });
  }
}

// Used by XXXXX_DEBUG settings to output debug messages.
function dbg(text) {
  // TODO(sbc): Make this configurable somehow.  Its not always convenient for
  // logging to show up as warnings.
  console.warn.apply(console, arguments);
}
// end include: runtime_debug.js
// === Body ===

var ASM_CONSTS = {
  11000700: () => { JSMESS.running = true; },
  11000723: ($0, $1) => { jsmame_stream_sink_update($0, $1); },
  11000762: () => { debugger; },
  11000776: () => { if (typeof (AudioContext) !== 'undefined') { return true; } else if (typeof (webkitAudioContext) !== 'undefined') { return true; } return false; },
  11000923: () => { if ((typeof (navigator.mediaDevices) !== 'undefined') && (typeof (navigator.mediaDevices.getUserMedia) !== 'undefined')) { return true; } else if (typeof (navigator.webkitGetUserMedia) !== 'undefined') { return true; } return false; },
  11001157: ($0) => { if (typeof (Module['SDL2']) === 'undefined') { Module['SDL2'] = {}; } var SDL2 = Module['SDL2']; if (!$0) { SDL2.audio = {}; } else { SDL2.capture = {}; } if (!SDL2.audioContext) { if (typeof (AudioContext) !== 'undefined') { SDL2.audioContext = new AudioContext(); } else if (typeof (webkitAudioContext) !== 'undefined') { SDL2.audioContext = new webkitAudioContext(); } if (SDL2.audioContext) { autoResumeAudioContext(SDL2.audioContext); } } return SDL2.audioContext === undefined ? -1 : 0; },
  11001650: () => { var SDL2 = Module['SDL2']; return SDL2.audioContext.sampleRate; },
  11001718: ($0, $1, $2, $3) => { var SDL2 = Module['SDL2']; var have_microphone = function (stream) { if (SDL2.capture.silenceTimer !== undefined) { clearTimeout(SDL2.capture.silenceTimer); SDL2.capture.silenceTimer = undefined; } SDL2.capture.mediaStreamNode = SDL2.audioContext.createMediaStreamSource(stream); SDL2.capture.scriptProcessorNode = SDL2.audioContext.createScriptProcessor($1, $0, 1); SDL2.capture.scriptProcessorNode.onaudioprocess = function (audioProcessingEvent) { if ((SDL2 === undefined) || (SDL2.capture === undefined)) { return; } audioProcessingEvent.outputBuffer.getChannelData(0).fill(0.0); SDL2.capture.currentCaptureBuffer = audioProcessingEvent.inputBuffer; dynCall('vi', $2, [$3]); }; SDL2.capture.mediaStreamNode.connect(SDL2.capture.scriptProcessorNode); SDL2.capture.scriptProcessorNode.connect(SDL2.audioContext.destination); SDL2.capture.stream = stream; }; var no_microphone = function (error) { }; SDL2.capture.silenceBuffer = SDL2.audioContext.createBuffer($0, $1, SDL2.audioContext.sampleRate); SDL2.capture.silenceBuffer.getChannelData(0).fill(0.0); var silence_callback = function () { SDL2.capture.currentCaptureBuffer = SDL2.capture.silenceBuffer; dynCall('vi', $2, [$3]); }; SDL2.capture.silenceTimer = setTimeout(silence_callback, ($1 / SDL2.audioContext.sampleRate) * 1000); if ((navigator.mediaDevices !== undefined) && (navigator.mediaDevices.getUserMedia !== undefined)) { navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(have_microphone).catch(no_microphone); } else if (navigator.webkitGetUserMedia !== undefined) { navigator.webkitGetUserMedia({ audio: true, video: false }, have_microphone, no_microphone); } },
  11003370: ($0, $1, $2, $3) => { var SDL2 = Module['SDL2']; SDL2.audio.scriptProcessorNode = SDL2.audioContext['createScriptProcessor']($1, 0, $0); SDL2.audio.scriptProcessorNode['onaudioprocess'] = function (e) { if ((SDL2 === undefined) || (SDL2.audio === undefined)) { return; } SDL2.audio.currentOutputBuffer = e['outputBuffer']; dynCall('vi', $2, [$3]); }; SDL2.audio.scriptProcessorNode['connect'](SDL2.audioContext['destination']); },
  11003780: ($0, $1) => { var SDL2 = Module['SDL2']; var numChannels = SDL2.capture.currentCaptureBuffer.numberOfChannels; for (var c = 0; c < numChannels; ++c) { var channelData = SDL2.capture.currentCaptureBuffer.getChannelData(c); if (channelData.length != $1) { throw 'Web Audio capture buffer length mismatch! Destination size: ' + channelData.length + ' samples vs expected ' + $1 + ' samples!'; } if (numChannels == 1) { for (var j = 0; j < $1; ++j) { setValue($0 + (j * 4), channelData[j], 'float'); } } else { for (var j = 0; j < $1; ++j) { setValue($0 + (((j * numChannels) + c) * 4), channelData[j], 'float'); } } } },
  11004385: ($0, $1) => { var SDL2 = Module['SDL2']; var numChannels = SDL2.audio.currentOutputBuffer['numberOfChannels']; for (var c = 0; c < numChannels; ++c) { var channelData = SDL2.audio.currentOutputBuffer['getChannelData'](c); if (channelData.length != $1) { throw 'Web Audio output buffer length mismatch! Destination size: ' + channelData.length + ' samples vs expected ' + $1 + ' samples!'; } for (var j = 0; j < $1; ++j) { channelData[j] = HEAPF32[$0 + ((j * numChannels + c) << 2) >> 2]; } } },
  11004865: ($0) => { var SDL2 = Module['SDL2']; if ($0) { if (SDL2.capture.silenceTimer !== undefined) { clearTimeout(SDL2.capture.silenceTimer); } if (SDL2.capture.stream !== undefined) { var tracks = SDL2.capture.stream.getAudioTracks(); for (var i = 0; i < tracks.length; i++) { SDL2.capture.stream.removeTrack(tracks[i]); } SDL2.capture.stream = undefined; } if (SDL2.capture.scriptProcessorNode !== undefined) { SDL2.capture.scriptProcessorNode.onaudioprocess = function (audioProcessingEvent) { }; SDL2.capture.scriptProcessorNode.disconnect(); SDL2.capture.scriptProcessorNode = undefined; } if (SDL2.capture.mediaStreamNode !== undefined) { SDL2.capture.mediaStreamNode.disconnect(); SDL2.capture.mediaStreamNode = undefined; } if (SDL2.capture.silenceBuffer !== undefined) { SDL2.capture.silenceBuffer = undefined } SDL2.capture = undefined; } else { if (SDL2.audio.scriptProcessorNode != undefined) { SDL2.audio.scriptProcessorNode.disconnect(); SDL2.audio.scriptProcessorNode = undefined; } SDL2.audio = undefined; } if ((SDL2.audioContext !== undefined) && (SDL2.audio === undefined) && (SDL2.capture === undefined)) { SDL2.audioContext.close(); SDL2.audioContext = undefined; } },
  11006037: ($0, $1, $2) => { var w = $0; var h = $1; var pixels = $2; if (!Module['SDL2']) Module['SDL2'] = {}; var SDL2 = Module['SDL2']; if (SDL2.ctxCanvas !== Module['canvas']) { SDL2.ctx = Module['createContext'](Module['canvas'], false, true); SDL2.ctxCanvas = Module['canvas']; } if (SDL2.w !== w || SDL2.h !== h || SDL2.imageCtx !== SDL2.ctx) { SDL2.image = SDL2.ctx.createImageData(w, h); SDL2.w = w; SDL2.h = h; SDL2.imageCtx = SDL2.ctx; } var data = SDL2.image.data; var src = pixels >> 2; var dst = 0; var num; if (typeof CanvasPixelArray !== 'undefined' && data instanceof CanvasPixelArray) { num = data.length; while (dst < num) { var val = HEAP32[src]; data[dst] = val & 0xff; data[dst + 1] = (val >> 8) & 0xff; data[dst + 2] = (val >> 16) & 0xff; data[dst + 3] = 0xff; src++; dst += 4; } } else { if (SDL2.data32Data !== data) { SDL2.data32 = new Int32Array(data.buffer); SDL2.data8 = new Uint8Array(data.buffer); SDL2.data32Data = data; } var data32 = SDL2.data32; num = data32.length; data32.set(HEAP32.subarray(src, src + num)); var data8 = SDL2.data8; var i = 3; var j = i + 4 * num; if (num % 8 == 0) { while (i < j) { data8[i] = 0xff; i = i + 4 | 0; data8[i] = 0xff; i = i + 4 | 0; data8[i] = 0xff; i = i + 4 | 0; data8[i] = 0xff; i = i + 4 | 0; data8[i] = 0xff; i = i + 4 | 0; data8[i] = 0xff; i = i + 4 | 0; data8[i] = 0xff; i = i + 4 | 0; data8[i] = 0xff; i = i + 4 | 0; } } else { while (i < j) { data8[i] = 0xff; i = i + 4 | 0; } } } SDL2.ctx.putImageData(SDL2.image, 0, 0); },
  11007506: ($0, $1, $2, $3, $4) => { var w = $0; var h = $1; var hot_x = $2; var hot_y = $3; var pixels = $4; var canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h; var ctx = canvas.getContext("2d"); var image = ctx.createImageData(w, h); var data = image.data; var src = pixels >> 2; var dst = 0; var num; if (typeof CanvasPixelArray !== 'undefined' && data instanceof CanvasPixelArray) { num = data.length; while (dst < num) { var val = HEAP32[src]; data[dst] = val & 0xff; data[dst + 1] = (val >> 8) & 0xff; data[dst + 2] = (val >> 16) & 0xff; data[dst + 3] = (val >> 24) & 0xff; src++; dst += 4; } } else { var data32 = new Int32Array(data.buffer); num = data32.length; data32.set(HEAP32.subarray(src, src + num)); } ctx.putImageData(image, 0, 0); var url = hot_x === 0 && hot_y === 0 ? "url(" + canvas.toDataURL() + "), auto" : "url(" + canvas.toDataURL() + ") " + hot_x + " " + hot_y + ", auto"; var urlBuf = _malloc(url.length + 1); stringToUTF8(url, urlBuf, url.length + 1); return urlBuf; },
  11008495: ($0) => { if (Module['canvas']) { Module['canvas'].style['cursor'] = UTF8ToString($0); } },
  11008578: () => { if (Module['canvas']) { Module['canvas'].style['cursor'] = 'none'; } },
  11008647: () => { return window.innerWidth; },
  11008677: () => { return window.innerHeight; }
};


// end include: preamble.js

/** @constructor */
function ExitStatus(status) {
  this.name = 'ExitStatus';
  this.message = `Program terminated with exit(${status})`;
  this.status = status;
}

var listenOnce = (object, event, func) => {
  object.addEventListener(event, func, { 'once': true });
};
/** @param {Object=} elements */
var autoResumeAudioContext = (ctx, elements) => {
  if (!elements) {
    elements = [document, document.getElementById('canvas')];
  }
  ['keydown', 'mousedown', 'touchstart'].forEach((event) => {
    elements.forEach((element) => {
      if (element) {
        listenOnce(element, event, () => {
          if (ctx.state === 'suspended') ctx.resume();
        });
      }
    });
  });
};

var callRuntimeCallbacks = (callbacks) => {
  while (callbacks.length > 0) {
    // Pass the module as the first argument.
    callbacks.shift()(Module);
  }
};

var decrementExceptionRefcount = (ptr) => ___cxa_decrement_exception_refcount(ptr);

var dynCallLegacy = (sig, ptr, args) => {
  assert(('dynCall_' + sig) in Module, `bad function pointer type - dynCall function not found for sig '${sig}'`);
  if (args?.length) {
    // j (64-bit integer) must be passed in as two numbers [low 32, high 32].
    assert(args.length === sig.substring(1).replace(/j/g, '--').length);
  } else {
    assert(sig.length == 1);
  }
  var f = Module['dynCall_' + sig];
  return args && args.length ? f.apply(null, [ptr].concat(args)) : f.call(null, ptr);
};

var wasmTableMirror = [];

var wasmTable;
var getWasmTableEntry = (funcPtr) => {
  var func = wasmTableMirror[funcPtr];
  if (!func) {
    if (funcPtr >= wasmTableMirror.length) wasmTableMirror.length = funcPtr + 1;
    wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
  }
  assert(wasmTable.get(funcPtr) == func, "JavaScript-side Wasm function table mirror is out of date!");
  return func;
};

/** @param {Object=} args */
var dynCall = (sig, ptr, args) => {
  // Without WASM_BIGINT support we cannot directly call function with i64 as
  // part of thier signature, so we rely the dynCall functions generated by
  // wasm-emscripten-finalize
  if (sig.includes('j')) {
    return dynCallLegacy(sig, ptr, args);
  }
  assert(getWasmTableEntry(ptr), `missing table entry in dynCall: ${ptr}`);
  var rtn = getWasmTableEntry(ptr).apply(null, args);
  return rtn;
};



var withStackSave = (f) => {
  var stack = stackSave();
  var ret = f();
  stackRestore(stack);
  return ret;
};

var UTF8Decoder = typeof TextDecoder != 'undefined' ? new TextDecoder('utf8') : undefined;

/**
 * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
 * array that contains uint8 values, returns a copy of that string as a
 * Javascript String object.
 * heapOrArray is either a regular array, or a JavaScript typed array view.
 * @param {number} idx
 * @param {number=} maxBytesToRead
 * @return {string}
 */
var UTF8ArrayToString = (heapOrArray, idx, maxBytesToRead) => {
  var endIdx = idx + maxBytesToRead;
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on
  // null terminator by itself.  Also, use the length info to avoid running tiny
  // strings through TextDecoder, since .subarray() allocates garbage.
  // (As a tiny code save trick, compare endPtr against endIdx using a negation,
  // so that undefined means Infinity)
  while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;

  if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
    return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
  }
  var str = '';
  // If building with TextDecoder, we have already computed the string length
  // above, so test loop end condition against that
  while (idx < endPtr) {
    // For UTF8 byte structure, see:
    // http://en.wikipedia.org/wiki/UTF-8#Description
    // https://www.ietf.org/rfc/rfc2279.txt
    // https://tools.ietf.org/html/rfc3629
    var u0 = heapOrArray[idx++];
    if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
    var u1 = heapOrArray[idx++] & 63;
    if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
    var u2 = heapOrArray[idx++] & 63;
    if ((u0 & 0xF0) == 0xE0) {
      u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
    } else {
      if ((u0 & 0xF8) != 0xF0) warnOnce('Invalid UTF-8 leading byte ' + ptrToString(u0) + ' encountered when deserializing a UTF-8 string in wasm memory to a JS string!');
      u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heapOrArray[idx++] & 63);
    }

    if (u0 < 0x10000) {
      str += String.fromCharCode(u0);
    } else {
      var ch = u0 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    }
  }
  return str;
};

/**
 * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
 * emscripten HEAP, returns a copy of that string as a Javascript String object.
 *
 * @param {number} ptr
 * @param {number=} maxBytesToRead - An optional length that specifies the
 *   maximum number of bytes to read. You can omit this parameter to scan the
 *   string until the first 0 byte. If maxBytesToRead is passed, and the string
 *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
 *   string will cut short at that byte index (i.e. maxBytesToRead will not
 *   produce a string of exact length [ptr, ptr+maxBytesToRead[) N.B. mixing
 *   frequent uses of UTF8ToString() with and without maxBytesToRead may throw
 *   JS JIT optimizations off, so it is worth to consider consistently using one
 * @return {string}
 */
var UTF8ToString = (ptr, maxBytesToRead) => {
  assert(typeof ptr == 'number', `UTF8ToString expects a number (got ${typeof ptr})`);
  return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : '';
};
var getExceptionMessageCommon = (ptr) => withStackSave(() => {
  var type_addr_addr = stackAlloc(4);
  var message_addr_addr = stackAlloc(4);
  ___get_exception_message(ptr, type_addr_addr, message_addr_addr);
  var type_addr = HEAPU32[((type_addr_addr) >> 2)];
  var message_addr = HEAPU32[((message_addr_addr) >> 2)];
  var type = UTF8ToString(type_addr);
  _free(type_addr);
  var message;
  if (message_addr) {
    message = UTF8ToString(message_addr);
    _free(message_addr);
  }
  return [type, message];
});
var getExceptionMessage = (ptr) => getExceptionMessageCommon(ptr);
Module['getExceptionMessage'] = getExceptionMessage;


/**
 * @param {number} ptr
 * @param {string} type
 */
function getValue(ptr, type = 'i8') {
  if (type.endsWith('*')) type = '*';
  switch (type) {
    case 'i1': return HEAP8[((ptr) >> 0)];
    case 'i8': return HEAP8[((ptr) >> 0)];
    case 'i16': return HEAP16[((ptr) >> 1)];
    case 'i32': return HEAP32[((ptr) >> 2)];
    case 'i64': abort('to do getValue(i64) use WASM_BIGINT');
    case 'float': return HEAPF32[((ptr) >> 2)];
    case 'double': return HEAPF64[((ptr) >> 3)];
    case '*': return HEAPU32[((ptr) >> 2)];
    default: abort(`invalid type for getValue: ${type}`);
  }
}

var incrementExceptionRefcount = (ptr) => ___cxa_increment_exception_refcount(ptr);

var noExitRuntime = Module['noExitRuntime'] || true;

var ptrToString = (ptr) => {
  assert(typeof ptr === 'number');
  // With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
  ptr >>>= 0;
  return '0x' + ptr.toString(16).padStart(8, '0');
};


/**
 * @param {number} ptr
 * @param {number} value
 * @param {string} type
 */
function setValue(ptr, value, type = 'i8') {
  if (type.endsWith('*')) type = '*';
  switch (type) {
    case 'i1': HEAP8[((ptr) >> 0)] = value; break;
    case 'i8': HEAP8[((ptr) >> 0)] = value; break;
    case 'i16': HEAP16[((ptr) >> 1)] = value; break;
    case 'i32': HEAP32[((ptr) >> 2)] = value; break;
    case 'i64': abort('to do setValue(i64) use WASM_BIGINT');
    case 'float': HEAPF32[((ptr) >> 2)] = value; break;
    case 'double': HEAPF64[((ptr) >> 3)] = value; break;
    case '*': HEAPU32[((ptr) >> 2)] = value; break;
    default: abort(`invalid type for setValue: ${type}`);
  }
}

var warnOnce = (text) => {
  warnOnce.shown ||= {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    if (ENVIRONMENT_IS_NODE) text = 'warning: ' + text;
    err(text);
  }
};

/** @type {function(...*):?} */
function _$ERRNO_CODES(
) {
  abort('missing function: $ERRNO_CODES');
}
_$ERRNO_CODES.stub = true;

var ___assert_fail = (condition, filename, line, func) => {
  abort(`Assertion failed: ${UTF8ToString(condition)}, at: ` + [filename ? UTF8ToString(filename) : 'unknown filename', line, func ? UTF8ToString(func) : 'unknown function']);
};

var ___call_sighandler = (fp, sig) => getWasmTableEntry(fp)(sig);

var exceptionCaught = [];


var uncaughtExceptionCount = 0;
var ___cxa_begin_catch = (ptr) => {
  var info = new ExceptionInfo(ptr);
  if (!info.get_caught()) {
    info.set_caught(true);
    uncaughtExceptionCount--;
  }
  info.set_rethrown(false);
  exceptionCaught.push(info);
  ___cxa_increment_exception_refcount(info.excPtr);
  return info.get_exception_ptr();
};


var exceptionLast = 0;


var ___cxa_end_catch = () => {
  // Clear state flag.
  _setThrew(0, 0);
  assert(exceptionCaught.length > 0);
  // Call destructor if one is registered then clear it.
  var info = exceptionCaught.pop();

  ___cxa_decrement_exception_refcount(info.excPtr);
  exceptionLast = 0; // XXX in decRef?
};


/** @constructor */
function ExceptionInfo(excPtr) {
  this.excPtr = excPtr;
  this.ptr = excPtr - 24;

  this.set_type = function (type) {
    HEAPU32[(((this.ptr) + (4)) >> 2)] = type;
  };

  this.get_type = function () {
    return HEAPU32[(((this.ptr) + (4)) >> 2)];
  };

  this.set_destructor = function (destructor) {
    HEAPU32[(((this.ptr) + (8)) >> 2)] = destructor;
  };

  this.get_destructor = function () {
    return HEAPU32[(((this.ptr) + (8)) >> 2)];
  };

  this.set_caught = function (caught) {
    caught = caught ? 1 : 0;
    HEAP8[(((this.ptr) + (12)) >> 0)] = caught;
  };

  this.get_caught = function () {
    return HEAP8[(((this.ptr) + (12)) >> 0)] != 0;
  };

  this.set_rethrown = function (rethrown) {
    rethrown = rethrown ? 1 : 0;
    HEAP8[(((this.ptr) + (13)) >> 0)] = rethrown;
  };

  this.get_rethrown = function () {
    return HEAP8[(((this.ptr) + (13)) >> 0)] != 0;
  };

  // Initialize native structure fields. Should be called once after allocated.
  this.init = function (type, destructor) {
    this.set_adjusted_ptr(0);
    this.set_type(type);
    this.set_destructor(destructor);
  }

  this.set_adjusted_ptr = function (adjustedPtr) {
    HEAPU32[(((this.ptr) + (16)) >> 2)] = adjustedPtr;
  };

  this.get_adjusted_ptr = function () {
    return HEAPU32[(((this.ptr) + (16)) >> 2)];
  };

  // Get pointer which is expected to be received by catch clause in C++ code. It may be adjusted
  // when the pointer is casted to some of the exception object base classes (e.g. when virtual
  // inheritance is used). When a pointer is thrown this method should return the thrown pointer
  // itself.
  this.get_exception_ptr = function () {
    // Work around a fastcomp bug, this code is still included for some reason in a build without
    // exceptions support.
    var isPointer = ___cxa_is_pointer_type(this.get_type());
    if (isPointer) {
      return HEAPU32[((this.excPtr) >> 2)];
    }
    var adjusted = this.get_adjusted_ptr();
    if (adjusted !== 0) return adjusted;
    return this.excPtr;
  };
}

var ___resumeException = (ptr) => {
  if (!exceptionLast) {
    exceptionLast = new CppException(ptr);
  }
  throw exceptionLast;
};


var findMatchingCatch = (args) => {
  var thrown =
    exceptionLast?.excPtr;
  if (!thrown) {
    // just pass through the null ptr
    setTempRet0(0);
    return 0;
  }
  var info = new ExceptionInfo(thrown);
  info.set_adjusted_ptr(thrown);
  var thrownType = info.get_type();
  if (!thrownType) {
    // just pass through the thrown ptr
    setTempRet0(0);
    return thrown;
  }

  // can_catch receives a **, add indirection
  // The different catch blocks are denoted by different types.
  // Due to inheritance, those types may not precisely match the
  // type of the thrown object. Find one which matches, and
  // return the type of the catch block which should be called.
  for (var arg in args) {
    var caughtType = args[arg];

    if (caughtType === 0 || caughtType === thrownType) {
      // Catch all clause matched or exactly the same type is caught
      break;
    }
    var adjusted_ptr_addr = info.ptr + 16;
    if (___cxa_can_catch(caughtType, thrownType, adjusted_ptr_addr)) {
      setTempRet0(caughtType);
      return thrown;
    }
  }
  setTempRet0(thrownType);
  return thrown;
};
var ___cxa_find_matching_catch_2 = () => findMatchingCatch([]);

var ___cxa_find_matching_catch_3 = (arg0) => findMatchingCatch([arg0]);



var ___cxa_rethrow = () => {
  var info = exceptionCaught.pop();
  if (!info) {
    abort('no exception to throw');
  }
  var ptr = info.excPtr;
  if (!info.get_rethrown()) {
    // Only pop if the corresponding push was through rethrow_primary_exception
    exceptionCaught.push(info);
    info.set_rethrown(true);
    info.set_caught(false);
    uncaughtExceptionCount++;
  }
  exceptionLast = new CppException(ptr);
  throw exceptionLast;
};



var ___cxa_rethrow_primary_exception = (ptr) => {
  if (!ptr) return;
  var info = new ExceptionInfo(ptr);
  exceptionCaught.push(info);
  info.set_rethrown(true);
  ___cxa_rethrow();
};



var ___cxa_throw = (ptr, type, destructor) => {
  var info = new ExceptionInfo(ptr);
  // Initialize ExceptionInfo content after it was allocated in __cxa_allocate_exception.
  info.init(type, destructor);
  exceptionLast = new CppException(ptr);
  uncaughtExceptionCount++;
  throw exceptionLast;
};

var ___cxa_uncaught_exceptions = () => uncaughtExceptionCount;


var PATH = {
  isAbs: (path) => path.charAt(0) === '/',
  splitPath: (filename) => {
    var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
    return splitPathRe.exec(filename).slice(1);
  },
  normalizeArray: (parts, allowAboveRoot) => {
    // if the path tries to go above the root, `up` ends up > 0
    var up = 0;
    for (var i = parts.length - 1; i >= 0; i--) {
      var last = parts[i];
      if (last === '.') {
        parts.splice(i, 1);
      } else if (last === '..') {
        parts.splice(i, 1);
        up++;
      } else if (up) {
        parts.splice(i, 1);
        up--;
      }
    }
    // if the path is allowed to go above the root, restore leading ..s
    if (allowAboveRoot) {
      for (; up; up--) {
        parts.unshift('..');
      }
    }
    return parts;
  },
  normalize: (path) => {
    var isAbsolute = PATH.isAbs(path),
      trailingSlash = path.substr(-1) === '/';
    // Normalize the path
    path = PATH.normalizeArray(path.split('/').filter((p) => !!p), !isAbsolute).join('/');
    if (!path && !isAbsolute) {
      path = '.';
    }
    if (path && trailingSlash) {
      path += '/';
    }
    return (isAbsolute ? '/' : '') + path;
  },
  dirname: (path) => {
    var result = PATH.splitPath(path),
      root = result[0],
      dir = result[1];
    if (!root && !dir) {
      // No dirname whatsoever
      return '.';
    }
    if (dir) {
      // It has a dirname, strip trailing slash
      dir = dir.substr(0, dir.length - 1);
    }
    return root + dir;
  },
  basename: (path) => {
    // EMSCRIPTEN return '/'' for '/', not an empty string
    if (path === '/') return '/';
    path = PATH.normalize(path);
    path = path.replace(/\/$/, "");
    var lastSlash = path.lastIndexOf('/');
    if (lastSlash === -1) return path;
    return path.substr(lastSlash + 1);
  },
  join: function () {
    var paths = Array.prototype.slice.call(arguments);
    return PATH.normalize(paths.join('/'));
  },
  join2: (l, r) => PATH.normalize(l + '/' + r),
};

var initRandomFill = () => {
  if (typeof crypto == 'object' && typeof crypto['getRandomValues'] == 'function') {
    // for modern web browsers
    return (view) => crypto.getRandomValues(view);
  } else
    if (ENVIRONMENT_IS_NODE) {
      // for nodejs with or without crypto support included
      try {
        var crypto_module = require('crypto');
        var randomFillSync = crypto_module['randomFillSync'];
        if (randomFillSync) {
          // nodejs with LTS crypto support
          return (view) => crypto_module['randomFillSync'](view);
        }
        // very old nodejs with the original crypto API
        var randomBytes = crypto_module['randomBytes'];
        return (view) => (
          view.set(randomBytes(view.byteLength)),
          // Return the original view to match modern native implementations.
          view
        );
      } catch (e) {
        // nodejs doesn't have crypto support
      }
    }
  // we couldn't find a proper implementation, as Math.random() is not suitable for /dev/random, see emscripten-core/emscripten/pull/7096
  abort("no cryptographic support found for randomDevice. consider polyfilling it if you want to use something insecure like Math.random(), e.g. put this in a --pre-js: var crypto = { getRandomValues: (array) => { for (var i = 0; i < array.length; i++) array[i] = (Math.random()*256)|0 } };");
};
var randomFill = (view) => {
  // Lazily init on the first invocation.
  return (randomFill = initRandomFill())(view);
};



var PATH_FS = {
  resolve: function () {
    var resolvedPath = '',
      resolvedAbsolute = false;
    for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
      var path = (i >= 0) ? arguments[i] : FS.cwd();
      // Skip empty and invalid entries
      if (typeof path != 'string') {
        throw new TypeError('Arguments to path.resolve must be strings');
      } else if (!path) {
        return ''; // an invalid portion invalidates the whole thing
      }
      resolvedPath = path + '/' + resolvedPath;
      resolvedAbsolute = PATH.isAbs(path);
    }
    // At this point the path should be resolved to a full absolute path, but
    // handle relative paths to be safe (might happen when process.cwd() fails)
    resolvedPath = PATH.normalizeArray(resolvedPath.split('/').filter((p) => !!p), !resolvedAbsolute).join('/');
    return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
  },
  relative: (from, to) => {
    from = PATH_FS.resolve(from).substr(1);
    to = PATH_FS.resolve(to).substr(1);
    function trim(arr) {
      var start = 0;
      for (; start < arr.length; start++) {
        if (arr[start] !== '') break;
      }
      var end = arr.length - 1;
      for (; end >= 0; end--) {
        if (arr[end] !== '') break;
      }
      if (start > end) return [];
      return arr.slice(start, end - start + 1);
    }
    var fromParts = trim(from.split('/'));
    var toParts = trim(to.split('/'));
    var length = Math.min(fromParts.length, toParts.length);
    var samePartsLength = length;
    for (var i = 0; i < length; i++) {
      if (fromParts[i] !== toParts[i]) {
        samePartsLength = i;
        break;
      }
    }
    var outputParts = [];
    for (var i = samePartsLength; i < fromParts.length; i++) {
      outputParts.push('..');
    }
    outputParts = outputParts.concat(toParts.slice(samePartsLength));
    return outputParts.join('/');
  },
};



var FS_stdin_getChar_buffer = [];

var lengthBytesUTF8 = (str) => {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
    // unit, not a Unicode code point of the character! So decode
    // UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var c = str.charCodeAt(i); // possibly a lead surrogate
    if (c <= 0x7F) {
      len++;
    } else if (c <= 0x7FF) {
      len += 2;
    } else if (c >= 0xD800 && c <= 0xDFFF) {
      len += 4; ++i;
    } else {
      len += 3;
    }
  }
  return len;
};

var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
  assert(typeof str === 'string', `stringToUTF8Array expects a string (got ${typeof str})`);
  // Parameter maxBytesToWrite is not optional. Negative values, 0, null,
  // undefined and false each don't write out any bytes.
  if (!(maxBytesToWrite > 0))
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
    // unit, not a Unicode code point of the character! So decode
    // UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description
    // and https://www.ietf.org/rfc/rfc2279.txt
    // and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) {
      var u1 = str.charCodeAt(++i);
      u = 0x10000 + ((u & 0x3FF) << 10) | (u1 & 0x3FF);
    }
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      heap[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      heap[outIdx++] = 0xC0 | (u >> 6);
      heap[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      heap[outIdx++] = 0xE0 | (u >> 12);
      heap[outIdx++] = 0x80 | ((u >> 6) & 63);
      heap[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 3 >= endIdx) break;
      if (u > 0x10FFFF) warnOnce('Invalid Unicode code point ' + ptrToString(u) + ' encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).');
      heap[outIdx++] = 0xF0 | (u >> 18);
      heap[outIdx++] = 0x80 | ((u >> 12) & 63);
      heap[outIdx++] = 0x80 | ((u >> 6) & 63);
      heap[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  heap[outIdx] = 0;
  return outIdx - startIdx;
};
/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}
var FS_stdin_getChar = () => {
  if (!FS_stdin_getChar_buffer.length) {
    var result = null;
    if (ENVIRONMENT_IS_NODE) {
      // we will read data by chunks of BUFSIZE
      var BUFSIZE = 256;
      var buf = Buffer.alloc(BUFSIZE);
      var bytesRead = 0;

      // For some reason we must suppress a closure warning here, even though
      // fd definitely exists on process.stdin, and is even the proper way to
      // get the fd of stdin,
      // https://github.com/nodejs/help/issues/2136#issuecomment-523649904
      // This started to happen after moving this logic out of library_tty.js,
      // so it is related to the surrounding code in some unclear manner.
      /** @suppress {missingProperties} */
      var fd = process.stdin.fd;

      try {
        bytesRead = fs.readSync(fd, buf);
      } catch (e) {
        // Cross-platform differences: on Windows, reading EOF throws an exception, but on other OSes,
        // reading EOF returns 0. Uniformize behavior by treating the EOF exception to return 0.
        if (e.toString().includes('EOF')) bytesRead = 0;
        else throw e;
      }

      if (bytesRead > 0) {
        result = buf.slice(0, bytesRead).toString('utf-8');
      } else {
        result = null;
      }
    } else
      if (typeof window != 'undefined' &&
        typeof window.prompt == 'function') {
        // Browser.
        result = window.prompt('Input: ');  // returns null on cancel
        if (result !== null) {
          result += '\n';
        }
      } else if (typeof readline == 'function') {
        // Command line.
        result = readline();
        if (result !== null) {
          result += '\n';
        }
      }
    if (!result) {
      return null;
    }
    FS_stdin_getChar_buffer = intArrayFromString(result, true);
  }
  return FS_stdin_getChar_buffer.shift();
};
var TTY = {
  ttys: [],
  init() {
    // https://github.com/emscripten-core/emscripten/pull/1555
    // if (ENVIRONMENT_IS_NODE) {
    //   // currently, FS.init does not distinguish if process.stdin is a file or TTY
    //   // device, it always assumes it's a TTY device. because of this, we're forcing
    //   // process.stdin to UTF8 encoding to at least make stdin reading compatible
    //   // with text files until FS.init can be refactored.
    //   process.stdin.setEncoding('utf8');
    // }
  },
  shutdown() {
    // https://github.com/emscripten-core/emscripten/pull/1555
    // if (ENVIRONMENT_IS_NODE) {
    //   // inolen: any idea as to why node -e 'process.stdin.read()' wouldn't exit immediately (with process.stdin being a tty)?
    //   // isaacs: because now it's reading from the stream, you've expressed interest in it, so that read() kicks off a _read() which creates a ReadReq operation
    //   // inolen: I thought read() in that case was a synchronous operation that just grabbed some amount of buffered data if it exists?
    //   // isaacs: it is. but it also triggers a _read() call, which calls readStart() on the handle
    //   // isaacs: do process.stdin.pause() and i'd think it'd probably close the pending call
    //   process.stdin.pause();
    // }
  },
  register(dev, ops) {
    TTY.ttys[dev] = { input: [], output: [], ops: ops };
    FS.registerDevice(dev, TTY.stream_ops);
  },
  stream_ops: {
    open(stream) {
      var tty = TTY.ttys[stream.node.rdev];
      if (!tty) {
        throw new FS.ErrnoError(43);
      }
      stream.tty = tty;
      stream.seekable = false;
    },
    close(stream) {
      // flush any pending line data
      stream.tty.ops.fsync(stream.tty);
    },
    fsync(stream) {
      stream.tty.ops.fsync(stream.tty);
    },
    read(stream, buffer, offset, length, pos /* ignored */) {
      if (!stream.tty || !stream.tty.ops.get_char) {
        throw new FS.ErrnoError(60);
      }
      var bytesRead = 0;
      for (var i = 0; i < length; i++) {
        var result;
        try {
          result = stream.tty.ops.get_char(stream.tty);
        } catch (e) {
          throw new FS.ErrnoError(29);
        }
        if (result === undefined && bytesRead === 0) {
          throw new FS.ErrnoError(6);
        }
        if (result === null || result === undefined) break;
        bytesRead++;
        buffer[offset + i] = result;
      }
      if (bytesRead) {
        stream.node.timestamp = Date.now();
      }
      return bytesRead;
    },
    write(stream, buffer, offset, length, pos) {
      if (!stream.tty || !stream.tty.ops.put_char) {
        throw new FS.ErrnoError(60);
      }
      try {
        for (var i = 0; i < length; i++) {
          stream.tty.ops.put_char(stream.tty, buffer[offset + i]);
        }
      } catch (e) {
        throw new FS.ErrnoError(29);
      }
      if (length) {
        stream.node.timestamp = Date.now();
      }
      return i;
    },
  },
  default_tty_ops: {
    get_char(tty) {
      return FS_stdin_getChar();
    },
    put_char(tty, val) {
      if (val === null || val === 10) {
        out(UTF8ArrayToString(tty.output, 0));
        tty.output = [];
      } else {
        if (val != 0) tty.output.push(val); // val == 0 would cut text output off in the middle.
      }
    },
    fsync(tty) {
      if (tty.output && tty.output.length > 0) {
        out(UTF8ArrayToString(tty.output, 0));
        tty.output = [];
      }
    },
    ioctl_tcgets(tty) {
      // typical setting
      return {
        c_iflag: 25856,
        c_oflag: 5,
        c_cflag: 191,
        c_lflag: 35387,
        c_cc: [
          0x03, 0x1c, 0x7f, 0x15, 0x04, 0x00, 0x01, 0x00, 0x11, 0x13, 0x1a, 0x00,
          0x12, 0x0f, 0x17, 0x16, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ]
      };
    },
    ioctl_tcsets(tty, optional_actions, data) {
      // currently just ignore
      return 0;
    },
    ioctl_tiocgwinsz(tty) {
      return [24, 80];
    },
  },
  default_tty1_ops: {
    put_char(tty, val) {
      if (val === null || val === 10) {
        err(UTF8ArrayToString(tty.output, 0));
        tty.output = [];
      } else {
        if (val != 0) tty.output.push(val);
      }
    },
    fsync(tty) {
      if (tty.output && tty.output.length > 0) {
        err(UTF8ArrayToString(tty.output, 0));
        tty.output = [];
      }
    },
  },
};


var zeroMemory = (address, size) => {
  HEAPU8.fill(0, address, address + size);
  return address;
};

var alignMemory = (size, alignment) => {
  assert(alignment, "alignment argument is required");
  return Math.ceil(size / alignment) * alignment;
};
var mmapAlloc = (size) => {
  size = alignMemory(size, 65536);
  var ptr = _emscripten_builtin_memalign(65536, size);
  if (!ptr) return 0;
  return zeroMemory(ptr, size);
};
var MEMFS = {
  ops_table: null,
  mount(mount) {
    return MEMFS.createNode(null, '/', 16384 | 511 /* 0777 */, 0);
  },
  createNode(parent, name, mode, dev) {
    if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
      // no supported
      throw new FS.ErrnoError(63);
    }
    MEMFS.ops_table ||= {
      dir: {
        node: {
          getattr: MEMFS.node_ops.getattr,
          setattr: MEMFS.node_ops.setattr,
          lookup: MEMFS.node_ops.lookup,
          mknod: MEMFS.node_ops.mknod,
          rename: MEMFS.node_ops.rename,
          unlink: MEMFS.node_ops.unlink,
          rmdir: MEMFS.node_ops.rmdir,
          readdir: MEMFS.node_ops.readdir,
          symlink: MEMFS.node_ops.symlink
        },
        stream: {
          llseek: MEMFS.stream_ops.llseek
        }
      },
      file: {
        node: {
          getattr: MEMFS.node_ops.getattr,
          setattr: MEMFS.node_ops.setattr
        },
        stream: {
          llseek: MEMFS.stream_ops.llseek,
          read: MEMFS.stream_ops.read,
          write: MEMFS.stream_ops.write,
          allocate: MEMFS.stream_ops.allocate,
          mmap: MEMFS.stream_ops.mmap,
          msync: MEMFS.stream_ops.msync
        }
      },
      link: {
        node: {
          getattr: MEMFS.node_ops.getattr,
          setattr: MEMFS.node_ops.setattr,
          readlink: MEMFS.node_ops.readlink
        },
        stream: {}
      },
      chrdev: {
        node: {
          getattr: MEMFS.node_ops.getattr,
          setattr: MEMFS.node_ops.setattr
        },
        stream: FS.chrdev_stream_ops
      }
    };
    var node = FS.createNode(parent, name, mode, dev);
    if (FS.isDir(node.mode)) {
      node.node_ops = MEMFS.ops_table.dir.node;
      node.stream_ops = MEMFS.ops_table.dir.stream;
      node.contents = {};
    } else if (FS.isFile(node.mode)) {
      node.node_ops = MEMFS.ops_table.file.node;
      node.stream_ops = MEMFS.ops_table.file.stream;
      node.usedBytes = 0; // The actual number of bytes used in the typed array, as opposed to contents.length which gives the whole capacity.
      // When the byte data of the file is populated, this will point to either a typed array, or a normal JS array. Typed arrays are preferred
      // for performance, and used by default. However, typed arrays are not resizable like normal JS arrays are, so there is a small disk size
      // penalty involved for appending file writes that continuously grow a file similar to std::vector capacity vs used -scheme.
      node.contents = null;
    } else if (FS.isLink(node.mode)) {
      node.node_ops = MEMFS.ops_table.link.node;
      node.stream_ops = MEMFS.ops_table.link.stream;
    } else if (FS.isChrdev(node.mode)) {
      node.node_ops = MEMFS.ops_table.chrdev.node;
      node.stream_ops = MEMFS.ops_table.chrdev.stream;
    }
    node.timestamp = Date.now();
    // add the new node to the parent
    if (parent) {
      parent.contents[name] = node;
      parent.timestamp = node.timestamp;
    }
    return node;
  },
  getFileDataAsTypedArray(node) {
    if (!node.contents) return new Uint8Array(0);
    if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes); // Make sure to not return excess unused bytes.
    return new Uint8Array(node.contents);
  },
  expandFileStorage(node, newCapacity) {
    var prevCapacity = node.contents ? node.contents.length : 0;
    if (prevCapacity >= newCapacity) return; // No need to expand, the storage was already large enough.
    // Don't expand strictly to the given requested limit if it's only a very small increase, but instead geometrically grow capacity.
    // For small filesizes (<1MB), perform size*2 geometric increase, but for large sizes, do a much more conservative size*1.125 increase to
    // avoid overshooting the allocation cap by a very large margin.
    var CAPACITY_DOUBLING_MAX = 1024 * 1024;
    newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2.0 : 1.125)) >>> 0);
    if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256); // At minimum allocate 256b for each file when expanding.
    var oldContents = node.contents;
    node.contents = new Uint8Array(newCapacity); // Allocate new storage.
    if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0); // Copy old data over to the new storage.
  },
  resizeFileStorage(node, newSize) {
    if (node.usedBytes == newSize) return;
    if (newSize == 0) {
      node.contents = null; // Fully decommit when requesting a resize to zero.
      node.usedBytes = 0;
    } else {
      var oldContents = node.contents;
      node.contents = new Uint8Array(newSize); // Allocate new storage.
      if (oldContents) {
        node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes))); // Copy old data over to the new storage.
      }
      node.usedBytes = newSize;
    }
  },
  node_ops: {
    getattr(node) {
      var attr = {};
      // device numbers reuse inode numbers.
      attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
      attr.ino = node.id;
      attr.mode = node.mode;
      attr.nlink = 1;
      attr.uid = 0;
      attr.gid = 0;
      attr.rdev = node.rdev;
      if (FS.isDir(node.mode)) {
        attr.size = 4096;
      } else if (FS.isFile(node.mode)) {
        attr.size = node.usedBytes;
      } else if (FS.isLink(node.mode)) {
        attr.size = node.link.length;
      } else {
        attr.size = 0;
      }
      attr.atime = new Date(node.timestamp);
      attr.mtime = new Date(node.timestamp);
      attr.ctime = new Date(node.timestamp);
      // NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),
      //       but this is not required by the standard.
      attr.blksize = 4096;
      attr.blocks = Math.ceil(attr.size / attr.blksize);
      return attr;
    },
    setattr(node, attr) {
      if (attr.mode !== undefined) {
        node.mode = attr.mode;
      }
      if (attr.timestamp !== undefined) {
        node.timestamp = attr.timestamp;
      }
      if (attr.size !== undefined) {
        MEMFS.resizeFileStorage(node, attr.size);
      }
    },
    lookup(parent, name) {
      throw FS.genericErrors[44];
    },
    mknod(parent, name, mode, dev) {
      return MEMFS.createNode(parent, name, mode, dev);
    },
    rename(old_node, new_dir, new_name) {
      // if we're overwriting a directory at new_name, make sure it's empty.
      if (FS.isDir(old_node.mode)) {
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {
        }
        if (new_node) {
          for (var i in new_node.contents) {
            throw new FS.ErrnoError(55);
          }
        }
      }
      // do the internal rewiring
      delete old_node.parent.contents[old_node.name];
      old_node.parent.timestamp = Date.now()
      old_node.name = new_name;
      new_dir.contents[new_name] = old_node;
      new_dir.timestamp = old_node.parent.timestamp;
      old_node.parent = new_dir;
    },
    unlink(parent, name) {
      delete parent.contents[name];
      parent.timestamp = Date.now();
    },
    rmdir(parent, name) {
      var node = FS.lookupNode(parent, name);
      for (var i in node.contents) {
        throw new FS.ErrnoError(55);
      }
      delete parent.contents[name];
      parent.timestamp = Date.now();
    },
    readdir(node) {
      var entries = ['.', '..'];
      for (var key of Object.keys(node.contents)) {
        entries.push(key);
      }
      return entries;
    },
    symlink(parent, newname, oldpath) {
      var node = MEMFS.createNode(parent, newname, 511 /* 0777 */ | 40960, 0);
      node.link = oldpath;
      return node;
    },
    readlink(node) {
      if (!FS.isLink(node.mode)) {
        throw new FS.ErrnoError(28);
      }
      return node.link;
    },
  },
  stream_ops: {
    read(stream, buffer, offset, length, position) {
      var contents = stream.node.contents;
      if (position >= stream.node.usedBytes) return 0;
      var size = Math.min(stream.node.usedBytes - position, length);
      assert(size >= 0);
      if (size > 8 && contents.subarray) { // non-trivial, and typed array
        buffer.set(contents.subarray(position, position + size), offset);
      } else {
        for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
      }
      return size;
    },
    write(stream, buffer, offset, length, position, canOwn) {
      // The data buffer should be a typed array view
      assert(!(buffer instanceof ArrayBuffer));
      // If the buffer is located in main memory (HEAP), and if
      // memory can grow, we can't hold on to references of the
      // memory buffer, as they may get invalidated. That means we
      // need to do copy its contents.
      if (buffer.buffer === HEAP8.buffer) {
        canOwn = false;
      }

      if (!length) return 0;
      var node = stream.node;
      node.timestamp = Date.now();

      if (buffer.subarray && (!node.contents || node.contents.subarray)) { // This write is from a typed array to a typed array?
        if (canOwn) {
          assert(position === 0, 'canOwn must imply no weird position inside the file');
          node.contents = buffer.subarray(offset, offset + length);
          node.usedBytes = length;
          return length;
        } else if (node.usedBytes === 0 && position === 0) { // If this is a simple first write to an empty file, do a fast set since we don't need to care about old data.
          node.contents = buffer.slice(offset, offset + length);
          node.usedBytes = length;
          return length;
        } else if (position + length <= node.usedBytes) { // Writing to an already allocated and used subrange of the file?
          node.contents.set(buffer.subarray(offset, offset + length), position);
          return length;
        }
      }

      // Appending to an existing file and we need to reallocate, or source data did not come as a typed array.
      MEMFS.expandFileStorage(node, position + length);
      if (node.contents.subarray && buffer.subarray) {
        // Use typed array write which is available.
        node.contents.set(buffer.subarray(offset, offset + length), position);
      } else {
        for (var i = 0; i < length; i++) {
          node.contents[position + i] = buffer[offset + i]; // Or fall back to manual write if not.
        }
      }
      node.usedBytes = Math.max(node.usedBytes, position + length);
      return length;
    },
    llseek(stream, offset, whence) {
      var position = offset;
      if (whence === 1) {
        position += stream.position;
      } else if (whence === 2) {
        if (FS.isFile(stream.node.mode)) {
          position += stream.node.usedBytes;
        }
      }
      if (position < 0) {
        throw new FS.ErrnoError(28);
      }
      return position;
    },
    allocate(stream, offset, length) {
      MEMFS.expandFileStorage(stream.node, offset + length);
      stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
    },
    mmap(stream, length, position, prot, flags) {
      if (!FS.isFile(stream.node.mode)) {
        throw new FS.ErrnoError(43);
      }
      var ptr;
      var allocated;
      var contents = stream.node.contents;
      // Only make a new copy when MAP_PRIVATE is specified.
      if (!(flags & 2) && contents.buffer === HEAP8.buffer) {
        // We can't emulate MAP_SHARED when the file is not backed by the
        // buffer we're mapping to (e.g. the HEAP buffer).
        allocated = false;
        ptr = contents.byteOffset;
      } else {
        // Try to avoid unnecessary slices.
        if (position > 0 || position + length < contents.length) {
          if (contents.subarray) {
            contents = contents.subarray(position, position + length);
          } else {
            contents = Array.prototype.slice.call(contents, position, position + length);
          }
        }
        allocated = true;
        ptr = mmapAlloc(length);
        if (!ptr) {
          throw new FS.ErrnoError(48);
        }
        HEAP8.set(contents, ptr);
      }
      return { ptr, allocated };
    },
    msync(stream, buffer, offset, length, mmapFlags) {
      MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
      // should we check if bytesWritten and length are the same?
      return 0;
    },
  },
};

/** @param {boolean=} noRunDep */
var asyncLoad = (url, onload, onerror, noRunDep) => {
  var dep = !noRunDep ? getUniqueRunDependency(`al ${url}`) : '';
  readAsync(url, (arrayBuffer) => {
    assert(arrayBuffer, `Loading data file "${url}" failed (no arrayBuffer).`);
    onload(new Uint8Array(arrayBuffer));
    if (dep) removeRunDependency(dep);
  }, (event) => {
    if (onerror) {
      onerror();
    } else {
      throw `Loading data file "${url}" failed.`;
    }
  });
  if (dep) addRunDependency(dep);
};


var FS_createDataFile = (parent, name, fileData, canRead, canWrite, canOwn) => {
  FS.createDataFile(parent, name, fileData, canRead, canWrite, canOwn);
};

var preloadPlugins = Module['preloadPlugins'] || [];
var FS_handledByPreloadPlugin = (byteArray, fullname, finish, onerror) => {
  // Ensure plugins are ready.
  if (typeof Browser != 'undefined') Browser.init();

  var handled = false;
  preloadPlugins.forEach((plugin) => {
    if (handled) return;
    if (plugin['canHandle'](fullname)) {
      plugin['handle'](byteArray, fullname, finish, onerror);
      handled = true;
    }
  });
  return handled;
};
var FS_createPreloadedFile = (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) => {
  // TODO we should allow people to just pass in a complete filename instead
  // of parent and name being that we just join them anyways
  var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
  var dep = getUniqueRunDependency(`cp ${fullname}`); // might have several active requests for the same fullname
  function processData(byteArray) {
    function finish(byteArray) {
      preFinish?.();
      if (!dontCreateFile) {
        FS_createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
      }
      onload?.();
      removeRunDependency(dep);
    }
    if (FS_handledByPreloadPlugin(byteArray, fullname, finish, () => {
      onerror?.();
      removeRunDependency(dep);
    })) {
      return;
    }
    finish(byteArray);
  }
  addRunDependency(dep);
  if (typeof url == 'string') {
    asyncLoad(url, (byteArray) => processData(byteArray), onerror);
  } else {
    processData(url);
  }
};

var FS_modeStringToFlags = (str) => {
  var flagModes = {
    'r': 0,
    'r+': 2,
    'w': 512 | 64 | 1,
    'w+': 512 | 64 | 2,
    'a': 1024 | 64 | 1,
    'a+': 1024 | 64 | 2,
  };
  var flags = flagModes[str];
  if (typeof flags == 'undefined') {
    throw new Error(`Unknown file open mode: ${str}`);
  }
  return flags;
};

var FS_getMode = (canRead, canWrite) => {
  var mode = 0;
  if (canRead) mode |= 292 | 73;
  if (canWrite) mode |= 146;
  return mode;
};




var ERRNO_MESSAGES = {
  0: "Success",
  1: "Arg list too long",
  2: "Permission denied",
  3: "Address already in use",
  4: "Address not available",
  5: "Address family not supported by protocol family",
  6: "No more processes",
  7: "Socket already connected",
  8: "Bad file number",
  9: "Trying to read unreadable message",
  10: "Mount device busy",
  11: "Operation canceled",
  12: "No children",
  13: "Connection aborted",
  14: "Connection refused",
  15: "Connection reset by peer",
  16: "File locking deadlock error",
  17: "Destination address required",
  18: "Math arg out of domain of func",
  19: "Quota exceeded",
  20: "File exists",
  21: "Bad address",
  22: "File too large",
  23: "Host is unreachable",
  24: "Identifier removed",
  25: "Illegal byte sequence",
  26: "Connection already in progress",
  27: "Interrupted system call",
  28: "Invalid argument",
  29: "I/O error",
  30: "Socket is already connected",
  31: "Is a directory",
  32: "Too many symbolic links",
  33: "Too many open files",
  34: "Too many links",
  35: "Message too long",
  36: "Multihop attempted",
  37: "File or path name too long",
  38: "Network interface is not configured",
  39: "Connection reset by network",
  40: "Network is unreachable",
  41: "Too many open files in system",
  42: "No buffer space available",
  43: "No such device",
  44: "No such file or directory",
  45: "Exec format error",
  46: "No record locks available",
  47: "The link has been severed",
  48: "Not enough core",
  49: "No message of desired type",
  50: "Protocol not available",
  51: "No space left on device",
  52: "Function not implemented",
  53: "Socket is not connected",
  54: "Not a directory",
  55: "Directory not empty",
  56: "State not recoverable",
  57: "Socket operation on non-socket",
  59: "Not a typewriter",
  60: "No such device or address",
  61: "Value too large for defined data type",
  62: "Previous owner died",
  63: "Not super-user",
  64: "Broken pipe",
  65: "Protocol error",
  66: "Unknown protocol",
  67: "Protocol wrong type for socket",
  68: "Math result not representable",
  69: "Read only file system",
  70: "Illegal seek",
  71: "No such process",
  72: "Stale file handle",
  73: "Connection timed out",
  74: "Text file busy",
  75: "Cross-device link",
  100: "Device not a stream",
  101: "Bad font file fmt",
  102: "Invalid slot",
  103: "Invalid request code",
  104: "No anode",
  105: "Block device required",
  106: "Channel number out of range",
  107: "Level 3 halted",
  108: "Level 3 reset",
  109: "Link number out of range",
  110: "Protocol driver not attached",
  111: "No CSI structure available",
  112: "Level 2 halted",
  113: "Invalid exchange",
  114: "Invalid request descriptor",
  115: "Exchange full",
  116: "No data (for no delay io)",
  117: "Timer expired",
  118: "Out of streams resources",
  119: "Machine is not on the network",
  120: "Package not installed",
  121: "The object is remote",
  122: "Advertise error",
  123: "Srmount error",
  124: "Communication error on send",
  125: "Cross mount point (not really error)",
  126: "Given log. name not unique",
  127: "f.d. invalid for this operation",
  128: "Remote address changed",
  129: "Can   access a needed shared lib",
  130: "Accessing a corrupted shared lib",
  131: ".lib section in a.out corrupted",
  132: "Attempting to link in too many libs",
  133: "Attempting to exec a shared library",
  135: "Streams pipe error",
  136: "Too many users",
  137: "Socket type not supported",
  138: "Not supported",
  139: "Protocol family not supported",
  140: "Can't send after socket shutdown",
  141: "Too many references",
  142: "Host is down",
  148: "No medium (in tape drive)",
  156: "Level 2 not synchronized",
};

var ERRNO_CODES = {
  'EPERM': 63,
  'ENOENT': 44,
  'ESRCH': 71,
  'EINTR': 27,
  'EIO': 29,
  'ENXIO': 60,
  'E2BIG': 1,
  'ENOEXEC': 45,
  'EBADF': 8,
  'ECHILD': 12,
  'EAGAIN': 6,
  'EWOULDBLOCK': 6,
  'ENOMEM': 48,
  'EACCES': 2,
  'EFAULT': 21,
  'ENOTBLK': 105,
  'EBUSY': 10,
  'EEXIST': 20,
  'EXDEV': 75,
  'ENODEV': 43,
  'ENOTDIR': 54,
  'EISDIR': 31,
  'EINVAL': 28,
  'ENFILE': 41,
  'EMFILE': 33,
  'ENOTTY': 59,
  'ETXTBSY': 74,
  'EFBIG': 22,
  'ENOSPC': 51,
  'ESPIPE': 70,
  'EROFS': 69,
  'EMLINK': 34,
  'EPIPE': 64,
  'EDOM': 18,
  'ERANGE': 68,
  'ENOMSG': 49,
  'EIDRM': 24,
  'ECHRNG': 106,
  'EL2NSYNC': 156,
  'EL3HLT': 107,
  'EL3RST': 108,
  'ELNRNG': 109,
  'EUNATCH': 110,
  'ENOCSI': 111,
  'EL2HLT': 112,
  'EDEADLK': 16,
  'ENOLCK': 46,
  'EBADE': 113,
  'EBADR': 114,
  'EXFULL': 115,
  'ENOANO': 104,
  'EBADRQC': 103,
  'EBADSLT': 102,
  'EDEADLOCK': 16,
  'EBFONT': 101,
  'ENOSTR': 100,
  'ENODATA': 116,
  'ETIME': 117,
  'ENOSR': 118,
  'ENONET': 119,
  'ENOPKG': 120,
  'EREMOTE': 121,
  'ENOLINK': 47,
  'EADV': 122,
  'ESRMNT': 123,
  'ECOMM': 124,
  'EPROTO': 65,
  'EMULTIHOP': 36,
  'EDOTDOT': 125,
  'EBADMSG': 9,
  'ENOTUNIQ': 126,
  'EBADFD': 127,
  'EREMCHG': 128,
  'ELIBACC': 129,
  'ELIBBAD': 130,
  'ELIBSCN': 131,
  'ELIBMAX': 132,
  'ELIBEXEC': 133,
  'ENOSYS': 52,
  'ENOTEMPTY': 55,
  'ENAMETOOLONG': 37,
  'ELOOP': 32,
  'EOPNOTSUPP': 138,
  'EPFNOSUPPORT': 139,
  'ECONNRESET': 15,
  'ENOBUFS': 42,
  'EAFNOSUPPORT': 5,
  'EPROTOTYPE': 67,
  'ENOTSOCK': 57,
  'ENOPROTOOPT': 50,
  'ESHUTDOWN': 140,
  'ECONNREFUSED': 14,
  'EADDRINUSE': 3,
  'ECONNABORTED': 13,
  'ENETUNREACH': 40,
  'ENETDOWN': 38,
  'ETIMEDOUT': 73,
  'EHOSTDOWN': 142,
  'EHOSTUNREACH': 23,
  'EINPROGRESS': 26,
  'EALREADY': 7,
  'EDESTADDRREQ': 17,
  'EMSGSIZE': 35,
  'EPROTONOSUPPORT': 66,
  'ESOCKTNOSUPPORT': 137,
  'EADDRNOTAVAIL': 4,
  'ENETRESET': 39,
  'EISCONN': 30,
  'ENOTCONN': 53,
  'ETOOMANYREFS': 141,
  'EUSERS': 136,
  'EDQUOT': 19,
  'ESTALE': 72,
  'ENOTSUP': 138,
  'ENOMEDIUM': 148,
  'EILSEQ': 25,
  'EOVERFLOW': 61,
  'ECANCELED': 11,
  'ENOTRECOVERABLE': 56,
  'EOWNERDEAD': 62,
  'ESTRPIPE': 135,
};

var demangle = (func) => {
  warnOnce('warning: build with -sDEMANGLE_SUPPORT to link in libcxxabi demangling');
  return func;
};
var demangleAll = (text) => {
  var regex =
    /\b_Z[\w\d_]+/g;
  return text.replace(regex,
    function (x) {
      var y = demangle(x);
      return x === y ? x : (y + ' [' + x + ']');
    });
};
var FS = {
  root: null,
  mounts: [],
  devices: {
  },
  streams: [],
  nextInode: 1,
  nameTable: null,
  currentPath: "/",
  initialized: false,
  ignorePermissions: true,
  ErrnoError: null,
  genericErrors: {
  },
  filesystems: null,
  syncFSRequests: 0,
  lookupPath(path, opts = {}) {
    path = PATH_FS.resolve(path);

    if (!path) return { path: '', node: null };

    var defaults = {
      follow_mount: true,
      recurse_count: 0
    };
    opts = Object.assign(defaults, opts)

    if (opts.recurse_count > 8) {  // max recursive lookup of 8
      throw new FS.ErrnoError(32);
    }

    // split the absolute path
    var parts = path.split('/').filter((p) => !!p);

    // start at the root
    var current = FS.root;
    var current_path = '/';

    for (var i = 0; i < parts.length; i++) {
      var islast = (i === parts.length - 1);
      if (islast && opts.parent) {
        // stop resolving
        break;
      }

      current = FS.lookupNode(current, parts[i]);
      current_path = PATH.join2(current_path, parts[i]);

      // jump to the mount's root node if this is a mountpoint
      if (FS.isMountpoint(current)) {
        if (!islast || (islast && opts.follow_mount)) {
          current = current.mounted.root;
        }
      }

      // by default, lookupPath will not follow a symlink if it is the final path component.
      // setting opts.follow = true will override this behavior.
      if (!islast || opts.follow) {
        var count = 0;
        while (FS.isLink(current.mode)) {
          var link = FS.readlink(current_path);
          current_path = PATH_FS.resolve(PATH.dirname(current_path), link);

          var lookup = FS.lookupPath(current_path, { recurse_count: opts.recurse_count + 1 });
          current = lookup.node;

          if (count++ > 40) {  // limit max consecutive symlinks to 40 (SYMLOOP_MAX).
            throw new FS.ErrnoError(32);
          }
        }
      }
    }

    return { path: current_path, node: current };
  },
  getPath(node) {
    var path;
    while (true) {
      if (FS.isRoot(node)) {
        var mount = node.mount.mountpoint;
        if (!path) return mount;
        return mount[mount.length - 1] !== '/' ? `${mount}/${path}` : mount + path;
      }
      path = path ? `${node.name}/${path}` : node.name;
      node = node.parent;
    }
  },
  hashName(parentid, name) {
    var hash = 0;

    for (var i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    }
    return ((parentid + hash) >>> 0) % FS.nameTable.length;
  },
  hashAddNode(node) {
    var hash = FS.hashName(node.parent.id, node.name);
    node.name_next = FS.nameTable[hash];
    FS.nameTable[hash] = node;
  },
  hashRemoveNode(node) {
    var hash = FS.hashName(node.parent.id, node.name);
    if (FS.nameTable[hash] === node) {
      FS.nameTable[hash] = node.name_next;
    } else {
      var current = FS.nameTable[hash];
      while (current) {
        if (current.name_next === node) {
          current.name_next = node.name_next;
          break;
        }
        current = current.name_next;
      }
    }
  },
  lookupNode(parent, name) {
    var errCode = FS.mayLookup(parent);
    if (errCode) {
      throw new FS.ErrnoError(errCode, parent);
    }
    var hash = FS.hashName(parent.id, name);
    for (var node = FS.nameTable[hash]; node; node = node.name_next) {
      var nodeName = node.name;
      if (node.parent.id === parent.id && nodeName === name) {
        return node;
      }
    }
    // if we failed to find it in the cache, call into the VFS
    return FS.lookup(parent, name);
  },
  createNode(parent, name, mode, rdev) {
    assert(typeof parent == 'object')
    var node = new FS.FSNode(parent, name, mode, rdev);

    FS.hashAddNode(node);

    return node;
  },
  destroyNode(node) {
    FS.hashRemoveNode(node);
  },
  isRoot(node) {
    return node === node.parent;
  },
  isMountpoint(node) {
    return !!node.mounted;
  },
  isFile(mode) {
    return (mode & 61440) === 32768;
  },
  isDir(mode) {
    return (mode & 61440) === 16384;
  },
  isLink(mode) {
    return (mode & 61440) === 40960;
  },
  isChrdev(mode) {
    return (mode & 61440) === 8192;
  },
  isBlkdev(mode) {
    return (mode & 61440) === 24576;
  },
  isFIFO(mode) {
    return (mode & 61440) === 4096;
  },
  isSocket(mode) {
    return (mode & 49152) === 49152;
  },
  flagsToPermissionString(flag) {
    var perms = ['r', 'w', 'rw'][flag & 3];
    if ((flag & 512)) {
      perms += 'w';
    }
    return perms;
  },
  nodePermissions(node, perms) {
    if (FS.ignorePermissions) {
      return 0;
    }
    // return 0 if any user, group or owner bits are set.
    if (perms.includes('r') && !(node.mode & 292)) {
      return 2;
    } else if (perms.includes('w') && !(node.mode & 146)) {
      return 2;
    } else if (perms.includes('x') && !(node.mode & 73)) {
      return 2;
    }
    return 0;
  },
  mayLookup(dir) {
    var errCode = FS.nodePermissions(dir, 'x');
    if (errCode) return errCode;
    if (!dir.node_ops.lookup) return 2;
    return 0;
  },
  mayCreate(dir, name) {
    try {
      var node = FS.lookupNode(dir, name);
      return 20;
    } catch (e) {
    }
    return FS.nodePermissions(dir, 'wx');
  },
  mayDelete(dir, name, isdir) {
    var node;
    try {
      node = FS.lookupNode(dir, name);
    } catch (e) {
      return e.errno;
    }
    var errCode = FS.nodePermissions(dir, 'wx');
    if (errCode) {
      return errCode;
    }
    if (isdir) {
      if (!FS.isDir(node.mode)) {
        return 54;
      }
      if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
        return 10;
      }
    } else {
      if (FS.isDir(node.mode)) {
        return 31;
      }
    }
    return 0;
  },
  mayOpen(node, flags) {
    if (!node) {
      return 44;
    }
    if (FS.isLink(node.mode)) {
      return 32;
    } else if (FS.isDir(node.mode)) {
      if (FS.flagsToPermissionString(flags) !== 'r' || // opening for write
        (flags & 512)) { // TODO: check for O_SEARCH? (== search for dir only)
        return 31;
      }
    }
    return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
  },
  MAX_OPEN_FDS: 4096,
  nextfd() {
    for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {
      if (!FS.streams[fd]) {
        return fd;
      }
    }
    throw new FS.ErrnoError(33);
  },
  getStreamChecked(fd) {
    var stream = FS.getStream(fd);
    if (!stream) {
      throw new FS.ErrnoError(8);
    }
    return stream;
  },
  getStream: (fd) => FS.streams[fd],
  createStream(stream, fd = -1) {
    if (!FS.FSStream) {
      FS.FSStream = /** @constructor */ function () {
        this.shared = {};
      };
      FS.FSStream.prototype = {};
      Object.defineProperties(FS.FSStream.prototype, {
        object: {
          /** @this {FS.FSStream} */
          get() { return this.node; },
          /** @this {FS.FSStream} */
          set(val) { this.node = val; }
        },
        isRead: {
          /** @this {FS.FSStream} */
          get() { return (this.flags & 2097155) !== 1; }
        },
        isWrite: {
          /** @this {FS.FSStream} */
          get() { return (this.flags & 2097155) !== 0; }
        },
        isAppend: {
          /** @this {FS.FSStream} */
          get() { return (this.flags & 1024); }
        },
        flags: {
          /** @this {FS.FSStream} */
          get() { return this.shared.flags; },
          /** @this {FS.FSStream} */
          set(val) { this.shared.flags = val; },
        },
        position: {
          /** @this {FS.FSStream} */
          get() { return this.shared.position; },
          /** @this {FS.FSStream} */
          set(val) { this.shared.position = val; },
        },
      });
    }
    // clone it, so we can return an instance of FSStream
    stream = Object.assign(new FS.FSStream(), stream);
    if (fd == -1) {
      fd = FS.nextfd();
    }
    stream.fd = fd;
    FS.streams[fd] = stream;
    return stream;
  },
  closeStream(fd) {
    FS.streams[fd] = null;
  },
  chrdev_stream_ops: {
    open(stream) {
      var device = FS.getDevice(stream.node.rdev);
      // override node's stream ops with the device's
      stream.stream_ops = device.stream_ops;
      // forward the open call
      stream.stream_ops.open?.(stream);
    },
    llseek() {
      throw new FS.ErrnoError(70);
    },
  },
  major: (dev) => ((dev) >> 8),
  minor: (dev) => ((dev) & 0xff),
  makedev: (ma, mi) => ((ma) << 8 | (mi)),
  registerDevice(dev, ops) {
    FS.devices[dev] = { stream_ops: ops };
  },
  getDevice: (dev) => FS.devices[dev],
  getMounts(mount) {
    var mounts = [];
    var check = [mount];

    while (check.length) {
      var m = check.pop();

      mounts.push(m);

      check.push.apply(check, m.mounts);
    }

    return mounts;
  },
  syncfs(populate, callback) {
    if (typeof populate == 'function') {
      callback = populate;
      populate = false;
    }

    FS.syncFSRequests++;

    if (FS.syncFSRequests > 1) {
      err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`);
    }

    var mounts = FS.getMounts(FS.root.mount);
    var completed = 0;

    function doCallback(errCode) {
      assert(FS.syncFSRequests > 0);
      FS.syncFSRequests--;
      return callback(errCode);
    }

    function done(errCode) {
      if (errCode) {
        if (!done.errored) {
          done.errored = true;
          return doCallback(errCode);
        }
        return;
      }
      if (++completed >= mounts.length) {
        doCallback(null);
      }
    };

    // sync all mounts
    mounts.forEach((mount) => {
      if (!mount.type.syncfs) {
        return done(null);
      }
      mount.type.syncfs(mount, populate, done);
    });
  },
  mount(type, opts, mountpoint) {
    if (typeof type == 'string') {
      // The filesystem was not included, and instead we have an error
      // message stored in the variable.
      throw type;
    }
    var root = mountpoint === '/';
    var pseudo = !mountpoint;
    var node;

    if (root && FS.root) {
      throw new FS.ErrnoError(10);
    } else if (!root && !pseudo) {
      var lookup = FS.lookupPath(mountpoint, { follow_mount: false });

      mountpoint = lookup.path;  // use the absolute path
      node = lookup.node;

      if (FS.isMountpoint(node)) {
        throw new FS.ErrnoError(10);
      }

      if (!FS.isDir(node.mode)) {
        throw new FS.ErrnoError(54);
      }
    }

    var mount = {
      type,
      opts,
      mountpoint,
      mounts: []
    };

    // create a root node for the fs
    var mountRoot = type.mount(mount);
    mountRoot.mount = mount;
    mount.root = mountRoot;

    if (root) {
      FS.root = mountRoot;
    } else if (node) {
      // set as a mountpoint
      node.mounted = mount;

      // add the new mount to the current mount's children
      if (node.mount) {
        node.mount.mounts.push(mount);
      }
    }

    return mountRoot;
  },
  unmount(mountpoint) {
    var lookup = FS.lookupPath(mountpoint, { follow_mount: false });

    if (!FS.isMountpoint(lookup.node)) {
      throw new FS.ErrnoError(28);
    }

    // destroy the nodes for this mount, and all its child mounts
    var node = lookup.node;
    var mount = node.mounted;
    var mounts = FS.getMounts(mount);

    Object.keys(FS.nameTable).forEach((hash) => {
      var current = FS.nameTable[hash];

      while (current) {
        var next = current.name_next;

        if (mounts.includes(current.mount)) {
          FS.destroyNode(current);
        }

        current = next;
      }
    });

    // no longer a mountpoint
    node.mounted = null;

    // remove this mount from the child mounts
    var idx = node.mount.mounts.indexOf(mount);
    assert(idx !== -1);
    node.mount.mounts.splice(idx, 1);
  },
  lookup(parent, name) {
    return parent.node_ops.lookup(parent, name);
  },
  mknod(path, mode, dev) {
    var lookup = FS.lookupPath(path, { parent: true });
    var parent = lookup.node;
    var name = PATH.basename(path);
    if (!name || name === '.' || name === '..') {
      throw new FS.ErrnoError(28);
    }
    var errCode = FS.mayCreate(parent, name);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.mknod) {
      throw new FS.ErrnoError(63);
    }
    return parent.node_ops.mknod(parent, name, mode, dev);
  },
  create(path, mode) {
    mode = mode !== undefined ? mode : 438 /* 0666 */;
    mode &= 4095;
    mode |= 32768;
    return FS.mknod(path, mode, 0);
  },
  mkdir(path, mode) {
    mode = mode !== undefined ? mode : 511 /* 0777 */;
    mode &= 511 | 512;
    mode |= 16384;
    return FS.mknod(path, mode, 0);
  },
  mkdirTree(path, mode) {
    var dirs = path.split('/');
    var d = '';
    for (var i = 0; i < dirs.length; ++i) {
      if (!dirs[i]) continue;
      d += '/' + dirs[i];
      try {
        FS.mkdir(d, mode);
      } catch (e) {
        if (e.errno != 20) throw e;
      }
    }
  },
  mkdev(path, mode, dev) {
    if (typeof dev == 'undefined') {
      dev = mode;
      mode = 438 /* 0666 */;
    }
    mode |= 8192;
    return FS.mknod(path, mode, dev);
  },
  symlink(oldpath, newpath) {
    if (!PATH_FS.resolve(oldpath)) {
      throw new FS.ErrnoError(44);
    }
    var lookup = FS.lookupPath(newpath, { parent: true });
    var parent = lookup.node;
    if (!parent) {
      throw new FS.ErrnoError(44);
    }
    var newname = PATH.basename(newpath);
    var errCode = FS.mayCreate(parent, newname);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.symlink) {
      throw new FS.ErrnoError(63);
    }
    return parent.node_ops.symlink(parent, newname, oldpath);
  },
  rename(old_path, new_path) {
    var old_dirname = PATH.dirname(old_path);
    var new_dirname = PATH.dirname(new_path);
    var old_name = PATH.basename(old_path);
    var new_name = PATH.basename(new_path);
    // parents must exist
    var lookup, old_dir, new_dir;

    // let the errors from non existant directories percolate up
    lookup = FS.lookupPath(old_path, { parent: true });
    old_dir = lookup.node;
    lookup = FS.lookupPath(new_path, { parent: true });
    new_dir = lookup.node;

    if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
    // need to be part of the same mount
    if (old_dir.mount !== new_dir.mount) {
      throw new FS.ErrnoError(75);
    }
    // source must exist
    var old_node = FS.lookupNode(old_dir, old_name);
    // old path should not be an ancestor of the new path
    var relative = PATH_FS.relative(old_path, new_dirname);
    if (relative.charAt(0) !== '.') {
      throw new FS.ErrnoError(28);
    }
    // new path should not be an ancestor of the old path
    relative = PATH_FS.relative(new_path, old_dirname);
    if (relative.charAt(0) !== '.') {
      throw new FS.ErrnoError(55);
    }
    // see if the new path already exists
    var new_node;
    try {
      new_node = FS.lookupNode(new_dir, new_name);
    } catch (e) {
      // not fatal
    }
    // early out if nothing needs to change
    if (old_node === new_node) {
      return;
    }
    // we'll need to delete the old entry
    var isdir = FS.isDir(old_node.mode);
    var errCode = FS.mayDelete(old_dir, old_name, isdir);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    // need delete permissions if we'll be overwriting.
    // need create permissions if new doesn't already exist.
    errCode = new_node ?
      FS.mayDelete(new_dir, new_name, isdir) :
      FS.mayCreate(new_dir, new_name);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!old_dir.node_ops.rename) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
      throw new FS.ErrnoError(10);
    }
    // if we are going to change the parent, check write permissions
    if (new_dir !== old_dir) {
      errCode = FS.nodePermissions(old_dir, 'w');
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
    }
    // remove the node from the lookup hash
    FS.hashRemoveNode(old_node);
    // do the underlying fs rename
    try {
      old_dir.node_ops.rename(old_node, new_dir, new_name);
    } catch (e) {
      throw e;
    } finally {
      // add the node back to the hash (in case node_ops.rename
      // changed its name)
      FS.hashAddNode(old_node);
    }
  },
  rmdir(path) {
    var lookup = FS.lookupPath(path, { parent: true });
    var parent = lookup.node;
    var name = PATH.basename(path);
    var node = FS.lookupNode(parent, name);
    var errCode = FS.mayDelete(parent, name, true);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.rmdir) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(node)) {
      throw new FS.ErrnoError(10);
    }
    parent.node_ops.rmdir(parent, name);
    FS.destroyNode(node);
  },
  readdir(path) {
    var lookup = FS.lookupPath(path, { follow: true });
    var node = lookup.node;
    if (!node.node_ops.readdir) {
      throw new FS.ErrnoError(54);
    }
    return node.node_ops.readdir(node);
  },
  unlink(path) {
    var lookup = FS.lookupPath(path, { parent: true });
    var parent = lookup.node;
    if (!parent) {
      throw new FS.ErrnoError(44);
    }
    var name = PATH.basename(path);
    var node = FS.lookupNode(parent, name);
    var errCode = FS.mayDelete(parent, name, false);
    if (errCode) {
      // According to POSIX, we should map EISDIR to EPERM, but
      // we instead do what Linux does (and we must, as we use
      // the musl linux libc).
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.unlink) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(node)) {
      throw new FS.ErrnoError(10);
    }
    parent.node_ops.unlink(parent, name);
    FS.destroyNode(node);
  },
  readlink(path) {
    var lookup = FS.lookupPath(path);
    var link = lookup.node;
    if (!link) {
      throw new FS.ErrnoError(44);
    }
    if (!link.node_ops.readlink) {
      throw new FS.ErrnoError(28);
    }
    return PATH_FS.resolve(FS.getPath(link.parent), link.node_ops.readlink(link));
  },
  stat(path, dontFollow) {
    var lookup = FS.lookupPath(path, { follow: !dontFollow });
    var node = lookup.node;
    if (!node) {
      throw new FS.ErrnoError(44);
    }
    if (!node.node_ops.getattr) {
      throw new FS.ErrnoError(63);
    }
    return node.node_ops.getattr(node);
  },
  lstat(path) {
    return FS.stat(path, true);
  },
  chmod(path, mode, dontFollow) {
    var node;
    if (typeof path == 'string') {
      var lookup = FS.lookupPath(path, { follow: !dontFollow });
      node = lookup.node;
    } else {
      node = path;
    }
    if (!node.node_ops.setattr) {
      throw new FS.ErrnoError(63);
    }
    node.node_ops.setattr(node, {
      mode: (mode & 4095) | (node.mode & ~4095),
      timestamp: Date.now()
    });
  },
  lchmod(path, mode) {
    FS.chmod(path, mode, true);
  },
  fchmod(fd, mode) {
    var stream = FS.getStreamChecked(fd);
    FS.chmod(stream.node, mode);
  },
  chown(path, uid, gid, dontFollow) {
    var node;
    if (typeof path == 'string') {
      var lookup = FS.lookupPath(path, { follow: !dontFollow });
      node = lookup.node;
    } else {
      node = path;
    }
    if (!node.node_ops.setattr) {
      throw new FS.ErrnoError(63);
    }
    node.node_ops.setattr(node, {
      timestamp: Date.now()
      // we ignore the uid / gid for now
    });
  },
  lchown(path, uid, gid) {
    FS.chown(path, uid, gid, true);
  },
  fchown(fd, uid, gid) {
    var stream = FS.getStreamChecked(fd);
    FS.chown(stream.node, uid, gid);
  },
  truncate(path, len) {
    if (len < 0) {
      throw new FS.ErrnoError(28);
    }
    var node;
    if (typeof path == 'string') {
      var lookup = FS.lookupPath(path, { follow: true });
      node = lookup.node;
    } else {
      node = path;
    }
    if (!node.node_ops.setattr) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isDir(node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!FS.isFile(node.mode)) {
      throw new FS.ErrnoError(28);
    }
    var errCode = FS.nodePermissions(node, 'w');
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    node.node_ops.setattr(node, {
      size: len,
      timestamp: Date.now()
    });
  },
  ftruncate(fd, len) {
    var stream = FS.getStreamChecked(fd);
    if ((stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(28);
    }
    FS.truncate(stream.node, len);
  },
  utime(path, atime, mtime) {
    var lookup = FS.lookupPath(path, { follow: true });
    var node = lookup.node;
    node.node_ops.setattr(node, {
      timestamp: Math.max(atime, mtime)
    });
  },
  open(path, flags, mode) {
    if (path === "") {
      throw new FS.ErrnoError(44);
    }
    flags = typeof flags == 'string' ? FS_modeStringToFlags(flags) : flags;
    mode = typeof mode == 'undefined' ? 438 /* 0666 */ : mode;
    if ((flags & 64)) {
      mode = (mode & 4095) | 32768;
    } else {
      mode = 0;
    }
    var node;
    if (typeof path == 'object') {
      node = path;
    } else {
      path = PATH.normalize(path);
      try {
        var lookup = FS.lookupPath(path, {
          follow: !(flags & 131072)
        });
        node = lookup.node;
      } catch (e) {
        // ignore
      }
    }
    // perhaps we need to create the node
    var created = false;
    if ((flags & 64)) {
      if (node) {
        // if O_CREAT and O_EXCL are set, error out if the node already exists
        if ((flags & 128)) {
          throw new FS.ErrnoError(20);
        }
      } else {
        // node doesn't exist, try to create it
        node = FS.mknod(path, mode, 0);
        created = true;
      }
    }
    if (!node) {
      throw new FS.ErrnoError(44);
    }
    // can't truncate a device
    if (FS.isChrdev(node.mode)) {
      flags &= ~512;
    }
    // if asked only for a directory, then this must be one
    if ((flags & 65536) && !FS.isDir(node.mode)) {
      throw new FS.ErrnoError(54);
    }
    // check permissions, if this is not a file we just created now (it is ok to
    // create and write to a file with read-only permissions; it is read-only
    // for later use)
    if (!created) {
      var errCode = FS.mayOpen(node, flags);
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
    }
    // do truncation if necessary
    if ((flags & 512) && !created) {
      FS.truncate(node, 0);
    }
    // we've already handled these, don't pass down to the underlying vfs
    flags &= ~(128 | 512 | 131072);

    // register the stream with the filesystem
    var stream = FS.createStream({
      node,
      path: FS.getPath(node),  // we want the absolute path to the node
      flags,
      seekable: true,
      position: 0,
      stream_ops: node.stream_ops,
      // used by the file family libc calls (fopen, fwrite, ferror, etc.)
      ungotten: [],
      error: false
    });
    // call the new stream's open function
    if (stream.stream_ops.open) {
      stream.stream_ops.open(stream);
    }
    if (Module['logReadFiles'] && !(flags & 1)) {
      if (!FS.readFiles) FS.readFiles = {};
      if (!(path in FS.readFiles)) {
        FS.readFiles[path] = 1;
      }
    }
    return stream;
  },
  close(stream) {
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if (stream.getdents) stream.getdents = null; // free readdir state
    try {
      if (stream.stream_ops.close) {
        stream.stream_ops.close(stream);
      }
    } catch (e) {
      throw e;
    } finally {
      FS.closeStream(stream.fd);
    }
    stream.fd = null;
  },
  isClosed(stream) {
    return stream.fd === null;
  },
  llseek(stream, offset, whence) {
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if (!stream.seekable || !stream.stream_ops.llseek) {
      throw new FS.ErrnoError(70);
    }
    if (whence != 0 && whence != 1 && whence != 2) {
      throw new FS.ErrnoError(28);
    }
    stream.position = stream.stream_ops.llseek(stream, offset, whence);
    stream.ungotten = [];
    return stream.position;
  },
  read(stream, buffer, offset, length, position) {
    assert(offset >= 0);
    if (length < 0 || position < 0) {
      throw new FS.ErrnoError(28);
    }
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if ((stream.flags & 2097155) === 1) {
      throw new FS.ErrnoError(8);
    }
    if (FS.isDir(stream.node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!stream.stream_ops.read) {
      throw new FS.ErrnoError(28);
    }
    var seeking = typeof position != 'undefined';
    if (!seeking) {
      position = stream.position;
    } else if (!stream.seekable) {
      throw new FS.ErrnoError(70);
    }
    var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
    if (!seeking) stream.position += bytesRead;
    return bytesRead;
  },
  write(stream, buffer, offset, length, position, canOwn) {
    assert(offset >= 0);
    if (length < 0 || position < 0) {
      throw new FS.ErrnoError(28);
    }
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if ((stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(8);
    }
    if (FS.isDir(stream.node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!stream.stream_ops.write) {
      throw new FS.ErrnoError(28);
    }
    if (stream.seekable && stream.flags & 1024) {
      // seek to the end before writing in append mode
      FS.llseek(stream, 0, 2);
    }
    var seeking = typeof position != 'undefined';
    if (!seeking) {
      position = stream.position;
    } else if (!stream.seekable) {
      throw new FS.ErrnoError(70);
    }
    var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
    if (!seeking) stream.position += bytesWritten;
    return bytesWritten;
  },
  allocate(stream, offset, length) {
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if (offset < 0 || length <= 0) {
      throw new FS.ErrnoError(28);
    }
    if ((stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(8);
    }
    if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
      throw new FS.ErrnoError(43);
    }
    if (!stream.stream_ops.allocate) {
      throw new FS.ErrnoError(138);
    }
    stream.stream_ops.allocate(stream, offset, length);
  },
  mmap(stream, length, position, prot, flags) {
    // User requests writing to file (prot & PROT_WRITE != 0).
    // Checking if we have permissions to write to the file unless
    // MAP_PRIVATE flag is set. According to POSIX spec it is possible
    // to write to file opened in read-only mode with MAP_PRIVATE flag,
    // as all modifications will be visible only in the memory of
    // the current process.
    if ((prot & 2) !== 0
      && (flags & 2) === 0
      && (stream.flags & 2097155) !== 2) {
      throw new FS.ErrnoError(2);
    }
    if ((stream.flags & 2097155) === 1) {
      throw new FS.ErrnoError(2);
    }
    if (!stream.stream_ops.mmap) {
      throw new FS.ErrnoError(43);
    }
    return stream.stream_ops.mmap(stream, length, position, prot, flags);
  },
  msync(stream, buffer, offset, length, mmapFlags) {
    assert(offset >= 0);
    if (!stream.stream_ops.msync) {
      return 0;
    }
    return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
  },
  munmap: (stream) => 0,
  ioctl(stream, cmd, arg) {
    if (!stream.stream_ops.ioctl) {
      throw new FS.ErrnoError(59);
    }
    return stream.stream_ops.ioctl(stream, cmd, arg);
  },
  readFile(path, opts = {}) {
    opts.flags = opts.flags || 0;
    opts.encoding = opts.encoding || 'binary';
    if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
      throw new Error(`Invalid encoding type "${opts.encoding}"`);
    }
    var ret;
    var stream = FS.open(path, opts.flags);
    var stat = FS.stat(path);
    var length = stat.size;
    var buf = new Uint8Array(length);
    FS.read(stream, buf, 0, length, 0);
    if (opts.encoding === 'utf8') {
      ret = UTF8ArrayToString(buf, 0);
    } else if (opts.encoding === 'binary') {
      ret = buf;
    }
    FS.close(stream);
    return ret;
  },
  writeFile(path, data, opts = {}) {
    opts.flags = opts.flags || 577;
    var stream = FS.open(path, opts.flags, opts.mode);
    if (typeof data == 'string') {
      var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
      var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
      FS.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn);
    } else if (ArrayBuffer.isView(data)) {
      FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
    } else {
      throw new Error('Unsupported data type');
    }
    FS.close(stream);
  },
  cwd: () => FS.currentPath,
  chdir(path) {
    var lookup = FS.lookupPath(path, { follow: true });
    if (lookup.node === null) {
      throw new FS.ErrnoError(44);
    }
    if (!FS.isDir(lookup.node.mode)) {
      throw new FS.ErrnoError(54);
    }
    var errCode = FS.nodePermissions(lookup.node, 'x');
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    FS.currentPath = lookup.path;
  },
  createDefaultDirectories() {
    FS.mkdir('/tmp');
    FS.mkdir('/home');
    FS.mkdir('/home/web_user');
  },
  createDefaultDevices() {
    // create /dev
    FS.mkdir('/dev');
    // setup /dev/null
    FS.registerDevice(FS.makedev(1, 3), {
      read: () => 0,
      write: (stream, buffer, offset, length, pos) => length,
    });
    FS.mkdev('/dev/null', FS.makedev(1, 3));
    // setup /dev/tty and /dev/tty1
    // stderr needs to print output using err() rather than out()
    // so we register a second tty just for it.
    TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
    TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
    FS.mkdev('/dev/tty', FS.makedev(5, 0));
    FS.mkdev('/dev/tty1', FS.makedev(6, 0));
    // setup /dev/[u]random
    // use a buffer to avoid overhead of individual crypto calls per byte
    var randomBuffer = new Uint8Array(1024), randomLeft = 0;
    var randomByte = () => {
      if (randomLeft === 0) {
        randomLeft = randomFill(randomBuffer).byteLength;
      }
      return randomBuffer[--randomLeft];
    };
    FS.createDevice('/dev', 'random', randomByte);
    FS.createDevice('/dev', 'urandom', randomByte);
    // we're not going to emulate the actual shm device,
    // just create the tmp dirs that reside in it commonly
    FS.mkdir('/dev/shm');
    FS.mkdir('/dev/shm/tmp');
  },
  createSpecialDirectories() {
    // create /proc/self/fd which allows /proc/self/fd/6 => readlink gives the
    // name of the stream for fd 6 (see test_unistd_ttyname)
    FS.mkdir('/proc');
    var proc_self = FS.mkdir('/proc/self');
    FS.mkdir('/proc/self/fd');
    FS.mount({
      mount() {
        var node = FS.createNode(proc_self, 'fd', 16384 | 511 /* 0777 */, 73);
        node.node_ops = {
          lookup(parent, name) {
            var fd = +name;
            var stream = FS.getStreamChecked(fd);
            var ret = {
              parent: null,
              mount: { mountpoint: 'fake' },
              node_ops: { readlink: () => stream.path },
            };
            ret.parent = ret; // make it look like a simple root node
            return ret;
          }
        };
        return node;
      }
    }, {}, '/proc/self/fd');
  },
  createStandardStreams() {
    // TODO deprecate the old functionality of a single
    // input / output callback and that utilizes FS.createDevice
    // and instead require a unique set of stream ops

    // by default, we symlink the standard streams to the
    // default tty devices. however, if the standard streams
    // have been overwritten we create a unique device for
    // them instead.
    if (Module['stdin']) {
      FS.createDevice('/dev', 'stdin', Module['stdin']);
    } else {
      FS.symlink('/dev/tty', '/dev/stdin');
    }
    if (Module['stdout']) {
      FS.createDevice('/dev', 'stdout', null, Module['stdout']);
    } else {
      FS.symlink('/dev/tty', '/dev/stdout');
    }
    if (Module['stderr']) {
      FS.createDevice('/dev', 'stderr', null, Module['stderr']);
    } else {
      FS.symlink('/dev/tty1', '/dev/stderr');
    }

    // open default streams for the stdin, stdout and stderr devices
    var stdin = FS.open('/dev/stdin', 0);
    var stdout = FS.open('/dev/stdout', 1);
    var stderr = FS.open('/dev/stderr', 1);
    assert(stdin.fd === 0, `invalid handle for stdin (${stdin.fd})`);
    assert(stdout.fd === 1, `invalid handle for stdout (${stdout.fd})`);
    assert(stderr.fd === 2, `invalid handle for stderr (${stderr.fd})`);
  },
  ensureErrnoError() {
    if (FS.ErrnoError) return;
    FS.ErrnoError = /** @this{Object} */ function ErrnoError(errno, node) {
      // We set the `name` property to be able to identify `FS.ErrnoError`
      // - the `name` is a standard ECMA-262 property of error objects. Kind of good to have it anyway.
      // - when using PROXYFS, an error can come from an underlying FS
      // as different FS objects have their own FS.ErrnoError each,
      // the test `err instanceof FS.ErrnoError` won't detect an error coming from another filesystem, causing bugs.
      // we'll use the reliable test `err.name == "ErrnoError"` instead
      this.name = 'ErrnoError';
      this.node = node;
      this.setErrno = /** @this{Object} */ function (errno) {
        this.errno = errno;
        for (var key in ERRNO_CODES) {
          if (ERRNO_CODES[key] === errno) {
            this.code = key;
            break;
          }
        }
      };
      this.setErrno(errno);
      this.message = ERRNO_MESSAGES[errno];

      // Try to get a maximally helpful stack trace. On Node.js, getting Error.stack
      // now ensures it shows what we want.
      if (this.stack) {
        // Define the stack property for Node.js 4, which otherwise errors on the next line.
        Object.defineProperty(this, "stack", { value: (new Error).stack, writable: true });
        this.stack = demangleAll(this.stack);
      }
    };
    FS.ErrnoError.prototype = new Error();
    FS.ErrnoError.prototype.constructor = FS.ErrnoError;
    // Some errors may happen quite a bit, to avoid overhead we reuse them (and suffer a lack of stack info)
    [44].forEach((code) => {
      FS.genericErrors[code] = new FS.ErrnoError(code);
      FS.genericErrors[code].stack = '<generic error, no stack>';
    });
  },
  staticInit() {
    FS.ensureErrnoError();

    FS.nameTable = new Array(4096);

    FS.mount(MEMFS, {}, '/');

    FS.createDefaultDirectories();
    FS.createDefaultDevices();
    FS.createSpecialDirectories();

    FS.filesystems = {
      'MEMFS': MEMFS,
    };
  },
  init(input, output, error) {
    assert(!FS.init.initialized, 'FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)');
    FS.init.initialized = true;

    FS.ensureErrnoError();

    // Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
    Module['stdin'] = input || Module['stdin'];
    Module['stdout'] = output || Module['stdout'];
    Module['stderr'] = error || Module['stderr'];

    FS.createStandardStreams();
  },
  quit() {
    FS.init.initialized = false;
    // force-flush all streams, so we get musl std streams printed out
    _fflush(0);
    // close all of our streams
    for (var i = 0; i < FS.streams.length; i++) {
      var stream = FS.streams[i];
      if (!stream) {
        continue;
      }
      FS.close(stream);
    }
  },
  findObject(path, dontResolveLastLink) {
    var ret = FS.analyzePath(path, dontResolveLastLink);
    if (!ret.exists) {
      return null;
    }
    return ret.object;
  },
  analyzePath(path, dontResolveLastLink) {
    // operate from within the context of the symlink's target
    try {
      var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
      path = lookup.path;
    } catch (e) {
    }
    var ret = {
      isRoot: false, exists: false, error: 0, name: null, path: null, object: null,
      parentExists: false, parentPath: null, parentObject: null
    };
    try {
      var lookup = FS.lookupPath(path, { parent: true });
      ret.parentExists = true;
      ret.parentPath = lookup.path;
      ret.parentObject = lookup.node;
      ret.name = PATH.basename(path);
      lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
      ret.exists = true;
      ret.path = lookup.path;
      ret.object = lookup.node;
      ret.name = lookup.node.name;
      ret.isRoot = lookup.path === '/';
    } catch (e) {
      ret.error = e.errno;
    };
    return ret;
  },
  createPath(parent, path, canRead, canWrite) {
    parent = typeof parent == 'string' ? parent : FS.getPath(parent);
    var parts = path.split('/').reverse();
    while (parts.length) {
      var part = parts.pop();
      if (!part) continue;
      var current = PATH.join2(parent, part);
      try {
        FS.mkdir(current);
      } catch (e) {
        // ignore EEXIST
      }
      parent = current;
    }
    return current;
  },
  createFile(parent, name, properties, canRead, canWrite) {
    var path = PATH.join2(typeof parent == 'string' ? parent : FS.getPath(parent), name);
    var mode = FS_getMode(canRead, canWrite);
    return FS.create(path, mode);
  },
  createDataFile(parent, name, data, canRead, canWrite, canOwn) {
    var path = name;
    if (parent) {
      parent = typeof parent == 'string' ? parent : FS.getPath(parent);
      path = name ? PATH.join2(parent, name) : parent;
    }
    var mode = FS_getMode(canRead, canWrite);
    var node = FS.create(path, mode);
    if (data) {
      if (typeof data == 'string') {
        var arr = new Array(data.length);
        for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
        data = arr;
      }
      // make sure we can write to the file
      FS.chmod(node, mode | 146);
      var stream = FS.open(node, 577);
      FS.write(stream, data, 0, data.length, 0, canOwn);
      FS.close(stream);
      FS.chmod(node, mode);
    }
  },
  createDevice(parent, name, input, output) {
    var path = PATH.join2(typeof parent == 'string' ? parent : FS.getPath(parent), name);
    var mode = FS_getMode(!!input, !!output);
    if (!FS.createDevice.major) FS.createDevice.major = 64;
    var dev = FS.makedev(FS.createDevice.major++, 0);
    // Create a fake device that a set of stream ops to emulate
    // the old behavior.
    FS.registerDevice(dev, {
      open(stream) {
        stream.seekable = false;
      },
      close(stream) {
        // flush any pending line data
        if (output?.buffer?.length) {
          output(10);
        }
      },
      read(stream, buffer, offset, length, pos /* ignored */) {
        var bytesRead = 0;
        for (var i = 0; i < length; i++) {
          var result;
          try {
            result = input();
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
          if (result === undefined && bytesRead === 0) {
            throw new FS.ErrnoError(6);
          }
          if (result === null || result === undefined) break;
          bytesRead++;
          buffer[offset + i] = result;
        }
        if (bytesRead) {
          stream.node.timestamp = Date.now();
        }
        return bytesRead;
      },
      write(stream, buffer, offset, length, pos) {
        for (var i = 0; i < length; i++) {
          try {
            output(buffer[offset + i]);
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
        }
        if (length) {
          stream.node.timestamp = Date.now();
        }
        return i;
      }
    });
    return FS.mkdev(path, mode, dev);
  },
  forceLoadFile(obj) {
    if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
    if (typeof XMLHttpRequest != 'undefined') {
      throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
    } else if (read_) {
      // Command-line.
      try {
        // WARNING: Can't read binary files in V8's d8 or tracemonkey's js, as
        //          read() will try to parse UTF8.
        obj.contents = intArrayFromString(read_(obj.url), true);
        obj.usedBytes = obj.contents.length;
      } catch (e) {
        throw new FS.ErrnoError(29);
      }
    } else {
      throw new Error('Cannot load without read() or XMLHttpRequest.');
    }
  },
  createLazyFile(parent, name, url, canRead, canWrite) {
    // Lazy chunked Uint8Array (implements get and length from Uint8Array). Actual getting is abstracted away for eventual reuse.
    /** @constructor */
    function LazyUint8Array() {
      this.lengthKnown = false;
      this.chunks = []; // Loaded chunks. Index is the chunk number
    }
    LazyUint8Array.prototype.get = /** @this{Object} */ function LazyUint8Array_get(idx) {
      if (idx > this.length - 1 || idx < 0) {
        return undefined;
      }
      var chunkOffset = idx % this.chunkSize;
      var chunkNum = (idx / this.chunkSize) | 0;
      return this.getter(chunkNum)[chunkOffset];
    };
    LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
      this.getter = getter;
    };
    LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
      // Find length
      var xhr = new XMLHttpRequest();
      xhr.open('HEAD', url, false);
      xhr.send(null);
      if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
      var datalength = Number(xhr.getResponseHeader("Content-length"));
      var header;
      var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
      var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";

      var chunkSize = 1024 * 1024; // Chunk size in bytes

      if (!hasByteServing) chunkSize = datalength;

      // Function to get a range from the remote URL.
      var doXHR = (from, to) => {
        if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
        if (to > datalength - 1) throw new Error("only " + datalength + " bytes available! programmer error!");

        // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);

        // Some hints to the browser that we want binary data.
        xhr.responseType = 'arraybuffer';
        if (xhr.overrideMimeType) {
          xhr.overrideMimeType('text/plain; charset=x-user-defined');
        }

        xhr.send(null);
        if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
        if (xhr.response !== undefined) {
          return new Uint8Array(/** @type{Array<number>} */(xhr.response || []));
        }
        return intArrayFromString(xhr.responseText || '', true);
      };
      var lazyArray = this;
      lazyArray.setDataGetter((chunkNum) => {
        var start = chunkNum * chunkSize;
        var end = (chunkNum + 1) * chunkSize - 1; // including this byte
        end = Math.min(end, datalength - 1); // if datalength-1 is selected, this is the last block
        if (typeof lazyArray.chunks[chunkNum] == 'undefined') {
          lazyArray.chunks[chunkNum] = doXHR(start, end);
        }
        if (typeof lazyArray.chunks[chunkNum] == 'undefined') throw new Error('doXHR failed!');
        return lazyArray.chunks[chunkNum];
      });

      if (usesGzip || !datalength) {
        // if the server uses gzip or doesn't supply the length, we have to download the whole file to get the (uncompressed) length
        chunkSize = datalength = 1; // this will force getter(0)/doXHR do download the whole file
        datalength = this.getter(0).length;
        chunkSize = datalength;
        out("LazyFiles on gzip forces download of the whole file when length is accessed");
      }

      this._length = datalength;
      this._chunkSize = chunkSize;
      this.lengthKnown = true;
    };
    if (typeof XMLHttpRequest != 'undefined') {
      if (!ENVIRONMENT_IS_WORKER) throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc';
      var lazyArray = new LazyUint8Array();
      Object.defineProperties(lazyArray, {
        length: {
          get: /** @this{Object} */ function () {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._length;
          }
        },
        chunkSize: {
          get: /** @this{Object} */ function () {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._chunkSize;
          }
        }
      });

      var properties = { isDevice: false, contents: lazyArray };
    } else {
      var properties = { isDevice: false, url: url };
    }

    var node = FS.createFile(parent, name, properties, canRead, canWrite);
    // This is a total hack, but I want to get this lazy file code out of the
    // core of MEMFS. If we want to keep this lazy file concept I feel it should
    // be its own thin LAZYFS proxying calls to MEMFS.
    if (properties.contents) {
      node.contents = properties.contents;
    } else if (properties.url) {
      node.contents = null;
      node.url = properties.url;
    }
    // Add a function that defers querying the file size until it is asked the first time.
    Object.defineProperties(node, {
      usedBytes: {
        get: /** @this {FSNode} */ function () { return this.contents.length; }
      }
    });
    // override each stream op with one that tries to force load the lazy file first
    var stream_ops = {};
    var keys = Object.keys(node.stream_ops);
    keys.forEach((key) => {
      var fn = node.stream_ops[key];
      stream_ops[key] = function forceLoadLazyFile() {
        FS.forceLoadFile(node);
        return fn.apply(null, arguments);
      };
    });
    function writeChunks(stream, buffer, offset, length, position) {
      var contents = stream.node.contents;
      if (position >= contents.length)
        return 0;
      var size = Math.min(contents.length - position, length);
      assert(size >= 0);
      if (contents.slice) { // normal array
        for (var i = 0; i < size; i++) {
          buffer[offset + i] = contents[position + i];
        }
      } else {
        for (var i = 0; i < size; i++) { // LazyUint8Array from sync binary XHR
          buffer[offset + i] = contents.get(position + i);
        }
      }
      return size;
    }
    // use a custom read function
    stream_ops.read = (stream, buffer, offset, length, position) => {
      FS.forceLoadFile(node);
      return writeChunks(stream, buffer, offset, length, position)
    };
    // use a custom mmap function
    stream_ops.mmap = (stream, length, position, prot, flags) => {
      FS.forceLoadFile(node);
      var ptr = mmapAlloc(length);
      if (!ptr) {
        throw new FS.ErrnoError(48);
      }
      writeChunks(stream, HEAP8, ptr, length, position);
      return { ptr, allocated: true };
    };
    node.stream_ops = stream_ops;
    return node;
  },
  absolutePath() {
    abort('FS.absolutePath has been removed; use PATH_FS.resolve instead');
  },
  createFolder() {
    abort('FS.createFolder has been removed; use FS.mkdir instead');
  },
  createLink() {
    abort('FS.createLink has been removed; use FS.symlink instead');
  },
  joinPath() {
    abort('FS.joinPath has been removed; use PATH.join instead');
  },
  mmapAlloc() {
    abort('FS.mmapAlloc has been replaced by the top level function mmapAlloc');
  },
  standardizePath() {
    abort('FS.standardizePath has been removed; use PATH.normalize instead');
  },
};

var SYSCALLS = {
  DEFAULT_POLLMASK: 5,
  calculateAt(dirfd, path, allowEmpty) {
    if (PATH.isAbs(path)) {
      return path;
    }
    // relative path
    var dir;
    if (dirfd === -100) {
      dir = FS.cwd();
    } else {
      var dirstream = SYSCALLS.getStreamFromFD(dirfd);
      dir = dirstream.path;
    }
    if (path.length == 0) {
      if (!allowEmpty) {
        throw new FS.ErrnoError(44);;
      }
      return dir;
    }
    return PATH.join2(dir, path);
  },
  doStat(func, path, buf) {
    try {
      var stat = func(path);
    } catch (e) {
      if (e && e.node && PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))) {
        // an error occurred while trying to look up the path; we should just report ENOTDIR
        return -54;
      }
      throw e;
    }
    HEAP32[((buf) >> 2)] = stat.dev;
    HEAP32[(((buf) + (4)) >> 2)] = stat.mode;
    HEAPU32[(((buf) + (8)) >> 2)] = stat.nlink;
    HEAP32[(((buf) + (12)) >> 2)] = stat.uid;
    HEAP32[(((buf) + (16)) >> 2)] = stat.gid;
    HEAP32[(((buf) + (20)) >> 2)] = stat.rdev;
    (tempI64 = [stat.size >>> 0, (tempDouble = stat.size, (+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble) / 4294967296.0))) >>> 0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble))) >>> 0)) / 4294967296.0))))) >>> 0) : 0)], HEAP32[(((buf) + (24)) >> 2)] = tempI64[0], HEAP32[(((buf) + (28)) >> 2)] = tempI64[1]);
    HEAP32[(((buf) + (32)) >> 2)] = 4096;
    HEAP32[(((buf) + (36)) >> 2)] = stat.blocks;
    var atime = stat.atime.getTime();
    var mtime = stat.mtime.getTime();
    var ctime = stat.ctime.getTime();
    (tempI64 = [Math.floor(atime / 1000) >>> 0, (tempDouble = Math.floor(atime / 1000), (+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble) / 4294967296.0))) >>> 0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble))) >>> 0)) / 4294967296.0))))) >>> 0) : 0)], HEAP32[(((buf) + (40)) >> 2)] = tempI64[0], HEAP32[(((buf) + (44)) >> 2)] = tempI64[1]);
    HEAPU32[(((buf) + (48)) >> 2)] = (atime % 1000) * 1000;
    (tempI64 = [Math.floor(mtime / 1000) >>> 0, (tempDouble = Math.floor(mtime / 1000), (+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble) / 4294967296.0))) >>> 0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble))) >>> 0)) / 4294967296.0))))) >>> 0) : 0)], HEAP32[(((buf) + (56)) >> 2)] = tempI64[0], HEAP32[(((buf) + (60)) >> 2)] = tempI64[1]);
    HEAPU32[(((buf) + (64)) >> 2)] = (mtime % 1000) * 1000;
    (tempI64 = [Math.floor(ctime / 1000) >>> 0, (tempDouble = Math.floor(ctime / 1000), (+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble) / 4294967296.0))) >>> 0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble))) >>> 0)) / 4294967296.0))))) >>> 0) : 0)], HEAP32[(((buf) + (72)) >> 2)] = tempI64[0], HEAP32[(((buf) + (76)) >> 2)] = tempI64[1]);
    HEAPU32[(((buf) + (80)) >> 2)] = (ctime % 1000) * 1000;
    (tempI64 = [stat.ino >>> 0, (tempDouble = stat.ino, (+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble) / 4294967296.0))) >>> 0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble))) >>> 0)) / 4294967296.0))))) >>> 0) : 0)], HEAP32[(((buf) + (88)) >> 2)] = tempI64[0], HEAP32[(((buf) + (92)) >> 2)] = tempI64[1]);
    return 0;
  },
  doMsync(addr, stream, len, flags, offset) {
    if (!FS.isFile(stream.node.mode)) {
      throw new FS.ErrnoError(43);
    }
    if (flags & 2) {
      // MAP_PRIVATE calls need not to be synced back to underlying fs
      return 0;
    }
    var buffer = HEAPU8.slice(addr, addr + len);
    FS.msync(stream, buffer, offset, len, flags);
  },
  varargs: undefined,
  get() {
    assert(SYSCALLS.varargs != undefined);
    // the `+` prepended here is necessary to convince the JSCompiler that varargs is indeed a number.
    var ret = HEAP32[((+SYSCALLS.varargs) >> 2)];
    SYSCALLS.varargs += 4;
    return ret;
  },
  getp() { return SYSCALLS.get() },
  getStr(ptr) {
    var ret = UTF8ToString(ptr);
    return ret;
  },
  getStreamFromFD(fd) {
    var stream = FS.getStreamChecked(fd);
    return stream;
  },
};
function ___syscall__newselect(nfds, readfds, writefds, exceptfds, timeout) {
  try {

    // readfds are supported,
    // writefds checks socket open status
    // exceptfds are supported, although on web, such exceptional conditions never arise in web sockets
    //                          and so the exceptfds list will always return empty.
    // timeout is supported, although on SOCKFS and PIPEFS these are ignored and always treated as 0 - fully async
    assert(nfds <= 64, 'nfds must be less than or equal to 64');  // fd sets have 64 bits // TODO: this could be 1024 based on current musl headers

    var total = 0;

    var srcReadLow = (readfds ? HEAP32[((readfds) >> 2)] : 0),
      srcReadHigh = (readfds ? HEAP32[(((readfds) + (4)) >> 2)] : 0);
    var srcWriteLow = (writefds ? HEAP32[((writefds) >> 2)] : 0),
      srcWriteHigh = (writefds ? HEAP32[(((writefds) + (4)) >> 2)] : 0);
    var srcExceptLow = (exceptfds ? HEAP32[((exceptfds) >> 2)] : 0),
      srcExceptHigh = (exceptfds ? HEAP32[(((exceptfds) + (4)) >> 2)] : 0);

    var dstReadLow = 0,
      dstReadHigh = 0;
    var dstWriteLow = 0,
      dstWriteHigh = 0;
    var dstExceptLow = 0,
      dstExceptHigh = 0;

    var allLow = (readfds ? HEAP32[((readfds) >> 2)] : 0) |
      (writefds ? HEAP32[((writefds) >> 2)] : 0) |
      (exceptfds ? HEAP32[((exceptfds) >> 2)] : 0);
    var allHigh = (readfds ? HEAP32[(((readfds) + (4)) >> 2)] : 0) |
      (writefds ? HEAP32[(((writefds) + (4)) >> 2)] : 0) |
      (exceptfds ? HEAP32[(((exceptfds) + (4)) >> 2)] : 0);

    var check = function (fd, low, high, val) {
      return (fd < 32 ? (low & val) : (high & val));
    };

    for (var fd = 0; fd < nfds; fd++) {
      var mask = 1 << (fd % 32);
      if (!(check(fd, allLow, allHigh, mask))) {
        continue;  // index isn't in the set
      }

      var stream = SYSCALLS.getStreamFromFD(fd);

      var flags = SYSCALLS.DEFAULT_POLLMASK;

      if (stream.stream_ops.poll) {
        var timeoutInMillis = -1;
        if (timeout) {
          // select(2) is declared to accept "struct timeval { time_t tv_sec; suseconds_t tv_usec; }".
          // However, musl passes the two values to the syscall as an array of long values.
          // Note that sizeof(time_t) != sizeof(long) in wasm32. The former is 8, while the latter is 4.
          // This means using "C_STRUCTS.timeval.tv_usec" leads to a wrong offset.
          // So, instead, we use POINTER_SIZE.
          var tv_sec = (readfds ? HEAP32[((timeout) >> 2)] : 0),
            tv_usec = (readfds ? HEAP32[(((timeout) + (4)) >> 2)] : 0);
          timeoutInMillis = (tv_sec + tv_usec / 1000000) * 1000;
        }
        flags = stream.stream_ops.poll(stream, timeoutInMillis);
      }

      if ((flags & 1) && check(fd, srcReadLow, srcReadHigh, mask)) {
        fd < 32 ? (dstReadLow = dstReadLow | mask) : (dstReadHigh = dstReadHigh | mask);
        total++;
      }
      if ((flags & 4) && check(fd, srcWriteLow, srcWriteHigh, mask)) {
        fd < 32 ? (dstWriteLow = dstWriteLow | mask) : (dstWriteHigh = dstWriteHigh | mask);
        total++;
      }
      if ((flags & 2) && check(fd, srcExceptLow, srcExceptHigh, mask)) {
        fd < 32 ? (dstExceptLow = dstExceptLow | mask) : (dstExceptHigh = dstExceptHigh | mask);
        total++;
      }
    }

    if (readfds) {
      HEAP32[((readfds) >> 2)] = dstReadLow;
      HEAP32[(((readfds) + (4)) >> 2)] = dstReadHigh;
    }
    if (writefds) {
      HEAP32[((writefds) >> 2)] = dstWriteLow;
      HEAP32[(((writefds) + (4)) >> 2)] = dstWriteHigh;
    }
    if (exceptfds) {
      HEAP32[((exceptfds) >> 2)] = dstExceptLow;
      HEAP32[(((exceptfds) + (4)) >> 2)] = dstExceptHigh;
    }

    return total;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

var SOCKFS = {
  mount(mount) {
    // If Module['websocket'] has already been defined (e.g. for configuring
    // the subprotocol/url) use that, if not initialise it to a new object.
    Module['websocket'] = (Module['websocket'] &&
      ('object' === typeof Module['websocket'])) ? Module['websocket'] : {};

    // Add the Event registration mechanism to the exported websocket configuration
    // object so we can register network callbacks from native JavaScript too.
    // For more documentation see system/include/emscripten/emscripten.h
    Module['websocket']._callbacks = {};
    Module['websocket']['on'] = /** @this{Object} */ function (event, callback) {
      if ('function' === typeof callback) {
        this._callbacks[event] = callback;
      }
      return this;
    };

    Module['websocket'].emit = /** @this{Object} */ function (event, param) {
      if ('function' === typeof this._callbacks[event]) {
        this._callbacks[event].call(this, param);
      }
    };

    // If debug is enabled register simple default logging callbacks for each Event.

    return FS.createNode(null, '/', 16384 | 511 /* 0777 */, 0);
  },
  createSocket(family, type, protocol) {
    type &= ~526336; // Some applications may pass it; it makes no sense for a single process.
    var streaming = type == 1;
    if (streaming && protocol && protocol != 6) {
      throw new FS.ErrnoError(66); // if SOCK_STREAM, must be tcp or 0.
    }

    // create our internal socket structure
    var sock = {
      family,
      type,
      protocol,
      server: null,
      error: null, // Used in getsockopt for SOL_SOCKET/SO_ERROR test
      peers: {},
      pending: [],
      recv_queue: [],
      sock_ops: SOCKFS.websocket_sock_ops
    };

    // create the filesystem node to store the socket structure
    var name = SOCKFS.nextname();
    var node = FS.createNode(SOCKFS.root, name, 49152, 0);
    node.sock = sock;

    // and the wrapping stream that enables library functions such
    // as read and write to indirectly interact with the socket
    var stream = FS.createStream({
      path: name,
      node,
      flags: 2,
      seekable: false,
      stream_ops: SOCKFS.stream_ops
    });

    // map the new stream to the socket structure (sockets have a 1:1
    // relationship with a stream)
    sock.stream = stream;

    return sock;
  },
  getSocket(fd) {
    var stream = FS.getStream(fd);
    if (!stream || !FS.isSocket(stream.node.mode)) {
      return null;
    }
    return stream.node.sock;
  },
  stream_ops: {
    poll(stream) {
      var sock = stream.node.sock;
      return sock.sock_ops.poll(sock);
    },
    ioctl(stream, request, varargs) {
      var sock = stream.node.sock;
      return sock.sock_ops.ioctl(sock, request, varargs);
    },
    read(stream, buffer, offset, length, position /* ignored */) {
      var sock = stream.node.sock;
      var msg = sock.sock_ops.recvmsg(sock, length);
      if (!msg) {
        // socket is closed
        return 0;
      }
      buffer.set(msg.buffer, offset);
      return msg.buffer.length;
    },
    write(stream, buffer, offset, length, position /* ignored */) {
      var sock = stream.node.sock;
      return sock.sock_ops.sendmsg(sock, buffer, offset, length);
    },
    close(stream) {
      var sock = stream.node.sock;
      sock.sock_ops.close(sock);
    },
  },
  nextname() {
    if (!SOCKFS.nextname.current) {
      SOCKFS.nextname.current = 0;
    }
    return 'socket[' + (SOCKFS.nextname.current++) + ']';
  },
  websocket_sock_ops: {
    createPeer(sock, addr, port) {
      var ws;

      if (typeof addr == 'object') {
        ws = addr;
        addr = null;
        port = null;
      }

      if (ws) {
        // for sockets that've already connected (e.g. we're the server)
        // we can inspect the _socket property for the address
        if (ws._socket) {
          addr = ws._socket.remoteAddress;
          port = ws._socket.remotePort;
        }
        // if we're just now initializing a connection to the remote,
        // inspect the url property
        else {
          var result = /ws[s]?:\/\/([^:]+):(\d+)/.exec(ws.url);
          if (!result) {
            throw new Error('WebSocket URL must be in the format ws(s)://address:port');
          }
          addr = result[1];
          port = parseInt(result[2], 10);
        }
      } else {
        // create the actual websocket object and connect
        try {
          // runtimeConfig gets set to true if WebSocket runtime configuration is available.
          var runtimeConfig = (Module['websocket'] && ('object' === typeof Module['websocket']));

          // The default value is 'ws://' the replace is needed because the compiler replaces '//' comments with '#'
          // comments without checking context, so we'd end up with ws:#, the replace swaps the '#' for '//' again.
          var url = 'ws:#'.replace('#', '//');

          if (runtimeConfig) {
            if ('string' === typeof Module['websocket']['url']) {
              url = Module['websocket']['url']; // Fetch runtime WebSocket URL config.
            }
          }

          if (url === 'ws://' || url === 'wss://') { // Is the supplied URL config just a prefix, if so complete it.
            var parts = addr.split('/');
            url = url + parts[0] + ":" + port + "/" + parts.slice(1).join('/');
          }

          // Make the WebSocket subprotocol (Sec-WebSocket-Protocol) default to binary if no configuration is set.
          var subProtocols = 'binary'; // The default value is 'binary'

          if (runtimeConfig) {
            if ('string' === typeof Module['websocket']['subprotocol']) {
              subProtocols = Module['websocket']['subprotocol']; // Fetch runtime WebSocket subprotocol config.
            }
          }

          // The default WebSocket options
          var opts = undefined;

          if (subProtocols !== 'null') {
            // The regex trims the string (removes spaces at the beginning and end, then splits the string by
            // <any space>,<any space> into an Array. Whitespace removal is important for Websockify and ws.
            subProtocols = subProtocols.replace(/^ +| +$/g, "").split(/ *, */);

            opts = subProtocols;
          }

          // some webservers (azure) does not support subprotocol header
          if (runtimeConfig && null === Module['websocket']['subprotocol']) {
            subProtocols = 'null';
            opts = undefined;
          }

          // If node we use the ws library.
          var WebSocketConstructor;
          if (ENVIRONMENT_IS_NODE) {
            WebSocketConstructor = /** @type{(typeof WebSocket)} */(require('ws'));
          } else {
            WebSocketConstructor = WebSocket;
          }
          ws = new WebSocketConstructor(url, opts);
          ws.binaryType = 'arraybuffer';
        } catch (e) {
          throw new FS.ErrnoError(23);
        }
      }

      var peer = {
        addr,
        port,
        socket: ws,
        dgram_send_queue: []
      };

      SOCKFS.websocket_sock_ops.addPeer(sock, peer);
      SOCKFS.websocket_sock_ops.handlePeerEvents(sock, peer);

      // if this is a bound dgram socket, send the port number first to allow
      // us to override the ephemeral port reported to us by remotePort on the
      // remote end.
      if (sock.type === 2 && typeof sock.sport != 'undefined') {
        peer.dgram_send_queue.push(new Uint8Array([
          255, 255, 255, 255,
          'p'.charCodeAt(0), 'o'.charCodeAt(0), 'r'.charCodeAt(0), 't'.charCodeAt(0),
          ((sock.sport & 0xff00) >> 8), (sock.sport & 0xff)
        ]));
      }

      return peer;
    },
    getPeer(sock, addr, port) {
      return sock.peers[addr + ':' + port];
    },
    addPeer(sock, peer) {
      sock.peers[peer.addr + ':' + peer.port] = peer;
    },
    removePeer(sock, peer) {
      delete sock.peers[peer.addr + ':' + peer.port];
    },
    handlePeerEvents(sock, peer) {
      var first = true;

      var handleOpen = function () {

        Module['websocket'].emit('open', sock.stream.fd);

        try {
          var queued = peer.dgram_send_queue.shift();
          while (queued) {
            peer.socket.send(queued);
            queued = peer.dgram_send_queue.shift();
          }
        } catch (e) {
          // not much we can do here in the way of proper error handling as we've already
          // lied and said this data was sent. shut it down.
          peer.socket.close();
        }
      };

      function handleMessage(data) {
        if (typeof data == 'string') {
          var encoder = new TextEncoder(); // should be utf-8
          data = encoder.encode(data); // make a typed array from the string
        } else {
          assert(data.byteLength !== undefined); // must receive an ArrayBuffer
          if (data.byteLength == 0) {
            // An empty ArrayBuffer will emit a pseudo disconnect event
            // as recv/recvmsg will return zero which indicates that a socket
            // has performed a shutdown although the connection has not been disconnected yet.
            return;
          }
          data = new Uint8Array(data); // make a typed array view on the array buffer
        }

        // if this is the port message, override the peer's port with it
        var wasfirst = first;
        first = false;
        if (wasfirst &&
          data.length === 10 &&
          data[0] === 255 && data[1] === 255 && data[2] === 255 && data[3] === 255 &&
          data[4] === 'p'.charCodeAt(0) && data[5] === 'o'.charCodeAt(0) && data[6] === 'r'.charCodeAt(0) && data[7] === 't'.charCodeAt(0)) {
          // update the peer's port and it's key in the peer map
          var newport = ((data[8] << 8) | data[9]);
          SOCKFS.websocket_sock_ops.removePeer(sock, peer);
          peer.port = newport;
          SOCKFS.websocket_sock_ops.addPeer(sock, peer);
          return;
        }

        sock.recv_queue.push({ addr: peer.addr, port: peer.port, data: data });
        Module['websocket'].emit('message', sock.stream.fd);
      };

      if (ENVIRONMENT_IS_NODE) {
        peer.socket.on('open', handleOpen);
        peer.socket.on('message', function (data, isBinary) {
          if (!isBinary) {
            return;
          }
          handleMessage((new Uint8Array(data)).buffer); // copy from node Buffer -> ArrayBuffer
        });
        peer.socket.on('close', function () {
          Module['websocket'].emit('close', sock.stream.fd);
        });
        peer.socket.on('error', function (error) {
          // Although the ws library may pass errors that may be more descriptive than
          // ECONNREFUSED they are not necessarily the expected error code e.g.
          // ENOTFOUND on getaddrinfo seems to be node.js specific, so using ECONNREFUSED
          // is still probably the most useful thing to do.
          sock.error = 14; // Used in getsockopt for SOL_SOCKET/SO_ERROR test.
          Module['websocket'].emit('error', [sock.stream.fd, sock.error, 'ECONNREFUSED: Connection refused']);
          // don't throw
        });
      } else {
        peer.socket.onopen = handleOpen;
        peer.socket.onclose = function () {
          Module['websocket'].emit('close', sock.stream.fd);
        };
        peer.socket.onmessage = function peer_socket_onmessage(event) {
          handleMessage(event.data);
        };
        peer.socket.onerror = function (error) {
          // The WebSocket spec only allows a 'simple event' to be thrown on error,
          // so we only really know as much as ECONNREFUSED.
          sock.error = 14; // Used in getsockopt for SOL_SOCKET/SO_ERROR test.
          Module['websocket'].emit('error', [sock.stream.fd, sock.error, 'ECONNREFUSED: Connection refused']);
        };
      }
    },
    poll(sock) {
      if (sock.type === 1 && sock.server) {
        // listen sockets should only say they're available for reading
        // if there are pending clients.
        return sock.pending.length ? (64 | 1) : 0;
      }

      var mask = 0;
      var dest = sock.type === 1 ?  // we only care about the socket state for connection-based sockets
        SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport) :
        null;

      if (sock.recv_queue.length ||
        !dest ||  // connection-less sockets are always ready to read
        (dest && dest.socket.readyState === dest.socket.CLOSING) ||
        (dest && dest.socket.readyState === dest.socket.CLOSED)) {  // let recv return 0 once closed
        mask |= (64 | 1);
      }

      if (!dest ||  // connection-less sockets are always ready to write
        (dest && dest.socket.readyState === dest.socket.OPEN)) {
        mask |= 4;
      }

      if ((dest && dest.socket.readyState === dest.socket.CLOSING) ||
        (dest && dest.socket.readyState === dest.socket.CLOSED)) {
        mask |= 16;
      }

      return mask;
    },
    ioctl(sock, request, arg) {
      switch (request) {
        case 21531:
          var bytes = 0;
          if (sock.recv_queue.length) {
            bytes = sock.recv_queue[0].data.length;
          }
          HEAP32[((arg) >> 2)] = bytes;
          return 0;
        default:
          return 28;
      }
    },
    close(sock) {
      // if we've spawned a listen server, close it
      if (sock.server) {
        try {
          sock.server.close();
        } catch (e) {
        }
        sock.server = null;
      }
      // close any peer connections
      var peers = Object.keys(sock.peers);
      for (var i = 0; i < peers.length; i++) {
        var peer = sock.peers[peers[i]];
        try {
          peer.socket.close();
        } catch (e) {
        }
        SOCKFS.websocket_sock_ops.removePeer(sock, peer);
      }
      return 0;
    },
    bind(sock, addr, port) {
      if (typeof sock.saddr != 'undefined' || typeof sock.sport != 'undefined') {
        throw new FS.ErrnoError(28);  // already bound
      }
      sock.saddr = addr;
      sock.sport = port;
      // in order to emulate dgram sockets, we need to launch a listen server when
      // binding on a connection-less socket
      // note: this is only required on the server side
      if (sock.type === 2) {
        // close the existing server if it exists
        if (sock.server) {
          sock.server.close();
          sock.server = null;
        }
        // swallow error operation not supported error that occurs when binding in the
        // browser where this isn't supported
        try {
          sock.sock_ops.listen(sock, 0);
        } catch (e) {
          if (!(e.name === 'ErrnoError')) throw e;
          if (e.errno !== 138) throw e;
        }
      }
    },
    connect(sock, addr, port) {
      if (sock.server) {
        throw new FS.ErrnoError(138);
      }

      // TODO autobind
      // if (!sock.addr && sock.type == 2) {
      // }

      // early out if we're already connected / in the middle of connecting
      if (typeof sock.daddr != 'undefined' && typeof sock.dport != 'undefined') {
        var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);
        if (dest) {
          if (dest.socket.readyState === dest.socket.CONNECTING) {
            throw new FS.ErrnoError(7);
          } else {
            throw new FS.ErrnoError(30);
          }
        }
      }

      // add the socket to our peer list and set our
      // destination address / port to match
      var peer = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
      sock.daddr = peer.addr;
      sock.dport = peer.port;

      // always "fail" in non-blocking mode
      throw new FS.ErrnoError(26);
    },
    listen(sock, backlog) {
      if (!ENVIRONMENT_IS_NODE) {
        throw new FS.ErrnoError(138);
      }
      if (sock.server) {
        throw new FS.ErrnoError(28);  // already listening
      }
      var WebSocketServer = require('ws').Server;
      var host = sock.saddr;
      sock.server = new WebSocketServer({
        host,
        port: sock.sport
        // TODO support backlog
      });
      Module['websocket'].emit('listen', sock.stream.fd); // Send Event with listen fd.

      sock.server.on('connection', function (ws) {
        if (sock.type === 1) {
          var newsock = SOCKFS.createSocket(sock.family, sock.type, sock.protocol);

          // create a peer on the new socket
          var peer = SOCKFS.websocket_sock_ops.createPeer(newsock, ws);
          newsock.daddr = peer.addr;
          newsock.dport = peer.port;

          // push to queue for accept to pick up
          sock.pending.push(newsock);
          Module['websocket'].emit('connection', newsock.stream.fd);
        } else {
          // create a peer on the listen socket so calling sendto
          // with the listen socket and an address will resolve
          // to the correct client
          SOCKFS.websocket_sock_ops.createPeer(sock, ws);
          Module['websocket'].emit('connection', sock.stream.fd);
        }
      });
      sock.server.on('close', function () {
        Module['websocket'].emit('close', sock.stream.fd);
        sock.server = null;
      });
      sock.server.on('error', function (error) {
        // Although the ws library may pass errors that may be more descriptive than
        // ECONNREFUSED they are not necessarily the expected error code e.g.
        // ENOTFOUND on getaddrinfo seems to be node.js specific, so using EHOSTUNREACH
        // is still probably the most useful thing to do. This error shouldn't
        // occur in a well written app as errors should get trapped in the compiled
        // app's own getaddrinfo call.
        sock.error = 23; // Used in getsockopt for SOL_SOCKET/SO_ERROR test.
        Module['websocket'].emit('error', [sock.stream.fd, sock.error, 'EHOSTUNREACH: Host is unreachable']);
        // don't throw
      });
    },
    accept(listensock) {
      if (!listensock.server || !listensock.pending.length) {
        throw new FS.ErrnoError(28);
      }
      var newsock = listensock.pending.shift();
      newsock.stream.flags = listensock.stream.flags;
      return newsock;
    },
    getname(sock, peer) {
      var addr, port;
      if (peer) {
        if (sock.daddr === undefined || sock.dport === undefined) {
          throw new FS.ErrnoError(53);
        }
        addr = sock.daddr;
        port = sock.dport;
      } else {
        // TODO saddr and sport will be set for bind()'d UDP sockets, but what
        // should we be returning for TCP sockets that've been connect()'d?
        addr = sock.saddr || 0;
        port = sock.sport || 0;
      }
      return { addr, port };
    },
    sendmsg(sock, buffer, offset, length, addr, port) {
      if (sock.type === 2) {
        // connection-less sockets will honor the message address,
        // and otherwise fall back to the bound destination address
        if (addr === undefined || port === undefined) {
          addr = sock.daddr;
          port = sock.dport;
        }
        // if there was no address to fall back to, error out
        if (addr === undefined || port === undefined) {
          throw new FS.ErrnoError(17);
        }
      } else {
        // connection-based sockets will only use the bound
        addr = sock.daddr;
        port = sock.dport;
      }

      // find the peer for the destination address
      var dest = SOCKFS.websocket_sock_ops.getPeer(sock, addr, port);

      // early out if not connected with a connection-based socket
      if (sock.type === 1) {
        if (!dest || dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
          throw new FS.ErrnoError(53);
        } else if (dest.socket.readyState === dest.socket.CONNECTING) {
          throw new FS.ErrnoError(6);
        }
      }

      // create a copy of the incoming data to send, as the WebSocket API
      // doesn't work entirely with an ArrayBufferView, it'll just send
      // the entire underlying buffer
      if (ArrayBuffer.isView(buffer)) {
        offset += buffer.byteOffset;
        buffer = buffer.buffer;
      }

      var data;
      data = buffer.slice(offset, offset + length);

      // if we're emulating a connection-less dgram socket and don't have
      // a cached connection, queue the buffer to send upon connect and
      // lie, saying the data was sent now.
      if (sock.type === 2) {
        if (!dest || dest.socket.readyState !== dest.socket.OPEN) {
          // if we're not connected, open a new connection
          if (!dest || dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
            dest = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
          }
          dest.dgram_send_queue.push(data);
          return length;
        }
      }

      try {
        // send the actual data
        dest.socket.send(data);
        return length;
      } catch (e) {
        throw new FS.ErrnoError(28);
      }
    },
    recvmsg(sock, length) {
      // http://pubs.opengroup.org/onlinepubs/7908799/xns/recvmsg.html
      if (sock.type === 1 && sock.server) {
        // tcp servers should not be recv()'ing on the listen socket
        throw new FS.ErrnoError(53);
      }

      var queued = sock.recv_queue.shift();
      if (!queued) {
        if (sock.type === 1) {
          var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);

          if (!dest) {
            // if we have a destination address but are not connected, error out
            throw new FS.ErrnoError(53);
          }
          if (dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
            // return null if the socket has closed
            return null;
          }
          // else, our socket is in a valid state but truly has nothing available
          throw new FS.ErrnoError(6);
        }
        throw new FS.ErrnoError(6);
      }

      // queued.data will be an ArrayBuffer if it's unadulterated, but if it's
      // requeued TCP data it'll be an ArrayBufferView
      var queuedLength = queued.data.byteLength || queued.data.length;
      var queuedOffset = queued.data.byteOffset || 0;
      var queuedBuffer = queued.data.buffer || queued.data;
      var bytesRead = Math.min(length, queuedLength);
      var res = {
        buffer: new Uint8Array(queuedBuffer, queuedOffset, bytesRead),
        addr: queued.addr,
        port: queued.port
      };

      // push back any unread data for TCP connections
      if (sock.type === 1 && bytesRead < queuedLength) {
        var bytesRemaining = queuedLength - bytesRead;
        queued.data = new Uint8Array(queuedBuffer, queuedOffset + bytesRead, bytesRemaining);
        sock.recv_queue.unshift(queued);
      }

      return res;
    },
  },
};

var getSocketFromFD = (fd) => {
  var socket = SOCKFS.getSocket(fd);
  if (!socket) throw new FS.ErrnoError(8);
  return socket;
};

var setErrNo = (value) => {
  HEAP32[((___errno_location()) >> 2)] = value;
  return value;
};
var Sockets = {
  BUFFER_SIZE: 10240,
  MAX_BUFFER_SIZE: 10485760,
  nextFd: 1,
  fds: {
  },
  nextport: 1,
  maxport: 65535,
  peer: null,
  connections: {
  },
  portmap: {
  },
  localAddr: 4261412874,
  addrPool: [33554442, 50331658, 67108874, 83886090, 100663306, 117440522, 134217738, 150994954, 167772170, 184549386, 201326602, 218103818, 234881034],
};

var inetPton4 = (str) => {
  var b = str.split('.');
  for (var i = 0; i < 4; i++) {
    var tmp = Number(b[i]);
    if (isNaN(tmp)) return null;
    b[i] = tmp;
  }
  return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
};


/** @suppress {checkTypes} */
var jstoi_q = (str) => parseInt(str);
var inetPton6 = (str) => {
  var words;
  var w, offset, z, i;
  /* http://home.deds.nl/~aeron/regex/ */
  var valid6regx = /^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/i
  var parts = [];
  if (!valid6regx.test(str)) {
    return null;
  }
  if (str === "::") {
    return [0, 0, 0, 0, 0, 0, 0, 0];
  }
  // Z placeholder to keep track of zeros when splitting the string on ":"
  if (str.startsWith("::")) {
    str = str.replace("::", "Z:"); // leading zeros case
  } else {
    str = str.replace("::", ":Z:");
  }

  if (str.indexOf(".") > 0) {
    // parse IPv4 embedded stress
    str = str.replace(new RegExp('[.]', 'g'), ":");
    words = str.split(":");
    words[words.length - 4] = jstoi_q(words[words.length - 4]) + jstoi_q(words[words.length - 3]) * 256;
    words[words.length - 3] = jstoi_q(words[words.length - 2]) + jstoi_q(words[words.length - 1]) * 256;
    words = words.slice(0, words.length - 2);
  } else {
    words = str.split(":");
  }

  offset = 0; z = 0;
  for (w = 0; w < words.length; w++) {
    if (typeof words[w] == 'string') {
      if (words[w] === 'Z') {
        // compressed zeros - write appropriate number of zero words
        for (z = 0; z < (8 - words.length + 1); z++) {
          parts[w + z] = 0;
        }
        offset = z - 1;
      } else {
        // parse hex to field to 16-bit value and write it in network byte-order
        parts[w + offset] = _htons(parseInt(words[w], 16));
      }
    } else {
      // parsed IPv4 words
      parts[w + offset] = words[w];
    }
  }
  return [
    (parts[1] << 16) | parts[0],
    (parts[3] << 16) | parts[2],
    (parts[5] << 16) | parts[4],
    (parts[7] << 16) | parts[6]
  ];
};


/** @param {number=} addrlen */
var writeSockaddr = (sa, family, addr, port, addrlen) => {
  switch (family) {
    case 2:
      addr = inetPton4(addr);
      zeroMemory(sa, 16);
      if (addrlen) {
        HEAP32[((addrlen) >> 2)] = 16;
      }
      HEAP16[((sa) >> 1)] = family;
      HEAP32[(((sa) + (4)) >> 2)] = addr;
      HEAP16[(((sa) + (2)) >> 1)] = _htons(port);
      break;
    case 10:
      addr = inetPton6(addr);
      zeroMemory(sa, 28);
      if (addrlen) {
        HEAP32[((addrlen) >> 2)] = 28;
      }
      HEAP32[((sa) >> 2)] = family;
      HEAP32[(((sa) + (8)) >> 2)] = addr[0];
      HEAP32[(((sa) + (12)) >> 2)] = addr[1];
      HEAP32[(((sa) + (16)) >> 2)] = addr[2];
      HEAP32[(((sa) + (20)) >> 2)] = addr[3];
      HEAP16[(((sa) + (2)) >> 1)] = _htons(port);
      break;
    default:
      return 5;
  }
  return 0;
};


var DNS = {
  address_map: {
    id: 1,
    addrs: {
    },
    names: {
    },
  },
  lookup_name(name) {
    // If the name is already a valid ipv4 / ipv6 address, don't generate a fake one.
    var res = inetPton4(name);
    if (res !== null) {
      return name;
    }
    res = inetPton6(name);
    if (res !== null) {
      return name;
    }

    // See if this name is already mapped.
    var addr;

    if (DNS.address_map.addrs[name]) {
      addr = DNS.address_map.addrs[name];
    } else {
      var id = DNS.address_map.id++;
      assert(id < 65535, 'exceeded max address mappings of 65535');

      addr = '172.29.' + (id & 0xff) + '.' + (id & 0xff00);

      DNS.address_map.names[addr] = name;
      DNS.address_map.addrs[name] = addr;
    }

    return addr;
  },
  lookup_addr(addr) {
    if (DNS.address_map.names[addr]) {
      return DNS.address_map.names[addr];
    }

    return null;
  },
};

function ___syscall_accept4(fd, addr, addrlen, flags, d1, d2) {
  try {

    var sock = getSocketFromFD(fd);
    var newsock = sock.sock_ops.accept(sock);
    if (addr) {
      var errno = writeSockaddr(addr, newsock.family, DNS.lookup_name(newsock.daddr), newsock.dport, addrlen);
      assert(!errno);
    }
    return newsock.stream.fd;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}



var inetNtop4 = (addr) => {
  return (addr & 0xff) + '.' + ((addr >> 8) & 0xff) + '.' + ((addr >> 16) & 0xff) + '.' + ((addr >> 24) & 0xff)
};


var inetNtop6 = (ints) => {
  //  ref:  http://www.ietf.org/rfc/rfc2373.txt - section 2.5.4
  //  Format for IPv4 compatible and mapped  128-bit IPv6 Addresses
  //  128-bits are split into eight 16-bit words
  //  stored in network byte order (big-endian)
  //  |                80 bits               | 16 |      32 bits        |
  //  +-----------------------------------------------------------------+
  //  |               10 bytes               |  2 |      4 bytes        |
  //  +--------------------------------------+--------------------------+
  //  +               5 words                |  1 |      2 words        |
  //  +--------------------------------------+--------------------------+
  //  |0000..............................0000|0000|    IPv4 ADDRESS     | (compatible)
  //  +--------------------------------------+----+---------------------+
  //  |0000..............................0000|FFFF|    IPv4 ADDRESS     | (mapped)
  //  +--------------------------------------+----+---------------------+
  var str = "";
  var word = 0;
  var longest = 0;
  var lastzero = 0;
  var zstart = 0;
  var len = 0;
  var i = 0;
  var parts = [
    ints[0] & 0xffff,
    (ints[0] >> 16),
    ints[1] & 0xffff,
    (ints[1] >> 16),
    ints[2] & 0xffff,
    (ints[2] >> 16),
    ints[3] & 0xffff,
    (ints[3] >> 16)
  ];

  // Handle IPv4-compatible, IPv4-mapped, loopback and any/unspecified addresses

  var hasipv4 = true;
  var v4part = "";
  // check if the 10 high-order bytes are all zeros (first 5 words)
  for (i = 0; i < 5; i++) {
    if (parts[i] !== 0) { hasipv4 = false; break; }
  }

  if (hasipv4) {
    // low-order 32-bits store an IPv4 address (bytes 13 to 16) (last 2 words)
    v4part = inetNtop4(parts[6] | (parts[7] << 16));
    // IPv4-mapped IPv6 address if 16-bit value (bytes 11 and 12) == 0xFFFF (6th word)
    if (parts[5] === -1) {
      str = "::ffff:";
      str += v4part;
      return str;
    }
    // IPv4-compatible IPv6 address if 16-bit value (bytes 11 and 12) == 0x0000 (6th word)
    if (parts[5] === 0) {
      str = "::";
      //special case IPv6 addresses
      if (v4part === "0.0.0.0") v4part = ""; // any/unspecified address
      if (v4part === "0.0.0.1") v4part = "1";// loopback address
      str += v4part;
      return str;
    }
  }

  // Handle all other IPv6 addresses

  // first run to find the longest contiguous zero words
  for (word = 0; word < 8; word++) {
    if (parts[word] === 0) {
      if (word - lastzero > 1) {
        len = 0;
      }
      lastzero = word;
      len++;
    }
    if (len > longest) {
      longest = len;
      zstart = word - longest + 1;
    }
  }

  for (word = 0; word < 8; word++) {
    if (longest > 1) {
      // compress contiguous zeros - to produce "::"
      if (parts[word] === 0 && word >= zstart && word < (zstart + longest)) {
        if (word === zstart) {
          str += ":";
          if (zstart === 0) str += ":"; //leading zeros case
        }
        continue;
      }
    }
    // converts 16-bit words from big-endian to little-endian before converting to hex string
    str += Number(_ntohs(parts[word] & 0xffff)).toString(16);
    str += word < 7 ? ":" : "";
  }
  return str;
};

var readSockaddr = (sa, salen) => {
  // family / port offsets are common to both sockaddr_in and sockaddr_in6
  var family = HEAP16[((sa) >> 1)];
  var port = _ntohs(HEAPU16[(((sa) + (2)) >> 1)]);
  var addr;

  switch (family) {
    case 2:
      if (salen !== 16) {
        return { errno: 28 };
      }
      addr = HEAP32[(((sa) + (4)) >> 2)];
      addr = inetNtop4(addr);
      break;
    case 10:
      if (salen !== 28) {
        return { errno: 28 };
      }
      addr = [
        HEAP32[(((sa) + (8)) >> 2)],
        HEAP32[(((sa) + (12)) >> 2)],
        HEAP32[(((sa) + (16)) >> 2)],
        HEAP32[(((sa) + (20)) >> 2)]
      ];
      addr = inetNtop6(addr);
      break;
    default:
      return { errno: 5 };
  }

  return { family: family, addr: addr, port: port };
};


/** @param {boolean=} allowNull */
var getSocketAddress = (addrp, addrlen, allowNull) => {
  if (allowNull && addrp === 0) return null;
  var info = readSockaddr(addrp, addrlen);
  if (info.errno) throw new FS.ErrnoError(info.errno);
  info.addr = DNS.lookup_addr(info.addr) || info.addr;
  return info;
};

function ___syscall_bind(fd, addr, addrlen, d1, d2, d3) {
  try {

    var sock = getSocketFromFD(fd);
    var info = getSocketAddress(addr, addrlen);
    sock.sock_ops.bind(sock, info.addr, info.port);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_chdir(path) {
  try {

    path = SYSCALLS.getStr(path);
    FS.chdir(path);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_chmod(path, mode) {
  try {

    path = SYSCALLS.getStr(path);
    FS.chmod(path, mode);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}



function ___syscall_connect(fd, addr, addrlen, d1, d2, d3) {
  try {

    var sock = getSocketFromFD(fd);
    var info = getSocketAddress(addr, addrlen);
    sock.sock_ops.connect(sock, info.addr, info.port);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_dup3(fd, newfd, flags) {
  try {

    var old = SYSCALLS.getStreamFromFD(fd);
    assert(!flags);
    if (old.fd === newfd) return -28;
    var existing = FS.getStream(newfd);
    if (existing) FS.close(existing);
    return FS.createStream(old, newfd).fd;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_faccessat(dirfd, path, amode, flags) {
  try {

    path = SYSCALLS.getStr(path);
    assert(flags === 0);
    path = SYSCALLS.calculateAt(dirfd, path);
    if (amode & ~7) {
      // need a valid mode
      return -28;
    }
    var lookup = FS.lookupPath(path, { follow: true });
    var node = lookup.node;
    if (!node) {
      return -44;
    }
    var perms = '';
    if (amode & 4) perms += 'r';
    if (amode & 2) perms += 'w';
    if (amode & 1) perms += 'x';
    if (perms /* otherwise, they've just passed F_OK */ && FS.nodePermissions(node, perms)) {
      return -2;
    }
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_fchmod(fd, mode) {
  try {

    FS.fchmod(fd, mode);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_fchown32(fd, owner, group) {
  try {

    FS.fchown(fd, owner, group);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}


function ___syscall_fcntl64(fd, cmd, varargs) {
  SYSCALLS.varargs = varargs;
  try {

    var stream = SYSCALLS.getStreamFromFD(fd);
    switch (cmd) {
      case 0: {
        var arg = SYSCALLS.get();
        if (arg < 0) {
          return -28;
        }
        while (FS.streams[arg]) {
          arg++;
        }
        var newStream;
        newStream = FS.createStream(stream, arg);
        return newStream.fd;
      }
      case 1:
      case 2:
        return 0;  // FD_CLOEXEC makes no sense for a single process.
      case 3:
        return stream.flags;
      case 4: {
        var arg = SYSCALLS.get();
        stream.flags |= arg;
        return 0;
      }
      case 5: {
        var arg = SYSCALLS.getp();
        var offset = 0;
        // We're always unlocked.
        HEAP16[(((arg) + (offset)) >> 1)] = 2;
        return 0;
      }
      case 6:
      case 7:
        return 0; // Pretend that the locking is successful.
      case 16:
      case 8:
        return -28; // These are for sockets. We don't have them fully implemented yet.
      case 9:
        // musl trusts getown return values, due to a bug where they must be, as they overlap with errors. just return -1 here, so fcntl() returns that, and we set errno ourselves.
        setErrNo(28);
        return -1;
      default: {
        return -28;
      }
    }
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_fstat64(fd, buf) {
  try {

    var stream = SYSCALLS.getStreamFromFD(fd);
    return SYSCALLS.doStat(FS.stat, stream.path, buf);
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}


var convertI32PairToI53Checked = (lo, hi) => {
  assert(lo == (lo >>> 0) || lo == (lo | 0)); // lo should either be a i32 or a u32
  assert(hi === (hi | 0));                    // hi should be a i32
  return ((hi + 0x200000) >>> 0 < 0x400001 - !!lo) ? (lo >>> 0) + hi * 4294967296 : NaN;
};
function ___syscall_ftruncate64(fd, length_low, length_high) {
  var length = convertI32PairToI53Checked(length_low, length_high);;


  try {

    if (isNaN(length)) return 61;
    FS.ftruncate(fd, length);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  ;
}


var stringToUTF8 = (str, outPtr, maxBytesToWrite) => {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
};

function ___syscall_getcwd(buf, size) {
  try {

    if (size === 0) return -28;
    var cwd = FS.cwd();
    var cwdLengthInBytes = lengthBytesUTF8(cwd) + 1;
    if (size < cwdLengthInBytes) return -68;
    stringToUTF8(cwd, buf, size);
    return cwdLengthInBytes;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}


function ___syscall_getdents64(fd, dirp, count) {
  try {

    var stream = SYSCALLS.getStreamFromFD(fd)
    stream.getdents ||= FS.readdir(stream.path);

    var struct_size = 280;
    var pos = 0;
    var off = FS.llseek(stream, 0, 1);

    var idx = Math.floor(off / struct_size);

    while (idx < stream.getdents.length && pos + struct_size <= count) {
      var id;
      var type;
      var name = stream.getdents[idx];
      if (name === '.') {
        id = stream.node.id;
        type = 4; // DT_DIR
      }
      else if (name === '..') {
        var lookup = FS.lookupPath(stream.path, { parent: true });
        id = lookup.node.id;
        type = 4; // DT_DIR
      }
      else {
        var child = FS.lookupNode(stream.node, name);
        id = child.id;
        type = FS.isChrdev(child.mode) ? 2 :  // DT_CHR, character device.
          FS.isDir(child.mode) ? 4 :     // DT_DIR, directory.
            FS.isLink(child.mode) ? 10 :   // DT_LNK, symbolic link.
              8;                             // DT_REG, regular file.
      }
      assert(id);
      (tempI64 = [id >>> 0, (tempDouble = id, (+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble) / 4294967296.0))) >>> 0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble))) >>> 0)) / 4294967296.0))))) >>> 0) : 0)], HEAP32[((dirp + pos) >> 2)] = tempI64[0], HEAP32[(((dirp + pos) + (4)) >> 2)] = tempI64[1]);
      (tempI64 = [(idx + 1) * struct_size >>> 0, (tempDouble = (idx + 1) * struct_size, (+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble) / 4294967296.0))) >>> 0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble))) >>> 0)) / 4294967296.0))))) >>> 0) : 0)], HEAP32[(((dirp + pos) + (8)) >> 2)] = tempI64[0], HEAP32[(((dirp + pos) + (12)) >> 2)] = tempI64[1]);
      HEAP16[(((dirp + pos) + (16)) >> 1)] = 280;
      HEAP8[(((dirp + pos) + (18)) >> 0)] = type;
      stringToUTF8(name, dirp + pos + 19, 256);
      pos += struct_size;
      idx += 1;
    }
    FS.llseek(stream, idx * struct_size, 0);
    return pos;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}




function ___syscall_getpeername(fd, addr, addrlen, d1, d2, d3) {
  try {

    var sock = getSocketFromFD(fd);
    if (!sock.daddr) {
      return -53; // The socket is not connected.
    }
    var errno = writeSockaddr(addr, sock.family, DNS.lookup_name(sock.daddr), sock.dport, addrlen);
    assert(!errno);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_ioctl(fd, op, varargs) {
  SYSCALLS.varargs = varargs;
  try {

    var stream = SYSCALLS.getStreamFromFD(fd);
    switch (op) {
      case 21509: {
        if (!stream.tty) return -59;
        return 0;
      }
      case 21505: {
        if (!stream.tty) return -59;
        if (stream.tty.ops.ioctl_tcgets) {
          var termios = stream.tty.ops.ioctl_tcgets(stream);
          var argp = SYSCALLS.getp();
          HEAP32[((argp) >> 2)] = termios.c_iflag || 0;
          HEAP32[(((argp) + (4)) >> 2)] = termios.c_oflag || 0;
          HEAP32[(((argp) + (8)) >> 2)] = termios.c_cflag || 0;
          HEAP32[(((argp) + (12)) >> 2)] = termios.c_lflag || 0;
          for (var i = 0; i < 32; i++) {
            HEAP8[(((argp + i) + (17)) >> 0)] = termios.c_cc[i] || 0;
          }
          return 0;
        }
        return 0;
      }
      case 21510:
      case 21511:
      case 21512: {
        if (!stream.tty) return -59;
        return 0; // no-op, not actually adjusting terminal settings
      }
      case 21506:
      case 21507:
      case 21508: {
        if (!stream.tty) return -59;
        if (stream.tty.ops.ioctl_tcsets) {
          var argp = SYSCALLS.getp();
          var c_iflag = HEAP32[((argp) >> 2)];
          var c_oflag = HEAP32[(((argp) + (4)) >> 2)];
          var c_cflag = HEAP32[(((argp) + (8)) >> 2)];
          var c_lflag = HEAP32[(((argp) + (12)) >> 2)];
          var c_cc = []
          for (var i = 0; i < 32; i++) {
            c_cc.push(HEAP8[(((argp + i) + (17)) >> 0)]);
          }
          return stream.tty.ops.ioctl_tcsets(stream.tty, op, { c_iflag, c_oflag, c_cflag, c_lflag, c_cc });
        }
        return 0; // no-op, not actually adjusting terminal settings
      }
      case 21519: {
        if (!stream.tty) return -59;
        var argp = SYSCALLS.getp();
        HEAP32[((argp) >> 2)] = 0;
        return 0;
      }
      case 21520: {
        if (!stream.tty) return -59;
        return -28; // not supported
      }
      case 21531: {
        var argp = SYSCALLS.getp();
        return FS.ioctl(stream, op, argp);
      }
      case 21523: {
        // TODO: in theory we should write to the winsize struct that gets
        // passed in, but for now musl doesn't read anything on it
        if (!stream.tty) return -59;
        if (stream.tty.ops.ioctl_tiocgwinsz) {
          var winsize = stream.tty.ops.ioctl_tiocgwinsz(stream.tty);
          var argp = SYSCALLS.getp();
          HEAP16[((argp) >> 1)] = winsize[0];
          HEAP16[(((argp) + (2)) >> 1)] = winsize[1];
        }
        return 0;
      }
      case 21524: {
        // TODO: technically, this ioctl call should change the window size.
        // but, since emscripten doesn't have any concept of a terminal window
        // yet, we'll just silently throw it away as we do TIOCGWINSZ
        if (!stream.tty) return -59;
        return 0;
      }
      case 21515: {
        if (!stream.tty) return -59;
        return 0;
      }
      default: return -28; // not supported
    }
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}


function ___syscall_listen(fd, backlog) {
  try {

    var sock = getSocketFromFD(fd);
    sock.sock_ops.listen(sock, backlog);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_lstat64(path, buf) {
  try {

    path = SYSCALLS.getStr(path);
    return SYSCALLS.doStat(FS.lstat, path, buf);
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_mkdirat(dirfd, path, mode) {
  try {

    path = SYSCALLS.getStr(path);
    path = SYSCALLS.calculateAt(dirfd, path);
    // remove a trailing slash, if one - /a/b/ has basename of '', but
    // we want to create b in the context of this function
    path = PATH.normalize(path);
    if (path[path.length - 1] === '/') path = path.substr(0, path.length - 1);
    FS.mkdir(path, mode, 0);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_newfstatat(dirfd, path, buf, flags) {
  try {

    path = SYSCALLS.getStr(path);
    var nofollow = flags & 256;
    var allowEmpty = flags & 4096;
    flags = flags & (~6400);
    assert(!flags, `unknown flags in __syscall_newfstatat: ${flags}`);
    path = SYSCALLS.calculateAt(dirfd, path, allowEmpty);
    return SYSCALLS.doStat(nofollow ? FS.lstat : FS.stat, path, buf);
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_openat(dirfd, path, flags, varargs) {
  SYSCALLS.varargs = varargs;
  try {

    path = SYSCALLS.getStr(path);
    path = SYSCALLS.calculateAt(dirfd, path);
    var mode = varargs ? SYSCALLS.get() : 0;
    return FS.open(path, flags, mode).fd;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

var PIPEFS = {
  BUCKET_BUFFER_SIZE: 8192,
  mount(mount) {
    // Do not pollute the real root directory or its child nodes with pipes
    // Looks like it is OK to create another pseudo-root node not linked to the FS.root hierarchy this way
    return FS.createNode(null, '/', 16384 | 511 /* 0777 */, 0);
  },
  createPipe() {
    var pipe = {
      buckets: [],
      // refcnt 2 because pipe has a read end and a write end. We need to be
      // able to read from the read end after write end is closed.
      refcnt: 2,
    };

    pipe.buckets.push({
      buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
      offset: 0,
      roffset: 0
    });

    var rName = PIPEFS.nextname();
    var wName = PIPEFS.nextname();
    var rNode = FS.createNode(PIPEFS.root, rName, 4096, 0);
    var wNode = FS.createNode(PIPEFS.root, wName, 4096, 0);

    rNode.pipe = pipe;
    wNode.pipe = pipe;

    var readableStream = FS.createStream({
      path: rName,
      node: rNode,
      flags: 0,
      seekable: false,
      stream_ops: PIPEFS.stream_ops
    });
    rNode.stream = readableStream;

    var writableStream = FS.createStream({
      path: wName,
      node: wNode,
      flags: 1,
      seekable: false,
      stream_ops: PIPEFS.stream_ops
    });
    wNode.stream = writableStream;

    return {
      readable_fd: readableStream.fd,
      writable_fd: writableStream.fd
    };
  },
  stream_ops: {
    poll(stream) {
      var pipe = stream.node.pipe;

      if ((stream.flags & 2097155) === 1) {
        return (256 | 4);
      }
      if (pipe.buckets.length > 0) {
        for (var i = 0; i < pipe.buckets.length; i++) {
          var bucket = pipe.buckets[i];
          if (bucket.offset - bucket.roffset > 0) {
            return (64 | 1);
          }
        }
      }

      return 0;
    },
    ioctl(stream, request, varargs) {
      return 28;
    },
    fsync(stream) {
      return 28;
    },
    read(stream, buffer, offset, length, position /* ignored */) {
      var pipe = stream.node.pipe;
      var currentLength = 0;

      for (var i = 0; i < pipe.buckets.length; i++) {
        var bucket = pipe.buckets[i];
        currentLength += bucket.offset - bucket.roffset;
      }

      assert(buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer));
      var data = buffer.subarray(offset, offset + length);

      if (length <= 0) {
        return 0;
      }
      if (currentLength == 0) {
        // Behave as if the read end is always non-blocking
        throw new FS.ErrnoError(6);
      }
      var toRead = Math.min(currentLength, length);

      var totalRead = toRead;
      var toRemove = 0;

      for (var i = 0; i < pipe.buckets.length; i++) {
        var currBucket = pipe.buckets[i];
        var bucketSize = currBucket.offset - currBucket.roffset;

        if (toRead <= bucketSize) {
          var tmpSlice = currBucket.buffer.subarray(currBucket.roffset, currBucket.offset);
          if (toRead < bucketSize) {
            tmpSlice = tmpSlice.subarray(0, toRead);
            currBucket.roffset += toRead;
          } else {
            toRemove++;
          }
          data.set(tmpSlice);
          break;
        } else {
          var tmpSlice = currBucket.buffer.subarray(currBucket.roffset, currBucket.offset);
          data.set(tmpSlice);
          data = data.subarray(tmpSlice.byteLength);
          toRead -= tmpSlice.byteLength;
          toRemove++;
        }
      }

      if (toRemove && toRemove == pipe.buckets.length) {
        // Do not generate excessive garbage in use cases such as
        // write several bytes, read everything, write several bytes, read everything...
        toRemove--;
        pipe.buckets[toRemove].offset = 0;
        pipe.buckets[toRemove].roffset = 0;
      }

      pipe.buckets.splice(0, toRemove);

      return totalRead;
    },
    write(stream, buffer, offset, length, position /* ignored */) {
      var pipe = stream.node.pipe;

      assert(buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer));
      var data = buffer.subarray(offset, offset + length);

      var dataLen = data.byteLength;
      if (dataLen <= 0) {
        return 0;
      }

      var currBucket = null;

      if (pipe.buckets.length == 0) {
        currBucket = {
          buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
          offset: 0,
          roffset: 0
        };
        pipe.buckets.push(currBucket);
      } else {
        currBucket = pipe.buckets[pipe.buckets.length - 1];
      }

      assert(currBucket.offset <= PIPEFS.BUCKET_BUFFER_SIZE);

      var freeBytesInCurrBuffer = PIPEFS.BUCKET_BUFFER_SIZE - currBucket.offset;
      if (freeBytesInCurrBuffer >= dataLen) {
        currBucket.buffer.set(data, currBucket.offset);
        currBucket.offset += dataLen;
        return dataLen;
      } else if (freeBytesInCurrBuffer > 0) {
        currBucket.buffer.set(data.subarray(0, freeBytesInCurrBuffer), currBucket.offset);
        currBucket.offset += freeBytesInCurrBuffer;
        data = data.subarray(freeBytesInCurrBuffer, data.byteLength);
      }

      var numBuckets = (data.byteLength / PIPEFS.BUCKET_BUFFER_SIZE) | 0;
      var remElements = data.byteLength % PIPEFS.BUCKET_BUFFER_SIZE;

      for (var i = 0; i < numBuckets; i++) {
        var newBucket = {
          buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
          offset: PIPEFS.BUCKET_BUFFER_SIZE,
          roffset: 0
        };
        pipe.buckets.push(newBucket);
        newBucket.buffer.set(data.subarray(0, PIPEFS.BUCKET_BUFFER_SIZE));
        data = data.subarray(PIPEFS.BUCKET_BUFFER_SIZE, data.byteLength);
      }

      if (remElements > 0) {
        var newBucket = {
          buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
          offset: data.byteLength,
          roffset: 0
        };
        pipe.buckets.push(newBucket);
        newBucket.buffer.set(data);
      }

      return dataLen;
    },
    close(stream) {
      var pipe = stream.node.pipe;
      pipe.refcnt--;
      if (pipe.refcnt === 0) {
        pipe.buckets = null;
      }
    },
  },
  nextname() {
    if (!PIPEFS.nextname.current) {
      PIPEFS.nextname.current = 0;
    }
    return 'pipe[' + (PIPEFS.nextname.current++) + ']';
  },
};

function ___syscall_pipe(fdPtr) {
  try {

    if (fdPtr == 0) {
      throw new FS.ErrnoError(21);
    }

    var res = PIPEFS.createPipe();

    HEAP32[((fdPtr) >> 2)] = res.readable_fd;
    HEAP32[(((fdPtr) + (4)) >> 2)] = res.writable_fd;

    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_poll(fds, nfds, timeout) {
  try {

    var nonzero = 0;
    for (var i = 0; i < nfds; i++) {
      var pollfd = fds + 8 * i;
      var fd = HEAP32[((pollfd) >> 2)];
      var events = HEAP16[(((pollfd) + (4)) >> 1)];
      var mask = 32;
      var stream = FS.getStream(fd);
      if (stream) {
        mask = SYSCALLS.DEFAULT_POLLMASK;
        if (stream.stream_ops.poll) {
          mask = stream.stream_ops.poll(stream, -1);
        }
      }
      mask &= events | 8 | 16;
      if (mask) nonzero++;
      HEAP16[(((pollfd) + (6)) >> 1)] = mask;
    }
    return nonzero;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}



function ___syscall_readlinkat(dirfd, path, buf, bufsize) {
  try {

    path = SYSCALLS.getStr(path);
    path = SYSCALLS.calculateAt(dirfd, path);
    if (bufsize <= 0) return -28;
    var ret = FS.readlink(path);

    var len = Math.min(bufsize, lengthBytesUTF8(ret));
    var endChar = HEAP8[buf + len];
    stringToUTF8(ret, buf, bufsize + 1);
    // readlink is one of the rare functions that write out a C string, but does never append a null to the output buffer(!)
    // stringToUTF8() always appends a null byte, so restore the character under the null byte after the write.
    HEAP8[buf + len] = endChar;
    return len;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}




function ___syscall_recvfrom(fd, buf, len, flags, addr, addrlen) {
  try {

    var sock = getSocketFromFD(fd);
    var msg = sock.sock_ops.recvmsg(sock, len);
    if (!msg) return 0; // socket is closed
    if (addr) {
      var errno = writeSockaddr(addr, sock.family, DNS.lookup_name(msg.addr), msg.port, addrlen);
      assert(!errno);
    }
    HEAPU8.set(msg.buffer, buf);
    return msg.buffer.byteLength;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_renameat(olddirfd, oldpath, newdirfd, newpath) {
  try {

    oldpath = SYSCALLS.getStr(oldpath);
    newpath = SYSCALLS.getStr(newpath);
    oldpath = SYSCALLS.calculateAt(olddirfd, oldpath);
    newpath = SYSCALLS.calculateAt(newdirfd, newpath);
    FS.rename(oldpath, newpath);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_rmdir(path) {
  try {

    path = SYSCALLS.getStr(path);
    FS.rmdir(path);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}



function ___syscall_sendto(fd, message, length, flags, addr, addr_len) {
  try {

    var sock = getSocketFromFD(fd);
    var dest = getSocketAddress(addr, addr_len, true);
    if (!dest) {
      // send, no address provided
      return FS.write(sock.stream, HEAP8, message, length);
    }
    // sendto an address
    return sock.sock_ops.sendmsg(sock, HEAP8, message, length, dest.addr, dest.port);
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}


function ___syscall_socket(domain, type, protocol) {
  try {

    var sock = SOCKFS.createSocket(domain, type, protocol);
    assert(sock.stream.fd < 64); // XXX ? select() assumes socket fd values are in 0..63
    return sock.stream.fd;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_stat64(path, buf) {
  try {

    path = SYSCALLS.getStr(path);
    return SYSCALLS.doStat(FS.stat, path, buf);
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_symlink(target, linkpath) {
  try {

    target = SYSCALLS.getStr(target);
    linkpath = SYSCALLS.getStr(linkpath);
    FS.symlink(target, linkpath);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

function ___syscall_unlinkat(dirfd, path, flags) {
  try {

    path = SYSCALLS.getStr(path);
    path = SYSCALLS.calculateAt(dirfd, path);
    if (flags === 0) {
      FS.unlink(path);
    } else if (flags === 512) {
      FS.rmdir(path);
    } else {
      abort('Invalid flags passed to unlinkat');
    }
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}

var readI53FromI64 = (ptr) => {
  return HEAPU32[((ptr) >> 2)] + HEAP32[(((ptr) + (4)) >> 2)] * 4294967296;
};

function ___syscall_utimensat(dirfd, path, times, flags) {
  try {

    path = SYSCALLS.getStr(path);
    assert(flags === 0);
    path = SYSCALLS.calculateAt(dirfd, path, true);
    if (!times) {
      var atime = Date.now();
      var mtime = atime;
    } else {
      var seconds = readI53FromI64(times);
      var nanoseconds = HEAP32[(((times) + (8)) >> 2)];
      atime = (seconds * 1000) + (nanoseconds / (1000 * 1000));
      times += 16;
      seconds = readI53FromI64(times);
      nanoseconds = HEAP32[(((times) + (8)) >> 2)];
      mtime = (seconds * 1000) + (nanoseconds / (1000 * 1000));
    }
    FS.utime(path, atime, mtime);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
}



var __emscripten_fs_load_embedded_files = (ptr) => {
  do {
    var name_addr = HEAPU32[((ptr) >> 2)];
    ptr += 4;
    var len = HEAPU32[((ptr) >> 2)];
    ptr += 4;
    var content = HEAPU32[((ptr) >> 2)];
    ptr += 4;
    var name = UTF8ToString(name_addr)
    FS.createPath('/', PATH.dirname(name), true, true);
    // canOwn this data in the filesystem, it is a slice of wasm memory that will never change
    FS.createDataFile(name, null, HEAP8.subarray(content, content + len), true, true, true);
  } while (HEAPU32[((ptr) >> 2)]);
};

var nowIsMonotonic = 1;
var __emscripten_get_now_is_monotonic = () => nowIsMonotonic;

var __emscripten_runtime_keepalive_clear = () => {
  noExitRuntime = false;
  runtimeKeepaliveCounter = 0;
};

var __emscripten_throw_longjmp = () => {
  throw new EmscriptenSjLj;
};

function __gmtime_js(time_low, time_high, tmPtr) {
  var time = convertI32PairToI53Checked(time_low, time_high);;


  var date = new Date(time * 1000);
  HEAP32[((tmPtr) >> 2)] = date.getUTCSeconds();
  HEAP32[(((tmPtr) + (4)) >> 2)] = date.getUTCMinutes();
  HEAP32[(((tmPtr) + (8)) >> 2)] = date.getUTCHours();
  HEAP32[(((tmPtr) + (12)) >> 2)] = date.getUTCDate();
  HEAP32[(((tmPtr) + (16)) >> 2)] = date.getUTCMonth();
  HEAP32[(((tmPtr) + (20)) >> 2)] = date.getUTCFullYear() - 1900;
  HEAP32[(((tmPtr) + (24)) >> 2)] = date.getUTCDay();
  var start = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
  var yday = ((date.getTime() - start) / (1000 * 60 * 60 * 24)) | 0;
  HEAP32[(((tmPtr) + (28)) >> 2)] = yday;
  ;
}

var isLeapYear = (year) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

var MONTH_DAYS_LEAP_CUMULATIVE = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

var MONTH_DAYS_REGULAR_CUMULATIVE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
var ydayFromDate = (date) => {
  var leap = isLeapYear(date.getFullYear());
  var monthDaysCumulative = (leap ? MONTH_DAYS_LEAP_CUMULATIVE : MONTH_DAYS_REGULAR_CUMULATIVE);
  var yday = monthDaysCumulative[date.getMonth()] + date.getDate() - 1; // -1 since it's days since Jan 1

  return yday;
};

function __localtime_js(time_low, time_high, tmPtr) {
  var time = convertI32PairToI53Checked(time_low, time_high);;


  var date = new Date(time * 1000);
  HEAP32[((tmPtr) >> 2)] = date.getSeconds();
  HEAP32[(((tmPtr) + (4)) >> 2)] = date.getMinutes();
  HEAP32[(((tmPtr) + (8)) >> 2)] = date.getHours();
  HEAP32[(((tmPtr) + (12)) >> 2)] = date.getDate();
  HEAP32[(((tmPtr) + (16)) >> 2)] = date.getMonth();
  HEAP32[(((tmPtr) + (20)) >> 2)] = date.getFullYear() - 1900;
  HEAP32[(((tmPtr) + (24)) >> 2)] = date.getDay();

  var yday = ydayFromDate(date) | 0;
  HEAP32[(((tmPtr) + (28)) >> 2)] = yday;
  HEAP32[(((tmPtr) + (36)) >> 2)] = -(date.getTimezoneOffset() * 60);

  // Attention: DST is in December in South, and some regions don't have DST at all.
  var start = new Date(date.getFullYear(), 0, 1);
  var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
  var winterOffset = start.getTimezoneOffset();
  var dst = (summerOffset != winterOffset && date.getTimezoneOffset() == Math.min(winterOffset, summerOffset)) | 0;
  HEAP32[(((tmPtr) + (32)) >> 2)] = dst;
  ;
}




var __mktime_js = function (tmPtr) {

  var ret = (() => {
    var date = new Date(HEAP32[(((tmPtr) + (20)) >> 2)] + 1900,
      HEAP32[(((tmPtr) + (16)) >> 2)],
      HEAP32[(((tmPtr) + (12)) >> 2)],
      HEAP32[(((tmPtr) + (8)) >> 2)],
      HEAP32[(((tmPtr) + (4)) >> 2)],
      HEAP32[((tmPtr) >> 2)],
      0);

    // There's an ambiguous hour when the time goes back; the tm_isdst field is
    // used to disambiguate it.  Date() basically guesses, so we fix it up if it
    // guessed wrong, or fill in tm_isdst with the guess if it's -1.
    var dst = HEAP32[(((tmPtr) + (32)) >> 2)];
    var guessedOffset = date.getTimezoneOffset();
    var start = new Date(date.getFullYear(), 0, 1);
    var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
    var winterOffset = start.getTimezoneOffset();
    var dstOffset = Math.min(winterOffset, summerOffset); // DST is in December in South
    if (dst < 0) {
      // Attention: some regions don't have DST at all.
      HEAP32[(((tmPtr) + (32)) >> 2)] = Number(summerOffset != winterOffset && dstOffset == guessedOffset);
    } else if ((dst > 0) != (dstOffset == guessedOffset)) {
      var nonDstOffset = Math.max(winterOffset, summerOffset);
      var trueOffset = dst > 0 ? dstOffset : nonDstOffset;
      // Don't try setMinutes(date.getMinutes() + ...) -- it's messed up.
      date.setTime(date.getTime() + (trueOffset - guessedOffset) * 60000);
    }

    HEAP32[(((tmPtr) + (24)) >> 2)] = date.getDay();
    var yday = ydayFromDate(date) | 0;
    HEAP32[(((tmPtr) + (28)) >> 2)] = yday;
    // To match expected behavior, update fields from date
    HEAP32[((tmPtr) >> 2)] = date.getSeconds();
    HEAP32[(((tmPtr) + (4)) >> 2)] = date.getMinutes();
    HEAP32[(((tmPtr) + (8)) >> 2)] = date.getHours();
    HEAP32[(((tmPtr) + (12)) >> 2)] = date.getDate();
    HEAP32[(((tmPtr) + (16)) >> 2)] = date.getMonth();
    HEAP32[(((tmPtr) + (20)) >> 2)] = date.getYear();

    var timeMs = date.getTime();
    if (isNaN(timeMs)) {
      setErrNo(61);
      return -1;
    }
    // Return time in microseconds
    return timeMs / 1000;
  })();
  return (setTempRet0((tempDouble = ret, (+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble) / 4294967296.0))) >>> 0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble))) >>> 0)) / 4294967296.0))))) >>> 0) : 0)), ret >>> 0);
};






function __mmap_js(len, prot, flags, fd, offset_low, offset_high, allocated, addr) {
  var offset = convertI32PairToI53Checked(offset_low, offset_high);;


  try {

    if (isNaN(offset)) return 61;
    var stream = SYSCALLS.getStreamFromFD(fd);
    var res = FS.mmap(stream, len, offset, prot, flags);
    var ptr = res.ptr;
    HEAP32[((allocated) >> 2)] = res.allocated;
    HEAPU32[((addr) >> 2)] = ptr;
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  ;
}




function __munmap_js(addr, len, prot, flags, fd, offset_low, offset_high) {
  var offset = convertI32PairToI53Checked(offset_low, offset_high);;


  try {

    if (isNaN(offset)) return 61;
    var stream = SYSCALLS.getStreamFromFD(fd);
    if (prot & 2) {
      SYSCALLS.doMsync(addr, stream, len, flags, offset);
    }
    FS.munmap(stream);
    // implicitly return 0
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  ;
}



var stringToNewUTF8 = (str) => {
  var size = lengthBytesUTF8(str) + 1;
  var ret = _malloc(size);
  if (ret) stringToUTF8(str, ret, size);
  return ret;
};
var __tzset_js = (timezone, daylight, tzname) => {
  // TODO: Use (malleable) environment variables instead of system settings.
  var currentYear = new Date().getFullYear();
  var winter = new Date(currentYear, 0, 1);
  var summer = new Date(currentYear, 6, 1);
  var winterOffset = winter.getTimezoneOffset();
  var summerOffset = summer.getTimezoneOffset();

  // Local standard timezone offset. Local standard time is not adjusted for daylight savings.
  // This code uses the fact that getTimezoneOffset returns a greater value during Standard Time versus Daylight Saving Time (DST).
  // Thus it determines the expected output during Standard Time, and it compares whether the output of the given date the same (Standard) or less (DST).
  var stdTimezoneOffset = Math.max(winterOffset, summerOffset);

  // timezone is specified as seconds west of UTC ("The external variable
  // `timezone` shall be set to the difference, in seconds, between
  // Coordinated Universal Time (UTC) and local standard time."), the same
  // as returned by stdTimezoneOffset.
  // See http://pubs.opengroup.org/onlinepubs/009695399/functions/tzset.html
  HEAPU32[((timezone) >> 2)] = stdTimezoneOffset * 60;

  HEAP32[((daylight) >> 2)] = Number(winterOffset != summerOffset);

  function extractZone(date) {
    var match = date.toTimeString().match(/\(([A-Za-z ]+)\)$/);
    return match ? match[1] : "GMT";
  };
  var winterName = extractZone(winter);
  var summerName = extractZone(summer);
  var winterNamePtr = stringToNewUTF8(winterName);
  var summerNamePtr = stringToNewUTF8(summerName);
  if (summerOffset < winterOffset) {
    // Northern hemisphere
    HEAPU32[((tzname) >> 2)] = winterNamePtr;
    HEAPU32[(((tzname) + (4)) >> 2)] = summerNamePtr;
  } else {
    HEAPU32[((tzname) >> 2)] = summerNamePtr;
    HEAPU32[(((tzname) + (4)) >> 2)] = winterNamePtr;
  }
};

var _abort = () => {
  abort('native code called abort()');
};

var _emscripten_set_main_loop_timing = (mode, value) => {
  Browser.mainLoop.timingMode = mode;
  Browser.mainLoop.timingValue = value;

  if (!Browser.mainLoop.func) {
    err('emscripten_set_main_loop_timing: Cannot set timing mode for main loop since a main loop does not exist! Call emscripten_set_main_loop first to set one up.');
    return 1; // Return non-zero on failure, can't set timing mode when there is no main loop.
  }

  if (!Browser.mainLoop.running) {

    Browser.mainLoop.running = true;
  }
  if (mode == 0) {
    Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setTimeout() {
      var timeUntilNextTick = Math.max(0, Browser.mainLoop.tickStartTime + value - _emscripten_get_now()) | 0;
      setTimeout(Browser.mainLoop.runner, timeUntilNextTick); // doing this each time means that on exception, we stop
    };
    Browser.mainLoop.method = 'timeout';
  } else if (mode == 1) {
    Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_rAF() {
      Browser.requestAnimationFrame(Browser.mainLoop.runner);
    };
    Browser.mainLoop.method = 'rAF';
  } else if (mode == 2) {
    if (typeof Browser.setImmediate == 'undefined') {
      if (typeof setImmediate == 'undefined') {
        // Emulate setImmediate. (note: not a complete polyfill, we don't emulate clearImmediate() to keep code size to minimum, since not needed)
        var setImmediates = [];
        var emscriptenMainLoopMessageId = 'setimmediate';
        /** @param {Event} event */
        var Browser_setImmediate_messageHandler = (event) => {
          // When called in current thread or Worker, the main loop ID is structured slightly different to accommodate for --proxy-to-worker runtime listening to Worker events,
          // so check for both cases.
          if (event.data === emscriptenMainLoopMessageId || event.data.target === emscriptenMainLoopMessageId) {
            event.stopPropagation();
            setImmediates.shift()();
          }
        };
        addEventListener("message", Browser_setImmediate_messageHandler, true);
        Browser.setImmediate = /** @type{function(function(): ?, ...?): number} */(function Browser_emulated_setImmediate(func) {
          setImmediates.push(func);
          if (ENVIRONMENT_IS_WORKER) {
            if (Module['setImmediates'] === undefined) Module['setImmediates'] = [];
            Module['setImmediates'].push(func);
            postMessage({ target: emscriptenMainLoopMessageId }); // In --proxy-to-worker, route the message via proxyClient.js
          } else postMessage(emscriptenMainLoopMessageId, "*"); // On the main thread, can just send the message to itself.
        });
      } else {
        Browser.setImmediate = setImmediate;
      }
    }
    Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setImmediate() {
      Browser.setImmediate(Browser.mainLoop.runner);
    };
    Browser.mainLoop.method = 'immediate';
  }
  return 0;
};

var _emscripten_get_now;
// Modern environment where performance.now() is supported:
// N.B. a shorter form "_emscripten_get_now = performance.now;" is
// unfortunately not allowed even in current browsers (e.g. FF Nightly 75).
_emscripten_get_now = () => performance.now();
;


/**
 * @param {number=} arg
 * @param {boolean=} noSetTiming
 */
var setMainLoop = (browserIterationFunc, fps, simulateInfiniteLoop, arg, noSetTiming) => {
  assert(!Browser.mainLoop.func, 'emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.');

  Browser.mainLoop.func = browserIterationFunc;
  Browser.mainLoop.arg = arg;

  // Closure compiler bug(?): Closure does not see that the assignment
  //   var thisMainLoopId = Browser.mainLoop.currentlyRunningMainloop
  // is a value copy of a number (even with the JSDoc @type annotation)
  // but optimizeis the code as if the assignment was a reference assignment,
  // which results in Browser.mainLoop.pause() not working. Hence use a
  // workaround to make Closure believe this is a value copy that should occur:
  // (TODO: Minimize this down to a small test case and report - was unable
  // to reproduce in a small written test case)
  /** @type{number} */
  var thisMainLoopId = (() => Browser.mainLoop.currentlyRunningMainloop)();
  function checkIsRunning() {
    if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) {

      return false;
    }
    return true;
  }

  // We create the loop runner here but it is not actually running until
  // _emscripten_set_main_loop_timing is called (which might happen a
  // later time).  This member signifies that the current runner has not
  // yet been started so that we can call runtimeKeepalivePush when it
  // gets it timing set for the first time.
  Browser.mainLoop.running = false;
  Browser.mainLoop.runner = function Browser_mainLoop_runner() {
    if (ABORT) return;
    if (Browser.mainLoop.queue.length > 0) {
      var start = Date.now();
      var blocker = Browser.mainLoop.queue.shift();
      blocker.func(blocker.arg);
      if (Browser.mainLoop.remainingBlockers) {
        var remaining = Browser.mainLoop.remainingBlockers;
        var next = remaining % 1 == 0 ? remaining - 1 : Math.floor(remaining);
        if (blocker.counted) {
          Browser.mainLoop.remainingBlockers = next;
        } else {
          // not counted, but move the progress along a tiny bit
          next = next + 0.5; // do not steal all the next one's progress
          Browser.mainLoop.remainingBlockers = (8 * remaining + next) / 9;
        }
      }
      Browser.mainLoop.updateStatus();

      // catches pause/resume main loop from blocker execution
      if (!checkIsRunning()) return;

      setTimeout(Browser.mainLoop.runner, 0);
      return;
    }

    // catch pauses from non-main loop sources
    if (!checkIsRunning()) return;

    // Implement very basic swap interval control
    Browser.mainLoop.currentFrameNumber = Browser.mainLoop.currentFrameNumber + 1 | 0;
    if (Browser.mainLoop.timingMode == 1 && Browser.mainLoop.timingValue > 1 && Browser.mainLoop.currentFrameNumber % Browser.mainLoop.timingValue != 0) {
      // Not the scheduled time to render this frame - skip.
      Browser.mainLoop.scheduler();
      return;
    } else if (Browser.mainLoop.timingMode == 0) {
      Browser.mainLoop.tickStartTime = _emscripten_get_now();
    }

    // Signal GL rendering layer that processing of a new frame is about to start. This helps it optimize
    // VBO double-buffering and reduce GPU stalls.
    GL.newRenderingFrameStarted();

    if (Browser.mainLoop.method === 'timeout' && Module.ctx) {
      warnOnce('Looks like you are rendering without using requestAnimationFrame for the main loop. You should use 0 for the frame rate in emscripten_set_main_loop in order to use requestAnimationFrame, as that can greatly improve your frame rates!');
      Browser.mainLoop.method = ''; // just warn once per call to set main loop
    }

    Browser.mainLoop.runIter(browserIterationFunc);

    checkStackCookie();

    // catch pauses from the main loop itself
    if (!checkIsRunning()) return;

    // Queue new audio data. This is important to be right after the main loop invocation, so that we will immediately be able
    // to queue the newest produced audio samples.
    // TODO: Consider adding pre- and post- rAF callbacks so that GL.newRenderingFrameStarted() and SDL.audio.queueNewAudioData()
    //       do not need to be hardcoded into this function, but can be more generic.
    if (typeof SDL == 'object') SDL.audio?.queueNewAudioData?.();

    Browser.mainLoop.scheduler();
  }

  if (!noSetTiming) {
    if (fps && fps > 0) {
      _emscripten_set_main_loop_timing(0, 1000.0 / fps);
    } else {
      // Do rAF by rendering each frame (no decimating)
      _emscripten_set_main_loop_timing(1, 1);
    }

    Browser.mainLoop.scheduler();
  }

  if (simulateInfiniteLoop) {
    throw 'unwind';
  }
};

var handleException = (e) => {
  // Certain exception types we do not treat as errors since they are used for
  // internal control flow.
  // 1. ExitStatus, which is thrown by exit()
  // 2. "unwind", which is thrown by emscripten_unwind_to_js_event_loop() and others
  //    that wish to return to JS event loop.
  if (e instanceof ExitStatus || e == 'unwind') {
    return EXITSTATUS;
  }
  checkStackCookie();
  if (e instanceof WebAssembly.RuntimeError) {
    if (_emscripten_stack_get_current() <= 0) {
      err('Stack overflow detected.  You can try increasing -sSTACK_SIZE (currently set to 5242880)');
    }
  }
  quit_(1, e);
};


var runtimeKeepaliveCounter = 0;
var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;

var _proc_exit = (code) => {
  EXITSTATUS = code;
  if (!keepRuntimeAlive()) {
    Module['onExit']?.(code);
    ABORT = true;
  }
  quit_(code, new ExitStatus(code));
};

/** @suppress {duplicate } */
/** @param {boolean|number=} implicit */
var exitJS = (status, implicit) => {
  EXITSTATUS = status;

  checkUnflushedContent();

  // if exit() was called explicitly, warn the user if the runtime isn't actually being shut down
  if (keepRuntimeAlive() && !implicit) {
    var msg = `program exited (with status: ${status}), but keepRuntimeAlive() is set (counter=${runtimeKeepaliveCounter}) due to an async operation, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)`;
    err(msg);
  }

  _proc_exit(status);
};
var _exit = exitJS;


var maybeExit = () => {
  if (!keepRuntimeAlive()) {
    try {
      _exit(EXITSTATUS);
    } catch (e) {
      handleException(e);
    }
  }
};
var callUserCallback = (func) => {
  if (ABORT) {
    err('user callback triggered after runtime exited or application aborted.  Ignoring.');
    return;
  }
  try {
    func();
    maybeExit();
  } catch (e) {
    handleException(e);
  }
};

/** @param {number=} timeout */
var safeSetTimeout = (func, timeout) => {

  return setTimeout(() => {

    callUserCallback(func);
  }, timeout);
};




var Browser = {
  mainLoop: {
    running: false,
    scheduler: null,
    method: "",
    currentlyRunningMainloop: 0,
    func: null,
    arg: 0,
    timingMode: 0,
    timingValue: 0,
    currentFrameNumber: 0,
    queue: [],
    pause() {
      Browser.mainLoop.scheduler = null;
      // Incrementing this signals the previous main loop that it's now become old, and it must return.
      Browser.mainLoop.currentlyRunningMainloop++;
    },
    resume() {
      Browser.mainLoop.currentlyRunningMainloop++;
      var timingMode = Browser.mainLoop.timingMode;
      var timingValue = Browser.mainLoop.timingValue;
      var func = Browser.mainLoop.func;
      Browser.mainLoop.func = null;
      // do not set timing and call scheduler, we will do it on the next lines
      setMainLoop(func, 0, false, Browser.mainLoop.arg, true);
      _emscripten_set_main_loop_timing(timingMode, timingValue);
      Browser.mainLoop.scheduler();
    },
    updateStatus() {
      if (Module['setStatus']) {
        var message = Module['statusMessage'] || 'Please wait...';
        var remaining = Browser.mainLoop.remainingBlockers;
        var expected = Browser.mainLoop.expectedBlockers;
        if (remaining) {
          if (remaining < expected) {
            Module['setStatus'](message + ' (' + (expected - remaining) + '/' + expected + ')');
          } else {
            Module['setStatus'](message);
          }
        } else {
          Module['setStatus']('');
        }
      }
    },
    runIter(func) {
      if (ABORT) return;
      if (Module['preMainLoop']) {
        var preRet = Module['preMainLoop']();
        if (preRet === false) {
          return; // |return false| skips a frame
        }
      }
      callUserCallback(func);
      Module['postMainLoop']?.();
    },
  },
  isFullscreen: false,
  pointerLock: false,
  moduleContextCreatedCallbacks: [],
  workers: [],
  init() {
    if (Browser.initted) return;
    Browser.initted = true;

    // Support for plugins that can process preloaded files. You can add more of these to
    // your app by creating and appending to preloadPlugins.
    //
    // Each plugin is asked if it can handle a file based on the file's name. If it can,
    // it is given the file's raw data. When it is done, it calls a callback with the file's
    // (possibly modified) data. For example, a plugin might decompress a file, or it
    // might create some side data structure for use later (like an Image element, etc.).

    var imagePlugin = {};
    imagePlugin['canHandle'] = function imagePlugin_canHandle(name) {
      return !Module.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/i.test(name);
    };
    imagePlugin['handle'] = function imagePlugin_handle(byteArray, name, onload, onerror) {
      var b = new Blob([byteArray], { type: Browser.getMimetype(name) });
      if (b.size !== byteArray.length) { // Safari bug #118630
        // Safari's Blob can only take an ArrayBuffer
        b = new Blob([(new Uint8Array(byteArray)).buffer], { type: Browser.getMimetype(name) });
      }
      var url = URL.createObjectURL(b);
      assert(typeof url == 'string', 'createObjectURL must return a url as a string');
      var img = new Image();
      img.onload = () => {
        assert(img.complete, `Image ${name} could not be decoded`);
        var canvas = /** @type {!HTMLCanvasElement} */ (document.createElement('canvas'));
        canvas.width = img.width;
        canvas.height = img.height;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        preloadedImages[name] = canvas;
        URL.revokeObjectURL(url);
        onload?.(byteArray);
      };
      img.onerror = (event) => {
        err(`Image ${url} could not be decoded`);
        onerror?.();
      };
      img.src = url;
    };
    preloadPlugins.push(imagePlugin);

    var audioPlugin = {};
    audioPlugin['canHandle'] = function audioPlugin_canHandle(name) {
      return !Module.noAudioDecoding && name.substr(-4) in { '.ogg': 1, '.wav': 1, '.mp3': 1 };
    };
    audioPlugin['handle'] = function audioPlugin_handle(byteArray, name, onload, onerror) {
      var done = false;
      function finish(audio) {
        if (done) return;
        done = true;
        preloadedAudios[name] = audio;
        onload?.(byteArray);
      }
      function fail() {
        if (done) return;
        done = true;
        preloadedAudios[name] = new Audio(); // empty shim
        onerror?.();
      }
      var b = new Blob([byteArray], { type: Browser.getMimetype(name) });
      var url = URL.createObjectURL(b); // XXX we never revoke this!
      assert(typeof url == 'string', 'createObjectURL must return a url as a string');
      var audio = new Audio();
      audio.addEventListener('canplaythrough', () => finish(audio), false); // use addEventListener due to chromium bug 124926
      audio.onerror = function audio_onerror(event) {
        if (done) return;
        err(`warning: browser could not fully decode audio ${name}, trying slower base64 approach`);
        function encode64(data) {
          var BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
          var PAD = '=';
          var ret = '';
          var leftchar = 0;
          var leftbits = 0;
          for (var i = 0; i < data.length; i++) {
            leftchar = (leftchar << 8) | data[i];
            leftbits += 8;
            while (leftbits >= 6) {
              var curr = (leftchar >> (leftbits - 6)) & 0x3f;
              leftbits -= 6;
              ret += BASE[curr];
            }
          }
          if (leftbits == 2) {
            ret += BASE[(leftchar & 3) << 4];
            ret += PAD + PAD;
          } else if (leftbits == 4) {
            ret += BASE[(leftchar & 0xf) << 2];
            ret += PAD;
          }
          return ret;
        }
        audio.src = 'data:audio/x-' + name.substr(-3) + ';base64,' + encode64(byteArray);
        finish(audio); // we don't wait for confirmation this worked - but it's worth trying
      };
      audio.src = url;
      // workaround for chrome bug 124926 - we do not always get oncanplaythrough or onerror
      safeSetTimeout(() => {
        finish(audio); // try to use it even though it is not necessarily ready to play
      }, 10000);
    };
    preloadPlugins.push(audioPlugin);

    // Canvas event setup

    function pointerLockChange() {
      Browser.pointerLock = document['pointerLockElement'] === Module['canvas'] ||
        document['mozPointerLockElement'] === Module['canvas'] ||
        document['webkitPointerLockElement'] === Module['canvas'] ||
        document['msPointerLockElement'] === Module['canvas'];
    }
    var canvas = Module['canvas'];
    if (canvas) {
      // forced aspect ratio can be enabled by defining 'forcedAspectRatio' on Module
      // Module['forcedAspectRatio'] = 4 / 3;

      canvas.requestPointerLock = canvas['requestPointerLock'] ||
        canvas['mozRequestPointerLock'] ||
        canvas['webkitRequestPointerLock'] ||
        canvas['msRequestPointerLock'] ||
        (() => { });
      canvas.exitPointerLock = document['exitPointerLock'] ||
        document['mozExitPointerLock'] ||
        document['webkitExitPointerLock'] ||
        document['msExitPointerLock'] ||
        (() => { }); // no-op if function does not exist
      canvas.exitPointerLock = canvas.exitPointerLock.bind(document);

      document.addEventListener('pointerlockchange', pointerLockChange, false);
      document.addEventListener('mozpointerlockchange', pointerLockChange, false);
      document.addEventListener('webkitpointerlockchange', pointerLockChange, false);
      document.addEventListener('mspointerlockchange', pointerLockChange, false);

      if (Module['elementPointerLock']) {
        canvas.addEventListener("click", (ev) => {
          if (!Browser.pointerLock && Module['canvas'].requestPointerLock) {
            Module['canvas'].requestPointerLock();
            ev.preventDefault();
          }
        }, false);
      }
    }
  },
  createContext(/** @type {HTMLCanvasElement} */ canvas, useWebGL, setInModule, webGLContextAttributes) {
    if (useWebGL && Module.ctx && canvas == Module.canvas) return Module.ctx; // no need to recreate GL context if it's already been created for this canvas.

    var ctx;
    var contextHandle;
    if (useWebGL) {
      // For GLES2/desktop GL compatibility, adjust a few defaults to be different to WebGL defaults, so that they align better with the desktop defaults.
      var contextAttributes = {
        antialias: false,
        alpha: false,
        majorVersion: (typeof WebGL2RenderingContext != 'undefined') ? 2 : 1,
      };

      if (webGLContextAttributes) {
        for (var attribute in webGLContextAttributes) {
          contextAttributes[attribute] = webGLContextAttributes[attribute];
        }
      }

      // This check of existence of GL is here to satisfy Closure compiler, which yells if variable GL is referenced below but GL object is not
      // actually compiled in because application is not doing any GL operations. TODO: Ideally if GL is not being used, this function
      // Browser.createContext() should not even be emitted.
      if (typeof GL != 'undefined') {
        contextHandle = GL.createContext(canvas, contextAttributes);
        if (contextHandle) {
          ctx = GL.getContext(contextHandle).GLctx;
        }
      }
    } else {
      ctx = canvas.getContext('2d');
    }

    if (!ctx) return null;

    if (setInModule) {
      if (!useWebGL) assert(typeof GLctx == 'undefined', 'cannot set in module if GLctx is used, but we are a non-GL context that would replace it');

      Module.ctx = ctx;
      if (useWebGL) GL.makeContextCurrent(contextHandle);
      Module.useWebGL = useWebGL;
      Browser.moduleContextCreatedCallbacks.forEach((callback) => callback());
      Browser.init();
    }
    return ctx;
  },
  destroyContext(canvas, useWebGL, setInModule) { },
  fullscreenHandlersInstalled: false,
  lockPointer: undefined,
  resizeCanvas: undefined,
  requestFullscreen(lockPointer, resizeCanvas) {
    Browser.lockPointer = lockPointer;
    Browser.resizeCanvas = resizeCanvas;
    if (typeof Browser.lockPointer == 'undefined') Browser.lockPointer = true;
    if (typeof Browser.resizeCanvas == 'undefined') Browser.resizeCanvas = false;

    var canvas = Module['canvas'];
    function fullscreenChange() {
      Browser.isFullscreen = false;
      var canvasContainer = canvas.parentNode;
      if ((document['fullscreenElement'] || document['mozFullScreenElement'] ||
        document['msFullscreenElement'] || document['webkitFullscreenElement'] ||
        document['webkitCurrentFullScreenElement']) === canvasContainer) {
        canvas.exitFullscreen = Browser.exitFullscreen;
        if (Browser.lockPointer) canvas.requestPointerLock();
        Browser.isFullscreen = true;
        if (Browser.resizeCanvas) {
          Browser.setFullscreenCanvasSize();
        } else {
          Browser.updateCanvasDimensions(canvas);
        }
      } else {
        // remove the full screen specific parent of the canvas again to restore the HTML structure from before going full screen
        canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
        canvasContainer.parentNode.removeChild(canvasContainer);

        if (Browser.resizeCanvas) {
          Browser.setWindowedCanvasSize();
        } else {
          Browser.updateCanvasDimensions(canvas);
        }
      }
      Module['onFullScreen']?.(Browser.isFullscreen);
      Module['onFullscreen']?.(Browser.isFullscreen);
    }

    if (!Browser.fullscreenHandlersInstalled) {
      Browser.fullscreenHandlersInstalled = true;
      document.addEventListener('fullscreenchange', fullscreenChange, false);
      document.addEventListener('mozfullscreenchange', fullscreenChange, false);
      document.addEventListener('webkitfullscreenchange', fullscreenChange, false);
      document.addEventListener('MSFullscreenChange', fullscreenChange, false);
    }

    // create a new parent to ensure the canvas has no siblings. this allows browsers to optimize full screen performance when its parent is the full screen root
    var canvasContainer = document.createElement("div");
    canvas.parentNode.insertBefore(canvasContainer, canvas);
    canvasContainer.appendChild(canvas);

    // use parent of canvas as full screen root to allow aspect ratio correction (Firefox stretches the root to screen size)
    canvasContainer.requestFullscreen = canvasContainer['requestFullscreen'] ||
      canvasContainer['mozRequestFullScreen'] ||
      canvasContainer['msRequestFullscreen'] ||
      (canvasContainer['webkitRequestFullscreen'] ? () => canvasContainer['webkitRequestFullscreen'](Element['ALLOW_KEYBOARD_INPUT']) : null) ||
      (canvasContainer['webkitRequestFullScreen'] ? () => canvasContainer['webkitRequestFullScreen'](Element['ALLOW_KEYBOARD_INPUT']) : null);

    canvasContainer.requestFullscreen();
  },
  requestFullScreen() {
    abort('Module.requestFullScreen has been replaced by Module.requestFullscreen (without a capital S)');
  },
  exitFullscreen() {
    // This is workaround for chrome. Trying to exit from fullscreen
    // not in fullscreen state will cause "TypeError: Document not active"
    // in chrome. See https://github.com/emscripten-core/emscripten/pull/8236
    if (!Browser.isFullscreen) {
      return false;
    }

    var CFS = document['exitFullscreen'] ||
      document['cancelFullScreen'] ||
      document['mozCancelFullScreen'] ||
      document['msExitFullscreen'] ||
      document['webkitCancelFullScreen'] ||
      (() => { });
    CFS.apply(document, []);
    return true;
  },
  nextRAF: 0,
  fakeRequestAnimationFrame(func) {
    // try to keep 60fps between calls to here
    var now = Date.now();
    if (Browser.nextRAF === 0) {
      Browser.nextRAF = now + 1000 / 60;
    } else {
      while (now + 2 >= Browser.nextRAF) { // fudge a little, to avoid timer jitter causing us to do lots of delay:0
        Browser.nextRAF += 1000 / 60;
      }
    }
    var delay = Math.max(Browser.nextRAF - now, 0);
    setTimeout(func, delay);
  },
  requestAnimationFrame(func) {
    if (typeof requestAnimationFrame == 'function') {
      requestAnimationFrame(func);
      return;
    }
    var RAF = Browser.fakeRequestAnimationFrame;
    RAF(func);
  },
  safeSetTimeout(func, timeout) {
    // Legacy function, this is used by the SDL2 port so we need to keep it
    // around at least until that is updated.
    // See https://github.com/libsdl-org/SDL/pull/6304
    return safeSetTimeout(func, timeout);
  },
  safeRequestAnimationFrame(func) {

    return Browser.requestAnimationFrame(() => {

      callUserCallback(func);
    });
  },
  getMimetype(name) {
    return {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'bmp': 'image/bmp',
      'ogg': 'audio/ogg',
      'wav': 'audio/wav',
      'mp3': 'audio/mpeg'
    }[name.substr(name.lastIndexOf('.') + 1)];
  },
  getUserMedia(func) {
    window.getUserMedia ||= navigator['getUserMedia'] ||
      navigator['mozGetUserMedia'];
    window.getUserMedia(func);
  },
  getMovementX(event) {
    return event['movementX'] ||
      event['mozMovementX'] ||
      event['webkitMovementX'] ||
      0;
  },
  getMovementY(event) {
    return event['movementY'] ||
      event['mozMovementY'] ||
      event['webkitMovementY'] ||
      0;
  },
  getMouseWheelDelta(event) {
    var delta = 0;
    switch (event.type) {
      case 'DOMMouseScroll':
        // 3 lines make up a step
        delta = event.detail / 3;
        break;
      case 'mousewheel':
        // 120 units make up a step
        delta = event.wheelDelta / 120;
        break;
      case 'wheel':
        delta = event.deltaY
        switch (event.deltaMode) {
          case 0:
            // DOM_DELTA_PIXEL: 100 pixels make up a step
            delta /= 100;
            break;
          case 1:
            // DOM_DELTA_LINE: 3 lines make up a step
            delta /= 3;
            break;
          case 2:
            // DOM_DELTA_PAGE: A page makes up 80 steps
            delta *= 80;
            break;
          default:
            throw 'unrecognized mouse wheel delta mode: ' + event.deltaMode;
        }
        break;
      default:
        throw 'unrecognized mouse wheel event: ' + event.type;
    }
    return delta;
  },
  mouseX: 0,
  mouseY: 0,
  mouseMovementX: 0,
  mouseMovementY: 0,
  touches: {
  },
  lastTouches: {
  },
  calculateMouseCoords(pageX, pageY) {
    // Calculate the movement based on the changes
    // in the coordinates.
    var rect = Module["canvas"].getBoundingClientRect();
    var cw = Module["canvas"].width;
    var ch = Module["canvas"].height;

    // Neither .scrollX or .pageXOffset are defined in a spec, but
    // we prefer .scrollX because it is currently in a spec draft.
    // (see: http://www.w3.org/TR/2013/WD-cssom-view-20131217/)
    var scrollX = ((typeof window.scrollX != 'undefined') ? window.scrollX : window.pageXOffset);
    var scrollY = ((typeof window.scrollY != 'undefined') ? window.scrollY : window.pageYOffset);
    // If this assert lands, it's likely because the browser doesn't support scrollX or pageXOffset
    // and we have no viable fallback.
    assert((typeof scrollX != 'undefined') && (typeof scrollY != 'undefined'), 'Unable to retrieve scroll position, mouse positions likely broken.');
    var adjustedX = pageX - (scrollX + rect.left);
    var adjustedY = pageY - (scrollY + rect.top);

    // the canvas might be CSS-scaled compared to its backbuffer;
    // SDL-using content will want mouse coordinates in terms
    // of backbuffer units.
    adjustedX = adjustedX * (cw / rect.width);
    adjustedY = adjustedY * (ch / rect.height);

    return { x: adjustedX, y: adjustedY };
  },
  setMouseCoords(pageX, pageY) {
    const { x, y } = Browser.calculateMouseCoords(pageX, pageY);
    Browser.mouseMovementX = x - Browser.mouseX;
    Browser.mouseMovementY = y - Browser.mouseY;
    Browser.mouseX = x;
    Browser.mouseY = y;
  },
  calculateMouseEvent(event) { // event should be mousemove, mousedown or mouseup
    if (Browser.pointerLock) {
      // When the pointer is locked, calculate the coordinates
      // based on the movement of the mouse.
      // Workaround for Firefox bug 764498
      if (event.type != 'mousemove' &&
        ('mozMovementX' in event)) {
        Browser.mouseMovementX = Browser.mouseMovementY = 0;
      } else {
        Browser.mouseMovementX = Browser.getMovementX(event);
        Browser.mouseMovementY = Browser.getMovementY(event);
      }

      // check if SDL is available
      if (typeof SDL != "undefined") {
        Browser.mouseX = SDL.mouseX + Browser.mouseMovementX;
        Browser.mouseY = SDL.mouseY + Browser.mouseMovementY;
      } else {
        // just add the mouse delta to the current absolut mouse position
        // FIXME: ideally this should be clamped against the canvas size and zero
        Browser.mouseX += Browser.mouseMovementX;
        Browser.mouseY += Browser.mouseMovementY;
      }
    } else {
      if (event.type === 'touchstart' || event.type === 'touchend' || event.type === 'touchmove') {
        var touch = event.touch;
        if (touch === undefined) {
          return; // the "touch" property is only defined in SDL

        }
        var coords = Browser.calculateMouseCoords(touch.pageX, touch.pageY);

        if (event.type === 'touchstart') {
          Browser.lastTouches[touch.identifier] = coords;
          Browser.touches[touch.identifier] = coords;
        } else if (event.type === 'touchend' || event.type === 'touchmove') {
          var last = Browser.touches[touch.identifier];
          last ||= coords;
          Browser.lastTouches[touch.identifier] = last;
          Browser.touches[touch.identifier] = coords;
        }
        return;
      }

      Browser.setMouseCoords(event.pageX, event.pageY);
    }
  },
  resizeListeners: [],
  updateResizeListeners() {
    var canvas = Module['canvas'];
    Browser.resizeListeners.forEach((listener) => listener(canvas.width, canvas.height));
  },
  setCanvasSize(width, height, noUpdates) {
    var canvas = Module['canvas'];
    Browser.updateCanvasDimensions(canvas, width, height);
    if (!noUpdates) Browser.updateResizeListeners();
  },
  windowedWidth: 0,
  windowedHeight: 0,
  setFullscreenCanvasSize() {
    // check if SDL is available
    if (typeof SDL != "undefined") {
      var flags = HEAPU32[((SDL.screen) >> 2)];
      flags = flags | 0x00800000; // set SDL_FULLSCREEN flag
      HEAP32[((SDL.screen) >> 2)] = flags;
    }
    Browser.updateCanvasDimensions(Module['canvas']);
    Browser.updateResizeListeners();
  },
  setWindowedCanvasSize() {
    // check if SDL is available
    if (typeof SDL != "undefined") {
      var flags = HEAPU32[((SDL.screen) >> 2)];
      flags = flags & ~0x00800000; // clear SDL_FULLSCREEN flag
      HEAP32[((SDL.screen) >> 2)] = flags;
    }
    Browser.updateCanvasDimensions(Module['canvas']);
    Browser.updateResizeListeners();
  },
  updateCanvasDimensions(canvas, wNative, hNative) {
    if (wNative && hNative) {
      canvas.widthNative = wNative;
      canvas.heightNative = hNative;
    } else {
      wNative = canvas.widthNative;
      hNative = canvas.heightNative;
    }
    var w = wNative;
    var h = hNative;
    if (Module['forcedAspectRatio'] && Module['forcedAspectRatio'] > 0) {
      if (w / h < Module['forcedAspectRatio']) {
        w = Math.round(h * Module['forcedAspectRatio']);
      } else {
        h = Math.round(w / Module['forcedAspectRatio']);
      }
    }
    if (((document['fullscreenElement'] || document['mozFullScreenElement'] ||
      document['msFullscreenElement'] || document['webkitFullscreenElement'] ||
      document['webkitCurrentFullScreenElement']) === canvas.parentNode) && (typeof screen != 'undefined')) {
      var factor = Math.min(screen.width / w, screen.height / h);
      w = Math.round(w * factor);
      h = Math.round(h * factor);
    }
    if (Browser.resizeCanvas) {
      if (canvas.width != w) canvas.width = w;
      if (canvas.height != h) canvas.height = h;
      if (typeof canvas.style != 'undefined') {
        canvas.style.removeProperty("width");
        canvas.style.removeProperty("height");
      }
    } else {
      if (canvas.width != wNative) canvas.width = wNative;
      if (canvas.height != hNative) canvas.height = hNative;
      if (typeof canvas.style != 'undefined') {
        if (w != wNative || h != hNative) {
          canvas.style.setProperty("width", w + "px", "important");
          canvas.style.setProperty("height", h + "px", "important");
        } else {
          canvas.style.removeProperty("width");
          canvas.style.removeProperty("height");
        }
      }
    }
  },
};

var EGL = {
  errorCode: 12288,
  defaultDisplayInitialized: false,
  currentContext: 0,
  currentReadSurface: 0,
  currentDrawSurface: 0,
  contextAttributes: {
    alpha: false,
    depth: false,
    stencil: false,
    antialias: false,
  },
  stringCache: {
  },
  setErrorCode(code) {
    EGL.errorCode = code;
  },
  chooseConfig(display, attribList, config, config_size, numConfigs) {
    if (display != 62000) {
      EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
      return 0;
    }

    if (attribList) {
      // read attribList if it is non-null
      for (; ;) {
        var param = HEAP32[((attribList) >> 2)];
        if (param == 0x3021 /*EGL_ALPHA_SIZE*/) {
          var alphaSize = HEAP32[(((attribList) + (4)) >> 2)];
          EGL.contextAttributes.alpha = (alphaSize > 0);
        } else if (param == 0x3025 /*EGL_DEPTH_SIZE*/) {
          var depthSize = HEAP32[(((attribList) + (4)) >> 2)];
          EGL.contextAttributes.depth = (depthSize > 0);
        } else if (param == 0x3026 /*EGL_STENCIL_SIZE*/) {
          var stencilSize = HEAP32[(((attribList) + (4)) >> 2)];
          EGL.contextAttributes.stencil = (stencilSize > 0);
        } else if (param == 0x3031 /*EGL_SAMPLES*/) {
          var samples = HEAP32[(((attribList) + (4)) >> 2)];
          EGL.contextAttributes.antialias = (samples > 0);
        } else if (param == 0x3032 /*EGL_SAMPLE_BUFFERS*/) {
          var samples = HEAP32[(((attribList) + (4)) >> 2)];
          EGL.contextAttributes.antialias = (samples == 1);
        } else if (param == 0x3100 /*EGL_CONTEXT_PRIORITY_LEVEL_IMG*/) {
          var requestedPriority = HEAP32[(((attribList) + (4)) >> 2)];
          EGL.contextAttributes.lowLatency = (requestedPriority != 0x3103 /*EGL_CONTEXT_PRIORITY_LOW_IMG*/);
        } else if (param == 0x3038 /*EGL_NONE*/) {
          break;
        }
        attribList += 8;
      }
    }

    if ((!config || !config_size) && !numConfigs) {
      EGL.setErrorCode(0x300C /* EGL_BAD_PARAMETER */);
      return 0;
    }
    if (numConfigs) {
      HEAP32[((numConfigs) >> 2)] = 1; // Total number of supported configs: 1.
    }
    if (config && config_size > 0) {
      HEAPU32[((config) >> 2)] = 62002;
    }

    EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
    return 1;
  },
};
var _eglBindAPI = (api) => {
  if (api == 0x30A0 /* EGL_OPENGL_ES_API */) {
    EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
    return 1;
  }
  // if (api == 0x30A1 /* EGL_OPENVG_API */ || api == 0x30A2 /* EGL_OPENGL_API */) {
  EGL.setErrorCode(0x300C /* EGL_BAD_PARAMETER */);
  return 0;
};

var _eglChooseConfig = (display, attrib_list, configs, config_size, numConfigs) => {
  return EGL.chooseConfig(display, attrib_list, configs, config_size, numConfigs);
};

var webgl_enable_ANGLE_instanced_arrays = (ctx) => {
  // Extension available in WebGL 1 from Firefox 26 and Google Chrome 30 onwards. Core feature in WebGL 2.
  var ext = ctx.getExtension('ANGLE_instanced_arrays');
  if (ext) {
    ctx['vertexAttribDivisor'] = (index, divisor) => ext['vertexAttribDivisorANGLE'](index, divisor);
    ctx['drawArraysInstanced'] = (mode, first, count, primcount) => ext['drawArraysInstancedANGLE'](mode, first, count, primcount);
    ctx['drawElementsInstanced'] = (mode, count, type, indices, primcount) => ext['drawElementsInstancedANGLE'](mode, count, type, indices, primcount);
    return 1;
  }
};

var webgl_enable_OES_vertex_array_object = (ctx) => {
  // Extension available in WebGL 1 from Firefox 25 and WebKit 536.28/desktop Safari 6.0.3 onwards. Core feature in WebGL 2.
  var ext = ctx.getExtension('OES_vertex_array_object');
  if (ext) {
    ctx['createVertexArray'] = () => ext['createVertexArrayOES']();
    ctx['deleteVertexArray'] = (vao) => ext['deleteVertexArrayOES'](vao);
    ctx['bindVertexArray'] = (vao) => ext['bindVertexArrayOES'](vao);
    ctx['isVertexArray'] = (vao) => ext['isVertexArrayOES'](vao);
    return 1;
  }
};

var webgl_enable_WEBGL_draw_buffers = (ctx) => {
  // Extension available in WebGL 1 from Firefox 28 onwards. Core feature in WebGL 2.
  var ext = ctx.getExtension('WEBGL_draw_buffers');
  if (ext) {
    ctx['drawBuffers'] = (n, bufs) => ext['drawBuffersWEBGL'](n, bufs);
    return 1;
  }
};

var webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance = (ctx) =>
  // Closure is expected to be allowed to minify the '.dibvbi' property, so not accessing it quoted.
  !!(ctx.dibvbi = ctx.getExtension('WEBGL_draw_instanced_base_vertex_base_instance'));

var webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance = (ctx) => {
  // Closure is expected to be allowed to minify the '.mdibvbi' property, so not accessing it quoted.
  return !!(ctx.mdibvbi = ctx.getExtension('WEBGL_multi_draw_instanced_base_vertex_base_instance'));
};

var webgl_enable_WEBGL_multi_draw = (ctx) => {
  // Closure is expected to be allowed to minify the '.multiDrawWebgl' property, so not accessing it quoted.
  return !!(ctx.multiDrawWebgl = ctx.getExtension('WEBGL_multi_draw'));
};


var GL = {
  counter: 1,
  buffers: [],
  programs: [],
  framebuffers: [],
  renderbuffers: [],
  textures: [],
  shaders: [],
  vaos: [],
  contexts: [],
  offscreenCanvases: {
  },
  queries: [],
  samplers: [],
  transformFeedbacks: [],
  syncs: [],
  byteSizeByTypeRoot: 5120,
  byteSizeByType: [1, 1, 2, 2, 4, 4, 4, 2, 3, 4, 8],
  stringCache: {
  },
  stringiCache: {
  },
  unpackAlignment: 4,
  recordError: function recordError(errorCode) {
    if (!GL.lastError) {
      GL.lastError = errorCode;
    }
  },
  getNewId: (table) => {
    var ret = GL.counter++;
    for (var i = table.length; i < ret; i++) {
      table[i] = null;
    }
    return ret;
  },
  MAX_TEMP_BUFFER_SIZE: 2097152,
  numTempVertexBuffersPerSize: 64,
  log2ceilLookup: (i) => 32 - Math.clz32(i === 0 ? 0 : i - 1),
  generateTempBuffers: (quads, context) => {
    var largestIndex = GL.log2ceilLookup(GL.MAX_TEMP_BUFFER_SIZE);
    context.tempVertexBufferCounters1 = [];
    context.tempVertexBufferCounters2 = [];
    context.tempVertexBufferCounters1.length = context.tempVertexBufferCounters2.length = largestIndex + 1;
    context.tempVertexBuffers1 = [];
    context.tempVertexBuffers2 = [];
    context.tempVertexBuffers1.length = context.tempVertexBuffers2.length = largestIndex + 1;
    context.tempIndexBuffers = [];
    context.tempIndexBuffers.length = largestIndex + 1;
    for (var i = 0; i <= largestIndex; ++i) {
      context.tempIndexBuffers[i] = null; // Created on-demand
      context.tempVertexBufferCounters1[i] = context.tempVertexBufferCounters2[i] = 0;
      var ringbufferLength = GL.numTempVertexBuffersPerSize;
      context.tempVertexBuffers1[i] = [];
      context.tempVertexBuffers2[i] = [];
      var ringbuffer1 = context.tempVertexBuffers1[i];
      var ringbuffer2 = context.tempVertexBuffers2[i];
      ringbuffer1.length = ringbuffer2.length = ringbufferLength;
      for (var j = 0; j < ringbufferLength; ++j) {
        ringbuffer1[j] = ringbuffer2[j] = null; // Created on-demand
      }
    }

    if (quads) {
      // GL_QUAD indexes can be precalculated
      context.tempQuadIndexBuffer = GLctx.createBuffer();
      context.GLctx.bindBuffer(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, context.tempQuadIndexBuffer);
      var numIndexes = GL.MAX_TEMP_BUFFER_SIZE >> 1;
      var quadIndexes = new Uint16Array(numIndexes);
      var i = 0, v = 0;
      while (1) {
        quadIndexes[i++] = v;
        if (i >= numIndexes) break;
        quadIndexes[i++] = v + 1;
        if (i >= numIndexes) break;
        quadIndexes[i++] = v + 2;
        if (i >= numIndexes) break;
        quadIndexes[i++] = v;
        if (i >= numIndexes) break;
        quadIndexes[i++] = v + 2;
        if (i >= numIndexes) break;
        quadIndexes[i++] = v + 3;
        if (i >= numIndexes) break;
        v += 4;
      }
      context.GLctx.bufferData(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, quadIndexes, 0x88E4 /*GL_STATIC_DRAW*/);
      context.GLctx.bindBuffer(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, null);
    }
  },
  getTempVertexBuffer: function getTempVertexBuffer(sizeBytes) {
    var idx = GL.log2ceilLookup(sizeBytes);
    var ringbuffer = GL.currentContext.tempVertexBuffers1[idx];
    var nextFreeBufferIndex = GL.currentContext.tempVertexBufferCounters1[idx];
    GL.currentContext.tempVertexBufferCounters1[idx] = (GL.currentContext.tempVertexBufferCounters1[idx] + 1) & (GL.numTempVertexBuffersPerSize - 1);
    var vbo = ringbuffer[nextFreeBufferIndex];
    if (vbo) {
      return vbo;
    }
    var prevVBO = GLctx.getParameter(0x8894 /*GL_ARRAY_BUFFER_BINDING*/);
    ringbuffer[nextFreeBufferIndex] = GLctx.createBuffer();
    GLctx.bindBuffer(0x8892 /*GL_ARRAY_BUFFER*/, ringbuffer[nextFreeBufferIndex]);
    GLctx.bufferData(0x8892 /*GL_ARRAY_BUFFER*/, 1 << idx, 0x88E8 /*GL_DYNAMIC_DRAW*/);
    GLctx.bindBuffer(0x8892 /*GL_ARRAY_BUFFER*/, prevVBO);
    return ringbuffer[nextFreeBufferIndex];
  },
  getTempIndexBuffer: function getTempIndexBuffer(sizeBytes) {
    var idx = GL.log2ceilLookup(sizeBytes);
    var ibo = GL.currentContext.tempIndexBuffers[idx];
    if (ibo) {
      return ibo;
    }
    var prevIBO = GLctx.getParameter(0x8895 /*ELEMENT_ARRAY_BUFFER_BINDING*/);
    GL.currentContext.tempIndexBuffers[idx] = GLctx.createBuffer();
    GLctx.bindBuffer(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, GL.currentContext.tempIndexBuffers[idx]);
    GLctx.bufferData(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, 1 << idx, 0x88E8 /*GL_DYNAMIC_DRAW*/);
    GLctx.bindBuffer(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, prevIBO);
    return GL.currentContext.tempIndexBuffers[idx];
  },
  newRenderingFrameStarted: function newRenderingFrameStarted() {
    if (!GL.currentContext) {
      return;
    }
    var vb = GL.currentContext.tempVertexBuffers1;
    GL.currentContext.tempVertexBuffers1 = GL.currentContext.tempVertexBuffers2;
    GL.currentContext.tempVertexBuffers2 = vb;
    vb = GL.currentContext.tempVertexBufferCounters1;
    GL.currentContext.tempVertexBufferCounters1 = GL.currentContext.tempVertexBufferCounters2;
    GL.currentContext.tempVertexBufferCounters2 = vb;
    var largestIndex = GL.log2ceilLookup(GL.MAX_TEMP_BUFFER_SIZE);
    for (var i = 0; i <= largestIndex; ++i) {
      GL.currentContext.tempVertexBufferCounters1[i] = 0;
    }
  },
  getSource: (shader, count, string, length) => {
    var source = '';
    for (var i = 0; i < count; ++i) {
      var len = length ? HEAP32[(((length) + (i * 4)) >> 2)] : -1;
      source += UTF8ToString(HEAP32[(((string) + (i * 4)) >> 2)], len < 0 ? undefined : len);
    }
    // Let's see if we need to enable the standard derivatives extension
    var type = GLctx.getShaderParameter(GL.shaders[shader], 0x8B4F /* GL_SHADER_TYPE */);
    if (type == 0x8B30 /* GL_FRAGMENT_SHADER */) {
      if (GLEmulation.findToken(source, "dFdx") ||
        GLEmulation.findToken(source, "dFdy") ||
        GLEmulation.findToken(source, "fwidth")) {
        source = "#extension GL_OES_standard_derivatives : enable\n" + source;
        var extension = GLctx.getExtension("OES_standard_derivatives");
      }
    }
    return source;
  },
  createContext: (/** @type {HTMLCanvasElement} */ canvas, webGLContextAttributes) => {

    // BUG: Workaround Safari WebGL issue: After successfully acquiring WebGL
    // context on a canvas, calling .getContext() will always return that
    // context independent of which 'webgl' or 'webgl2'
    // context version was passed. See:
    //   https://bugs.webkit.org/show_bug.cgi?id=222758
    // and:
    //   https://github.com/emscripten-core/emscripten/issues/13295.
    // TODO: Once the bug is fixed and shipped in Safari, adjust the Safari
    // version field in above check.
    if (!canvas.getContextSafariWebGL2Fixed) {
      canvas.getContextSafariWebGL2Fixed = canvas.getContext;
      /** @type {function(this:HTMLCanvasElement, string, (Object|null)=): (Object|null)} */
      function fixedGetContext(ver, attrs) {
        var gl = canvas.getContextSafariWebGL2Fixed(ver, attrs);
        return ((ver == 'webgl') == (gl instanceof WebGLRenderingContext)) ? gl : null;
      }
      canvas.getContext = fixedGetContext;
    }

    var ctx =
      (webGLContextAttributes.majorVersion > 1)
        ?
        canvas.getContext("webgl2", webGLContextAttributes)
        :
        (canvas.getContext("webgl", webGLContextAttributes)
          // https://caniuse.com/#feat=webgl
        );

    if (!ctx) return 0;

    var handle = GL.registerContext(ctx, webGLContextAttributes);

    // If end user enables *glGetProcAddress() functionality, then we must filter out
    // all future WebGL extensions from being passed to the user, and only restrict to advertising
    // extensions that the *glGetProcAddress() function knows to handle.
    var _allSupportedExtensions = ctx.getSupportedExtensions;
    var supportedExtensionsForGetProcAddress = [
      // WebGL 1 extensions
      'ANGLE_instanced_arrays',
      'EXT_blend_minmax',
      'EXT_disjoint_timer_query',
      'EXT_frag_depth',
      'EXT_shader_texture_lod',
      'EXT_sRGB',
      'OES_element_index_uint',
      'OES_fbo_render_mipmap',
      'OES_standard_derivatives',
      'OES_texture_float',
      'OES_texture_half_float',
      'OES_texture_half_float_linear',
      'OES_vertex_array_object',
      'WEBGL_color_buffer_float',
      'WEBGL_depth_texture',
      'WEBGL_draw_buffers',
      // WebGL 2 extensions
      'EXT_color_buffer_float',
      'EXT_disjoint_timer_query_webgl2',
      'EXT_texture_norm16',
      'WEBGL_clip_cull_distance',
      // WebGL 1 and WebGL 2 extensions
      'EXT_color_buffer_half_float',
      'EXT_float_blend',
      'EXT_texture_compression_bptc',
      'EXT_texture_compression_rgtc',
      'EXT_texture_filter_anisotropic',
      'KHR_parallel_shader_compile',
      'OES_texture_float_linear',
      'WEBGL_compressed_texture_s3tc',
      'WEBGL_compressed_texture_s3tc_srgb',
      'WEBGL_debug_renderer_info',
      'WEBGL_debug_shaders',
      'WEBGL_lose_context',
      'WEBGL_multi_draw',
    ];
    ctx.getSupportedExtensions = function () {
      return (_allSupportedExtensions.apply(this) || []).filter(ext => supportedExtensionsForGetProcAddress.includes(ext));
    }

    return handle;
  },
  registerContext: (ctx, webGLContextAttributes) => {
    // without pthreads a context is just an integer ID
    var handle = GL.getNewId(GL.contexts);

    var context = {
      handle,
      attributes: webGLContextAttributes,
      version: webGLContextAttributes.majorVersion,
      GLctx: ctx
    };

    // Store the created context object so that we can access the context
    // given a canvas without having to pass the parameters again.
    if (ctx.canvas) ctx.canvas.GLctxObject = context;
    GL.contexts[handle] = context;
    if (typeof webGLContextAttributes.enableExtensionsByDefault == 'undefined' || webGLContextAttributes.enableExtensionsByDefault) {
      GL.initExtensions(context);
    }

    return handle;
  },
  makeContextCurrent: (contextHandle) => {

    // Active Emscripten GL layer context object.
    GL.currentContext = GL.contexts[contextHandle];
    // Active WebGL context object.
    Module.ctx = GLctx = GL.currentContext?.GLctx;
    return !(contextHandle && !GLctx);
  },
  getContext: (contextHandle) => {
    return GL.contexts[contextHandle];
  },
  deleteContext: (contextHandle) => {
    if (GL.currentContext === GL.contexts[contextHandle]) {
      GL.currentContext = null;
    }
    if (typeof JSEvents == 'object') {
      // Release all JS event handlers on the DOM element that the GL context is
      // associated with since the context is now deleted.
      JSEvents.removeAllHandlersOnTarget(GL.contexts[contextHandle].GLctx.canvas);
    }
    // Make sure the canvas object no longer refers to the context object so
    // there are no GC surprises.
    if (GL.contexts[contextHandle] && GL.contexts[contextHandle].GLctx.canvas) {
      GL.contexts[contextHandle].GLctx.canvas.GLctxObject = undefined;
    }
    GL.contexts[contextHandle] = null;
  },
  initExtensions: (context) => {
    // If this function is called without a specific context object, init the
    // extensions of the currently active context.
    context ||= GL.currentContext;

    if (context.initExtensionsDone) return;
    context.initExtensionsDone = true;

    var GLctx = context.GLctx;

    // Detect the presence of a few extensions manually, ction GL interop
    // layer itself will need to know if they exist.
    context.compressionExt = GLctx.getExtension('WEBGL_compressed_texture_s3tc');
    context.anisotropicExt = GLctx.getExtension('EXT_texture_filter_anisotropic');

    // Extensions that are only available in WebGL 1 (the calls will be no-ops
    // if called on a WebGL 2 context active)
    webgl_enable_ANGLE_instanced_arrays(GLctx);
    webgl_enable_OES_vertex_array_object(GLctx);
    webgl_enable_WEBGL_draw_buffers(GLctx);
    // Extensions that are available from WebGL >= 2 (no-op if called on a WebGL 1 context active)
    webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance(GLctx);
    webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance(GLctx);

    // On WebGL 2, EXT_disjoint_timer_query is replaced with an alternative
    // that's based on core APIs, and exposes only the queryCounterEXT()
    // entrypoint.
    if (context.version >= 2) {
      GLctx.disjointTimerQueryExt = GLctx.getExtension("EXT_disjoint_timer_query_webgl2");
    }

    // However, Firefox exposes the WebGL 1 version on WebGL 2 as well and
    // thus we look for the WebGL 1 version again if the WebGL 2 version
    // isn't present. https://bugzilla.mozilla.org/show_bug.cgi?id=1328882
    if (context.version < 2 || !GLctx.disjointTimerQueryExt) {
      GLctx.disjointTimerQueryExt = GLctx.getExtension("EXT_disjoint_timer_query");
    }

    webgl_enable_WEBGL_multi_draw(GLctx);

    // .getSupportedExtensions() can return null if context is lost, so coerce
    // to empty array.
    var exts = GLctx.getSupportedExtensions() || [];
    exts.forEach((ext) => {
      // WEBGL_lose_context, WEBGL_debug_renderer_info and WEBGL_debug_shaders
      // are not enabled by default.
      if (!ext.includes('lose_context') && !ext.includes('debug')) {
        // Call .getExtension() to enable that extension permanently.
        GLctx.getExtension(ext);
      }
    });
  },
  getExtensions() {
    // .getSupportedExtensions() can return null if context is lost, so coerce to empty array.
    var exts = GLctx.getSupportedExtensions() || [];
    exts = exts.concat(exts.map((e) => "GL_" + e));
    return exts;
  },
};

var _eglCreateContext = (display, config, hmm, contextAttribs) => {
  if (display != 62000) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }

  // EGL 1.4 spec says default EGL_CONTEXT_CLIENT_VERSION is GLES1, but this is not supported by Emscripten.
  // So user must pass EGL_CONTEXT_CLIENT_VERSION == 2 to initialize EGL.
  var glesContextVersion = 1;
  for (; ;) {
    var param = HEAP32[((contextAttribs) >> 2)];
    if (param == 0x3098 /*EGL_CONTEXT_CLIENT_VERSION*/) {
      glesContextVersion = HEAP32[(((contextAttribs) + (4)) >> 2)];
    } else if (param == 0x3038 /*EGL_NONE*/) {
      break;
    } else {
      /* EGL1.4 specifies only EGL_CONTEXT_CLIENT_VERSION as supported attribute */
      EGL.setErrorCode(0x3004 /*EGL_BAD_ATTRIBUTE*/);
      return 0;
    }
    contextAttribs += 8;
  }
  if (glesContextVersion < 2 || glesContextVersion > 3) {
    EGL.setErrorCode(0x3005 /* EGL_BAD_CONFIG */);
    return 0; /* EGL_NO_CONTEXT */
  }

  EGL.contextAttributes.majorVersion = glesContextVersion - 1; // WebGL 1 is GLES 2, WebGL2 is GLES3
  EGL.contextAttributes.minorVersion = 0;

  EGL.context = GL.createContext(Module['canvas'], EGL.contextAttributes);

  if (EGL.context != 0) {
    EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);

    // Run callbacks so that GL emulation works
    GL.makeContextCurrent(EGL.context);
    Module.useWebGL = true;
    Browser.moduleContextCreatedCallbacks.forEach(function (callback) { callback() });

    // Note: This function only creates a context, but it shall not make it active.
    GL.makeContextCurrent(null);
    return 62004;
  } else {
    EGL.setErrorCode(0x3009 /* EGL_BAD_MATCH */); // By the EGL 1.4 spec, an implementation that does not support GLES2 (WebGL in this case), this error code is set.
    return 0; /* EGL_NO_CONTEXT */
  }
};

var _eglCreateWindowSurface = (display, config, win, attrib_list) => {
  if (display != 62000) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }
  if (config != 62002) {
    EGL.setErrorCode(0x3005 /* EGL_BAD_CONFIG */);
    return 0;
  }
  // TODO: Examine attrib_list! Parameters that can be present there are:
  // - EGL_RENDER_BUFFER (must be EGL_BACK_BUFFER)
  // - EGL_VG_COLORSPACE (can't be set)
  // - EGL_VG_ALPHA_FORMAT (can't be set)
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  return 62006; /* Magic ID for Emscripten 'default surface' */
};


var _eglDestroyContext = (display, context) => {
  if (display != 62000) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }
  if (context != 62004) {
    EGL.setErrorCode(0x3006 /* EGL_BAD_CONTEXT */);
    return 0;
  }

  GL.deleteContext(EGL.context);
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  if (EGL.currentContext == context) {
    EGL.currentContext = 0;
  }
  return 1 /* EGL_TRUE */;
};

var _eglDestroySurface = (display, surface) => {
  if (display != 62000) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }
  if (surface != 62006 /* Magic ID for the only EGLSurface supported by Emscripten */) {
    EGL.setErrorCode(0x300D /* EGL_BAD_SURFACE */);
    return 1;
  }
  if (EGL.currentReadSurface == surface) {
    EGL.currentReadSurface = 0;
  }
  if (EGL.currentDrawSurface == surface) {
    EGL.currentDrawSurface = 0;
  }
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  return 1; /* Magic ID for Emscripten 'default surface' */
};

var _eglGetConfigAttrib = (display, config, attribute, value) => {
  if (display != 62000) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }
  if (config != 62002) {
    EGL.setErrorCode(0x3005 /* EGL_BAD_CONFIG */);
    return 0;
  }
  if (!value) {
    EGL.setErrorCode(0x300C /* EGL_BAD_PARAMETER */);
    return 0;
  }
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  switch (attribute) {
    case 0x3020: // EGL_BUFFER_SIZE
      HEAP32[((value) >> 2)] = EGL.contextAttributes.alpha ? 32 : 24;
      return 1;
    case 0x3021: // EGL_ALPHA_SIZE
      HEAP32[((value) >> 2)] = EGL.contextAttributes.alpha ? 8 : 0;
      return 1;
    case 0x3022: // EGL_BLUE_SIZE
      HEAP32[((value) >> 2)] = 8;
      return 1;
    case 0x3023: // EGL_GREEN_SIZE
      HEAP32[((value) >> 2)] = 8;
      return 1;
    case 0x3024: // EGL_RED_SIZE
      HEAP32[((value) >> 2)] = 8;
      return 1;
    case 0x3025: // EGL_DEPTH_SIZE
      HEAP32[((value) >> 2)] = EGL.contextAttributes.depth ? 24 : 0;
      return 1;
    case 0x3026: // EGL_STENCIL_SIZE
      HEAP32[((value) >> 2)] = EGL.contextAttributes.stencil ? 8 : 0;
      return 1;
    case 0x3027: // EGL_CONFIG_CAVEAT
      // We can return here one of EGL_NONE (0x3038), EGL_SLOW_CONFIG (0x3050) or EGL_NON_CONFORMANT_CONFIG (0x3051).
      HEAP32[((value) >> 2)] = 0x3038;
      return 1;
    case 0x3028: // EGL_CONFIG_ID
      HEAP32[((value) >> 2)] = 62002;
      return 1;
    case 0x3029: // EGL_LEVEL
      HEAP32[((value) >> 2)] = 0;
      return 1;
    case 0x302A: // EGL_MAX_PBUFFER_HEIGHT
      HEAP32[((value) >> 2)] = 4096;
      return 1;
    case 0x302B: // EGL_MAX_PBUFFER_PIXELS
      HEAP32[((value) >> 2)] = 16777216;
      return 1;
    case 0x302C: // EGL_MAX_PBUFFER_WIDTH
      HEAP32[((value) >> 2)] = 4096;
      return 1;
    case 0x302D: // EGL_NATIVE_RENDERABLE
      HEAP32[((value) >> 2)] = 0;
      return 1;
    case 0x302E: // EGL_NATIVE_VISUAL_ID
      HEAP32[((value) >> 2)] = 0;
      return 1;
    case 0x302F: // EGL_NATIVE_VISUAL_TYPE
      HEAP32[((value) >> 2)] = 0x3038;
      return 1;
    case 0x3031: // EGL_SAMPLES
      HEAP32[((value) >> 2)] = EGL.contextAttributes.antialias ? 4 : 0;
      return 1;
    case 0x3032: // EGL_SAMPLE_BUFFERS
      HEAP32[((value) >> 2)] = EGL.contextAttributes.antialias ? 1 : 0;
      return 1;
    case 0x3033: // EGL_SURFACE_TYPE
      HEAP32[((value) >> 2)] = 0x4;
      return 1;
    case 0x3034: // EGL_TRANSPARENT_TYPE
      // If this returns EGL_TRANSPARENT_RGB (0x3052), transparency is used through color-keying. No such thing applies to Emscripten canvas.
      HEAP32[((value) >> 2)] = 0x3038;
      return 1;
    case 0x3035: // EGL_TRANSPARENT_BLUE_VALUE
    case 0x3036: // EGL_TRANSPARENT_GREEN_VALUE
    case 0x3037: // EGL_TRANSPARENT_RED_VALUE
      // "If EGL_TRANSPARENT_TYPE is EGL_NONE, then the values for EGL_TRANSPARENT_RED_VALUE, EGL_TRANSPARENT_GREEN_VALUE, and EGL_TRANSPARENT_BLUE_VALUE are undefined."
      HEAP32[((value) >> 2)] = -1;
      return 1;
    case 0x3039: // EGL_BIND_TO_TEXTURE_RGB
    case 0x303A: // EGL_BIND_TO_TEXTURE_RGBA
      HEAP32[((value) >> 2)] = 0;
      return 1;
    case 0x303B: // EGL_MIN_SWAP_INTERVAL
      HEAP32[((value) >> 2)] = 0;
      return 1;
    case 0x303C: // EGL_MAX_SWAP_INTERVAL
      HEAP32[((value) >> 2)] = 1;
      return 1;
    case 0x303D: // EGL_LUMINANCE_SIZE
    case 0x303E: // EGL_ALPHA_MASK_SIZE
      HEAP32[((value) >> 2)] = 0;
      return 1;
    case 0x303F: // EGL_COLOR_BUFFER_TYPE
      // EGL has two types of buffers: EGL_RGB_BUFFER and EGL_LUMINANCE_BUFFER.
      HEAP32[((value) >> 2)] = 0x308E;
      return 1;
    case 0x3040: // EGL_RENDERABLE_TYPE
      // A bit combination of EGL_OPENGL_ES_BIT,EGL_OPENVG_BIT,EGL_OPENGL_ES2_BIT and EGL_OPENGL_BIT.
      HEAP32[((value) >> 2)] = 0x4;
      return 1;
    case 0x3042: // EGL_CONFORMANT
      // "EGL_CONFORMANT is a mask indicating if a client API context created with respect to the corresponding EGLConfig will pass the required conformance tests for that API."
      HEAP32[((value) >> 2)] = 0;
      return 1;
    default:
      EGL.setErrorCode(0x3004 /* EGL_BAD_ATTRIBUTE */);
      return 0;
  }
};

var _eglGetDisplay = (nativeDisplayType) => {
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  // Emscripten EGL implementation "emulates" X11, and eglGetDisplay is
  // expected to accept/receive a pointer to an X11 Display object (or
  // EGL_DEFAULT_DISPLAY).
  if (nativeDisplayType != 0 /* EGL_DEFAULT_DISPLAY */ && nativeDisplayType != 1 /* see library_xlib.js */) {
    return 0; // EGL_NO_DISPLAY
  }
  return 62000;
};

var _eglGetError = () => EGL.errorCode;

var _eglInitialize = (display, majorVersion, minorVersion) => {
  if (display != 62000) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }
  if (majorVersion) {
    HEAP32[((majorVersion) >> 2)] = 1; // Advertise EGL Major version: '1'
  }
  if (minorVersion) {
    HEAP32[((minorVersion) >> 2)] = 4; // Advertise EGL Minor version: '4'
  }
  EGL.defaultDisplayInitialized = true;
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  return 1;
};


var _eglMakeCurrent = (display, draw, read, context) => {
  if (display != 62000) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0 /* EGL_FALSE */;
  }
  //\todo An EGL_NOT_INITIALIZED error is generated if EGL is not initialized for dpy.
  if (context != 0 && context != 62004) {
    EGL.setErrorCode(0x3006 /* EGL_BAD_CONTEXT */);
    return 0;
  }
  if ((read != 0 && read != 62006) || (draw != 0 && draw != 62006 /* Magic ID for Emscripten 'default surface' */)) {
    EGL.setErrorCode(0x300D /* EGL_BAD_SURFACE */);
    return 0;
  }

  GL.makeContextCurrent(context ? EGL.context : null);

  EGL.currentContext = context;
  EGL.currentDrawSurface = draw;
  EGL.currentReadSurface = read;
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  return 1 /* EGL_TRUE */;
};


var _eglQueryString = (display, name) => {
  if (display != 62000) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }
  //\todo An EGL_NOT_INITIALIZED error is generated if EGL is not initialized for dpy.
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  if (EGL.stringCache[name]) return EGL.stringCache[name];
  var ret;
  switch (name) {
    case 0x3053 /* EGL_VENDOR */: ret = stringToNewUTF8("Emscripten"); break;
    case 0x3054 /* EGL_VERSION */: ret = stringToNewUTF8("1.4 Emscripten EGL"); break;
    case 0x3055 /* EGL_EXTENSIONS */: ret = stringToNewUTF8(""); break; // Currently not supporting any EGL extensions.
    case 0x308D /* EGL_CLIENT_APIS */: ret = stringToNewUTF8("OpenGL_ES"); break;
    default:
      EGL.setErrorCode(0x300C /* EGL_BAD_PARAMETER */);
      return 0;
  }
  EGL.stringCache[name] = ret;
  return ret;
};

var _eglSwapBuffers = (dpy, surface) => {

  if (!EGL.defaultDisplayInitialized) {
    EGL.setErrorCode(0x3001 /* EGL_NOT_INITIALIZED */);
  } else if (!Module.ctx) {
    EGL.setErrorCode(0x3002 /* EGL_BAD_ACCESS */);
  } else if (Module.ctx.isContextLost()) {
    EGL.setErrorCode(0x300E /* EGL_CONTEXT_LOST */);
  } else {
    // According to documentation this does an implicit flush.
    // Due to discussion at https://github.com/emscripten-core/emscripten/pull/1871
    // the flush was removed since this _may_ result in slowing code down.
    //_glFlush();
    EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
    return 1 /* EGL_TRUE */;
  }
  return 0 /* EGL_FALSE */;
};


var _eglSwapInterval = (display, interval) => {
  if (display != 62000) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }
  if (interval == 0) _emscripten_set_main_loop_timing(0, 0);
  else _emscripten_set_main_loop_timing(1, interval);

  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  return 1;
};

var _eglTerminate = (display) => {
  if (display != 62000) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }
  EGL.currentContext = 0;
  EGL.currentReadSurface = 0;
  EGL.currentDrawSurface = 0;
  EGL.defaultDisplayInitialized = false;
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  return 1;
};


/** @suppress {duplicate } */
var _eglWaitClient = () => {
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  return 1;
};
var _eglWaitGL = _eglWaitClient;

var _eglWaitNative = (nativeEngineId) => {
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  return 1;
};

var readEmAsmArgsArray = [];
var readEmAsmArgs = (sigPtr, buf) => {
  // Nobody should have mutated _readEmAsmArgsArray underneath us to be something else than an array.
  assert(Array.isArray(readEmAsmArgsArray));
  // The input buffer is allocated on the stack, so it must be stack-aligned.
  assert(buf % 16 == 0);
  readEmAsmArgsArray.length = 0;
  var ch;
  // Most arguments are i32s, so shift the buffer pointer so it is a plain
  // index into HEAP32.
  while (ch = HEAPU8[sigPtr++]) {
    var chr = String.fromCharCode(ch);
    var validChars = ['d', 'f', 'i', 'p'];
    assert(validChars.includes(chr), `Invalid character ${ch}("${chr}") in readEmAsmArgs! Use only [${validChars}], and do not specify "v" for void return argument.`);
    // Floats are always passed as doubles, so all types except for 'i'
    // are 8 bytes and require alignment.
    var wide = (ch != 105);
    wide &= (ch != 112);
    buf += wide && (buf % 8) ? 4 : 0;
    readEmAsmArgsArray.push(
      // Special case for pointers under wasm64 or CAN_ADDRESS_2GB mode.
      ch == 112 ? HEAPU32[((buf) >> 2)] :
        ch == 105 ?
          HEAP32[((buf) >> 2)] :
          HEAPF64[((buf) >> 3)]
    );
    buf += wide ? 8 : 4;
  }
  return readEmAsmArgsArray;
};
var runEmAsmFunction = (code, sigPtr, argbuf) => {
  var args = readEmAsmArgs(sigPtr, argbuf);
  assert(ASM_CONSTS.hasOwnProperty(code), `No EM_ASM constant found at address ${code}.  The loaded WebAssembly file is likely out of sync with the generated JavaScript.`);
  return ASM_CONSTS[code].apply(null, args);
};
var _emscripten_asm_const_int = (code, sigPtr, argbuf) => {
  return runEmAsmFunction(code, sigPtr, argbuf);
};

var runMainThreadEmAsm = (code, sigPtr, argbuf, sync) => {
  var args = readEmAsmArgs(sigPtr, argbuf);
  assert(ASM_CONSTS.hasOwnProperty(code), `No EM_ASM constant found at address ${code}.  The loaded WebAssembly file is likely out of sync with the generated JavaScript.`);
  return ASM_CONSTS[code].apply(null, args);
};
var _emscripten_asm_const_int_sync_on_main_thread = (code, sigPtr, argbuf) => {
  return runMainThreadEmAsm(code, sigPtr, argbuf, 1);
};

var _emscripten_cancel_main_loop = () => {
  Browser.mainLoop.pause();
  Browser.mainLoop.func = null;
};

var _emscripten_date_now = () => Date.now();

var _emscripten_err = (str) => err(UTF8ToString(str));

var JSEvents = {
  inEventHandler: 0,
  removeAllEventListeners() {
    for (var i = JSEvents.eventHandlers.length - 1; i >= 0; --i) {
      JSEvents._removeHandler(i);
    }
    JSEvents.eventHandlers = [];
    JSEvents.deferredCalls = [];
  },
  registerRemoveEventListeners() {
    if (!JSEvents.removeEventListenersRegistered) {
      __ATEXIT__.push(JSEvents.removeAllEventListeners);
      JSEvents.removeEventListenersRegistered = true;
    }
  },
  deferredCalls: [],
  deferCall(targetFunction, precedence, argsList) {
    function arraysHaveEqualContent(arrA, arrB) {
      if (arrA.length != arrB.length) return false;

      for (var i in arrA) {
        if (arrA[i] != arrB[i]) return false;
      }
      return true;
    }
    // Test if the given call was already queued, and if so, don't add it again.
    for (var i in JSEvents.deferredCalls) {
      var call = JSEvents.deferredCalls[i];
      if (call.targetFunction == targetFunction && arraysHaveEqualContent(call.argsList, argsList)) {
        return;
      }
    }
    JSEvents.deferredCalls.push({
      targetFunction,
      precedence,
      argsList
    });

    JSEvents.deferredCalls.sort((x, y) => x.precedence < y.precedence);
  },
  removeDeferredCalls(targetFunction) {
    for (var i = 0; i < JSEvents.deferredCalls.length; ++i) {
      if (JSEvents.deferredCalls[i].targetFunction == targetFunction) {
        JSEvents.deferredCalls.splice(i, 1);
        --i;
      }
    }
  },
  canPerformEventHandlerRequests() {
    if (navigator.userActivation) {
      // Verify against transient activation status from UserActivation API
      // whether it is possible to perform a request here without needing to defer. See
      // https://developer.mozilla.org/en-US/docs/Web/Security/User_activation#transient_activation
      // and https://caniuse.com/mdn-api_useractivation
      // At the time of writing, Firefox does not support this API: https://bugzilla.mozilla.org/show_bug.cgi?id=1791079
      return navigator.userActivation.isActive;
    }

    return JSEvents.inEventHandler && JSEvents.currentEventHandler.allowsDeferredCalls;
  },
  runDeferredCalls() {
    if (!JSEvents.canPerformEventHandlerRequests()) {
      return;
    }
    for (var i = 0; i < JSEvents.deferredCalls.length; ++i) {
      var call = JSEvents.deferredCalls[i];
      JSEvents.deferredCalls.splice(i, 1);
      --i;
      call.targetFunction.apply(null, call.argsList);
    }
  },
  eventHandlers: [],
  removeAllHandlersOnTarget: (target, eventTypeString) => {
    for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
      if (JSEvents.eventHandlers[i].target == target &&
        (!eventTypeString || eventTypeString == JSEvents.eventHandlers[i].eventTypeString)) {
        JSEvents._removeHandler(i--);
      }
    }
  },
  _removeHandler(i) {
    var h = JSEvents.eventHandlers[i];
    h.target.removeEventListener(h.eventTypeString, h.eventListenerFunc, h.useCapture);
    JSEvents.eventHandlers.splice(i, 1);
  },
  registerOrRemoveHandler(eventHandler) {
    if (!eventHandler.target) {
      err('registerOrRemoveHandler: the target element for event handler registration does not exist, when processing the following event handler registration:');
      console.dir(eventHandler);
      return -4;
    }
    var jsEventHandler = function jsEventHandler(event) {
      // Increment nesting count for the event handler.
      ++JSEvents.inEventHandler;
      JSEvents.currentEventHandler = eventHandler;
      // Process any old deferred calls the user has placed.
      JSEvents.runDeferredCalls();
      // Process the actual event, calls back to user C code handler.
      eventHandler.handlerFunc(event);
      // Process any new deferred calls that were placed right now from this event handler.
      JSEvents.runDeferredCalls();
      // Out of event handler - restore nesting count.
      --JSEvents.inEventHandler;
    };

    if (eventHandler.callbackfunc) {
      eventHandler.eventListenerFunc = jsEventHandler;
      eventHandler.target.addEventListener(eventHandler.eventTypeString, jsEventHandler, eventHandler.useCapture);
      JSEvents.eventHandlers.push(eventHandler);
      JSEvents.registerRemoveEventListeners();
    } else {
      for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
        if (JSEvents.eventHandlers[i].target == eventHandler.target
          && JSEvents.eventHandlers[i].eventTypeString == eventHandler.eventTypeString) {
          JSEvents._removeHandler(i--);
        }
      }
    }
    return 0;
  },
  getNodeNameForTarget(target) {
    if (!target) return '';
    if (target == window) return '#window';
    if (target == screen) return '#screen';
    return target?.nodeName || '';
  },
  fullscreenEnabled() {
    return document.fullscreenEnabled
      // Safari 13.0.3 on macOS Catalina 10.15.1 still ships with prefixed webkitFullscreenEnabled.
      // TODO: If Safari at some point ships with unprefixed version, update the version check above.
      || document.webkitFullscreenEnabled
      ;
  },
};

var currentFullscreenStrategy = {
};




var maybeCStringToJsString = (cString) => {
  // "cString > 2" checks if the input is a number, and isn't of the special
  // values we accept here, EMSCRIPTEN_EVENT_TARGET_* (which map to 0, 1, 2).
  // In other words, if cString > 2 then it's a pointer to a valid place in
  // memory, and points to a C string.
  return cString > 2 ? UTF8ToString(cString) : cString;
};

var specialHTMLTargets = [0, typeof document != 'undefined' ? document : 0, typeof window != 'undefined' ? window : 0];
var findEventTarget = (target) => {
  target = maybeCStringToJsString(target);
  var domElement = specialHTMLTargets[target] || (typeof document != 'undefined' ? document.querySelector(target) : undefined);
  return domElement;
};
var findCanvasEventTarget = (target) => findEventTarget(target);
var _emscripten_get_canvas_element_size = (target, width, height) => {
  var canvas = findCanvasEventTarget(target);
  if (!canvas) return -4;
  HEAP32[((width) >> 2)] = canvas.width;
  HEAP32[((height) >> 2)] = canvas.height;
};



var stringToUTF8OnStack = (str) => {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8(str, ret, size);
  return ret;
};
var getCanvasElementSize = (target) => withStackSave(() => {
  var w = stackAlloc(8);
  var h = w + 4;

  var targetInt = stringToUTF8OnStack(target.id);
  var ret = _emscripten_get_canvas_element_size(targetInt, w, h);
  var size = [HEAP32[((w) >> 2)], HEAP32[((h) >> 2)]];
  return size;
});


var _emscripten_set_canvas_element_size = (target, width, height) => {
  var canvas = findCanvasEventTarget(target);
  if (!canvas) return -4;
  canvas.width = width;
  canvas.height = height;
  return 0;
};


var setCanvasElementSize = (target, width, height) => {
  if (!target.controlTransferredOffscreen) {
    target.width = width;
    target.height = height;
  } else {
    // This function is being called from high-level JavaScript code instead of asm.js/Wasm,
    // and it needs to synchronously proxy over to another thread, so marshal the string onto the heap to do the call.
    withStackSave(() => {
      var targetInt = stringToUTF8OnStack(target.id);
      _emscripten_set_canvas_element_size(targetInt, width, height);
    });
  }
};

var registerRestoreOldStyle = (canvas) => {
  var canvasSize = getCanvasElementSize(canvas);
  var oldWidth = canvasSize[0];
  var oldHeight = canvasSize[1];
  var oldCssWidth = canvas.style.width;
  var oldCssHeight = canvas.style.height;
  var oldBackgroundColor = canvas.style.backgroundColor; // Chrome reads color from here.
  var oldDocumentBackgroundColor = document.body.style.backgroundColor; // IE11 reads color from here.
  // Firefox always has black background color.
  var oldPaddingLeft = canvas.style.paddingLeft; // Chrome, FF, Safari
  var oldPaddingRight = canvas.style.paddingRight;
  var oldPaddingTop = canvas.style.paddingTop;
  var oldPaddingBottom = canvas.style.paddingBottom;
  var oldMarginLeft = canvas.style.marginLeft; // IE11
  var oldMarginRight = canvas.style.marginRight;
  var oldMarginTop = canvas.style.marginTop;
  var oldMarginBottom = canvas.style.marginBottom;
  var oldDocumentBodyMargin = document.body.style.margin;
  var oldDocumentOverflow = document.documentElement.style.overflow; // Chrome, Firefox
  var oldDocumentScroll = document.body.scroll; // IE
  var oldImageRendering = canvas.style.imageRendering;

  function restoreOldStyle() {
    var fullscreenElement = document.fullscreenElement
      || document.webkitFullscreenElement
      ;
    if (!fullscreenElement) {
      document.removeEventListener('fullscreenchange', restoreOldStyle);

      // Unprefixed Fullscreen API shipped in Chromium 71 (https://bugs.chromium.org/p/chromium/issues/detail?id=383813)
      // As of Safari 13.0.3 on macOS Catalina 10.15.1 still ships with prefixed webkitfullscreenchange. TODO: revisit this check once Safari ships unprefixed version.
      document.removeEventListener('webkitfullscreenchange', restoreOldStyle);

      setCanvasElementSize(canvas, oldWidth, oldHeight);

      canvas.style.width = oldCssWidth;
      canvas.style.height = oldCssHeight;
      canvas.style.backgroundColor = oldBackgroundColor; // Chrome
      // IE11 hack: assigning 'undefined' or an empty string to document.body.style.backgroundColor has no effect, so first assign back the default color
      // before setting the undefined value. Setting undefined value is also important, or otherwise we would later treat that as something that the user
      // had explicitly set so subsequent fullscreen transitions would not set background color properly.
      if (!oldDocumentBackgroundColor) document.body.style.backgroundColor = 'white';
      document.body.style.backgroundColor = oldDocumentBackgroundColor; // IE11
      canvas.style.paddingLeft = oldPaddingLeft; // Chrome, FF, Safari
      canvas.style.paddingRight = oldPaddingRight;
      canvas.style.paddingTop = oldPaddingTop;
      canvas.style.paddingBottom = oldPaddingBottom;
      canvas.style.marginLeft = oldMarginLeft; // IE11
      canvas.style.marginRight = oldMarginRight;
      canvas.style.marginTop = oldMarginTop;
      canvas.style.marginBottom = oldMarginBottom;
      document.body.style.margin = oldDocumentBodyMargin;
      document.documentElement.style.overflow = oldDocumentOverflow; // Chrome, Firefox
      document.body.scroll = oldDocumentScroll; // IE
      canvas.style.imageRendering = oldImageRendering;
      if (canvas.GLctxObject) canvas.GLctxObject.GLctx.viewport(0, 0, oldWidth, oldHeight);

      if (currentFullscreenStrategy.canvasResizedCallback) {
        getWasmTableEntry(currentFullscreenStrategy.canvasResizedCallback)(37, 0, currentFullscreenStrategy.canvasResizedCallbackUserData);
      }
    }
  }
  document.addEventListener('fullscreenchange', restoreOldStyle);
  // Unprefixed Fullscreen API shipped in Chromium 71 (https://bugs.chromium.org/p/chromium/issues/detail?id=383813)
  // As of Safari 13.0.3 on macOS Catalina 10.15.1 still ships with prefixed webkitfullscreenchange. TODO: revisit this check once Safari ships unprefixed version.
  document.addEventListener('webkitfullscreenchange', restoreOldStyle);
  return restoreOldStyle;
};


var setLetterbox = (element, topBottom, leftRight) => {
  // Cannot use margin to specify letterboxes in FF or Chrome, since those ignore margins in fullscreen mode.
  element.style.paddingLeft = element.style.paddingRight = leftRight + 'px';
  element.style.paddingTop = element.style.paddingBottom = topBottom + 'px';
};


var getBoundingClientRect = (e) => specialHTMLTargets.indexOf(e) < 0 ? e.getBoundingClientRect() : { 'left': 0, 'top': 0 };
var JSEvents_resizeCanvasForFullscreen = (target, strategy) => {
  var restoreOldStyle = registerRestoreOldStyle(target);
  var cssWidth = strategy.softFullscreen ? innerWidth : screen.width;
  var cssHeight = strategy.softFullscreen ? innerHeight : screen.height;
  var rect = getBoundingClientRect(target);
  var windowedCssWidth = rect.width;
  var windowedCssHeight = rect.height;
  var canvasSize = getCanvasElementSize(target);
  var windowedRttWidth = canvasSize[0];
  var windowedRttHeight = canvasSize[1];

  if (strategy.scaleMode == 3) {
    setLetterbox(target, (cssHeight - windowedCssHeight) / 2, (cssWidth - windowedCssWidth) / 2);
    cssWidth = windowedCssWidth;
    cssHeight = windowedCssHeight;
  } else if (strategy.scaleMode == 2) {
    if (cssWidth * windowedRttHeight < windowedRttWidth * cssHeight) {
      var desiredCssHeight = windowedRttHeight * cssWidth / windowedRttWidth;
      setLetterbox(target, (cssHeight - desiredCssHeight) / 2, 0);
      cssHeight = desiredCssHeight;
    } else {
      var desiredCssWidth = windowedRttWidth * cssHeight / windowedRttHeight;
      setLetterbox(target, 0, (cssWidth - desiredCssWidth) / 2);
      cssWidth = desiredCssWidth;
    }
  }

  // If we are adding padding, must choose a background color or otherwise Chrome will give the
  // padding a default white color. Do it only if user has not customized their own background color.
  if (!target.style.backgroundColor) target.style.backgroundColor = 'black';
  // IE11 does the same, but requires the color to be set in the document body.
  if (!document.body.style.backgroundColor) document.body.style.backgroundColor = 'black'; // IE11
  // Firefox always shows black letterboxes independent of style color.

  target.style.width = cssWidth + 'px';
  target.style.height = cssHeight + 'px';

  if (strategy.filteringMode == 1) {
    target.style.imageRendering = 'optimizeSpeed';
    target.style.imageRendering = '-moz-crisp-edges';
    target.style.imageRendering = '-o-crisp-edges';
    target.style.imageRendering = '-webkit-optimize-contrast';
    target.style.imageRendering = 'optimize-contrast';
    target.style.imageRendering = 'crisp-edges';
    target.style.imageRendering = 'pixelated';
  }

  var dpiScale = (strategy.canvasResolutionScaleMode == 2) ? devicePixelRatio : 1;
  if (strategy.canvasResolutionScaleMode != 0) {
    var newWidth = (cssWidth * dpiScale) | 0;
    var newHeight = (cssHeight * dpiScale) | 0;
    setCanvasElementSize(target, newWidth, newHeight);
    if (target.GLctxObject) target.GLctxObject.GLctx.viewport(0, 0, newWidth, newHeight);
  }
  return restoreOldStyle;
};

var JSEvents_requestFullscreen = (target, strategy) => {
  // EMSCRIPTEN_FULLSCREEN_SCALE_DEFAULT + EMSCRIPTEN_FULLSCREEN_CANVAS_SCALE_NONE is a mode where no extra logic is performed to the DOM elements.
  if (strategy.scaleMode != 0 || strategy.canvasResolutionScaleMode != 0) {
    JSEvents_resizeCanvasForFullscreen(target, strategy);
  }

  if (target.requestFullscreen) {
    target.requestFullscreen();
  } else if (target.webkitRequestFullscreen) {
    target.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
  } else {
    return JSEvents.fullscreenEnabled() ? -3 : -1;
  }

  currentFullscreenStrategy = strategy;

  if (strategy.canvasResizedCallback) {
    getWasmTableEntry(strategy.canvasResizedCallback)(37, 0, strategy.canvasResizedCallbackUserData);
  }

  return 0;
};

var _emscripten_exit_fullscreen = () => {
  if (!JSEvents.fullscreenEnabled()) return -1;
  // Make sure no queued up calls will fire after this.
  JSEvents.removeDeferredCalls(JSEvents_requestFullscreen);

  var d = specialHTMLTargets[1];
  if (d.exitFullscreen) {
    d.fullscreenElement && d.exitFullscreen();
  } else if (d.webkitExitFullscreen) {
    d.webkitFullscreenElement && d.webkitExitFullscreen();
  } else {
    return -1;
  }

  return 0;
};


var requestPointerLock = (target) => {
  if (target.requestPointerLock) {
    target.requestPointerLock();
  } else {
    // document.body is known to accept pointer lock, so use that to differentiate if the user passed a bad element,
    // or if the whole browser just doesn't support the feature.
    if (document.body.requestPointerLock
    ) {
      return -3;
    }
    return -1;
  }
  return 0;
};
var _emscripten_exit_pointerlock = () => {
  // Make sure no queued up calls will fire after this.
  JSEvents.removeDeferredCalls(requestPointerLock);

  if (document.exitPointerLock) {
    document.exitPointerLock();
  } else {
    return -1;
  }
  return 0;
};

var _emscripten_get_device_pixel_ratio = () => {
  return (typeof devicePixelRatio == 'number' && devicePixelRatio) || 1.0;
};



var _emscripten_get_element_css_size = (target, width, height) => {
  target = findEventTarget(target);
  if (!target) return -4;

  var rect = getBoundingClientRect(target);
  HEAPF64[((width) >> 3)] = rect.width;
  HEAPF64[((height) >> 3)] = rect.height;

  return 0;
};


var fillGamepadEventData = (eventStruct, e) => {
  HEAPF64[((eventStruct) >> 3)] = e.timestamp;
  for (var i = 0; i < e.axes.length; ++i) {
    HEAPF64[(((eventStruct + i * 8) + (16)) >> 3)] = e.axes[i];
  }
  for (var i = 0; i < e.buttons.length; ++i) {
    if (typeof e.buttons[i] == 'object') {
      HEAPF64[(((eventStruct + i * 8) + (528)) >> 3)] = e.buttons[i].value;
    } else {
      HEAPF64[(((eventStruct + i * 8) + (528)) >> 3)] = e.buttons[i];
    }
  }
  for (var i = 0; i < e.buttons.length; ++i) {
    if (typeof e.buttons[i] == 'object') {
      HEAP32[(((eventStruct + i * 4) + (1040)) >> 2)] = e.buttons[i].pressed;
    } else {
      // Assigning a boolean to HEAP32, that's ok, but Closure would like to warn about it:
      /** @suppress {checkTypes} */
      HEAP32[(((eventStruct + i * 4) + (1040)) >> 2)] = e.buttons[i] == 1;
    }
  }
  HEAP32[(((eventStruct) + (1296)) >> 2)] = e.connected;
  HEAP32[(((eventStruct) + (1300)) >> 2)] = e.index;
  HEAP32[(((eventStruct) + (8)) >> 2)] = e.axes.length;
  HEAP32[(((eventStruct) + (12)) >> 2)] = e.buttons.length;
  stringToUTF8(e.id, eventStruct + 1304, 64);
  stringToUTF8(e.mapping, eventStruct + 1368, 64);
};
var _emscripten_get_gamepad_status = (index, gamepadState) => {
  if (!JSEvents.lastGamepadState) throw 'emscripten_get_gamepad_status() can only be called after having first called emscripten_sample_gamepad_data() and that function has returned EMSCRIPTEN_RESULT_SUCCESS!';
  // INVALID_PARAM is returned on a Gamepad index that never was there.
  if (index < 0 || index >= JSEvents.lastGamepadState.length) return -5;

  // NO_DATA is returned on a Gamepad index that was removed.
  // For previously disconnected gamepads there should be an empty slot (null/undefined/false) at the index.
  // This is because gamepads must keep their original position in the array.
  // For example, removing the first of two gamepads produces [null/undefined/false, gamepad].
  if (!JSEvents.lastGamepadState[index]) return -7;

  fillGamepadEventData(gamepadState, JSEvents.lastGamepadState[index]);
  return 0;
};

var getHeapMax = () =>
  // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
  // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
  // for any code that deals with heap sizes, which would require special
  // casing all heap size related code to treat 0 specially.
  2147483648;
var _emscripten_get_heap_max = () => getHeapMax();


var _emscripten_get_num_gamepads = () => {
  if (!JSEvents.lastGamepadState) throw 'emscripten_get_num_gamepads() can only be called after having first called emscripten_sample_gamepad_data() and that function has returned EMSCRIPTEN_RESULT_SUCCESS!';
  // N.B. Do not call emscripten_get_num_gamepads() unless having first called emscripten_sample_gamepad_data(), and that has returned EMSCRIPTEN_RESULT_SUCCESS.
  // Otherwise the following line will throw an exception.
  return JSEvents.lastGamepadState.length;
};

var _emscripten_get_screen_size = (width, height) => {
  HEAP32[((width) >> 2)] = screen.width;
  HEAP32[((height) >> 2)] = screen.height;
};

/** @suppress {duplicate } */
function _glActiveTexture(x0) { GLctx.activeTexture(x0) }
var _emscripten_glActiveTexture = _glActiveTexture;

/** @suppress {duplicate } */
var _glAlphaFunc = (func, ref) => {
  switch (func) {
    case 0x200: // GL_NEVER
    case 0x201: // GL_LESS
    case 0x202: // GL_EQUAL
    case 0x203: // GL_LEQUAL
    case 0x204: // GL_GREATER
    case 0x205: // GL_NOTEQUAL
    case 0x206: // GL_GEQUAL
    case 0x207: // GL_ALWAYS
      GLEmulation.alphaTestRef = ref;
      if (GLEmulation.alphaTestFunc != func) {
        GLEmulation.alphaTestFunc = func;
        GLImmediate.currentRenderer = null; // alpha test mode is part of the FFP shader state, we must re-lookup the renderer to use.
      }
      break;
    default: // invalid value provided
      break;
  }
};
var _emscripten_glAlphaFunc = _glAlphaFunc;

/** @suppress {duplicate } */
var _glAttachShader = (program, shader) => {
  GLctx.attachShader(GL.programs[program], GL.shaders[shader]);
};
var _emscripten_glAttachShader = _glAttachShader;




function _glEnable(x0) { GLctx.enable(x0) }

function _glDisable(x0) { GLctx.disable(x0) }

function _glIsEnabled(x0) { return GLctx.isEnabled(x0) }


var readI53FromU64 = (ptr) => {
  return HEAPU32[((ptr) >> 2)] + HEAPU32[(((ptr) + (4)) >> 2)] * 4294967296;
};
var writeI53ToI64 = (ptr, num) => {
  HEAPU32[((ptr) >> 2)] = num;
  var lower = HEAPU32[((ptr) >> 2)];
  HEAPU32[(((ptr) + (4)) >> 2)] = (num - lower) / 4294967296;
  var deserialized = (num >= 0) ? readI53FromU64(ptr) : readI53FromI64(ptr);
  var offset = ((ptr) >> 2);
  if (deserialized != num) warnOnce(`writeI53ToI64() out of range: serialized JS Number ${num} to Wasm heap as bytes lo=${ptrToString(HEAPU32[offset])}, hi=${ptrToString(HEAPU32[offset + 1])}, which deserializes back to ${deserialized} instead!`);
};

var emscriptenWebGLGet = (name_, p, type) => {
  // Guard against user passing a null pointer.
  // Note that GLES2 spec does not say anything about how passing a null
  // pointer should be treated.  Testing on desktop core GL 3, the application
  // crashes on glGetIntegerv to a null pointer, but better to report an error
  // instead of doing anything random.
  if (!p) {
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  var ret = undefined;
  switch (name_) { // Handle a few trivial GLES values
    case 0x8DFA: // GL_SHADER_COMPILER
      ret = 1;
      break;
    case 0x8DF8: // GL_SHADER_BINARY_FORMATS
      if (type != 0 && type != 1) {
        GL.recordError(0x500); // GL_INVALID_ENUM
      }
      // Do not write anything to the out pointer, since no binary formats are
      // supported.
      return;
    case 0x87FE: // GL_NUM_PROGRAM_BINARY_FORMATS
    case 0x8DF9: // GL_NUM_SHADER_BINARY_FORMATS
      ret = 0;
      break;
    case 0x86A2: // GL_NUM_COMPRESSED_TEXTURE_FORMATS
      // WebGL doesn't have GL_NUM_COMPRESSED_TEXTURE_FORMATS (it's obsolete
      // since GL_COMPRESSED_TEXTURE_FORMATS returns a JS array that can be
      // queried for length), so implement it ourselves to allow C++ GLES2
      // code get the length.
      var formats = GLctx.getParameter(0x86A3 /*GL_COMPRESSED_TEXTURE_FORMATS*/);
      ret = formats ? formats.length : 0;
      break;

    case 0x821D: // GL_NUM_EXTENSIONS
      if (GL.currentContext.version < 2) {
        // Calling GLES3/WebGL2 function with a GLES2/WebGL1 context
        GL.recordError(0x502 /* GL_INVALID_OPERATION */);
        return;
      }
      // .getSupportedExtensions() can return null if context is lost, so coerce to empty array.
      var exts = GLctx.getSupportedExtensions() || [];
      // each extension is duplicated, first in unprefixed WebGL form, and
      // then a second time with "GL_" prefix.
      ret = 2 * exts.length;
      break;
    case 0x821B: // GL_MAJOR_VERSION
    case 0x821C: // GL_MINOR_VERSION
      if (GL.currentContext.version < 2) {
        GL.recordError(0x500); // GL_INVALID_ENUM
        return;
      }
      ret = name_ == 0x821B ? 3 : 0; // return version 3.0
      break;
  }

  if (ret === undefined) {
    var result = GLctx.getParameter(name_);
    switch (typeof result) {
      case "number":
        ret = result;
        break;
      case "boolean":
        ret = result ? 1 : 0;
        break;
      case "string":
        GL.recordError(0x500); // GL_INVALID_ENUM
        return;
      case "object":
        if (result === null) {
          // null is a valid result for some (e.g., which buffer is bound -
          // perhaps nothing is bound), but otherwise can mean an invalid
          // name_, which we need to report as an error
          switch (name_) {
            case 0x8894: // ARRAY_BUFFER_BINDING
            case 0x8B8D: // CURRENT_PROGRAM
            case 0x8895: // ELEMENT_ARRAY_BUFFER_BINDING
            case 0x8CA6: // FRAMEBUFFER_BINDING or DRAW_FRAMEBUFFER_BINDING
            case 0x8CA7: // RENDERBUFFER_BINDING
            case 0x8069: // TEXTURE_BINDING_2D
            case 0x85B5: // WebGL 2 GL_VERTEX_ARRAY_BINDING, or WebGL 1 extension OES_vertex_array_object GL_VERTEX_ARRAY_BINDING_OES
            case 0x8F36: // COPY_READ_BUFFER_BINDING or COPY_READ_BUFFER
            case 0x8F37: // COPY_WRITE_BUFFER_BINDING or COPY_WRITE_BUFFER
            case 0x88ED: // PIXEL_PACK_BUFFER_BINDING
            case 0x88EF: // PIXEL_UNPACK_BUFFER_BINDING
            case 0x8CAA: // READ_FRAMEBUFFER_BINDING
            case 0x8919: // SAMPLER_BINDING
            case 0x8C1D: // TEXTURE_BINDING_2D_ARRAY
            case 0x806A: // TEXTURE_BINDING_3D
            case 0x8E25: // TRANSFORM_FEEDBACK_BINDING
            case 0x8C8F: // TRANSFORM_FEEDBACK_BUFFER_BINDING
            case 0x8A28: // UNIFORM_BUFFER_BINDING
            case 0x8514: { // TEXTURE_BINDING_CUBE_MAP
              ret = 0;
              break;
            }
            default: {
              GL.recordError(0x500); // GL_INVALID_ENUM
              return;
            }
          }
        } else if (result instanceof Float32Array ||
          result instanceof Uint32Array ||
          result instanceof Int32Array ||
          result instanceof Array) {
          for (var i = 0; i < result.length; ++i) {
            switch (type) {
              case 0: HEAP32[(((p) + (i * 4)) >> 2)] = result[i]; break;
              case 2: HEAPF32[(((p) + (i * 4)) >> 2)] = result[i]; break;
              case 4: HEAP8[(((p) + (i)) >> 0)] = result[i] ? 1 : 0; break;
            }
          }
          return;
        } else {
          try {
            ret = result.name | 0;
          } catch (e) {
            GL.recordError(0x500); // GL_INVALID_ENUM
            err(`GL_INVALID_ENUM in glGet${type}v: Unknown object returned from WebGL getParameter(${name_})! (error: ${e})`);
            return;
          }
        }
        break;
      default:
        GL.recordError(0x500); // GL_INVALID_ENUM
        err(`GL_INVALID_ENUM in glGet${type}v: Native code calling glGet${type}v(${name_}) and it returns ${result} of type ${typeof (result)}!`);
        return;
    }
  }

  switch (type) {
    case 1: writeI53ToI64(p, ret); break;
    case 0: HEAP32[((p) >> 2)] = ret; break;
    case 2: HEAPF32[((p) >> 2)] = ret; break;
    case 4: HEAP8[((p) >> 0)] = ret ? 1 : 0; break;
  }
};

var _glGetBooleanv = (name_, p) => emscriptenWebGLGet(name_, p, 4);


var _glGetIntegerv = (name_, p) => emscriptenWebGLGet(name_, p, 0);


var _glGetString = (name_) => {
  var ret = GL.stringCache[name_];
  if (!ret) {
    switch (name_) {
      case 0x1F03 /* GL_EXTENSIONS */:
        ret = stringToNewUTF8(GL.getExtensions().join(' '));
        break;
      case 0x1F00 /* GL_VENDOR */:
      case 0x1F01 /* GL_RENDERER */:
      case 0x9245 /* UNMASKED_VENDOR_WEBGL */:
      case 0x9246 /* UNMASKED_RENDERER_WEBGL */:
        var s = GLctx.getParameter(name_);
        if (!s) {
          GL.recordError(0x500/*GL_INVALID_ENUM*/);
        }
        ret = s ? stringToNewUTF8(s) : 0;
        break;

      case 0x1F02 /* GL_VERSION */:
        var glVersion = GLctx.getParameter(0x1F02 /*GL_VERSION*/);
        // return GLES version string corresponding to the version of the WebGL context
        if (GL.currentContext.version >= 2) glVersion = `OpenGL ES 3.0 (${glVersion})`;
        else {
          glVersion = `OpenGL ES 2.0 (${glVersion})`;
        }
        ret = stringToNewUTF8(glVersion);
        break;
      case 0x8B8C /* GL_SHADING_LANGUAGE_VERSION */:
        var glslVersion = GLctx.getParameter(0x8B8C /*GL_SHADING_LANGUAGE_VERSION*/);
        // extract the version number 'N.M' from the string 'WebGL GLSL ES N.M ...'
        var ver_re = /^WebGL GLSL ES ([0-9]\.[0-9][0-9]?)(?:$| .*)/;
        var ver_num = glslVersion.match(ver_re);
        if (ver_num !== null) {
          if (ver_num[1].length == 3) ver_num[1] = ver_num[1] + '0'; // ensure minor version has 2 digits
          glslVersion = `OpenGL ES GLSL ES ${ver_num[1]} (${glslVersion})`;
        }
        ret = stringToNewUTF8(glslVersion);
        break;
      default:
        GL.recordError(0x500/*GL_INVALID_ENUM*/);
      // fall through
    }
    GL.stringCache[name_] = ret;
  }
  return ret;
};

var _glCreateShader = (shaderType) => {
  var id = GL.getNewId(GL.shaders);
  GL.shaders[id] = GLctx.createShader(shaderType);

  return id;
};

var _glShaderSource = (shader, count, string, length) => {
  var source = GL.getSource(shader, count, string, length);

  GLctx.shaderSource(GL.shaders[shader], source);
};

var _glCompileShader = (shader) => {
  GLctx.compileShader(GL.shaders[shader]);
};


var _glDetachShader = (program, shader) => {
  GLctx.detachShader(GL.programs[program], GL.shaders[shader]);
};

var _glUseProgram = (program) => {
  program = GL.programs[program];
  GLctx.useProgram(program);
  // Record the currently active program so that we can access the uniform
  // mapping table of that program.
  GLctx.currentProgram = program;
};

var _glDeleteProgram = (id) => {
  if (!id) return;
  var program = GL.programs[id];
  if (!program) {
    // glDeleteProgram actually signals an error when deleting a nonexisting
    // object, unlike some other GL delete functions.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  GLctx.deleteProgram(program);
  program.name = 0;
  GL.programs[id] = null;
};


var _glBindAttribLocation = (program, index, name) => {
  GLctx.bindAttribLocation(GL.programs[program], index, UTF8ToString(name));
};

var _glLinkProgram = (program) => {
  program = GL.programs[program];
  GLctx.linkProgram(program);
  // Invalidate earlier computed uniform->ID mappings, those have now become stale
  program.uniformLocsById = 0; // Mark as null-like so that glGetUniformLocation() knows to populate this again.
  program.uniformSizeAndIdsByName = {};

};

var _glBindBuffer = (target, buffer) => {
  if (target == 0x8892 /*GL_ARRAY_BUFFER*/) {
    GLctx.currentArrayBufferBinding = buffer;
    GLImmediate.lastArrayBuffer = buffer;
  } else if (target == 0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/) {
    GLctx.currentElementArrayBufferBinding = buffer;
  }

  if (target == 0x88EB /*GL_PIXEL_PACK_BUFFER*/) {
    // In WebGL 2 glReadPixels entry point, we need to use a different WebGL 2
    // API function call when a buffer is bound to
    // GL_PIXEL_PACK_BUFFER_BINDING point, so must keep track whether that
    // binding point is non-null to know what is the proper API function to
    // call.
    GLctx.currentPixelPackBufferBinding = buffer;
  } else if (target == 0x88EC /*GL_PIXEL_UNPACK_BUFFER*/) {
    // In WebGL 2 gl(Compressed)Tex(Sub)Image[23]D entry points, we need to
    // use a different WebGL 2 API function call when a buffer is bound to
    // GL_PIXEL_UNPACK_BUFFER_BINDING point, so must keep track whether that
    // binding point is non-null to know what is the proper API function to
    // call.
    GLctx.currentPixelUnpackBufferBinding = buffer;
  }
  GLctx.bindBuffer(target, GL.buffers[buffer]);
};


var _glGetFloatv = (name_, p) => emscriptenWebGLGet(name_, p, 2);

function _glHint(x0, x1) { GLctx.hint(x0, x1) }

var _glEnableVertexAttribArray = (index) => {
  GLctx.enableVertexAttribArray(index);
};

var _glDisableVertexAttribArray = (index) => {
  GLctx.disableVertexAttribArray(index);
};

var _glVertexAttribPointer = (index, size, type, normalized, stride, ptr) => {
  GLctx.vertexAttribPointer(index, size, type, !!normalized, stride, ptr);
};



var GLEmulation = {
  fogStart: 0,
  fogEnd: 1,
  fogDensity: 1,
  fogColor: null,
  fogMode: 2048,
  fogEnabled: false,
  MAX_CLIP_PLANES: 6,
  clipPlaneEnabled: [false, false, false, false, false, false],
  clipPlaneEquation: [],
  lightingEnabled: false,
  lightModelAmbient: null,
  lightModelLocalViewer: false,
  lightModelTwoSide: false,
  materialAmbient: null,
  materialDiffuse: null,
  materialSpecular: null,
  materialShininess: null,
  materialEmission: null,
  MAX_LIGHTS: 8,
  lightEnabled: [false, false, false, false, false, false, false, false],
  lightAmbient: [],
  lightDiffuse: [],
  lightSpecular: [],
  lightPosition: [],
  alphaTestEnabled: false,
  alphaTestFunc: 519,
  alphaTestRef: 0,
  pointSize: 1,
  vaos: [],
  currentVao: null,
  enabledVertexAttribArrays: {
  },
  hasRunInit: false,
  findToken(source, token) {
    function isIdentChar(ch) {
      if (ch >= 48 && ch <= 57) // 0-9
        return true;
      if (ch >= 65 && ch <= 90) // A-Z
        return true;
      if (ch >= 97 && ch <= 122) // a-z
        return true;
      return false;
    }
    var i = -1;
    do {
      i = source.indexOf(token, i + 1);
      if (i < 0) {
        break;
      }
      if (i > 0 && isIdentChar(source[i - 1])) {
        continue;
      }
      i += token.length;
      if (i < source.length - 1 && isIdentChar(source[i + 1])) {
        continue;
      }
      return true;
    } while (true);
    return false;
  },
  init() {
    // Do not activate immediate/emulation code (e.g. replace glDrawElements) when in FULL_ES2 mode.
    // We do not need full emulation, we instead emulate client-side arrays etc. in FULL_ES2 code in
    // a straightforward manner, and avoid not having a bound buffer be ambiguous between es2 emulation
    // code and legacy gl emulation code.

    if (GLEmulation.hasRunInit) {
      return;
    }
    GLEmulation.hasRunInit = true;

    GLEmulation.fogColor = new Float32Array(4);

    for (var clipPlaneId = 0; clipPlaneId < GLEmulation.MAX_CLIP_PLANES; clipPlaneId++) {
      GLEmulation.clipPlaneEquation[clipPlaneId] = new Float32Array(4);
    }

    // set defaults for GL_LIGHTING
    GLEmulation.lightModelAmbient = new Float32Array([0.2, 0.2, 0.2, 1.0]);
    GLEmulation.materialAmbient = new Float32Array([0.2, 0.2, 0.2, 1.0]);
    GLEmulation.materialDiffuse = new Float32Array([0.8, 0.8, 0.8, 1.0]);
    GLEmulation.materialSpecular = new Float32Array([0.0, 0.0, 0.0, 1.0]);
    GLEmulation.materialShininess = new Float32Array([0.0]);
    GLEmulation.materialEmission = new Float32Array([0.0, 0.0, 0.0, 1.0]);

    for (var lightId = 0; lightId < GLEmulation.MAX_LIGHTS; lightId++) {
      GLEmulation.lightAmbient[lightId] = new Float32Array([0.0, 0.0, 0.0, 1.0]);
      GLEmulation.lightDiffuse[lightId] = lightId ? new Float32Array([0.0, 0.0, 0.0, 1.0]) : new Float32Array([1.0, 1.0, 1.0, 1.0]);
      GLEmulation.lightSpecular[lightId] = lightId ? new Float32Array([0.0, 0.0, 0.0, 1.0]) : new Float32Array([1.0, 1.0, 1.0, 1.0]);
      GLEmulation.lightPosition[lightId] = new Float32Array([0.0, 0.0, 1.0, 0.0]);
    }

    // Add some emulation workarounds
    err('WARNING: using emscripten GL emulation. This is a collection of limited workarounds, do not expect it to work.');
    err('WARNING: using emscripten GL emulation unsafe opts. If weirdness happens, try -sGL_UNSAFE_OPTS=0');

    // XXX some of the capabilities we don't support may lead to incorrect rendering, if we do not emulate them in shaders
    var validCapabilities = {
      0xB44: 1, // GL_CULL_FACE
      0xBE2: 1, // GL_BLEND
      0xBD0: 1, // GL_DITHER,
      0xB90: 1, // GL_STENCIL_TEST
      0xB71: 1, // GL_DEPTH_TEST
      0xC11: 1, // GL_SCISSOR_TEST
      0x8037: 1, // GL_POLYGON_OFFSET_FILL
      0x809E: 1, // GL_SAMPLE_ALPHA_TO_COVERAGE
      0x80A0: 1  // GL_SAMPLE_COVERAGE
    };

    var glEnable = _glEnable;
    _glEnable = _emscripten_glEnable = (cap) => {
      // Clean up the renderer on any change to the rendering state. The optimization of
      // skipping renderer setup is aimed at the case of multiple glDraw* right after each other
      GLImmediate.lastRenderer?.cleanup();
      if (cap == 0xB60 /* GL_FOG */) {
        if (GLEmulation.fogEnabled != true) {
          GLImmediate.currentRenderer = null; // Fog parameter is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.fogEnabled = true;
        }
        return;
      } else if ((cap >= 0x3000) && (cap < 0x3006)  /* GL_CLIP_PLANE0 to GL_CLIP_PLANE5 */) {
        var clipPlaneId = cap - 0x3000;
        if (GLEmulation.clipPlaneEnabled[clipPlaneId] != true) {
          GLImmediate.currentRenderer = null; // clip plane parameter is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.clipPlaneEnabled[clipPlaneId] = true;
        }
        return;
      } else if ((cap >= 0x4000) && (cap < 0x4008)  /* GL_LIGHT0 to GL_LIGHT7 */) {
        var lightId = cap - 0x4000;
        if (GLEmulation.lightEnabled[lightId] != true) {
          GLImmediate.currentRenderer = null; // light parameter is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.lightEnabled[lightId] = true;
        }
        return;
      } else if (cap == 0xB50 /* GL_LIGHTING */) {
        if (GLEmulation.lightingEnabled != true) {
          GLImmediate.currentRenderer = null; // light parameter is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.lightingEnabled = true;
        }
        return;
      } else if (cap == 0xBC0 /* GL_ALPHA_TEST */) {
        if (GLEmulation.alphaTestEnabled != true) {
          GLImmediate.currentRenderer = null; // alpha testing is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.alphaTestEnabled = true;
        }
        return;
      } else if (cap == 0xDE1 /* GL_TEXTURE_2D */) {
        // XXX not according to spec, and not in desktop GL, but works in some GLES1.x apparently, so support
        // it by forwarding to glEnableClientState
        /* Actually, let's not, for now. (This sounds exceedingly broken)
         * This is in gl_ps_workaround2.c.
        _glEnableClientState(cap);
        */
        return;
      } else if (!(cap in validCapabilities)) {
        return;
      }
      glEnable(cap);
    };

    var glDisable = _glDisable;
    _glDisable = _emscripten_glDisable = (cap) => {
      GLImmediate.lastRenderer?.cleanup();
      if (cap == 0xB60 /* GL_FOG */) {
        if (GLEmulation.fogEnabled != false) {
          GLImmediate.currentRenderer = null; // Fog parameter is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.fogEnabled = false;
        }
        return;
      } else if ((cap >= 0x3000) && (cap < 0x3006)  /* GL_CLIP_PLANE0 to GL_CLIP_PLANE5 */) {
        var clipPlaneId = cap - 0x3000;
        if (GLEmulation.clipPlaneEnabled[clipPlaneId] != false) {
          GLImmediate.currentRenderer = null; // clip plane parameter is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.clipPlaneEnabled[clipPlaneId] = false;
        }
        return;
      } else if ((cap >= 0x4000) && (cap < 0x4008)  /* GL_LIGHT0 to GL_LIGHT7 */) {
        var lightId = cap - 0x4000;
        if (GLEmulation.lightEnabled[lightId] != false) {
          GLImmediate.currentRenderer = null; // light parameter is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.lightEnabled[lightId] = false;
        }
        return;
      } else if (cap == 0xB50 /* GL_LIGHTING */) {
        if (GLEmulation.lightingEnabled != false) {
          GLImmediate.currentRenderer = null; // light parameter is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.lightingEnabled = false;
        }
        return;
      } else if (cap == 0xBC0 /* GL_ALPHA_TEST */) {
        if (GLEmulation.alphaTestEnabled != false) {
          GLImmediate.currentRenderer = null; // alpha testing is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.alphaTestEnabled = false;
        }
        return;
      } else if (cap == 0xDE1 /* GL_TEXTURE_2D */) {
        // XXX not according to spec, and not in desktop GL, but works in some GLES1.x apparently, so support
        // it by forwarding to glDisableClientState
        /* Actually, let's not, for now. (This sounds exceedingly broken)
         * This is in gl_ps_workaround2.c.
        _glDisableClientState(cap);
        */
        return;
      } else if (!(cap in validCapabilities)) {
        return;
      }
      glDisable(cap);
    };

    _glIsEnabled = _emscripten_glIsEnabled = (cap) => {
      if (cap == 0xB60 /* GL_FOG */) {
        return GLEmulation.fogEnabled ? 1 : 0;
      } else if ((cap >= 0x3000) && (cap < 0x3006)  /* GL_CLIP_PLANE0 to GL_CLIP_PLANE5 */) {
        var clipPlaneId = cap - 0x3000;
        return GLEmulation.clipPlaneEnabled[clipPlaneId] ? 1 : 0;
      } else if ((cap >= 0x4000) && (cap < 0x4008)  /* GL_LIGHT0 to GL_LIGHT7 */) {
        var lightId = cap - 0x4000;
        return GLEmulation.lightEnabled[lightId] ? 1 : 0;
      } else if (cap == 0xB50 /* GL_LIGHTING */) {
        return GLEmulation.lightingEnabled ? 1 : 0;
      } else if (cap == 0xBC0 /* GL_ALPHA_TEST */) {
        return GLEmulation.alphaTestEnabled ? 1 : 0;
      } else if (!(cap in validCapabilities)) {
        return 0;
      }
      return GLctx.isEnabled(cap);
    };

    var glGetBooleanv = _glGetBooleanv;
    _glGetBooleanv = _emscripten_glGetBooleanv = (pname, p) => {
      var attrib = GLEmulation.getAttributeFromCapability(pname);
      if (attrib !== null) {
        var result = GLImmediate.enabledClientAttributes[attrib];
        HEAP8[((p) >> 0)] = result === true ? 1 : 0;
        return;
      }
      glGetBooleanv(pname, p);
    };

    var glGetIntegerv = _glGetIntegerv;
    _glGetIntegerv = _emscripten_glGetIntegerv = (pname, params) => {
      switch (pname) {
        case 0x84E2: pname = GLctx.MAX_TEXTURE_IMAGE_UNITS /* fake it */; break; // GL_MAX_TEXTURE_UNITS
        case 0x8B4A: { // GL_MAX_VERTEX_UNIFORM_COMPONENTS_ARB
          var result = GLctx.getParameter(GLctx.MAX_VERTEX_UNIFORM_VECTORS);
          HEAP32[((params) >> 2)] = result * 4; // GLES gives num of 4-element vectors, GL wants individual components, so multiply
          return;
        }
        case 0x8B49: { // GL_MAX_FRAGMENT_UNIFORM_COMPONENTS_ARB
          var result = GLctx.getParameter(GLctx.MAX_FRAGMENT_UNIFORM_VECTORS);
          HEAP32[((params) >> 2)] = result * 4; // GLES gives num of 4-element vectors, GL wants individual components, so multiply
          return;
        }
        case 0x8B4B: { // GL_MAX_VARYING_FLOATS_ARB
          var result = GLctx.getParameter(GLctx.MAX_VARYING_VECTORS);
          HEAP32[((params) >> 2)] = result * 4; // GLES gives num of 4-element vectors, GL wants individual components, so multiply
          return;
        }
        case 0x8871: pname = GLctx.MAX_COMBINED_TEXTURE_IMAGE_UNITS /* close enough */; break; // GL_MAX_TEXTURE_COORDS
        case 0x807A: { // GL_VERTEX_ARRAY_SIZE
          var attribute = GLImmediate.clientAttributes[GLImmediate.VERTEX];
          HEAP32[((params) >> 2)] = attribute ? attribute.size : 0;
          return;
        }
        case 0x807B: { // GL_VERTEX_ARRAY_TYPE
          var attribute = GLImmediate.clientAttributes[GLImmediate.VERTEX];
          HEAP32[((params) >> 2)] = attribute ? attribute.type : 0;
          return;
        }
        case 0x807C: { // GL_VERTEX_ARRAY_STRIDE
          var attribute = GLImmediate.clientAttributes[GLImmediate.VERTEX];
          HEAP32[((params) >> 2)] = attribute ? attribute.stride : 0;
          return;
        }
        case 0x8081: { // GL_COLOR_ARRAY_SIZE
          var attribute = GLImmediate.clientAttributes[GLImmediate.COLOR];
          HEAP32[((params) >> 2)] = attribute ? attribute.size : 0;
          return;
        }
        case 0x8082: { // GL_COLOR_ARRAY_TYPE
          var attribute = GLImmediate.clientAttributes[GLImmediate.COLOR];
          HEAP32[((params) >> 2)] = attribute ? attribute.type : 0;
          return;
        }
        case 0x8083: { // GL_COLOR_ARRAY_STRIDE
          var attribute = GLImmediate.clientAttributes[GLImmediate.COLOR];
          HEAP32[((params) >> 2)] = attribute ? attribute.stride : 0;
          return;
        }
        case 0x8088: { // GL_TEXTURE_COORD_ARRAY_SIZE
          var attribute = GLImmediate.clientAttributes[GLImmediate.TEXTURE0 + GLImmediate.clientActiveTexture];
          HEAP32[((params) >> 2)] = attribute ? attribute.size : 0;
          return;
        }
        case 0x8089: { // GL_TEXTURE_COORD_ARRAY_TYPE
          var attribute = GLImmediate.clientAttributes[GLImmediate.TEXTURE0 + GLImmediate.clientActiveTexture];
          HEAP32[((params) >> 2)] = attribute ? attribute.type : 0;
          return;
        }
        case 0x808A: { // GL_TEXTURE_COORD_ARRAY_STRIDE
          var attribute = GLImmediate.clientAttributes[GLImmediate.TEXTURE0 + GLImmediate.clientActiveTexture];
          HEAP32[((params) >> 2)] = attribute ? attribute.stride : 0;
          return;
        }
        case 0x0D32: { // GL_MAX_CLIP_PLANES
          HEAP32[((params) >> 2)] = GLEmulation.MAX_CLIP_PLANES; // all implementations need to support atleast 6
          return;
        }
        case 0x0BA0: { // GL_MATRIX_MODE
          HEAP32[((params) >> 2)] = GLImmediate.currentMatrix + 0x1700;
          return;
        }
        case 0x0BC1: { // GL_ALPHA_TEST_FUNC
          HEAP32[((params) >> 2)] = GLEmulation.alphaTestFunc;
          return;
        }
      }
      glGetIntegerv(pname, params);
    };

    var glGetString = _glGetString;
    _glGetString = _emscripten_glGetString = (name_) => {
      if (GL.stringCache[name_]) return GL.stringCache[name_];
      switch (name_) {
        case 0x1F03 /* GL_EXTENSIONS */: // Add various extensions that we can support
          var ret = stringToNewUTF8((GLctx.getSupportedExtensions() || []).join(' ') +
            ' GL_EXT_texture_env_combine GL_ARB_texture_env_crossbar GL_ATI_texture_env_combine3 GL_NV_texture_env_combine4 GL_EXT_texture_env_dot3 GL_ARB_multitexture GL_ARB_vertex_buffer_object GL_EXT_framebuffer_object GL_ARB_vertex_program GL_ARB_fragment_program GL_ARB_shading_language_100 GL_ARB_shader_objects GL_ARB_vertex_shader GL_ARB_fragment_shader GL_ARB_texture_cube_map GL_EXT_draw_range_elements' +
            (GL.currentContext.compressionExt ? ' GL_ARB_texture_compression GL_EXT_texture_compression_s3tc' : '') +
            (GL.currentContext.anisotropicExt ? ' GL_EXT_texture_filter_anisotropic' : '')
          );
          return GL.stringCache[name_] = ret;
      }
      return glGetString(name_);
    };

    // Do some automatic rewriting to work around GLSL differences. Note that this must be done in
    // tandem with the rest of the program, by itself it cannot suffice.
    // Note that we need to remember shader types for this rewriting, saving sources makes it easier to debug.
    GL.shaderInfos = {};
    var glCreateShader = _glCreateShader;
    _glCreateShader = _emscripten_glCreateShader = (shaderType) => {
      var id = glCreateShader(shaderType);
      GL.shaderInfos[id] = {
        type: shaderType,
        ftransform: false
      };
      return id;
    };

    function ensurePrecision(source) {
      if (!/precision +(low|medium|high)p +float *;/.test(source)) {
        source = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n' + source;
      }
      return source;
    }

    var glShaderSource = _glShaderSource;
    _glShaderSource = _emscripten_glShaderSource = (shader, count, string, length) => {
      var source = GL.getSource(shader, count, string, length);
      // XXX We add attributes and uniforms to shaders. The program can ask for the # of them, and see the
      // ones we generated, potentially confusing it? Perhaps we should hide them.
      if (GL.shaderInfos[shader].type == GLctx.VERTEX_SHADER) {
        // Replace ftransform() with explicit project/modelview transforms, and add position and matrix info.
        var has_pm = source.search(/u_projection/) >= 0;
        var has_mm = source.search(/u_modelView/) >= 0;
        var has_pv = source.search(/a_position/) >= 0;
        var need_pm = 0, need_mm = 0, need_pv = 0;
        var old = source;
        source = source.replace(/ftransform\(\)/g, '(u_projection * u_modelView * a_position)');
        if (old != source) need_pm = need_mm = need_pv = 1;
        old = source;
        source = source.replace(/gl_ProjectionMatrix/g, 'u_projection');
        if (old != source) need_pm = 1;
        old = source;
        source = source.replace(/gl_ModelViewMatrixTranspose\[2\]/g, 'vec4(u_modelView[0][2], u_modelView[1][2], u_modelView[2][2], u_modelView[3][2])'); // XXX extremely inefficient
        if (old != source) need_mm = 1;
        old = source;
        source = source.replace(/gl_ModelViewMatrix/g, 'u_modelView');
        if (old != source) need_mm = 1;
        old = source;
        source = source.replace(/gl_Vertex/g, 'a_position');
        if (old != source) need_pv = 1;
        old = source;
        source = source.replace(/gl_ModelViewProjectionMatrix/g, '(u_projection * u_modelView)');
        if (old != source) need_pm = need_mm = 1;
        if (need_pv && !has_pv) source = 'attribute vec4 a_position; \n' + source;
        if (need_mm && !has_mm) source = 'uniform mat4 u_modelView; \n' + source;
        if (need_pm && !has_pm) source = 'uniform mat4 u_projection; \n' + source;
        GL.shaderInfos[shader].ftransform = need_pm || need_mm || need_pv; // we will need to provide the fixed function stuff as attributes and uniforms
        for (var i = 0; i < GLImmediate.MAX_TEXTURES; i++) {
          // XXX To handle both regular texture mapping and cube mapping, we use vec4 for tex coordinates.
          old = source;
          var need_vtc = source.search(`v_texCoord${i}`) == -1;
          source = source.replace(new RegExp(`gl_TexCoord\\[${i}\\]`, 'g'), `v_texCoord${i}`)
            .replace(new RegExp(`gl_MultiTexCoord${i}`, 'g'), `a_texCoord${i}`);
          if (source != old) {
            source = `attribute vec4 a_texCoord${i}; \n${source}`;
            if (need_vtc) {
              source = `varying vec4 v_texCoord${i};   \n${source}`;
            }
          }

          old = source;
          source = source.replace(new RegExp(`gl_TextureMatrix\\[${i}\\]`, 'g'), `u_textureMatrix${i}`);
          if (source != old) {
            source = `uniform mat4 u_textureMatrix${i}; \n${source}`;
          }
        }
        if (source.includes('gl_FrontColor')) {
          source = 'varying vec4 v_color; \n' +
            source.replace(/gl_FrontColor/g, 'v_color');
        }
        if (source.includes('gl_Color')) {
          source = 'attribute vec4 a_color; \n' +
            source.replace(/gl_Color/g, 'a_color');
        }
        if (source.includes('gl_Normal')) {
          source = 'attribute vec3 a_normal; \n' +
            source.replace(/gl_Normal/g, 'a_normal');
        }
        // fog
        if (source.includes('gl_FogFragCoord')) {
          source = 'varying float v_fogFragCoord;   \n' +
            source.replace(/gl_FogFragCoord/g, 'v_fogFragCoord');
        }
      } else { // Fragment shader
        for (i = 0; i < GLImmediate.MAX_TEXTURES; i++) {
          old = source;
          source = source.replace(new RegExp(`gl_TexCoord\\[${i}\\]`, 'g'), `v_texCoord${i}`);
          if (source != old) {
            source = 'varying vec4 v_texCoord' + i + ';   \n' + source;
          }
        }
        if (source.includes('gl_Color')) {
          source = 'varying vec4 v_color; \n' + source.replace(/gl_Color/g, 'v_color');
        }
        if (source.includes('gl_Fog.color')) {
          source = 'uniform vec4 u_fogColor;   \n' +
            source.replace(/gl_Fog.color/g, 'u_fogColor');
        }
        if (source.includes('gl_Fog.end')) {
          source = 'uniform float u_fogEnd;   \n' +
            source.replace(/gl_Fog.end/g, 'u_fogEnd');
        }
        if (source.includes('gl_Fog.scale')) {
          source = 'uniform float u_fogScale;   \n' +
            source.replace(/gl_Fog.scale/g, 'u_fogScale');
        }
        if (source.includes('gl_Fog.density')) {
          source = 'uniform float u_fogDensity;   \n' +
            source.replace(/gl_Fog.density/g, 'u_fogDensity');
        }
        if (source.includes('gl_FogFragCoord')) {
          source = 'varying float v_fogFragCoord;   \n' +
            source.replace(/gl_FogFragCoord/g, 'v_fogFragCoord');
        }
        source = ensurePrecision(source);
      }
      GLctx.shaderSource(GL.shaders[shader], source);
    };

    var glCompileShader = _glCompileShader;
    _glCompileShader = _emscripten_glCompileShader = (shader) => {
      GLctx.compileShader(GL.shaders[shader]);
    };

    GL.programShaders = {};
    var glAttachShader = _glAttachShader;
    _glAttachShader = _emscripten_glAttachShader = (program, shader) => {
      GL.programShaders[program] ||= [];
      GL.programShaders[program].push(shader);
      glAttachShader(program, shader);
    };

    var glDetachShader = _glDetachShader;
    _glDetachShader = _emscripten_glDetachShader = (program, shader) => {
      var programShader = GL.programShaders[program];
      if (!programShader) {
        err(`WARNING: _glDetachShader received invalid program: ${program}`);
        return;
      }
      var index = programShader.indexOf(shader);
      programShader.splice(index, 1);
      glDetachShader(program, shader);
    };

    var glUseProgram = _glUseProgram;
    _glUseProgram = _emscripten_glUseProgram = (program) => {
      if (GL.currProgram != program) {
        GLImmediate.currentRenderer = null; // This changes the FFP emulation shader program, need to recompute that.
        GL.currProgram = program;
        GLImmediate.fixedFunctionProgram = 0;
        glUseProgram(program);
      }
    }

    var glDeleteProgram = _glDeleteProgram;
    _glDeleteProgram = _emscripten_glDeleteProgram = (program) => {
      glDeleteProgram(program);
      if (program == GL.currProgram) {
        GLImmediate.currentRenderer = null; // This changes the FFP emulation shader program, need to recompute that.
        GL.currProgram = 0;
      }
    };

    // If attribute 0 was not bound, bind it to 0 for WebGL performance reasons. Track if 0 is free for that.
    var zeroUsedPrograms = {};
    var glBindAttribLocation = _glBindAttribLocation;
    _glBindAttribLocation = _emscripten_glBindAttribLocation = (program, index, name) => {
      if (index == 0) zeroUsedPrograms[program] = true;
      glBindAttribLocation(program, index, name);
    };

    var glLinkProgram = _glLinkProgram;
    _glLinkProgram = _emscripten_glLinkProgram = (program) => {
      if (!(program in zeroUsedPrograms)) {
        GLctx.bindAttribLocation(GL.programs[program], 0, 'a_position');
      }
      glLinkProgram(program);
    };

    var glBindBuffer = _glBindBuffer;
    _glBindBuffer = _emscripten_glBindBuffer = (target, buffer) => {
      glBindBuffer(target, buffer);
      if (target == GLctx.ARRAY_BUFFER) {
        if (GLEmulation.currentVao) {
          assert(GLEmulation.currentVao.arrayBuffer == buffer || GLEmulation.currentVao.arrayBuffer == 0 || buffer == 0, 'TODO: support for multiple array buffers in vao');
          GLEmulation.currentVao.arrayBuffer = buffer;
        }
      } else if (target == GLctx.ELEMENT_ARRAY_BUFFER) {
        if (GLEmulation.currentVao) GLEmulation.currentVao.elementArrayBuffer = buffer;
      }
    };

    var glGetFloatv = _glGetFloatv;
    _glGetFloatv = _emscripten_glGetFloatv = (pname, params) => {
      if (pname == 0xBA6) { // GL_MODELVIEW_MATRIX
        HEAPF32.set(GLImmediate.matrix[0/*m*/], params >> 2);
      } else if (pname == 0xBA7) { // GL_PROJECTION_MATRIX
        HEAPF32.set(GLImmediate.matrix[1/*p*/], params >> 2);
      } else if (pname == 0xBA8) { // GL_TEXTURE_MATRIX
        HEAPF32.set(GLImmediate.matrix[2/*t*/ + GLImmediate.clientActiveTexture], params >> 2);
      } else if (pname == 0xB66) { // GL_FOG_COLOR
        HEAPF32.set(GLEmulation.fogColor, params >> 2);
      } else if (pname == 0xB63) { // GL_FOG_START
        HEAPF32[((params) >> 2)] = GLEmulation.fogStart;
      } else if (pname == 0xB64) { // GL_FOG_END
        HEAPF32[((params) >> 2)] = GLEmulation.fogEnd;
      } else if (pname == 0xB62) { // GL_FOG_DENSITY
        HEAPF32[((params) >> 2)] = GLEmulation.fogDensity;
      } else if (pname == 0xB65) { // GL_FOG_MODE
        HEAPF32[((params) >> 2)] = GLEmulation.fogMode;
      } else if (pname == 0xB53) { // GL_LIGHT_MODEL_AMBIENT
        HEAPF32[((params) >> 2)] = GLEmulation.lightModelAmbient[0];
        HEAPF32[(((params) + (4)) >> 2)] = GLEmulation.lightModelAmbient[1];
        HEAPF32[(((params) + (8)) >> 2)] = GLEmulation.lightModelAmbient[2];
        HEAPF32[(((params) + (12)) >> 2)] = GLEmulation.lightModelAmbient[3];
      } else if (pname == 0xBC2) { // GL_ALPHA_TEST_REF
        HEAPF32[((params) >> 2)] = GLEmulation.alphaTestRef;
      } else {
        glGetFloatv(pname, params);
      }
    };

    var glHint = _glHint;
    _glHint = _emscripten_glHint = (target, mode) => {
      if (target == 0x84EF) { // GL_TEXTURE_COMPRESSION_HINT
        return;
      }
      glHint(target, mode);
    };

    var glEnableVertexAttribArray = _glEnableVertexAttribArray;
    _glEnableVertexAttribArray = _emscripten_glEnableVertexAttribArray = (index) => {
      glEnableVertexAttribArray(index);
      GLEmulation.enabledVertexAttribArrays[index] = 1;
      if (GLEmulation.currentVao) GLEmulation.currentVao.enabledVertexAttribArrays[index] = 1;
    };

    var glDisableVertexAttribArray = _glDisableVertexAttribArray;
    _glDisableVertexAttribArray = _emscripten_glDisableVertexAttribArray = (index) => {
      glDisableVertexAttribArray(index);
      delete GLEmulation.enabledVertexAttribArrays[index];
      if (GLEmulation.currentVao) delete GLEmulation.currentVao.enabledVertexAttribArrays[index];
    };

    var glVertexAttribPointer = _glVertexAttribPointer;
    _glVertexAttribPointer = _emscripten_glVertexAttribPointer = (index, size, type, normalized, stride, pointer) => {
      glVertexAttribPointer(index, size, type, normalized, stride, pointer);
      if (GLEmulation.currentVao) { // TODO: avoid object creation here? likely not hot though
        GLEmulation.currentVao.vertexAttribPointers[index] = [index, size, type, normalized, stride, pointer];
      }
    };
  },
  getAttributeFromCapability(cap) {
    var attrib = null;
    switch (cap) {
      case 0xDE1: // GL_TEXTURE_2D - XXX not according to spec, and not in desktop GL, but works in some GLES1.x apparently, so support it
        abort("GL_TEXTURE_2D is not a spec-defined capability for gl{Enable,Disable}ClientState.");
      // Fall through:
      case 0x8078: // GL_TEXTURE_COORD_ARRAY
        attrib = GLImmediate.TEXTURE0 + GLImmediate.clientActiveTexture; break;
      case 0x8074: // GL_VERTEX_ARRAY
        attrib = GLImmediate.VERTEX; break;
      case 0x8075: // GL_NORMAL_ARRAY
        attrib = GLImmediate.NORMAL; break;
      case 0x8076: // GL_COLOR_ARRAY
        attrib = GLImmediate.COLOR; break;
    }
    return attrib;
  },
};
var GLImmediate = {
  MapTreeLib: null,
  spawnMapTreeLib: () => {
    /**
     * A naive implementation of a map backed by an array, and accessed by
     * naive iteration along the array. (hashmap with only one bucket)
     * @constructor
     */
    function CNaiveListMap() {
      var list = [];

      this.insert = function CNaiveListMap_insert(key, val) {
        if (this.contains(key | 0)) return false;
        list.push([key, val]);
        return true;
      };

      var __contains_i;
      this.contains = function CNaiveListMap_contains(key) {
        for (__contains_i = 0; __contains_i < list.length; ++__contains_i) {
          if (list[__contains_i][0] === key) return true;
        }
        return false;
      };

      var __get_i;
      this.get = function CNaiveListMap_get(key) {
        for (__get_i = 0; __get_i < list.length; ++__get_i) {
          if (list[__get_i][0] === key) return list[__get_i][1];
        }
        return undefined;
      };
    };

    /**
     * A tree of map nodes.
     * Uses `KeyView`s to allow descending the tree without garbage.
     * Example: {
     *   // Create our map object.
     *   var map = new ObjTreeMap();
     *
     *   // Grab the static keyView for the map.
     *   var keyView = map.GetStaticKeyView();
     *
     *   // Let's make a map for:
     *   // root: <undefined>
     *   //   1: <undefined>
     *   //     2: <undefined>
     *   //       5: "Three, sir!"
     *   //       3: "Three!"
     *
     *   // Note how we can chain together `Reset` and `Next` to
     *   // easily descend based on multiple key fragments.
     *   keyView.Reset().Next(1).Next(2).Next(5).Set("Three, sir!");
     *   keyView.Reset().Next(1).Next(2).Next(3).Set("Three!");
     * }
     * @constructor
     */
    function CMapTree() {
      /** @constructor */
      function CNLNode() {
        var map = new CNaiveListMap();

        this.child = function CNLNode_child(keyFrag) {
          if (!map.contains(keyFrag | 0)) {
            map.insert(keyFrag | 0, new CNLNode());
          }
          return map.get(keyFrag | 0);
        };

        this.value = undefined;
        this.get = function CNLNode_get() {
          return this.value;
        };

        this.set = function CNLNode_set(val) {
          this.value = val;
        };
      }

      /** @constructor */
      function CKeyView(root) {
        var cur;

        this.reset = function CKeyView_reset() {
          cur = root;
          return this;
        };
        this.reset();

        this.next = function CKeyView_next(keyFrag) {
          cur = cur.child(keyFrag);
          return this;
        };

        this.get = function CKeyView_get() {
          return cur.get();
        };

        this.set = function CKeyView_set(val) {
          cur.set(val);
        };
      };

      var root;
      var staticKeyView;

      this.createKeyView = function CNLNode_createKeyView() {
        return new CKeyView(root);
      }

      this.clear = function CNLNode_clear() {
        root = new CNLNode();
        staticKeyView = this.createKeyView();
      };
      this.clear();

      this.getStaticKeyView = function CNLNode_getStaticKeyView() {
        staticKeyView.reset();
        return staticKeyView;
      };
    };

    // Exports:
    return {
      create: () => new CMapTree(),
    };
  },
  TexEnvJIT: null,
  spawnTexEnvJIT: () => {
    // GL defs:
    var GL_TEXTURE0 = 0x84C0;
    var GL_TEXTURE_1D = 0xDE0;
    var GL_TEXTURE_2D = 0xDE1;
    var GL_TEXTURE_3D = 0x806f;
    var GL_TEXTURE_CUBE_MAP = 0x8513;
    var GL_TEXTURE_ENV = 0x2300;
    var GL_TEXTURE_ENV_MODE = 0x2200;
    var GL_TEXTURE_ENV_COLOR = 0x2201;
    var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515;
    var GL_TEXTURE_CUBE_MAP_NEGATIVE_X = 0x8516;
    var GL_TEXTURE_CUBE_MAP_POSITIVE_Y = 0x8517;
    var GL_TEXTURE_CUBE_MAP_NEGATIVE_Y = 0x8518;
    var GL_TEXTURE_CUBE_MAP_POSITIVE_Z = 0x8519;
    var GL_TEXTURE_CUBE_MAP_NEGATIVE_Z = 0x851A;

    var GL_SRC0_RGB = 0x8580;
    var GL_SRC1_RGB = 0x8581;
    var GL_SRC2_RGB = 0x8582;

    var GL_SRC0_ALPHA = 0x8588;
    var GL_SRC1_ALPHA = 0x8589;
    var GL_SRC2_ALPHA = 0x858A;

    var GL_OPERAND0_RGB = 0x8590;
    var GL_OPERAND1_RGB = 0x8591;
    var GL_OPERAND2_RGB = 0x8592;

    var GL_OPERAND0_ALPHA = 0x8598;
    var GL_OPERAND1_ALPHA = 0x8599;
    var GL_OPERAND2_ALPHA = 0x859A;

    var GL_COMBINE_RGB = 0x8571;
    var GL_COMBINE_ALPHA = 0x8572;

    var GL_RGB_SCALE = 0x8573;
    var GL_ALPHA_SCALE = 0xD1C;

    // env.mode
    var GL_ADD = 0x104;
    var GL_BLEND = 0xBE2;
    var GL_REPLACE = 0x1E01;
    var GL_MODULATE = 0x2100;
    var GL_DECAL = 0x2101;
    var GL_COMBINE = 0x8570;

    // env.color/alphaCombiner
    //var GL_ADD         = 0x104;
    //var GL_REPLACE     = 0x1E01;
    //var GL_MODULATE    = 0x2100;
    var GL_SUBTRACT = 0x84E7;
    var GL_INTERPOLATE = 0x8575;

    // env.color/alphaSrc
    var GL_TEXTURE = 0x1702;
    var GL_CONSTANT = 0x8576;
    var GL_PRIMARY_COLOR = 0x8577;
    var GL_PREVIOUS = 0x8578;

    // env.color/alphaOp
    var GL_SRC_COLOR = 0x300;
    var GL_ONE_MINUS_SRC_COLOR = 0x301;
    var GL_SRC_ALPHA = 0x302;
    var GL_ONE_MINUS_SRC_ALPHA = 0x303;

    var GL_RGB = 0x1907;
    var GL_RGBA = 0x1908;

    // Our defs:
    var TEXENVJIT_NAMESPACE_PREFIX = "tej_";
    // Not actually constant, as they can be changed between JIT passes:
    var TEX_UNIT_UNIFORM_PREFIX = "uTexUnit";
    var TEX_COORD_VARYING_PREFIX = "vTexCoord";
    var PRIM_COLOR_VARYING = "vPrimColor";
    var TEX_MATRIX_UNIFORM_PREFIX = "uTexMatrix";

    // Static vars:
    var s_texUnits = null; //[];
    var s_activeTexture = 0;

    var s_requiredTexUnitsForPass = [];

    // Static funcs:
    function abort(info) {
      assert(false, "[TexEnvJIT] ABORT: " + info);
    }

    function abort_noSupport(info) {
      abort("No support: " + info);
    }

    function abort_sanity(info) {
      abort("Sanity failure: " + info);
    }

    function genTexUnitSampleExpr(texUnitID) {
      var texUnit = s_texUnits[texUnitID];
      var texType = texUnit.getTexType();

      var func = null;
      switch (texType) {
        case GL_TEXTURE_1D:
          func = "texture2D";
          break;
        case GL_TEXTURE_2D:
          func = "texture2D";
          break;
        case GL_TEXTURE_3D:
          return abort_noSupport("No support for 3D textures.");
        case GL_TEXTURE_CUBE_MAP:
          func = "textureCube";
          break;
        default:
          return abort_sanity("Unknown texType: " + ptrToString(texType));
      }

      var texCoordExpr = TEX_COORD_VARYING_PREFIX + texUnitID;
      if (TEX_MATRIX_UNIFORM_PREFIX != null) {
        texCoordExpr = "(" + TEX_MATRIX_UNIFORM_PREFIX + texUnitID + " * " + texCoordExpr + ")";
      }
      return func + "(" + TEX_UNIT_UNIFORM_PREFIX + texUnitID + ", " + texCoordExpr + ".xy)";
    }

    function getTypeFromCombineOp(op) {
      switch (op) {
        case GL_SRC_COLOR:
        case GL_ONE_MINUS_SRC_COLOR:
          return "vec3";
        case GL_SRC_ALPHA:
        case GL_ONE_MINUS_SRC_ALPHA:
          return "float";
      }

      return abort_noSupport("Unsupported combiner op: " + ptrToString(op));
    }

    function getCurTexUnit() {
      return s_texUnits[s_activeTexture];
    }

    function genCombinerSourceExpr(texUnitID, constantExpr, previousVar,
      src, op) {
      var srcExpr = null;
      switch (src) {
        case GL_TEXTURE:
          srcExpr = genTexUnitSampleExpr(texUnitID);
          break;
        case GL_CONSTANT:
          srcExpr = constantExpr;
          break;
        case GL_PRIMARY_COLOR:
          srcExpr = PRIM_COLOR_VARYING;
          break;
        case GL_PREVIOUS:
          srcExpr = previousVar;
          break;
        default:
          return abort_noSupport("Unsupported combiner src: " + ptrToString(src));
      }

      var expr = null;
      switch (op) {
        case GL_SRC_COLOR:
          expr = srcExpr + ".rgb";
          break;
        case GL_ONE_MINUS_SRC_COLOR:
          expr = "(vec3(1.0) - " + srcExpr + ".rgb)";
          break;
        case GL_SRC_ALPHA:
          expr = srcExpr + ".a";
          break;
        case GL_ONE_MINUS_SRC_ALPHA:
          expr = "(1.0 - " + srcExpr + ".a)";
          break;
        default:
          return abort_noSupport("Unsupported combiner op: " + ptrToString(op));
      }

      return expr;
    }

    function valToFloatLiteral(val) {
      if (val == Math.round(val)) return val + '.0';
      return val;
    }

    // Classes:
    /** @constructor */
    function CTexEnv() {
      this.mode = GL_MODULATE;
      this.colorCombiner = GL_MODULATE;
      this.alphaCombiner = GL_MODULATE;
      this.colorScale = 1;
      this.alphaScale = 1;
      this.envColor = [0, 0, 0, 0];

      this.colorSrc = [
        GL_TEXTURE,
        GL_PREVIOUS,
        GL_CONSTANT
      ];
      this.alphaSrc = [
        GL_TEXTURE,
        GL_PREVIOUS,
        GL_CONSTANT
      ];
      this.colorOp = [
        GL_SRC_COLOR,
        GL_SRC_COLOR,
        GL_SRC_ALPHA
      ];
      this.alphaOp = [
        GL_SRC_ALPHA,
        GL_SRC_ALPHA,
        GL_SRC_ALPHA
      ];

      // Map GLenums to small values to efficiently pack the enums to bits for tighter access.
      this.traverseKey = {
        // mode
        0x1E01 /* GL_REPLACE */: 0,
        0x2100 /* GL_MODULATE */: 1,
        0x104 /* GL_ADD */: 2,
        0xBE2 /* GL_BLEND */: 3,
        0x2101 /* GL_DECAL */: 4,
        0x8570 /* GL_COMBINE */: 5,

        // additional color and alpha combiners
        0x84E7 /* GL_SUBTRACT */: 3,
        0x8575 /* GL_INTERPOLATE */: 4,

        // color and alpha src
        0x1702 /* GL_TEXTURE */: 0,
        0x8576 /* GL_CONSTANT */: 1,
        0x8577 /* GL_PRIMARY_COLOR */: 2,
        0x8578 /* GL_PREVIOUS */: 3,

        // color and alpha op
        0x300 /* GL_SRC_COLOR */: 0,
        0x301 /* GL_ONE_MINUS_SRC_COLOR */: 1,
        0x302 /* GL_SRC_ALPHA */: 2,
        0x303 /* GL_ONE_MINUS_SRC_ALPHA */: 3
      };

      // The tuple (key0,key1,key2) uniquely identifies the state of the variables in CTexEnv.
      // -1 on key0 denotes 'the whole cached key is dirty'
      this.key0 = -1;
      this.key1 = 0;
      this.key2 = 0;

      this.computeKey0 = function () {
        var k = this.traverseKey;
        var key = k[this.mode] * 1638400; // 6 distinct values.
        key += k[this.colorCombiner] * 327680; // 5 distinct values.
        key += k[this.alphaCombiner] * 65536; // 5 distinct values.
        // The above three fields have 6*5*5=150 distinct values -> 8 bits.
        key += (this.colorScale - 1) * 16384; // 10 bits used.
        key += (this.alphaScale - 1) * 4096; // 12 bits used.
        key += k[this.colorSrc[0]] * 1024; // 14
        key += k[this.colorSrc[1]] * 256; // 16
        key += k[this.colorSrc[2]] * 64; // 18
        key += k[this.alphaSrc[0]] * 16; // 20
        key += k[this.alphaSrc[1]] * 4; // 22
        key += k[this.alphaSrc[2]]; // 24 bits used total.
        return key;
      }
      this.computeKey1 = function () {
        var k = this.traverseKey;
        var key = k[this.colorOp[0]] * 4096;
        key += k[this.colorOp[1]] * 1024;
        key += k[this.colorOp[2]] * 256;
        key += k[this.alphaOp[0]] * 16;
        key += k[this.alphaOp[1]] * 4;
        key += k[this.alphaOp[2]];
        return key;
      }
      // TODO: remove this. The color should not be part of the key!
      this.computeKey2 = function () {
        return this.envColor[0] * 16777216 + this.envColor[1] * 65536 + this.envColor[2] * 256 + 1 + this.envColor[3];
      }
      this.recomputeKey = function () {
        this.key0 = this.computeKey0();
        this.key1 = this.computeKey1();
        this.key2 = this.computeKey2();
      }
      this.invalidateKey = function () {
        this.key0 = -1; // The key of this texture unit must be recomputed when rendering the next time.
        GLImmediate.currentRenderer = null; // The currently used renderer must be re-evaluated at next render.
      }
    }

    /** @constructor */
    function CTexUnit() {
      this.env = new CTexEnv();
      this.enabled_tex1D = false;
      this.enabled_tex2D = false;
      this.enabled_tex3D = false;
      this.enabled_texCube = false;
      this.texTypesEnabled = 0; // A bitfield combination of the four flags above, used for fast access to operations.

      this.traverseState = function CTexUnit_traverseState(keyView) {
        if (this.texTypesEnabled) {
          if (this.env.key0 == -1) {
            this.env.recomputeKey();
          }
          keyView.next(this.texTypesEnabled | (this.env.key0 << 4));
          keyView.next(this.env.key1);
          keyView.next(this.env.key2);
        } else {
          // For correctness, must traverse a zero value, theoretically a subsequent integer key could collide with this value otherwise.
          keyView.next(0);
        }
      };
    };

    // Class impls:
    CTexUnit.prototype.enabled = function CTexUnit_enabled() {
      return this.texTypesEnabled;
    }

    CTexUnit.prototype.genPassLines = function CTexUnit_genPassLines(passOutputVar, passInputVar, texUnitID) {
      if (!this.enabled()) {
        return ["vec4 " + passOutputVar + " = " + passInputVar + ";"];
      }
      var lines = this.env.genPassLines(passOutputVar, passInputVar, texUnitID).join('\n');

      var texLoadLines = '';
      var texLoadRegex = /(texture.*?\(.*?\))/g;
      var loadCounter = 0;
      var load;

      // As an optimization, merge duplicate identical texture loads to one var.
      while (load = texLoadRegex.exec(lines)) {
        var texLoadExpr = load[1];
        var secondOccurrence = lines.slice(load.index + 1).indexOf(texLoadExpr);
        if (secondOccurrence != -1) { // And also has a second occurrence of same load expression..
          // Create new var to store the common load.
          var prefix = TEXENVJIT_NAMESPACE_PREFIX + 'env' + texUnitID + "_";
          var texLoadVar = prefix + 'texload' + loadCounter++;
          var texLoadLine = 'vec4 ' + texLoadVar + ' = ' + texLoadExpr + ';\n';
          texLoadLines += texLoadLine + '\n'; // Store the generated texture load statements in a temp string to not confuse regex search in progress.
          lines = lines.split(texLoadExpr).join(texLoadVar);
          // Reset regex search, since we modified the string.
          texLoadRegex = /(texture.*\(.*\))/g;
        }
      }
      return [texLoadLines + lines];
    }

    CTexUnit.prototype.getTexType = function CTexUnit_getTexType() {
      if (this.enabled_texCube) {
        return GL_TEXTURE_CUBE_MAP;
      } else if (this.enabled_tex3D) {
        return GL_TEXTURE_3D;
      } else if (this.enabled_tex2D) {
        return GL_TEXTURE_2D;
      } else if (this.enabled_tex1D) {
        return GL_TEXTURE_1D;
      }
      return 0;
    }

    CTexEnv.prototype.genPassLines = function CTexEnv_genPassLines(passOutputVar, passInputVar, texUnitID) {
      switch (this.mode) {
        case GL_REPLACE: {
          /* RGB:
           * Cv = Cs
           * Av = Ap // Note how this is different, and that we'll
           *            need to track the bound texture internalFormat
           *            to get this right.
           *
           * RGBA:
           * Cv = Cs
           * Av = As
           */
          return [
            "vec4 " + passOutputVar + " = " + genTexUnitSampleExpr(texUnitID) + ";",
          ];
        }
        case GL_ADD: {
          /* RGBA:
           * Cv = Cp + Cs
           * Av = ApAs
           */
          var prefix = TEXENVJIT_NAMESPACE_PREFIX + 'env' + texUnitID + "_";
          var texVar = prefix + "tex";
          var colorVar = prefix + "color";
          var alphaVar = prefix + "alpha";

          return [
            "vec4 " + texVar + " = " + genTexUnitSampleExpr(texUnitID) + ";",
            "vec3 " + colorVar + " = " + passInputVar + ".rgb + " + texVar + ".rgb;",
            "float " + alphaVar + " = " + passInputVar + ".a * " + texVar + ".a;",
            "vec4 " + passOutputVar + " = vec4(" + colorVar + ", " + alphaVar + ");",
          ];
        }
        case GL_MODULATE: {
          /* RGBA:
           * Cv = CpCs
           * Av = ApAs
           */
          var line = [
            "vec4 " + passOutputVar,
            " = ",
            passInputVar,
            " * ",
            genTexUnitSampleExpr(texUnitID),
            ";",
          ];
          return [line.join("")];
        }
        case GL_DECAL: {
          /* RGBA:
           * Cv = Cp(1 - As) + CsAs
           * Av = Ap
           */
          var prefix = TEXENVJIT_NAMESPACE_PREFIX + 'env' + texUnitID + "_";
          var texVar = prefix + "tex";
          var colorVar = prefix + "color";
          var alphaVar = prefix + "alpha";

          return [
            "vec4 " + texVar + " = " + genTexUnitSampleExpr(texUnitID) + ";",
            [
              "vec3 " + colorVar + " = ",
              passInputVar + ".rgb * (1.0 - " + texVar + ".a)",
              " + ",
              texVar + ".rgb * " + texVar + ".a",
              ";"
            ].join(""),
            "float " + alphaVar + " = " + passInputVar + ".a;",
            "vec4 " + passOutputVar + " = vec4(" + colorVar + ", " + alphaVar + ");",
          ];
        }
        case GL_BLEND: {
          /* RGBA:
           * Cv = Cp(1 - Cs) + CcCs
           * Av = As
           */
          var prefix = TEXENVJIT_NAMESPACE_PREFIX + 'env' + texUnitID + "_";
          var texVar = prefix + "tex";
          var colorVar = prefix + "color";
          var alphaVar = prefix + "alpha";

          return [
            "vec4 " + texVar + " = " + genTexUnitSampleExpr(texUnitID) + ";",
            [
              "vec3 " + colorVar + " = ",
              passInputVar + ".rgb * (1.0 - " + texVar + ".rgb)",
              " + ",
              PRIM_COLOR_VARYING + ".rgb * " + texVar + ".rgb",
              ";"
            ].join(""),
            "float " + alphaVar + " = " + texVar + ".a;",
            "vec4 " + passOutputVar + " = vec4(" + colorVar + ", " + alphaVar + ");",
          ];
        }
        case GL_COMBINE: {
          var prefix = TEXENVJIT_NAMESPACE_PREFIX + 'env' + texUnitID + "_";
          var colorVar = prefix + "color";
          var alphaVar = prefix + "alpha";
          var colorLines = this.genCombinerLines(true, colorVar,
            passInputVar, texUnitID,
            this.colorCombiner, this.colorSrc, this.colorOp);
          var alphaLines = this.genCombinerLines(false, alphaVar,
            passInputVar, texUnitID,
            this.alphaCombiner, this.alphaSrc, this.alphaOp);

          // Generate scale, but avoid generating an identity op that multiplies by one.
          var scaledColor = (this.colorScale == 1) ? colorVar : (colorVar + " * " + valToFloatLiteral(this.colorScale));
          var scaledAlpha = (this.alphaScale == 1) ? alphaVar : (alphaVar + " * " + valToFloatLiteral(this.alphaScale));

          var line = [
            "vec4 " + passOutputVar,
            " = ",
            "vec4(",
            scaledColor,
            ", ",
            scaledAlpha,
            ")",
            ";",
          ].join("");
          return [].concat(colorLines, alphaLines, [line]);
        }
      }

      return abort_noSupport("Unsupported TexEnv mode: " + ptrToString(this.mode));
    }

    CTexEnv.prototype.genCombinerLines = function CTexEnv_getCombinerLines(isColor, outputVar,
      passInputVar, texUnitID,
      combiner, srcArr, opArr) {
      var argsNeeded = null;
      switch (combiner) {
        case GL_REPLACE:
          argsNeeded = 1;
          break;

        case GL_MODULATE:
        case GL_ADD:
        case GL_SUBTRACT:
          argsNeeded = 2;
          break;

        case GL_INTERPOLATE:
          argsNeeded = 3;
          break;

        default:
          return abort_noSupport("Unsupported combiner: " + ptrToString(combiner));
      }

      var constantExpr = [
        "vec4(",
        valToFloatLiteral(this.envColor[0]),
        ", ",
        valToFloatLiteral(this.envColor[1]),
        ", ",
        valToFloatLiteral(this.envColor[2]),
        ", ",
        valToFloatLiteral(this.envColor[3]),
        ")",
      ].join("");
      var src0Expr = (argsNeeded >= 1) ? genCombinerSourceExpr(texUnitID, constantExpr, passInputVar, srcArr[0], opArr[0])
        : null;
      var src1Expr = (argsNeeded >= 2) ? genCombinerSourceExpr(texUnitID, constantExpr, passInputVar, srcArr[1], opArr[1])
        : null;
      var src2Expr = (argsNeeded >= 3) ? genCombinerSourceExpr(texUnitID, constantExpr, passInputVar, srcArr[2], opArr[2])
        : null;

      var outputType = isColor ? "vec3" : "float";
      var lines = null;
      switch (combiner) {
        case GL_REPLACE: {
          var line = [
            outputType + " " + outputVar,
            " = ",
            src0Expr,
            ";",
          ];
          lines = [line.join("")];
          break;
        }
        case GL_MODULATE: {
          var line = [
            outputType + " " + outputVar + " = ",
            src0Expr + " * " + src1Expr,
            ";",
          ];
          lines = [line.join("")];
          break;
        }
        case GL_ADD: {
          var line = [
            outputType + " " + outputVar + " = ",
            src0Expr + " + " + src1Expr,
            ";",
          ];
          lines = [line.join("")];
          break;
        }
        case GL_SUBTRACT: {
          var line = [
            outputType + " " + outputVar + " = ",
            src0Expr + " - " + src1Expr,
            ";",
          ];
          lines = [line.join("")];
          break;
        }
        case GL_INTERPOLATE: {
          var prefix = TEXENVJIT_NAMESPACE_PREFIX + 'env' + texUnitID + "_";
          var arg2Var = prefix + "colorSrc2";
          var arg2Line = getTypeFromCombineOp(this.colorOp[2]) + " " + arg2Var + " = " + src2Expr + ";";

          var line = [
            outputType + " " + outputVar,
            " = ",
            src0Expr + " * " + arg2Var,
            " + ",
            src1Expr + " * (1.0 - " + arg2Var + ")",
            ";",
          ];
          lines = [
            arg2Line,
            line.join(""),
          ];
          break;
        }

        default:
          return abort_sanity("Unmatched TexEnv.colorCombiner?");
      }

      return lines;
    }

    return {
      // Exports:
      init: (gl, specifiedMaxTextureImageUnits) => {
        var maxTexUnits = 0;
        if (specifiedMaxTextureImageUnits) {
          maxTexUnits = specifiedMaxTextureImageUnits;
        } else if (gl) {
          maxTexUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
        }
        assert(maxTexUnits > 0);
        s_texUnits = [];
        for (var i = 0; i < maxTexUnits; i++) {
          s_texUnits.push(new CTexUnit());
        }
      },

      setGLSLVars: (uTexUnitPrefix, vTexCoordPrefix, vPrimColor, uTexMatrixPrefix) => {
        TEX_UNIT_UNIFORM_PREFIX = uTexUnitPrefix;
        TEX_COORD_VARYING_PREFIX = vTexCoordPrefix;
        PRIM_COLOR_VARYING = vPrimColor;
        TEX_MATRIX_UNIFORM_PREFIX = uTexMatrixPrefix;
      },

      genAllPassLines: (resultDest, indentSize = 0) => {
        s_requiredTexUnitsForPass.length = 0; // Clear the list.
        var lines = [];
        var lastPassVar = PRIM_COLOR_VARYING;
        for (var i = 0; i < s_texUnits.length; i++) {
          if (!s_texUnits[i].enabled()) continue;

          s_requiredTexUnitsForPass.push(i);

          var prefix = TEXENVJIT_NAMESPACE_PREFIX + 'env' + i + "_";
          var passOutputVar = prefix + "result";

          var newLines = s_texUnits[i].genPassLines(passOutputVar, lastPassVar, i);
          lines = lines.concat(newLines, [""]);

          lastPassVar = passOutputVar;
        }
        lines.push(resultDest + " = " + lastPassVar + ";");

        var indent = "";
        for (var i = 0; i < indentSize; i++) indent += " ";

        var output = indent + lines.join("\n" + indent);

        return output;
      },

      getUsedTexUnitList: () => s_requiredTexUnitsForPass,

      getActiveTexture: () => s_activeTexture,

      traverseState: (keyView) => {
        for (var i = 0; i < s_texUnits.length; i++) {
          s_texUnits[i].traverseState(keyView);
        }
      },

      getTexUnitType: (texUnitID) => {
        assert(texUnitID >= 0 &&
          texUnitID < s_texUnits.length);
        return s_texUnits[texUnitID].getTexType();
      },

      // Hooks:
      hook_activeTexture: (texture) => {
        s_activeTexture = texture - GL_TEXTURE0;
        // Check if the current matrix mode is GL_TEXTURE.
        if (GLImmediate.currentMatrix >= 2) {
          // Switch to the corresponding texture matrix stack.
          GLImmediate.currentMatrix = 2 + s_activeTexture;
        }
      },

      hook_enable: (cap) => {
        var cur = getCurTexUnit();
        switch (cap) {
          case GL_TEXTURE_1D:
            if (!cur.enabled_tex1D) {
              GLImmediate.currentRenderer = null; // Renderer state changed, and must be recreated or looked up again.
              cur.enabled_tex1D = true;
              cur.texTypesEnabled |= 1;
            }
            break;
          case GL_TEXTURE_2D:
            if (!cur.enabled_tex2D) {
              GLImmediate.currentRenderer = null;
              cur.enabled_tex2D = true;
              cur.texTypesEnabled |= 2;
            }
            break;
          case GL_TEXTURE_3D:
            if (!cur.enabled_tex3D) {
              GLImmediate.currentRenderer = null;
              cur.enabled_tex3D = true;
              cur.texTypesEnabled |= 4;
            }
            break;
          case GL_TEXTURE_CUBE_MAP:
            if (!cur.enabled_texCube) {
              GLImmediate.currentRenderer = null;
              cur.enabled_texCube = true;
              cur.texTypesEnabled |= 8;
            }
            break;
        }
      },

      hook_disable: (cap) => {
        var cur = getCurTexUnit();
        switch (cap) {
          case GL_TEXTURE_1D:
            if (cur.enabled_tex1D) {
              GLImmediate.currentRenderer = null; // Renderer state changed, and must be recreated or looked up again.
              cur.enabled_tex1D = false;
              cur.texTypesEnabled &= ~1;
            }
            break;
          case GL_TEXTURE_2D:
            if (cur.enabled_tex2D) {
              GLImmediate.currentRenderer = null;
              cur.enabled_tex2D = false;
              cur.texTypesEnabled &= ~2;
            }
            break;
          case GL_TEXTURE_3D:
            if (cur.enabled_tex3D) {
              GLImmediate.currentRenderer = null;
              cur.enabled_tex3D = false;
              cur.texTypesEnabled &= ~4;
            }
            break;
          case GL_TEXTURE_CUBE_MAP:
            if (cur.enabled_texCube) {
              GLImmediate.currentRenderer = null;
              cur.enabled_texCube = false;
              cur.texTypesEnabled &= ~8;
            }
            break;
        }
      },

      hook_texEnvf(target, pname, param) {
        if (target != GL_TEXTURE_ENV)
          return;

        var env = getCurTexUnit().env;
        switch (pname) {
          case GL_RGB_SCALE:
            if (env.colorScale != param) {
              env.invalidateKey(); // We changed FFP emulation renderer state.
              env.colorScale = param;
            }
            break;
          case GL_ALPHA_SCALE:
            if (env.alphaScale != param) {
              env.invalidateKey();
              env.alphaScale = param;
            }
            break;

          default:
            err('WARNING: Unhandled `pname` in call to `glTexEnvf`.');
        }
      },

      hook_texEnvi(target, pname, param) {
        if (target != GL_TEXTURE_ENV)
          return;

        var env = getCurTexUnit().env;
        switch (pname) {
          case GL_TEXTURE_ENV_MODE:
            if (env.mode != param) {
              env.invalidateKey(); // We changed FFP emulation renderer state.
              env.mode = param;
            }
            break;

          case GL_COMBINE_RGB:
            if (env.colorCombiner != param) {
              env.invalidateKey();
              env.colorCombiner = param;
            }
            break;
          case GL_COMBINE_ALPHA:
            if (env.alphaCombiner != param) {
              env.invalidateKey();
              env.alphaCombiner = param;
            }
            break;

          case GL_SRC0_RGB:
            if (env.colorSrc[0] != param) {
              env.invalidateKey();
              env.colorSrc[0] = param;
            }
            break;
          case GL_SRC1_RGB:
            if (env.colorSrc[1] != param) {
              env.invalidateKey();
              env.colorSrc[1] = param;
            }
            break;
          case GL_SRC2_RGB:
            if (env.colorSrc[2] != param) {
              env.invalidateKey();
              env.colorSrc[2] = param;
            }
            break;

          case GL_SRC0_ALPHA:
            if (env.alphaSrc[0] != param) {
              env.invalidateKey();
              env.alphaSrc[0] = param;
            }
            break;
          case GL_SRC1_ALPHA:
            if (env.alphaSrc[1] != param) {
              env.invalidateKey();
              env.alphaSrc[1] = param;
            }
            break;
          case GL_SRC2_ALPHA:
            if (env.alphaSrc[2] != param) {
              env.invalidateKey();
              env.alphaSrc[2] = param;
            }
            break;

          case GL_OPERAND0_RGB:
            if (env.colorOp[0] != param) {
              env.invalidateKey();
              env.colorOp[0] = param;
            }
            break;
          case GL_OPERAND1_RGB:
            if (env.colorOp[1] != param) {
              env.invalidateKey();
              env.colorOp[1] = param;
            }
            break;
          case GL_OPERAND2_RGB:
            if (env.colorOp[2] != param) {
              env.invalidateKey();
              env.colorOp[2] = param;
            }
            break;

          case GL_OPERAND0_ALPHA:
            if (env.alphaOp[0] != param) {
              env.invalidateKey();
              env.alphaOp[0] = param;
            }
            break;
          case GL_OPERAND1_ALPHA:
            if (env.alphaOp[1] != param) {
              env.invalidateKey();
              env.alphaOp[1] = param;
            }
            break;
          case GL_OPERAND2_ALPHA:
            if (env.alphaOp[2] != param) {
              env.invalidateKey();
              env.alphaOp[2] = param;
            }
            break;

          case GL_RGB_SCALE:
            if (env.colorScale != param) {
              env.invalidateKey();
              env.colorScale = param;
            }
            break;
          case GL_ALPHA_SCALE:
            if (env.alphaScale != param) {
              env.invalidateKey();
              env.alphaScale = param;
            }
            break;

          default:
            err('WARNING: Unhandled `pname` in call to `glTexEnvi`.');
        }
      },

      hook_texEnvfv(target, pname, params) {
        if (target != GL_TEXTURE_ENV) return;

        var env = getCurTexUnit().env;
        switch (pname) {
          case GL_TEXTURE_ENV_COLOR: {
            for (var i = 0; i < 4; i++) {
              var param = HEAPF32[(((params) + (i * 4)) >> 2)];
              if (env.envColor[i] != param) {
                env.invalidateKey(); // We changed FFP emulation renderer state.
                env.envColor[i] = param;
              }
            }
            break
          }
          default:
            err('WARNING: Unhandled `pname` in call to `glTexEnvfv`.');
        }
      },

      hook_getTexEnviv(target, pname, param) {
        if (target != GL_TEXTURE_ENV)
          return;

        var env = getCurTexUnit().env;
        switch (pname) {
          case GL_TEXTURE_ENV_MODE:
            HEAP32[((param) >> 2)] = env.mode;
            return;

          case GL_TEXTURE_ENV_COLOR:
            HEAP32[((param) >> 2)] = Math.max(Math.min(env.envColor[0] * 255, 255, -255));
            HEAP32[(((param) + (1)) >> 2)] = Math.max(Math.min(env.envColor[1] * 255, 255, -255));
            HEAP32[(((param) + (2)) >> 2)] = Math.max(Math.min(env.envColor[2] * 255, 255, -255));
            HEAP32[(((param) + (3)) >> 2)] = Math.max(Math.min(env.envColor[3] * 255, 255, -255));
            return;

          case GL_COMBINE_RGB:
            HEAP32[((param) >> 2)] = env.colorCombiner;
            return;

          case GL_COMBINE_ALPHA:
            HEAP32[((param) >> 2)] = env.alphaCombiner;
            return;

          case GL_SRC0_RGB:
            HEAP32[((param) >> 2)] = env.colorSrc[0];
            return;

          case GL_SRC1_RGB:
            HEAP32[((param) >> 2)] = env.colorSrc[1];
            return;

          case GL_SRC2_RGB:
            HEAP32[((param) >> 2)] = env.colorSrc[2];
            return;

          case GL_SRC0_ALPHA:
            HEAP32[((param) >> 2)] = env.alphaSrc[0];
            return;

          case GL_SRC1_ALPHA:
            HEAP32[((param) >> 2)] = env.alphaSrc[1];
            return;

          case GL_SRC2_ALPHA:
            HEAP32[((param) >> 2)] = env.alphaSrc[2];
            return;

          case GL_OPERAND0_RGB:
            HEAP32[((param) >> 2)] = env.colorOp[0];
            return;

          case GL_OPERAND1_RGB:
            HEAP32[((param) >> 2)] = env.colorOp[1];
            return;

          case GL_OPERAND2_RGB:
            HEAP32[((param) >> 2)] = env.colorOp[2];
            return;

          case GL_OPERAND0_ALPHA:
            HEAP32[((param) >> 2)] = env.alphaOp[0];
            return;

          case GL_OPERAND1_ALPHA:
            HEAP32[((param) >> 2)] = env.alphaOp[1];
            return;

          case GL_OPERAND2_ALPHA:
            HEAP32[((param) >> 2)] = env.alphaOp[2];
            return;

          case GL_RGB_SCALE:
            HEAP32[((param) >> 2)] = env.colorScale;
            return;

          case GL_ALPHA_SCALE:
            HEAP32[((param) >> 2)] = env.alphaScale;
            return;

          default:
            err('WARNING: Unhandled `pname` in call to `glGetTexEnvi`.');
        }
      },

      hook_getTexEnvfv: (target, pname, param) => {
        if (target != GL_TEXTURE_ENV)
          return;

        var env = getCurTexUnit().env;
        switch (pname) {
          case GL_TEXTURE_ENV_COLOR:
            HEAPF32[((param) >> 2)] = env.envColor[0];
            HEAPF32[(((param) + (4)) >> 2)] = env.envColor[1];
            HEAPF32[(((param) + (8)) >> 2)] = env.envColor[2];
            HEAPF32[(((param) + (12)) >> 2)] = env.envColor[3];
            return;
        }
      }
    };
  },
  vertexData: null,
  vertexDataU8: null,
  tempData: null,
  indexData: null,
  vertexCounter: 0,
  mode: -1,
  rendererCache: null,
  rendererComponents: [],
  rendererComponentPointer: 0,
  lastRenderer: null,
  lastArrayBuffer: null,
  lastProgram: null,
  lastStride: -1,
  matrix: [],
  matrixStack: [],
  currentMatrix: 0,
  tempMatrix: null,
  matricesModified: false,
  useTextureMatrix: false,
  VERTEX: 0,
  NORMAL: 1,
  COLOR: 2,
  TEXTURE0: 3,
  NUM_ATTRIBUTES: -1,
  MAX_TEXTURES: -1,
  totalEnabledClientAttributes: 0,
  enabledClientAttributes: [0, 0],
  clientAttributes: [],
  liveClientAttributes: [],
  currentRenderer: null,
  modifiedClientAttributes: false,
  clientActiveTexture: 0,
  clientColor: null,
  usedTexUnitList: [],
  fixedFunctionProgram: null,
  setClientAttribute(name, size, type, stride, pointer) {
    var attrib = GLImmediate.clientAttributes[name];
    if (!attrib) {
      for (var i = 0; i <= name; i++) { // keep flat
        GLImmediate.clientAttributes[i] ||= {
          name,
          size,
          type,
          stride,
          pointer,
          offset: 0
        };
      }
    } else {
      attrib.name = name;
      attrib.size = size;
      attrib.type = type;
      attrib.stride = stride;
      attrib.pointer = pointer;
      attrib.offset = 0;
    }
    GLImmediate.modifiedClientAttributes = true;
  },
  addRendererComponent(name, size, type) {
    if (!GLImmediate.rendererComponents[name]) {
      GLImmediate.rendererComponents[name] = 1;
      if (GLImmediate.enabledClientAttributes[name]) {
        out("Warning: glTexCoord used after EnableClientState for TEXTURE_COORD_ARRAY for TEXTURE0. Disabling TEXTURE_COORD_ARRAY...");
      }
      GLImmediate.enabledClientAttributes[name] = true;
      GLImmediate.setClientAttribute(name, size, type, 0, GLImmediate.rendererComponentPointer);
      GLImmediate.rendererComponentPointer += size * GL.byteSizeByType[type - GL.byteSizeByTypeRoot];
    } else {
      GLImmediate.rendererComponents[name]++;
    }
  },
  disableBeginEndClientAttributes() {
    for (var i = 0; i < GLImmediate.NUM_ATTRIBUTES; i++) {
      if (GLImmediate.rendererComponents[i]) GLImmediate.enabledClientAttributes[i] = false;
    }
  },
  getRenderer() {
    // If no FFP state has changed that would have forced to re-evaluate which FFP emulation shader to use,
    // we have the currently used renderer in cache, and can immediately return that.
    if (GLImmediate.currentRenderer) {
      return GLImmediate.currentRenderer;
    }
    // return a renderer object given the liveClientAttributes
    // we maintain a cache of renderers, optimized to not generate garbage
    var attributes = GLImmediate.liveClientAttributes;
    var cacheMap = GLImmediate.rendererCache;
    var keyView = cacheMap.getStaticKeyView().reset();

    // By attrib state:
    var enabledAttributesKey = 0;
    for (var i = 0; i < attributes.length; i++) {
      enabledAttributesKey |= 1 << attributes[i].name;
    }

    // To prevent using more than 31 bits add another level to the maptree
    // and reset the enabledAttributesKey for the next glemulation state bits
    keyView.next(enabledAttributesKey);
    enabledAttributesKey = 0;

    // By fog state:
    var fogParam = 0;
    if (GLEmulation.fogEnabled) {
      switch (GLEmulation.fogMode) {
        case 0x801: // GL_EXP2
          fogParam = 1;
          break;
        case 0x2601: // GL_LINEAR
          fogParam = 2;
          break;
        default: // default to GL_EXP
          fogParam = 3;
          break;
      }
    }
    enabledAttributesKey = (enabledAttributesKey << 2) | fogParam;

    // By clip plane mode
    for (var clipPlaneId = 0; clipPlaneId < GLEmulation.MAX_CLIP_PLANES; clipPlaneId++) {
      enabledAttributesKey = (enabledAttributesKey << 1) | GLEmulation.clipPlaneEnabled[clipPlaneId];
    }

    // By lighting mode and enabled lights
    enabledAttributesKey = (enabledAttributesKey << 1) | GLEmulation.lightingEnabled;
    for (var lightId = 0; lightId < GLEmulation.MAX_LIGHTS; lightId++) {
      enabledAttributesKey = (enabledAttributesKey << 1) | (GLEmulation.lightingEnabled ? GLEmulation.lightEnabled[lightId] : 0);
    }

    // By alpha testing mode
    enabledAttributesKey = (enabledAttributesKey << 3) | (GLEmulation.alphaTestEnabled ? (GLEmulation.alphaTestFunc - 0x200) : 0x7);

    // By drawing mode:
    enabledAttributesKey = (enabledAttributesKey << 1) | (GLImmediate.mode == GLctx.POINTS ? 1 : 0);

    keyView.next(enabledAttributesKey);

    // By cur program:
    keyView.next(GL.currProgram);
    if (!GL.currProgram) {
      GLImmediate.TexEnvJIT.traverseState(keyView);
    }

    // If we don't already have it, create it.
    var renderer = keyView.get();
    if (!renderer) {
      renderer = GLImmediate.createRenderer();
      GLImmediate.currentRenderer = renderer;
      keyView.set(renderer);
      return renderer;
    }
    GLImmediate.currentRenderer = renderer; // Cache the currently used renderer, so later lookups without state changes can get this fast.
    return renderer;
  },
  createRenderer(renderer) {
    var useCurrProgram = !!GL.currProgram;
    var hasTextures = false;
    for (var i = 0; i < GLImmediate.MAX_TEXTURES; i++) {
      var texAttribName = GLImmediate.TEXTURE0 + i;
      if (!GLImmediate.enabledClientAttributes[texAttribName])
        continue;

      if (!useCurrProgram) {
        if (GLImmediate.TexEnvJIT.getTexUnitType(i) == 0) {
          warnOnce("GL_TEXTURE" + i + " coords are supplied, but that texture unit is disabled in the fixed-function pipeline.");
        }
      }

      hasTextures = true;
    }

    /** @constructor */
    function Renderer() {
      this.init = function () {
        // For fixed-function shader generation.
        var uTexUnitPrefix = 'u_texUnit';
        var aTexCoordPrefix = 'a_texCoord';
        var vTexCoordPrefix = 'v_texCoord';
        var vPrimColor = 'v_color';
        var uTexMatrixPrefix = GLImmediate.useTextureMatrix ? 'u_textureMatrix' : null;

        if (useCurrProgram) {
          if (GL.shaderInfos[GL.programShaders[GL.currProgram][0]].type == GLctx.VERTEX_SHADER) {
            this.vertexShader = GL.shaders[GL.programShaders[GL.currProgram][0]];
            this.fragmentShader = GL.shaders[GL.programShaders[GL.currProgram][1]];
          } else {
            this.vertexShader = GL.shaders[GL.programShaders[GL.currProgram][1]];
            this.fragmentShader = GL.shaders[GL.programShaders[GL.currProgram][0]];
          }
          this.program = GL.programs[GL.currProgram];
          this.usedTexUnitList = [];
        } else {
          // IMPORTANT NOTE: If you parameterize the shader source based on any runtime values
          // in order to create the least expensive shader possible based on the features being
          // used, you should also update the code in the beginning of getRenderer to make sure
          // that you cache the renderer based on the said parameters.
          if (GLEmulation.fogEnabled) {
            switch (GLEmulation.fogMode) {
              case 0x801: // GL_EXP2
                // fog = exp(-(gl_Fog.density * gl_FogFragCoord)^2)
                var fogFormula = '  float fog = exp(-u_fogDensity * u_fogDensity * ecDistance * ecDistance); \n';
                break;
              case 0x2601: // GL_LINEAR
                // fog = (gl_Fog.end - gl_FogFragCoord) * gl_fog.scale
                var fogFormula = '  float fog = (u_fogEnd - ecDistance) * u_fogScale; \n';
                break;
              default: // default to GL_EXP
                // fog = exp(-gl_Fog.density * gl_FogFragCoord)
                var fogFormula = '  float fog = exp(-u_fogDensity * ecDistance); \n';
                break;
            }
          }

          GLImmediate.TexEnvJIT.setGLSLVars(uTexUnitPrefix, vTexCoordPrefix, vPrimColor, uTexMatrixPrefix);
          var fsTexEnvPass = GLImmediate.TexEnvJIT.genAllPassLines('gl_FragColor', 2);

          var texUnitAttribList = '';
          var texUnitVaryingList = '';
          var texUnitUniformList = '';
          var vsTexCoordInits = '';
          this.usedTexUnitList = GLImmediate.TexEnvJIT.getUsedTexUnitList();
          for (var i = 0; i < this.usedTexUnitList.length; i++) {
            var texUnit = this.usedTexUnitList[i];
            texUnitAttribList += 'attribute vec4 ' + aTexCoordPrefix + texUnit + ';\n';
            texUnitVaryingList += 'varying vec4 ' + vTexCoordPrefix + texUnit + ';\n';
            texUnitUniformList += 'uniform sampler2D ' + uTexUnitPrefix + texUnit + ';\n';
            vsTexCoordInits += '  ' + vTexCoordPrefix + texUnit + ' = ' + aTexCoordPrefix + texUnit + ';\n';

            if (GLImmediate.useTextureMatrix) {
              texUnitUniformList += 'uniform mat4 ' + uTexMatrixPrefix + texUnit + ';\n';
            }
          }

          var vsFogVaryingInit = null;
          if (GLEmulation.fogEnabled) {
            vsFogVaryingInit = '  v_fogFragCoord = abs(ecPosition.z);\n';
          }

          var vsPointSizeDefs = null;
          var vsPointSizeInit = null;
          if (GLImmediate.mode == GLctx.POINTS) {
            vsPointSizeDefs = 'uniform float u_pointSize;\n';
            vsPointSizeInit = '  gl_PointSize = u_pointSize;\n';
          }

          var vsClipPlaneDefs = '';
          var vsClipPlaneInit = '';
          var fsClipPlaneDefs = '';
          var fsClipPlanePass = '';
          for (var clipPlaneId = 0; clipPlaneId < GLEmulation.MAX_CLIP_PLANES; clipPlaneId++) {
            if (GLEmulation.clipPlaneEnabled[clipPlaneId]) {
              vsClipPlaneDefs += 'uniform vec4 u_clipPlaneEquation' + clipPlaneId + ';';
              vsClipPlaneDefs += 'varying float v_clipDistance' + clipPlaneId + ';';
              vsClipPlaneInit += '  v_clipDistance' + clipPlaneId + ' = dot(ecPosition, u_clipPlaneEquation' + clipPlaneId + ');';
              fsClipPlaneDefs += 'varying float v_clipDistance' + clipPlaneId + ';';
              fsClipPlanePass += '  if (v_clipDistance' + clipPlaneId + ' < 0.0) discard;';
            }
          }

          var vsLightingDefs = '';
          var vsLightingPass = '';
          if (GLEmulation.lightingEnabled) {
            vsLightingDefs += 'attribute vec3 a_normal;';
            vsLightingDefs += 'uniform mat3 u_normalMatrix;';
            vsLightingDefs += 'uniform vec4 u_lightModelAmbient;';
            vsLightingDefs += 'uniform vec4 u_materialAmbient;';
            vsLightingDefs += 'uniform vec4 u_materialDiffuse;';
            vsLightingDefs += 'uniform vec4 u_materialSpecular;';
            vsLightingDefs += 'uniform float u_materialShininess;';
            vsLightingDefs += 'uniform vec4 u_materialEmission;';

            vsLightingPass += '  vec3 ecNormal = normalize(u_normalMatrix * a_normal);';
            vsLightingPass += '  v_color.w = u_materialDiffuse.w;';
            vsLightingPass += '  v_color.xyz = u_materialEmission.xyz;';
            vsLightingPass += '  v_color.xyz += u_lightModelAmbient.xyz * u_materialAmbient.xyz;';

            for (var lightId = 0; lightId < GLEmulation.MAX_LIGHTS; lightId++) {
              if (GLEmulation.lightEnabled[lightId]) {
                vsLightingDefs += 'uniform vec4 u_lightAmbient' + lightId + ';';
                vsLightingDefs += 'uniform vec4 u_lightDiffuse' + lightId + ';';
                vsLightingDefs += 'uniform vec4 u_lightSpecular' + lightId + ';';
                vsLightingDefs += 'uniform vec4 u_lightPosition' + lightId + ';';

                vsLightingPass += '  {';
                vsLightingPass += '    vec3 lightDirection = normalize(u_lightPosition' + lightId + ').xyz;';
                vsLightingPass += '    vec3 halfVector = normalize(lightDirection + vec3(0,0,1));';
                vsLightingPass += '    vec3 ambient = u_lightAmbient' + lightId + '.xyz * u_materialAmbient.xyz;';
                vsLightingPass += '    float diffuseI = max(dot(ecNormal, lightDirection), 0.0);';
                vsLightingPass += '    float specularI = max(dot(ecNormal, halfVector), 0.0);';
                vsLightingPass += '    vec3 diffuse = diffuseI * u_lightDiffuse' + lightId + '.xyz * u_materialDiffuse.xyz;';
                vsLightingPass += '    specularI = (diffuseI > 0.0 && specularI > 0.0) ? exp(u_materialShininess * log(specularI)) : 0.0;';
                vsLightingPass += '    vec3 specular = specularI * u_lightSpecular' + lightId + '.xyz * u_materialSpecular.xyz;';
                vsLightingPass += '    v_color.xyz += ambient + diffuse + specular;';
                vsLightingPass += '  }';
              }
            }
            vsLightingPass += '  v_color = clamp(v_color, 0.0, 1.0);';
          }

          var vsSource = [
            'attribute vec4 a_position;',
            'attribute vec4 a_color;',
            'varying vec4 v_color;',
            texUnitAttribList,
            texUnitVaryingList,
            (GLEmulation.fogEnabled ? 'varying float v_fogFragCoord;' : null),
            'uniform mat4 u_modelView;',
            'uniform mat4 u_projection;',
            vsPointSizeDefs,
            vsClipPlaneDefs,
            vsLightingDefs,
            'void main()',
            '{',
            '  vec4 ecPosition = u_modelView * a_position;', // eye-coordinate position
            '  gl_Position = u_projection * ecPosition;',
            '  v_color = a_color;',
            vsTexCoordInits,
            vsFogVaryingInit,
            vsPointSizeInit,
            vsClipPlaneInit,
            vsLightingPass,
            '}',
            ''
          ].join('\n').replace(/\n\n+/g, '\n');

          this.vertexShader = GLctx.createShader(GLctx.VERTEX_SHADER);
          GLctx.shaderSource(this.vertexShader, vsSource);
          GLctx.compileShader(this.vertexShader);

          var fogHeaderIfNeeded = null;
          if (GLEmulation.fogEnabled) {
            fogHeaderIfNeeded = [
              '',
              'varying float v_fogFragCoord; ',
              'uniform vec4 u_fogColor;      ',
              'uniform float u_fogEnd;       ',
              'uniform float u_fogScale;     ',
              'uniform float u_fogDensity;   ',
              'float ffog(in float ecDistance) { ',
              fogFormula,
              '  fog = clamp(fog, 0.0, 1.0); ',
              '  return fog;                 ',
              '}',
              '',
            ].join("\n");
          }

          var fogPass = null;
          if (GLEmulation.fogEnabled) {
            fogPass = 'gl_FragColor = vec4(mix(u_fogColor.rgb, gl_FragColor.rgb, ffog(v_fogFragCoord)), gl_FragColor.a);\n';
          }

          var fsAlphaTestDefs = '';
          var fsAlphaTestPass = '';
          if (GLEmulation.alphaTestEnabled) {
            fsAlphaTestDefs = 'uniform float u_alphaTestRef;';
            switch (GLEmulation.alphaTestFunc) {
              case 0x200: // GL_NEVER
                fsAlphaTestPass = 'discard;';
                break;
              case 0x201: // GL_LESS
                fsAlphaTestPass = 'if (!(gl_FragColor.a < u_alphaTestRef)) { discard; }';
                break;
              case 0x202: // GL_EQUAL
                fsAlphaTestPass = 'if (!(gl_FragColor.a == u_alphaTestRef)) { discard; }';
                break;
              case 0x203: // GL_LEQUAL
                fsAlphaTestPass = 'if (!(gl_FragColor.a <= u_alphaTestRef)) { discard; }';
                break;
              case 0x204: // GL_GREATER
                fsAlphaTestPass = 'if (!(gl_FragColor.a > u_alphaTestRef)) { discard; }';
                break;
              case 0x205: // GL_NOTEQUAL
                fsAlphaTestPass = 'if (!(gl_FragColor.a != u_alphaTestRef)) { discard; }';
                break;
              case 0x206: // GL_GEQUAL
                fsAlphaTestPass = 'if (!(gl_FragColor.a >= u_alphaTestRef)) { discard; }';
                break;
              case 0x207: // GL_ALWAYS
                fsAlphaTestPass = '';
                break;
            }
          }

          var fsSource = [
            'precision mediump float;',
            texUnitVaryingList,
            texUnitUniformList,
            'varying vec4 v_color;',
            fogHeaderIfNeeded,
            fsClipPlaneDefs,
            fsAlphaTestDefs,
            'void main()',
            '{',
            fsClipPlanePass,
            fsTexEnvPass,
            fogPass,
            fsAlphaTestPass,
            '}',
            ''
          ].join("\n").replace(/\n\n+/g, '\n');

          this.fragmentShader = GLctx.createShader(GLctx.FRAGMENT_SHADER);
          GLctx.shaderSource(this.fragmentShader, fsSource);
          GLctx.compileShader(this.fragmentShader);

          this.program = GLctx.createProgram();
          GLctx.attachShader(this.program, this.vertexShader);
          GLctx.attachShader(this.program, this.fragmentShader);

          // As optimization, bind all attributes to prespecified locations, so that the FFP emulation
          // code can submit attributes to any generated FFP shader without having to examine each shader in turn.
          // These prespecified locations are only assumed if GL_FFP_ONLY is specified, since user could also create their
          // own shaders that didn't have attributes in the same locations.
          GLctx.bindAttribLocation(this.program, GLImmediate.VERTEX, 'a_position');
          GLctx.bindAttribLocation(this.program, GLImmediate.COLOR, 'a_color');
          GLctx.bindAttribLocation(this.program, GLImmediate.NORMAL, 'a_normal');
          var maxVertexAttribs = GLctx.getParameter(GLctx.MAX_VERTEX_ATTRIBS);
          for (var i = 0; i < GLImmediate.MAX_TEXTURES && GLImmediate.TEXTURE0 + i < maxVertexAttribs; i++) {
            GLctx.bindAttribLocation(this.program, GLImmediate.TEXTURE0 + i, 'a_texCoord' + i);
            GLctx.bindAttribLocation(this.program, GLImmediate.TEXTURE0 + i, aTexCoordPrefix + i);
          }
          GLctx.linkProgram(this.program);
        }

        // Stores an array that remembers which matrix uniforms are up-to-date in this FFP renderer, so they don't need to be resubmitted
        // each time we render with this program.
        this.textureMatrixVersion = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

        this.positionLocation = GLctx.getAttribLocation(this.program, 'a_position');

        this.texCoordLocations = [];

        for (var i = 0; i < GLImmediate.MAX_TEXTURES; i++) {
          if (!GLImmediate.enabledClientAttributes[GLImmediate.TEXTURE0 + i]) {
            this.texCoordLocations[i] = -1;
            continue;
          }

          if (useCurrProgram) {
            this.texCoordLocations[i] = GLctx.getAttribLocation(this.program, `a_texCoord${i}`);
          } else {
            this.texCoordLocations[i] = GLctx.getAttribLocation(this.program, aTexCoordPrefix + i);
          }
        }
        this.colorLocation = GLctx.getAttribLocation(this.program, 'a_color');
        if (!useCurrProgram) {
          // Temporarily switch to the program so we can set our sampler uniforms early.
          var prevBoundProg = GLctx.getParameter(GLctx.CURRENT_PROGRAM);
          GLctx.useProgram(this.program);
          {
            for (var i = 0; i < this.usedTexUnitList.length; i++) {
              var texUnitID = this.usedTexUnitList[i];
              var texSamplerLoc = GLctx.getUniformLocation(this.program, uTexUnitPrefix + texUnitID);
              GLctx.uniform1i(texSamplerLoc, texUnitID);
            }
          }
          // The default color attribute value is not the same as the default for all other attribute streams (0,0,0,1) but (1,1,1,1),
          // so explicitly set it right at start.
          GLctx.vertexAttrib4fv(this.colorLocation, [1, 1, 1, 1]);
          GLctx.useProgram(prevBoundProg);
        }

        this.textureMatrixLocations = [];
        for (var i = 0; i < GLImmediate.MAX_TEXTURES; i++) {
          this.textureMatrixLocations[i] = GLctx.getUniformLocation(this.program, `u_textureMatrix${i}`);
        }
        this.normalLocation = GLctx.getAttribLocation(this.program, 'a_normal');

        this.modelViewLocation = GLctx.getUniformLocation(this.program, 'u_modelView');
        this.projectionLocation = GLctx.getUniformLocation(this.program, 'u_projection');
        this.normalMatrixLocation = GLctx.getUniformLocation(this.program, 'u_normalMatrix');

        this.hasTextures = hasTextures;
        this.hasNormal = GLImmediate.enabledClientAttributes[GLImmediate.NORMAL] &&
          GLImmediate.clientAttributes[GLImmediate.NORMAL].size > 0 &&
          this.normalLocation >= 0;
        this.hasColor = (this.colorLocation === 0) || this.colorLocation > 0;

        this.floatType = GLctx.FLOAT; // minor optimization

        this.fogColorLocation = GLctx.getUniformLocation(this.program, 'u_fogColor');
        this.fogEndLocation = GLctx.getUniformLocation(this.program, 'u_fogEnd');
        this.fogScaleLocation = GLctx.getUniformLocation(this.program, 'u_fogScale');
        this.fogDensityLocation = GLctx.getUniformLocation(this.program, 'u_fogDensity');
        this.hasFog = !!(this.fogColorLocation || this.fogEndLocation ||
          this.fogScaleLocation || this.fogDensityLocation);

        this.pointSizeLocation = GLctx.getUniformLocation(this.program, 'u_pointSize');

        this.hasClipPlane = false;
        this.clipPlaneEquationLocation = [];
        for (var clipPlaneId = 0; clipPlaneId < GLEmulation.MAX_CLIP_PLANES; clipPlaneId++) {
          this.clipPlaneEquationLocation[clipPlaneId] = GLctx.getUniformLocation(this.program, `u_clipPlaneEquation${clipPlaneId}`);
          this.hasClipPlane = (this.hasClipPlane || this.clipPlaneEquationLocation[clipPlaneId]);
        }

        this.hasLighting = GLEmulation.lightingEnabled;
        this.lightModelAmbientLocation = GLctx.getUniformLocation(this.program, 'u_lightModelAmbient');
        this.materialAmbientLocation = GLctx.getUniformLocation(this.program, 'u_materialAmbient');
        this.materialDiffuseLocation = GLctx.getUniformLocation(this.program, 'u_materialDiffuse');
        this.materialSpecularLocation = GLctx.getUniformLocation(this.program, 'u_materialSpecular');
        this.materialShininessLocation = GLctx.getUniformLocation(this.program, 'u_materialShininess');
        this.materialEmissionLocation = GLctx.getUniformLocation(this.program, 'u_materialEmission');
        this.lightAmbientLocation = []
        this.lightDiffuseLocation = []
        this.lightSpecularLocation = []
        this.lightPositionLocation = []
        for (var lightId = 0; lightId < GLEmulation.MAX_LIGHTS; lightId++) {
          this.lightAmbientLocation[lightId] = GLctx.getUniformLocation(this.program, `u_lightAmbient${lightId}`);
          this.lightDiffuseLocation[lightId] = GLctx.getUniformLocation(this.program, `u_lightDiffuse${lightId}`);
          this.lightSpecularLocation[lightId] = GLctx.getUniformLocation(this.program, `u_lightSpecular${lightId}`);
          this.lightPositionLocation[lightId] = GLctx.getUniformLocation(this.program, `u_lightPosition${lightId}`);
        }

        this.hasAlphaTest = GLEmulation.alphaTestEnabled;
        this.alphaTestRefLocation = GLctx.getUniformLocation(this.program, 'u_alphaTestRef');

      };

      this.prepare = function () {
        // Calculate the array buffer
        var arrayBuffer;
        if (!GLctx.currentArrayBufferBinding) {
          var start = GLImmediate.firstVertex * GLImmediate.stride;
          var end = GLImmediate.lastVertex * GLImmediate.stride;
          assert(end <= GL.MAX_TEMP_BUFFER_SIZE, 'too much vertex data');
          arrayBuffer = GL.getTempVertexBuffer(end);
          // TODO: consider using the last buffer we bound, if it was larger. downside is larger buffer, but we might avoid rebinding and preparing
        } else {
          arrayBuffer = GLctx.currentArrayBufferBinding;
        }

        // If the array buffer is unchanged and the renderer as well, then we can avoid all the work here
        // XXX We use some heuristics here, and this may not work in all cases. Try disabling GL_UNSAFE_OPTS if you
        // have odd glitches
        var lastRenderer = GLImmediate.lastRenderer;
        var canSkip = this == lastRenderer &&
          arrayBuffer == GLImmediate.lastArrayBuffer &&
          (GL.currProgram || this.program) == GLImmediate.lastProgram &&
          GLImmediate.stride == GLImmediate.lastStride &&
          !GLImmediate.matricesModified;
        if (!canSkip && lastRenderer) lastRenderer.cleanup();
        if (!GLctx.currentArrayBufferBinding) {
          // Bind the array buffer and upload data after cleaning up the previous renderer

          if (arrayBuffer != GLImmediate.lastArrayBuffer) {
            GLctx.bindBuffer(GLctx.ARRAY_BUFFER, arrayBuffer);
            GLImmediate.lastArrayBuffer = arrayBuffer;
          }

          GLctx.bufferSubData(GLctx.ARRAY_BUFFER, start, GLImmediate.vertexData.subarray(start >> 2, end >> 2));
        }
        if (canSkip) return;
        GLImmediate.lastRenderer = this;
        GLImmediate.lastProgram = GL.currProgram || this.program;
        GLImmediate.lastStride = GLImmediate.stride;
        GLImmediate.matricesModified = false;

        if (!GL.currProgram) {
          if (GLImmediate.fixedFunctionProgram != this.program) {
            GLctx.useProgram(this.program);
            GLImmediate.fixedFunctionProgram = this.program;
          }
        }

        if (this.modelViewLocation && this.modelViewMatrixVersion != GLImmediate.matrixVersion[0/*m*/]) {
          this.modelViewMatrixVersion = GLImmediate.matrixVersion[0/*m*/];
          GLctx.uniformMatrix4fv(this.modelViewLocation, false, GLImmediate.matrix[0/*m*/]);

          // set normal matrix to the upper 3x3 of the inverse transposed current modelview matrix
          if (GLEmulation.lightEnabled) {
            var tmpMVinv = GLImmediate.matrixLib.mat4.create(GLImmediate.matrix[0]);
            GLImmediate.matrixLib.mat4.inverse(tmpMVinv);
            GLImmediate.matrixLib.mat4.transpose(tmpMVinv);
            GLctx.uniformMatrix3fv(this.normalMatrixLocation, false, GLImmediate.matrixLib.mat4.toMat3(tmpMVinv));
          }
        }
        if (this.projectionLocation && this.projectionMatrixVersion != GLImmediate.matrixVersion[1/*p*/]) {
          this.projectionMatrixVersion = GLImmediate.matrixVersion[1/*p*/];
          GLctx.uniformMatrix4fv(this.projectionLocation, false, GLImmediate.matrix[1/*p*/]);
        }

        var clientAttributes = GLImmediate.clientAttributes;
        var posAttr = clientAttributes[GLImmediate.VERTEX];

        GLctx.vertexAttribPointer(this.positionLocation, posAttr.size, posAttr.type, false, GLImmediate.stride, posAttr.offset);
        GLctx.enableVertexAttribArray(this.positionLocation);
        if (this.hasNormal) {
          var normalAttr = clientAttributes[GLImmediate.NORMAL];
          GLctx.vertexAttribPointer(this.normalLocation, normalAttr.size, normalAttr.type, true, GLImmediate.stride, normalAttr.offset);
          GLctx.enableVertexAttribArray(this.normalLocation);
        }
        if (this.hasTextures) {
          for (var i = 0; i < GLImmediate.MAX_TEXTURES; i++) {
            var attribLoc = this.texCoordLocations[i];
            if (attribLoc === undefined || attribLoc < 0) continue;
            var texAttr = clientAttributes[GLImmediate.TEXTURE0 + i];

            if (texAttr.size) {
              GLctx.vertexAttribPointer(attribLoc, texAttr.size, texAttr.type, false, GLImmediate.stride, texAttr.offset);
              GLctx.enableVertexAttribArray(attribLoc);
            } else {
              // These two might be dangerous, but let's try them.
              GLctx.vertexAttrib4f(attribLoc, 0, 0, 0, 1);
              GLctx.disableVertexAttribArray(attribLoc);
            }
            var t = 2/*t*/ + i;
            if (this.textureMatrixLocations[i] && this.textureMatrixVersion[t] != GLImmediate.matrixVersion[t]) { // XXX might we need this even without the condition we are currently in?
              this.textureMatrixVersion[t] = GLImmediate.matrixVersion[t];
              GLctx.uniformMatrix4fv(this.textureMatrixLocations[i], false, GLImmediate.matrix[t]);
            }
          }
        }
        if (GLImmediate.enabledClientAttributes[GLImmediate.COLOR]) {
          var colorAttr = clientAttributes[GLImmediate.COLOR];
          GLctx.vertexAttribPointer(this.colorLocation, colorAttr.size, colorAttr.type, true, GLImmediate.stride, colorAttr.offset);
          GLctx.enableVertexAttribArray(this.colorLocation);
        }
        else if (this.hasColor) {
          GLctx.disableVertexAttribArray(this.colorLocation);
          GLctx.vertexAttrib4fv(this.colorLocation, GLImmediate.clientColor);
        }
        if (this.hasFog) {
          if (this.fogColorLocation) GLctx.uniform4fv(this.fogColorLocation, GLEmulation.fogColor);
          if (this.fogEndLocation) GLctx.uniform1f(this.fogEndLocation, GLEmulation.fogEnd);
          if (this.fogScaleLocation) GLctx.uniform1f(this.fogScaleLocation, 1 / (GLEmulation.fogEnd - GLEmulation.fogStart));
          if (this.fogDensityLocation) GLctx.uniform1f(this.fogDensityLocation, GLEmulation.fogDensity);
        }

        if (this.hasClipPlane) {
          for (var clipPlaneId = 0; clipPlaneId < GLEmulation.MAX_CLIP_PLANES; clipPlaneId++) {
            if (this.clipPlaneEquationLocation[clipPlaneId]) GLctx.uniform4fv(this.clipPlaneEquationLocation[clipPlaneId], GLEmulation.clipPlaneEquation[clipPlaneId]);
          }
        }

        if (this.hasLighting) {
          if (this.lightModelAmbientLocation) GLctx.uniform4fv(this.lightModelAmbientLocation, GLEmulation.lightModelAmbient);
          if (this.materialAmbientLocation) GLctx.uniform4fv(this.materialAmbientLocation, GLEmulation.materialAmbient);
          if (this.materialDiffuseLocation) GLctx.uniform4fv(this.materialDiffuseLocation, GLEmulation.materialDiffuse);
          if (this.materialSpecularLocation) GLctx.uniform4fv(this.materialSpecularLocation, GLEmulation.materialSpecular);
          if (this.materialShininessLocation) GLctx.uniform1f(this.materialShininessLocation, GLEmulation.materialShininess[0]);
          if (this.materialEmissionLocation) GLctx.uniform4fv(this.materialEmissionLocation, GLEmulation.materialEmission);
          for (var lightId = 0; lightId < GLEmulation.MAX_LIGHTS; lightId++) {
            if (this.lightAmbientLocation[lightId]) GLctx.uniform4fv(this.lightAmbientLocation[lightId], GLEmulation.lightAmbient[lightId]);
            if (this.lightDiffuseLocation[lightId]) GLctx.uniform4fv(this.lightDiffuseLocation[lightId], GLEmulation.lightDiffuse[lightId]);
            if (this.lightSpecularLocation[lightId]) GLctx.uniform4fv(this.lightSpecularLocation[lightId], GLEmulation.lightSpecular[lightId]);
            if (this.lightPositionLocation[lightId]) GLctx.uniform4fv(this.lightPositionLocation[lightId], GLEmulation.lightPosition[lightId]);
          }
        }

        if (this.hasAlphaTest) {
          if (this.alphaTestRefLocation) GLctx.uniform1f(this.alphaTestRefLocation, GLEmulation.alphaTestRef);
        }

        if (GLImmediate.mode == GLctx.POINTS) {
          if (this.pointSizeLocation) {
            GLctx.uniform1f(this.pointSizeLocation, GLEmulation.pointSize);
          }
        }
      };

      this.cleanup = function () {
        GLctx.disableVertexAttribArray(this.positionLocation);
        if (this.hasTextures) {
          for (var i = 0; i < GLImmediate.MAX_TEXTURES; i++) {
            if (GLImmediate.enabledClientAttributes[GLImmediate.TEXTURE0 + i] && this.texCoordLocations[i] >= 0) {
              GLctx.disableVertexAttribArray(this.texCoordLocations[i]);
            }
          }
        }
        if (this.hasColor) {
          GLctx.disableVertexAttribArray(this.colorLocation);
        }
        if (this.hasNormal) {
          GLctx.disableVertexAttribArray(this.normalLocation);
        }
        if (!GL.currProgram) {
          GLctx.useProgram(null);
          GLImmediate.fixedFunctionProgram = 0;
        }
        if (!GLctx.currentArrayBufferBinding) {
          GLctx.bindBuffer(GLctx.ARRAY_BUFFER, null);
          GLImmediate.lastArrayBuffer = null;
        }

        GLImmediate.lastRenderer = null;
        GLImmediate.lastProgram = null;
        GLImmediate.matricesModified = true;
      }

      this.init();
    }
    return new Renderer();
  },
  setupFuncs() {
    // TexEnv stuff needs to be prepared early, so do it here.
    // init() is too late for -O2, since it freezes the GL functions
    // by that point.
    GLImmediate.MapTreeLib = GLImmediate.spawnMapTreeLib();
    GLImmediate.spawnMapTreeLib = null;

    GLImmediate.TexEnvJIT = GLImmediate.spawnTexEnvJIT();
    GLImmediate.spawnTexEnvJIT = null;

    GLImmediate.setupHooks();
  },
  setupHooks() {
    if (!GLEmulation.hasRunInit) {
      GLEmulation.init();
    }

    var glActiveTexture = _glActiveTexture;
    _glActiveTexture = _emscripten_glActiveTexture = (texture) => {
      GLImmediate.TexEnvJIT.hook_activeTexture(texture);
      glActiveTexture(texture);
    };

    var glEnable = _glEnable;
    _glEnable = _emscripten_glEnable = (cap) => {
      GLImmediate.TexEnvJIT.hook_enable(cap);
      glEnable(cap);
    };

    var glDisable = _glDisable;
    _glDisable = _emscripten_glDisable = (cap) => {
      GLImmediate.TexEnvJIT.hook_disable(cap);
      glDisable(cap);
    };

    var glTexEnvf = (typeof _glTexEnvf != 'undefined') ? _glTexEnvf : () => { };
    /** @suppress {checkTypes} */
    _glTexEnvf = _emscripten_glTexEnvf = (target, pname, param) => {
      GLImmediate.TexEnvJIT.hook_texEnvf(target, pname, param);
      // Don't call old func, since we are the implementor.
      //glTexEnvf(target, pname, param);
    };

    var glTexEnvi = (typeof _glTexEnvi != 'undefined') ? _glTexEnvi : () => { };
    /** @suppress {checkTypes} */
    _glTexEnvi = _emscripten_glTexEnvi = (target, pname, param) => {
      GLImmediate.TexEnvJIT.hook_texEnvi(target, pname, param);
      // Don't call old func, since we are the implementor.
      //glTexEnvi(target, pname, param);
    };

    var glTexEnvfv = (typeof _glTexEnvfv != 'undefined') ? _glTexEnvfv : () => { };
    /** @suppress {checkTypes} */
    _glTexEnvfv = _emscripten_glTexEnvfv = (target, pname, param) => {
      GLImmediate.TexEnvJIT.hook_texEnvfv(target, pname, param);
      // Don't call old func, since we are the implementor.
      //glTexEnvfv(target, pname, param);
    };

    _glGetTexEnviv = (target, pname, param) => {
      GLImmediate.TexEnvJIT.hook_getTexEnviv(target, pname, param);
    };

    _glGetTexEnvfv = (target, pname, param) => {
      GLImmediate.TexEnvJIT.hook_getTexEnvfv(target, pname, param);
    };

    var glGetIntegerv = _glGetIntegerv;
    _glGetIntegerv = _emscripten_glGetIntegerv = (pname, params) => {
      switch (pname) {
        case 0x8B8D: { // GL_CURRENT_PROGRAM
          // Just query directly so we're working with WebGL objects.
          var cur = GLctx.getParameter(GLctx.CURRENT_PROGRAM);
          if (cur == GLImmediate.fixedFunctionProgram) {
            // Pretend we're not using a program.
            HEAP32[((params) >> 2)] = 0;
            return;
          }
          break;
        }
      }
      glGetIntegerv(pname, params);
    };
  },
  initted: false,
  init() {
    err('WARNING: using emscripten GL immediate mode emulation. This is very limited in what it supports');
    GLImmediate.initted = true;

    if (!Module.useWebGL) return; // a 2D canvas may be currently used TODO: make sure we are actually called in that case

    // User can override the maximum number of texture units that we emulate. Using fewer texture units increases runtime performance
    // slightly, so it is advantageous to choose as small value as needed.
    // Limit to a maximum of 28 to not overflow the state bits used for renderer caching (31 bits = 3 attributes + 28 texture units).
    GLImmediate.MAX_TEXTURES = Math.min(Module['GL_MAX_TEXTURE_IMAGE_UNITS'] || GLctx.getParameter(GLctx.MAX_TEXTURE_IMAGE_UNITS), 28);

    GLImmediate.TexEnvJIT.init(GLctx, GLImmediate.MAX_TEXTURES);

    GLImmediate.NUM_ATTRIBUTES = 3 /*pos+normal+color attributes*/ + GLImmediate.MAX_TEXTURES;
    GLImmediate.clientAttributes = [];
    GLEmulation.enabledClientAttribIndices = [];
    for (var i = 0; i < GLImmediate.NUM_ATTRIBUTES; i++) {
      GLImmediate.clientAttributes.push({});
      GLEmulation.enabledClientAttribIndices.push(false);
    }

    // Initialize matrix library
    // When user sets a matrix, increment a 'version number' on the new data, and when rendering, submit
    // the matrices to the shader program only if they have an old version of the data.
    GLImmediate.matrix = [];
    GLImmediate.matrixStack = [];
    GLImmediate.matrixVersion = [];
    for (var i = 0; i < 2 + GLImmediate.MAX_TEXTURES; i++) { // Modelview, Projection, plus one matrix for each texture coordinate.
      GLImmediate.matrixStack.push([]);
      GLImmediate.matrixVersion.push(0);
      GLImmediate.matrix.push(GLImmediate.matrixLib.mat4.create());
      GLImmediate.matrixLib.mat4.identity(GLImmediate.matrix[i]);
    }

    // Renderer cache
    GLImmediate.rendererCache = GLImmediate.MapTreeLib.create();

    // Buffers for data
    GLImmediate.tempData = new Float32Array(GL.MAX_TEMP_BUFFER_SIZE >> 2);
    GLImmediate.indexData = new Uint16Array(GL.MAX_TEMP_BUFFER_SIZE >> 1);

    GLImmediate.vertexDataU8 = new Uint8Array(GLImmediate.tempData.buffer);

    GL.generateTempBuffers(true, GL.currentContext);

    GLImmediate.clientColor = new Float32Array([1, 1, 1, 1]);
  },
  prepareClientAttributes(count, beginEnd) {
    // If no client attributes were modified since we were last called, do nothing. Note that this
    // does not work for glBegin/End, where we generate renderer components dynamically and then
    // disable them ourselves, but it does help with glDrawElements/Arrays.
    if (!GLImmediate.modifiedClientAttributes) {
      GLImmediate.vertexCounter = (GLImmediate.stride * count) / 4; // XXX assuming float
      return;
    }
    GLImmediate.modifiedClientAttributes = false;

    // The role of prepareClientAttributes is to examine the set of client-side vertex attribute buffers
    // that user code has submitted, and to prepare them to be uploaded to a VBO in GPU memory
    // (since WebGL does not support client-side rendering, i.e. rendering from vertex data in CPU memory)
    // User can submit vertex data generally in three different configurations:
    // 1. Fully planar: all attributes are in their own separate tightly-packed arrays in CPU memory.
    // 2. Fully interleaved: all attributes share a single array where data is interleaved something like (pos,uv,normal), (pos,uv,normal), ...
    // 3. Complex hybrid: Multiple separate arrays that either are sparsely strided, and/or partially interleave vertex attributes.

    // For simplicity, we support the case (2) as the fast case. For (1) and (3), we do a memory copy of the
    // vertex data here to prepare a relayouted buffer that is of the structure in case (2). The reason
    // for this is that it allows the emulation code to get away with using just one VBO buffer for rendering,
    // and not have to maintain multiple ones. Therefore cases (1) and (3) will be very slow, and case (2) is fast.

    // Detect which case we are in by using a quick heuristic by examining the strides of the buffers. If all the buffers have identical
    // stride, we assume we have case (2), otherwise we have something more complex.
    var clientStartPointer = 0x7FFFFFFF;
    var bytes = 0; // Total number of bytes taken up by a single vertex.
    var minStride = 0x7FFFFFFF;
    var maxStride = 0;
    var attributes = GLImmediate.liveClientAttributes;
    attributes.length = 0;
    for (var i = 0; i < 3 + GLImmediate.MAX_TEXTURES; i++) {
      if (GLImmediate.enabledClientAttributes[i]) {
        var attr = GLImmediate.clientAttributes[i];
        attributes.push(attr);
        clientStartPointer = Math.min(clientStartPointer, attr.pointer);
        attr.sizeBytes = attr.size * GL.byteSizeByType[attr.type - GL.byteSizeByTypeRoot];
        bytes += attr.sizeBytes;
        minStride = Math.min(minStride, attr.stride);
        maxStride = Math.max(maxStride, attr.stride);
      }
    }

    if ((minStride != maxStride || maxStride < bytes) && !beginEnd) {
      // We are in cases (1) or (3): slow path, shuffle the data around into a single interleaved vertex buffer.
      // The immediate-mode glBegin()/glEnd() vertex submission gets automatically generated in appropriate layout,
      // so never need to come down this path if that was used.
      GLImmediate.restrideBuffer ||= _malloc(GL.MAX_TEMP_BUFFER_SIZE);
      var start = GLImmediate.restrideBuffer;
      bytes = 0;
      // calculate restrided offsets and total size
      for (var i = 0; i < attributes.length; i++) {
        var attr = attributes[i];
        var size = attr.sizeBytes;
        if (size % 4 != 0) size += 4 - (size % 4); // align everything
        attr.offset = bytes;
        bytes += size;
      }
      // copy out the data (we need to know the stride for that, and define attr.pointer)
      for (var i = 0; i < attributes.length; i++) {
        var attr = attributes[i];
        var srcStride = Math.max(attr.sizeBytes, attr.stride);
        if ((srcStride & 3) == 0 && (attr.sizeBytes & 3) == 0) {
          var size4 = attr.sizeBytes >> 2;
          var srcStride4 = Math.max(attr.sizeBytes, attr.stride) >> 2;
          for (var j = 0; j < count; j++) {
            for (var k = 0; k < size4; k++) { // copy in chunks of 4 bytes, our alignment makes this possible
              HEAP32[((start + attr.offset + bytes * j) >> 2) + k] = HEAP32[(attr.pointer >> 2) + j * srcStride4 + k];
            }
          }
        } else {
          for (var j = 0; j < count; j++) {
            for (var k = 0; k < attr.sizeBytes; k++) { // source data was not aligned to multiples of 4, must copy byte by byte.
              HEAP8[start + attr.offset + bytes * j + k] = HEAP8[attr.pointer + j * srcStride + k];
            }
          }
        }
        attr.pointer = start + attr.offset;
      }
      GLImmediate.stride = bytes;
      GLImmediate.vertexPointer = start;
    } else {
      // case (2): fast path, all data is interleaved to a single vertex array so we can get away with a single VBO upload.
      if (GLctx.currentArrayBufferBinding) {
        GLImmediate.vertexPointer = 0;
      } else {
        GLImmediate.vertexPointer = clientStartPointer;
      }
      for (var i = 0; i < attributes.length; i++) {
        var attr = attributes[i];
        attr.offset = attr.pointer - GLImmediate.vertexPointer; // Compute what will be the offset of this attribute in the VBO after we upload.
      }
      GLImmediate.stride = Math.max(maxStride, bytes);
    }
    if (!beginEnd) {
      GLImmediate.vertexCounter = (GLImmediate.stride * count) / 4; // XXX assuming float
    }
  },
  flush(numProvidedIndexes, startIndex = 0, ptr = 0) {
    assert(numProvidedIndexes >= 0 || !numProvidedIndexes);
    var renderer = GLImmediate.getRenderer();

    // Generate index data in a format suitable for GLES 2.0/WebGL
    var numVertexes = 4 * GLImmediate.vertexCounter / GLImmediate.stride;
    if (!numVertexes) return;
    assert(numVertexes % 1 == 0, "`numVertexes` must be an integer.");
    var emulatedElementArrayBuffer = false;
    var numIndexes = 0;
    if (numProvidedIndexes) {
      numIndexes = numProvidedIndexes;
      if (!GLctx.currentArrayBufferBinding && GLImmediate.firstVertex > GLImmediate.lastVertex) {
        // Figure out the first and last vertex from the index data
        // If we are going to upload array buffer data, we need to find which range to
        // upload based on the indices. If they are in a buffer on the GPU, that is very
        // inconvenient! So if you do not have an array buffer, you should also not have
        // an element array buffer. But best is to use both buffers!
        assert(!GLctx.currentElementArrayBufferBinding);
        for (var i = 0; i < numProvidedIndexes; i++) {
          var currIndex = HEAPU16[(((ptr) + (i * 2)) >> 1)];
          GLImmediate.firstVertex = Math.min(GLImmediate.firstVertex, currIndex);
          GLImmediate.lastVertex = Math.max(GLImmediate.lastVertex, currIndex + 1);
        }
      }
      if (!GLctx.currentElementArrayBufferBinding) {
        // If no element array buffer is bound, then indices is a literal pointer to clientside data
        assert(numProvidedIndexes << 1 <= GL.MAX_TEMP_BUFFER_SIZE, 'too many immediate mode indexes (a)');
        var indexBuffer = GL.getTempIndexBuffer(numProvidedIndexes << 1);
        GLctx.bindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, indexBuffer);
        GLctx.bufferSubData(GLctx.ELEMENT_ARRAY_BUFFER, 0, HEAPU16.subarray((ptr) >> 1, (ptr + (numProvidedIndexes << 1)) >> 1));
        ptr = 0;
        emulatedElementArrayBuffer = true;
      }
    } else if (GLImmediate.mode > 6) { // above GL_TRIANGLE_FAN are the non-GL ES modes
      if (GLImmediate.mode != 7) throw 'unsupported immediate mode ' + GLImmediate.mode; // GL_QUADS
      // GLImmediate.firstVertex is the first vertex we want. Quad indexes are in the pattern
      // 0 1 2, 0 2 3, 4 5 6, 4 6 7, so we need to look at index firstVertex * 1.5 to see it.
      // Then since indexes are 2 bytes each, that means 3
      assert(GLImmediate.firstVertex % 4 == 0);
      ptr = GLImmediate.firstVertex * 3;
      var numQuads = numVertexes / 4;
      numIndexes = numQuads * 6; // 0 1 2, 0 2 3 pattern
      assert(ptr + (numIndexes << 1) <= GL.MAX_TEMP_BUFFER_SIZE, 'too many immediate mode indexes (b)');
      GLctx.bindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, GL.currentContext.tempQuadIndexBuffer);
      emulatedElementArrayBuffer = true;
      GLImmediate.mode = GLctx.TRIANGLES;
    }

    renderer.prepare();

    if (numIndexes) {
      GLctx.drawElements(GLImmediate.mode, numIndexes, GLctx.UNSIGNED_SHORT, ptr);
    } else {
      GLctx.drawArrays(GLImmediate.mode, startIndex, numVertexes);
    }

    if (emulatedElementArrayBuffer) {
      GLctx.bindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, GL.buffers[GLctx.currentElementArrayBufferBinding] || null);
    }

  },
};
GLImmediate.matrixLib = (function () {

  /**
   * @fileoverview gl-matrix - High performance matrix and vector operations for WebGL
   * @author Brandon Jones
   * @version 1.2.4
   */

  // Modifed for emscripten:
  // - Global scoping etc.
  // - Disabled some non-closure-compatible javadoc comments.

  /*
   * Copyright (c) 2011 Brandon Jones
   *
   * This software is provided 'as-is', without any express or implied
   * warranty. In no event will the authors be held liable for any damages
   * arising from the use of this software.
   *
   * Permission is granted to anyone to use this software for any purpose,
   * including commercial applications, and to alter it and redistribute it
   * freely, subject to the following restrictions:
   *
   *    1. The origin of this software must not be misrepresented; you must not
   *    claim that you wrote the original software. If you use this software
   *    in a product, an acknowledgment in the product documentation would be
   *    appreciated but is not required.
   *
   *    2. Altered source versions must be plainly marked as such, and must not
   *    be misrepresented as being the original software.
   *
   *    3. This notice may not be removed or altered from any source
   *    distribution.
   */


  /**
   * @class 3 Dimensional Vector
   * @name vec3
   */
  var vec3 = {};

  /**
   * @class 3x3 Matrix
   * @name mat3
   */
  var mat3 = {};

  /**
   * @class 4x4 Matrix
   * @name mat4
   */
  var mat4 = {};

  /**
   * @class Quaternion
   * @name quat4
   */
  var quat4 = {};

  var MatrixArray = Float32Array;

  /*
   * vec3
   */

  /**
   * Creates a new instance of a vec3 using the default array type
   * Any javascript array-like objects containing at least 3 numeric elements can serve as a vec3
   *
   * _param {vec3} [vec] vec3 containing values to initialize with
   *
   * _returns {vec3} New vec3
   */
  vec3.create = function (vec) {
    var dest = new MatrixArray(3);

    if (vec) {
      dest[0] = vec[0];
      dest[1] = vec[1];
      dest[2] = vec[2];
    } else {
      dest[0] = dest[1] = dest[2] = 0;
    }

    return dest;
  };

  /**
   * Copies the values of one vec3 to another
   *
   * _param {vec3} vec vec3 containing values to copy
   * _param {vec3} dest vec3 receiving copied values
   *
   * _returns {vec3} dest
   */
  vec3.set = function (vec, dest) {
    dest[0] = vec[0];
    dest[1] = vec[1];
    dest[2] = vec[2];

    return dest;
  };

  /**
   * Performs a vector addition
   *
   * _param {vec3} vec First operand
   * _param {vec3} vec2 Second operand
   * _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
   *
   * _returns {vec3} dest if specified, vec otherwise
   */
  vec3.add = function (vec, vec2, dest) {
    if (!dest || vec === dest) {
      vec[0] += vec2[0];
      vec[1] += vec2[1];
      vec[2] += vec2[2];
      return vec;
    }

    dest[0] = vec[0] + vec2[0];
    dest[1] = vec[1] + vec2[1];
    dest[2] = vec[2] + vec2[2];
    return dest;
  };

  /**
   * Performs a vector subtraction
   *
   * _param {vec3} vec First operand
   * _param {vec3} vec2 Second operand
   * _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
   *
   * _returns {vec3} dest if specified, vec otherwise
   */
  vec3.subtract = function (vec, vec2, dest) {
    if (!dest || vec === dest) {
      vec[0] -= vec2[0];
      vec[1] -= vec2[1];
      vec[2] -= vec2[2];
      return vec;
    }

    dest[0] = vec[0] - vec2[0];
    dest[1] = vec[1] - vec2[1];
    dest[2] = vec[2] - vec2[2];
    return dest;
  };

  /**
   * Performs a vector multiplication
   *
   * _param {vec3} vec First operand
   * _param {vec3} vec2 Second operand
   * _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
   *
   * _returns {vec3} dest if specified, vec otherwise
   */
  vec3.multiply = function (vec, vec2, dest) {
    if (!dest || vec === dest) {
      vec[0] *= vec2[0];
      vec[1] *= vec2[1];
      vec[2] *= vec2[2];
      return vec;
    }

    dest[0] = vec[0] * vec2[0];
    dest[1] = vec[1] * vec2[1];
    dest[2] = vec[2] * vec2[2];
    return dest;
  };

  /**
   * Negates the components of a vec3
   *
   * _param {vec3} vec vec3 to negate
   * _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
   *
   * _returns {vec3} dest if specified, vec otherwise
   */
  vec3.negate = function (vec, dest) {
    if (!dest) { dest = vec; }

    dest[0] = -vec[0];
    dest[1] = -vec[1];
    dest[2] = -vec[2];
    return dest;
  };

  /**
   * Multiplies the components of a vec3 by a scalar value
   *
   * _param {vec3} vec vec3 to scale
   * _param {number} val Value to scale by
   * _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
   *
   * _returns {vec3} dest if specified, vec otherwise
   */
  vec3.scale = function (vec, val, dest) {
    if (!dest || vec === dest) {
      vec[0] *= val;
      vec[1] *= val;
      vec[2] *= val;
      return vec;
    }

    dest[0] = vec[0] * val;
    dest[1] = vec[1] * val;
    dest[2] = vec[2] * val;
    return dest;
  };

  /**
   * Generates a unit vector of the same direction as the provided vec3
   * If vector length is 0, returns [0, 0, 0]
   *
   * _param {vec3} vec vec3 to normalize
   * _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
   *
   * _returns {vec3} dest if specified, vec otherwise
   */
  vec3.normalize = function (vec, dest) {
    if (!dest) { dest = vec; }

    var x = vec[0], y = vec[1], z = vec[2],
      len = Math.sqrt(x * x + y * y + z * z);

    if (!len) {
      dest[0] = 0;
      dest[1] = 0;
      dest[2] = 0;
      return dest;
    } else if (len === 1) {
      dest[0] = x;
      dest[1] = y;
      dest[2] = z;
      return dest;
    }

    len = 1 / len;
    dest[0] = x * len;
    dest[1] = y * len;
    dest[2] = z * len;
    return dest;
  };

  /**
   * Generates the cross product of two vec3s
   *
   * _param {vec3} vec First operand
   * _param {vec3} vec2 Second operand
   * _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
   *
   * _returns {vec3} dest if specified, vec otherwise
   */
  vec3.cross = function (vec, vec2, dest) {
    if (!dest) { dest = vec; }

    var x = vec[0], y = vec[1], z = vec[2],
      x2 = vec2[0], y2 = vec2[1], z2 = vec2[2];

    dest[0] = y * z2 - z * y2;
    dest[1] = z * x2 - x * z2;
    dest[2] = x * y2 - y * x2;
    return dest;
  };

  /**
   * Caclulates the length of a vec3
   *
   * _param {vec3} vec vec3 to calculate length of
   *
   * _returns {number} Length of vec
   */
  vec3.length = function (vec) {
    var x = vec[0], y = vec[1], z = vec[2];
    return Math.sqrt(x * x + y * y + z * z);
  };

  /**
   * Caclulates the dot product of two vec3s
   *
   * _param {vec3} vec First operand
   * _param {vec3} vec2 Second operand
   *
   * _returns {number} Dot product of vec and vec2
   */
  vec3.dot = function (vec, vec2) {
    return vec[0] * vec2[0] + vec[1] * vec2[1] + vec[2] * vec2[2];
  };

  /**
   * Generates a unit vector pointing from one vector to another
   *
   * _param {vec3} vec Origin vec3
   * _param {vec3} vec2 vec3 to point to
   * _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
   *
   * _returns {vec3} dest if specified, vec otherwise
   */
  vec3.direction = function (vec, vec2, dest) {
    if (!dest) { dest = vec; }

    var x = vec[0] - vec2[0],
      y = vec[1] - vec2[1],
      z = vec[2] - vec2[2],
      len = Math.sqrt(x * x + y * y + z * z);

    if (!len) {
      dest[0] = 0;
      dest[1] = 0;
      dest[2] = 0;
      return dest;
    }

    len = 1 / len;
    dest[0] = x * len;
    dest[1] = y * len;
    dest[2] = z * len;
    return dest;
  };

  /**
   * Performs a linear interpolation between two vec3
   *
   * _param {vec3} vec First vector
   * _param {vec3} vec2 Second vector
   * _param {number} lerp Interpolation amount between the two inputs
   * _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
   *
   * _returns {vec3} dest if specified, vec otherwise
   */
  vec3.lerp = function (vec, vec2, lerp, dest) {
    if (!dest) { dest = vec; }

    dest[0] = vec[0] + lerp * (vec2[0] - vec[0]);
    dest[1] = vec[1] + lerp * (vec2[1] - vec[1]);
    dest[2] = vec[2] + lerp * (vec2[2] - vec[2]);

    return dest;
  };

  /**
   * Calculates the euclidian distance between two vec3
   *
   * Params:
   * _param {vec3} vec First vector
   * _param {vec3} vec2 Second vector
   *
   * _returns {number} Distance between vec and vec2
   */
  vec3.dist = function (vec, vec2) {
    var x = vec2[0] - vec[0],
      y = vec2[1] - vec[1],
      z = vec2[2] - vec[2];

    return Math.sqrt(x * x + y * y + z * z);
  };

  /**
   * Projects the specified vec3 from screen space into object space
   * Based on the <a href="http://webcvs.freedesktop.org/mesa/Mesa/src/glu/mesa/project.c?revision=1.4&view=markup">Mesa gluUnProject implementation</a>
   *
   * _param {vec3} vec Screen-space vector to project
   * _param {mat4} view View matrix
   * _param {mat4} proj Projection matrix
   * _param {vec4} viewport Viewport as given to gl.viewport [x, y, width, height]
   * _param {vec3} [dest] vec3 receiving unprojected result. If not specified result is written to vec
   *
   * _returns {vec3} dest if specified, vec otherwise
   */
  vec3.unproject = function (vec, view, proj, viewport, dest) {
    if (!dest) { dest = vec; }

    var m = mat4.create();
    var v = new MatrixArray(4);

    v[0] = (vec[0] - viewport[0]) * 2.0 / viewport[2] - 1.0;
    v[1] = (vec[1] - viewport[1]) * 2.0 / viewport[3] - 1.0;
    v[2] = 2.0 * vec[2] - 1.0;
    v[3] = 1.0;

    mat4.multiply(proj, view, m);
    if (!mat4.inverse(m)) { return null; }

    mat4.multiplyVec4(m, v);
    if (v[3] === 0.0) { return null; }

    dest[0] = v[0] / v[3];
    dest[1] = v[1] / v[3];
    dest[2] = v[2] / v[3];

    return dest;
  };

  /**
   * Returns a string representation of a vector
   *
   * _param {vec3} vec Vector to represent as a string
   *
   * _returns {string} String representation of vec
   */
  vec3.str = function (vec) {
    return '[' + vec[0] + ', ' + vec[1] + ', ' + vec[2] + ']';
  };

  /*
   * mat3
   */

  /**
   * Creates a new instance of a mat3 using the default array type
   * Any javascript array-like object containing at least 9 numeric elements can serve as a mat3
   *
   * _param {mat3} [mat] mat3 containing values to initialize with
   *
   * _returns {mat3} New mat3
   *
   * @param {Object=} mat
   */
  mat3.create = function (mat) {
    var dest = new MatrixArray(9);

    if (mat) {
      dest[0] = mat[0];
      dest[1] = mat[1];
      dest[2] = mat[2];
      dest[3] = mat[3];
      dest[4] = mat[4];
      dest[5] = mat[5];
      dest[6] = mat[6];
      dest[7] = mat[7];
      dest[8] = mat[8];
    }

    return dest;
  };

  /**
   * Copies the values of one mat3 to another
   *
   * _param {mat3} mat mat3 containing values to copy
   * _param {mat3} dest mat3 receiving copied values
   *
   * _returns {mat3} dest
   */
  mat3.set = function (mat, dest) {
    dest[0] = mat[0];
    dest[1] = mat[1];
    dest[2] = mat[2];
    dest[3] = mat[3];
    dest[4] = mat[4];
    dest[5] = mat[5];
    dest[6] = mat[6];
    dest[7] = mat[7];
    dest[8] = mat[8];
    return dest;
  };

  /**
   * Sets a mat3 to an identity matrix
   *
   * _param {mat3} dest mat3 to set
   *
   * _returns dest if specified, otherwise a new mat3
   */
  mat3.identity = function (dest) {
    if (!dest) { dest = mat3.create(); }
    dest[0] = 1;
    dest[1] = 0;
    dest[2] = 0;
    dest[3] = 0;
    dest[4] = 1;
    dest[5] = 0;
    dest[6] = 0;
    dest[7] = 0;
    dest[8] = 1;
    return dest;
  };

  /**
   * Transposes a mat3 (flips the values over the diagonal)
   *
   * Params:
   * _param {mat3} mat mat3 to transpose
   * _param {mat3} [dest] mat3 receiving transposed values. If not specified result is written to mat
   */
  mat3.transpose = function (mat, dest) {
    // If we are transposing ourselves we can skip a few steps but have to cache some values
    if (!dest || mat === dest) {
      var a01 = mat[1], a02 = mat[2],
        a12 = mat[5];

      mat[1] = mat[3];
      mat[2] = mat[6];
      mat[3] = a01;
      mat[5] = mat[7];
      mat[6] = a02;
      mat[7] = a12;
      return mat;
    }

    dest[0] = mat[0];
    dest[1] = mat[3];
    dest[2] = mat[6];
    dest[3] = mat[1];
    dest[4] = mat[4];
    dest[5] = mat[7];
    dest[6] = mat[2];
    dest[7] = mat[5];
    dest[8] = mat[8];
    return dest;
  };

  /**
   * Copies the elements of a mat3 into the upper 3x3 elements of a mat4
   *
   * _param {mat3} mat mat3 containing values to copy
   * _param {mat4} [dest] mat4 receiving copied values
   *
   * _returns {mat4} dest if specified, a new mat4 otherwise
   */
  mat3.toMat4 = function (mat, dest) {
    if (!dest) { dest = mat4.create(); }

    dest[15] = 1;
    dest[14] = 0;
    dest[13] = 0;
    dest[12] = 0;

    dest[11] = 0;
    dest[10] = mat[8];
    dest[9] = mat[7];
    dest[8] = mat[6];

    dest[7] = 0;
    dest[6] = mat[5];
    dest[5] = mat[4];
    dest[4] = mat[3];

    dest[3] = 0;
    dest[2] = mat[2];
    dest[1] = mat[1];
    dest[0] = mat[0];

    return dest;
  };

  /**
   * Returns a string representation of a mat3
   *
   * _param {mat3} mat mat3 to represent as a string
   *
   * _param {string} String representation of mat
   */
  mat3.str = function (mat) {
    return '[' + mat[0] + ', ' + mat[1] + ', ' + mat[2] +
      ', ' + mat[3] + ', ' + mat[4] + ', ' + mat[5] +
      ', ' + mat[6] + ', ' + mat[7] + ', ' + mat[8] + ']';
  };

  /*
   * mat4
   */

  /**
   * Creates a new instance of a mat4 using the default array type
   * Any javascript array-like object containing at least 16 numeric elements can serve as a mat4
   *
   * _param {mat4} [mat] mat4 containing values to initialize with
   *
   * _returns {mat4} New mat4
   *
   * @param {Object=} mat
   */
  mat4.create = function (mat) {
    var dest = new MatrixArray(16);

    if (mat) {
      dest[0] = mat[0];
      dest[1] = mat[1];
      dest[2] = mat[2];
      dest[3] = mat[3];
      dest[4] = mat[4];
      dest[5] = mat[5];
      dest[6] = mat[6];
      dest[7] = mat[7];
      dest[8] = mat[8];
      dest[9] = mat[9];
      dest[10] = mat[10];
      dest[11] = mat[11];
      dest[12] = mat[12];
      dest[13] = mat[13];
      dest[14] = mat[14];
      dest[15] = mat[15];
    }

    return dest;
  };

  /**
   * Copies the values of one mat4 to another
   *
   * _param {mat4} mat mat4 containing values to copy
   * _param {mat4} dest mat4 receiving copied values
   *
   * _returns {mat4} dest
   */
  mat4.set = function (mat, dest) {
    dest[0] = mat[0];
    dest[1] = mat[1];
    dest[2] = mat[2];
    dest[3] = mat[3];
    dest[4] = mat[4];
    dest[5] = mat[5];
    dest[6] = mat[6];
    dest[7] = mat[7];
    dest[8] = mat[8];
    dest[9] = mat[9];
    dest[10] = mat[10];
    dest[11] = mat[11];
    dest[12] = mat[12];
    dest[13] = mat[13];
    dest[14] = mat[14];
    dest[15] = mat[15];
    return dest;
  };

  /**
   * Sets a mat4 to an identity matrix
   *
   * _param {mat4} dest mat4 to set
   *
   * _returns {mat4} dest
   */
  mat4.identity = function (dest) {
    if (!dest) { dest = mat4.create(); }
    dest[0] = 1;
    dest[1] = 0;
    dest[2] = 0;
    dest[3] = 0;
    dest[4] = 0;
    dest[5] = 1;
    dest[6] = 0;
    dest[7] = 0;
    dest[8] = 0;
    dest[9] = 0;
    dest[10] = 1;
    dest[11] = 0;
    dest[12] = 0;
    dest[13] = 0;
    dest[14] = 0;
    dest[15] = 1;
    return dest;
  };

  /**
   * Transposes a mat4 (flips the values over the diagonal)
   *
   * _param {mat4} mat mat4 to transpose
   * _param {mat4} [dest] mat4 receiving transposed values. If not specified result is written to mat
   */
  mat4.transpose = function (mat, dest) {
    // If we are transposing ourselves we can skip a few steps but have to cache some values
    if (!dest || mat === dest) {
      var a01 = mat[1], a02 = mat[2], a03 = mat[3],
        a12 = mat[6], a13 = mat[7],
        a23 = mat[11];

      mat[1] = mat[4];
      mat[2] = mat[8];
      mat[3] = mat[12];
      mat[4] = a01;
      mat[6] = mat[9];
      mat[7] = mat[13];
      mat[8] = a02;
      mat[9] = a12;
      mat[11] = mat[14];
      mat[12] = a03;
      mat[13] = a13;
      mat[14] = a23;
      return mat;
    }

    dest[0] = mat[0];
    dest[1] = mat[4];
    dest[2] = mat[8];
    dest[3] = mat[12];
    dest[4] = mat[1];
    dest[5] = mat[5];
    dest[6] = mat[9];
    dest[7] = mat[13];
    dest[8] = mat[2];
    dest[9] = mat[6];
    dest[10] = mat[10];
    dest[11] = mat[14];
    dest[12] = mat[3];
    dest[13] = mat[7];
    dest[14] = mat[11];
    dest[15] = mat[15];
    return dest;
  };

  /**
   * Calculates the determinant of a mat4
   *
   * _param {mat4} mat mat4 to calculate determinant of
   *
   * _returns {number} determinant of mat
   */
  mat4.determinant = function (mat) {
    // Cache the matrix values (makes for huge speed increases!)
    var a00 = mat[0], a01 = mat[1], a02 = mat[2], a03 = mat[3],
      a10 = mat[4], a11 = mat[5], a12 = mat[6], a13 = mat[7],
      a20 = mat[8], a21 = mat[9], a22 = mat[10], a23 = mat[11],
      a30 = mat[12], a31 = mat[13], a32 = mat[14], a33 = mat[15];

    return (a30 * a21 * a12 * a03 - a20 * a31 * a12 * a03 - a30 * a11 * a22 * a03 + a10 * a31 * a22 * a03 +
      a20 * a11 * a32 * a03 - a10 * a21 * a32 * a03 - a30 * a21 * a02 * a13 + a20 * a31 * a02 * a13 +
      a30 * a01 * a22 * a13 - a00 * a31 * a22 * a13 - a20 * a01 * a32 * a13 + a00 * a21 * a32 * a13 +
      a30 * a11 * a02 * a23 - a10 * a31 * a02 * a23 - a30 * a01 * a12 * a23 + a00 * a31 * a12 * a23 +
      a10 * a01 * a32 * a23 - a00 * a11 * a32 * a23 - a20 * a11 * a02 * a33 + a10 * a21 * a02 * a33 +
      a20 * a01 * a12 * a33 - a00 * a21 * a12 * a33 - a10 * a01 * a22 * a33 + a00 * a11 * a22 * a33);
  };

  /**
   * Calculates the inverse matrix of a mat4
   *
   * _param {mat4} mat mat4 to calculate inverse of
   * _param {mat4} [dest] mat4 receiving inverse matrix. If not specified result is written to mat, null if matrix cannot be inverted
   *
   * @param {Object=} dest
   */
  mat4.inverse = function (mat, dest) {
    if (!dest) { dest = mat; }

    // Cache the matrix values (makes for huge speed increases!)
    var a00 = mat[0], a01 = mat[1], a02 = mat[2], a03 = mat[3],
      a10 = mat[4], a11 = mat[5], a12 = mat[6], a13 = mat[7],
      a20 = mat[8], a21 = mat[9], a22 = mat[10], a23 = mat[11],
      a30 = mat[12], a31 = mat[13], a32 = mat[14], a33 = mat[15],

      b00 = a00 * a11 - a01 * a10,
      b01 = a00 * a12 - a02 * a10,
      b02 = a00 * a13 - a03 * a10,
      b03 = a01 * a12 - a02 * a11,
      b04 = a01 * a13 - a03 * a11,
      b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30,
      b07 = a20 * a32 - a22 * a30,
      b08 = a20 * a33 - a23 * a30,
      b09 = a21 * a32 - a22 * a31,
      b10 = a21 * a33 - a23 * a31,
      b11 = a22 * a33 - a23 * a32,

      d = (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06),
      invDet;

    // Calculate the determinant
    if (!d) { return null; }
    invDet = 1 / d;

    dest[0] = (a11 * b11 - a12 * b10 + a13 * b09) * invDet;
    dest[1] = (-a01 * b11 + a02 * b10 - a03 * b09) * invDet;
    dest[2] = (a31 * b05 - a32 * b04 + a33 * b03) * invDet;
    dest[3] = (-a21 * b05 + a22 * b04 - a23 * b03) * invDet;
    dest[4] = (-a10 * b11 + a12 * b08 - a13 * b07) * invDet;
    dest[5] = (a00 * b11 - a02 * b08 + a03 * b07) * invDet;
    dest[6] = (-a30 * b05 + a32 * b02 - a33 * b01) * invDet;
    dest[7] = (a20 * b05 - a22 * b02 + a23 * b01) * invDet;
    dest[8] = (a10 * b10 - a11 * b08 + a13 * b06) * invDet;
    dest[9] = (-a00 * b10 + a01 * b08 - a03 * b06) * invDet;
    dest[10] = (a30 * b04 - a31 * b02 + a33 * b00) * invDet;
    dest[11] = (-a20 * b04 + a21 * b02 - a23 * b00) * invDet;
    dest[12] = (-a10 * b09 + a11 * b07 - a12 * b06) * invDet;
    dest[13] = (a00 * b09 - a01 * b07 + a02 * b06) * invDet;
    dest[14] = (-a30 * b03 + a31 * b01 - a32 * b00) * invDet;
    dest[15] = (a20 * b03 - a21 * b01 + a22 * b00) * invDet;

    return dest;
  };

  /**
   * Copies the upper 3x3 elements of a mat4 into another mat4
   *
   * _param {mat4} mat mat4 containing values to copy
   * _param {mat4} [dest] mat4 receiving copied values
   *
   * _returns {mat4} dest is specified, a new mat4 otherwise
   */
  mat4.toRotationMat = function (mat, dest) {
    if (!dest) { dest = mat4.create(); }

    dest[0] = mat[0];
    dest[1] = mat[1];
    dest[2] = mat[2];
    dest[3] = mat[3];
    dest[4] = mat[4];
    dest[5] = mat[5];
    dest[6] = mat[6];
    dest[7] = mat[7];
    dest[8] = mat[8];
    dest[9] = mat[9];
    dest[10] = mat[10];
    dest[11] = mat[11];
    dest[12] = 0;
    dest[13] = 0;
    dest[14] = 0;
    dest[15] = 1;

    return dest;
  };

  /**
   * Copies the upper 3x3 elements of a mat4 into a mat3
   *
   * _param {mat4} mat mat4 containing values to copy
   * _param {mat3} [dest] mat3 receiving copied values
   *
   * _returns {mat3} dest is specified, a new mat3 otherwise
   */
  mat4.toMat3 = function (mat, dest) {
    if (!dest) { dest = mat3.create(); }

    dest[0] = mat[0];
    dest[1] = mat[1];
    dest[2] = mat[2];
    dest[3] = mat[4];
    dest[4] = mat[5];
    dest[5] = mat[6];
    dest[6] = mat[8];
    dest[7] = mat[9];
    dest[8] = mat[10];

    return dest;
  };

  /**
   * Calculates the inverse of the upper 3x3 elements of a mat4 and copies the result into a mat3
   * The resulting matrix is useful for calculating transformed normals
   *
   * Params:
   * _param {mat4} mat mat4 containing values to invert and copy
   * _param {mat3} [dest] mat3 receiving values
   *
   * _returns {mat3} dest is specified, a new mat3 otherwise, null if the matrix cannot be inverted
   */
  mat4.toInverseMat3 = function (mat, dest) {
    // Cache the matrix values (makes for huge speed increases!)
    var a00 = mat[0], a01 = mat[1], a02 = mat[2],
      a10 = mat[4], a11 = mat[5], a12 = mat[6],
      a20 = mat[8], a21 = mat[9], a22 = mat[10],

      b01 = a22 * a11 - a12 * a21,
      b11 = -a22 * a10 + a12 * a20,
      b21 = a21 * a10 - a11 * a20,

      d = a00 * b01 + a01 * b11 + a02 * b21,
      id;

    if (!d) { return null; }
    id = 1 / d;

    if (!dest) { dest = mat3.create(); }

    dest[0] = b01 * id;
    dest[1] = (-a22 * a01 + a02 * a21) * id;
    dest[2] = (a12 * a01 - a02 * a11) * id;
    dest[3] = b11 * id;
    dest[4] = (a22 * a00 - a02 * a20) * id;
    dest[5] = (-a12 * a00 + a02 * a10) * id;
    dest[6] = b21 * id;
    dest[7] = (-a21 * a00 + a01 * a20) * id;
    dest[8] = (a11 * a00 - a01 * a10) * id;

    return dest;
  };

  /**
   * Performs a matrix multiplication
   *
   * _param {mat4} mat First operand
   * _param {mat4} mat2 Second operand
   * _param {mat4} [dest] mat4 receiving operation result. If not specified result is written to mat
   */
  mat4.multiply = function (mat, mat2, dest) {
    if (!dest) { dest = mat; }

    // Cache the matrix values (makes for huge speed increases!)
    var a00 = mat[0], a01 = mat[1], a02 = mat[2], a03 = mat[3],
      a10 = mat[4], a11 = mat[5], a12 = mat[6], a13 = mat[7],
      a20 = mat[8], a21 = mat[9], a22 = mat[10], a23 = mat[11],
      a30 = mat[12], a31 = mat[13], a32 = mat[14], a33 = mat[15],

      b00 = mat2[0], b01 = mat2[1], b02 = mat2[2], b03 = mat2[3],
      b10 = mat2[4], b11 = mat2[5], b12 = mat2[6], b13 = mat2[7],
      b20 = mat2[8], b21 = mat2[9], b22 = mat2[10], b23 = mat2[11],
      b30 = mat2[12], b31 = mat2[13], b32 = mat2[14], b33 = mat2[15];

    dest[0] = b00 * a00 + b01 * a10 + b02 * a20 + b03 * a30;
    dest[1] = b00 * a01 + b01 * a11 + b02 * a21 + b03 * a31;
    dest[2] = b00 * a02 + b01 * a12 + b02 * a22 + b03 * a32;
    dest[3] = b00 * a03 + b01 * a13 + b02 * a23 + b03 * a33;
    dest[4] = b10 * a00 + b11 * a10 + b12 * a20 + b13 * a30;
    dest[5] = b10 * a01 + b11 * a11 + b12 * a21 + b13 * a31;
    dest[6] = b10 * a02 + b11 * a12 + b12 * a22 + b13 * a32;
    dest[7] = b10 * a03 + b11 * a13 + b12 * a23 + b13 * a33;
    dest[8] = b20 * a00 + b21 * a10 + b22 * a20 + b23 * a30;
    dest[9] = b20 * a01 + b21 * a11 + b22 * a21 + b23 * a31;
    dest[10] = b20 * a02 + b21 * a12 + b22 * a22 + b23 * a32;
    dest[11] = b20 * a03 + b21 * a13 + b22 * a23 + b23 * a33;
    dest[12] = b30 * a00 + b31 * a10 + b32 * a20 + b33 * a30;
    dest[13] = b30 * a01 + b31 * a11 + b32 * a21 + b33 * a31;
    dest[14] = b30 * a02 + b31 * a12 + b32 * a22 + b33 * a32;
    dest[15] = b30 * a03 + b31 * a13 + b32 * a23 + b33 * a33;

    return dest;
  };

  /**
   * Transforms a vec3 with the given matrix
   * 4th vector component is implicitly '1'
   *
   * _param {mat4} mat mat4 to transform the vector with
   * _param {vec3} vec vec3 to transform
   * _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
   *
   * _returns {vec3} dest if specified, vec otherwise
   */
  mat4.multiplyVec3 = function (mat, vec, dest) {
    if (!dest) { dest = vec; }

    var x = vec[0], y = vec[1], z = vec[2];

    dest[0] = mat[0] * x + mat[4] * y + mat[8] * z + mat[12];
    dest[1] = mat[1] * x + mat[5] * y + mat[9] * z + mat[13];
    dest[2] = mat[2] * x + mat[6] * y + mat[10] * z + mat[14];

    return dest;
  };

  /**
   * Transforms a vec4 with the given matrix
   *
   * _param {mat4} mat mat4 to transform the vector with
   * _param {vec4} vec vec4 to transform
   * _param {vec4} [dest] vec4 receiving operation result. If not specified result is written to vec
   *
   * _returns {vec4} dest if specified, vec otherwise
   *
   * @param {Object=} dest
   */
  mat4.multiplyVec4 = function (mat, vec, dest) {
    if (!dest) { dest = vec; }

    var x = vec[0], y = vec[1], z = vec[2], w = vec[3];

    dest[0] = mat[0] * x + mat[4] * y + mat[8] * z + mat[12] * w;
    dest[1] = mat[1] * x + mat[5] * y + mat[9] * z + mat[13] * w;
    dest[2] = mat[2] * x + mat[6] * y + mat[10] * z + mat[14] * w;
    dest[3] = mat[3] * x + mat[7] * y + mat[11] * z + mat[15] * w;

    return dest;
  };

  /**
   * Translates a matrix by the given vector
   *
   * _param {mat4} mat mat4 to translate
   * _param {vec3} vec vec3 specifying the translation
   * _param {mat4} [dest] mat4 receiving operation result. If not specified result is written to mat
   */
  mat4.translate = function (mat, vec, dest) {
    var x = vec[0], y = vec[1], z = vec[2],
      a00, a01, a02, a03,
      a10, a11, a12, a13,
      a20, a21, a22, a23;

    if (!dest || mat === dest) {
      mat[12] = mat[0] * x + mat[4] * y + mat[8] * z + mat[12];
      mat[13] = mat[1] * x + mat[5] * y + mat[9] * z + mat[13];
      mat[14] = mat[2] * x + mat[6] * y + mat[10] * z + mat[14];
      mat[15] = mat[3] * x + mat[7] * y + mat[11] * z + mat[15];
      return mat;
    }

    a00 = mat[0]; a01 = mat[1]; a02 = mat[2]; a03 = mat[3];
    a10 = mat[4]; a11 = mat[5]; a12 = mat[6]; a13 = mat[7];
    a20 = mat[8]; a21 = mat[9]; a22 = mat[10]; a23 = mat[11];

    dest[0] = a00; dest[1] = a01; dest[2] = a02; dest[3] = a03;
    dest[4] = a10; dest[5] = a11; dest[6] = a12; dest[7] = a13;
    dest[8] = a20; dest[9] = a21; dest[10] = a22; dest[11] = a23;

    dest[12] = a00 * x + a10 * y + a20 * z + mat[12];
    dest[13] = a01 * x + a11 * y + a21 * z + mat[13];
    dest[14] = a02 * x + a12 * y + a22 * z + mat[14];
    dest[15] = a03 * x + a13 * y + a23 * z + mat[15];
    return dest;
  };

  /**
   * Scales a matrix by the given vector
   *
   * _param {mat4} mat mat4 to scale
   * _param {vec3} vec vec3 specifying the scale for each axis
   * _param {mat4} [dest] mat4 receiving operation result. If not specified result is written to mat
   */
  mat4.scale = function (mat, vec, dest) {
    var x = vec[0], y = vec[1], z = vec[2];

    if (!dest || mat === dest) {
      mat[0] *= x;
      mat[1] *= x;
      mat[2] *= x;
      mat[3] *= x;
      mat[4] *= y;
      mat[5] *= y;
      mat[6] *= y;
      mat[7] *= y;
      mat[8] *= z;
      mat[9] *= z;
      mat[10] *= z;
      mat[11] *= z;
      return mat;
    }

    dest[0] = mat[0] * x;
    dest[1] = mat[1] * x;
    dest[2] = mat[2] * x;
    dest[3] = mat[3] * x;
    dest[4] = mat[4] * y;
    dest[5] = mat[5] * y;
    dest[6] = mat[6] * y;
    dest[7] = mat[7] * y;
    dest[8] = mat[8] * z;
    dest[9] = mat[9] * z;
    dest[10] = mat[10] * z;
    dest[11] = mat[11] * z;
    dest[12] = mat[12];
    dest[13] = mat[13];
    dest[14] = mat[14];
    dest[15] = mat[15];
    return dest;
  };

  /**
   * Rotates a matrix by the given angle around the specified axis
   * If rotating around a primary axis (X,Y,Z) one of the specialized rotation functions should be used instead for performance
   *
   * _param {mat4} mat mat4 to rotate
   * _param {number} angle Angle (in radians) to rotate
   * _param {vec3} axis vec3 representing the axis to rotate around
   * _param {mat4} [dest] mat4 receiving operation result. If not specified result is written to mat
   */
  mat4.rotate = function (mat, angle, axis, dest) {
    var x = axis[0], y = axis[1], z = axis[2],
      len = Math.sqrt(x * x + y * y + z * z),
      s, c, t,
      a00, a01, a02, a03,
      a10, a11, a12, a13,
      a20, a21, a22, a23,
      b00, b01, b02,
      b10, b11, b12,
      b20, b21, b22;

    if (!len) { return null; }
    if (len !== 1) {
      len = 1 / len;
      x *= len;
      y *= len;
      z *= len;
    }

    s = Math.sin(angle);
    c = Math.cos(angle);
    t = 1 - c;

    a00 = mat[0]; a01 = mat[1]; a02 = mat[2]; a03 = mat[3];
    a10 = mat[4]; a11 = mat[5]; a12 = mat[6]; a13 = mat[7];
    a20 = mat[8]; a21 = mat[9]; a22 = mat[10]; a23 = mat[11];

    // Construct the elements of the rotation matrix
    b00 = x * x * t + c; b01 = y * x * t + z * s; b02 = z * x * t - y * s;
    b10 = x * y * t - z * s; b11 = y * y * t + c; b12 = z * y * t + x * s;
    b20 = x * z * t + y * s; b21 = y * z * t - x * s; b22 = z * z * t + c;

    if (!dest) {
      dest = mat;
    } else if (mat !== dest) { // If the source and destination differ, copy the unchanged last row
      dest[12] = mat[12];
      dest[13] = mat[13];
      dest[14] = mat[14];
      dest[15] = mat[15];
    }

    // Perform rotation-specific matrix multiplication
    dest[0] = a00 * b00 + a10 * b01 + a20 * b02;
    dest[1] = a01 * b00 + a11 * b01 + a21 * b02;
    dest[2] = a02 * b00 + a12 * b01 + a22 * b02;
    dest[3] = a03 * b00 + a13 * b01 + a23 * b02;

    dest[4] = a00 * b10 + a10 * b11 + a20 * b12;
    dest[5] = a01 * b10 + a11 * b11 + a21 * b12;
    dest[6] = a02 * b10 + a12 * b11 + a22 * b12;
    dest[7] = a03 * b10 + a13 * b11 + a23 * b12;

    dest[8] = a00 * b20 + a10 * b21 + a20 * b22;
    dest[9] = a01 * b20 + a11 * b21 + a21 * b22;
    dest[10] = a02 * b20 + a12 * b21 + a22 * b22;
    dest[11] = a03 * b20 + a13 * b21 + a23 * b22;
    return dest;
  };

  /**
   * Rotates a matrix by the given angle around the X axis
   *
   * _param {mat4} mat mat4 to rotate
   * _param {number} angle Angle (in radians) to rotate
   * _param {mat4} [dest] mat4 receiving operation result. If not specified result is written to mat
   */
  mat4.rotateX = function (mat, angle, dest) {
    var s = Math.sin(angle),
      c = Math.cos(angle),
      a10 = mat[4],
      a11 = mat[5],
      a12 = mat[6],
      a13 = mat[7],
      a20 = mat[8],
      a21 = mat[9],
      a22 = mat[10],
      a23 = mat[11];

    if (!dest) {
      dest = mat;
    } else if (mat !== dest) { // If the source and destination differ, copy the unchanged rows
      dest[0] = mat[0];
      dest[1] = mat[1];
      dest[2] = mat[2];
      dest[3] = mat[3];

      dest[12] = mat[12];
      dest[13] = mat[13];
      dest[14] = mat[14];
      dest[15] = mat[15];
    }

    // Perform axis-specific matrix multiplication
    dest[4] = a10 * c + a20 * s;
    dest[5] = a11 * c + a21 * s;
    dest[6] = a12 * c + a22 * s;
    dest[7] = a13 * c + a23 * s;

    dest[8] = a10 * -s + a20 * c;
    dest[9] = a11 * -s + a21 * c;
    dest[10] = a12 * -s + a22 * c;
    dest[11] = a13 * -s + a23 * c;
    return dest;
  };

  /**
   * Rotates a matrix by the given angle around the Y axis
   *
   * _param {mat4} mat mat4 to rotate
   * _param {number} angle Angle (in radians) to rotate
   * _param {mat4} [dest] mat4 receiving operation result. If not specified result is written to mat
   */
  mat4.rotateY = function (mat, angle, dest) {
    var s = Math.sin(angle),
      c = Math.cos(angle),
      a00 = mat[0],
      a01 = mat[1],
      a02 = mat[2],
      a03 = mat[3],
      a20 = mat[8],
      a21 = mat[9],
      a22 = mat[10],
      a23 = mat[11];

    if (!dest) {
      dest = mat;
    } else if (mat !== dest) { // If the source and destination differ, copy the unchanged rows
      dest[4] = mat[4];
      dest[5] = mat[5];
      dest[6] = mat[6];
      dest[7] = mat[7];

      dest[12] = mat[12];
      dest[13] = mat[13];
      dest[14] = mat[14];
      dest[15] = mat[15];
    }

    // Perform axis-specific matrix multiplication
    dest[0] = a00 * c + a20 * -s;
    dest[1] = a01 * c + a21 * -s;
    dest[2] = a02 * c + a22 * -s;
    dest[3] = a03 * c + a23 * -s;

    dest[8] = a00 * s + a20 * c;
    dest[9] = a01 * s + a21 * c;
    dest[10] = a02 * s + a22 * c;
    dest[11] = a03 * s + a23 * c;
    return dest;
  };

  /**
   * Rotates a matrix by the given angle around the Z axis
   *
   * _param {mat4} mat mat4 to rotate
   * _param {number} angle Angle (in radians) to rotate
   * _param {mat4} [dest] mat4 receiving operation result. If not specified result is written to mat
   */
  mat4.rotateZ = function (mat, angle, dest) {
    var s = Math.sin(angle),
      c = Math.cos(angle),
      a00 = mat[0],
      a01 = mat[1],
      a02 = mat[2],
      a03 = mat[3],
      a10 = mat[4],
      a11 = mat[5],
      a12 = mat[6],
      a13 = mat[7];

    if (!dest) {
      dest = mat;
    } else if (mat !== dest) { // If the source and destination differ, copy the unchanged last row
      dest[8] = mat[8];
      dest[9] = mat[9];
      dest[10] = mat[10];
      dest[11] = mat[11];

      dest[12] = mat[12];
      dest[13] = mat[13];
      dest[14] = mat[14];
      dest[15] = mat[15];
    }

    // Perform axis-specific matrix multiplication
    dest[0] = a00 * c + a10 * s;
    dest[1] = a01 * c + a11 * s;
    dest[2] = a02 * c + a12 * s;
    dest[3] = a03 * c + a13 * s;

    dest[4] = a00 * -s + a10 * c;
    dest[5] = a01 * -s + a11 * c;
    dest[6] = a02 * -s + a12 * c;
    dest[7] = a03 * -s + a13 * c;

    return dest;
  };

  /**
   * Generates a frustum matrix with the given bounds
   *
   * _param {number} left Left bound of the frustum
   * _param {number} right Right bound of the frustum
   * _param {number} bottom Bottom bound of the frustum
   * _param {number} top Top bound of the frustum
   * _param {number} near Near bound of the frustum
   * _param {number} far Far bound of the frustum
   * _param {mat4} [dest] mat4 frustum matrix will be written into
   *
   * _returns {mat4} dest if specified, a new mat4 otherwise
   */
  mat4.frustum = function (left, right, bottom, top, near, far, dest) {
    if (!dest) { dest = mat4.create(); }
    var rl = (right - left),
      tb = (top - bottom),
      fn = (far - near);
    dest[0] = (near * 2) / rl;
    dest[1] = 0;
    dest[2] = 0;
    dest[3] = 0;
    dest[4] = 0;
    dest[5] = (near * 2) / tb;
    dest[6] = 0;
    dest[7] = 0;
    dest[8] = (right + left) / rl;
    dest[9] = (top + bottom) / tb;
    dest[10] = -(far + near) / fn;
    dest[11] = -1;
    dest[12] = 0;
    dest[13] = 0;
    dest[14] = -(far * near * 2) / fn;
    dest[15] = 0;
    return dest;
  };

  /**
   * Generates a perspective projection matrix with the given bounds
   *
   * _param {number} fovy Vertical field of view
   * _param {number} aspect Aspect ratio. typically viewport width/height
   * _param {number} near Near bound of the frustum
   * _param {number} far Far bound of the frustum
   * _param {mat4} [dest] mat4 frustum matrix will be written into
   *
   * _returns {mat4} dest if specified, a new mat4 otherwise
   */
  mat4.perspective = function (fovy, aspect, near, far, dest) {
    var top = near * Math.tan(fovy * Math.PI / 360.0),
      right = top * aspect;
    return mat4.frustum(-right, right, -top, top, near, far, dest);
  };

  /**
   * Generates a orthogonal projection matrix with the given bounds
   *
   * _param {number} left Left bound of the frustum
   * _param {number} right Right bound of the frustum
   * _param {number} bottom Bottom bound of the frustum
   * _param {number} top Top bound of the frustum
   * _param {number} near Near bound of the frustum
   * _param {number} far Far bound of the frustum
   * _param {mat4} [dest] mat4 frustum matrix will be written into
   *
   * _returns {mat4} dest if specified, a new mat4 otherwise
   */
  mat4.ortho = function (left, right, bottom, top, near, far, dest) {
    if (!dest) { dest = mat4.create(); }
    var rl = (right - left),
      tb = (top - bottom),
      fn = (far - near);
    dest[0] = 2 / rl;
    dest[1] = 0;
    dest[2] = 0;
    dest[3] = 0;
    dest[4] = 0;
    dest[5] = 2 / tb;
    dest[6] = 0;
    dest[7] = 0;
    dest[8] = 0;
    dest[9] = 0;
    dest[10] = -2 / fn;
    dest[11] = 0;
    dest[12] = -(left + right) / rl;
    dest[13] = -(top + bottom) / tb;
    dest[14] = -(far + near) / fn;
    dest[15] = 1;
    return dest;
  };

  /**
   * Generates a look-at matrix with the given eye position, focal point, and up axis
   *
   * _param {vec3} eye Position of the viewer
   * _param {vec3} center Point the viewer is looking at
   * _param {vec3} up vec3 pointing "up"
   * _param {mat4} [dest] mat4 frustum matrix will be written into
   *
   * _returns {mat4} dest if specified, a new mat4 otherwise
   */
  mat4.lookAt = function (eye, center, up, dest) {
    if (!dest) { dest = mat4.create(); }

    var x0, x1, x2, y0, y1, y2, z0, z1, z2, len,
      eyex = eye[0],
      eyey = eye[1],
      eyez = eye[2],
      upx = up[0],
      upy = up[1],
      upz = up[2],
      centerx = center[0],
      centery = center[1],
      centerz = center[2];

    if (eyex === centerx && eyey === centery && eyez === centerz) {
      return mat4.identity(dest);
    }

    //vec3.direction(eye, center, z);
    z0 = eyex - centerx;
    z1 = eyey - centery;
    z2 = eyez - centerz;

    // normalize (no check needed for 0 because of early return)
    len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
    z0 *= len;
    z1 *= len;
    z2 *= len;

    //vec3.normalize(vec3.cross(up, z, x));
    x0 = upy * z2 - upz * z1;
    x1 = upz * z0 - upx * z2;
    x2 = upx * z1 - upy * z0;
    len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
    if (!len) {
      x0 = 0;
      x1 = 0;
      x2 = 0;
    } else {
      len = 1 / len;
      x0 *= len;
      x1 *= len;
      x2 *= len;
    }

    //vec3.normalize(vec3.cross(z, x, y));
    y0 = z1 * x2 - z2 * x1;
    y1 = z2 * x0 - z0 * x2;
    y2 = z0 * x1 - z1 * x0;

    len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
    if (!len) {
      y0 = 0;
      y1 = 0;
      y2 = 0;
    } else {
      len = 1 / len;
      y0 *= len;
      y1 *= len;
      y2 *= len;
    }

    dest[0] = x0;
    dest[1] = y0;
    dest[2] = z0;
    dest[3] = 0;
    dest[4] = x1;
    dest[5] = y1;
    dest[6] = z1;
    dest[7] = 0;
    dest[8] = x2;
    dest[9] = y2;
    dest[10] = z2;
    dest[11] = 0;
    dest[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
    dest[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
    dest[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
    dest[15] = 1;

    return dest;
  };

  /**
   * Creates a matrix from a quaternion rotation and vector translation
   * This is equivalent to (but much faster than):
   *
   *     mat4.identity(dest);
   *     mat4.translate(dest, vec);
   *     var quatMat = mat4.create();
   *     quat4.toMat4(quat, quatMat);
   *     mat4.multiply(dest, quatMat);
   *
   * _param {quat4} quat Rotation quaternion
   * _param {vec3} vec Translation vector
   * _param {mat4} [dest] mat4 receiving operation result. If not specified result is written to a new mat4
   *
   * _returns {mat4} dest if specified, a new mat4 otherwise
   */
  mat4.fromRotationTranslation = function (quat, vec, dest) {
    if (!dest) { dest = mat4.create(); }

    // Quaternion math
    var x = quat[0], y = quat[1], z = quat[2], w = quat[3],
      x2 = x + x,
      y2 = y + y,
      z2 = z + z,

      xx = x * x2,
      xy = x * y2,
      xz = x * z2,
      yy = y * y2,
      yz = y * z2,
      zz = z * z2,
      wx = w * x2,
      wy = w * y2,
      wz = w * z2;

    dest[0] = 1 - (yy + zz);
    dest[1] = xy + wz;
    dest[2] = xz - wy;
    dest[3] = 0;
    dest[4] = xy - wz;
    dest[5] = 1 - (xx + zz);
    dest[6] = yz + wx;
    dest[7] = 0;
    dest[8] = xz + wy;
    dest[9] = yz - wx;
    dest[10] = 1 - (xx + yy);
    dest[11] = 0;
    dest[12] = vec[0];
    dest[13] = vec[1];
    dest[14] = vec[2];
    dest[15] = 1;

    return dest;
  };

  /**
   * Returns a string representation of a mat4
   *
   * _param {mat4} mat mat4 to represent as a string
   *
   * _returns {string} String representation of mat
   */
  mat4.str = function (mat) {
    return '[' + mat[0] + ', ' + mat[1] + ', ' + mat[2] + ', ' + mat[3] +
      ', ' + mat[4] + ', ' + mat[5] + ', ' + mat[6] + ', ' + mat[7] +
      ', ' + mat[8] + ', ' + mat[9] + ', ' + mat[10] + ', ' + mat[11] +
      ', ' + mat[12] + ', ' + mat[13] + ', ' + mat[14] + ', ' + mat[15] + ']';
  };

  /*
   * quat4
   */

  /**
   * Creates a new instance of a quat4 using the default array type
   * Any javascript array containing at least 4 numeric elements can serve as a quat4
   *
   * _param {quat4} [quat] quat4 containing values to initialize with
   *
   * _returns {quat4} New quat4
   */
  quat4.create = function (quat) {
    var dest = new MatrixArray(4);

    if (quat) {
      dest[0] = quat[0];
      dest[1] = quat[1];
      dest[2] = quat[2];
      dest[3] = quat[3];
    }

    return dest;
  };

  /**
   * Copies the values of one quat4 to another
   *
   * _param {quat4} quat quat4 containing values to copy
   * _param {quat4} dest quat4 receiving copied values
   *
   * _returns {quat4} dest
   */
  quat4.set = function (quat, dest) {
    dest[0] = quat[0];
    dest[1] = quat[1];
    dest[2] = quat[2];
    dest[3] = quat[3];

    return dest;
  };

  /**
   * Calculates the W component of a quat4 from the X, Y, and Z components.
   * Assumes that quaternion is 1 unit in length.
   * Any existing W component will be ignored.
   *
   * _param {quat4} quat quat4 to calculate W component of
   * _param {quat4} [dest] quat4 receiving calculated values. If not specified result is written to quat
   *
   * _returns {quat4} dest if specified, quat otherwise
   */
  quat4.calculateW = function (quat, dest) {
    var x = quat[0], y = quat[1], z = quat[2];

    if (!dest || quat === dest) {
      quat[3] = -Math.sqrt(Math.abs(1.0 - x * x - y * y - z * z));
      return quat;
    }
    dest[0] = x;
    dest[1] = y;
    dest[2] = z;
    dest[3] = -Math.sqrt(Math.abs(1.0 - x * x - y * y - z * z));
    return dest;
  };

  /**
   * Calculates the dot product of two quaternions
   *
   * _param {quat4} quat First operand
   * _param {quat4} quat2 Second operand
   *
   * @return {number} Dot product of quat and quat2
   */
  quat4.dot = function (quat, quat2) {
    return quat[0] * quat2[0] + quat[1] * quat2[1] + quat[2] * quat2[2] + quat[3] * quat2[3];
  };

  /**
   * Calculates the inverse of a quat4
   *
   * _param {quat4} quat quat4 to calculate inverse of
   * _param {quat4} [dest] quat4 receiving inverse values. If not specified result is written to quat
   *
   * _returns {quat4} dest if specified, quat otherwise
   */
  quat4.inverse = function (quat, dest) {
    var q0 = quat[0], q1 = quat[1], q2 = quat[2], q3 = quat[3],
      dot = q0 * q0 + q1 * q1 + q2 * q2 + q3 * q3,
      invDot = dot ? 1.0 / dot : 0;

    // TODO: Would be faster to return [0,0,0,0] immediately if dot == 0

    if (!dest || quat === dest) {
      quat[0] *= -invDot;
      quat[1] *= -invDot;
      quat[2] *= -invDot;
      quat[3] *= invDot;
      return quat;
    }
    dest[0] = -quat[0] * invDot;
    dest[1] = -quat[1] * invDot;
    dest[2] = -quat[2] * invDot;
    dest[3] = quat[3] * invDot;
    return dest;
  };


  /**
   * Calculates the conjugate of a quat4
   * If the quaternion is normalized, this function is faster than quat4.inverse and produces the same result.
   *
   * _param {quat4} quat quat4 to calculate conjugate of
   * _param {quat4} [dest] quat4 receiving conjugate values. If not specified result is written to quat
   *
   * _returns {quat4} dest if specified, quat otherwise
   */
  quat4.conjugate = function (quat, dest) {
    if (!dest || quat === dest) {
      quat[0] *= -1;
      quat[1] *= -1;
      quat[2] *= -1;
      return quat;
    }
    dest[0] = -quat[0];
    dest[1] = -quat[1];
    dest[2] = -quat[2];
    dest[3] = quat[3];
    return dest;
  };

  /**
   * Calculates the length of a quat4
   *
   * Params:
   * _param {quat4} quat quat4 to calculate length of
   *
   * _returns Length of quat
   */
  quat4.length = function (quat) {
    var x = quat[0], y = quat[1], z = quat[2], w = quat[3];
    return Math.sqrt(x * x + y * y + z * z + w * w);
  };

  /**
   * Generates a unit quaternion of the same direction as the provided quat4
   * If quaternion length is 0, returns [0, 0, 0, 0]
   *
   * _param {quat4} quat quat4 to normalize
   * _param {quat4} [dest] quat4 receiving operation result. If not specified result is written to quat
   *
   * _returns {quat4} dest if specified, quat otherwise
   */
  quat4.normalize = function (quat, dest) {
    if (!dest) { dest = quat; }

    var x = quat[0], y = quat[1], z = quat[2], w = quat[3],
      len = Math.sqrt(x * x + y * y + z * z + w * w);
    if (len === 0) {
      dest[0] = 0;
      dest[1] = 0;
      dest[2] = 0;
      dest[3] = 0;
      return dest;
    }
    len = 1 / len;
    dest[0] = x * len;
    dest[1] = y * len;
    dest[2] = z * len;
    dest[3] = w * len;

    return dest;
  };

  /**
   * Performs quaternion addition
   *
   * _param {quat4} quat First operand
   * _param {quat4} quat2 Second operand
   * _param {quat4} [dest] quat4 receiving operation result. If not specified result is written to quat
   *
   * _returns {quat4} dest if specified, quat otherwise
   */
  quat4.add = function (quat, quat2, dest) {
    if (!dest || quat === dest) {
      quat[0] += quat2[0];
      quat[1] += quat2[1];
      quat[2] += quat2[2];
      quat[3] += quat2[3];
      return quat;
    }
    dest[0] = quat[0] + quat2[0];
    dest[1] = quat[1] + quat2[1];
    dest[2] = quat[2] + quat2[2];
    dest[3] = quat[3] + quat2[3];
    return dest;
  };

  /**
   * Performs a quaternion multiplication
   *
   * _param {quat4} quat First operand
   * _param {quat4} quat2 Second operand
   * _param {quat4} [dest] quat4 receiving operation result. If not specified result is written to quat
   *
   * _returns {quat4} dest if specified, quat otherwise
   */
  quat4.multiply = function (quat, quat2, dest) {
    if (!dest) { dest = quat; }

    var qax = quat[0], qay = quat[1], qaz = quat[2], qaw = quat[3],
      qbx = quat2[0], qby = quat2[1], qbz = quat2[2], qbw = quat2[3];

    dest[0] = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
    dest[1] = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
    dest[2] = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
    dest[3] = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;

    return dest;
  };

  /**
   * Transforms a vec3 with the given quaternion
   *
   * _param {quat4} quat quat4 to transform the vector with
   * _param {vec3} vec vec3 to transform
   * _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
   *
   * _returns dest if specified, vec otherwise
   */
  quat4.multiplyVec3 = function (quat, vec, dest) {
    if (!dest) { dest = vec; }

    var x = vec[0], y = vec[1], z = vec[2],
      qx = quat[0], qy = quat[1], qz = quat[2], qw = quat[3],

      // calculate quat * vec
      ix = qw * x + qy * z - qz * y,
      iy = qw * y + qz * x - qx * z,
      iz = qw * z + qx * y - qy * x,
      iw = -qx * x - qy * y - qz * z;

    // calculate result * inverse quat
    dest[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    dest[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    dest[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;

    return dest;
  };

  /**
   * Multiplies the components of a quaternion by a scalar value
   *
   * _param {quat4} quat to scale
   * _param {number} val Value to scale by
   * _param {quat4} [dest] quat4 receiving operation result. If not specified result is written to quat
   *
   * _returns {quat4} dest if specified, quat otherwise
   */
  quat4.scale = function (quat, val, dest) {
    if (!dest || quat === dest) {
      quat[0] *= val;
      quat[1] *= val;
      quat[2] *= val;
      quat[3] *= val;
      return quat;
    }
    dest[0] = quat[0] * val;
    dest[1] = quat[1] * val;
    dest[2] = quat[2] * val;
    dest[3] = quat[3] * val;
    return dest;
  };

  /**
   * Calculates a 3x3 matrix from the given quat4
   *
   * _param {quat4} quat quat4 to create matrix from
   * _param {mat3} [dest] mat3 receiving operation result
   *
   * _returns {mat3} dest if specified, a new mat3 otherwise
   */
  quat4.toMat3 = function (quat, dest) {
    if (!dest) { dest = mat3.create(); }

    var x = quat[0], y = quat[1], z = quat[2], w = quat[3],
      x2 = x + x,
      y2 = y + y,
      z2 = z + z,

      xx = x * x2,
      xy = x * y2,
      xz = x * z2,
      yy = y * y2,
      yz = y * z2,
      zz = z * z2,
      wx = w * x2,
      wy = w * y2,
      wz = w * z2;

    dest[0] = 1 - (yy + zz);
    dest[1] = xy + wz;
    dest[2] = xz - wy;

    dest[3] = xy - wz;
    dest[4] = 1 - (xx + zz);
    dest[5] = yz + wx;

    dest[6] = xz + wy;
    dest[7] = yz - wx;
    dest[8] = 1 - (xx + yy);

    return dest;
  };

  /**
   * Calculates a 4x4 matrix from the given quat4
   *
   * _param {quat4} quat quat4 to create matrix from
   * _param {mat4} [dest] mat4 receiving operation result
   *
   * _returns {mat4} dest if specified, a new mat4 otherwise
   */
  quat4.toMat4 = function (quat, dest) {
    if (!dest) { dest = mat4.create(); }

    var x = quat[0], y = quat[1], z = quat[2], w = quat[3],
      x2 = x + x,
      y2 = y + y,
      z2 = z + z,

      xx = x * x2,
      xy = x * y2,
      xz = x * z2,
      yy = y * y2,
      yz = y * z2,
      zz = z * z2,
      wx = w * x2,
      wy = w * y2,
      wz = w * z2;

    dest[0] = 1 - (yy + zz);
    dest[1] = xy + wz;
    dest[2] = xz - wy;
    dest[3] = 0;

    dest[4] = xy - wz;
    dest[5] = 1 - (xx + zz);
    dest[6] = yz + wx;
    dest[7] = 0;

    dest[8] = xz + wy;
    dest[9] = yz - wx;
    dest[10] = 1 - (xx + yy);
    dest[11] = 0;

    dest[12] = 0;
    dest[13] = 0;
    dest[14] = 0;
    dest[15] = 1;

    return dest;
  };

  /**
   * Performs a spherical linear interpolation between two quat4
   *
   * _param {quat4} quat First quaternion
   * _param {quat4} quat2 Second quaternion
   * _param {number} slerp Interpolation amount between the two inputs
   * _param {quat4} [dest] quat4 receiving operation result. If not specified result is written to quat
   *
   * _returns {quat4} dest if specified, quat otherwise
   */
  quat4.slerp = function (quat, quat2, slerp, dest) {
    if (!dest) { dest = quat; }

    var cosHalfTheta = quat[0] * quat2[0] + quat[1] * quat2[1] + quat[2] * quat2[2] + quat[3] * quat2[3],
      halfTheta,
      sinHalfTheta,
      ratioA,
      ratioB;

    if (Math.abs(cosHalfTheta) >= 1.0) {
      if (dest !== quat) {
        dest[0] = quat[0];
        dest[1] = quat[1];
        dest[2] = quat[2];
        dest[3] = quat[3];
      }
      return dest;
    }

    halfTheta = Math.acos(cosHalfTheta);
    sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

    if (Math.abs(sinHalfTheta) < 0.001) {
      dest[0] = (quat[0] * 0.5 + quat2[0] * 0.5);
      dest[1] = (quat[1] * 0.5 + quat2[1] * 0.5);
      dest[2] = (quat[2] * 0.5 + quat2[2] * 0.5);
      dest[3] = (quat[3] * 0.5 + quat2[3] * 0.5);
      return dest;
    }

    ratioA = Math.sin((1 - slerp) * halfTheta) / sinHalfTheta;
    ratioB = Math.sin(slerp * halfTheta) / sinHalfTheta;

    dest[0] = (quat[0] * ratioA + quat2[0] * ratioB);
    dest[1] = (quat[1] * ratioA + quat2[1] * ratioB);
    dest[2] = (quat[2] * ratioA + quat2[2] * ratioB);
    dest[3] = (quat[3] * ratioA + quat2[3] * ratioB);

    return dest;
  };

  /**
   * Returns a string representation of a quaternion
   *
   * _param {quat4} quat quat4 to represent as a string
   *
   * _returns {string} String representation of quat
   */
  quat4.str = function (quat) {
    return '[' + quat[0] + ', ' + quat[1] + ', ' + quat[2] + ', ' + quat[3] + ']';
  };


  return {
    vec3: vec3,
    mat3: mat3,
    mat4: mat4,
    quat4: quat4
  };

})();

;

var GLImmediateSetup = {
};
/** @suppress {duplicate } */
var _glBegin = (mode) => {
  // Push the old state:
  GLImmediate.enabledClientAttributes_preBegin = GLImmediate.enabledClientAttributes;
  GLImmediate.enabledClientAttributes = [];

  GLImmediate.clientAttributes_preBegin = GLImmediate.clientAttributes;
  GLImmediate.clientAttributes = []
  for (var i = 0; i < GLImmediate.clientAttributes_preBegin.length; i++) {
    GLImmediate.clientAttributes.push({});
  }

  GLImmediate.mode = mode;
  GLImmediate.vertexCounter = 0;
  var components = GLImmediate.rendererComponents = [];
  for (var i = 0; i < GLImmediate.NUM_ATTRIBUTES; i++) {
    components[i] = 0;
  }
  GLImmediate.rendererComponentPointer = 0;
  GLImmediate.vertexData = GLImmediate.tempData;
};
var _emscripten_glBegin = _glBegin;

/** @suppress {duplicate } */
var _glBeginQuery = (target, id) => {
  GLctx.beginQuery(target, GL.queries[id]);
};
var _emscripten_glBeginQuery = _glBeginQuery;

/** @suppress {duplicate } */
var _glBeginQueryEXT = (target, id) => {
  GLctx.disjointTimerQueryExt['beginQueryEXT'](target, GL.queries[id]);
};
var _emscripten_glBeginQueryEXT = _glBeginQueryEXT;

/** @suppress {duplicate } */
function _glBeginTransformFeedback(x0) { GLctx.beginTransformFeedback(x0) }
var _emscripten_glBeginTransformFeedback = _glBeginTransformFeedback;

var _emscripten_glBindAttribLocation = _glBindAttribLocation;

var _emscripten_glBindBuffer = _glBindBuffer;

/** @suppress {duplicate } */
var _glBindBufferBase = (target, index, buffer) => {
  GLctx.bindBufferBase(target, index, GL.buffers[buffer]);
};
var _emscripten_glBindBufferBase = _glBindBufferBase;

/** @suppress {duplicate } */
var _glBindBufferRange = (target, index, buffer, offset, ptrsize) => {
  GLctx.bindBufferRange(target, index, GL.buffers[buffer], offset, ptrsize);
};
var _emscripten_glBindBufferRange = _glBindBufferRange;

/** @suppress {duplicate } */
var _glBindFramebuffer = (target, framebuffer) => {

  GLctx.bindFramebuffer(target, GL.framebuffers[framebuffer]);

};
var _emscripten_glBindFramebuffer = _glBindFramebuffer;

/** @suppress {duplicate } */
var _glBindProgram = (type, id) => {
  assert(id == 0);
};
var _emscripten_glBindProgram = _glBindProgram;

/** @suppress {duplicate } */
var _glBindRenderbuffer = (target, renderbuffer) => {
  GLctx.bindRenderbuffer(target, GL.renderbuffers[renderbuffer]);
};
var _emscripten_glBindRenderbuffer = _glBindRenderbuffer;

/** @suppress {duplicate } */
var _glBindSampler = (unit, sampler) => {
  GLctx.bindSampler(unit, GL.samplers[sampler]);
};
var _emscripten_glBindSampler = _glBindSampler;

/** @suppress {duplicate } */
var _glBindTexture = (target, texture) => {
  GLctx.bindTexture(target, GL.textures[texture]);
};
var _emscripten_glBindTexture = _glBindTexture;

/** @suppress {duplicate } */
var _glBindTransformFeedback = (target, id) => {
  GLctx.bindTransformFeedback(target, GL.transformFeedbacks[id]);
};
var _emscripten_glBindTransformFeedback = _glBindTransformFeedback;




var _glEnableClientState = (cap) => {
  var attrib = GLEmulation.getAttributeFromCapability(cap);
  if (attrib === null) {
    err(`WARNING: unhandled clientstate: ${cap}`);
    return;
  }
  if (!GLImmediate.enabledClientAttributes[attrib]) {
    GLImmediate.enabledClientAttributes[attrib] = true;
    GLImmediate.totalEnabledClientAttributes++;
    GLImmediate.currentRenderer = null; // Will need to change current renderer, since the set of active vertex pointers changed.
    if (GLEmulation.currentVao) GLEmulation.currentVao.enabledClientStates[cap] = 1;
    GLImmediate.modifiedClientAttributes = true;
  }
};
var emulGlBindVertexArray = (vao) => {
  // undo vao-related things, wipe the slate clean, both for vao of 0 or an actual vao
  GLEmulation.currentVao = null; // make sure the commands we run here are not recorded
  GLImmediate.lastRenderer?.cleanup();
  _glBindBuffer(GLctx.ARRAY_BUFFER, 0); // XXX if one was there before we were bound?
  _glBindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, 0);
  for (var vaa in GLEmulation.enabledVertexAttribArrays) {
    GLctx.disableVertexAttribArray(vaa);
  }
  GLEmulation.enabledVertexAttribArrays = {};
  GLImmediate.enabledClientAttributes = [0, 0];
  GLImmediate.totalEnabledClientAttributes = 0;
  GLImmediate.modifiedClientAttributes = true;
  if (vao) {
    // replay vao
    var info = GLEmulation.vaos[vao];
    _glBindBuffer(GLctx.ARRAY_BUFFER, info.arrayBuffer); // XXX overwrite current binding?
    _glBindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, info.elementArrayBuffer);
    for (var vaa in info.enabledVertexAttribArrays) {
      _glEnableVertexAttribArray(vaa);
    }
    for (var vaa in info.vertexAttribPointers) {
      _glVertexAttribPointer.apply(null, info.vertexAttribPointers[vaa]);
    }
    for (var attrib in info.enabledClientStates) {
      _glEnableClientState(attrib | 0);
    }
    GLEmulation.currentVao = info; // set currentVao last, so the commands we ran here were not recorded
  }
};

/** @suppress {duplicate } */
var _glBindVertexArray = (vao) => {
  emulGlBindVertexArray(vao);
  var ibo = GLctx.getParameter(0x8895 /*ELEMENT_ARRAY_BUFFER_BINDING*/);
  GLctx.currentElementArrayBufferBinding = ibo ? (ibo.name | 0) : 0;
};
var _emscripten_glBindVertexArray = _glBindVertexArray;


/** @suppress {duplicate } */
var _glBindVertexArrayOES = _glBindVertexArray;
var _emscripten_glBindVertexArrayOES = _glBindVertexArrayOES;

/** @suppress {duplicate } */
function _glBlendColor(x0, x1, x2, x3) { GLctx.blendColor(x0, x1, x2, x3) }
var _emscripten_glBlendColor = _glBlendColor;

/** @suppress {duplicate } */
function _glBlendEquation(x0) { GLctx.blendEquation(x0) }
var _emscripten_glBlendEquation = _glBlendEquation;

/** @suppress {duplicate } */
function _glBlendEquationSeparate(x0, x1) { GLctx.blendEquationSeparate(x0, x1) }
var _emscripten_glBlendEquationSeparate = _glBlendEquationSeparate;

/** @suppress {duplicate } */
function _glBlendFunc(x0, x1) { GLctx.blendFunc(x0, x1) }
var _emscripten_glBlendFunc = _glBlendFunc;

/** @suppress {duplicate } */
function _glBlendFuncSeparate(x0, x1, x2, x3) { GLctx.blendFuncSeparate(x0, x1, x2, x3) }
var _emscripten_glBlendFuncSeparate = _glBlendFuncSeparate;

/** @suppress {duplicate } */
function _glBlitFramebuffer(x0, x1, x2, x3, x4, x5, x6, x7, x8, x9) { GLctx.blitFramebuffer(x0, x1, x2, x3, x4, x5, x6, x7, x8, x9) }
var _emscripten_glBlitFramebuffer = _glBlitFramebuffer;

/** @suppress {duplicate } */
var _glBufferData = (target, size, data, usage) => {
  switch (usage) { // fix usages, WebGL 1 only has *_DRAW
    case 0x88E1: // GL_STREAM_READ
    case 0x88E2: // GL_STREAM_COPY
      usage = 0x88E0; // GL_STREAM_DRAW
      break;
    case 0x88E5: // GL_STATIC_READ
    case 0x88E6: // GL_STATIC_COPY
      usage = 0x88E4; // GL_STATIC_DRAW
      break;
    case 0x88E9: // GL_DYNAMIC_READ
    case 0x88EA: // GL_DYNAMIC_COPY
      usage = 0x88E8; // GL_DYNAMIC_DRAW
      break;
  }

  if (GL.currentContext.version >= 2) {
    // WebGL 2 provides new garbage-free entry points to call to WebGL. Use
    // those always when possible.  If size is zero, WebGL would interpret
    // uploading the whole input arraybuffer (starting from given offset),
    // which would not make sense in WebAssembly, so avoid uploading if size
    // is zero. However we must still call bufferData to establish a backing
    // storage of zero bytes.
    if (data && size) {
      GLctx.bufferData(target, HEAPU8, usage, data, size);
    } else {
      GLctx.bufferData(target, size, usage);
    }
  } else {
    // N.b. here first form specifies a heap subarray, second form an integer
    // size, so the ?: code here is polymorphic. It is advised to avoid
    // randomly mixing both uses in calling code, to avoid any potential JS
    // engine JIT issues.
    GLctx.bufferData(target, data ? HEAPU8.subarray(data, data + size) : size, usage);
  }
};
var _emscripten_glBufferData = _glBufferData;

/** @suppress {duplicate } */
var _glBufferSubData = (target, offset, size, data) => {
  if (GL.currentContext.version >= 2) {
    // WebGL 2 provides new garbage-free entry points to call to WebGL. Use
    // those always when possible.
    size && GLctx.bufferSubData(target, offset, HEAPU8, data, size);
    return;
  }
  GLctx.bufferSubData(target, offset, HEAPU8.subarray(data, data + size));
};
var _emscripten_glBufferSubData = _glBufferSubData;

/** @suppress {duplicate } */
function _glCheckFramebufferStatus(x0) { return GLctx.checkFramebufferStatus(x0) }
var _emscripten_glCheckFramebufferStatus = _glCheckFramebufferStatus;

/** @suppress {duplicate } */
function _glClear(x0) { GLctx.clear(x0) }
var _emscripten_glClear = _glClear;

/** @suppress {duplicate } */
function _glClearBufferfi(x0, x1, x2, x3) { GLctx.clearBufferfi(x0, x1, x2, x3) }
var _emscripten_glClearBufferfi = _glClearBufferfi;

/** @suppress {duplicate } */
var _glClearBufferfv = (buffer, drawbuffer, value) => {

  GLctx.clearBufferfv(buffer, drawbuffer, HEAPF32, value >> 2);
};
var _emscripten_glClearBufferfv = _glClearBufferfv;

/** @suppress {duplicate } */
var _glClearBufferiv = (buffer, drawbuffer, value) => {

  GLctx.clearBufferiv(buffer, drawbuffer, HEAP32, value >> 2);
};
var _emscripten_glClearBufferiv = _glClearBufferiv;

/** @suppress {duplicate } */
var _glClearBufferuiv = (buffer, drawbuffer, value) => {

  GLctx.clearBufferuiv(buffer, drawbuffer, HEAPU32, value >> 2);
};
var _emscripten_glClearBufferuiv = _glClearBufferuiv;

/** @suppress {duplicate } */
function _glClearColor(x0, x1, x2, x3) { GLctx.clearColor(x0, x1, x2, x3) }
var _emscripten_glClearColor = _glClearColor;

/** @suppress {duplicate } */
function _glClearDepthf(x0) { GLctx.clearDepth(x0) }
var _emscripten_glClearDepthf = _glClearDepthf;

/** @suppress {duplicate } */
function _glClearStencil(x0) { GLctx.clearStencil(x0) }
var _emscripten_glClearStencil = _glClearStencil;

/** @suppress {duplicate } */
var _glClientActiveTexture = (texture) => {
  GLImmediate.clientActiveTexture = texture - 0x84C0; // GL_TEXTURE0
};
var _emscripten_glClientActiveTexture = _glClientActiveTexture;

var convertI32PairToI53 = (lo, hi) => {
  // This function should not be getting called with too large unsigned numbers
  // in high part (if hi >= 0x7FFFFFFFF, one should have been calling
  // convertU32PairToI53())
  assert(hi === (hi | 0));
  return (lo >>> 0) + hi * 4294967296;
};
/** @suppress {duplicate } */
var _glClientWaitSync = (sync, flags, timeout_low, timeout_high) => {
  // WebGL2 vs GLES3 differences: in GLES3, the timeout parameter is a uint64, where 0xFFFFFFFFFFFFFFFFULL means GL_TIMEOUT_IGNORED.
  // In JS, there's no 64-bit value types, so instead timeout is taken to be signed, and GL_TIMEOUT_IGNORED is given value -1.
  // Inherently the value accepted in the timeout is lossy, and can't take in arbitrary u64 bit pattern (but most likely doesn't matter)
  // See https://www.khronos.org/registry/webgl/specs/latest/2.0/#5.15
  var timeout = convertI32PairToI53(timeout_low, timeout_high);
  return GLctx.clientWaitSync(GL.syncs[sync], flags, timeout);
};
var _emscripten_glClientWaitSync = _glClientWaitSync;

/** @suppress {duplicate } */
var _glClipPlane = (pname, param) => {
  if ((pname >= 0x3000) && (pname < 0x3006)  /* GL_CLIP_PLANE0 to GL_CLIP_PLANE5 */) {
    var clipPlaneId = pname - 0x3000;

    GLEmulation.clipPlaneEquation[clipPlaneId][0] = HEAPF64[((param) >> 3)];
    GLEmulation.clipPlaneEquation[clipPlaneId][1] = HEAPF64[(((param) + (8)) >> 3)];
    GLEmulation.clipPlaneEquation[clipPlaneId][2] = HEAPF64[(((param) + (16)) >> 3)];
    GLEmulation.clipPlaneEquation[clipPlaneId][3] = HEAPF64[(((param) + (24)) >> 3)];

    // apply inverse transposed current modelview matrix when setting clip plane
    var tmpMV = GLImmediate.matrixLib.mat4.create(GLImmediate.matrix[0]);
    GLImmediate.matrixLib.mat4.inverse(tmpMV);
    GLImmediate.matrixLib.mat4.transpose(tmpMV);
    GLImmediate.matrixLib.mat4.multiplyVec4(tmpMV, GLEmulation.clipPlaneEquation[clipPlaneId]);
  }
};
var _emscripten_glClipPlane = _glClipPlane;

var _glColor4f = (r, g, b, a) => {
  r = Math.max(Math.min(r, 1), 0);
  g = Math.max(Math.min(g, 1), 0);
  b = Math.max(Math.min(b, 1), 0);
  a = Math.max(Math.min(a, 1), 0);

  // TODO: make ub the default, not f, save a few mathops
  if (GLImmediate.mode >= 0) {
    var start = GLImmediate.vertexCounter << 2;
    GLImmediate.vertexDataU8[start + 0] = r * 255;
    GLImmediate.vertexDataU8[start + 1] = g * 255;
    GLImmediate.vertexDataU8[start + 2] = b * 255;
    GLImmediate.vertexDataU8[start + 3] = a * 255;
    GLImmediate.vertexCounter++;
    GLImmediate.addRendererComponent(GLImmediate.COLOR, 4, GLctx.UNSIGNED_BYTE);
  } else {
    GLImmediate.clientColor[0] = r;
    GLImmediate.clientColor[1] = g;
    GLImmediate.clientColor[2] = b;
    GLImmediate.clientColor[3] = a;
  }
};
/** @suppress {duplicate } */
var _glColor3f = (r, g, b) => {
  _glColor4f(r, g, b, 1);
};
/** @suppress {duplicate } */
var _glColor3d = _glColor3f;
var _emscripten_glColor3d = _glColor3d;

var _emscripten_glColor3f = _glColor3f;

/** @suppress {duplicate } */
var _glColor3fv = (p) => {
  _glColor3f(HEAPF32[((p) >> 2)], HEAPF32[(((p) + (4)) >> 2)], HEAPF32[(((p) + (8)) >> 2)]);
};
var _emscripten_glColor3fv = _glColor3fv;

var _glColor4ub = (r, g, b, a) => {
  _glColor4f((r & 255) / 255, (g & 255) / 255, (b & 255) / 255, (a & 255) / 255);
};
/** @suppress {duplicate } */
var _glColor3ub = (r, g, b) => {
  _glColor4ub(r, g, b, 255);
};
var _emscripten_glColor3ub = _glColor3ub;

/** @suppress {duplicate } */
var _glColor3ubv = (p) => {
  _glColor3ub(HEAP8[((p) >> 0)], HEAP8[(((p) + (1)) >> 0)], HEAP8[(((p) + (2)) >> 0)]);
};
var _emscripten_glColor3ubv = _glColor3ubv;

var _glColor4ui = (r, g, b, a) => {
  _glColor4f((r >>> 0) / 4294967295, (g >>> 0) / 4294967295, (b >>> 0) / 4294967295, (a >>> 0) / 4294967295);
};
/** @suppress {duplicate } */
var _glColor3ui = (r, g, b) => {
  _glColor4ui(r, g, b, 4294967295);
};
var _emscripten_glColor3ui = _glColor3ui;

/** @suppress {duplicate } */
var _glColor3uiv = (p) => {
  _glColor3ui(HEAP32[((p) >> 2)], HEAP32[(((p) + (4)) >> 2)], HEAP32[(((p) + (8)) >> 2)]);
};
var _emscripten_glColor3uiv = _glColor3uiv;

var _glColor4us = (r, g, b, a) => {
  _glColor4f((r & 65535) / 65535, (g & 65535) / 65535, (b & 65535) / 65535, (a & 65535) / 65535);
};
/** @suppress {duplicate } */
var _glColor3us = (r, g, b) => {
  _glColor4us(r, g, b, 65535);
};
var _emscripten_glColor3us = _glColor3us;

/** @suppress {duplicate } */
var _glColor3usv = (p) => {
  _glColor3us(HEAP16[((p) >> 1)], HEAP16[(((p) + (2)) >> 1)], HEAP16[(((p) + (4)) >> 1)]);
};
var _emscripten_glColor3usv = _glColor3usv;

/** @suppress {duplicate } */
var _glColor4d = _glColor4f;
var _emscripten_glColor4d = _glColor4d;

var _emscripten_glColor4f = _glColor4f;

/** @suppress {duplicate } */
var _glColor4fv = (p) => {
  _glColor4f(HEAPF32[((p) >> 2)], HEAPF32[(((p) + (4)) >> 2)], HEAPF32[(((p) + (8)) >> 2)], HEAPF32[(((p) + (12)) >> 2)]);
};
var _emscripten_glColor4fv = _glColor4fv;

var _emscripten_glColor4ub = _glColor4ub;

/** @suppress {duplicate } */
var _glColor4ubv = (p) => {
  _glColor4ub(HEAP8[((p) >> 0)], HEAP8[(((p) + (1)) >> 0)], HEAP8[(((p) + (2)) >> 0)], HEAP8[(((p) + (3)) >> 0)]);
};
var _emscripten_glColor4ubv = _glColor4ubv;

var _emscripten_glColor4ui = _glColor4ui;

var _emscripten_glColor4us = _glColor4us;

/** @suppress {duplicate } */
var _glColorMask = (red, green, blue, alpha) => {
  GLctx.colorMask(!!red, !!green, !!blue, !!alpha);
};
var _emscripten_glColorMask = _glColorMask;

/** @suppress {duplicate } */
var _glColorPointer = (size, type, stride, pointer) => {
  GLImmediate.setClientAttribute(GLImmediate.COLOR, size, type, stride, pointer);
};
var _emscripten_glColorPointer = _glColorPointer;

var _emscripten_glCompileShader = _glCompileShader;

/** @suppress {duplicate } */
var _glCompressedTexImage2D = (target, level, internalFormat, width, height, border, imageSize, data) => {
  if (GL.currentContext.version >= 2) {
    // WebGL 2 provides new garbage-free entry points to call to WebGL. Use
    // those always when possible.
    if (GLctx.currentPixelUnpackBufferBinding || !imageSize) {
      GLctx.compressedTexImage2D(target, level, internalFormat, width, height, border, imageSize, data);
    } else {
      GLctx.compressedTexImage2D(target, level, internalFormat, width, height, border, HEAPU8, data, imageSize);
    }
    return;
  }
  GLctx.compressedTexImage2D(target, level, internalFormat, width, height, border, data ? HEAPU8.subarray((data), (data + imageSize)) : null);
};
var _emscripten_glCompressedTexImage2D = _glCompressedTexImage2D;

/** @suppress {duplicate } */
var _glCompressedTexImage3D = (target, level, internalFormat, width, height, depth, border, imageSize, data) => {
  if (GLctx.currentPixelUnpackBufferBinding) {
    GLctx.compressedTexImage3D(target, level, internalFormat, width, height, depth, border, imageSize, data);
  } else {
    GLctx.compressedTexImage3D(target, level, internalFormat, width, height, depth, border, HEAPU8, data, imageSize);
  }
};
var _emscripten_glCompressedTexImage3D = _glCompressedTexImage3D;

/** @suppress {duplicate } */
var _glCompressedTexSubImage2D = (target, level, xoffset, yoffset, width, height, format, imageSize, data) => {
  if (GL.currentContext.version >= 2) {
    // WebGL 2 provides new garbage-free entry points to call to WebGL. Use
    // those always when possible.
    if (GLctx.currentPixelUnpackBufferBinding || !imageSize) {
      GLctx.compressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, imageSize, data);
    } else {
      GLctx.compressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, HEAPU8, data, imageSize);
    }
    return;
  }
  GLctx.compressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, data ? HEAPU8.subarray((data), (data + imageSize)) : null);
};
var _emscripten_glCompressedTexSubImage2D = _glCompressedTexSubImage2D;

/** @suppress {duplicate } */
var _glCompressedTexSubImage3D = (target, level, xoffset, yoffset, zoffset, width, height, depth, format, imageSize, data) => {
  if (GLctx.currentPixelUnpackBufferBinding) {
    GLctx.compressedTexSubImage3D(target, level, xoffset, yoffset, zoffset, width, height, depth, format, imageSize, data);
  } else {
    GLctx.compressedTexSubImage3D(target, level, xoffset, yoffset, zoffset, width, height, depth, format, HEAPU8, data, imageSize);
  }
};
var _emscripten_glCompressedTexSubImage3D = _glCompressedTexSubImage3D;

/** @suppress {duplicate } */
function _glCopyBufferSubData(x0, x1, x2, x3, x4) { GLctx.copyBufferSubData(x0, x1, x2, x3, x4) }
var _emscripten_glCopyBufferSubData = _glCopyBufferSubData;

/** @suppress {duplicate } */
function _glCopyTexImage2D(x0, x1, x2, x3, x4, x5, x6, x7) { GLctx.copyTexImage2D(x0, x1, x2, x3, x4, x5, x6, x7) }
var _emscripten_glCopyTexImage2D = _glCopyTexImage2D;

/** @suppress {duplicate } */
function _glCopyTexSubImage2D(x0, x1, x2, x3, x4, x5, x6, x7) { GLctx.copyTexSubImage2D(x0, x1, x2, x3, x4, x5, x6, x7) }
var _emscripten_glCopyTexSubImage2D = _glCopyTexSubImage2D;

/** @suppress {duplicate } */
function _glCopyTexSubImage3D(x0, x1, x2, x3, x4, x5, x6, x7, x8) { GLctx.copyTexSubImage3D(x0, x1, x2, x3, x4, x5, x6, x7, x8) }
var _emscripten_glCopyTexSubImage3D = _glCopyTexSubImage3D;

/** @suppress {duplicate } */
var _glCreateProgram = () => {
  var id = GL.getNewId(GL.programs);
  var program = GLctx.createProgram();
  // Store additional information needed for each shader program:
  program.name = id;
  // Lazy cache results of
  // glGetProgramiv(GL_ACTIVE_UNIFORM_MAX_LENGTH/GL_ACTIVE_ATTRIBUTE_MAX_LENGTH/GL_ACTIVE_UNIFORM_BLOCK_MAX_NAME_LENGTH)
  program.maxUniformLength = program.maxAttributeLength = program.maxUniformBlockNameLength = 0;
  program.uniformIdCounter = 1;
  GL.programs[id] = program;
  return id;
};
var _emscripten_glCreateProgram = _glCreateProgram;

var _emscripten_glCreateShader = _glCreateShader;

/** @suppress {duplicate } */
function _glCullFace(x0) { GLctx.cullFace(x0) }
var _emscripten_glCullFace = _glCullFace;

/** @suppress {duplicate } */
var _glDeleteBuffers = (n, buffers) => {
  for (var i = 0; i < n; i++) {
    var id = HEAP32[(((buffers) + (i * 4)) >> 2)];
    var buffer = GL.buffers[id];

    // From spec: "glDeleteBuffers silently ignores 0's and names that do not
    // correspond to existing buffer objects."
    if (!buffer) continue;

    GLctx.deleteBuffer(buffer);
    buffer.name = 0;
    GL.buffers[id] = null;

    if (id == GLctx.currentArrayBufferBinding) GLctx.currentArrayBufferBinding = 0;
    if (id == GLctx.currentElementArrayBufferBinding) GLctx.currentElementArrayBufferBinding = 0;
    if (id == GLctx.currentPixelPackBufferBinding) GLctx.currentPixelPackBufferBinding = 0;
    if (id == GLctx.currentPixelUnpackBufferBinding) GLctx.currentPixelUnpackBufferBinding = 0;
  }
};
var _emscripten_glDeleteBuffers = _glDeleteBuffers;

/** @suppress {duplicate } */
var _glDeleteFramebuffers = (n, framebuffers) => {
  for (var i = 0; i < n; ++i) {
    var id = HEAP32[(((framebuffers) + (i * 4)) >> 2)];
    var framebuffer = GL.framebuffers[id];
    if (!framebuffer) continue; // GL spec: "glDeleteFramebuffers silently ignores 0s and names that do not correspond to existing framebuffer objects".
    GLctx.deleteFramebuffer(framebuffer);
    framebuffer.name = 0;
    GL.framebuffers[id] = null;
  }
};
var _emscripten_glDeleteFramebuffers = _glDeleteFramebuffers;


var _glDeleteShader = (id) => {
  if (!id) return;
  var shader = GL.shaders[id];
  if (!shader) {
    // glDeleteShader actually signals an error when deleting a nonexisting
    // object, unlike some other GL delete functions.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  GLctx.deleteShader(shader);
  GL.shaders[id] = null;
};
/** @suppress {duplicate } */
var _glDeleteObject = (id) => {
  if (GL.programs[id]) {
    _glDeleteProgram(id);
  } else if (GL.shaders[id]) {
    _glDeleteShader(id);
  } else {
    err(`WARNING: deleteObject received invalid id: ${id}`);
  }
};
var _emscripten_glDeleteObject = _glDeleteObject;

var _emscripten_glDeleteProgram = _glDeleteProgram;

/** @suppress {duplicate } */
var _glDeleteQueries = (n, ids) => {
  for (var i = 0; i < n; i++) {
    var id = HEAP32[(((ids) + (i * 4)) >> 2)];
    var query = GL.queries[id];
    if (!query) continue; // GL spec: "unused names in ids are ignored, as is the name zero."
    GLctx.deleteQuery(query);
    GL.queries[id] = null;
  }
};
var _emscripten_glDeleteQueries = _glDeleteQueries;

/** @suppress {duplicate } */
var _glDeleteQueriesEXT = (n, ids) => {
  for (var i = 0; i < n; i++) {
    var id = HEAP32[(((ids) + (i * 4)) >> 2)];
    var query = GL.queries[id];
    if (!query) continue; // GL spec: "unused names in ids are ignored, as is the name zero."
    GLctx.disjointTimerQueryExt['deleteQueryEXT'](query);
    GL.queries[id] = null;
  }
};
var _emscripten_glDeleteQueriesEXT = _glDeleteQueriesEXT;

/** @suppress {duplicate } */
var _glDeleteRenderbuffers = (n, renderbuffers) => {
  for (var i = 0; i < n; i++) {
    var id = HEAP32[(((renderbuffers) + (i * 4)) >> 2)];
    var renderbuffer = GL.renderbuffers[id];
    if (!renderbuffer) continue; // GL spec: "glDeleteRenderbuffers silently ignores 0s and names that do not correspond to existing renderbuffer objects".
    GLctx.deleteRenderbuffer(renderbuffer);
    renderbuffer.name = 0;
    GL.renderbuffers[id] = null;
  }
};
var _emscripten_glDeleteRenderbuffers = _glDeleteRenderbuffers;

/** @suppress {duplicate } */
var _glDeleteSamplers = (n, samplers) => {
  for (var i = 0; i < n; i++) {
    var id = HEAP32[(((samplers) + (i * 4)) >> 2)];
    var sampler = GL.samplers[id];
    if (!sampler) continue;
    GLctx.deleteSampler(sampler);
    sampler.name = 0;
    GL.samplers[id] = null;
  }
};
var _emscripten_glDeleteSamplers = _glDeleteSamplers;

var _emscripten_glDeleteShader = _glDeleteShader;

/** @suppress {duplicate } */
var _glDeleteSync = (id) => {
  if (!id) return;
  var sync = GL.syncs[id];
  if (!sync) { // glDeleteSync signals an error when deleting a nonexisting object, unlike some other GL delete functions.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  GLctx.deleteSync(sync);
  sync.name = 0;
  GL.syncs[id] = null;
};
var _emscripten_glDeleteSync = _glDeleteSync;

/** @suppress {duplicate } */
var _glDeleteTextures = (n, textures) => {
  for (var i = 0; i < n; i++) {
    var id = HEAP32[(((textures) + (i * 4)) >> 2)];
    var texture = GL.textures[id];
    // GL spec: "glDeleteTextures silently ignores 0s and names that do not
    // correspond to existing textures".
    if (!texture) continue;
    GLctx.deleteTexture(texture);
    texture.name = 0;
    GL.textures[id] = null;
  }
};
var _emscripten_glDeleteTextures = _glDeleteTextures;

/** @suppress {duplicate } */
var _glDeleteTransformFeedbacks = (n, ids) => {
  for (var i = 0; i < n; i++) {
    var id = HEAP32[(((ids) + (i * 4)) >> 2)];
    var transformFeedback = GL.transformFeedbacks[id];
    if (!transformFeedback) continue; // GL spec: "unused names in ids are ignored, as is the name zero."
    GLctx.deleteTransformFeedback(transformFeedback);
    transformFeedback.name = 0;
    GL.transformFeedbacks[id] = null;
  }
};
var _emscripten_glDeleteTransformFeedbacks = _glDeleteTransformFeedbacks;

var emulGlDeleteVertexArrays = (n, vaos) => {
  for (var i = 0; i < n; i++) {
    var id = HEAP32[(((vaos) + (i * 4)) >> 2)];
    GLEmulation.vaos[id] = null;
    if (GLEmulation.currentVao && GLEmulation.currentVao.id == id) GLEmulation.currentVao = null;
  }
};

/** @suppress {duplicate } */
var _glDeleteVertexArrays = (n, vaos) => {
  emulGlDeleteVertexArrays(n, vaos);
};
var _emscripten_glDeleteVertexArrays = _glDeleteVertexArrays;


/** @suppress {duplicate } */
var _glDeleteVertexArraysOES = _glDeleteVertexArrays;
var _emscripten_glDeleteVertexArraysOES = _glDeleteVertexArraysOES;

/** @suppress {duplicate } */
function _glDepthFunc(x0) { GLctx.depthFunc(x0) }
var _emscripten_glDepthFunc = _glDepthFunc;

/** @suppress {duplicate } */
var _glDepthMask = (flag) => {
  GLctx.depthMask(!!flag);
};
var _emscripten_glDepthMask = _glDepthMask;

/** @suppress {duplicate } */
function _glDepthRangef(x0, x1) { GLctx.depthRange(x0, x1) }
var _emscripten_glDepthRangef = _glDepthRangef;

var _emscripten_glDetachShader = _glDetachShader;

var _emscripten_glDisable = _glDisable;

/** @suppress {duplicate } */
var _glDisableClientState = (cap) => {
  var attrib = GLEmulation.getAttributeFromCapability(cap);
  if (attrib === null) {
    err(`WARNING: unhandled clientstate: ${cap}`);
    return;
  }
  if (GLImmediate.enabledClientAttributes[attrib]) {
    GLImmediate.enabledClientAttributes[attrib] = false;
    GLImmediate.totalEnabledClientAttributes--;
    GLImmediate.currentRenderer = null; // Will need to change current renderer, since the set of active vertex pointers changed.
    if (GLEmulation.currentVao) delete GLEmulation.currentVao.enabledClientStates[cap];
    GLImmediate.modifiedClientAttributes = true;
  }
};
var _emscripten_glDisableClientState = _glDisableClientState;

var _emscripten_glDisableVertexAttribArray = _glDisableVertexAttribArray;

/** @suppress {duplicate } */
var _glDrawArrays = (mode, first, count) => {
  if (GLImmediate.totalEnabledClientAttributes == 0 && mode <= 6) {
    GLctx.drawArrays(mode, first, count);
    return;
  }
  GLImmediate.prepareClientAttributes(count, false);
  GLImmediate.mode = mode;
  if (!GLctx.currentArrayBufferBinding) {
    GLImmediate.vertexData = HEAPF32.subarray((GLImmediate.vertexPointer) >> 2, (GLImmediate.vertexPointer + (first + count) * GLImmediate.stride) >> 2); // XXX assuming float
    GLImmediate.firstVertex = first;
    GLImmediate.lastVertex = first + count;
  }
  GLImmediate.flush(null, first);
  GLImmediate.mode = -1;
};
var _emscripten_glDrawArrays = _glDrawArrays;

/** @suppress {duplicate } */
var _glDrawArraysInstanced = (mode, first, count, primcount) => {
  GLctx.drawArraysInstanced(mode, first, count, primcount);
};
var _emscripten_glDrawArraysInstanced = _glDrawArraysInstanced;


/** @suppress {duplicate } */
var _glDrawArraysInstancedANGLE = _glDrawArraysInstanced;
var _emscripten_glDrawArraysInstancedANGLE = _glDrawArraysInstancedANGLE;


/** @suppress {duplicate } */
var _glDrawArraysInstancedARB = _glDrawArraysInstanced;
var _emscripten_glDrawArraysInstancedARB = _glDrawArraysInstancedARB;


/** @suppress {duplicate } */
var _glDrawArraysInstancedEXT = _glDrawArraysInstanced;
var _emscripten_glDrawArraysInstancedEXT = _glDrawArraysInstancedEXT;


/** @suppress {duplicate } */
var _glDrawArraysInstancedNV = _glDrawArraysInstanced;
var _emscripten_glDrawArraysInstancedNV = _glDrawArraysInstancedNV;

/** @suppress {duplicate } */
var _glDrawBuffer = () => { throw 'glDrawBuffer: TODO' };
var _emscripten_glDrawBuffer = _glDrawBuffer;

var tempFixedLengthArray = [];

/** @suppress {duplicate } */
var _glDrawBuffers = (n, bufs) => {

  var bufArray = tempFixedLengthArray[n];
  for (var i = 0; i < n; i++) {
    bufArray[i] = HEAP32[(((bufs) + (i * 4)) >> 2)];
  }

  GLctx.drawBuffers(bufArray);
};
var _emscripten_glDrawBuffers = _glDrawBuffers;


/** @suppress {duplicate } */
var _glDrawBuffersEXT = _glDrawBuffers;
var _emscripten_glDrawBuffersEXT = _glDrawBuffersEXT;


/** @suppress {duplicate } */
var _glDrawBuffersWEBGL = _glDrawBuffers;
var _emscripten_glDrawBuffersWEBGL = _glDrawBuffersWEBGL;

/** @suppress {duplicate } */
var _glDrawElements = (mode, count, type, indices, start, end) => { // start, end are given if we come from glDrawRangeElements
  if (GLImmediate.totalEnabledClientAttributes == 0 && mode <= 6 && GLctx.currentElementArrayBufferBinding) {
    GLctx.drawElements(mode, count, type, indices);
    return;
  }
  if (!GLctx.currentElementArrayBufferBinding) {
    assert(type == GLctx.UNSIGNED_SHORT); // We can only emulate buffers of this kind, for now
  }
  out("DrawElements doesn't actually prepareClientAttributes properly.");
  GLImmediate.prepareClientAttributes(count, false);
  GLImmediate.mode = mode;
  if (!GLctx.currentArrayBufferBinding) {
    GLImmediate.firstVertex = end ? start : HEAP8.length; // if we don't know the start, set an invalid value and we will calculate it later from the indices
    GLImmediate.lastVertex = end ? end + 1 : 0;
    GLImmediate.vertexData = HEAPF32.subarray(GLImmediate.vertexPointer >> 2, end ? (GLImmediate.vertexPointer + (end + 1) * GLImmediate.stride) >> 2 : undefined); // XXX assuming float
  }
  GLImmediate.flush(count, 0, indices);
  GLImmediate.mode = -1;
};
var _emscripten_glDrawElements = _glDrawElements;

/** @suppress {duplicate } */
var _glDrawElementsInstanced = (mode, count, type, indices, primcount) => {
  GLctx.drawElementsInstanced(mode, count, type, indices, primcount);
};
var _emscripten_glDrawElementsInstanced = _glDrawElementsInstanced;


/** @suppress {duplicate } */
var _glDrawElementsInstancedANGLE = _glDrawElementsInstanced;
var _emscripten_glDrawElementsInstancedANGLE = _glDrawElementsInstancedANGLE;


/** @suppress {duplicate } */
var _glDrawElementsInstancedARB = _glDrawElementsInstanced;
var _emscripten_glDrawElementsInstancedARB = _glDrawElementsInstancedARB;


/** @suppress {duplicate } */
var _glDrawElementsInstancedEXT = _glDrawElementsInstanced;
var _emscripten_glDrawElementsInstancedEXT = _glDrawElementsInstancedEXT;


/** @suppress {duplicate } */
var _glDrawElementsInstancedNV = _glDrawElementsInstanced;
var _emscripten_glDrawElementsInstancedNV = _glDrawElementsInstancedNV;

/** @suppress {duplicate } */
var _glDrawRangeElements = (mode, start, end, count, type, indices) => {
  _glDrawElements(mode, count, type, indices, start, end);
};
var _emscripten_glDrawRangeElements = _glDrawRangeElements;

var _emscripten_glEnable = _glEnable;

var _emscripten_glEnableClientState = _glEnableClientState;

var _emscripten_glEnableVertexAttribArray = _glEnableVertexAttribArray;

/** @suppress {duplicate } */
var _glEnd = () => {
  GLImmediate.prepareClientAttributes(GLImmediate.rendererComponents[GLImmediate.VERTEX], true);
  GLImmediate.firstVertex = 0;
  GLImmediate.lastVertex = GLImmediate.vertexCounter / (GLImmediate.stride >> 2);
  GLImmediate.flush();
  GLImmediate.disableBeginEndClientAttributes();
  GLImmediate.mode = -1;

  // Pop the old state:
  GLImmediate.enabledClientAttributes = GLImmediate.enabledClientAttributes_preBegin;
  GLImmediate.clientAttributes = GLImmediate.clientAttributes_preBegin;
  GLImmediate.currentRenderer = null; // The set of active client attributes changed, we must re-lookup the renderer to use.
  GLImmediate.modifiedClientAttributes = true;
};
var _emscripten_glEnd = _glEnd;

/** @suppress {duplicate } */
function _glEndQuery(x0) { GLctx.endQuery(x0) }
var _emscripten_glEndQuery = _glEndQuery;

/** @suppress {duplicate } */
var _glEndQueryEXT = (target) => {
  GLctx.disjointTimerQueryExt['endQueryEXT'](target);
};
var _emscripten_glEndQueryEXT = _glEndQueryEXT;

/** @suppress {duplicate } */
function _glEndTransformFeedback() { GLctx.endTransformFeedback() }
var _emscripten_glEndTransformFeedback = _glEndTransformFeedback;

/** @suppress {duplicate } */
var _glFenceSync = (condition, flags) => {
  var sync = GLctx.fenceSync(condition, flags);
  if (sync) {
    var id = GL.getNewId(GL.syncs);
    sync.name = id;
    GL.syncs[id] = sync;
    return id;
  }
  return 0; // Failed to create a sync object
};
var _emscripten_glFenceSync = _glFenceSync;

/** @suppress {duplicate } */
function _glFinish() { GLctx.finish() }
var _emscripten_glFinish = _glFinish;

/** @suppress {duplicate } */
function _glFlush() { GLctx.flush() }
var _emscripten_glFlush = _glFlush;

/** @suppress {duplicate } */
var _glFramebufferRenderbuffer = (target, attachment, renderbuffertarget, renderbuffer) => {
  GLctx.framebufferRenderbuffer(target, attachment, renderbuffertarget,
    GL.renderbuffers[renderbuffer]);
};
var _emscripten_glFramebufferRenderbuffer = _glFramebufferRenderbuffer;

/** @suppress {duplicate } */
var _glFramebufferTexture2D = (target, attachment, textarget, texture, level) => {
  GLctx.framebufferTexture2D(target, attachment, textarget,
    GL.textures[texture], level);
};
var _emscripten_glFramebufferTexture2D = _glFramebufferTexture2D;

/** @suppress {duplicate } */
var _glFramebufferTextureLayer = (target, attachment, texture, level, layer) => {
  GLctx.framebufferTextureLayer(target, attachment, GL.textures[texture], level, layer);
};
var _emscripten_glFramebufferTextureLayer = _glFramebufferTextureLayer;

/** @suppress {duplicate } */
function _glFrontFace(x0) { GLctx.frontFace(x0) }
var _emscripten_glFrontFace = _glFrontFace;

/** @suppress {duplicate } */
var _glFrustum = (left, right, bottom, top_, nearVal, farVal) => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1) | 0;
  GLImmediate.matrixLib.mat4.multiply(GLImmediate.matrix[GLImmediate.currentMatrix],
    GLImmediate.matrixLib.mat4.frustum(left, right, bottom, top_, nearVal, farVal));
};
var _emscripten_glFrustum = _glFrustum;

var __glGenObject = (n, buffers, createFunction, objectTable
) => {
  for (var i = 0; i < n; i++) {
    var buffer = GLctx[createFunction]();
    var id = buffer && GL.getNewId(objectTable);
    if (buffer) {
      buffer.name = id;
      objectTable[id] = buffer;
    } else {
      GL.recordError(0x502 /* GL_INVALID_OPERATION */);
    }
    HEAP32[(((buffers) + (i * 4)) >> 2)] = id;
  }
};

/** @suppress {duplicate } */
var _glGenBuffers = (n, buffers) => {
  __glGenObject(n, buffers, 'createBuffer', GL.buffers
  );
};
var _emscripten_glGenBuffers = _glGenBuffers;


/** @suppress {duplicate } */
var _glGenFramebuffers = (n, ids) => {
  __glGenObject(n, ids, 'createFramebuffer', GL.framebuffers
  );
};
var _emscripten_glGenFramebuffers = _glGenFramebuffers;

/** @suppress {duplicate } */
var _glGenQueries = (n, ids) => {
  __glGenObject(n, ids, 'createQuery', GL.queries
  );
};
var _emscripten_glGenQueries = _glGenQueries;

/** @suppress {duplicate } */
var _glGenQueriesEXT = (n, ids) => {
  for (var i = 0; i < n; i++) {
    var query = GLctx.disjointTimerQueryExt['createQueryEXT']();
    if (!query) {
      GL.recordError(0x502 /* GL_INVALID_OPERATION */);
      while (i < n) HEAP32[(((ids) + (i++ * 4)) >> 2)] = 0;
      return;
    }
    var id = GL.getNewId(GL.queries);
    query.name = id;
    GL.queries[id] = query;
    HEAP32[(((ids) + (i * 4)) >> 2)] = id;
  }
};
var _emscripten_glGenQueriesEXT = _glGenQueriesEXT;


/** @suppress {duplicate } */
var _glGenRenderbuffers = (n, renderbuffers) => {
  __glGenObject(n, renderbuffers, 'createRenderbuffer', GL.renderbuffers
  );
};
var _emscripten_glGenRenderbuffers = _glGenRenderbuffers;

/** @suppress {duplicate } */
var _glGenSamplers = (n, samplers) => {
  __glGenObject(n, samplers, 'createSampler', GL.samplers
  );
};
var _emscripten_glGenSamplers = _glGenSamplers;


/** @suppress {duplicate } */
var _glGenTextures = (n, textures) => {
  __glGenObject(n, textures, 'createTexture', GL.textures
  );
};
var _emscripten_glGenTextures = _glGenTextures;

/** @suppress {duplicate } */
var _glGenTransformFeedbacks = (n, ids) => {
  __glGenObject(n, ids, 'createTransformFeedback', GL.transformFeedbacks
  );
};
var _emscripten_glGenTransformFeedbacks = _glGenTransformFeedbacks;


var emulGlGenVertexArrays = (n, vaos) => {
  for (var i = 0; i < n; i++) {
    var id = GL.getNewId(GLEmulation.vaos);
    GLEmulation.vaos[id] = {
      id,
      arrayBuffer: 0,
      elementArrayBuffer: 0,
      enabledVertexAttribArrays: {},
      vertexAttribPointers: {},
      enabledClientStates: {},
    };
    HEAP32[(((vaos) + (i * 4)) >> 2)] = id;
  }
};

/** @suppress {duplicate } */
function _glGenVertexArrays(n, arrays) {
  emulGlGenVertexArrays(n, arrays);
}
var _emscripten_glGenVertexArrays = _glGenVertexArrays;


/** @suppress {duplicate } */
var _glGenVertexArraysOES = _glGenVertexArrays;
var _emscripten_glGenVertexArraysOES = _glGenVertexArraysOES;

/** @suppress {duplicate } */
function _glGenerateMipmap(x0) { GLctx.generateMipmap(x0) }
var _emscripten_glGenerateMipmap = _glGenerateMipmap;


var __glGetActiveAttribOrUniform = (funcName, program, index, bufSize, length, size, type, name) => {
  program = GL.programs[program];
  var info = GLctx[funcName](program, index);
  if (info) {
    // If an error occurs, nothing will be written to length, size and type and name.
    var numBytesWrittenExclNull = name && stringToUTF8(info.name, name, bufSize);
    if (length) HEAP32[((length) >> 2)] = numBytesWrittenExclNull;
    if (size) HEAP32[((size) >> 2)] = info.size;
    if (type) HEAP32[((type) >> 2)] = info.type;
  }
};

/** @suppress {duplicate } */
var _glGetActiveAttrib = (program, index, bufSize, length, size, type, name) => {
  __glGetActiveAttribOrUniform('getActiveAttrib', program, index, bufSize, length, size, type, name);
};
var _emscripten_glGetActiveAttrib = _glGetActiveAttrib;


/** @suppress {duplicate } */
var _glGetActiveUniform = (program, index, bufSize, length, size, type, name) => {
  __glGetActiveAttribOrUniform('getActiveUniform', program, index, bufSize, length, size, type, name);
};
var _emscripten_glGetActiveUniform = _glGetActiveUniform;

/** @suppress {duplicate } */
var _glGetActiveUniformBlockName = (program, uniformBlockIndex, bufSize, length, uniformBlockName) => {
  program = GL.programs[program];

  var result = GLctx.getActiveUniformBlockName(program, uniformBlockIndex);
  if (!result) return; // If an error occurs, nothing will be written to uniformBlockName or length.
  if (uniformBlockName && bufSize > 0) {
    var numBytesWrittenExclNull = stringToUTF8(result, uniformBlockName, bufSize);
    if (length) HEAP32[((length) >> 2)] = numBytesWrittenExclNull;
  } else {
    if (length) HEAP32[((length) >> 2)] = 0;
  }
};
var _emscripten_glGetActiveUniformBlockName = _glGetActiveUniformBlockName;

/** @suppress {duplicate } */
var _glGetActiveUniformBlockiv = (program, uniformBlockIndex, pname, params) => {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if params == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  program = GL.programs[program];

  if (pname == 0x8A41 /* GL_UNIFORM_BLOCK_NAME_LENGTH */) {
    var name = GLctx.getActiveUniformBlockName(program, uniformBlockIndex);
    HEAP32[((params) >> 2)] = name.length + 1;
    return;
  }

  var result = GLctx.getActiveUniformBlockParameter(program, uniformBlockIndex, pname);
  if (result === null) return; // If an error occurs, nothing should be written to params.
  if (pname == 0x8A43 /*GL_UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES*/) {
    for (var i = 0; i < result.length; i++) {
      HEAP32[(((params) + (i * 4)) >> 2)] = result[i];
    }
  } else {
    HEAP32[((params) >> 2)] = result;
  }
};
var _emscripten_glGetActiveUniformBlockiv = _glGetActiveUniformBlockiv;

/** @suppress {duplicate } */
var _glGetActiveUniformsiv = (program, uniformCount, uniformIndices, pname, params) => {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if params == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  if (uniformCount > 0 && uniformIndices == 0) {
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  program = GL.programs[program];
  var ids = [];
  for (var i = 0; i < uniformCount; i++) {
    ids.push(HEAP32[(((uniformIndices) + (i * 4)) >> 2)]);
  }

  var result = GLctx.getActiveUniforms(program, ids, pname);
  if (!result) return; // GL spec: If an error is generated, nothing is written out to params.

  var len = result.length;
  for (var i = 0; i < len; i++) {
    HEAP32[(((params) + (i * 4)) >> 2)] = result[i];
  }
};
var _emscripten_glGetActiveUniformsiv = _glGetActiveUniformsiv;

/** @suppress {duplicate } */
var _glGetAttachedShaders = (program, maxCount, count, shaders) => {
  var result = GLctx.getAttachedShaders(GL.programs[program]);
  var len = result.length;
  if (len > maxCount) {
    len = maxCount;
  }
  HEAP32[((count) >> 2)] = len;
  for (var i = 0; i < len; ++i) {
    var id = GL.shaders.indexOf(result[i]);
    HEAP32[(((shaders) + (i * 4)) >> 2)] = id;
  }
};
var _emscripten_glGetAttachedShaders = _glGetAttachedShaders;


/** @suppress {duplicate } */
var _glGetAttribLocation = (program, name) => {
  return GLctx.getAttribLocation(GL.programs[program], UTF8ToString(name));
};
var _emscripten_glGetAttribLocation = _glGetAttribLocation;

var _emscripten_glGetBooleanv = _glGetBooleanv;

/** @suppress {duplicate } */
var _glGetBufferParameteri64v = (target, value, data) => {
  if (!data) {
    // GLES2 specification does not specify how to behave if data is a null pointer. Since calling this function does not make sense
    // if data == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  writeI53ToI64(data, GLctx.getBufferParameter(target, value));
};
var _emscripten_glGetBufferParameteri64v = _glGetBufferParameteri64v;

/** @suppress {duplicate } */
var _glGetBufferParameteriv = (target, value, data) => {
  if (!data) {
    // GLES2 specification does not specify how to behave if data is a null
    // pointer. Since calling this function does not make sense if data ==
    // null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  HEAP32[((data) >> 2)] = GLctx.getBufferParameter(target, value);
};
var _emscripten_glGetBufferParameteriv = _glGetBufferParameteriv;

/** @suppress {duplicate } */
var _glGetError = () => {
  var error = GLctx.getError() || GL.lastError;
  GL.lastError = 0/*GL_NO_ERROR*/;
  return error;
};
var _emscripten_glGetError = _glGetError;

var _emscripten_glGetFloatv = _glGetFloatv;

/** @suppress {duplicate } */
var _glGetFragDataLocation = (program, name) => {
  return GLctx.getFragDataLocation(GL.programs[program], UTF8ToString(name));
};
var _emscripten_glGetFragDataLocation = _glGetFragDataLocation;

/** @suppress {duplicate } */
var _glGetFramebufferAttachmentParameteriv = (target, attachment, pname, params) => {
  var result = GLctx.getFramebufferAttachmentParameter(target, attachment, pname);
  if (result instanceof WebGLRenderbuffer ||
    result instanceof WebGLTexture) {
    result = result.name | 0;
  }
  HEAP32[((params) >> 2)] = result;
};
var _emscripten_glGetFramebufferAttachmentParameteriv = _glGetFramebufferAttachmentParameteriv;

var _glGetProgramInfoLog = (program, maxLength, length, infoLog) => {
  var log = GLctx.getProgramInfoLog(GL.programs[program]);
  if (log === null) log = '(unknown error)';
  var numBytesWrittenExclNull = (maxLength > 0 && infoLog) ? stringToUTF8(log, infoLog, maxLength) : 0;
  if (length) HEAP32[((length) >> 2)] = numBytesWrittenExclNull;
};


var _glGetShaderInfoLog = (shader, maxLength, length, infoLog) => {
  var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
  if (log === null) log = '(unknown error)';
  var numBytesWrittenExclNull = (maxLength > 0 && infoLog) ? stringToUTF8(log, infoLog, maxLength) : 0;
  if (length) HEAP32[((length) >> 2)] = numBytesWrittenExclNull;
};
/** @suppress {duplicate } */
var _glGetInfoLog = (id, maxLength, length, infoLog) => {
  if (GL.programs[id]) {
    _glGetProgramInfoLog(id, maxLength, length, infoLog);
  } else if (GL.shaders[id]) {
    _glGetShaderInfoLog(id, maxLength, length, infoLog);
  } else {
    err(`WARNING: glGetInfoLog received invalid id: ${id}`);
  }
};
var _emscripten_glGetInfoLog = _glGetInfoLog;

var emscriptenWebGLGetIndexed = (target, index, data, type) => {
  if (!data) {
    // GLES2 specification does not specify how to behave if data is a null pointer. Since calling this function does not make sense
    // if data == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  var result = GLctx.getIndexedParameter(target, index);
  var ret;
  switch (typeof result) {
    case 'boolean':
      ret = result ? 1 : 0;
      break;
    case 'number':
      ret = result;
      break;
    case 'object':
      if (result === null) {
        switch (target) {
          case 0x8C8F: // TRANSFORM_FEEDBACK_BUFFER_BINDING
          case 0x8A28: // UNIFORM_BUFFER_BINDING
            ret = 0;
            break;
          default: {
            GL.recordError(0x500); // GL_INVALID_ENUM
            return;
          }
        }
      } else if (result instanceof WebGLBuffer) {
        ret = result.name | 0;
      } else {
        GL.recordError(0x500); // GL_INVALID_ENUM
        return;
      }
      break;
    default:
      GL.recordError(0x500); // GL_INVALID_ENUM
      return;
  }

  switch (type) {
    case 1: writeI53ToI64(data, ret); break;
    case 0: HEAP32[((data) >> 2)] = ret; break;
    case 2: HEAPF32[((data) >> 2)] = ret; break;
    case 4: HEAP8[((data) >> 0)] = ret ? 1 : 0; break;
    default: throw 'internal emscriptenWebGLGetIndexed() error, bad type: ' + type;
  }
};
/** @suppress {duplicate } */
var _glGetInteger64i_v = (target, index, data) =>
  emscriptenWebGLGetIndexed(target, index, data, 1);
var _emscripten_glGetInteger64i_v = _glGetInteger64i_v;

/** @suppress {duplicate } */
var _glGetInteger64v = (name_, p) => {
  emscriptenWebGLGet(name_, p, 1);
};
var _emscripten_glGetInteger64v = _glGetInteger64v;

/** @suppress {duplicate } */
var _glGetIntegeri_v = (target, index, data) =>
  emscriptenWebGLGetIndexed(target, index, data, 0);
var _emscripten_glGetIntegeri_v = _glGetIntegeri_v;

var _emscripten_glGetIntegerv = _glGetIntegerv;

/** @suppress {duplicate } */
var _glGetInternalformativ = (target, internalformat, pname, bufSize, params) => {
  if (bufSize < 0) {
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  if (!params) {
    // GLES3 specification does not specify how to behave if values is a null pointer. Since calling this function does not make sense
    // if values == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  var ret = GLctx.getInternalformatParameter(target, internalformat, pname);
  if (ret === null) return;
  for (var i = 0; i < ret.length && i < bufSize; ++i) {
    HEAP32[(((params) + (i * 4)) >> 2)] = ret[i];
  }
};
var _emscripten_glGetInternalformativ = _glGetInternalformativ;

var _glGetProgramiv = (program, pname, p) => {
  if (!p) {
    // GLES2 specification does not specify how to behave if p is a null
    // pointer. Since calling this function does not make sense if p == null,
    // issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }

  if (program >= GL.counter) {
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }

  program = GL.programs[program];

  if (pname == 0x8B84) { // GL_INFO_LOG_LENGTH
    var log = GLctx.getProgramInfoLog(program);
    if (log === null) log = '(unknown error)';
    HEAP32[((p) >> 2)] = log.length + 1;
  } else if (pname == 0x8B87 /* GL_ACTIVE_UNIFORM_MAX_LENGTH */) {
    if (!program.maxUniformLength) {
      for (var i = 0; i < GLctx.getProgramParameter(program, 0x8B86/*GL_ACTIVE_UNIFORMS*/); ++i) {
        program.maxUniformLength = Math.max(program.maxUniformLength, GLctx.getActiveUniform(program, i).name.length + 1);
      }
    }
    HEAP32[((p) >> 2)] = program.maxUniformLength;
  } else if (pname == 0x8B8A /* GL_ACTIVE_ATTRIBUTE_MAX_LENGTH */) {
    if (!program.maxAttributeLength) {
      for (var i = 0; i < GLctx.getProgramParameter(program, 0x8B89/*GL_ACTIVE_ATTRIBUTES*/); ++i) {
        program.maxAttributeLength = Math.max(program.maxAttributeLength, GLctx.getActiveAttrib(program, i).name.length + 1);
      }
    }
    HEAP32[((p) >> 2)] = program.maxAttributeLength;
  } else if (pname == 0x8A35 /* GL_ACTIVE_UNIFORM_BLOCK_MAX_NAME_LENGTH */) {
    if (!program.maxUniformBlockNameLength) {
      for (var i = 0; i < GLctx.getProgramParameter(program, 0x8A36/*GL_ACTIVE_UNIFORM_BLOCKS*/); ++i) {
        program.maxUniformBlockNameLength = Math.max(program.maxUniformBlockNameLength, GLctx.getActiveUniformBlockName(program, i).length + 1);
      }
    }
    HEAP32[((p) >> 2)] = program.maxUniformBlockNameLength;
  } else {
    HEAP32[((p) >> 2)] = GLctx.getProgramParameter(program, pname);
  }
};

var _glGetShaderiv = (shader, pname, p) => {
  if (!p) {
    // GLES2 specification does not specify how to behave if p is a null
    // pointer. Since calling this function does not make sense if p == null,
    // issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  if (pname == 0x8B84) { // GL_INFO_LOG_LENGTH
    var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
    if (log === null) log = '(unknown error)';
    // The GLES2 specification says that if the shader has an empty info log,
    // a value of 0 is returned. Otherwise the log has a null char appended.
    // (An empty string is falsey, so we can just check that instead of
    // looking at log.length.)
    var logLength = log ? log.length + 1 : 0;
    HEAP32[((p) >> 2)] = logLength;
  } else if (pname == 0x8B88) { // GL_SHADER_SOURCE_LENGTH
    var source = GLctx.getShaderSource(GL.shaders[shader]);
    // source may be a null, or the empty string, both of which are falsey
    // values that we report a 0 length for.
    var sourceLength = source ? source.length + 1 : 0;
    HEAP32[((p) >> 2)] = sourceLength;
  } else {
    HEAP32[((p) >> 2)] = GLctx.getShaderParameter(GL.shaders[shader], pname);
  }
};
/** @suppress {duplicate } */
var _glGetObjectParameteriv = (id, type, result) => {
  if (GL.programs[id]) {
    if (type == 0x8B84) { // GL_OBJECT_INFO_LOG_LENGTH_ARB
      var log = GLctx.getProgramInfoLog(GL.programs[id]);
      if (log === null) log = '(unknown error)';
      HEAP32[((result) >> 2)] = log.length;
      return;
    }
    _glGetProgramiv(id, type, result);
  } else if (GL.shaders[id]) {
    if (type == 0x8B84) { // GL_OBJECT_INFO_LOG_LENGTH_ARB
      var log = GLctx.getShaderInfoLog(GL.shaders[id]);
      if (log === null) log = '(unknown error)';
      HEAP32[((result) >> 2)] = log.length;
      return;
    } else if (type == 0x8B88) { // GL_OBJECT_SHADER_SOURCE_LENGTH_ARB
      var source = GLctx.getShaderSource(GL.shaders[id]);
      if (source === null) return; // If an error occurs, nothing will be written to result
      HEAP32[((result) >> 2)] = source.length;
      return;
    }
    _glGetShaderiv(id, type, result);
  } else {
    err(`WARNING: getObjectParameteriv received invalid id: ${id}`);
  }
};
var _emscripten_glGetObjectParameteriv = _glGetObjectParameteriv;

/** @suppress {duplicate } */
var _glGetPointerv = (name, p) => {
  var attribute;
  switch (name) {
    case 0x808E: // GL_VERTEX_ARRAY_POINTER
      attribute = GLImmediate.clientAttributes[GLImmediate.VERTEX]; break;
    case 0x8090: // GL_COLOR_ARRAY_POINTER
      attribute = GLImmediate.clientAttributes[GLImmediate.COLOR]; break;
    case 0x8092: // GL_TEXTURE_COORD_ARRAY_POINTER
      attribute = GLImmediate.clientAttributes[GLImmediate.TEXTURE0 + GLImmediate.clientActiveTexture]; break;
    default:
      GL.recordError(0x500/*GL_INVALID_ENUM*/);
      return;
  }
  HEAP32[((p) >> 2)] = attribute ? attribute.pointer : 0;
};
var _emscripten_glGetPointerv = _glGetPointerv;

/** @suppress {duplicate } */
var _glGetProgramBinary = (program, bufSize, length, binaryFormat, binary) => {
  GL.recordError(0x502/*GL_INVALID_OPERATION*/);
};
var _emscripten_glGetProgramBinary = _glGetProgramBinary;

var _emscripten_glGetProgramInfoLog = _glGetProgramInfoLog;

var _emscripten_glGetProgramiv = _glGetProgramiv;


/** @suppress {duplicate } */
var _glGetQueryObjecti64vEXT = (id, pname, params) => {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if p == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  var query = GL.queries[id];
  var param;
  if (GL.currentContext.version < 2) {
    param = GLctx.disjointTimerQueryExt['getQueryObjectEXT'](query, pname);
  }
  else {
    param = GLctx.getQueryParameter(query, pname);
  }
  var ret;
  if (typeof param == 'boolean') {
    ret = param ? 1 : 0;
  } else {
    ret = param;
  }
  writeI53ToI64(params, ret);
};
var _emscripten_glGetQueryObjecti64vEXT = _glGetQueryObjecti64vEXT;

/** @suppress {duplicate } */
var _glGetQueryObjectivEXT = (id, pname, params) => {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if p == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  var query = GL.queries[id];
  var param = GLctx.disjointTimerQueryExt['getQueryObjectEXT'](query, pname);
  var ret;
  if (typeof param == 'boolean') {
    ret = param ? 1 : 0;
  } else {
    ret = param;
  }
  HEAP32[((params) >> 2)] = ret;
};
var _emscripten_glGetQueryObjectivEXT = _glGetQueryObjectivEXT;


/** @suppress {duplicate } */
var _glGetQueryObjectui64vEXT = _glGetQueryObjecti64vEXT;
var _emscripten_glGetQueryObjectui64vEXT = _glGetQueryObjectui64vEXT;

/** @suppress {duplicate } */
var _glGetQueryObjectuiv = (id, pname, params) => {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if p == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  var query = GL.queries[id];
  var param = GLctx.getQueryParameter(query, pname);
  var ret;
  if (typeof param == 'boolean') {
    ret = param ? 1 : 0;
  } else {
    ret = param;
  }
  HEAP32[((params) >> 2)] = ret;
};
var _emscripten_glGetQueryObjectuiv = _glGetQueryObjectuiv;


/** @suppress {duplicate } */
var _glGetQueryObjectuivEXT = _glGetQueryObjectivEXT;
var _emscripten_glGetQueryObjectuivEXT = _glGetQueryObjectuivEXT;

/** @suppress {duplicate } */
var _glGetQueryiv = (target, pname, params) => {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if p == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  HEAP32[((params) >> 2)] = GLctx.getQuery(target, pname);
};
var _emscripten_glGetQueryiv = _glGetQueryiv;

/** @suppress {duplicate } */
var _glGetQueryivEXT = (target, pname, params) => {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if p == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  HEAP32[((params) >> 2)] = GLctx.disjointTimerQueryExt['getQueryEXT'](target, pname);
};
var _emscripten_glGetQueryivEXT = _glGetQueryivEXT;

/** @suppress {duplicate } */
var _glGetRenderbufferParameteriv = (target, pname, params) => {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if params == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  HEAP32[((params) >> 2)] = GLctx.getRenderbufferParameter(target, pname);
};
var _emscripten_glGetRenderbufferParameteriv = _glGetRenderbufferParameteriv;

/** @suppress {duplicate } */
var _glGetSamplerParameterfv = (sampler, pname, params) => {
  if (!params) {
    // GLES3 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if p == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  HEAPF32[((params) >> 2)] = GLctx.getSamplerParameter(GL.samplers[sampler], pname);
};
var _emscripten_glGetSamplerParameterfv = _glGetSamplerParameterfv;

/** @suppress {duplicate } */
var _glGetSamplerParameteriv = (sampler, pname, params) => {
  if (!params) {
    // GLES3 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if p == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  HEAP32[((params) >> 2)] = GLctx.getSamplerParameter(GL.samplers[sampler], pname);
};
var _emscripten_glGetSamplerParameteriv = _glGetSamplerParameteriv;

var _emscripten_glGetShaderInfoLog = _glGetShaderInfoLog;

/** @suppress {duplicate } */
var _glGetShaderPrecisionFormat = (shaderType, precisionType, range, precision) => {
  var result = GLctx.getShaderPrecisionFormat(shaderType, precisionType);
  HEAP32[((range) >> 2)] = result.rangeMin;
  HEAP32[(((range) + (4)) >> 2)] = result.rangeMax;
  HEAP32[((precision) >> 2)] = result.precision;
};
var _emscripten_glGetShaderPrecisionFormat = _glGetShaderPrecisionFormat;

/** @suppress {duplicate } */
var _glGetShaderSource = (shader, bufSize, length, source) => {
  var result = GLctx.getShaderSource(GL.shaders[shader]);
  if (!result) return; // If an error occurs, nothing will be written to length or source.
  var numBytesWrittenExclNull = (bufSize > 0 && source) ? stringToUTF8(result, source, bufSize) : 0;
  if (length) HEAP32[((length) >> 2)] = numBytesWrittenExclNull;
};
var _emscripten_glGetShaderSource = _glGetShaderSource;

var _emscripten_glGetShaderiv = _glGetShaderiv;

var _emscripten_glGetString = _glGetString;

/** @suppress {duplicate } */
var _glGetStringi = (name, index) => {
  if (GL.currentContext.version < 2) {
    GL.recordError(0x502 /* GL_INVALID_OPERATION */); // Calling GLES3/WebGL2 function with a GLES2/WebGL1 context
    return 0;
  }
  var stringiCache = GL.stringiCache[name];
  if (stringiCache) {
    if (index < 0 || index >= stringiCache.length) {
      GL.recordError(0x501/*GL_INVALID_VALUE*/);
      return 0;
    }
    return stringiCache[index];
  }
  switch (name) {
    case 0x1F03 /* GL_EXTENSIONS */:
      var exts = GL.getExtensions().map((e) => stringToNewUTF8(e));
      stringiCache = GL.stringiCache[name] = exts;
      if (index < 0 || index >= stringiCache.length) {
        GL.recordError(0x501/*GL_INVALID_VALUE*/);
        return 0;
      }
      return stringiCache[index];
    default:
      GL.recordError(0x500/*GL_INVALID_ENUM*/);
      return 0;
  }
};
var _emscripten_glGetStringi = _glGetStringi;

/** @suppress {duplicate } */
var _glGetSynciv = (sync, pname, bufSize, length, values) => {
  if (bufSize < 0) {
    // GLES3 specification does not specify how to behave if bufSize < 0, however in the spec wording for glGetInternalformativ, it does say that GL_INVALID_VALUE should be raised,
    // so raise GL_INVALID_VALUE here as well.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  if (!values) {
    // GLES3 specification does not specify how to behave if values is a null pointer. Since calling this function does not make sense
    // if values == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  var ret = GLctx.getSyncParameter(GL.syncs[sync], pname);
  if (ret !== null) {
    HEAP32[((values) >> 2)] = ret;
    if (length) HEAP32[((length) >> 2)] = 1; // Report a single value outputted.
  }
};
var _emscripten_glGetSynciv = _glGetSynciv;

/** @suppress {duplicate } */
var _glGetTexEnvfv = (target, pname, param) => { throw 'GL emulation not initialized!'; };
var _emscripten_glGetTexEnvfv = _glGetTexEnvfv;

/** @suppress {duplicate } */
var _glGetTexEnviv = (target, pname, param) => { throw 'GL emulation not initialized!'; };
var _emscripten_glGetTexEnviv = _glGetTexEnviv;

/** @suppress {duplicate } */
var _glGetTexLevelParameteriv = (target, level, pname, params) => { throw 'glGetTexLevelParameteriv: TODO' };
var _emscripten_glGetTexLevelParameteriv = _glGetTexLevelParameteriv;

/** @suppress {duplicate } */
var _glGetTexParameterfv = (target, pname, params) => {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null
    // pointer. Since calling this function does not make sense if p == null,
    // issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  HEAPF32[((params) >> 2)] = GLctx.getTexParameter(target, pname);
};
var _emscripten_glGetTexParameterfv = _glGetTexParameterfv;

/** @suppress {duplicate } */
var _glGetTexParameteriv = (target, pname, params) => {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null
    // pointer. Since calling this function does not make sense if p == null,
    // issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  HEAP32[((params) >> 2)] = GLctx.getTexParameter(target, pname);
};
var _emscripten_glGetTexParameteriv = _glGetTexParameteriv;

/** @suppress {duplicate } */
var _glGetTransformFeedbackVarying = (program, index, bufSize, length, size, type, name) => {
  program = GL.programs[program];
  var info = GLctx.getTransformFeedbackVarying(program, index);
  if (!info) return; // If an error occurred, the return parameters length, size, type and name will be unmodified.

  if (name && bufSize > 0) {
    var numBytesWrittenExclNull = stringToUTF8(info.name, name, bufSize);
    if (length) HEAP32[((length) >> 2)] = numBytesWrittenExclNull;
  } else {
    if (length) HEAP32[((length) >> 2)] = 0;
  }

  if (size) HEAP32[((size) >> 2)] = info.size;
  if (type) HEAP32[((type) >> 2)] = info.type;
};
var _emscripten_glGetTransformFeedbackVarying = _glGetTransformFeedbackVarying;

/** @suppress {duplicate } */
var _glGetUniformBlockIndex = (program, uniformBlockName) => {
  return GLctx.getUniformBlockIndex(GL.programs[program], UTF8ToString(uniformBlockName));
};
var _emscripten_glGetUniformBlockIndex = _glGetUniformBlockIndex;

/** @suppress {duplicate } */
var _glGetUniformIndices = (program, uniformCount, uniformNames, uniformIndices) => {
  if (!uniformIndices) {
    // GLES2 specification does not specify how to behave if uniformIndices is a null pointer. Since calling this function does not make sense
    // if uniformIndices == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  if (uniformCount > 0 && (uniformNames == 0 || uniformIndices == 0)) {
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  program = GL.programs[program];
  var names = [];
  for (var i = 0; i < uniformCount; i++)
    names.push(UTF8ToString(HEAP32[(((uniformNames) + (i * 4)) >> 2)]));

  var result = GLctx.getUniformIndices(program, names);
  if (!result) return; // GL spec: If an error is generated, nothing is written out to uniformIndices.

  var len = result.length;
  for (var i = 0; i < len; i++) {
    HEAP32[(((uniformIndices) + (i * 4)) >> 2)] = result[i];
  }
};
var _emscripten_glGetUniformIndices = _glGetUniformIndices;


/** @noinline */
var webglGetLeftBracePos = (name) => name.slice(-1) == ']' && name.lastIndexOf('[');

var webglPrepareUniformLocationsBeforeFirstUse = (program) => {
  var uniformLocsById = program.uniformLocsById, // Maps GLuint -> WebGLUniformLocation
    uniformSizeAndIdsByName = program.uniformSizeAndIdsByName, // Maps name -> [uniform array length, GLuint]
    i, j;

  // On the first time invocation of glGetUniformLocation on this shader program:
  // initialize cache data structures and discover which uniforms are arrays.
  if (!uniformLocsById) {
    // maps GLint integer locations to WebGLUniformLocations
    program.uniformLocsById = uniformLocsById = {};
    // maps integer locations back to uniform name strings, so that we can lazily fetch uniform array locations
    program.uniformArrayNamesById = {};

    for (i = 0; i < GLctx.getProgramParameter(program, 0x8B86/*GL_ACTIVE_UNIFORMS*/); ++i) {
      var u = GLctx.getActiveUniform(program, i);
      var nm = u.name;
      var sz = u.size;
      var lb = webglGetLeftBracePos(nm);
      var arrayName = lb > 0 ? nm.slice(0, lb) : nm;

      // Assign a new location.
      var id = program.uniformIdCounter;
      program.uniformIdCounter += sz;
      // Eagerly get the location of the uniformArray[0] base element.
      // The remaining indices >0 will be left for lazy evaluation to
      // improve performance. Those may never be needed to fetch, if the
      // application fills arrays always in full starting from the first
      // element of the array.
      uniformSizeAndIdsByName[arrayName] = [sz, id];

      // Store placeholder integers in place that highlight that these
      // >0 index locations are array indices pending population.
      for (j = 0; j < sz; ++j) {
        uniformLocsById[id] = j;
        program.uniformArrayNamesById[id++] = arrayName;
      }
    }
  }
};



/** @suppress {duplicate } */
var _glGetUniformLocation = (program, name) => {

  name = UTF8ToString(name);

  if (program = GL.programs[program]) {
    webglPrepareUniformLocationsBeforeFirstUse(program);
    var uniformLocsById = program.uniformLocsById; // Maps GLuint -> WebGLUniformLocation
    var arrayIndex = 0;
    var uniformBaseName = name;

    // Invariant: when populating integer IDs for uniform locations, we must
    // maintain the precondition that arrays reside in contiguous addresses,
    // i.e. for a 'vec4 colors[10];', colors[4] must be at location
    // colors[0]+4.  However, user might call glGetUniformLocation(program,
    // "colors") for an array, so we cannot discover based on the user input
    // arguments whether the uniform we are dealing with is an array. The only
    // way to discover which uniforms are arrays is to enumerate over all the
    // active uniforms in the program.
    var leftBrace = webglGetLeftBracePos(name);

    // If user passed an array accessor "[index]", parse the array index off the accessor.
    if (leftBrace > 0) {
      arrayIndex = jstoi_q(name.slice(leftBrace + 1)) >>> 0; // "index]", coerce parseInt(']') with >>>0 to treat "foo[]" as "foo[0]" and foo[-1] as unsigned out-of-bounds.
      uniformBaseName = name.slice(0, leftBrace);
    }

    // Have we cached the location of this uniform before?
    // A pair [array length, GLint of the uniform location]
    var sizeAndId = program.uniformSizeAndIdsByName[uniformBaseName];

    // If an uniform with this name exists, and if its index is within the
    // array limits (if it's even an array), query the WebGLlocation, or
    // return an existing cached location.
    if (sizeAndId && arrayIndex < sizeAndId[0]) {
      arrayIndex += sizeAndId[1]; // Add the base location of the uniform to the array index offset.
      if ((uniformLocsById[arrayIndex] = uniformLocsById[arrayIndex] || GLctx.getUniformLocation(program, name))) {
        return arrayIndex;
      }
    }
  }
  else {
    // N.b. we are currently unable to distinguish between GL program IDs that
    // never existed vs GL program IDs that have been deleted, so report
    // GL_INVALID_VALUE in both cases.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
  }
  return -1;
};
var _emscripten_glGetUniformLocation = _glGetUniformLocation;

var webglGetUniformLocation = (location) => {
  var p = GLctx.currentProgram;

  if (p) {
    var webglLoc = p.uniformLocsById[location];
    // p.uniformLocsById[location] stores either an integer, or a
    // WebGLUniformLocation.
    // If an integer, we have not yet bound the location, so do it now. The
    // integer value specifies the array index we should bind to.
    if (typeof webglLoc == 'number') {
      p.uniformLocsById[location] = webglLoc = GLctx.getUniformLocation(p, p.uniformArrayNamesById[location] + (webglLoc > 0 ? `[${webglLoc}]` : ''));
    }
    // Else an already cached WebGLUniformLocation, return it.
    return webglLoc;
  } else {
    GL.recordError(0x502/*GL_INVALID_OPERATION*/);
  }
};


/** @suppress{checkTypes} */
var emscriptenWebGLGetUniform = (program, location, params, type) => {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null
    // pointer. Since calling this function does not make sense if params ==
    // null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  program = GL.programs[program];
  webglPrepareUniformLocationsBeforeFirstUse(program);
  var data = GLctx.getUniform(program, webglGetUniformLocation(location));
  if (typeof data == 'number' || typeof data == 'boolean') {
    switch (type) {
      case 0: HEAP32[((params) >> 2)] = data; break;
      case 2: HEAPF32[((params) >> 2)] = data; break;
    }
  } else {
    for (var i = 0; i < data.length; i++) {
      switch (type) {
        case 0: HEAP32[(((params) + (i * 4)) >> 2)] = data[i]; break;
        case 2: HEAPF32[(((params) + (i * 4)) >> 2)] = data[i]; break;
      }
    }
  }
};

/** @suppress {duplicate } */
var _glGetUniformfv = (program, location, params) => {
  emscriptenWebGLGetUniform(program, location, params, 2);
};
var _emscripten_glGetUniformfv = _glGetUniformfv;


/** @suppress {duplicate } */
var _glGetUniformiv = (program, location, params) => {
  emscriptenWebGLGetUniform(program, location, params, 0);
};
var _emscripten_glGetUniformiv = _glGetUniformiv;

/** @suppress {duplicate } */
var _glGetUniformuiv = (program, location, params) =>
  emscriptenWebGLGetUniform(program, location, params, 0);
var _emscripten_glGetUniformuiv = _glGetUniformuiv;

/** @suppress{checkTypes} */
var emscriptenWebGLGetVertexAttrib = (index, pname, params, type) => {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null
    // pointer. Since calling this function does not make sense if params ==
    // null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  var data = GLctx.getVertexAttrib(index, pname);
  if (pname == 0x889F/*VERTEX_ATTRIB_ARRAY_BUFFER_BINDING*/) {
    HEAP32[((params) >> 2)] = data && data["name"];
  } else if (typeof data == 'number' || typeof data == 'boolean') {
    switch (type) {
      case 0: HEAP32[((params) >> 2)] = data; break;
      case 2: HEAPF32[((params) >> 2)] = data; break;
      case 5: HEAP32[((params) >> 2)] = Math.fround(data); break;
    }
  } else {
    for (var i = 0; i < data.length; i++) {
      switch (type) {
        case 0: HEAP32[(((params) + (i * 4)) >> 2)] = data[i]; break;
        case 2: HEAPF32[(((params) + (i * 4)) >> 2)] = data[i]; break;
        case 5: HEAP32[(((params) + (i * 4)) >> 2)] = Math.fround(data[i]); break;
      }
    }
  }
};
/** @suppress {duplicate } */
var _glGetVertexAttribIiv = (index, pname, params) => {
  // N.B. This function may only be called if the vertex attribute was specified using the function glVertexAttribI4iv(),
  // otherwise the results are undefined. (GLES3 spec 6.1.12)
  emscriptenWebGLGetVertexAttrib(index, pname, params, 0);
};
var _emscripten_glGetVertexAttribIiv = _glGetVertexAttribIiv;


/** @suppress {duplicate } */
var _glGetVertexAttribIuiv = _glGetVertexAttribIiv;
var _emscripten_glGetVertexAttribIuiv = _glGetVertexAttribIuiv;

/** @suppress {duplicate } */
var _glGetVertexAttribPointerv = (index, pname, pointer) => {
  if (!pointer) {
    // GLES2 specification does not specify how to behave if pointer is a null
    // pointer. Since calling this function does not make sense if pointer ==
    // null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  HEAP32[((pointer) >> 2)] = GLctx.getVertexAttribOffset(index, pname);
};
var _emscripten_glGetVertexAttribPointerv = _glGetVertexAttribPointerv;


/** @suppress {duplicate } */
var _glGetVertexAttribfv = (index, pname, params) => {
  // N.B. This function may only be called if the vertex attribute was
  // specified using the function glVertexAttrib*f(), otherwise the results
  // are undefined. (GLES3 spec 6.1.12)
  emscriptenWebGLGetVertexAttrib(index, pname, params, 2);
};
var _emscripten_glGetVertexAttribfv = _glGetVertexAttribfv;


/** @suppress {duplicate } */
var _glGetVertexAttribiv = (index, pname, params) => {
  // N.B. This function may only be called if the vertex attribute was
  // specified using the function glVertexAttrib*f(), otherwise the results
  // are undefined. (GLES3 spec 6.1.12)
  emscriptenWebGLGetVertexAttrib(index, pname, params, 5);
};
var _emscripten_glGetVertexAttribiv = _glGetVertexAttribiv;

var _emscripten_glHint = _glHint;

/** @suppress {duplicate } */
var _glInvalidateFramebuffer = (target, numAttachments, attachments) => {
  var list = tempFixedLengthArray[numAttachments];
  for (var i = 0; i < numAttachments; i++) {
    list[i] = HEAP32[(((attachments) + (i * 4)) >> 2)];
  }

  GLctx.invalidateFramebuffer(target, list);
};
var _emscripten_glInvalidateFramebuffer = _glInvalidateFramebuffer;

/** @suppress {duplicate } */
var _glInvalidateSubFramebuffer = (target, numAttachments, attachments, x, y, width, height) => {
  var list = tempFixedLengthArray[numAttachments];
  for (var i = 0; i < numAttachments; i++) {
    list[i] = HEAP32[(((attachments) + (i * 4)) >> 2)];
  }

  GLctx.invalidateSubFramebuffer(target, list, x, y, width, height);
};
var _emscripten_glInvalidateSubFramebuffer = _glInvalidateSubFramebuffer;

/** @suppress {duplicate } */
var _glIsBuffer = (buffer) => {
  var b = GL.buffers[buffer];
  if (!b) return 0;
  return GLctx.isBuffer(b);
};
var _emscripten_glIsBuffer = _glIsBuffer;

var _emscripten_glIsEnabled = _glIsEnabled;

/** @suppress {duplicate } */
var _glIsFramebuffer = (framebuffer) => {
  var fb = GL.framebuffers[framebuffer];
  if (!fb) return 0;
  return GLctx.isFramebuffer(fb);
};
var _emscripten_glIsFramebuffer = _glIsFramebuffer;

/** @suppress {duplicate } */
var _glIsProgram = (program) => {
  program = GL.programs[program];
  if (!program) return 0;
  return GLctx.isProgram(program);
};
var _emscripten_glIsProgram = _glIsProgram;

/** @suppress {duplicate } */
var _glIsQuery = (id) => {
  var query = GL.queries[id];
  if (!query) return 0;
  return GLctx.isQuery(query);
};
var _emscripten_glIsQuery = _glIsQuery;

/** @suppress {duplicate } */
var _glIsQueryEXT = (id) => {
  var query = GL.queries[id];
  if (!query) return 0;
  return GLctx.disjointTimerQueryExt['isQueryEXT'](query);
};
var _emscripten_glIsQueryEXT = _glIsQueryEXT;

/** @suppress {duplicate } */
var _glIsRenderbuffer = (renderbuffer) => {
  var rb = GL.renderbuffers[renderbuffer];
  if (!rb) return 0;
  return GLctx.isRenderbuffer(rb);
};
var _emscripten_glIsRenderbuffer = _glIsRenderbuffer;

/** @suppress {duplicate } */
var _glIsSampler = (id) => {
  var sampler = GL.samplers[id];
  if (!sampler) return 0;
  return GLctx.isSampler(sampler);
};
var _emscripten_glIsSampler = _glIsSampler;

/** @suppress {duplicate } */
var _glIsShader = (shader) => {
  var s = GL.shaders[shader];
  if (!s) return 0;
  return GLctx.isShader(s);
};
var _emscripten_glIsShader = _glIsShader;

/** @suppress {duplicate } */
var _glIsSync = (sync) => GLctx.isSync(GL.syncs[sync]);
var _emscripten_glIsSync = _glIsSync;

/** @suppress {duplicate } */
var _glIsTexture = (id) => {
  var texture = GL.textures[id];
  if (!texture) return 0;
  return GLctx.isTexture(texture);
};
var _emscripten_glIsTexture = _glIsTexture;

/** @suppress {duplicate } */
var _glIsTransformFeedback = (id) => GLctx.isTransformFeedback(GL.transformFeedbacks[id]);
var _emscripten_glIsTransformFeedback = _glIsTransformFeedback;

var emulGlIsVertexArray = (array) => {
  var vao = GLEmulation.vaos[array];
  if (!vao) return 0;
  return 1;
};

/** @suppress {duplicate } */
var _glIsVertexArray = (array) => {
  return emulGlIsVertexArray(array);
};
var _emscripten_glIsVertexArray = _glIsVertexArray;


/** @suppress {duplicate } */
var _glIsVertexArrayOES = _glIsVertexArray;
var _emscripten_glIsVertexArrayOES = _glIsVertexArrayOES;

/** @suppress {duplicate } */
var _glLightModelf = (pname, param) => {
  if (pname == 0x0B52) { // GL_LIGHT_MODEL_TWO_SIDE
    GLEmulation.lightModelTwoSide = (param != 0) ? true : false;
  } else {
    throw 'glLightModelf: TODO: ' + pname;
  }
};
var _emscripten_glLightModelf = _glLightModelf;

/** @suppress {duplicate } */
var _glLightModelfv = (pname, param) => { // TODO: GL_LIGHT_MODEL_LOCAL_VIEWER
  if (pname == 0x0B53) { // GL_LIGHT_MODEL_AMBIENT
    GLEmulation.lightModelAmbient[0] = HEAPF32[((param) >> 2)];
    GLEmulation.lightModelAmbient[1] = HEAPF32[(((param) + (4)) >> 2)];
    GLEmulation.lightModelAmbient[2] = HEAPF32[(((param) + (8)) >> 2)];
    GLEmulation.lightModelAmbient[3] = HEAPF32[(((param) + (12)) >> 2)];
  } else {
    throw 'glLightModelfv: TODO: ' + pname;
  }
};
var _emscripten_glLightModelfv = _glLightModelfv;

/** @suppress {duplicate } */
var _glLightfv = (light, pname, param) => {
  if ((light >= 0x4000) && (light < 0x4008)  /* GL_LIGHT0 to GL_LIGHT7 */) {
    var lightId = light - 0x4000;

    if (pname == 0x1200) { // GL_AMBIENT
      GLEmulation.lightAmbient[lightId][0] = HEAPF32[((param) >> 2)];
      GLEmulation.lightAmbient[lightId][1] = HEAPF32[(((param) + (4)) >> 2)];
      GLEmulation.lightAmbient[lightId][2] = HEAPF32[(((param) + (8)) >> 2)];
      GLEmulation.lightAmbient[lightId][3] = HEAPF32[(((param) + (12)) >> 2)];
    } else if (pname == 0x1201) { // GL_DIFFUSE
      GLEmulation.lightDiffuse[lightId][0] = HEAPF32[((param) >> 2)];
      GLEmulation.lightDiffuse[lightId][1] = HEAPF32[(((param) + (4)) >> 2)];
      GLEmulation.lightDiffuse[lightId][2] = HEAPF32[(((param) + (8)) >> 2)];
      GLEmulation.lightDiffuse[lightId][3] = HEAPF32[(((param) + (12)) >> 2)];
    } else if (pname == 0x1202) { // GL_SPECULAR
      GLEmulation.lightSpecular[lightId][0] = HEAPF32[((param) >> 2)];
      GLEmulation.lightSpecular[lightId][1] = HEAPF32[(((param) + (4)) >> 2)];
      GLEmulation.lightSpecular[lightId][2] = HEAPF32[(((param) + (8)) >> 2)];
      GLEmulation.lightSpecular[lightId][3] = HEAPF32[(((param) + (12)) >> 2)];
    } else if (pname == 0x1203) { // GL_POSITION
      GLEmulation.lightPosition[lightId][0] = HEAPF32[((param) >> 2)];
      GLEmulation.lightPosition[lightId][1] = HEAPF32[(((param) + (4)) >> 2)];
      GLEmulation.lightPosition[lightId][2] = HEAPF32[(((param) + (8)) >> 2)];
      GLEmulation.lightPosition[lightId][3] = HEAPF32[(((param) + (12)) >> 2)];

      // multiply position with current modelviewmatrix
      GLImmediate.matrixLib.mat4.multiplyVec4(GLImmediate.matrix[0], GLEmulation.lightPosition[lightId]);
    } else {
      throw 'glLightfv: TODO: ' + pname;
    }
  }
};
var _emscripten_glLightfv = _glLightfv;

/** @suppress {duplicate } */
function _glLineWidth(x0) { GLctx.lineWidth(x0) }
var _emscripten_glLineWidth = _glLineWidth;

var _emscripten_glLinkProgram = _glLinkProgram;


/** @suppress {duplicate } */
var _glLoadIdentity = () => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1) | 0;
  GLImmediate.matrixLib.mat4.identity(GLImmediate.matrix[GLImmediate.currentMatrix]);
};
var _emscripten_glLoadIdentity = _glLoadIdentity;

/** @suppress {duplicate } */
var _glLoadMatrixd = (matrix) => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1) | 0;
  GLImmediate.matrixLib.mat4.set(HEAPF64.subarray((matrix) >> 3, (matrix + 128) >> 3), GLImmediate.matrix[GLImmediate.currentMatrix]);
};
var _emscripten_glLoadMatrixd = _glLoadMatrixd;

/** @suppress {duplicate } */
var _glLoadMatrixf = (matrix) => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1) | 0;
  GLImmediate.matrixLib.mat4.set(HEAPF32.subarray((matrix) >> 2, (matrix + 64) >> 2), GLImmediate.matrix[GLImmediate.currentMatrix]);
};
var _emscripten_glLoadMatrixf = _glLoadMatrixf;

/** @suppress {duplicate } */
var _glLoadTransposeMatrixd = (matrix) => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1) | 0;
  GLImmediate.matrixLib.mat4.set(HEAPF64.subarray((matrix) >> 3, (matrix + 128) >> 3), GLImmediate.matrix[GLImmediate.currentMatrix]);
  GLImmediate.matrixLib.mat4.transpose(GLImmediate.matrix[GLImmediate.currentMatrix]);
};
var _emscripten_glLoadTransposeMatrixd = _glLoadTransposeMatrixd;

/** @suppress {duplicate } */
var _glLoadTransposeMatrixf = (matrix) => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1) | 0;
  GLImmediate.matrixLib.mat4.set(HEAPF32.subarray((matrix) >> 2, (matrix + 64) >> 2), GLImmediate.matrix[GLImmediate.currentMatrix]);
  GLImmediate.matrixLib.mat4.transpose(GLImmediate.matrix[GLImmediate.currentMatrix]);
};
var _emscripten_glLoadTransposeMatrixf = _glLoadTransposeMatrixf;

/** @suppress {duplicate } */
var _glMaterialfv = (face, pname, param) => {
  if ((face != 0x0404) && (face != 0x0408)) { throw 'glMaterialfv: TODO' + face; } // only GL_FRONT and GL_FRONT_AND_BACK supported

  if (pname == 0x1200) { // GL_AMBIENT
    GLEmulation.materialAmbient[0] = HEAPF32[((param) >> 2)];
    GLEmulation.materialAmbient[1] = HEAPF32[(((param) + (4)) >> 2)];
    GLEmulation.materialAmbient[2] = HEAPF32[(((param) + (8)) >> 2)];
    GLEmulation.materialAmbient[3] = HEAPF32[(((param) + (12)) >> 2)];
  } else if (pname == 0x1201) { // GL_DIFFUSE
    GLEmulation.materialDiffuse[0] = HEAPF32[((param) >> 2)];
    GLEmulation.materialDiffuse[1] = HEAPF32[(((param) + (4)) >> 2)];
    GLEmulation.materialDiffuse[2] = HEAPF32[(((param) + (8)) >> 2)];
    GLEmulation.materialDiffuse[3] = HEAPF32[(((param) + (12)) >> 2)];
  } else if (pname == 0x1202) { // GL_SPECULAR
    GLEmulation.materialSpecular[0] = HEAPF32[((param) >> 2)];
    GLEmulation.materialSpecular[1] = HEAPF32[(((param) + (4)) >> 2)];
    GLEmulation.materialSpecular[2] = HEAPF32[(((param) + (8)) >> 2)];
    GLEmulation.materialSpecular[3] = HEAPF32[(((param) + (12)) >> 2)];
  } else if (pname == 0x1601) { // GL_SHININESS
    GLEmulation.materialShininess[0] = HEAPF32[((param) >> 2)];
  } else {
    throw 'glMaterialfv: TODO: ' + pname;
  }
};
var _emscripten_glMaterialfv = _glMaterialfv;



/** @suppress {duplicate } */
var _glMatrixMode = (mode) => {
  if (mode == 0x1700 /* GL_MODELVIEW */) {
    GLImmediate.currentMatrix = 0/*m*/;
  } else if (mode == 0x1701 /* GL_PROJECTION */) {
    GLImmediate.currentMatrix = 1/*p*/;
  } else if (mode == 0x1702) { // GL_TEXTURE
    GLImmediate.useTextureMatrix = true;
    GLImmediate.currentMatrix = 2/*t*/ + GLImmediate.TexEnvJIT.getActiveTexture();
  } else {
    throw "Wrong mode " + mode + " passed to glMatrixMode";
  }
};
var _emscripten_glMatrixMode = _glMatrixMode;

/** @suppress {duplicate } */
var _glMultMatrixd = (matrix) => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1) | 0;
  GLImmediate.matrixLib.mat4.multiply(GLImmediate.matrix[GLImmediate.currentMatrix],
    HEAPF64.subarray((matrix) >> 3, (matrix + 128) >> 3));
};
var _emscripten_glMultMatrixd = _glMultMatrixd;

/** @suppress {duplicate } */
var _glMultMatrixf = (matrix) => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1) | 0;
  GLImmediate.matrixLib.mat4.multiply(GLImmediate.matrix[GLImmediate.currentMatrix],
    HEAPF32.subarray((matrix) >> 2, (matrix + 64) >> 2));
};
var _emscripten_glMultMatrixf = _glMultMatrixf;

/** @suppress {duplicate } */
var _glMultTransposeMatrixd = (matrix) => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1) | 0;
  var colMajor = GLImmediate.matrixLib.mat4.create();
  GLImmediate.matrixLib.mat4.set(HEAPF64.subarray((matrix) >> 3, (matrix + 128) >> 3), colMajor);
  GLImmediate.matrixLib.mat4.transpose(colMajor);
  GLImmediate.matrixLib.mat4.multiply(GLImmediate.matrix[GLImmediate.currentMatrix], colMajor);
};
var _emscripten_glMultTransposeMatrixd = _glMultTransposeMatrixd;

/** @suppress {duplicate } */
var _glMultTransposeMatrixf = (matrix) => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1) | 0;
  var colMajor = GLImmediate.matrixLib.mat4.create();
  GLImmediate.matrixLib.mat4.set(HEAPF32.subarray((matrix) >> 2, (matrix + 64) >> 2), colMajor);
  GLImmediate.matrixLib.mat4.transpose(colMajor);
  GLImmediate.matrixLib.mat4.multiply(GLImmediate.matrix[GLImmediate.currentMatrix], colMajor);
};
var _emscripten_glMultTransposeMatrixf = _glMultTransposeMatrixf;

/** @suppress {duplicate } */
var _glNormal3f = (x, y, z) => {
  assert(GLImmediate.mode >= 0); // must be in begin/end
  GLImmediate.vertexData[GLImmediate.vertexCounter++] = x;
  GLImmediate.vertexData[GLImmediate.vertexCounter++] = y;
  GLImmediate.vertexData[GLImmediate.vertexCounter++] = z;
  assert(GLImmediate.vertexCounter << 2 < GL.MAX_TEMP_BUFFER_SIZE);
  GLImmediate.addRendererComponent(GLImmediate.NORMAL, 3, GLctx.FLOAT);
};
var _emscripten_glNormal3f = _glNormal3f;

/** @suppress {duplicate } */
var _glNormalPointer = (type, stride, pointer) => {
  GLImmediate.setClientAttribute(GLImmediate.NORMAL, 3, type, stride, pointer);
};
var _emscripten_glNormalPointer = _glNormalPointer;

/** @suppress {duplicate } */
var _glOrtho = (left, right, bottom, top_, nearVal, farVal) => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1) | 0;
  GLImmediate.matrixLib.mat4.multiply(GLImmediate.matrix[GLImmediate.currentMatrix],
    GLImmediate.matrixLib.mat4.ortho(left, right, bottom, top_, nearVal, farVal));
};
var _emscripten_glOrtho = _glOrtho;

/** @suppress {duplicate } */
function _glPauseTransformFeedback() { GLctx.pauseTransformFeedback() }
var _emscripten_glPauseTransformFeedback = _glPauseTransformFeedback;

/** @suppress {duplicate } */
var _glPixelStorei = (pname, param) => {
  if (pname == 0xCF5 /* GL_UNPACK_ALIGNMENT */) {
    GL.unpackAlignment = param;
  }
  GLctx.pixelStorei(pname, param);
};
var _emscripten_glPixelStorei = _glPixelStorei;

/** @suppress {duplicate } */
var _glPolygonMode = () => { };
var _emscripten_glPolygonMode = _glPolygonMode;

/** @suppress {duplicate } */
function _glPolygonOffset(x0, x1) { GLctx.polygonOffset(x0, x1) }
var _emscripten_glPolygonOffset = _glPolygonOffset;

/** @suppress {duplicate } */
var _glPopMatrix = () => {
  if (GLImmediate.matrixStack[GLImmediate.currentMatrix].length == 0) {
    GL.recordError(0x504/*GL_STACK_UNDERFLOW*/);
    return;
  }
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1) | 0;
  GLImmediate.matrix[GLImmediate.currentMatrix] = GLImmediate.matrixStack[GLImmediate.currentMatrix].pop();
};
var _emscripten_glPopMatrix = _glPopMatrix;

/** @suppress {duplicate } */
var _glProgramBinary = (program, binaryFormat, binary, length) => {
  GL.recordError(0x500/*GL_INVALID_ENUM*/);
};
var _emscripten_glProgramBinary = _glProgramBinary;

/** @suppress {duplicate } */
var _glProgramParameteri = (program, pname, value) => {
  GL.recordError(0x500/*GL_INVALID_ENUM*/);
};
var _emscripten_glProgramParameteri = _glProgramParameteri;

/** @suppress {duplicate } */
var _glPushMatrix = () => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1) | 0;
  GLImmediate.matrixStack[GLImmediate.currentMatrix].push(
    Array.prototype.slice.call(GLImmediate.matrix[GLImmediate.currentMatrix]));
};
var _emscripten_glPushMatrix = _glPushMatrix;

/** @suppress {duplicate } */
var _glQueryCounterEXT = (id, target) => {
  GLctx.disjointTimerQueryExt['queryCounterEXT'](GL.queries[id], target);
};
var _emscripten_glQueryCounterEXT = _glQueryCounterEXT;

/** @suppress {duplicate } */
function _glReadBuffer(x0) { GLctx.readBuffer(x0) }
var _emscripten_glReadBuffer = _glReadBuffer;

var computeUnpackAlignedImageSize = (width, height, sizePerPixel, alignment) => {
  function roundedToNextMultipleOf(x, y) {
    return (x + y - 1) & -y;
  }
  var plainRowSize = width * sizePerPixel;
  var alignedRowSize = roundedToNextMultipleOf(plainRowSize, alignment);
  return height * alignedRowSize;
};

var colorChannelsInGlTextureFormat = (format) => {
  // Micro-optimizations for size: map format to size by subtracting smallest
  // enum value (0x1902) from all values first.  Also omit the most common
  // size value (1) from the list, which is assumed by formats not on the
  // list.
  var colorChannels = {
    // 0x1902 /* GL_DEPTH_COMPONENT */ - 0x1902: 1,
    // 0x1906 /* GL_ALPHA */ - 0x1902: 1,
    5: 3,
    6: 4,
    // 0x1909 /* GL_LUMINANCE */ - 0x1902: 1,
    8: 2,
    29502: 3,
    29504: 4,
    // 0x1903 /* GL_RED */ - 0x1902: 1,
    26917: 2,
    26918: 2,
    // 0x8D94 /* GL_RED_INTEGER */ - 0x1902: 1,
    29846: 3,
    29847: 4
  };
  return colorChannels[format - 0x1902] || 1;
};

var heapObjectForWebGLType = (type) => {
  // Micro-optimization for size: Subtract lowest GL enum number (0x1400/* GL_BYTE */) from type to compare
  // smaller values for the heap, for shorter generated code size.
  // Also the type HEAPU16 is not tested for explicitly, but any unrecognized type will return out HEAPU16.
  // (since most types are HEAPU16)
  type -= 0x1400;
  if (type == 0) return HEAP8;

  if (type == 1) return HEAPU8;

  if (type == 2) return HEAP16;

  if (type == 4) return HEAP32;

  if (type == 6) return HEAPF32;

  if (type == 5
    || type == 28922
    || type == 28520
    || type == 30779
    || type == 30782
  )
    return HEAPU32;

  return HEAPU16;
};

var heapAccessShiftForWebGLHeap = (heap) => 31 - Math.clz32(heap.BYTES_PER_ELEMENT);

var emscriptenWebGLGetTexPixelData = (type, format, width, height, pixels, internalFormat) => {
  var heap = heapObjectForWebGLType(type);
  var shift = heapAccessShiftForWebGLHeap(heap);
  var byteSize = 1 << shift;
  var sizePerPixel = colorChannelsInGlTextureFormat(format) * byteSize;
  var bytes = computeUnpackAlignedImageSize(width, height, sizePerPixel, GL.unpackAlignment);
  return heap.subarray(pixels >> shift, pixels + bytes >> shift);
};



/** @suppress {duplicate } */
var _glReadPixels = (x, y, width, height, format, type, pixels) => {
  if (GL.currentContext.version >= 2) {
    // WebGL 2 provides new garbage-free entry points to call to WebGL. Use
    // those always when possible.
    if (GLctx.currentPixelPackBufferBinding) {
      GLctx.readPixels(x, y, width, height, format, type, pixels);
    } else {
      var heap = heapObjectForWebGLType(type);
      GLctx.readPixels(x, y, width, height, format, type, heap, pixels >> heapAccessShiftForWebGLHeap(heap));
    }
    return;
  }
  var pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, format);
  if (!pixelData) {
    GL.recordError(0x500/*GL_INVALID_ENUM*/);
    return;
  }
  GLctx.readPixels(x, y, width, height, format, type, pixelData);
};
var _emscripten_glReadPixels = _glReadPixels;

/** @suppress {duplicate } */
var _glReleaseShaderCompiler = () => {
  // NOP (as allowed by GLES 2.0 spec)
};
var _emscripten_glReleaseShaderCompiler = _glReleaseShaderCompiler;

/** @suppress {duplicate } */
function _glRenderbufferStorage(x0, x1, x2, x3) { GLctx.renderbufferStorage(x0, x1, x2, x3) }
var _emscripten_glRenderbufferStorage = _glRenderbufferStorage;

/** @suppress {duplicate } */
function _glRenderbufferStorageMultisample(x0, x1, x2, x3, x4) { GLctx.renderbufferStorageMultisample(x0, x1, x2, x3, x4) }
var _emscripten_glRenderbufferStorageMultisample = _glRenderbufferStorageMultisample;

/** @suppress {duplicate } */
function _glResumeTransformFeedback() { GLctx.resumeTransformFeedback() }
var _emscripten_glResumeTransformFeedback = _glResumeTransformFeedback;

/** @suppress {duplicate } */
var _glRotated = (angle, x, y, z) => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1) | 0;
  GLImmediate.matrixLib.mat4.rotate(GLImmediate.matrix[GLImmediate.currentMatrix], angle * Math.PI / 180, [x, y, z]);
};
var _emscripten_glRotated = _glRotated;

/** @suppress {duplicate } */
var _glRotatef = _glRotated;
var _emscripten_glRotatef = _glRotatef;

/** @suppress {duplicate } */
var _glSampleCoverage = (value, invert) => {
  GLctx.sampleCoverage(value, !!invert);
};
var _emscripten_glSampleCoverage = _glSampleCoverage;

/** @suppress {duplicate } */
var _glSamplerParameterf = (sampler, pname, param) => {
  GLctx.samplerParameterf(GL.samplers[sampler], pname, param);
};
var _emscripten_glSamplerParameterf = _glSamplerParameterf;

/** @suppress {duplicate } */
var _glSamplerParameterfv = (sampler, pname, params) => {
  var param = HEAPF32[((params) >> 2)];
  GLctx.samplerParameterf(GL.samplers[sampler], pname, param);
};
var _emscripten_glSamplerParameterfv = _glSamplerParameterfv;

/** @suppress {duplicate } */
var _glSamplerParameteri = (sampler, pname, param) => {
  GLctx.samplerParameteri(GL.samplers[sampler], pname, param);
};
var _emscripten_glSamplerParameteri = _glSamplerParameteri;

/** @suppress {duplicate } */
var _glSamplerParameteriv = (sampler, pname, params) => {
  var param = HEAP32[((params) >> 2)];
  GLctx.samplerParameteri(GL.samplers[sampler], pname, param);
};
var _emscripten_glSamplerParameteriv = _glSamplerParameteriv;

/** @suppress {duplicate } */
var _glScaled = (x, y, z) => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1) | 0;
  GLImmediate.matrixLib.mat4.scale(GLImmediate.matrix[GLImmediate.currentMatrix], [x, y, z]);
};
var _emscripten_glScaled = _glScaled;

/** @suppress {duplicate } */
var _glScalef = _glScaled;
var _emscripten_glScalef = _glScalef;

/** @suppress {duplicate } */
function _glScissor(x0, x1, x2, x3) { GLctx.scissor(x0, x1, x2, x3) }
var _emscripten_glScissor = _glScissor;

/** @suppress {duplicate } */
var _glShadeModel = () => warnOnce('TODO: glShadeModel');
var _emscripten_glShadeModel = _glShadeModel;

/** @suppress {duplicate } */
var _glShaderBinary = (count, shaders, binaryformat, binary, length) => {
  GL.recordError(0x500/*GL_INVALID_ENUM*/);
};
var _emscripten_glShaderBinary = _glShaderBinary;

var _emscripten_glShaderSource = _glShaderSource;

/** @suppress {duplicate } */
function _glStencilFunc(x0, x1, x2) { GLctx.stencilFunc(x0, x1, x2) }
var _emscripten_glStencilFunc = _glStencilFunc;

/** @suppress {duplicate } */
function _glStencilFuncSeparate(x0, x1, x2, x3) { GLctx.stencilFuncSeparate(x0, x1, x2, x3) }
var _emscripten_glStencilFuncSeparate = _glStencilFuncSeparate;

/** @suppress {duplicate } */
function _glStencilMask(x0) { GLctx.stencilMask(x0) }
var _emscripten_glStencilMask = _glStencilMask;

/** @suppress {duplicate } */
function _glStencilMaskSeparate(x0, x1) { GLctx.stencilMaskSeparate(x0, x1) }
var _emscripten_glStencilMaskSeparate = _glStencilMaskSeparate;

/** @suppress {duplicate } */
function _glStencilOp(x0, x1, x2) { GLctx.stencilOp(x0, x1, x2) }
var _emscripten_glStencilOp = _glStencilOp;

/** @suppress {duplicate } */
function _glStencilOpSeparate(x0, x1, x2, x3) { GLctx.stencilOpSeparate(x0, x1, x2, x3) }
var _emscripten_glStencilOpSeparate = _glStencilOpSeparate;

/** @suppress {duplicate } */
var _glTexCoord2i = (u, v) => {
  assert(GLImmediate.mode >= 0); // must be in begin/end
  GLImmediate.vertexData[GLImmediate.vertexCounter++] = u;
  GLImmediate.vertexData[GLImmediate.vertexCounter++] = v;
  GLImmediate.addRendererComponent(GLImmediate.TEXTURE0, 2, GLctx.FLOAT);
};
/** @suppress {duplicate } */
var _glTexCoord2f = _glTexCoord2i;
var _emscripten_glTexCoord2f = _glTexCoord2f;

/** @suppress {duplicate } */
var _glTexCoord2fv = (v) => {
  _glTexCoord2i(HEAPF32[((v) >> 2)], HEAPF32[(((v) + (4)) >> 2)]);
};
var _emscripten_glTexCoord2fv = _glTexCoord2fv;

var _emscripten_glTexCoord2i = _glTexCoord2i;

/** @suppress {duplicate } */
var _glTexCoord3f = (target, level, internalformat, width, border, format, type, data) => { throw 'glTexCoord3f: TODO' };
var _emscripten_glTexCoord3f = _glTexCoord3f;

/** @suppress {duplicate } */
var _glTexCoord4f = () => { throw 'glTexCoord4f: TODO' };
var _emscripten_glTexCoord4f = _glTexCoord4f;

/** @suppress {duplicate } */
var _glTexCoordPointer = (size, type, stride, pointer) => {
  GLImmediate.setClientAttribute(GLImmediate.TEXTURE0 + GLImmediate.clientActiveTexture, size, type, stride, pointer);
};
var _emscripten_glTexCoordPointer = _glTexCoordPointer;

/** @suppress {duplicate } */
var _glTexGenfv = (coord, pname, param) => { throw 'glTexGenfv: TODO' };
var _emscripten_glTexGenfv = _glTexGenfv;

/** @suppress {duplicate } */
var _glTexGeni = (coord, pname, param) => { throw 'glTexGeni: TODO' };
var _emscripten_glTexGeni = _glTexGeni;

/** @suppress {duplicate } */
var _glTexImage1D = (target, level, internalformat, width, border, format, type, data) => { throw 'glTexImage1D: TODO' };
var _emscripten_glTexImage1D = _glTexImage1D;




/** @suppress {duplicate } */
var _glTexImage2D = (target, level, internalFormat, width, height, border, format, type, pixels) => {
  if (GL.currentContext.version >= 2) {
    // WebGL 2 provides new garbage-free entry points to call to WebGL. Use
    // those always when possible.
    if (GLctx.currentPixelUnpackBufferBinding) {
      GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels);
    } else if (pixels) {
      var heap = heapObjectForWebGLType(type);
      GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, heap, pixels >> heapAccessShiftForWebGLHeap(heap));
    } else {
      GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, null);
    }
    return;
  }
  GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels ? emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) : null);
};
var _emscripten_glTexImage2D = _glTexImage2D;


/** @suppress {duplicate } */
var _glTexImage3D = (target, level, internalFormat, width, height, depth, border, format, type, pixels) => {
  if (GLctx.currentPixelUnpackBufferBinding) {
    GLctx.texImage3D(target, level, internalFormat, width, height, depth, border, format, type, pixels);
  } else if (pixels) {
    var heap = heapObjectForWebGLType(type);
    GLctx.texImage3D(target, level, internalFormat, width, height, depth, border, format, type, heap, pixels >> heapAccessShiftForWebGLHeap(heap));
  } else {
    GLctx.texImage3D(target, level, internalFormat, width, height, depth, border, format, type, null);
  }
};
var _emscripten_glTexImage3D = _glTexImage3D;

/** @suppress {duplicate } */
function _glTexParameterf(x0, x1, x2) { GLctx.texParameterf(x0, x1, x2) }
var _emscripten_glTexParameterf = _glTexParameterf;

/** @suppress {duplicate } */
var _glTexParameterfv = (target, pname, params) => {
  var param = HEAPF32[((params) >> 2)];
  GLctx.texParameterf(target, pname, param);
};
var _emscripten_glTexParameterfv = _glTexParameterfv;

/** @suppress {duplicate } */
function _glTexParameteri(x0, x1, x2) { GLctx.texParameteri(x0, x1, x2) }
var _emscripten_glTexParameteri = _glTexParameteri;

/** @suppress {duplicate } */
var _glTexParameteriv = (target, pname, params) => {
  var param = HEAP32[((params) >> 2)];
  GLctx.texParameteri(target, pname, param);
};
var _emscripten_glTexParameteriv = _glTexParameteriv;

/** @suppress {duplicate } */
function _glTexStorage2D(x0, x1, x2, x3, x4) { GLctx.texStorage2D(x0, x1, x2, x3, x4) }
var _emscripten_glTexStorage2D = _glTexStorage2D;

/** @suppress {duplicate } */
function _glTexStorage3D(x0, x1, x2, x3, x4, x5) { GLctx.texStorage3D(x0, x1, x2, x3, x4, x5) }
var _emscripten_glTexStorage3D = _glTexStorage3D;




/** @suppress {duplicate } */
var _glTexSubImage2D = (target, level, xoffset, yoffset, width, height, format, type, pixels) => {
  if (GL.currentContext.version >= 2) {
    // WebGL 2 provides new garbage-free entry points to call to WebGL. Use
    // those always when possible.
    if (GLctx.currentPixelUnpackBufferBinding) {
      GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels);
    } else if (pixels) {
      var heap = heapObjectForWebGLType(type);
      GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, heap, pixels >> heapAccessShiftForWebGLHeap(heap));
    } else {
      GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, null);
    }
    return;
  }
  var pixelData = null;
  if (pixels) pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, 0);
  GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixelData);
};
var _emscripten_glTexSubImage2D = _glTexSubImage2D;


/** @suppress {duplicate } */
var _glTexSubImage3D = (target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, pixels) => {
  if (GLctx.currentPixelUnpackBufferBinding) {
    GLctx.texSubImage3D(target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, pixels);
  } else if (pixels) {
    var heap = heapObjectForWebGLType(type);
    GLctx.texSubImage3D(target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, heap, pixels >> heapAccessShiftForWebGLHeap(heap));
  } else {
    GLctx.texSubImage3D(target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, null);
  }
};
var _emscripten_glTexSubImage3D = _glTexSubImage3D;

/** @suppress {duplicate } */
var _glTransformFeedbackVaryings = (program, count, varyings, bufferMode) => {
  program = GL.programs[program];
  var vars = [];
  for (var i = 0; i < count; i++)
    vars.push(UTF8ToString(HEAP32[(((varyings) + (i * 4)) >> 2)]));

  GLctx.transformFeedbackVaryings(program, vars, bufferMode);
};
var _emscripten_glTransformFeedbackVaryings = _glTransformFeedbackVaryings;

/** @suppress {duplicate } */
var _glTranslated = (x, y, z) => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1) | 0;
  GLImmediate.matrixLib.mat4.translate(GLImmediate.matrix[GLImmediate.currentMatrix], [x, y, z]);
};
var _emscripten_glTranslated = _glTranslated;

/** @suppress {duplicate } */
var _glTranslatef = _glTranslated;
var _emscripten_glTranslatef = _glTranslatef;


/** @suppress {duplicate } */
var _glUniform1f = (location, v0) => {
  GLctx.uniform1f(webglGetUniformLocation(location), v0);
};
var _emscripten_glUniform1f = _glUniform1f;


var miniTempWebGLFloatBuffers = [];

/** @suppress {duplicate } */
var _glUniform1fv = (location, count, value) => {

  if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
    count && GLctx.uniform1fv(webglGetUniformLocation(location), HEAPF32, value >> 2, count);
    return;
  }

  if (count <= 288) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLFloatBuffers[count - 1];
    for (var i = 0; i < count; ++i) {
      view[i] = HEAPF32[(((value) + (4 * i)) >> 2)];
    }
  } else {
    var view = HEAPF32.subarray((value) >> 2, (value + count * 4) >> 2);
  }
  GLctx.uniform1fv(webglGetUniformLocation(location), view);
};
var _emscripten_glUniform1fv = _glUniform1fv;


/** @suppress {duplicate } */
var _glUniform1i = (location, v0) => {
  GLctx.uniform1i(webglGetUniformLocation(location), v0);
};
var _emscripten_glUniform1i = _glUniform1i;


var miniTempWebGLIntBuffers = [];

/** @suppress {duplicate } */
var _glUniform1iv = (location, count, value) => {

  if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
    count && GLctx.uniform1iv(webglGetUniformLocation(location), HEAP32, value >> 2, count);
    return;
  }

  if (count <= 288) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLIntBuffers[count - 1];
    for (var i = 0; i < count; ++i) {
      view[i] = HEAP32[(((value) + (4 * i)) >> 2)];
    }
  } else {
    var view = HEAP32.subarray((value) >> 2, (value + count * 4) >> 2);
  }
  GLctx.uniform1iv(webglGetUniformLocation(location), view);
};
var _emscripten_glUniform1iv = _glUniform1iv;

/** @suppress {duplicate } */
var _glUniform1ui = (location, v0) => {
  GLctx.uniform1ui(webglGetUniformLocation(location), v0);
};
var _emscripten_glUniform1ui = _glUniform1ui;

/** @suppress {duplicate } */
var _glUniform1uiv = (location, count, value) => {
  count && GLctx.uniform1uiv(webglGetUniformLocation(location), HEAPU32, value >> 2, count);
};
var _emscripten_glUniform1uiv = _glUniform1uiv;


/** @suppress {duplicate } */
var _glUniform2f = (location, v0, v1) => {
  GLctx.uniform2f(webglGetUniformLocation(location), v0, v1);
};
var _emscripten_glUniform2f = _glUniform2f;



/** @suppress {duplicate } */
var _glUniform2fv = (location, count, value) => {

  // WebGL 2 provides new garbage-free entry points to call to WebGL. Use
  // those always when possible.
  if (GL.currentContext.version >= 2) {
    count && GLctx.uniform2fv(webglGetUniformLocation(location), HEAPF32, value >> 2, count * 2);
    return;
  }

  if (count <= 144) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLFloatBuffers[2 * count - 1];
    for (var i = 0; i < 2 * count; i += 2) {
      view[i] = HEAPF32[(((value) + (4 * i)) >> 2)];
      view[i + 1] = HEAPF32[(((value) + (4 * i + 4)) >> 2)];
    }
  } else {
    var view = HEAPF32.subarray((value) >> 2, (value + count * 8) >> 2);
  }
  GLctx.uniform2fv(webglGetUniformLocation(location), view);
};
var _emscripten_glUniform2fv = _glUniform2fv;


/** @suppress {duplicate } */
var _glUniform2i = (location, v0, v1) => {
  GLctx.uniform2i(webglGetUniformLocation(location), v0, v1);
};
var _emscripten_glUniform2i = _glUniform2i;



/** @suppress {duplicate } */
var _glUniform2iv = (location, count, value) => {

  if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
    count && GLctx.uniform2iv(webglGetUniformLocation(location), HEAP32, value >> 2, count * 2);
    return;
  }

  if (count <= 144) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLIntBuffers[2 * count - 1];
    for (var i = 0; i < 2 * count; i += 2) {
      view[i] = HEAP32[(((value) + (4 * i)) >> 2)];
      view[i + 1] = HEAP32[(((value) + (4 * i + 4)) >> 2)];
    }
  } else {
    var view = HEAP32.subarray((value) >> 2, (value + count * 8) >> 2);
  }
  GLctx.uniform2iv(webglGetUniformLocation(location), view);
};
var _emscripten_glUniform2iv = _glUniform2iv;

/** @suppress {duplicate } */
var _glUniform2ui = (location, v0, v1) => {
  GLctx.uniform2ui(webglGetUniformLocation(location), v0, v1);
};
var _emscripten_glUniform2ui = _glUniform2ui;

/** @suppress {duplicate } */
var _glUniform2uiv = (location, count, value) => {
  count && GLctx.uniform2uiv(webglGetUniformLocation(location), HEAPU32, value >> 2, count * 2);
};
var _emscripten_glUniform2uiv = _glUniform2uiv;


/** @suppress {duplicate } */
var _glUniform3f = (location, v0, v1, v2) => {
  GLctx.uniform3f(webglGetUniformLocation(location), v0, v1, v2);
};
var _emscripten_glUniform3f = _glUniform3f;



/** @suppress {duplicate } */
var _glUniform3fv = (location, count, value) => {

  // WebGL 2 provides new garbage-free entry points to call to WebGL. Use
  // those always when possible.
  if (GL.currentContext.version >= 2) {
    count && GLctx.uniform3fv(webglGetUniformLocation(location), HEAPF32, value >> 2, count * 3);
    return;
  }

  if (count <= 96) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLFloatBuffers[3 * count - 1];
    for (var i = 0; i < 3 * count; i += 3) {
      view[i] = HEAPF32[(((value) + (4 * i)) >> 2)];
      view[i + 1] = HEAPF32[(((value) + (4 * i + 4)) >> 2)];
      view[i + 2] = HEAPF32[(((value) + (4 * i + 8)) >> 2)];
    }
  } else {
    var view = HEAPF32.subarray((value) >> 2, (value + count * 12) >> 2);
  }
  GLctx.uniform3fv(webglGetUniformLocation(location), view);
};
var _emscripten_glUniform3fv = _glUniform3fv;


/** @suppress {duplicate } */
var _glUniform3i = (location, v0, v1, v2) => {
  GLctx.uniform3i(webglGetUniformLocation(location), v0, v1, v2);
};
var _emscripten_glUniform3i = _glUniform3i;



/** @suppress {duplicate } */
var _glUniform3iv = (location, count, value) => {

  if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
    count && GLctx.uniform3iv(webglGetUniformLocation(location), HEAP32, value >> 2, count * 3);
    return;
  }

  if (count <= 96) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLIntBuffers[3 * count - 1];
    for (var i = 0; i < 3 * count; i += 3) {
      view[i] = HEAP32[(((value) + (4 * i)) >> 2)];
      view[i + 1] = HEAP32[(((value) + (4 * i + 4)) >> 2)];
      view[i + 2] = HEAP32[(((value) + (4 * i + 8)) >> 2)];
    }
  } else {
    var view = HEAP32.subarray((value) >> 2, (value + count * 12) >> 2);
  }
  GLctx.uniform3iv(webglGetUniformLocation(location), view);
};
var _emscripten_glUniform3iv = _glUniform3iv;

/** @suppress {duplicate } */
var _glUniform3ui = (location, v0, v1, v2) => {
  GLctx.uniform3ui(webglGetUniformLocation(location), v0, v1, v2);
};
var _emscripten_glUniform3ui = _glUniform3ui;

/** @suppress {duplicate } */
var _glUniform3uiv = (location, count, value) => {
  count && GLctx.uniform3uiv(webglGetUniformLocation(location), HEAPU32, value >> 2, count * 3);
};
var _emscripten_glUniform3uiv = _glUniform3uiv;


/** @suppress {duplicate } */
var _glUniform4f = (location, v0, v1, v2, v3) => {
  GLctx.uniform4f(webglGetUniformLocation(location), v0, v1, v2, v3);
};
var _emscripten_glUniform4f = _glUniform4f;



/** @suppress {duplicate } */
var _glUniform4fv = (location, count, value) => {

  // WebGL 2 provides new garbage-free entry points to call to WebGL. Use
  // those always when possible.
  if (GL.currentContext.version >= 2) {
    count && GLctx.uniform4fv(webglGetUniformLocation(location), HEAPF32, value >> 2, count * 4);
    return;
  }

  if (count <= 72) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLFloatBuffers[4 * count - 1];
    // hoist the heap out of the loop for size and for pthreads+growth.
    var heap = HEAPF32;
    value >>= 2;
    for (var i = 0; i < 4 * count; i += 4) {
      var dst = value + i;
      view[i] = heap[dst];
      view[i + 1] = heap[dst + 1];
      view[i + 2] = heap[dst + 2];
      view[i + 3] = heap[dst + 3];
    }
  } else {
    var view = HEAPF32.subarray((value) >> 2, (value + count * 16) >> 2);
  }
  GLctx.uniform4fv(webglGetUniformLocation(location), view);
};
var _emscripten_glUniform4fv = _glUniform4fv;


/** @suppress {duplicate } */
var _glUniform4i = (location, v0, v1, v2, v3) => {
  GLctx.uniform4i(webglGetUniformLocation(location), v0, v1, v2, v3);
};
var _emscripten_glUniform4i = _glUniform4i;



/** @suppress {duplicate } */
var _glUniform4iv = (location, count, value) => {

  // WebGL 2 provides new garbage-free entry points to call to WebGL. Use
  // those always when possible.
  if (GL.currentContext.version >= 2) {
    count && GLctx.uniform4iv(webglGetUniformLocation(location), HEAP32, value >> 2, count * 4);
    return;
  }

  if (count <= 72) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLIntBuffers[4 * count - 1];
    for (var i = 0; i < 4 * count; i += 4) {
      view[i] = HEAP32[(((value) + (4 * i)) >> 2)];
      view[i + 1] = HEAP32[(((value) + (4 * i + 4)) >> 2)];
      view[i + 2] = HEAP32[(((value) + (4 * i + 8)) >> 2)];
      view[i + 3] = HEAP32[(((value) + (4 * i + 12)) >> 2)];
    }
  } else {
    var view = HEAP32.subarray((value) >> 2, (value + count * 16) >> 2);
  }
  GLctx.uniform4iv(webglGetUniformLocation(location), view);
};
var _emscripten_glUniform4iv = _glUniform4iv;

/** @suppress {duplicate } */
var _glUniform4ui = (location, v0, v1, v2, v3) => {
  GLctx.uniform4ui(webglGetUniformLocation(location), v0, v1, v2, v3);
};
var _emscripten_glUniform4ui = _glUniform4ui;

/** @suppress {duplicate } */
var _glUniform4uiv = (location, count, value) => {
  count && GLctx.uniform4uiv(webglGetUniformLocation(location), HEAPU32, value >> 2, count * 4);
};
var _emscripten_glUniform4uiv = _glUniform4uiv;

/** @suppress {duplicate } */
var _glUniformBlockBinding = (program, uniformBlockIndex, uniformBlockBinding) => {
  program = GL.programs[program];

  GLctx.uniformBlockBinding(program, uniformBlockIndex, uniformBlockBinding);
};
var _emscripten_glUniformBlockBinding = _glUniformBlockBinding;



/** @suppress {duplicate } */
var _glUniformMatrix2fv = (location, count, transpose, value) => {

  // WebGL 2 provides new garbage-free entry points to call to WebGL. Use
  // those always when possible.
  if (GL.currentContext.version >= 2) {
    count && GLctx.uniformMatrix2fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 4);
    return;
  }

  if (count <= 72) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLFloatBuffers[4 * count - 1];
    for (var i = 0; i < 4 * count; i += 4) {
      view[i] = HEAPF32[(((value) + (4 * i)) >> 2)];
      view[i + 1] = HEAPF32[(((value) + (4 * i + 4)) >> 2)];
      view[i + 2] = HEAPF32[(((value) + (4 * i + 8)) >> 2)];
      view[i + 3] = HEAPF32[(((value) + (4 * i + 12)) >> 2)];
    }
  } else {
    var view = HEAPF32.subarray((value) >> 2, (value + count * 16) >> 2);
  }
  GLctx.uniformMatrix2fv(webglGetUniformLocation(location), !!transpose, view);
};
var _emscripten_glUniformMatrix2fv = _glUniformMatrix2fv;

/** @suppress {duplicate } */
var _glUniformMatrix2x3fv = (location, count, transpose, value) => {
  count && GLctx.uniformMatrix2x3fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 6);
};
var _emscripten_glUniformMatrix2x3fv = _glUniformMatrix2x3fv;

/** @suppress {duplicate } */
var _glUniformMatrix2x4fv = (location, count, transpose, value) => {
  count && GLctx.uniformMatrix2x4fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 8);
};
var _emscripten_glUniformMatrix2x4fv = _glUniformMatrix2x4fv;



/** @suppress {duplicate } */
var _glUniformMatrix3fv = (location, count, transpose, value) => {

  // WebGL 2 provides new garbage-free entry points to call to WebGL. Use
  // those always when possible.
  if (GL.currentContext.version >= 2) {
    count && GLctx.uniformMatrix3fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 9);
    return;
  }

  if (count <= 32) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLFloatBuffers[9 * count - 1];
    for (var i = 0; i < 9 * count; i += 9) {
      view[i] = HEAPF32[(((value) + (4 * i)) >> 2)];
      view[i + 1] = HEAPF32[(((value) + (4 * i + 4)) >> 2)];
      view[i + 2] = HEAPF32[(((value) + (4 * i + 8)) >> 2)];
      view[i + 3] = HEAPF32[(((value) + (4 * i + 12)) >> 2)];
      view[i + 4] = HEAPF32[(((value) + (4 * i + 16)) >> 2)];
      view[i + 5] = HEAPF32[(((value) + (4 * i + 20)) >> 2)];
      view[i + 6] = HEAPF32[(((value) + (4 * i + 24)) >> 2)];
      view[i + 7] = HEAPF32[(((value) + (4 * i + 28)) >> 2)];
      view[i + 8] = HEAPF32[(((value) + (4 * i + 32)) >> 2)];
    }
  } else {
    var view = HEAPF32.subarray((value) >> 2, (value + count * 36) >> 2);
  }
  GLctx.uniformMatrix3fv(webglGetUniformLocation(location), !!transpose, view);
};
var _emscripten_glUniformMatrix3fv = _glUniformMatrix3fv;

/** @suppress {duplicate } */
var _glUniformMatrix3x2fv = (location, count, transpose, value) => {
  count && GLctx.uniformMatrix3x2fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 6);
};
var _emscripten_glUniformMatrix3x2fv = _glUniformMatrix3x2fv;

/** @suppress {duplicate } */
var _glUniformMatrix3x4fv = (location, count, transpose, value) => {
  count && GLctx.uniformMatrix3x4fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 12);
};
var _emscripten_glUniformMatrix3x4fv = _glUniformMatrix3x4fv;



/** @suppress {duplicate } */
var _glUniformMatrix4fv = (location, count, transpose, value) => {

  // WebGL 2 provides new garbage-free entry points to call to WebGL. Use
  // those always when possible.
  if (GL.currentContext.version >= 2) {
    count && GLctx.uniformMatrix4fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 16);
    return;
  }

  if (count <= 18) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLFloatBuffers[16 * count - 1];
    // hoist the heap out of the loop for size and for pthreads+growth.
    var heap = HEAPF32;
    value >>= 2;
    for (var i = 0; i < 16 * count; i += 16) {
      var dst = value + i;
      view[i] = heap[dst];
      view[i + 1] = heap[dst + 1];
      view[i + 2] = heap[dst + 2];
      view[i + 3] = heap[dst + 3];
      view[i + 4] = heap[dst + 4];
      view[i + 5] = heap[dst + 5];
      view[i + 6] = heap[dst + 6];
      view[i + 7] = heap[dst + 7];
      view[i + 8] = heap[dst + 8];
      view[i + 9] = heap[dst + 9];
      view[i + 10] = heap[dst + 10];
      view[i + 11] = heap[dst + 11];
      view[i + 12] = heap[dst + 12];
      view[i + 13] = heap[dst + 13];
      view[i + 14] = heap[dst + 14];
      view[i + 15] = heap[dst + 15];
    }
  } else {
    var view = HEAPF32.subarray((value) >> 2, (value + count * 64) >> 2);
  }
  GLctx.uniformMatrix4fv(webglGetUniformLocation(location), !!transpose, view);
};
var _emscripten_glUniformMatrix4fv = _glUniformMatrix4fv;

/** @suppress {duplicate } */
var _glUniformMatrix4x2fv = (location, count, transpose, value) => {
  count && GLctx.uniformMatrix4x2fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 8);
};
var _emscripten_glUniformMatrix4x2fv = _glUniformMatrix4x2fv;

/** @suppress {duplicate } */
var _glUniformMatrix4x3fv = (location, count, transpose, value) => {
  count && GLctx.uniformMatrix4x3fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 12);
};
var _emscripten_glUniformMatrix4x3fv = _glUniformMatrix4x3fv;

var _emscripten_glUseProgram = _glUseProgram;

/** @suppress {duplicate } */
var _glValidateProgram = (program) => {
  GLctx.validateProgram(GL.programs[program]);
};
var _emscripten_glValidateProgram = _glValidateProgram;

/** @suppress {duplicate } */
var _glVertex2f = (x, y) => {
  assert(GLImmediate.mode >= 0); // must be in begin/end
  GLImmediate.vertexData[GLImmediate.vertexCounter++] = x;
  GLImmediate.vertexData[GLImmediate.vertexCounter++] = y;
  GLImmediate.vertexData[GLImmediate.vertexCounter++] = 0;
  GLImmediate.vertexData[GLImmediate.vertexCounter++] = 1;
  assert(GLImmediate.vertexCounter << 2 < GL.MAX_TEMP_BUFFER_SIZE);
  GLImmediate.addRendererComponent(GLImmediate.VERTEX, 4, GLctx.FLOAT);
};
var _emscripten_glVertex2f = _glVertex2f;

/** @suppress {duplicate } */
var _glVertex2fv = (p) => {
  _glVertex2f(HEAPF32[((p) >> 2)], HEAPF32[(((p) + (4)) >> 2)]);
};
var _emscripten_glVertex2fv = _glVertex2fv;

/** @suppress {duplicate } */
var _glVertex2i = _glVertex2f;
var _emscripten_glVertex2i = _glVertex2i;

/** @suppress {duplicate } */
var _glVertex3f = (x, y, z) => {
  assert(GLImmediate.mode >= 0); // must be in begin/end
  GLImmediate.vertexData[GLImmediate.vertexCounter++] = x;
  GLImmediate.vertexData[GLImmediate.vertexCounter++] = y;
  GLImmediate.vertexData[GLImmediate.vertexCounter++] = z;
  GLImmediate.vertexData[GLImmediate.vertexCounter++] = 1;
  assert(GLImmediate.vertexCounter << 2 < GL.MAX_TEMP_BUFFER_SIZE);
  GLImmediate.addRendererComponent(GLImmediate.VERTEX, 4, GLctx.FLOAT);
};
var _emscripten_glVertex3f = _glVertex3f;

/** @suppress {duplicate } */
var _glVertex3fv = (p) => {
  _glVertex3f(HEAPF32[((p) >> 2)], HEAPF32[(((p) + (4)) >> 2)], HEAPF32[(((p) + (8)) >> 2)]);
};
var _emscripten_glVertex3fv = _glVertex3fv;

/** @suppress {duplicate } */
var _glVertex3i = _glVertex3f;
var _emscripten_glVertex3i = _glVertex3i;

/** @suppress {duplicate } */
var _glVertex4f = (x, y, z, w) => {
  assert(GLImmediate.mode >= 0); // must be in begin/end
  GLImmediate.vertexData[GLImmediate.vertexCounter++] = x;
  GLImmediate.vertexData[GLImmediate.vertexCounter++] = y;
  GLImmediate.vertexData[GLImmediate.vertexCounter++] = z;
  GLImmediate.vertexData[GLImmediate.vertexCounter++] = w;
  assert(GLImmediate.vertexCounter << 2 < GL.MAX_TEMP_BUFFER_SIZE);
  GLImmediate.addRendererComponent(GLImmediate.VERTEX, 4, GLctx.FLOAT);
};
var _emscripten_glVertex4f = _glVertex4f;

/** @suppress {duplicate } */
var _glVertex4fv = (p) => {
  _glVertex4f(HEAPF32[((p) >> 2)], HEAPF32[(((p) + (4)) >> 2)], HEAPF32[(((p) + (8)) >> 2)], HEAPF32[(((p) + (12)) >> 2)]);
};
var _emscripten_glVertex4fv = _glVertex4fv;

/** @suppress {duplicate } */
var _glVertex4i = _glVertex4f;
var _emscripten_glVertex4i = _glVertex4i;

/** @suppress {duplicate } */
function _glVertexAttrib1f(x0, x1) { GLctx.vertexAttrib1f(x0, x1) }
var _emscripten_glVertexAttrib1f = _glVertexAttrib1f;

/** @suppress {duplicate } */
var _glVertexAttrib1fv = (index, v) => {

  GLctx.vertexAttrib1f(index, HEAPF32[v >> 2]);
};
var _emscripten_glVertexAttrib1fv = _glVertexAttrib1fv;

/** @suppress {duplicate } */
function _glVertexAttrib2f(x0, x1, x2) { GLctx.vertexAttrib2f(x0, x1, x2) }
var _emscripten_glVertexAttrib2f = _glVertexAttrib2f;

/** @suppress {duplicate } */
var _glVertexAttrib2fv = (index, v) => {

  GLctx.vertexAttrib2f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2]);
};
var _emscripten_glVertexAttrib2fv = _glVertexAttrib2fv;

/** @suppress {duplicate } */
function _glVertexAttrib3f(x0, x1, x2, x3) { GLctx.vertexAttrib3f(x0, x1, x2, x3) }
var _emscripten_glVertexAttrib3f = _glVertexAttrib3f;

/** @suppress {duplicate } */
var _glVertexAttrib3fv = (index, v) => {

  GLctx.vertexAttrib3f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2], HEAPF32[v + 8 >> 2]);
};
var _emscripten_glVertexAttrib3fv = _glVertexAttrib3fv;

/** @suppress {duplicate } */
function _glVertexAttrib4f(x0, x1, x2, x3, x4) { GLctx.vertexAttrib4f(x0, x1, x2, x3, x4) }
var _emscripten_glVertexAttrib4f = _glVertexAttrib4f;

/** @suppress {duplicate } */
var _glVertexAttrib4fv = (index, v) => {

  GLctx.vertexAttrib4f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2], HEAPF32[v + 8 >> 2], HEAPF32[v + 12 >> 2]);
};
var _emscripten_glVertexAttrib4fv = _glVertexAttrib4fv;

/** @suppress {duplicate } */
var _glVertexAttribDivisor = (index, divisor) => {
  GLctx.vertexAttribDivisor(index, divisor);
};
var _emscripten_glVertexAttribDivisor = _glVertexAttribDivisor;


/** @suppress {duplicate } */
var _glVertexAttribDivisorANGLE = _glVertexAttribDivisor;
var _emscripten_glVertexAttribDivisorANGLE = _glVertexAttribDivisorANGLE;


/** @suppress {duplicate } */
var _glVertexAttribDivisorARB = _glVertexAttribDivisor;
var _emscripten_glVertexAttribDivisorARB = _glVertexAttribDivisorARB;


/** @suppress {duplicate } */
var _glVertexAttribDivisorEXT = _glVertexAttribDivisor;
var _emscripten_glVertexAttribDivisorEXT = _glVertexAttribDivisorEXT;


/** @suppress {duplicate } */
var _glVertexAttribDivisorNV = _glVertexAttribDivisor;
var _emscripten_glVertexAttribDivisorNV = _glVertexAttribDivisorNV;

/** @suppress {duplicate } */
function _glVertexAttribI4i(x0, x1, x2, x3, x4) { GLctx.vertexAttribI4i(x0, x1, x2, x3, x4) }
var _emscripten_glVertexAttribI4i = _glVertexAttribI4i;

/** @suppress {duplicate } */
var _glVertexAttribI4iv = (index, v) => {
  GLctx.vertexAttribI4i(index, HEAP32[v >> 2], HEAP32[v + 4 >> 2], HEAP32[v + 8 >> 2], HEAP32[v + 12 >> 2]);
};
var _emscripten_glVertexAttribI4iv = _glVertexAttribI4iv;

/** @suppress {duplicate } */
function _glVertexAttribI4ui(x0, x1, x2, x3, x4) { GLctx.vertexAttribI4ui(x0, x1, x2, x3, x4) }
var _emscripten_glVertexAttribI4ui = _glVertexAttribI4ui;

/** @suppress {duplicate } */
var _glVertexAttribI4uiv = (index, v) => {
  GLctx.vertexAttribI4ui(index, HEAPU32[v >> 2], HEAPU32[v + 4 >> 2], HEAPU32[v + 8 >> 2], HEAPU32[v + 12 >> 2]);
};
var _emscripten_glVertexAttribI4uiv = _glVertexAttribI4uiv;

/** @suppress {duplicate } */
var _glVertexAttribIPointer = (index, size, type, stride, ptr) => {
  GLctx.vertexAttribIPointer(index, size, type, stride, ptr);
};
var _emscripten_glVertexAttribIPointer = _glVertexAttribIPointer;

var _emscripten_glVertexAttribPointer = _glVertexAttribPointer;

/** @suppress {duplicate } */
var _glVertexPointer = (size, type, stride, pointer) => {
  GLImmediate.setClientAttribute(GLImmediate.VERTEX, size, type, stride, pointer);
};
var _emscripten_glVertexPointer = _glVertexPointer;

/** @suppress {duplicate } */
function _glViewport(x0, x1, x2, x3) { GLctx.viewport(x0, x1, x2, x3) }
var _emscripten_glViewport = _glViewport;

/** @suppress {duplicate } */
var _glWaitSync = (sync, flags, timeout_low, timeout_high) => {
  // See WebGL2 vs GLES3 difference on GL_TIMEOUT_IGNORED above (https://www.khronos.org/registry/webgl/specs/latest/2.0/#5.15)
  var timeout = convertI32PairToI53(timeout_low, timeout_high);
  GLctx.waitSync(GL.syncs[sync], flags, timeout);
};
var _emscripten_glWaitSync = _glWaitSync;

var _emscripten_has_asyncify = () => 0;

var reallyNegative = (x) => x < 0 || (x === 0 && (1 / x) === -Infinity);


var convertU32PairToI53 = (lo, hi) => {
  return (lo >>> 0) + (hi >>> 0) * 4294967296;
};

var reSign = (value, bits) => {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits - 1)) // abs is needed if bits == 32
    : Math.pow(2, bits - 1);
  // for huge values, we can hit the precision limit and always get true here.
  // so don't do that but, in general there is no perfect solution here. With
  // 64-bit ints, we get rounding and errors
  // TODO: In i64 mode 1, resign the two parts separately and safely
  if (value >= half && (bits <= 32 || value > half)) {
    // Cannot bitshift half, as it may be at the limit of the bits JS uses in
    // bitshifts
    value = -2 * half + value;
  }
  return value;
};

var unSign = (value, bits) => {
  if (value >= 0) {
    return value;
  }
  // Need some trickery, since if bits == 32, we are right at the limit of the
  // bits JS uses in bitshifts
  return bits <= 32 ? 2 * Math.abs(1 << (bits - 1)) + value
    : Math.pow(2, bits) + value;
};

var strLen = (ptr) => {
  var end = ptr;
  while (HEAPU8[end]) ++end;
  return end - ptr;
};

var formatString = (format, varargs) => {
  assert((varargs & 3) === 0);
  var textIndex = format;
  var argIndex = varargs;
  // This must be called before reading a double or i64 vararg. It will bump the pointer properly.
  // It also does an assert on i32 values, so it's nice to call it before all varargs calls.
  function prepVararg(ptr, type) {
    if (type === 'double' || type === 'i64') {
      // move so the load is aligned
      if (ptr & 7) {
        assert((ptr & 7) === 4);
        ptr += 4;
      }
    } else {
      assert((ptr & 3) === 0);
    }
    return ptr;
  }
  function getNextArg(type) {
    // NOTE: Explicitly ignoring type safety. Otherwise this fails:
    //       int x = 4; printf("%c\n", (char)x);
    var ret;
    argIndex = prepVararg(argIndex, type);
    if (type === 'double') {
      ret = HEAPF64[((argIndex) >> 3)];
      argIndex += 8;
    } else if (type == 'i64') {
      ret = [HEAP32[((argIndex) >> 2)],
      HEAP32[(((argIndex) + (4)) >> 2)]];
      argIndex += 8;
    } else {
      assert((argIndex & 3) === 0);
      type = 'i32'; // varargs are always i32, i64, or double
      ret = HEAP32[((argIndex) >> 2)];
      argIndex += 4;
    }
    return ret;
  }

  var ret = [];
  var curr, next, currArg;
  while (1) {
    var startTextIndex = textIndex;
    curr = HEAP8[((textIndex) >> 0)];
    if (curr === 0) break;
    next = HEAP8[((textIndex + 1) >> 0)];
    if (curr == 37) {
      // Handle flags.
      var flagAlwaysSigned = false;
      var flagLeftAlign = false;
      var flagAlternative = false;
      var flagZeroPad = false;
      var flagPadSign = false;
      flagsLoop: while (1) {
        switch (next) {
          case 43:
            flagAlwaysSigned = true;
            break;
          case 45:
            flagLeftAlign = true;
            break;
          case 35:
            flagAlternative = true;
            break;
          case 48:
            if (flagZeroPad) {
              break flagsLoop;
            } else {
              flagZeroPad = true;
              break;
            }
          case 32:
            flagPadSign = true;
            break;
          default:
            break flagsLoop;
        }
        textIndex++;
        next = HEAP8[((textIndex + 1) >> 0)];
      }

      // Handle width.
      var width = 0;
      if (next == 42) {
        width = getNextArg('i32');
        textIndex++;
        next = HEAP8[((textIndex + 1) >> 0)];
      } else {
        while (next >= 48 && next <= 57) {
          width = width * 10 + (next - 48);
          textIndex++;
          next = HEAP8[((textIndex + 1) >> 0)];
        }
      }

      // Handle precision.
      var precisionSet = false, precision = -1;
      if (next == 46) {
        precision = 0;
        precisionSet = true;
        textIndex++;
        next = HEAP8[((textIndex + 1) >> 0)];
        if (next == 42) {
          precision = getNextArg('i32');
          textIndex++;
        } else {
          while (1) {
            var precisionChr = HEAP8[((textIndex + 1) >> 0)];
            if (precisionChr < 48 ||
              precisionChr > 57) break;
            precision = precision * 10 + (precisionChr - 48);
            textIndex++;
          }
        }
        next = HEAP8[((textIndex + 1) >> 0)];
      }
      if (precision < 0) {
        precision = 6; // Standard default.
        precisionSet = false;
      }

      // Handle integer sizes. WARNING: These assume a 32-bit architecture!
      var argSize;
      switch (String.fromCharCode(next)) {
        case 'h':
          var nextNext = HEAP8[((textIndex + 2) >> 0)];
          if (nextNext == 104) {
            textIndex++;
            argSize = 1; // char (actually i32 in varargs)
          } else {
            argSize = 2; // short (actually i32 in varargs)
          }
          break;
        case 'l':
          var nextNext = HEAP8[((textIndex + 2) >> 0)];
          if (nextNext == 108) {
            textIndex++;
            argSize = 8; // long long
          } else {
            argSize = 4; // long
          }
          break;
        case 'L': // long long
        case 'q': // int64_t
        case 'j': // intmax_t
          argSize = 8;
          break;
        case 'z': // size_t
        case 't': // ptrdiff_t
        case 'I': // signed ptrdiff_t or unsigned size_t
          argSize = 4;
          break;
        default:
          argSize = null;
      }
      if (argSize) textIndex++;
      next = HEAP8[((textIndex + 1) >> 0)];

      // Handle type specifier.
      switch (String.fromCharCode(next)) {
        case 'd': case 'i': case 'u': case 'o': case 'x': case 'X': case 'p': {
          // Integer.
          var signed = next == 100 || next == 105;
          argSize = argSize || 4;
          currArg = getNextArg('i' + (argSize * 8));
          var argText;
          // Flatten i64-1 [low, high] into a (slightly rounded) double
          if (argSize == 8) {
            currArg = next == 117 ? convertU32PairToI53(currArg[0], currArg[1]) : convertI32PairToI53(currArg[0], currArg[1]);
          }
          // Truncate to requested size.
          if (argSize <= 4) {
            var limit = Math.pow(256, argSize) - 1;
            currArg = (signed ? reSign : unSign)(currArg & limit, argSize * 8);
          }
          // Format the number.
          var currAbsArg = Math.abs(currArg);
          var prefix = '';
          if (next == 100 || next == 105) {
            argText = reSign(currArg, 8 * argSize).toString(10);
          } else if (next == 117) {
            argText = unSign(currArg, 8 * argSize).toString(10);
            currArg = Math.abs(currArg);
          } else if (next == 111) {
            argText = (flagAlternative ? '0' : '') + currAbsArg.toString(8);
          } else if (next == 120 || next == 88) {
            prefix = (flagAlternative && currArg != 0) ? '0x' : '';
            if (currArg < 0) {
              // Represent negative numbers in hex as 2's complement.
              currArg = -currArg;
              argText = (currAbsArg - 1).toString(16);
              var buffer = [];
              for (var i = 0; i < argText.length; i++) {
                buffer.push((0xF - parseInt(argText[i], 16)).toString(16));
              }
              argText = buffer.join('');
              while (argText.length < argSize * 2) argText = 'f' + argText;
            } else {
              argText = currAbsArg.toString(16);
            }
            if (next == 88) {
              prefix = prefix.toUpperCase();
              argText = argText.toUpperCase();
            }
          } else if (next == 112) {
            if (currAbsArg === 0) {
              argText = '(nil)';
            } else {
              prefix = '0x';
              argText = currAbsArg.toString(16);
            }
          }
          if (precisionSet) {
            while (argText.length < precision) {
              argText = '0' + argText;
            }
          }

          // Add sign if needed
          if (currArg >= 0) {
            if (flagAlwaysSigned) {
              prefix = '+' + prefix;
            } else if (flagPadSign) {
              prefix = ' ' + prefix;
            }
          }

          // Move sign to prefix so we zero-pad after the sign
          if (argText.charAt(0) == '-') {
            prefix = '-' + prefix;
            argText = argText.substr(1);
          }

          // Add padding.
          while (prefix.length + argText.length < width) {
            if (flagLeftAlign) {
              argText += ' ';
            } else {
              if (flagZeroPad) {
                argText = '0' + argText;
              } else {
                prefix = ' ' + prefix;
              }
            }
          }

          // Insert the result into the buffer.
          argText = prefix + argText;
          argText.split('').forEach(function (chr) {
            ret.push(chr.charCodeAt(0));
          });
          break;
        }
        case 'f': case 'F': case 'e': case 'E': case 'g': case 'G': {
          // Float.
          currArg = getNextArg('double');
          var argText;
          if (isNaN(currArg)) {
            argText = 'nan';
            flagZeroPad = false;
          } else if (!isFinite(currArg)) {
            argText = (currArg < 0 ? '-' : '') + 'inf';
            flagZeroPad = false;
          } else {
            var isGeneral = false;
            var effectivePrecision = Math.min(precision, 20);

            // Convert g/G to f/F or e/E, as per:
            // http://pubs.opengroup.org/onlinepubs/9699919799/functions/printf.html
            if (next == 103 || next == 71) {
              isGeneral = true;
              precision = precision || 1;
              var exponent = parseInt(currArg.toExponential(effectivePrecision).split('e')[1], 10);
              if (precision > exponent && exponent >= -4) {
                next = ((next == 103) ? 'f' : 'F').charCodeAt(0);
                precision -= exponent + 1;
              } else {
                next = ((next == 103) ? 'e' : 'E').charCodeAt(0);
                precision--;
              }
              effectivePrecision = Math.min(precision, 20);
            }

            if (next == 101 || next == 69) {
              argText = currArg.toExponential(effectivePrecision);
              // Make sure the exponent has at least 2 digits.
              if (/[eE][-+]\d$/.test(argText)) {
                argText = argText.slice(0, -1) + '0' + argText.slice(-1);
              }
            } else if (next == 102 || next == 70) {
              argText = currArg.toFixed(effectivePrecision);
              if (currArg === 0 && reallyNegative(currArg)) {
                argText = '-' + argText;
              }
            }

            var parts = argText.split('e');
            if (isGeneral && !flagAlternative) {
              // Discard trailing zeros and periods.
              while (parts[0].length > 1 && parts[0].includes('.') &&
                (parts[0].slice(-1) == '0' || parts[0].slice(-1) == '.')) {
                parts[0] = parts[0].slice(0, -1);
              }
            } else {
              // Make sure we have a period in alternative mode.
              if (flagAlternative && argText.indexOf('.') == -1) parts[0] += '.';
              // Zero pad until required precision.
              while (precision > effectivePrecision++) parts[0] += '0';
            }
            argText = parts[0] + (parts.length > 1 ? 'e' + parts[1] : '');

            // Capitalize 'E' if needed.
            if (next == 69) argText = argText.toUpperCase();

            // Add sign.
            if (currArg >= 0) {
              if (flagAlwaysSigned) {
                argText = '+' + argText;
              } else if (flagPadSign) {
                argText = ' ' + argText;
              }
            }
          }

          // Add padding.
          while (argText.length < width) {
            if (flagLeftAlign) {
              argText += ' ';
            } else {
              if (flagZeroPad && (argText[0] == '-' || argText[0] == '+')) {
                argText = argText[0] + '0' + argText.slice(1);
              } else {
                argText = (flagZeroPad ? '0' : ' ') + argText;
              }
            }
          }

          // Adjust case.
          if (next < 97) argText = argText.toUpperCase();

          // Insert the result into the buffer.
          argText.split('').forEach(function (chr) {
            ret.push(chr.charCodeAt(0));
          });
          break;
        }
        case 's': {
          // String.
          var arg = getNextArg('i8*');
          var argLength = arg ? strLen(arg) : '(null)'.length;
          if (precisionSet) argLength = Math.min(argLength, precision);
          if (!flagLeftAlign) {
            while (argLength < width--) {
              ret.push(32);
            }
          }
          if (arg) {
            for (var i = 0; i < argLength; i++) {
              ret.push(HEAPU8[((arg++) >> 0)]);
            }
          } else {
            ret = ret.concat(intArrayFromString('(null)'.substr(0, argLength), true));
          }
          if (flagLeftAlign) {
            while (argLength < width--) {
              ret.push(32);
            }
          }
          break;
        }
        case 'c': {
          // Character.
          if (flagLeftAlign) ret.push(getNextArg('i8'));
          while (--width > 0) {
            ret.push(32);
          }
          if (!flagLeftAlign) ret.push(getNextArg('i8'));
          break;
        }
        case 'n': {
          // Write the length written so far to the next parameter.
          var ptr = getNextArg('i32*');
          HEAP32[((ptr) >> 2)] = ret.length;
          break;
        }
        case '%': {
          // Literal percent sign.
          ret.push(curr);
          break;
        }
        default: {
          // Unknown specifiers remain untouched.
          for (var i = startTextIndex; i < textIndex + 2; i++) {
            ret.push(HEAP8[((i) >> 0)]);
          }
        }
      }
      textIndex += 2;
      // TODO: Support a/A (hex float) and m (last error) specifiers.
      // TODO: Support %1${specifier} for arg selection.
    } else {
      ret.push(curr);
      textIndex += 1;
    }
  }
  return ret;
};

function jsStackTrace() {
  var error = new Error();
  if (!error.stack) {
    // IE10+ special cases: It does have callstack info, but it is only
    // populated if an Error object is thrown, so try that as a special-case.
    try {
      throw new Error();
    } catch (e) {
      error = e;
    }
    if (!error.stack) {
      return '(no stack trace available)';
    }
  }
  return error.stack.toString();
}

/** @param {number=} flags */
function getCallstack(flags) {
  var callstack = jsStackTrace();

  // Find the symbols in the callstack that corresponds to the functions that
  // report callstack information, and remove everything up to these from the
  // output.
  var iThisFunc = callstack.lastIndexOf('_emscripten_log');
  var iThisFunc2 = callstack.lastIndexOf('_emscripten_get_callstack');
  var iNextLine = callstack.indexOf('\n', Math.max(iThisFunc, iThisFunc2)) + 1;
  callstack = callstack.slice(iNextLine);

  // If user requested to see the original source stack, but no source map
  // information is available, just fall back to showing the JS stack.
  if (flags & 8 && typeof emscripten_source_map == 'undefined') {
    warnOnce('Source map information is not available, emscripten_log with EM_LOG_C_STACK will be ignored. Build with "--pre-js $EMSCRIPTEN/src/emscripten-source-map.min.js" linker flag to add source map loading to code.');
    flags ^= 8;
    flags |= 16;
  }

  // Process all lines:
  var lines = callstack.split('\n');
  callstack = '';
  // New FF30 with column info: extract components of form:
  // '       Object._main@http://server.com:4324:12'
  var newFirefoxRe = new RegExp('\\s*(.*?)@(.*?):([0-9]+):([0-9]+)');
  // Old FF without column info: extract components of form:
  // '       Object._main@http://server.com:4324'
  var firefoxRe = new RegExp('\\s*(.*?)@(.*):(.*)(:(.*))?');
  // Extract components of form:
  // '    at Object._main (http://server.com/file.html:4324:12)'
  var chromeRe = new RegExp('\\s*at (.*?) \\\((.*):(.*):(.*)\\\)');

  for (var l in lines) {
    var line = lines[l];

    var symbolName = '';
    var file = '';
    var lineno = 0;
    var column = 0;

    var parts = chromeRe.exec(line);
    if (parts && parts.length == 5) {
      symbolName = parts[1];
      file = parts[2];
      lineno = parts[3];
      column = parts[4];
    } else {
      parts = newFirefoxRe.exec(line);
      if (!parts) parts = firefoxRe.exec(line);
      if (parts && parts.length >= 4) {
        symbolName = parts[1];
        file = parts[2];
        lineno = parts[3];
        // Old Firefox doesn't carry column information, but in new FF30, it
        // is present. See https://bugzilla.mozilla.org/show_bug.cgi?id=762556
        column = parts[4] | 0;
      } else {
        // Was not able to extract this line for demangling/sourcemapping
        // purposes. Output it as-is.
        callstack += line + '\n';
        continue;
      }
    }

    var haveSourceMap = false;

    if (flags & 8) {
      var orig = emscripten_source_map.originalPositionFor({ line: lineno, column: column });
      haveSourceMap = orig?.source;
      if (haveSourceMap) {
        if (flags & 64) {
          orig.source = orig.source.substring(orig.source.replace(/\\/g, "/").lastIndexOf('/') + 1);
        }
        callstack += `    at ${symbolName} (${orig.source}:${orig.line}:${orig.column})\n`;
      }
    }
    if ((flags & 16) || !haveSourceMap) {
      if (flags & 64) {
        file = file.substring(file.replace(/\\/g, "/").lastIndexOf('/') + 1);
      }
      callstack += (haveSourceMap ? (`     = ${symbolName}`) : (`    at ${symbolName}`)) + ` (${file}:${lineno}:${column})\n`;
    }
  }
  // Trim extra whitespace at the end of the output.
  callstack = callstack.replace(/\s+$/, '');
  return callstack;
}
var emscriptenLog = (flags, str) => {
  if (flags & 24) {
    str = str.replace(/\s+$/, ''); // Ensure the message and the callstack are joined cleanly with exactly one newline.
    str += (str.length > 0 ? '\n' : '') + getCallstack(flags);
  }

  if (flags & 1) {
    if (flags & 4) {
      console.error(str);
    } else if (flags & 2) {
      console.warn(str);
    } else if (flags & 512) {
      console.info(str);
    } else if (flags & 256) {
      console.debug(str);
    } else {
      console.log(str);
    }
  } else if (flags & 6) {
    err(str);
  } else {
    out(str);
  }
};
var _emscripten_log = (flags, format, varargs) => {
  var result = formatString(format, varargs);
  var str = UTF8ArrayToString(result, 0);
  emscriptenLog(flags, str);
};

var _emscripten_memcpy_js = (dest, src, num) => HEAPU8.copyWithin(dest, src, src + num);








var doRequestFullscreen = (target, strategy) => {
  if (!JSEvents.fullscreenEnabled()) return -1;
  target = findEventTarget(target);
  if (!target) return -4;

  if (!target.requestFullscreen
    && !target.webkitRequestFullscreen
  ) {
    return -3;
  }

  var canPerformRequests = JSEvents.canPerformEventHandlerRequests();

  // Queue this function call if we're not currently in an event handler and the user saw it appropriate to do so.
  if (!canPerformRequests) {
    if (strategy.deferUntilInEventHandler) {
      JSEvents.deferCall(JSEvents_requestFullscreen, 1 /* priority over pointer lock */, [target, strategy]);
      return 1;
    }
    return -2;
  }

  return JSEvents_requestFullscreen(target, strategy);
};


var _emscripten_request_fullscreen_strategy = (target, deferUntilInEventHandler, fullscreenStrategy) => {
  var strategy = {
    scaleMode: HEAP32[((fullscreenStrategy) >> 2)],
    canvasResolutionScaleMode: HEAP32[(((fullscreenStrategy) + (4)) >> 2)],
    filteringMode: HEAP32[(((fullscreenStrategy) + (8)) >> 2)],
    deferUntilInEventHandler,
    canvasResizedCallback: HEAP32[(((fullscreenStrategy) + (12)) >> 2)],
    canvasResizedCallbackUserData: HEAP32[(((fullscreenStrategy) + (16)) >> 2)]
  };

  return doRequestFullscreen(target, strategy);
};



var _emscripten_request_pointerlock = (target, deferUntilInEventHandler) => {
  target = findEventTarget(target);
  if (!target) return -4;
  if (!target.requestPointerLock
  ) {
    return -1;
  }

  var canPerformRequests = JSEvents.canPerformEventHandlerRequests();

  // Queue this function call if we're not currently in an event handler and the user saw it appropriate to do so.
  if (!canPerformRequests) {
    if (deferUntilInEventHandler) {
      JSEvents.deferCall(requestPointerLock, 2 /* priority below fullscreen */, [target]);
      return 1;
    }
    return -2;
  }

  return requestPointerLock(target);
};


var growMemory = (size) => {
  var b = wasmMemory.buffer;
  var pages = (size - b.byteLength + 65535) / 65536;
  try {
    // round size grow request up to wasm page size (fixed 64KB per spec)
    wasmMemory.grow(pages); // .grow() takes a delta compared to the previous size
    updateMemoryViews();
    return 1 /*success*/;
  } catch (e) {
    err(`growMemory: Attempted to grow heap from ${b.byteLength} bytes to ${size} bytes, but got error: ${e}`);
  }
  // implicit 0 return to save code size (caller will cast "undefined" into 0
  // anyhow)
};
var _emscripten_resize_heap = (requestedSize) => {
  var oldSize = HEAPU8.length;
  // With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
  requestedSize >>>= 0;
  // With multithreaded builds, races can happen (another thread might increase the size
  // in between), so return a failure, and let the caller retry.
  assert(requestedSize > oldSize);

  // Memory resize rules:
  // 1.  Always increase heap size to at least the requested size, rounded up
  //     to next page multiple.
  // 2a. If MEMORY_GROWTH_LINEAR_STEP == -1, excessively resize the heap
  //     geometrically: increase the heap size according to
  //     MEMORY_GROWTH_GEOMETRIC_STEP factor (default +20%), At most
  //     overreserve by MEMORY_GROWTH_GEOMETRIC_CAP bytes (default 96MB).
  // 2b. If MEMORY_GROWTH_LINEAR_STEP != -1, excessively resize the heap
  //     linearly: increase the heap size by at least
  //     MEMORY_GROWTH_LINEAR_STEP bytes.
  // 3.  Max size for the heap is capped at 2048MB-WASM_PAGE_SIZE, or by
  //     MAXIMUM_MEMORY, or by ASAN limit, depending on which is smallest
  // 4.  If we were unable to allocate as much memory, it may be due to
  //     over-eager decision to excessively reserve due to (3) above.
  //     Hence if an allocation fails, cut down on the amount of excess
  //     growth, in an attempt to succeed to perform a smaller allocation.

  // A limit is set for how much we can grow. We should not exceed that
  // (the wasm binary specifies it, so if we tried, we'd fail anyhow).
  var maxHeapSize = getHeapMax();
  if (requestedSize > maxHeapSize) {
    err(`Cannot enlarge memory, requested ${requestedSize} bytes, but the limit is ${maxHeapSize} bytes!`);
    return false;
  }

  var alignUp = (x, multiple) => x + (multiple - x % multiple) % multiple;

  // Loop through potential heap size increases. If we attempt a too eager
  // reservation that fails, cut down on the attempted size and reserve a
  // smaller bump instead. (max 3 times, chosen somewhat arbitrarily)
  for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
    var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown); // ensure geometric growth
    // but limit overreserving (default to capping at +96MB overgrowth at most)
    overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);

    var newSize = Math.min(maxHeapSize, alignUp(Math.max(requestedSize, overGrownHeapSize), 65536));

    var replacement = growMemory(newSize);
    if (replacement) {

      return true;
    }
  }
  err(`Failed to grow the heap from ${oldSize} bytes to ${newSize} bytes, not enough memory!`);
  return false;
};


/** @suppress {checkTypes} */
var disableGamepadApiIfItThrows = () => {
  try {
    navigator.getGamepads();
  } catch (e) {
    err(`navigator.getGamepads() exists, but failed to execute with exception ${e}. Disabling Gamepad access.`);
    navigator.getGamepads = null; // Disable getGamepads() so that other functions will not attempt to use it.
    return 1;
  }
};
var _emscripten_sample_gamepad_data = () => {
  if (!navigator.getGamepads || disableGamepadApiIfItThrows()) return -1;
  return (JSEvents.lastGamepadState = navigator.getGamepads())
    ? 0 : -1;
};




var registerBeforeUnloadEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) => {
  var beforeUnloadEventHandlerFunc = (e = event) => {
    // Note: This is always called on the main browser thread, since it needs synchronously return a value!
    var confirmationMessage = getWasmTableEntry(callbackfunc)(eventTypeId, 0, userData);

    if (confirmationMessage) {
      confirmationMessage = UTF8ToString(confirmationMessage);
    }
    if (confirmationMessage) {
      e.preventDefault();
      e.returnValue = confirmationMessage;
      return confirmationMessage;
    }
  };

  var eventHandler = {
    target: findEventTarget(target),
    eventTypeString,
    callbackfunc,
    handlerFunc: beforeUnloadEventHandlerFunc,
    useCapture
  };
  return JSEvents.registerOrRemoveHandler(eventHandler);
};
var _emscripten_set_beforeunload_callback_on_thread = (userData, callbackfunc, targetThread) => {
  if (typeof onbeforeunload == 'undefined') return -1;
  // beforeunload callback can only be registered on the main browser thread, because the page will go away immediately after returning from the handler,
  // and there is no time to start proxying it anywhere.
  if (targetThread !== 1) return -5;
  return registerBeforeUnloadEventCallback(2, userData, true, callbackfunc, 28, "beforeunload");
};





var registerFocusEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
  if (!JSEvents.focusEvent) JSEvents.focusEvent = _malloc(256);

  var focusEventHandlerFunc = (e = event) => {
    var nodeName = JSEvents.getNodeNameForTarget(e.target);
    var id = e.target.id ? e.target.id : '';

    var focusEvent = JSEvents.focusEvent;
    stringToUTF8(nodeName, focusEvent + 0, 128);
    stringToUTF8(id, focusEvent + 128, 128);

    if (getWasmTableEntry(callbackfunc)(eventTypeId, focusEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target: findEventTarget(target),
    eventTypeString,
    callbackfunc,
    handlerFunc: focusEventHandlerFunc,
    useCapture
  };
  return JSEvents.registerOrRemoveHandler(eventHandler);
};
var _emscripten_set_blur_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => {
  return registerFocusEventCallback(target, userData, useCapture, callbackfunc, 12, "blur", targetThread);
};



var _emscripten_set_element_css_size = (target, width, height) => {
  target = findEventTarget(target);
  if (!target) return -4;

  target.style.width = width + "px";
  target.style.height = height + "px";

  return 0;
};

var _emscripten_set_focus_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => {
  return registerFocusEventCallback(target, userData, useCapture, callbackfunc, 13, "focus", targetThread);
};




var fillFullscreenChangeEventData = (eventStruct) => {
  var fullscreenElement = document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
  var isFullscreen = !!fullscreenElement;
  // Assigning a boolean to HEAP32 with expected type coercion.
  /** @suppress{checkTypes} */
  HEAP32[((eventStruct) >> 2)] = isFullscreen;
  HEAP32[(((eventStruct) + (4)) >> 2)] = JSEvents.fullscreenEnabled();
  // If transitioning to fullscreen, report info about the element that is now fullscreen.
  // If transitioning to windowed mode, report info about the element that just was fullscreen.
  var reportedElement = isFullscreen ? fullscreenElement : JSEvents.previousFullscreenElement;
  var nodeName = JSEvents.getNodeNameForTarget(reportedElement);
  var id = reportedElement?.id || '';
  stringToUTF8(nodeName, eventStruct + 8, 128);
  stringToUTF8(id, eventStruct + 136, 128);
  HEAP32[(((eventStruct) + (264)) >> 2)] = reportedElement ? reportedElement.clientWidth : 0;
  HEAP32[(((eventStruct) + (268)) >> 2)] = reportedElement ? reportedElement.clientHeight : 0;
  HEAP32[(((eventStruct) + (272)) >> 2)] = screen.width;
  HEAP32[(((eventStruct) + (276)) >> 2)] = screen.height;
  if (isFullscreen) {
    JSEvents.previousFullscreenElement = fullscreenElement;
  }
};



var registerFullscreenChangeEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
  if (!JSEvents.fullscreenChangeEvent) JSEvents.fullscreenChangeEvent = _malloc(280);

  var fullscreenChangeEventhandlerFunc = (e = event) => {
    var fullscreenChangeEvent = JSEvents.fullscreenChangeEvent;

    fillFullscreenChangeEventData(fullscreenChangeEvent);

    if (getWasmTableEntry(callbackfunc)(eventTypeId, fullscreenChangeEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target,
    eventTypeString,
    callbackfunc,
    handlerFunc: fullscreenChangeEventhandlerFunc,
    useCapture
  };
  return JSEvents.registerOrRemoveHandler(eventHandler);
};


var _emscripten_set_fullscreenchange_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => {
  if (!JSEvents.fullscreenEnabled()) return -1;
  target = findEventTarget(target);
  if (!target) return -4;

  // Unprefixed Fullscreen API shipped in Chromium 71 (https://bugs.chromium.org/p/chromium/issues/detail?id=383813)
  // As of Safari 13.0.3 on macOS Catalina 10.15.1 still ships with prefixed webkitfullscreenchange. TODO: revisit this check once Safari ships unprefixed version.
  registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, 19, "webkitfullscreenchange", targetThread);

  return registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, 19, "fullscreenchange", targetThread);
};





var registerGamepadEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
  if (!JSEvents.gamepadEvent) JSEvents.gamepadEvent = _malloc(1432);

  var gamepadEventHandlerFunc = (e = event) => {
    var gamepadEvent = JSEvents.gamepadEvent;
    fillGamepadEventData(gamepadEvent, e["gamepad"]);

    if (getWasmTableEntry(callbackfunc)(eventTypeId, gamepadEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target: findEventTarget(target),
    allowsDeferredCalls: true,
    eventTypeString,
    callbackfunc,
    handlerFunc: gamepadEventHandlerFunc,
    useCapture
  };
  return JSEvents.registerOrRemoveHandler(eventHandler);
};

var _emscripten_set_gamepadconnected_callback_on_thread = (userData, useCapture, callbackfunc, targetThread) => {
  if (!navigator.getGamepads || disableGamepadApiIfItThrows()) return -1;
  return registerGamepadEventCallback(2, userData, useCapture, callbackfunc, 26, "gamepadconnected", targetThread);
};


var _emscripten_set_gamepaddisconnected_callback_on_thread = (userData, useCapture, callbackfunc, targetThread) => {
  if (!navigator.getGamepads || disableGamepadApiIfItThrows()) return -1;
  return registerGamepadEventCallback(2, userData, useCapture, callbackfunc, 27, "gamepaddisconnected", targetThread);
};





var registerKeyEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
  if (!JSEvents.keyEvent) JSEvents.keyEvent = _malloc(176);

  var keyEventHandlerFunc = (e) => {
    assert(e);

    var keyEventData = JSEvents.keyEvent;
    HEAPF64[((keyEventData) >> 3)] = e.timeStamp;

    var idx = ((keyEventData) >> 2);

    HEAP32[idx + 2] = e.location;
    HEAP32[idx + 3] = e.ctrlKey;
    HEAP32[idx + 4] = e.shiftKey;
    HEAP32[idx + 5] = e.altKey;
    HEAP32[idx + 6] = e.metaKey;
    HEAP32[idx + 7] = e.repeat;
    HEAP32[idx + 8] = e.charCode;
    HEAP32[idx + 9] = e.keyCode;
    HEAP32[idx + 10] = e.which;
    stringToUTF8(e.key || '', keyEventData + 44, 32);
    stringToUTF8(e.code || '', keyEventData + 76, 32);
    stringToUTF8(e.char || '', keyEventData + 108, 32);
    stringToUTF8(e.locale || '', keyEventData + 140, 32);

    if (getWasmTableEntry(callbackfunc)(eventTypeId, keyEventData, userData)) e.preventDefault();
  };

  var eventHandler = {
    target: findEventTarget(target),
    eventTypeString,
    callbackfunc,
    handlerFunc: keyEventHandlerFunc,
    useCapture
  };
  return JSEvents.registerOrRemoveHandler(eventHandler);
};
var _emscripten_set_keydown_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
  registerKeyEventCallback(target, userData, useCapture, callbackfunc, 2, "keydown", targetThread);

var _emscripten_set_keypress_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
  registerKeyEventCallback(target, userData, useCapture, callbackfunc, 1, "keypress", targetThread);

var _emscripten_set_keyup_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
  registerKeyEventCallback(target, userData, useCapture, callbackfunc, 3, "keyup", targetThread);



var _emscripten_set_main_loop = (func, fps, simulateInfiniteLoop) => {
  var browserIterationFunc = getWasmTableEntry(func);
  setMainLoop(browserIterationFunc, fps, simulateInfiniteLoop);
};




var fillMouseEventData = (eventStruct, e, target) => {
  assert(eventStruct % 4 == 0);
  HEAPF64[((eventStruct) >> 3)] = e.timeStamp;
  var idx = ((eventStruct) >> 2);
  HEAP32[idx + 2] = e.screenX;
  HEAP32[idx + 3] = e.screenY;
  HEAP32[idx + 4] = e.clientX;
  HEAP32[idx + 5] = e.clientY;
  HEAP32[idx + 6] = e.ctrlKey;
  HEAP32[idx + 7] = e.shiftKey;
  HEAP32[idx + 8] = e.altKey;
  HEAP32[idx + 9] = e.metaKey;
  HEAP16[idx * 2 + 20] = e.button;
  HEAP16[idx * 2 + 21] = e.buttons;

  HEAP32[idx + 11] = e["movementX"]
    ;

  HEAP32[idx + 12] = e["movementY"]
    ;

  var rect = getBoundingClientRect(target);
  HEAP32[idx + 13] = e.clientX - rect.left;
  HEAP32[idx + 14] = e.clientY - rect.top;

};



var registerMouseEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
  if (!JSEvents.mouseEvent) JSEvents.mouseEvent = _malloc(72);
  target = findEventTarget(target);

  var mouseEventHandlerFunc = (e = event) => {
    // TODO: Make this access thread safe, or this could update live while app is reading it.
    fillMouseEventData(JSEvents.mouseEvent, e, target);

    if (getWasmTableEntry(callbackfunc)(eventTypeId, JSEvents.mouseEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target,
    allowsDeferredCalls: eventTypeString != 'mousemove' && eventTypeString != 'mouseenter' && eventTypeString != 'mouseleave', // Mouse move events do not allow fullscreen/pointer lock requests to be handled in them!
    eventTypeString,
    callbackfunc,
    handlerFunc: mouseEventHandlerFunc,
    useCapture
  };
  return JSEvents.registerOrRemoveHandler(eventHandler);
};
var _emscripten_set_mousedown_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
  registerMouseEventCallback(target, userData, useCapture, callbackfunc, 5, "mousedown", targetThread);

var _emscripten_set_mouseenter_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
  registerMouseEventCallback(target, userData, useCapture, callbackfunc, 33, "mouseenter", targetThread);

var _emscripten_set_mouseleave_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
  registerMouseEventCallback(target, userData, useCapture, callbackfunc, 34, "mouseleave", targetThread);

var _emscripten_set_mousemove_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
  registerMouseEventCallback(target, userData, useCapture, callbackfunc, 8, "mousemove", targetThread);

var _emscripten_set_mouseup_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
  registerMouseEventCallback(target, userData, useCapture, callbackfunc, 6, "mouseup", targetThread);




var fillPointerlockChangeEventData = (eventStruct) => {
  var pointerLockElement = document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement || document.msPointerLockElement;
  var isPointerlocked = !!pointerLockElement;
  // Assigning a boolean to HEAP32 with expected type coercion.
  /** @suppress{checkTypes} */
  HEAP32[((eventStruct) >> 2)] = isPointerlocked;
  var nodeName = JSEvents.getNodeNameForTarget(pointerLockElement);
  var id = pointerLockElement?.id || '';
  stringToUTF8(nodeName, eventStruct + 4, 128);
  stringToUTF8(id, eventStruct + 132, 128);
};



var registerPointerlockChangeEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
  if (!JSEvents.pointerlockChangeEvent) JSEvents.pointerlockChangeEvent = _malloc(260);

  var pointerlockChangeEventHandlerFunc = (e = event) => {
    var pointerlockChangeEvent = JSEvents.pointerlockChangeEvent;
    fillPointerlockChangeEventData(pointerlockChangeEvent);

    if (getWasmTableEntry(callbackfunc)(eventTypeId, pointerlockChangeEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target,
    eventTypeString,
    callbackfunc,
    handlerFunc: pointerlockChangeEventHandlerFunc,
    useCapture
  };
  return JSEvents.registerOrRemoveHandler(eventHandler);
};


/** @suppress {missingProperties} */
var _emscripten_set_pointerlockchange_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => {
  // TODO: Currently not supported in pthreads or in --proxy-to-worker mode. (In pthreads mode, document object is not defined)
  if (!document || !document.body || (!document.body.requestPointerLock && !document.body.mozRequestPointerLock && !document.body.webkitRequestPointerLock && !document.body.msRequestPointerLock)) {
    return -1;
  }

  target = findEventTarget(target);
  if (!target) return -4;
  registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "mozpointerlockchange", targetThread);
  registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "webkitpointerlockchange", targetThread);
  registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "mspointerlockchange", targetThread);
  return registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "pointerlockchange", targetThread);
};




var registerUiEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
  if (!JSEvents.uiEvent) JSEvents.uiEvent = _malloc(36);

  target = findEventTarget(target);

  var uiEventHandlerFunc = (e = event) => {
    if (e.target != target) {
      // Never take ui events such as scroll via a 'bubbled' route, but always from the direct element that
      // was targeted. Otherwise e.g. if app logs a message in response to a page scroll, the Emscripten log
      // message box could cause to scroll, generating a new (bubbled) scroll message, causing a new log print,
      // causing a new scroll, etc..
      return;
    }
    var b = document.body; // Take document.body to a variable, Closure compiler does not outline access to it on its own.
    if (!b) {
      // During a page unload 'body' can be null, with "Cannot read property 'clientWidth' of null" being thrown
      return;
    }
    var uiEvent = JSEvents.uiEvent;
    HEAP32[((uiEvent) >> 2)] = e.detail;
    HEAP32[(((uiEvent) + (4)) >> 2)] = b.clientWidth;
    HEAP32[(((uiEvent) + (8)) >> 2)] = b.clientHeight;
    HEAP32[(((uiEvent) + (12)) >> 2)] = innerWidth;
    HEAP32[(((uiEvent) + (16)) >> 2)] = innerHeight;
    HEAP32[(((uiEvent) + (20)) >> 2)] = outerWidth;
    HEAP32[(((uiEvent) + (24)) >> 2)] = outerHeight;
    HEAP32[(((uiEvent) + (28)) >> 2)] = pageXOffset;
    HEAP32[(((uiEvent) + (32)) >> 2)] = pageYOffset;
    if (getWasmTableEntry(callbackfunc)(eventTypeId, uiEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target,
    eventTypeString,
    callbackfunc,
    handlerFunc: uiEventHandlerFunc,
    useCapture
  };
  return JSEvents.registerOrRemoveHandler(eventHandler);
};
var _emscripten_set_resize_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
  registerUiEventCallback(target, userData, useCapture, callbackfunc, 10, "resize", targetThread);





var registerTouchEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
  if (!JSEvents.touchEvent) JSEvents.touchEvent = _malloc(1696);

  target = findEventTarget(target);

  var touchEventHandlerFunc = (e) => {
    assert(e);
    var t, touches = {}, et = e.touches;
    // To ease marshalling different kinds of touches that browser reports (all touches are listed in e.touches,
    // only changed touches in e.changedTouches, and touches on target at a.targetTouches), mark a boolean in
    // each Touch object so that we can later loop only once over all touches we see to marshall over to Wasm.

    for (var i = 0; i < et.length; ++i) {
      t = et[i];
      // Browser might recycle the generated Touch objects between each frame (Firefox on Android), so reset any
      // changed/target states we may have set from previous frame.
      t.isChanged = t.onTarget = 0;
      touches[t.identifier] = t;
    }
    // Mark which touches are part of the changedTouches list.
    for (var i = 0; i < e.changedTouches.length; ++i) {
      t = e.changedTouches[i];
      t.isChanged = 1;
      touches[t.identifier] = t;
    }
    // Mark which touches are part of the targetTouches list.
    for (var i = 0; i < e.targetTouches.length; ++i) {
      touches[e.targetTouches[i].identifier].onTarget = 1;
    }

    var touchEvent = JSEvents.touchEvent;
    HEAPF64[((touchEvent) >> 3)] = e.timeStamp;
    var idx = ((touchEvent) >> 2);// Pre-shift the ptr to index to HEAP32 to save code size
    HEAP32[idx + 3] = e.ctrlKey;
    HEAP32[idx + 4] = e.shiftKey;
    HEAP32[idx + 5] = e.altKey;
    HEAP32[idx + 6] = e.metaKey;
    idx += 7; // Advance to the start of the touch array.
    var targetRect = getBoundingClientRect(target);
    var numTouches = 0;
    for (var i in touches) {
      t = touches[i];
      HEAP32[idx + 0] = t.identifier;
      HEAP32[idx + 1] = t.screenX;
      HEAP32[idx + 2] = t.screenY;
      HEAP32[idx + 3] = t.clientX;
      HEAP32[idx + 4] = t.clientY;
      HEAP32[idx + 5] = t.pageX;
      HEAP32[idx + 6] = t.pageY;
      HEAP32[idx + 7] = t.isChanged;
      HEAP32[idx + 8] = t.onTarget;
      HEAP32[idx + 9] = t.clientX - targetRect.left;
      HEAP32[idx + 10] = t.clientY - targetRect.top;

      idx += 13;

      if (++numTouches > 31) {
        break;
      }
    }
    HEAP32[(((touchEvent) + (8)) >> 2)] = numTouches;

    if (getWasmTableEntry(callbackfunc)(eventTypeId, touchEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target,
    allowsDeferredCalls: eventTypeString == 'touchstart' || eventTypeString == 'touchend',
    eventTypeString,
    callbackfunc,
    handlerFunc: touchEventHandlerFunc,
    useCapture
  };
  return JSEvents.registerOrRemoveHandler(eventHandler);
};
var _emscripten_set_touchcancel_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
  registerTouchEventCallback(target, userData, useCapture, callbackfunc, 25, "touchcancel", targetThread);

var _emscripten_set_touchend_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
  registerTouchEventCallback(target, userData, useCapture, callbackfunc, 23, "touchend", targetThread);

var _emscripten_set_touchmove_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
  registerTouchEventCallback(target, userData, useCapture, callbackfunc, 24, "touchmove", targetThread);

var _emscripten_set_touchstart_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
  registerTouchEventCallback(target, userData, useCapture, callbackfunc, 22, "touchstart", targetThread);


var fillVisibilityChangeEventData = (eventStruct) => {
  var visibilityStates = ["hidden", "visible", "prerender", "unloaded"];
  var visibilityState = visibilityStates.indexOf(document.visibilityState);

  // Assigning a boolean to HEAP32 with expected type coercion.
  /** @suppress{checkTypes} */
  HEAP32[((eventStruct) >> 2)] = document.hidden;
  HEAP32[(((eventStruct) + (4)) >> 2)] = visibilityState;
};



var registerVisibilityChangeEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
  if (!JSEvents.visibilityChangeEvent) JSEvents.visibilityChangeEvent = _malloc(8);

  var visibilityChangeEventHandlerFunc = (e = event) => {
    var visibilityChangeEvent = JSEvents.visibilityChangeEvent;

    fillVisibilityChangeEventData(visibilityChangeEvent);

    if (getWasmTableEntry(callbackfunc)(eventTypeId, visibilityChangeEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target,
    eventTypeString,
    callbackfunc,
    handlerFunc: visibilityChangeEventHandlerFunc,
    useCapture
  };
  return JSEvents.registerOrRemoveHandler(eventHandler);
};

var _emscripten_set_visibilitychange_callback_on_thread = (userData, useCapture, callbackfunc, targetThread) => {
  if (!specialHTMLTargets[1]) {
    return -4;
  }
  return registerVisibilityChangeEventCallback(specialHTMLTargets[1], userData, useCapture, callbackfunc, 21, "visibilitychange", targetThread);
};






var registerWheelEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
  if (!JSEvents.wheelEvent) JSEvents.wheelEvent = _malloc(104);

  // The DOM Level 3 events spec event 'wheel'
  var wheelHandlerFunc = (e = event) => {
    var wheelEvent = JSEvents.wheelEvent;
    fillMouseEventData(wheelEvent, e, target);
    HEAPF64[(((wheelEvent) + (72)) >> 3)] = e["deltaX"];
    HEAPF64[(((wheelEvent) + (80)) >> 3)] = e["deltaY"];
    HEAPF64[(((wheelEvent) + (88)) >> 3)] = e["deltaZ"];
    HEAP32[(((wheelEvent) + (96)) >> 2)] = e["deltaMode"];
    if (getWasmTableEntry(callbackfunc)(eventTypeId, wheelEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target,
    allowsDeferredCalls: true,
    eventTypeString,
    callbackfunc,
    handlerFunc: wheelHandlerFunc,
    useCapture
  };
  return JSEvents.registerOrRemoveHandler(eventHandler);
};

var _emscripten_set_wheel_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => {
  target = findEventTarget(target);
  if (!target) return -4;
  if (typeof target.onwheel != 'undefined') {
    return registerWheelEventCallback(target, userData, useCapture, callbackfunc, 9, "wheel", targetThread);
  } else {
    return -1;
  }
};


var _emscripten_set_window_title = (title) => document.title = UTF8ToString(title);

var _emscripten_sleep = () => {
  throw 'Please compile your program with async support in order to use asynchronous operations like emscripten_sleep';
};



var emscripten_webgl_power_preferences = ['default', 'low-power', 'high-performance'];



/** @suppress {duplicate } */
var _emscripten_webgl_do_create_context = (target, attributes) => {
  assert(attributes);
  var a = attributes >> 2;
  var powerPreference = HEAP32[a + (24 >> 2)];
  var contextAttributes = {
    'alpha': !!HEAP32[a + (0 >> 2)],
    'depth': !!HEAP32[a + (4 >> 2)],
    'stencil': !!HEAP32[a + (8 >> 2)],
    'antialias': !!HEAP32[a + (12 >> 2)],
    'premultipliedAlpha': !!HEAP32[a + (16 >> 2)],
    'preserveDrawingBuffer': !!HEAP32[a + (20 >> 2)],
    'powerPreference': emscripten_webgl_power_preferences[powerPreference],
    'failIfMajorPerformanceCaveat': !!HEAP32[a + (28 >> 2)],
    // The following are not predefined WebGL context attributes in the WebGL specification, so the property names can be minified by Closure.
    majorVersion: HEAP32[a + (32 >> 2)],
    minorVersion: HEAP32[a + (36 >> 2)],
    enableExtensionsByDefault: HEAP32[a + (40 >> 2)],
    explicitSwapControl: HEAP32[a + (44 >> 2)],
    proxyContextToMainThread: HEAP32[a + (48 >> 2)],
    renderViaOffscreenBackBuffer: HEAP32[a + (52 >> 2)]
  };

  var canvas = findCanvasEventTarget(target);

  if (!canvas) {
    return 0;
  }

  if (contextAttributes.explicitSwapControl) {
    return 0;
  }

  var contextHandle = GL.createContext(canvas, contextAttributes);
  return contextHandle;
};
var _emscripten_webgl_create_context = _emscripten_webgl_do_create_context;


var _emscripten_webgl_destroy_context = (contextHandle) => {
  if (GL.currentContext == contextHandle) GL.currentContext = 0;
  GL.deleteContext(contextHandle);
};








var _emscripten_webgl_enable_extension = (contextHandle, extension) => {
  var context = GL.getContext(contextHandle);
  var extString = UTF8ToString(extension);
  if (extString.startsWith('GL_')) extString = extString.substr(3); // Allow enabling extensions both with "GL_" prefix and without.

  // Switch-board that pulls in code for all GL extensions, even if those are not used :/
  // Build with -sGL_SUPPORT_SIMPLE_ENABLE_EXTENSIONS=0 to avoid this.

  // Obtain function entry points to WebGL 1 extension related functions.
  if (extString == 'ANGLE_instanced_arrays') webgl_enable_ANGLE_instanced_arrays(GLctx);
  if (extString == 'OES_vertex_array_object') webgl_enable_OES_vertex_array_object(GLctx);
  if (extString == 'WEBGL_draw_buffers') webgl_enable_WEBGL_draw_buffers(GLctx);

  if (extString == 'WEBGL_draw_instanced_base_vertex_base_instance') webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance(GLctx);
  if (extString == 'WEBGL_multi_draw_instanced_base_vertex_base_instance') webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance(GLctx);

  if (extString == 'WEBGL_multi_draw') webgl_enable_WEBGL_multi_draw(GLctx);

  var ext = context.GLctx.getExtension(extString);
  return !!ext;
};


var _emscripten_webgl_get_context_attributes = (c, a) => {
  if (!a) return -5;
  c = GL.contexts[c];
  if (!c) return -3;
  var t = c.GLctx;
  if (!t) return -3;
  t = t.getContextAttributes();

  HEAP32[((a) >> 2)] = t.alpha;
  HEAP32[(((a) + (4)) >> 2)] = t.depth;
  HEAP32[(((a) + (8)) >> 2)] = t.stencil;
  HEAP32[(((a) + (12)) >> 2)] = t.antialias;
  HEAP32[(((a) + (16)) >> 2)] = t.premultipliedAlpha;
  HEAP32[(((a) + (20)) >> 2)] = t.preserveDrawingBuffer;
  var power = t['powerPreference'] && emscripten_webgl_power_preferences.indexOf(t['powerPreference']);
  HEAP32[(((a) + (24)) >> 2)] = power;
  HEAP32[(((a) + (28)) >> 2)] = t.failIfMajorPerformanceCaveat;
  HEAP32[(((a) + (32)) >> 2)] = c.version;
  HEAP32[(((a) + (36)) >> 2)] = 0;
  HEAP32[(((a) + (40)) >> 2)] = c.attributes.enableExtensionsByDefault;
  return 0;
};


/** @suppress {duplicate } */
var _emscripten_webgl_do_get_current_context = () => GL.currentContext ? GL.currentContext.handle : 0;
var _emscripten_webgl_get_current_context = _emscripten_webgl_do_get_current_context;

var _emscripten_webgl_init_context_attributes = (attributes) => {
  assert(attributes);
  var a = attributes >> 2;
  for (var i = 0; i < (56 >> 2); ++i) {
    HEAP32[a + i] = 0;
  }

  HEAP32[a + (0 >> 2)] =
    HEAP32[a + (4 >> 2)] =
    HEAP32[a + (12 >> 2)] =
    HEAP32[a + (16 >> 2)] =
    HEAP32[a + (32 >> 2)] =
    HEAP32[a + (40 >> 2)] = 1;

};

var _emscripten_webgl_make_context_current = (contextHandle) => {
  var success = GL.makeContextCurrent(contextHandle);
  return success ? 0 : -5;
};

var ENV = {
};

var getExecutableName = () => {
  return thisProgram || './this.program';
};
var getEnvStrings = () => {
  if (!getEnvStrings.strings) {
    // Default values.
    // Browser language detection #8751
    var lang = ((typeof navigator == 'object' && navigator.languages && navigator.languages[0]) || 'C').replace('-', '_') + '.UTF-8';
    var env = {
      'USER': 'web_user',
      'LOGNAME': 'web_user',
      'PATH': '/',
      'PWD': '/',
      'HOME': '/home/web_user',
      'LANG': lang,
      '_': getExecutableName()
    };
    // Apply the user-provided values, if any.
    for (var x in ENV) {
      // x is a key in ENV; if ENV[x] is undefined, that means it was
      // explicitly set to be so. We allow user code to do that to
      // force variables with default values to remain unset.
      if (ENV[x] === undefined) delete env[x];
      else env[x] = ENV[x];
    }
    var strings = [];
    for (var x in env) {
      strings.push(`${x}=${env[x]}`);
    }
    getEnvStrings.strings = strings;
  }
  return getEnvStrings.strings;
};

var stringToAscii = (str, buffer) => {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === (str.charCodeAt(i) & 0xff));
    HEAP8[((buffer++) >> 0)] = str.charCodeAt(i);
  }
  // Null-terminate the string
  HEAP8[((buffer) >> 0)] = 0;
};

var _environ_get = (__environ, environ_buf) => {
  var bufSize = 0;
  getEnvStrings().forEach((string, i) => {
    var ptr = environ_buf + bufSize;
    HEAPU32[(((__environ) + (i * 4)) >> 2)] = ptr;
    stringToAscii(string, ptr);
    bufSize += string.length + 1;
  });
  return 0;
};


var _environ_sizes_get = (penviron_count, penviron_buf_size) => {
  var strings = getEnvStrings();
  HEAPU32[((penviron_count) >> 2)] = strings.length;
  var bufSize = 0;
  strings.forEach((string) => bufSize += string.length + 1);
  HEAPU32[((penviron_buf_size) >> 2)] = bufSize;
  return 0;
};


function _fd_close(fd) {
  try {

    var stream = SYSCALLS.getStreamFromFD(fd);
    FS.close(stream);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
}

function _fd_fdstat_get(fd, pbuf) {
  try {

    var rightsBase = 0;
    var rightsInheriting = 0;
    var flags = 0;
    {
      var stream = SYSCALLS.getStreamFromFD(fd);
      // All character devices are terminals (other things a Linux system would
      // assume is a character device, like the mouse, we have special APIs for).
      var type = stream.tty ? 2 :
        FS.isDir(stream.mode) ? 3 :
          FS.isLink(stream.mode) ? 7 :
            4;
    }
    HEAP8[((pbuf) >> 0)] = type;
    HEAP16[(((pbuf) + (2)) >> 1)] = flags;
    (tempI64 = [rightsBase >>> 0, (tempDouble = rightsBase, (+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble) / 4294967296.0))) >>> 0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble))) >>> 0)) / 4294967296.0))))) >>> 0) : 0)], HEAP32[(((pbuf) + (8)) >> 2)] = tempI64[0], HEAP32[(((pbuf) + (12)) >> 2)] = tempI64[1]);
    (tempI64 = [rightsInheriting >>> 0, (tempDouble = rightsInheriting, (+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble) / 4294967296.0))) >>> 0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble))) >>> 0)) / 4294967296.0))))) >>> 0) : 0)], HEAP32[(((pbuf) + (16)) >> 2)] = tempI64[0], HEAP32[(((pbuf) + (20)) >> 2)] = tempI64[1]);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
}

/** @param {number=} offset */
var doReadv = (stream, iov, iovcnt, offset) => {
  var ret = 0;
  for (var i = 0; i < iovcnt; i++) {
    var ptr = HEAPU32[((iov) >> 2)];
    var len = HEAPU32[(((iov) + (4)) >> 2)];
    iov += 8;
    var curr = FS.read(stream, HEAP8, ptr, len, offset);
    if (curr < 0) return -1;
    ret += curr;
    if (curr < len) break; // nothing more to read
    if (typeof offset !== 'undefined') {
      offset += curr;
    }
  }
  return ret;
};


function _fd_pread(fd, iov, iovcnt, offset_low, offset_high, pnum) {
  var offset = convertI32PairToI53Checked(offset_low, offset_high);;


  try {

    if (isNaN(offset)) return 61;
    var stream = SYSCALLS.getStreamFromFD(fd)
    var num = doReadv(stream, iov, iovcnt, offset);
    HEAPU32[((pnum) >> 2)] = num;
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  ;
}

/** @param {number=} offset */
var doWritev = (stream, iov, iovcnt, offset) => {
  var ret = 0;
  for (var i = 0; i < iovcnt; i++) {
    var ptr = HEAPU32[((iov) >> 2)];
    var len = HEAPU32[(((iov) + (4)) >> 2)];
    iov += 8;
    var curr = FS.write(stream, HEAP8, ptr, len, offset);
    if (curr < 0) return -1;
    ret += curr;
    if (typeof offset !== 'undefined') {
      offset += curr;
    }
  }
  return ret;
};


function _fd_pwrite(fd, iov, iovcnt, offset_low, offset_high, pnum) {
  var offset = convertI32PairToI53Checked(offset_low, offset_high);;


  try {

    if (isNaN(offset)) return 61;
    var stream = SYSCALLS.getStreamFromFD(fd)
    var num = doWritev(stream, iov, iovcnt, offset);
    HEAPU32[((pnum) >> 2)] = num;
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  ;
}


function _fd_read(fd, iov, iovcnt, pnum) {
  try {

    var stream = SYSCALLS.getStreamFromFD(fd);
    var num = doReadv(stream, iov, iovcnt);
    HEAPU32[((pnum) >> 2)] = num;
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
}


function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
  var offset = convertI32PairToI53Checked(offset_low, offset_high);;


  try {

    if (isNaN(offset)) return 61;
    var stream = SYSCALLS.getStreamFromFD(fd);
    FS.llseek(stream, offset, whence);
    (tempI64 = [stream.position >>> 0, (tempDouble = stream.position, (+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble) / 4294967296.0))) >>> 0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble))) >>> 0)) / 4294967296.0))))) >>> 0) : 0)], HEAP32[((newOffset) >> 2)] = tempI64[0], HEAP32[(((newOffset) + (4)) >> 2)] = tempI64[1]);
    if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  ;
}

function _fd_sync(fd) {
  try {

    var stream = SYSCALLS.getStreamFromFD(fd);
    if (stream.stream_ops?.fsync) {
      return stream.stream_ops.fsync(stream);
    }
    return 0; // we can't do anything synchronously; the in-memory FS is already synced to
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
}


function _fd_write(fd, iov, iovcnt, pnum) {
  try {

    var stream = SYSCALLS.getStreamFromFD(fd);
    var num = doWritev(stream, iov, iovcnt);
    HEAPU32[((pnum) >> 2)] = num;
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
}

var _getentropy = (buffer, size) => {
  randomFill(HEAPU8.subarray(buffer, buffer + size));
  return 0;
};




var getHostByName = (name) => {
  // generate hostent
  var ret = _malloc(20); // XXX possibly leaked, as are others here
  var nameBuf = stringToNewUTF8(name);
  HEAPU32[((ret) >> 2)] = nameBuf;
  var aliasesBuf = _malloc(4);
  HEAPU32[((aliasesBuf) >> 2)] = 0;
  HEAPU32[(((ret) + (4)) >> 2)] = aliasesBuf;
  var afinet = 2;
  HEAP32[(((ret) + (8)) >> 2)] = afinet;
  HEAP32[(((ret) + (12)) >> 2)] = 4;
  var addrListBuf = _malloc(12);
  HEAPU32[((addrListBuf) >> 2)] = addrListBuf + 8;
  HEAPU32[(((addrListBuf) + (4)) >> 2)] = 0;
  HEAP32[(((addrListBuf) + (8)) >> 2)] = inetPton4(DNS.lookup_name(name));
  HEAPU32[(((ret) + (16)) >> 2)] = addrListBuf;
  return ret;
};

var _gethostbyname = (name) => getHostByName(UTF8ToString(name));

















function _glClearDepth(x0) { GLctx.clearDepth(x0) }



























































var _glPointSize = (size) => {
  GLEmulation.pointSize = size;
};

/** @type {function(...*):?} */
function _glPopAttrib(
) {
  abort('missing function: glPopAttrib');
}
_glPopAttrib.stub = true;

/** @type {function(...*):?} */
function _glPushAttrib(
) {
  abort('missing function: glPushAttrib');
}
_glPushAttrib.stub = true;


























var _llvm_eh_typeid_for = (type) => type;



var arraySum = (array, index) => {
  var sum = 0;
  for (var i = 0; i <= index; sum += array[i++]) {
    // no-op
  }
  return sum;
};


var MONTH_DAYS_LEAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

var MONTH_DAYS_REGULAR = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var addDays = (date, days) => {
  var newDate = new Date(date.getTime());
  while (days > 0) {
    var leap = isLeapYear(newDate.getFullYear());
    var currentMonth = newDate.getMonth();
    var daysInCurrentMonth = (leap ? MONTH_DAYS_LEAP : MONTH_DAYS_REGULAR)[currentMonth];

    if (days > daysInCurrentMonth - newDate.getDate()) {
      // we spill over to next month
      days -= (daysInCurrentMonth - newDate.getDate() + 1);
      newDate.setDate(1);
      if (currentMonth < 11) {
        newDate.setMonth(currentMonth + 1)
      } else {
        newDate.setMonth(0);
        newDate.setFullYear(newDate.getFullYear() + 1);
      }
    } else {
      // we stay in current month
      newDate.setDate(newDate.getDate() + days);
      return newDate;
    }
  }

  return newDate;
};




var writeArrayToMemory = (array, buffer) => {
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
};

var _strftime = (s, maxsize, format, tm) => {
  // size_t strftime(char *restrict s, size_t maxsize, const char *restrict format, const struct tm *restrict timeptr);
  // http://pubs.opengroup.org/onlinepubs/009695399/functions/strftime.html

  var tm_zone = HEAPU32[(((tm) + (40)) >> 2)];

  var date = {
    tm_sec: HEAP32[((tm) >> 2)],
    tm_min: HEAP32[(((tm) + (4)) >> 2)],
    tm_hour: HEAP32[(((tm) + (8)) >> 2)],
    tm_mday: HEAP32[(((tm) + (12)) >> 2)],
    tm_mon: HEAP32[(((tm) + (16)) >> 2)],
    tm_year: HEAP32[(((tm) + (20)) >> 2)],
    tm_wday: HEAP32[(((tm) + (24)) >> 2)],
    tm_yday: HEAP32[(((tm) + (28)) >> 2)],
    tm_isdst: HEAP32[(((tm) + (32)) >> 2)],
    tm_gmtoff: HEAP32[(((tm) + (36)) >> 2)],
    tm_zone: tm_zone ? UTF8ToString(tm_zone) : ''
  };


  var pattern = UTF8ToString(format);

  // expand format
  var EXPANSION_RULES_1 = {
    '%c': '%a %b %d %H:%M:%S %Y',     // Replaced by the locale's appropriate date and time representation - e.g., Mon Aug  3 14:02:01 2013
    '%D': '%m/%d/%y',                 // Equivalent to %m / %d / %y
    '%F': '%Y-%m-%d',                 // Equivalent to %Y - %m - %d
    '%h': '%b',                       // Equivalent to %b
    '%r': '%I:%M:%S %p',              // Replaced by the time in a.m. and p.m. notation
    '%R': '%H:%M',                    // Replaced by the time in 24-hour notation
    '%T': '%H:%M:%S',                 // Replaced by the time
    '%x': '%m/%d/%y',                 // Replaced by the locale's appropriate date representation
    '%X': '%H:%M:%S',                 // Replaced by the locale's appropriate time representation
    // Modified Conversion Specifiers
    '%Ec': '%c',                      // Replaced by the locale's alternative appropriate date and time representation.
    '%EC': '%C',                      // Replaced by the name of the base year (period) in the locale's alternative representation.
    '%Ex': '%m/%d/%y',                // Replaced by the locale's alternative date representation.
    '%EX': '%H:%M:%S',                // Replaced by the locale's alternative time representation.
    '%Ey': '%y',                      // Replaced by the offset from %EC (year only) in the locale's alternative representation.
    '%EY': '%Y',                      // Replaced by the full alternative year representation.
    '%Od': '%d',                      // Replaced by the day of the month, using the locale's alternative numeric symbols, filled as needed with leading zeros if there is any alternative symbol for zero; otherwise, with leading <space> characters.
    '%Oe': '%e',                      // Replaced by the day of the month, using the locale's alternative numeric symbols, filled as needed with leading <space> characters.
    '%OH': '%H',                      // Replaced by the hour (24-hour clock) using the locale's alternative numeric symbols.
    '%OI': '%I',                      // Replaced by the hour (12-hour clock) using the locale's alternative numeric symbols.
    '%Om': '%m',                      // Replaced by the month using the locale's alternative numeric symbols.
    '%OM': '%M',                      // Replaced by the minutes using the locale's alternative numeric symbols.
    '%OS': '%S',                      // Replaced by the seconds using the locale's alternative numeric symbols.
    '%Ou': '%u',                      // Replaced by the weekday as a number in the locale's alternative representation (Monday=1).
    '%OU': '%U',                      // Replaced by the week number of the year (Sunday as the first day of the week, rules corresponding to %U ) using the locale's alternative numeric symbols.
    '%OV': '%V',                      // Replaced by the week number of the year (Monday as the first day of the week, rules corresponding to %V ) using the locale's alternative numeric symbols.
    '%Ow': '%w',                      // Replaced by the number of the weekday (Sunday=0) using the locale's alternative numeric symbols.
    '%OW': '%W',                      // Replaced by the week number of the year (Monday as the first day of the week) using the locale's alternative numeric symbols.
    '%Oy': '%y',                      // Replaced by the year (offset from %C ) using the locale's alternative numeric symbols.
  };
  for (var rule in EXPANSION_RULES_1) {
    pattern = pattern.replace(new RegExp(rule, 'g'), EXPANSION_RULES_1[rule]);
  }

  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function leadingSomething(value, digits, character) {
    var str = typeof value == 'number' ? value.toString() : (value || '');
    while (str.length < digits) {
      str = character[0] + str;
    }
    return str;
  }

  function leadingNulls(value, digits) {
    return leadingSomething(value, digits, '0');
  }

  function compareByDay(date1, date2) {
    function sgn(value) {
      return value < 0 ? -1 : (value > 0 ? 1 : 0);
    }

    var compare;
    if ((compare = sgn(date1.getFullYear() - date2.getFullYear())) === 0) {
      if ((compare = sgn(date1.getMonth() - date2.getMonth())) === 0) {
        compare = sgn(date1.getDate() - date2.getDate());
      }
    }
    return compare;
  }

  function getFirstWeekStartDate(janFourth) {
    switch (janFourth.getDay()) {
      case 0: // Sunday
        return new Date(janFourth.getFullYear() - 1, 11, 29);
      case 1: // Monday
        return janFourth;
      case 2: // Tuesday
        return new Date(janFourth.getFullYear(), 0, 3);
      case 3: // Wednesday
        return new Date(janFourth.getFullYear(), 0, 2);
      case 4: // Thursday
        return new Date(janFourth.getFullYear(), 0, 1);
      case 5: // Friday
        return new Date(janFourth.getFullYear() - 1, 11, 31);
      case 6: // Saturday
        return new Date(janFourth.getFullYear() - 1, 11, 30);
    }
  }

  function getWeekBasedYear(date) {
    var thisDate = addDays(new Date(date.tm_year + 1900, 0, 1), date.tm_yday);

    var janFourthThisYear = new Date(thisDate.getFullYear(), 0, 4);
    var janFourthNextYear = new Date(thisDate.getFullYear() + 1, 0, 4);

    var firstWeekStartThisYear = getFirstWeekStartDate(janFourthThisYear);
    var firstWeekStartNextYear = getFirstWeekStartDate(janFourthNextYear);

    if (compareByDay(firstWeekStartThisYear, thisDate) <= 0) {
      // this date is after the start of the first week of this year
      if (compareByDay(firstWeekStartNextYear, thisDate) <= 0) {
        return thisDate.getFullYear() + 1;
      }
      return thisDate.getFullYear();
    }
    return thisDate.getFullYear() - 1;
  }

  var EXPANSION_RULES_2 = {
    '%a': (date) => WEEKDAYS[date.tm_wday].substring(0, 3),
    '%A': (date) => WEEKDAYS[date.tm_wday],
    '%b': (date) => MONTHS[date.tm_mon].substring(0, 3),
    '%B': (date) => MONTHS[date.tm_mon],
    '%C': (date) => {
      var year = date.tm_year + 1900;
      return leadingNulls((year / 100) | 0, 2);
    },
    '%d': (date) => leadingNulls(date.tm_mday, 2),
    '%e': (date) => leadingSomething(date.tm_mday, 2, ' '),
    '%g': (date) => {
      // %g, %G, and %V give values according to the ISO 8601:2000 standard week-based year.
      // In this system, weeks begin on a Monday and week 1 of the year is the week that includes
      // January 4th, which is also the week that includes the first Thursday of the year, and
      // is also the first week that contains at least four days in the year.
      // If the first Monday of January is the 2nd, 3rd, or 4th, the preceding days are part of
      // the last week of the preceding year; thus, for Saturday 2nd January 1999,
      // %G is replaced by 1998 and %V is replaced by 53. If December 29th, 30th,
      // or 31st is a Monday, it and any following days are part of week 1 of the following year.
      // Thus, for Tuesday 30th December 1997, %G is replaced by 1998 and %V is replaced by 01.

      return getWeekBasedYear(date).toString().substring(2);
    },
    '%G': (date) => getWeekBasedYear(date),
    '%H': (date) => leadingNulls(date.tm_hour, 2),
    '%I': (date) => {
      var twelveHour = date.tm_hour;
      if (twelveHour == 0) twelveHour = 12;
      else if (twelveHour > 12) twelveHour -= 12;
      return leadingNulls(twelveHour, 2);
    },
    '%j': (date) => {
      // Day of the year (001-366)
      return leadingNulls(date.tm_mday + arraySum(isLeapYear(date.tm_year + 1900) ? MONTH_DAYS_LEAP : MONTH_DAYS_REGULAR, date.tm_mon - 1), 3);
    },
    '%m': (date) => leadingNulls(date.tm_mon + 1, 2),
    '%M': (date) => leadingNulls(date.tm_min, 2),
    '%n': () => '\n',
    '%p': (date) => {
      if (date.tm_hour >= 0 && date.tm_hour < 12) {
        return 'AM';
      }
      return 'PM';
    },
    '%S': (date) => leadingNulls(date.tm_sec, 2),
    '%t': () => '\t',
    '%u': (date) => date.tm_wday || 7,
    '%U': (date) => {
      var days = date.tm_yday + 7 - date.tm_wday;
      return leadingNulls(Math.floor(days / 7), 2);
    },
    '%V': (date) => {
      // Replaced by the week number of the year (Monday as the first day of the week)
      // as a decimal number [01,53]. If the week containing 1 January has four
      // or more days in the new year, then it is considered week 1.
      // Otherwise, it is the last week of the previous year, and the next week is week 1.
      // Both January 4th and the first Thursday of January are always in week 1. [ tm_year, tm_wday, tm_yday]
      var val = Math.floor((date.tm_yday + 7 - (date.tm_wday + 6) % 7) / 7);
      // If 1 Jan is just 1-3 days past Monday, the previous week
      // is also in this year.
      if ((date.tm_wday + 371 - date.tm_yday - 2) % 7 <= 2) {
        val++;
      }
      if (!val) {
        val = 52;
        // If 31 December of prev year a Thursday, or Friday of a
        // leap year, then the prev year has 53 weeks.
        var dec31 = (date.tm_wday + 7 - date.tm_yday - 1) % 7;
        if (dec31 == 4 || (dec31 == 5 && isLeapYear(date.tm_year % 400 - 1))) {
          val++;
        }
      } else if (val == 53) {
        // If 1 January is not a Thursday, and not a Wednesday of a
        // leap year, then this year has only 52 weeks.
        var jan1 = (date.tm_wday + 371 - date.tm_yday) % 7;
        if (jan1 != 4 && (jan1 != 3 || !isLeapYear(date.tm_year)))
          val = 1;
      }
      return leadingNulls(val, 2);
    },
    '%w': (date) => date.tm_wday,
    '%W': (date) => {
      var days = date.tm_yday + 7 - ((date.tm_wday + 6) % 7);
      return leadingNulls(Math.floor(days / 7), 2);
    },
    '%y': (date) => {
      // Replaced by the last two digits of the year as a decimal number [00,99]. [ tm_year]
      return (date.tm_year + 1900).toString().substring(2);
    },
    // Replaced by the year as a decimal number (for example, 1997). [ tm_year]
    '%Y': (date) => date.tm_year + 1900,
    '%z': (date) => {
      // Replaced by the offset from UTC in the ISO 8601:2000 standard format ( +hhmm or -hhmm ).
      // For example, "-0430" means 4 hours 30 minutes behind UTC (west of Greenwich).
      var off = date.tm_gmtoff;
      var ahead = off >= 0;
      off = Math.abs(off) / 60;
      // convert from minutes into hhmm format (which means 60 minutes = 100 units)
      off = (off / 60) * 100 + (off % 60);
      return (ahead ? '+' : '-') + String("0000" + off).slice(-4);
    },
    '%Z': (date) => date.tm_zone,
    '%%': () => '%'
  };

  // Replace %% with a pair of NULLs (which cannot occur in a C string), then
  // re-inject them after processing.
  pattern = pattern.replace(/%%/g, '\0\0')
  for (var rule in EXPANSION_RULES_2) {
    if (pattern.includes(rule)) {
      pattern = pattern.replace(new RegExp(rule, 'g'), EXPANSION_RULES_2[rule](date));
    }
  }
  pattern = pattern.replace(/\0\0/g, '%')

  var bytes = intArrayFromString(pattern, false);
  if (bytes.length > maxsize) {
    return 0;
  }

  writeArrayToMemory(bytes, s);
  return bytes.length - 1;
};

var _strftime_l = (s, maxsize, format, tm, loc) => {
  return _strftime(s, maxsize, format, tm); // no locale support yet
};


var _system = (command) => {
  if (ENVIRONMENT_IS_NODE) {
    if (!command) return 1; // shell is available

    var cmdstr = UTF8ToString(command);
    if (!cmdstr.length) return 0; // this is what glibc seems to do (shell works test?)

    var cp = require('child_process');
    var ret = cp.spawnSync(cmdstr, [], { shell: true, stdio: 'inherit' });

    var _W_EXITCODE = (ret, sig) => ((ret) << 8 | (sig));

    // this really only can happen if process is killed by signal
    if (ret.status === null) {
      // sadly node doesn't expose such function
      var signalToNumber = (sig) => {
        // implement only the most common ones, and fallback to SIGINT
        switch (sig) {
          case 'SIGHUP': return 1;
          case 'SIGINT': return 2;
          case 'SIGQUIT': return 3;
          case 'SIGFPE': return 8;
          case 'SIGKILL': return 9;
          case 'SIGALRM': return 14;
          case 'SIGTERM': return 15;
        }
        return 2; // SIGINT
      }
      return _W_EXITCODE(0, signalToNumber(ret.signal));
    }

    return _W_EXITCODE(ret.status, 0);
  }
  // int system(const char *command);
  // http://pubs.opengroup.org/onlinepubs/000095399/functions/system.html
  // Can't call external programs.
  if (!command) return 0; // no shell available
  setErrNo(52);
  return -1;
};







var getCFunc = (ident) => {
  var func = Module['_' + ident]; // closure exported function
  assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
  return func;
};





/**
 * @param {string|null=} returnType
 * @param {Array=} argTypes
 * @param {Arguments|Array=} args
 * @param {Object=} opts
 */
var ccall = (ident, returnType, argTypes, args, opts) => {
  // For fast lookup of conversion functions
  var toC = {
    'string': (str) => {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        ret = stringToUTF8OnStack(str);
      }
      return ret;
    },
    'array': (arr) => {
      var ret = stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    }
  };

  function convertReturnValue(ret) {
    if (returnType === 'string') {

      return UTF8ToString(ret);
    }
    if (returnType === 'boolean') return Boolean(ret);
    return ret;
  }

  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  assert(returnType !== 'array', 'Return type should not be "array".');
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func.apply(null, cArgs);
  function onDone(ret) {
    if (stack !== 0) stackRestore(stack);
    return convertReturnValue(ret);
  }

  ret = onDone(ret);
  return ret;
};

/**
 * @param {string=} returnType
 * @param {Array=} argTypes
 * @param {Object=} opts
 */
var cwrap = (ident, returnType, argTypes, opts) => {
  return function () {
    return ccall(ident, returnType, argTypes, arguments, opts);
  }
};



var FS_unlink = (path) => FS.unlink(path);

var FSNode = /** @constructor */ function (parent, name, mode, rdev) {
  if (!parent) {
    parent = this;  // root node sets parent to itself
  }
  this.parent = parent;
  this.mount = parent.mount;
  this.mounted = null;
  this.id = FS.nextInode++;
  this.name = name;
  this.mode = mode;
  this.node_ops = {};
  this.stream_ops = {};
  this.rdev = rdev;
};
var readMode = 292/*292*/ | 73/*73*/;
var writeMode = 146/*146*/;
Object.defineProperties(FSNode.prototype, {
  read: {
    get: /** @this{FSNode} */function () {
      return (this.mode & readMode) === readMode;
    },
    set: /** @this{FSNode} */function (val) {
      val ? this.mode |= readMode : this.mode &= ~readMode;
    }
  },
  write: {
    get: /** @this{FSNode} */function () {
      return (this.mode & writeMode) === writeMode;
    },
    set: /** @this{FSNode} */function (val) {
      val ? this.mode |= writeMode : this.mode &= ~writeMode;
    }
  },
  isFolder: {
    get: /** @this{FSNode} */function () {
      return FS.isDir(this.mode);
    }
  },
  isDevice: {
    get: /** @this{FSNode} */function () {
      return FS.isChrdev(this.mode);
    }
  }
});
FS.FSNode = FSNode;
FS.createPreloadedFile = FS_createPreloadedFile;
FS.staticInit(); Module["FS_createPath"] = FS.createPath; Module["FS_createDataFile"] = FS.createDataFile; Module["FS_createPreloadedFile"] = FS.createPreloadedFile; Module["FS_unlink"] = FS.unlink; Module["FS_createLazyFile"] = FS.createLazyFile; Module["FS_createDevice"] = FS.createDevice;;

// exports
Module["requestFullscreen"] = Browser.requestFullscreen;
Module["requestFullScreen"] = Browser.requestFullScreen;
Module["requestAnimationFrame"] = Browser.requestAnimationFrame;
Module["setCanvasSize"] = Browser.setCanvasSize;
Module["pauseMainLoop"] = Browser.mainLoop.pause;
Module["resumeMainLoop"] = Browser.mainLoop.resume;
Module["getUserMedia"] = Browser.getUserMedia;
Module["createContext"] = Browser.createContext;
var preloadedImages = {};
var preloadedAudios = {};;
var GLctx;;
GLImmediate.setupFuncs(); Browser.moduleContextCreatedCallbacks.push(() => GLImmediate.init());;
/**@suppress {duplicate, undefinedVars}*/var _emscripten_glDrawArrays;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glDrawElements;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glActiveTexture;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glEnable;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glDisable;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glTexEnvf;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glTexEnvi;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glTexEnvfv;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glGetIntegerv;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glIsEnabled;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glGetBooleanv;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glGetString;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glCreateShader;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glShaderSource;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glCompileShader;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glAttachShader;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glDetachShader;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glUseProgram;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glDeleteProgram;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glBindAttribLocation;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glLinkProgram;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glBindBuffer;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glGetFloatv;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glHint;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glEnableVertexAttribArray;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glDisableVertexAttribArray;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glVertexAttribPointer;/**@suppress {duplicate, undefinedVars}*/var _glTexEnvf;/**@suppress {duplicate, undefinedVars}*/var _glTexEnvi;/**@suppress {duplicate, undefinedVars}*/var _glTexEnvfv;/**@suppress {duplicate, undefinedVars}*/var _glGetTexEnviv;/**@suppress {duplicate, undefinedVars}*/var _glGetTexEnvfv; GLEmulation.init();;
for (var i = 0; i < 32; ++i) tempFixedLengthArray.push(new Array(i));;
var miniTempWebGLFloatBuffersStorage = new Float32Array(288);
for (/**@suppress{duplicate}*/var i = 0; i < 288; ++i) {
  miniTempWebGLFloatBuffers[i] = miniTempWebGLFloatBuffersStorage.subarray(0, i + 1);
};
var miniTempWebGLIntBuffersStorage = new Int32Array(288);
for (/**@suppress{duplicate}*/var i = 0; i < 288; ++i) {
  miniTempWebGLIntBuffers[i] = miniTempWebGLIntBuffersStorage.subarray(0, i + 1);
};
function checkIncomingModuleAPI() {
  ignoredModuleProp('fetchSettings');
}
var wasmImports = {
  /** @export */
  __assert_fail: ___assert_fail,
  /** @export */
  __call_sighandler: ___call_sighandler,
  /** @export */
  __cxa_begin_catch: ___cxa_begin_catch,
  /** @export */
  __cxa_end_catch: ___cxa_end_catch,
  /** @export */
  __cxa_find_matching_catch_2: ___cxa_find_matching_catch_2,
  /** @export */
  __cxa_find_matching_catch_3: ___cxa_find_matching_catch_3,
  /** @export */
  __cxa_rethrow: ___cxa_rethrow,
  /** @export */
  __cxa_rethrow_primary_exception: ___cxa_rethrow_primary_exception,
  /** @export */
  __cxa_throw: ___cxa_throw,
  /** @export */
  __cxa_uncaught_exceptions: ___cxa_uncaught_exceptions,
  /** @export */
  __resumeException: ___resumeException,
  /** @export */
  __syscall__newselect: ___syscall__newselect,
  /** @export */
  __syscall_accept4: ___syscall_accept4,
  /** @export */
  __syscall_bind: ___syscall_bind,
  /** @export */
  __syscall_chdir: ___syscall_chdir,
  /** @export */
  __syscall_chmod: ___syscall_chmod,
  /** @export */
  __syscall_connect: ___syscall_connect,
  /** @export */
  __syscall_dup3: ___syscall_dup3,
  /** @export */
  __syscall_faccessat: ___syscall_faccessat,
  /** @export */
  __syscall_fchmod: ___syscall_fchmod,
  /** @export */
  __syscall_fchown32: ___syscall_fchown32,
  /** @export */
  __syscall_fcntl64: ___syscall_fcntl64,
  /** @export */
  __syscall_fstat64: ___syscall_fstat64,
  /** @export */
  __syscall_ftruncate64: ___syscall_ftruncate64,
  /** @export */
  __syscall_getcwd: ___syscall_getcwd,
  /** @export */
  __syscall_getdents64: ___syscall_getdents64,
  /** @export */
  __syscall_getpeername: ___syscall_getpeername,
  /** @export */
  __syscall_ioctl: ___syscall_ioctl,
  /** @export */
  __syscall_listen: ___syscall_listen,
  /** @export */
  __syscall_lstat64: ___syscall_lstat64,
  /** @export */
  __syscall_mkdirat: ___syscall_mkdirat,
  /** @export */
  __syscall_newfstatat: ___syscall_newfstatat,
  /** @export */
  __syscall_openat: ___syscall_openat,
  /** @export */
  __syscall_pipe: ___syscall_pipe,
  /** @export */
  __syscall_poll: ___syscall_poll,
  /** @export */
  __syscall_readlinkat: ___syscall_readlinkat,
  /** @export */
  __syscall_recvfrom: ___syscall_recvfrom,
  /** @export */
  __syscall_renameat: ___syscall_renameat,
  /** @export */
  __syscall_rmdir: ___syscall_rmdir,
  /** @export */
  __syscall_sendto: ___syscall_sendto,
  /** @export */
  __syscall_socket: ___syscall_socket,
  /** @export */
  __syscall_stat64: ___syscall_stat64,
  /** @export */
  __syscall_symlink: ___syscall_symlink,
  /** @export */
  __syscall_unlinkat: ___syscall_unlinkat,
  /** @export */
  __syscall_utimensat: ___syscall_utimensat,
  /** @export */
  _emscripten_fs_load_embedded_files: __emscripten_fs_load_embedded_files,
  /** @export */
  _emscripten_get_now_is_monotonic: __emscripten_get_now_is_monotonic,
  /** @export */
  _emscripten_runtime_keepalive_clear: __emscripten_runtime_keepalive_clear,
  /** @export */
  _emscripten_throw_longjmp: __emscripten_throw_longjmp,
  /** @export */
  _gmtime_js: __gmtime_js,
  /** @export */
  _localtime_js: __localtime_js,
  /** @export */
  _mktime_js: __mktime_js,
  /** @export */
  _mmap_js: __mmap_js,
  /** @export */
  _munmap_js: __munmap_js,
  /** @export */
  _tzset_js: __tzset_js,
  /** @export */
  abort: _abort,
  /** @export */
  eglBindAPI: _eglBindAPI,
  /** @export */
  eglChooseConfig: _eglChooseConfig,
  /** @export */
  eglCreateContext: _eglCreateContext,
  /** @export */
  eglCreateWindowSurface: _eglCreateWindowSurface,
  /** @export */
  eglDestroyContext: _eglDestroyContext,
  /** @export */
  eglDestroySurface: _eglDestroySurface,
  /** @export */
  eglGetConfigAttrib: _eglGetConfigAttrib,
  /** @export */
  eglGetDisplay: _eglGetDisplay,
  /** @export */
  eglGetError: _eglGetError,
  /** @export */
  eglInitialize: _eglInitialize,
  /** @export */
  eglMakeCurrent: _eglMakeCurrent,
  /** @export */
  eglQueryString: _eglQueryString,
  /** @export */
  eglSwapBuffers: _eglSwapBuffers,
  /** @export */
  eglSwapInterval: _eglSwapInterval,
  /** @export */
  eglTerminate: _eglTerminate,
  /** @export */
  eglWaitGL: _eglWaitGL,
  /** @export */
  eglWaitNative: _eglWaitNative,
  /** @export */
  emscripten_asm_const_int: _emscripten_asm_const_int,
  /** @export */
  emscripten_asm_const_int_sync_on_main_thread: _emscripten_asm_const_int_sync_on_main_thread,
  /** @export */
  emscripten_cancel_main_loop: _emscripten_cancel_main_loop,
  /** @export */
  emscripten_date_now: _emscripten_date_now,
  /** @export */
  emscripten_err: _emscripten_err,
  /** @export */
  emscripten_exit_fullscreen: _emscripten_exit_fullscreen,
  /** @export */
  emscripten_exit_pointerlock: _emscripten_exit_pointerlock,
  /** @export */
  emscripten_get_device_pixel_ratio: _emscripten_get_device_pixel_ratio,
  /** @export */
  emscripten_get_element_css_size: _emscripten_get_element_css_size,
  /** @export */
  emscripten_get_gamepad_status: _emscripten_get_gamepad_status,
  /** @export */
  emscripten_get_heap_max: _emscripten_get_heap_max,
  /** @export */
  emscripten_get_now: _emscripten_get_now,
  /** @export */
  emscripten_get_num_gamepads: _emscripten_get_num_gamepads,
  /** @export */
  emscripten_get_screen_size: _emscripten_get_screen_size,
  /** @export */
  emscripten_glActiveTexture: _emscripten_glActiveTexture,
  /** @export */
  emscripten_glAlphaFunc: _emscripten_glAlphaFunc,
  /** @export */
  emscripten_glAttachShader: _emscripten_glAttachShader,
  /** @export */
  emscripten_glBegin: _emscripten_glBegin,
  /** @export */
  emscripten_glBeginQuery: _emscripten_glBeginQuery,
  /** @export */
  emscripten_glBeginQueryEXT: _emscripten_glBeginQueryEXT,
  /** @export */
  emscripten_glBeginTransformFeedback: _emscripten_glBeginTransformFeedback,
  /** @export */
  emscripten_glBindAttribLocation: _emscripten_glBindAttribLocation,
  /** @export */
  emscripten_glBindBuffer: _emscripten_glBindBuffer,
  /** @export */
  emscripten_glBindBufferBase: _emscripten_glBindBufferBase,
  /** @export */
  emscripten_glBindBufferRange: _emscripten_glBindBufferRange,
  /** @export */
  emscripten_glBindFramebuffer: _emscripten_glBindFramebuffer,
  /** @export */
  emscripten_glBindProgram: _emscripten_glBindProgram,
  /** @export */
  emscripten_glBindRenderbuffer: _emscripten_glBindRenderbuffer,
  /** @export */
  emscripten_glBindSampler: _emscripten_glBindSampler,
  /** @export */
  emscripten_glBindTexture: _emscripten_glBindTexture,
  /** @export */
  emscripten_glBindTransformFeedback: _emscripten_glBindTransformFeedback,
  /** @export */
  emscripten_glBindVertexArray: _emscripten_glBindVertexArray,
  /** @export */
  emscripten_glBindVertexArrayOES: _emscripten_glBindVertexArrayOES,
  /** @export */
  emscripten_glBlendColor: _emscripten_glBlendColor,
  /** @export */
  emscripten_glBlendEquation: _emscripten_glBlendEquation,
  /** @export */
  emscripten_glBlendEquationSeparate: _emscripten_glBlendEquationSeparate,
  /** @export */
  emscripten_glBlendFunc: _emscripten_glBlendFunc,
  /** @export */
  emscripten_glBlendFuncSeparate: _emscripten_glBlendFuncSeparate,
  /** @export */
  emscripten_glBlitFramebuffer: _emscripten_glBlitFramebuffer,
  /** @export */
  emscripten_glBufferData: _emscripten_glBufferData,
  /** @export */
  emscripten_glBufferSubData: _emscripten_glBufferSubData,
  /** @export */
  emscripten_glCheckFramebufferStatus: _emscripten_glCheckFramebufferStatus,
  /** @export */
  emscripten_glClear: _emscripten_glClear,
  /** @export */
  emscripten_glClearBufferfi: _emscripten_glClearBufferfi,
  /** @export */
  emscripten_glClearBufferfv: _emscripten_glClearBufferfv,
  /** @export */
  emscripten_glClearBufferiv: _emscripten_glClearBufferiv,
  /** @export */
  emscripten_glClearBufferuiv: _emscripten_glClearBufferuiv,
  /** @export */
  emscripten_glClearColor: _emscripten_glClearColor,
  /** @export */
  emscripten_glClearDepthf: _emscripten_glClearDepthf,
  /** @export */
  emscripten_glClearStencil: _emscripten_glClearStencil,
  /** @export */
  emscripten_glClientActiveTexture: _emscripten_glClientActiveTexture,
  /** @export */
  emscripten_glClientWaitSync: _emscripten_glClientWaitSync,
  /** @export */
  emscripten_glClipPlane: _emscripten_glClipPlane,
  /** @export */
  emscripten_glColor3d: _emscripten_glColor3d,
  /** @export */
  emscripten_glColor3f: _emscripten_glColor3f,
  /** @export */
  emscripten_glColor3fv: _emscripten_glColor3fv,
  /** @export */
  emscripten_glColor3ub: _emscripten_glColor3ub,
  /** @export */
  emscripten_glColor3ubv: _emscripten_glColor3ubv,
  /** @export */
  emscripten_glColor3ui: _emscripten_glColor3ui,
  /** @export */
  emscripten_glColor3uiv: _emscripten_glColor3uiv,
  /** @export */
  emscripten_glColor3us: _emscripten_glColor3us,
  /** @export */
  emscripten_glColor3usv: _emscripten_glColor3usv,
  /** @export */
  emscripten_glColor4d: _emscripten_glColor4d,
  /** @export */
  emscripten_glColor4f: _emscripten_glColor4f,
  /** @export */
  emscripten_glColor4fv: _emscripten_glColor4fv,
  /** @export */
  emscripten_glColor4ub: _emscripten_glColor4ub,
  /** @export */
  emscripten_glColor4ubv: _emscripten_glColor4ubv,
  /** @export */
  emscripten_glColor4ui: _emscripten_glColor4ui,
  /** @export */
  emscripten_glColor4us: _emscripten_glColor4us,
  /** @export */
  emscripten_glColorMask: _emscripten_glColorMask,
  /** @export */
  emscripten_glColorPointer: _emscripten_glColorPointer,
  /** @export */
  emscripten_glCompileShader: _emscripten_glCompileShader,
  /** @export */
  emscripten_glCompressedTexImage2D: _emscripten_glCompressedTexImage2D,
  /** @export */
  emscripten_glCompressedTexImage3D: _emscripten_glCompressedTexImage3D,
  /** @export */
  emscripten_glCompressedTexSubImage2D: _emscripten_glCompressedTexSubImage2D,
  /** @export */
  emscripten_glCompressedTexSubImage3D: _emscripten_glCompressedTexSubImage3D,
  /** @export */
  emscripten_glCopyBufferSubData: _emscripten_glCopyBufferSubData,
  /** @export */
  emscripten_glCopyTexImage2D: _emscripten_glCopyTexImage2D,
  /** @export */
  emscripten_glCopyTexSubImage2D: _emscripten_glCopyTexSubImage2D,
  /** @export */
  emscripten_glCopyTexSubImage3D: _emscripten_glCopyTexSubImage3D,
  /** @export */
  emscripten_glCreateProgram: _emscripten_glCreateProgram,
  /** @export */
  emscripten_glCreateShader: _emscripten_glCreateShader,
  /** @export */
  emscripten_glCullFace: _emscripten_glCullFace,
  /** @export */
  emscripten_glDeleteBuffers: _emscripten_glDeleteBuffers,
  /** @export */
  emscripten_glDeleteFramebuffers: _emscripten_glDeleteFramebuffers,
  /** @export */
  emscripten_glDeleteObject: _emscripten_glDeleteObject,
  /** @export */
  emscripten_glDeleteProgram: _emscripten_glDeleteProgram,
  /** @export */
  emscripten_glDeleteQueries: _emscripten_glDeleteQueries,
  /** @export */
  emscripten_glDeleteQueriesEXT: _emscripten_glDeleteQueriesEXT,
  /** @export */
  emscripten_glDeleteRenderbuffers: _emscripten_glDeleteRenderbuffers,
  /** @export */
  emscripten_glDeleteSamplers: _emscripten_glDeleteSamplers,
  /** @export */
  emscripten_glDeleteShader: _emscripten_glDeleteShader,
  /** @export */
  emscripten_glDeleteSync: _emscripten_glDeleteSync,
  /** @export */
  emscripten_glDeleteTextures: _emscripten_glDeleteTextures,
  /** @export */
  emscripten_glDeleteTransformFeedbacks: _emscripten_glDeleteTransformFeedbacks,
  /** @export */
  emscripten_glDeleteVertexArrays: _emscripten_glDeleteVertexArrays,
  /** @export */
  emscripten_glDeleteVertexArraysOES: _emscripten_glDeleteVertexArraysOES,
  /** @export */
  emscripten_glDepthFunc: _emscripten_glDepthFunc,
  /** @export */
  emscripten_glDepthMask: _emscripten_glDepthMask,
  /** @export */
  emscripten_glDepthRangef: _emscripten_glDepthRangef,
  /** @export */
  emscripten_glDetachShader: _emscripten_glDetachShader,
  /** @export */
  emscripten_glDisable: _emscripten_glDisable,
  /** @export */
  emscripten_glDisableClientState: _emscripten_glDisableClientState,
  /** @export */
  emscripten_glDisableVertexAttribArray: _emscripten_glDisableVertexAttribArray,
  /** @export */
  emscripten_glDrawArrays: _emscripten_glDrawArrays,
  /** @export */
  emscripten_glDrawArraysInstanced: _emscripten_glDrawArraysInstanced,
  /** @export */
  emscripten_glDrawArraysInstancedANGLE: _emscripten_glDrawArraysInstancedANGLE,
  /** @export */
  emscripten_glDrawArraysInstancedARB: _emscripten_glDrawArraysInstancedARB,
  /** @export */
  emscripten_glDrawArraysInstancedEXT: _emscripten_glDrawArraysInstancedEXT,
  /** @export */
  emscripten_glDrawArraysInstancedNV: _emscripten_glDrawArraysInstancedNV,
  /** @export */
  emscripten_glDrawBuffer: _emscripten_glDrawBuffer,
  /** @export */
  emscripten_glDrawBuffers: _emscripten_glDrawBuffers,
  /** @export */
  emscripten_glDrawBuffersEXT: _emscripten_glDrawBuffersEXT,
  /** @export */
  emscripten_glDrawBuffersWEBGL: _emscripten_glDrawBuffersWEBGL,
  /** @export */
  emscripten_glDrawElements: _emscripten_glDrawElements,
  /** @export */
  emscripten_glDrawElementsInstanced: _emscripten_glDrawElementsInstanced,
  /** @export */
  emscripten_glDrawElementsInstancedANGLE: _emscripten_glDrawElementsInstancedANGLE,
  /** @export */
  emscripten_glDrawElementsInstancedARB: _emscripten_glDrawElementsInstancedARB,
  /** @export */
  emscripten_glDrawElementsInstancedEXT: _emscripten_glDrawElementsInstancedEXT,
  /** @export */
  emscripten_glDrawElementsInstancedNV: _emscripten_glDrawElementsInstancedNV,
  /** @export */
  emscripten_glDrawRangeElements: _emscripten_glDrawRangeElements,
  /** @export */
  emscripten_glEnable: _emscripten_glEnable,
  /** @export */
  emscripten_glEnableClientState: _emscripten_glEnableClientState,
  /** @export */
  emscripten_glEnableVertexAttribArray: _emscripten_glEnableVertexAttribArray,
  /** @export */
  emscripten_glEnd: _emscripten_glEnd,
  /** @export */
  emscripten_glEndQuery: _emscripten_glEndQuery,
  /** @export */
  emscripten_glEndQueryEXT: _emscripten_glEndQueryEXT,
  /** @export */
  emscripten_glEndTransformFeedback: _emscripten_glEndTransformFeedback,
  /** @export */
  emscripten_glFenceSync: _emscripten_glFenceSync,
  /** @export */
  emscripten_glFinish: _emscripten_glFinish,
  /** @export */
  emscripten_glFlush: _emscripten_glFlush,
  /** @export */
  emscripten_glFramebufferRenderbuffer: _emscripten_glFramebufferRenderbuffer,
  /** @export */
  emscripten_glFramebufferTexture2D: _emscripten_glFramebufferTexture2D,
  /** @export */
  emscripten_glFramebufferTextureLayer: _emscripten_glFramebufferTextureLayer,
  /** @export */
  emscripten_glFrontFace: _emscripten_glFrontFace,
  /** @export */
  emscripten_glFrustum: _emscripten_glFrustum,
  /** @export */
  emscripten_glGenBuffers: _emscripten_glGenBuffers,
  /** @export */
  emscripten_glGenFramebuffers: _emscripten_glGenFramebuffers,
  /** @export */
  emscripten_glGenQueries: _emscripten_glGenQueries,
  /** @export */
  emscripten_glGenQueriesEXT: _emscripten_glGenQueriesEXT,
  /** @export */
  emscripten_glGenRenderbuffers: _emscripten_glGenRenderbuffers,
  /** @export */
  emscripten_glGenSamplers: _emscripten_glGenSamplers,
  /** @export */
  emscripten_glGenTextures: _emscripten_glGenTextures,
  /** @export */
  emscripten_glGenTransformFeedbacks: _emscripten_glGenTransformFeedbacks,
  /** @export */
  emscripten_glGenVertexArrays: _emscripten_glGenVertexArrays,
  /** @export */
  emscripten_glGenVertexArraysOES: _emscripten_glGenVertexArraysOES,
  /** @export */
  emscripten_glGenerateMipmap: _emscripten_glGenerateMipmap,
  /** @export */
  emscripten_glGetActiveAttrib: _emscripten_glGetActiveAttrib,
  /** @export */
  emscripten_glGetActiveUniform: _emscripten_glGetActiveUniform,
  /** @export */
  emscripten_glGetActiveUniformBlockName: _emscripten_glGetActiveUniformBlockName,
  /** @export */
  emscripten_glGetActiveUniformBlockiv: _emscripten_glGetActiveUniformBlockiv,
  /** @export */
  emscripten_glGetActiveUniformsiv: _emscripten_glGetActiveUniformsiv,
  /** @export */
  emscripten_glGetAttachedShaders: _emscripten_glGetAttachedShaders,
  /** @export */
  emscripten_glGetAttribLocation: _emscripten_glGetAttribLocation,
  /** @export */
  emscripten_glGetBooleanv: _emscripten_glGetBooleanv,
  /** @export */
  emscripten_glGetBufferParameteri64v: _emscripten_glGetBufferParameteri64v,
  /** @export */
  emscripten_glGetBufferParameteriv: _emscripten_glGetBufferParameteriv,
  /** @export */
  emscripten_glGetError: _emscripten_glGetError,
  /** @export */
  emscripten_glGetFloatv: _emscripten_glGetFloatv,
  /** @export */
  emscripten_glGetFragDataLocation: _emscripten_glGetFragDataLocation,
  /** @export */
  emscripten_glGetFramebufferAttachmentParameteriv: _emscripten_glGetFramebufferAttachmentParameteriv,
  /** @export */
  emscripten_glGetInfoLog: _emscripten_glGetInfoLog,
  /** @export */
  emscripten_glGetInteger64i_v: _emscripten_glGetInteger64i_v,
  /** @export */
  emscripten_glGetInteger64v: _emscripten_glGetInteger64v,
  /** @export */
  emscripten_glGetIntegeri_v: _emscripten_glGetIntegeri_v,
  /** @export */
  emscripten_glGetIntegerv: _emscripten_glGetIntegerv,
  /** @export */
  emscripten_glGetInternalformativ: _emscripten_glGetInternalformativ,
  /** @export */
  emscripten_glGetObjectParameteriv: _emscripten_glGetObjectParameteriv,
  /** @export */
  emscripten_glGetPointerv: _emscripten_glGetPointerv,
  /** @export */
  emscripten_glGetProgramBinary: _emscripten_glGetProgramBinary,
  /** @export */
  emscripten_glGetProgramInfoLog: _emscripten_glGetProgramInfoLog,
  /** @export */
  emscripten_glGetProgramiv: _emscripten_glGetProgramiv,
  /** @export */
  emscripten_glGetQueryObjecti64vEXT: _emscripten_glGetQueryObjecti64vEXT,
  /** @export */
  emscripten_glGetQueryObjectivEXT: _emscripten_glGetQueryObjectivEXT,
  /** @export */
  emscripten_glGetQueryObjectui64vEXT: _emscripten_glGetQueryObjectui64vEXT,
  /** @export */
  emscripten_glGetQueryObjectuiv: _emscripten_glGetQueryObjectuiv,
  /** @export */
  emscripten_glGetQueryObjectuivEXT: _emscripten_glGetQueryObjectuivEXT,
  /** @export */
  emscripten_glGetQueryiv: _emscripten_glGetQueryiv,
  /** @export */
  emscripten_glGetQueryivEXT: _emscripten_glGetQueryivEXT,
  /** @export */
  emscripten_glGetRenderbufferParameteriv: _emscripten_glGetRenderbufferParameteriv,
  /** @export */
  emscripten_glGetSamplerParameterfv: _emscripten_glGetSamplerParameterfv,
  /** @export */
  emscripten_glGetSamplerParameteriv: _emscripten_glGetSamplerParameteriv,
  /** @export */
  emscripten_glGetShaderInfoLog: _emscripten_glGetShaderInfoLog,
  /** @export */
  emscripten_glGetShaderPrecisionFormat: _emscripten_glGetShaderPrecisionFormat,
  /** @export */
  emscripten_glGetShaderSource: _emscripten_glGetShaderSource,
  /** @export */
  emscripten_glGetShaderiv: _emscripten_glGetShaderiv,
  /** @export */
  emscripten_glGetString: _emscripten_glGetString,
  /** @export */
  emscripten_glGetStringi: _emscripten_glGetStringi,
  /** @export */
  emscripten_glGetSynciv: _emscripten_glGetSynciv,
  /** @export */
  emscripten_glGetTexEnvfv: _emscripten_glGetTexEnvfv,
  /** @export */
  emscripten_glGetTexEnviv: _emscripten_glGetTexEnviv,
  /** @export */
  emscripten_glGetTexLevelParameteriv: _emscripten_glGetTexLevelParameteriv,
  /** @export */
  emscripten_glGetTexParameterfv: _emscripten_glGetTexParameterfv,
  /** @export */
  emscripten_glGetTexParameteriv: _emscripten_glGetTexParameteriv,
  /** @export */
  emscripten_glGetTransformFeedbackVarying: _emscripten_glGetTransformFeedbackVarying,
  /** @export */
  emscripten_glGetUniformBlockIndex: _emscripten_glGetUniformBlockIndex,
  /** @export */
  emscripten_glGetUniformIndices: _emscripten_glGetUniformIndices,
  /** @export */
  emscripten_glGetUniformLocation: _emscripten_glGetUniformLocation,
  /** @export */
  emscripten_glGetUniformfv: _emscripten_glGetUniformfv,
  /** @export */
  emscripten_glGetUniformiv: _emscripten_glGetUniformiv,
  /** @export */
  emscripten_glGetUniformuiv: _emscripten_glGetUniformuiv,
  /** @export */
  emscripten_glGetVertexAttribIiv: _emscripten_glGetVertexAttribIiv,
  /** @export */
  emscripten_glGetVertexAttribIuiv: _emscripten_glGetVertexAttribIuiv,
  /** @export */
  emscripten_glGetVertexAttribPointerv: _emscripten_glGetVertexAttribPointerv,
  /** @export */
  emscripten_glGetVertexAttribfv: _emscripten_glGetVertexAttribfv,
  /** @export */
  emscripten_glGetVertexAttribiv: _emscripten_glGetVertexAttribiv,
  /** @export */
  emscripten_glHint: _emscripten_glHint,
  /** @export */
  emscripten_glInvalidateFramebuffer: _emscripten_glInvalidateFramebuffer,
  /** @export */
  emscripten_glInvalidateSubFramebuffer: _emscripten_glInvalidateSubFramebuffer,
  /** @export */
  emscripten_glIsBuffer: _emscripten_glIsBuffer,
  /** @export */
  emscripten_glIsEnabled: _emscripten_glIsEnabled,
  /** @export */
  emscripten_glIsFramebuffer: _emscripten_glIsFramebuffer,
  /** @export */
  emscripten_glIsProgram: _emscripten_glIsProgram,
  /** @export */
  emscripten_glIsQuery: _emscripten_glIsQuery,
  /** @export */
  emscripten_glIsQueryEXT: _emscripten_glIsQueryEXT,
  /** @export */
  emscripten_glIsRenderbuffer: _emscripten_glIsRenderbuffer,
  /** @export */
  emscripten_glIsSampler: _emscripten_glIsSampler,
  /** @export */
  emscripten_glIsShader: _emscripten_glIsShader,
  /** @export */
  emscripten_glIsSync: _emscripten_glIsSync,
  /** @export */
  emscripten_glIsTexture: _emscripten_glIsTexture,
  /** @export */
  emscripten_glIsTransformFeedback: _emscripten_glIsTransformFeedback,
  /** @export */
  emscripten_glIsVertexArray: _emscripten_glIsVertexArray,
  /** @export */
  emscripten_glIsVertexArrayOES: _emscripten_glIsVertexArrayOES,
  /** @export */
  emscripten_glLightModelf: _emscripten_glLightModelf,
  /** @export */
  emscripten_glLightModelfv: _emscripten_glLightModelfv,
  /** @export */
  emscripten_glLightfv: _emscripten_glLightfv,
  /** @export */
  emscripten_glLineWidth: _emscripten_glLineWidth,
  /** @export */
  emscripten_glLinkProgram: _emscripten_glLinkProgram,
  /** @export */
  emscripten_glLoadIdentity: _emscripten_glLoadIdentity,
  /** @export */
  emscripten_glLoadMatrixd: _emscripten_glLoadMatrixd,
  /** @export */
  emscripten_glLoadMatrixf: _emscripten_glLoadMatrixf,
  /** @export */
  emscripten_glLoadTransposeMatrixd: _emscripten_glLoadTransposeMatrixd,
  /** @export */
  emscripten_glLoadTransposeMatrixf: _emscripten_glLoadTransposeMatrixf,
  /** @export */
  emscripten_glMaterialfv: _emscripten_glMaterialfv,
  /** @export */
  emscripten_glMatrixMode: _emscripten_glMatrixMode,
  /** @export */
  emscripten_glMultMatrixd: _emscripten_glMultMatrixd,
  /** @export */
  emscripten_glMultMatrixf: _emscripten_glMultMatrixf,
  /** @export */
  emscripten_glMultTransposeMatrixd: _emscripten_glMultTransposeMatrixd,
  /** @export */
  emscripten_glMultTransposeMatrixf: _emscripten_glMultTransposeMatrixf,
  /** @export */
  emscripten_glNormal3f: _emscripten_glNormal3f,
  /** @export */
  emscripten_glNormalPointer: _emscripten_glNormalPointer,
  /** @export */
  emscripten_glOrtho: _emscripten_glOrtho,
  /** @export */
  emscripten_glPauseTransformFeedback: _emscripten_glPauseTransformFeedback,
  /** @export */
  emscripten_glPixelStorei: _emscripten_glPixelStorei,
  /** @export */
  emscripten_glPolygonMode: _emscripten_glPolygonMode,
  /** @export */
  emscripten_glPolygonOffset: _emscripten_glPolygonOffset,
  /** @export */
  emscripten_glPopMatrix: _emscripten_glPopMatrix,
  /** @export */
  emscripten_glProgramBinary: _emscripten_glProgramBinary,
  /** @export */
  emscripten_glProgramParameteri: _emscripten_glProgramParameteri,
  /** @export */
  emscripten_glPushMatrix: _emscripten_glPushMatrix,
  /** @export */
  emscripten_glQueryCounterEXT: _emscripten_glQueryCounterEXT,
  /** @export */
  emscripten_glReadBuffer: _emscripten_glReadBuffer,
  /** @export */
  emscripten_glReadPixels: _emscripten_glReadPixels,
  /** @export */
  emscripten_glReleaseShaderCompiler: _emscripten_glReleaseShaderCompiler,
  /** @export */
  emscripten_glRenderbufferStorage: _emscripten_glRenderbufferStorage,
  /** @export */
  emscripten_glRenderbufferStorageMultisample: _emscripten_glRenderbufferStorageMultisample,
  /** @export */
  emscripten_glResumeTransformFeedback: _emscripten_glResumeTransformFeedback,
  /** @export */
  emscripten_glRotated: _emscripten_glRotated,
  /** @export */
  emscripten_glRotatef: _emscripten_glRotatef,
  /** @export */
  emscripten_glSampleCoverage: _emscripten_glSampleCoverage,
  /** @export */
  emscripten_glSamplerParameterf: _emscripten_glSamplerParameterf,
  /** @export */
  emscripten_glSamplerParameterfv: _emscripten_glSamplerParameterfv,
  /** @export */
  emscripten_glSamplerParameteri: _emscripten_glSamplerParameteri,
  /** @export */
  emscripten_glSamplerParameteriv: _emscripten_glSamplerParameteriv,
  /** @export */
  emscripten_glScaled: _emscripten_glScaled,
  /** @export */
  emscripten_glScalef: _emscripten_glScalef,
  /** @export */
  emscripten_glScissor: _emscripten_glScissor,
  /** @export */
  emscripten_glShadeModel: _emscripten_glShadeModel,
  /** @export */
  emscripten_glShaderBinary: _emscripten_glShaderBinary,
  /** @export */
  emscripten_glShaderSource: _emscripten_glShaderSource,
  /** @export */
  emscripten_glStencilFunc: _emscripten_glStencilFunc,
  /** @export */
  emscripten_glStencilFuncSeparate: _emscripten_glStencilFuncSeparate,
  /** @export */
  emscripten_glStencilMask: _emscripten_glStencilMask,
  /** @export */
  emscripten_glStencilMaskSeparate: _emscripten_glStencilMaskSeparate,
  /** @export */
  emscripten_glStencilOp: _emscripten_glStencilOp,
  /** @export */
  emscripten_glStencilOpSeparate: _emscripten_glStencilOpSeparate,
  /** @export */
  emscripten_glTexCoord2f: _emscripten_glTexCoord2f,
  /** @export */
  emscripten_glTexCoord2fv: _emscripten_glTexCoord2fv,
  /** @export */
  emscripten_glTexCoord2i: _emscripten_glTexCoord2i,
  /** @export */
  emscripten_glTexCoord3f: _emscripten_glTexCoord3f,
  /** @export */
  emscripten_glTexCoord4f: _emscripten_glTexCoord4f,
  /** @export */
  emscripten_glTexCoordPointer: _emscripten_glTexCoordPointer,
  /** @export */
  emscripten_glTexGenfv: _emscripten_glTexGenfv,
  /** @export */
  emscripten_glTexGeni: _emscripten_glTexGeni,
  /** @export */
  emscripten_glTexImage1D: _emscripten_glTexImage1D,
  /** @export */
  emscripten_glTexImage2D: _emscripten_glTexImage2D,
  /** @export */
  emscripten_glTexImage3D: _emscripten_glTexImage3D,
  /** @export */
  emscripten_glTexParameterf: _emscripten_glTexParameterf,
  /** @export */
  emscripten_glTexParameterfv: _emscripten_glTexParameterfv,
  /** @export */
  emscripten_glTexParameteri: _emscripten_glTexParameteri,
  /** @export */
  emscripten_glTexParameteriv: _emscripten_glTexParameteriv,
  /** @export */
  emscripten_glTexStorage2D: _emscripten_glTexStorage2D,
  /** @export */
  emscripten_glTexStorage3D: _emscripten_glTexStorage3D,
  /** @export */
  emscripten_glTexSubImage2D: _emscripten_glTexSubImage2D,
  /** @export */
  emscripten_glTexSubImage3D: _emscripten_glTexSubImage3D,
  /** @export */
  emscripten_glTransformFeedbackVaryings: _emscripten_glTransformFeedbackVaryings,
  /** @export */
  emscripten_glTranslated: _emscripten_glTranslated,
  /** @export */
  emscripten_glTranslatef: _emscripten_glTranslatef,
  /** @export */
  emscripten_glUniform1f: _emscripten_glUniform1f,
  /** @export */
  emscripten_glUniform1fv: _emscripten_glUniform1fv,
  /** @export */
  emscripten_glUniform1i: _emscripten_glUniform1i,
  /** @export */
  emscripten_glUniform1iv: _emscripten_glUniform1iv,
  /** @export */
  emscripten_glUniform1ui: _emscripten_glUniform1ui,
  /** @export */
  emscripten_glUniform1uiv: _emscripten_glUniform1uiv,
  /** @export */
  emscripten_glUniform2f: _emscripten_glUniform2f,
  /** @export */
  emscripten_glUniform2fv: _emscripten_glUniform2fv,
  /** @export */
  emscripten_glUniform2i: _emscripten_glUniform2i,
  /** @export */
  emscripten_glUniform2iv: _emscripten_glUniform2iv,
  /** @export */
  emscripten_glUniform2ui: _emscripten_glUniform2ui,
  /** @export */
  emscripten_glUniform2uiv: _emscripten_glUniform2uiv,
  /** @export */
  emscripten_glUniform3f: _emscripten_glUniform3f,
  /** @export */
  emscripten_glUniform3fv: _emscripten_glUniform3fv,
  /** @export */
  emscripten_glUniform3i: _emscripten_glUniform3i,
  /** @export */
  emscripten_glUniform3iv: _emscripten_glUniform3iv,
  /** @export */
  emscripten_glUniform3ui: _emscripten_glUniform3ui,
  /** @export */
  emscripten_glUniform3uiv: _emscripten_glUniform3uiv,
  /** @export */
  emscripten_glUniform4f: _emscripten_glUniform4f,
  /** @export */
  emscripten_glUniform4fv: _emscripten_glUniform4fv,
  /** @export */
  emscripten_glUniform4i: _emscripten_glUniform4i,
  /** @export */
  emscripten_glUniform4iv: _emscripten_glUniform4iv,
  /** @export */
  emscripten_glUniform4ui: _emscripten_glUniform4ui,
  /** @export */
  emscripten_glUniform4uiv: _emscripten_glUniform4uiv,
  /** @export */
  emscripten_glUniformBlockBinding: _emscripten_glUniformBlockBinding,
  /** @export */
  emscripten_glUniformMatrix2fv: _emscripten_glUniformMatrix2fv,
  /** @export */
  emscripten_glUniformMatrix2x3fv: _emscripten_glUniformMatrix2x3fv,
  /** @export */
  emscripten_glUniformMatrix2x4fv: _emscripten_glUniformMatrix2x4fv,
  /** @export */
  emscripten_glUniformMatrix3fv: _emscripten_glUniformMatrix3fv,
  /** @export */
  emscripten_glUniformMatrix3x2fv: _emscripten_glUniformMatrix3x2fv,
  /** @export */
  emscripten_glUniformMatrix3x4fv: _emscripten_glUniformMatrix3x4fv,
  /** @export */
  emscripten_glUniformMatrix4fv: _emscripten_glUniformMatrix4fv,
  /** @export */
  emscripten_glUniformMatrix4x2fv: _emscripten_glUniformMatrix4x2fv,
  /** @export */
  emscripten_glUniformMatrix4x3fv: _emscripten_glUniformMatrix4x3fv,
  /** @export */
  emscripten_glUseProgram: _emscripten_glUseProgram,
  /** @export */
  emscripten_glValidateProgram: _emscripten_glValidateProgram,
  /** @export */
  emscripten_glVertex2f: _emscripten_glVertex2f,
  /** @export */
  emscripten_glVertex2fv: _emscripten_glVertex2fv,
  /** @export */
  emscripten_glVertex2i: _emscripten_glVertex2i,
  /** @export */
  emscripten_glVertex3f: _emscripten_glVertex3f,
  /** @export */
  emscripten_glVertex3fv: _emscripten_glVertex3fv,
  /** @export */
  emscripten_glVertex3i: _emscripten_glVertex3i,
  /** @export */
  emscripten_glVertex4f: _emscripten_glVertex4f,
  /** @export */
  emscripten_glVertex4fv: _emscripten_glVertex4fv,
  /** @export */
  emscripten_glVertex4i: _emscripten_glVertex4i,
  /** @export */
  emscripten_glVertexAttrib1f: _emscripten_glVertexAttrib1f,
  /** @export */
  emscripten_glVertexAttrib1fv: _emscripten_glVertexAttrib1fv,
  /** @export */
  emscripten_glVertexAttrib2f: _emscripten_glVertexAttrib2f,
  /** @export */
  emscripten_glVertexAttrib2fv: _emscripten_glVertexAttrib2fv,
  /** @export */
  emscripten_glVertexAttrib3f: _emscripten_glVertexAttrib3f,
  /** @export */
  emscripten_glVertexAttrib3fv: _emscripten_glVertexAttrib3fv,
  /** @export */
  emscripten_glVertexAttrib4f: _emscripten_glVertexAttrib4f,
  /** @export */
  emscripten_glVertexAttrib4fv: _emscripten_glVertexAttrib4fv,
  /** @export */
  emscripten_glVertexAttribDivisor: _emscripten_glVertexAttribDivisor,
  /** @export */
  emscripten_glVertexAttribDivisorANGLE: _emscripten_glVertexAttribDivisorANGLE,
  /** @export */
  emscripten_glVertexAttribDivisorARB: _emscripten_glVertexAttribDivisorARB,
  /** @export */
  emscripten_glVertexAttribDivisorEXT: _emscripten_glVertexAttribDivisorEXT,
  /** @export */
  emscripten_glVertexAttribDivisorNV: _emscripten_glVertexAttribDivisorNV,
  /** @export */
  emscripten_glVertexAttribI4i: _emscripten_glVertexAttribI4i,
  /** @export */
  emscripten_glVertexAttribI4iv: _emscripten_glVertexAttribI4iv,
  /** @export */
  emscripten_glVertexAttribI4ui: _emscripten_glVertexAttribI4ui,
  /** @export */
  emscripten_glVertexAttribI4uiv: _emscripten_glVertexAttribI4uiv,
  /** @export */
  emscripten_glVertexAttribIPointer: _emscripten_glVertexAttribIPointer,
  /** @export */
  emscripten_glVertexAttribPointer: _emscripten_glVertexAttribPointer,
  /** @export */
  emscripten_glVertexPointer: _emscripten_glVertexPointer,
  /** @export */
  emscripten_glViewport: _emscripten_glViewport,
  /** @export */
  emscripten_glWaitSync: _emscripten_glWaitSync,
  /** @export */
  emscripten_has_asyncify: _emscripten_has_asyncify,
  /** @export */
  emscripten_log: _emscripten_log,
  /** @export */
  emscripten_memcpy_js: _emscripten_memcpy_js,
  /** @export */
  emscripten_request_fullscreen_strategy: _emscripten_request_fullscreen_strategy,
  /** @export */
  emscripten_request_pointerlock: _emscripten_request_pointerlock,
  /** @export */
  emscripten_resize_heap: _emscripten_resize_heap,
  /** @export */
  emscripten_sample_gamepad_data: _emscripten_sample_gamepad_data,
  /** @export */
  emscripten_set_beforeunload_callback_on_thread: _emscripten_set_beforeunload_callback_on_thread,
  /** @export */
  emscripten_set_blur_callback_on_thread: _emscripten_set_blur_callback_on_thread,
  /** @export */
  emscripten_set_canvas_element_size: _emscripten_set_canvas_element_size,
  /** @export */
  emscripten_set_element_css_size: _emscripten_set_element_css_size,
  /** @export */
  emscripten_set_focus_callback_on_thread: _emscripten_set_focus_callback_on_thread,
  /** @export */
  emscripten_set_fullscreenchange_callback_on_thread: _emscripten_set_fullscreenchange_callback_on_thread,
  /** @export */
  emscripten_set_gamepadconnected_callback_on_thread: _emscripten_set_gamepadconnected_callback_on_thread,
  /** @export */
  emscripten_set_gamepaddisconnected_callback_on_thread: _emscripten_set_gamepaddisconnected_callback_on_thread,
  /** @export */
  emscripten_set_keydown_callback_on_thread: _emscripten_set_keydown_callback_on_thread,
  /** @export */
  emscripten_set_keypress_callback_on_thread: _emscripten_set_keypress_callback_on_thread,
  /** @export */
  emscripten_set_keyup_callback_on_thread: _emscripten_set_keyup_callback_on_thread,
  /** @export */
  emscripten_set_main_loop: _emscripten_set_main_loop,
  /** @export */
  emscripten_set_mousedown_callback_on_thread: _emscripten_set_mousedown_callback_on_thread,
  /** @export */
  emscripten_set_mouseenter_callback_on_thread: _emscripten_set_mouseenter_callback_on_thread,
  /** @export */
  emscripten_set_mouseleave_callback_on_thread: _emscripten_set_mouseleave_callback_on_thread,
  /** @export */
  emscripten_set_mousemove_callback_on_thread: _emscripten_set_mousemove_callback_on_thread,
  /** @export */
  emscripten_set_mouseup_callback_on_thread: _emscripten_set_mouseup_callback_on_thread,
  /** @export */
  emscripten_set_pointerlockchange_callback_on_thread: _emscripten_set_pointerlockchange_callback_on_thread,
  /** @export */
  emscripten_set_resize_callback_on_thread: _emscripten_set_resize_callback_on_thread,
  /** @export */
  emscripten_set_touchcancel_callback_on_thread: _emscripten_set_touchcancel_callback_on_thread,
  /** @export */
  emscripten_set_touchend_callback_on_thread: _emscripten_set_touchend_callback_on_thread,
  /** @export */
  emscripten_set_touchmove_callback_on_thread: _emscripten_set_touchmove_callback_on_thread,
  /** @export */
  emscripten_set_touchstart_callback_on_thread: _emscripten_set_touchstart_callback_on_thread,
  /** @export */
  emscripten_set_visibilitychange_callback_on_thread: _emscripten_set_visibilitychange_callback_on_thread,
  /** @export */
  emscripten_set_wheel_callback_on_thread: _emscripten_set_wheel_callback_on_thread,
  /** @export */
  emscripten_set_window_title: _emscripten_set_window_title,
  /** @export */
  emscripten_sleep: _emscripten_sleep,
  /** @export */
  emscripten_webgl_create_context: _emscripten_webgl_create_context,
  /** @export */
  emscripten_webgl_destroy_context: _emscripten_webgl_destroy_context,
  /** @export */
  emscripten_webgl_enable_extension: _emscripten_webgl_enable_extension,
  /** @export */
  emscripten_webgl_get_context_attributes: _emscripten_webgl_get_context_attributes,
  /** @export */
  emscripten_webgl_get_current_context: _emscripten_webgl_get_current_context,
  /** @export */
  emscripten_webgl_init_context_attributes: _emscripten_webgl_init_context_attributes,
  /** @export */
  emscripten_webgl_make_context_current: _emscripten_webgl_make_context_current,
  /** @export */
  environ_get: _environ_get,
  /** @export */
  environ_sizes_get: _environ_sizes_get,
  /** @export */
  exit: _exit,
  /** @export */
  fd_close: _fd_close,
  /** @export */
  fd_fdstat_get: _fd_fdstat_get,
  /** @export */
  fd_pread: _fd_pread,
  /** @export */
  fd_pwrite: _fd_pwrite,
  /** @export */
  fd_read: _fd_read,
  /** @export */
  fd_seek: _fd_seek,
  /** @export */
  fd_sync: _fd_sync,
  /** @export */
  fd_write: _fd_write,
  /** @export */
  getentropy: _getentropy,
  /** @export */
  gethostbyname: _gethostbyname,
  /** @export */
  glActiveTexture: _glActiveTexture,
  /** @export */
  glAttachShader: _glAttachShader,
  /** @export */
  glBegin: _glBegin,
  /** @export */
  glBindBuffer: _glBindBuffer,
  /** @export */
  glBindFramebuffer: _glBindFramebuffer,
  /** @export */
  glBindRenderbuffer: _glBindRenderbuffer,
  /** @export */
  glBindTexture: _glBindTexture,
  /** @export */
  glBlendColor: _glBlendColor,
  /** @export */
  glBlendEquationSeparate: _glBlendEquationSeparate,
  /** @export */
  glBlendFunc: _glBlendFunc,
  /** @export */
  glBlendFuncSeparate: _glBlendFuncSeparate,
  /** @export */
  glBufferData: _glBufferData,
  /** @export */
  glBufferSubData: _glBufferSubData,
  /** @export */
  glCheckFramebufferStatus: _glCheckFramebufferStatus,
  /** @export */
  glClear: _glClear,
  /** @export */
  glClearColor: _glClearColor,
  /** @export */
  glClearDepth: _glClearDepth,
  /** @export */
  glClearDepthf: _glClearDepthf,
  /** @export */
  glClearStencil: _glClearStencil,
  /** @export */
  glColor4f: _glColor4f,
  /** @export */
  glColorMask: _glColorMask,
  /** @export */
  glCompileShader: _glCompileShader,
  /** @export */
  glCompressedTexImage2D: _glCompressedTexImage2D,
  /** @export */
  glCompressedTexSubImage2D: _glCompressedTexSubImage2D,
  /** @export */
  glCreateProgram: _glCreateProgram,
  /** @export */
  glCreateShader: _glCreateShader,
  /** @export */
  glCullFace: _glCullFace,
  /** @export */
  glDeleteBuffers: _glDeleteBuffers,
  /** @export */
  glDeleteFramebuffers: _glDeleteFramebuffers,
  /** @export */
  glDeleteProgram: _glDeleteProgram,
  /** @export */
  glDeleteRenderbuffers: _glDeleteRenderbuffers,
  /** @export */
  glDeleteShader: _glDeleteShader,
  /** @export */
  glDeleteTextures: _glDeleteTextures,
  /** @export */
  glDepthFunc: _glDepthFunc,
  /** @export */
  glDepthMask: _glDepthMask,
  /** @export */
  glDetachShader: _glDetachShader,
  /** @export */
  glDisable: _glDisable,
  /** @export */
  glDisableClientState: _glDisableClientState,
  /** @export */
  glDisableVertexAttribArray: _glDisableVertexAttribArray,
  /** @export */
  glDrawArrays: _glDrawArrays,
  /** @export */
  glDrawElements: _glDrawElements,
  /** @export */
  glEnable: _glEnable,
  /** @export */
  glEnableClientState: _glEnableClientState,
  /** @export */
  glEnableVertexAttribArray: _glEnableVertexAttribArray,
  /** @export */
  glEnd: _glEnd,
  /** @export */
  glFinish: _glFinish,
  /** @export */
  glFlush: _glFlush,
  /** @export */
  glFramebufferRenderbuffer: _glFramebufferRenderbuffer,
  /** @export */
  glFramebufferTexture2D: _glFramebufferTexture2D,
  /** @export */
  glFrontFace: _glFrontFace,
  /** @export */
  glGenBuffers: _glGenBuffers,
  /** @export */
  glGenFramebuffers: _glGenFramebuffers,
  /** @export */
  glGenRenderbuffers: _glGenRenderbuffers,
  /** @export */
  glGenTextures: _glGenTextures,
  /** @export */
  glGenerateMipmap: _glGenerateMipmap,
  /** @export */
  glGetActiveAttrib: _glGetActiveAttrib,
  /** @export */
  glGetActiveUniform: _glGetActiveUniform,
  /** @export */
  glGetAttribLocation: _glGetAttribLocation,
  /** @export */
  glGetError: _glGetError,
  /** @export */
  glGetFloatv: _glGetFloatv,
  /** @export */
  glGetIntegerv: _glGetIntegerv,
  /** @export */
  glGetProgramInfoLog: _glGetProgramInfoLog,
  /** @export */
  glGetProgramiv: _glGetProgramiv,
  /** @export */
  glGetShaderInfoLog: _glGetShaderInfoLog,
  /** @export */
  glGetShaderiv: _glGetShaderiv,
  /** @export */
  glGetString: _glGetString,
  /** @export */
  glGetTexLevelParameteriv: _glGetTexLevelParameteriv,
  /** @export */
  glGetUniformLocation: _glGetUniformLocation,
  /** @export */
  glHint: _glHint,
  /** @export */
  glLineWidth: _glLineWidth,
  /** @export */
  glLinkProgram: _glLinkProgram,
  /** @export */
  glLoadIdentity: _glLoadIdentity,
  /** @export */
  glMatrixMode: _glMatrixMode,
  /** @export */
  glOrtho: _glOrtho,
  /** @export */
  glPixelStorei: _glPixelStorei,
  /** @export */
  glPointSize: _glPointSize,
  /** @export */
  glPopAttrib: _glPopAttrib,
  /** @export */
  glPushAttrib: _glPushAttrib,
  /** @export */
  glReadPixels: _glReadPixels,
  /** @export */
  glRenderbufferStorage: _glRenderbufferStorage,
  /** @export */
  glScissor: _glScissor,
  /** @export */
  glShadeModel: _glShadeModel,
  /** @export */
  glShaderSource: _glShaderSource,
  /** @export */
  glStencilFuncSeparate: _glStencilFuncSeparate,
  /** @export */
  glStencilOpSeparate: _glStencilOpSeparate,
  /** @export */
  glTexCoordPointer: _glTexCoordPointer,
  /** @export */
  glTexImage2D: _glTexImage2D,
  /** @export */
  glTexParameterf: _glTexParameterf,
  /** @export */
  glTexParameterfv: _glTexParameterfv,
  /** @export */
  glTexParameteri: _glTexParameteri,
  /** @export */
  glTexParameteriv: _glTexParameteriv,
  /** @export */
  glTexSubImage2D: _glTexSubImage2D,
  /** @export */
  glUniform1i: _glUniform1i,
  /** @export */
  glUniform1iv: _glUniform1iv,
  /** @export */
  glUniform4f: _glUniform4f,
  /** @export */
  glUniform4fv: _glUniform4fv,
  /** @export */
  glUniformMatrix3fv: _glUniformMatrix3fv,
  /** @export */
  glUniformMatrix4fv: _glUniformMatrix4fv,
  /** @export */
  glUseProgram: _glUseProgram,
  /** @export */
  glVertex2f: _glVertex2f,
  /** @export */
  glVertexAttribPointer: _glVertexAttribPointer,
  /** @export */
  glVertexPointer: _glVertexPointer,
  /** @export */
  glViewport: _glViewport,
  /** @export */
  invoke_diii: invoke_diii,
  /** @export */
  invoke_fiii: invoke_fiii,
  /** @export */
  invoke_i: invoke_i,
  /** @export */
  invoke_ii: invoke_ii,
  /** @export */
  invoke_iii: invoke_iii,
  /** @export */
  invoke_iiii: invoke_iiii,
  /** @export */
  invoke_iiiii: invoke_iiiii,
  /** @export */
  invoke_iiiiid: invoke_iiiiid,
  /** @export */
  invoke_iiiiii: invoke_iiiiii,
  /** @export */
  invoke_iiiiiii: invoke_iiiiiii,
  /** @export */
  invoke_iiiiiiii: invoke_iiiiiiii,
  /** @export */
  invoke_iiiiiiiiiii: invoke_iiiiiiiiiii,
  /** @export */
  invoke_iiiiiiiiiiii: invoke_iiiiiiiiiiii,
  /** @export */
  invoke_iiiiiiiiiiiii: invoke_iiiiiiiiiiiii,
  /** @export */
  invoke_iiiiij: invoke_iiiiij,
  /** @export */
  invoke_j: invoke_j,
  /** @export */
  invoke_ji: invoke_ji,
  /** @export */
  invoke_jii: invoke_jii,
  /** @export */
  invoke_jiiii: invoke_jiiii,
  /** @export */
  invoke_v: invoke_v,
  /** @export */
  invoke_vi: invoke_vi,
  /** @export */
  invoke_vii: invoke_vii,
  /** @export */
  invoke_viii: invoke_viii,
  /** @export */
  invoke_viiii: invoke_viiii,
  /** @export */
  invoke_viiiii: invoke_viiiii,
  /** @export */
  invoke_viiiiiii: invoke_viiiiiii,
  /** @export */
  invoke_viiiiiiiiii: invoke_viiiiiiiiii,
  /** @export */
  invoke_viiiiiiiiiiiiiii: invoke_viiiiiiiiiiiiiii,
  /** @export */
  invoke_viiji: invoke_viiji,
  /** @export */
  invoke_viijii: invoke_viijii,
  /** @export */
  llvm_eh_typeid_for: _llvm_eh_typeid_for,
  /** @export */
  proc_exit: _proc_exit,
  /** @export */
  strftime: _strftime,
  /** @export */
  strftime_l: _strftime_l,
  /** @export */
  system: _system
};
var wasmExports = createWasm();
var ___wasm_call_ctors = createExportWrapper('__wasm_call_ctors');
var __ZN15mame_ui_manager12set_show_fpsEb = Module['__ZN15mame_ui_manager12set_show_fpsEb'] = createExportWrapper('_ZN15mame_ui_manager12set_show_fpsEb');
var __ZNK15mame_ui_manager8show_fpsEv = Module['__ZNK15mame_ui_manager8show_fpsEv'] = createExportWrapper('_ZNK15mame_ui_manager8show_fpsEv');
var _malloc = Module['_malloc'] = createExportWrapper('malloc');
var _free = Module['_free'] = createExportWrapper('free');
var __ZN13sound_manager4muteEbh = Module['__ZN13sound_manager4muteEbh'] = createExportWrapper('_ZN13sound_manager4muteEbh');
var ___cxa_free_exception = createExportWrapper('__cxa_free_exception');
var ___errno_location = createExportWrapper('__errno_location');
var _htons = createExportWrapper('htons');
var _ntohs = createExportWrapper('ntohs');
var __ZN15running_machine30emscripten_get_running_machineEv = Module['__ZN15running_machine30emscripten_get_running_machineEv'] = createExportWrapper('_ZN15running_machine30emscripten_get_running_machineEv');
var __ZN15running_machine17emscripten_get_uiEv = Module['__ZN15running_machine17emscripten_get_uiEv'] = createExportWrapper('_ZN15running_machine17emscripten_get_uiEv');
var __ZN15running_machine20emscripten_get_soundEv = Module['__ZN15running_machine20emscripten_get_soundEv'] = createExportWrapper('_ZN15running_machine20emscripten_get_soundEv');
var __ZN15running_machine21emscripten_soft_resetEv = Module['__ZN15running_machine21emscripten_soft_resetEv'] = createExportWrapper('_ZN15running_machine21emscripten_soft_resetEv');
var __ZN15running_machine21emscripten_hard_resetEv = Module['__ZN15running_machine21emscripten_hard_resetEv'] = createExportWrapper('_ZN15running_machine21emscripten_hard_resetEv');
var __ZN15running_machine15emscripten_exitEv = Module['__ZN15running_machine15emscripten_exitEv'] = createExportWrapper('_ZN15running_machine15emscripten_exitEv');
var __ZN15running_machine15emscripten_saveEPKc = Module['__ZN15running_machine15emscripten_saveEPKc'] = createExportWrapper('_ZN15running_machine15emscripten_saveEPKc');
var __ZN15running_machine15emscripten_loadEPKc = Module['__ZN15running_machine15emscripten_loadEPKc'] = createExportWrapper('_ZN15running_machine15emscripten_loadEPKc');
var setTempRet0 = createExportWrapper('setTempRet0');
var _main = Module['_main'] = createExportWrapper('__main_argc_argv');
var _fflush = Module['_fflush'] = createExportWrapper('fflush');
var _SDL_PauseAudio = Module['_SDL_PauseAudio'] = createExportWrapper('SDL_PauseAudio');
var _SDL_SendKeyboardKey = Module['_SDL_SendKeyboardKey'] = createExportWrapper('SDL_SendKeyboardKey');
var _emscripten_builtin_memalign = createExportWrapper('emscripten_builtin_memalign');
var _setThrew = createExportWrapper('setThrew');
var _emscripten_stack_init = () => (_emscripten_stack_init = wasmExports['emscripten_stack_init'])();
var _emscripten_stack_get_free = () => (_emscripten_stack_get_free = wasmExports['emscripten_stack_get_free'])();
var _emscripten_stack_get_base = () => (_emscripten_stack_get_base = wasmExports['emscripten_stack_get_base'])();
var _emscripten_stack_get_end = () => (_emscripten_stack_get_end = wasmExports['emscripten_stack_get_end'])();
var stackSave = createExportWrapper('stackSave');
var stackRestore = createExportWrapper('stackRestore');
var stackAlloc = createExportWrapper('stackAlloc');
var _emscripten_stack_get_current = () => (_emscripten_stack_get_current = wasmExports['emscripten_stack_get_current'])();
var ___cxa_decrement_exception_refcount = createExportWrapper('__cxa_decrement_exception_refcount');
var ___cxa_increment_exception_refcount = createExportWrapper('__cxa_increment_exception_refcount');
var ___get_exception_message = Module['___get_exception_message'] = createExportWrapper('__get_exception_message');
var ___cxa_can_catch = createExportWrapper('__cxa_can_catch');
var ___cxa_is_pointer_type = createExportWrapper('__cxa_is_pointer_type');
var dynCall_vij = Module['dynCall_vij'] = createExportWrapper('dynCall_vij');
var dynCall_viiiij = Module['dynCall_viiiij'] = createExportWrapper('dynCall_viiiij');
var dynCall_jij = Module['dynCall_jij'] = createExportWrapper('dynCall_jij');
var dynCall_ji = Module['dynCall_ji'] = createExportWrapper('dynCall_ji');
var dynCall_jijii = Module['dynCall_jijii'] = createExportWrapper('dynCall_jijii');
var dynCall_jiij = Module['dynCall_jiij'] = createExportWrapper('dynCall_jiij');
var dynCall_viiij = Module['dynCall_viiij'] = createExportWrapper('dynCall_viiij');
var dynCall_viijii = Module['dynCall_viijii'] = createExportWrapper('dynCall_viijii');
var dynCall_jii = Module['dynCall_jii'] = createExportWrapper('dynCall_jii');
var dynCall_jiii = Module['dynCall_jiii'] = createExportWrapper('dynCall_jiii');
var dynCall_iiij = Module['dynCall_iiij'] = createExportWrapper('dynCall_iiij');
var dynCall_viij = Module['dynCall_viij'] = createExportWrapper('dynCall_viij');
var dynCall_jiiiiii = Module['dynCall_jiiiiii'] = createExportWrapper('dynCall_jiiiiii');
var dynCall_viiiiiji = Module['dynCall_viiiiiji'] = createExportWrapper('dynCall_viiiiiji');
var dynCall_jiiiii = Module['dynCall_jiiiii'] = createExportWrapper('dynCall_jiiiii');
var dynCall_viiijii = Module['dynCall_viiijii'] = createExportWrapper('dynCall_viiijii');
var dynCall_viiijjii = Module['dynCall_viiijjii'] = createExportWrapper('dynCall_viiijjii');
var dynCall_viiiiij = Module['dynCall_viiiiij'] = createExportWrapper('dynCall_viiiiij');
var dynCall_vijiiii = Module['dynCall_vijiiii'] = createExportWrapper('dynCall_vijiiii');
var dynCall_j = Module['dynCall_j'] = createExportWrapper('dynCall_j');
var dynCall_viji = Module['dynCall_viji'] = createExportWrapper('dynCall_viji');
var dynCall_viiiiijii = Module['dynCall_viiiiijii'] = createExportWrapper('dynCall_viiiiijii');
var dynCall_viiiiiiijii = Module['dynCall_viiiiiiijii'] = createExportWrapper('dynCall_viiiiiiijii');
var dynCall_viijj = Module['dynCall_viijj'] = createExportWrapper('dynCall_viijj');
var dynCall_iiijj = Module['dynCall_iiijj'] = createExportWrapper('dynCall_iiijj');
var dynCall_viiijifi = Module['dynCall_viiijifi'] = createExportWrapper('dynCall_viiijifi');
var dynCall_viiiiijifi = Module['dynCall_viiiiijifi'] = createExportWrapper('dynCall_viiiiijifi');
var dynCall_viiji = Module['dynCall_viiji'] = createExportWrapper('dynCall_viiji');
var dynCall_viijiii = Module['dynCall_viijiii'] = createExportWrapper('dynCall_viijiii');
var dynCall_iiji = Module['dynCall_iiji'] = createExportWrapper('dynCall_iiji');
var dynCall_iiiij = Module['dynCall_iiiij'] = createExportWrapper('dynCall_iiiij');
var dynCall_iij = Module['dynCall_iij'] = createExportWrapper('dynCall_iij');
var dynCall_iijii = Module['dynCall_iijii'] = createExportWrapper('dynCall_iijii');
var dynCall_iiiiiij = Module['dynCall_iiiiiij'] = createExportWrapper('dynCall_iiiiiij');
var dynCall_iiiiijii = Module['dynCall_iiiiijii'] = createExportWrapper('dynCall_iiiiijii');
var dynCall_jj = Module['dynCall_jj'] = createExportWrapper('dynCall_jj');
var dynCall_iiiiji = Module['dynCall_iiiiji'] = createExportWrapper('dynCall_iiiiji');
var dynCall_iiiijii = Module['dynCall_iiiijii'] = createExportWrapper('dynCall_iiiijii');
var dynCall_ij = Module['dynCall_ij'] = createExportWrapper('dynCall_ij');
var dynCall_jiji = Module['dynCall_jiji'] = createExportWrapper('dynCall_jiji');
var dynCall_vijii = Module['dynCall_vijii'] = createExportWrapper('dynCall_vijii');
var dynCall_iiiiij = Module['dynCall_iiiiij'] = createExportWrapper('dynCall_iiiiij');
var dynCall_jiiii = Module['dynCall_jiiii'] = createExportWrapper('dynCall_jiiii');
var dynCall_iiiiijj = Module['dynCall_iiiiijj'] = createExportWrapper('dynCall_iiiiijj');
var dynCall_iiiiiijj = Module['dynCall_iiiiiijj'] = createExportWrapper('dynCall_iiiiiijj');
var ___emscripten_embedded_file_data = Module['___emscripten_embedded_file_data'] = 10667884;
function invoke_vii(index, a1, a2) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1, a2);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_vi(index, a1) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iii(index, a1, a2) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1, a2);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_v(index) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)();
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_ii(index, a1) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_viii(index, a1, a2, a3) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1, a2, a3);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiii(index, a1, a2, a3) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1, a2, a3);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_viiiii(index, a1, a2, a3, a4, a5) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1, a2, a3, a4, a5);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_viiii(index, a1, a2, a3, a4) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1, a2, a3, a4);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiiii(index, a1, a2, a3, a4) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1, a2, a3, a4);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_i(index) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)();
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiiiiii(index, a1, a2, a3, a4, a5, a6) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1, a2, a3, a4, a5, a6);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiiiii(index, a1, a2, a3, a4, a5) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1, a2, a3, a4, a5);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiiiid(index, a1, a2, a3, a4, a5) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1, a2, a3, a4, a5);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1, a2, a3, a4, a5, a6, a7);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiiiiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_fiii(index, a1, a2, a3) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1, a2, a3);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_diii(index, a1, a2, a3) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1, a2, a3);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_viiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1, a2, a3, a4, a5, a6, a7);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiiiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_viiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_viiiiiiiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_viiji(index, a1, a2, a3, a4, a5) {
  var sp = stackSave();
  try {
    dynCall_viiji(index, a1, a2, a3, a4, a5);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_j(index) {
  var sp = stackSave();
  try {
    return dynCall_j(index);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_ji(index, a1) {
  var sp = stackSave();
  try {
    return dynCall_ji(index, a1);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_jii(index, a1, a2) {
  var sp = stackSave();
  try {
    return dynCall_jii(index, a1, a2);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_viijii(index, a1, a2, a3, a4, a5, a6) {
  var sp = stackSave();
  try {
    dynCall_viijii(index, a1, a2, a3, a4, a5, a6);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiiiij(index, a1, a2, a3, a4, a5, a6) {
  var sp = stackSave();
  try {
    return dynCall_iiiiij(index, a1, a2, a3, a4, a5, a6);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_jiiii(index, a1, a2, a3, a4) {
  var sp = stackSave();
  try {
    return dynCall_jiiii(index, a1, a2, a3, a4);
  } catch (e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}


// include: postamble.js
// === Auto-generated postamble setup entry stuff ===

Module['addRunDependency'] = addRunDependency;
Module['removeRunDependency'] = removeRunDependency;
Module['FS_createPath'] = FS.createPath;
Module['FS_createLazyFile'] = FS.createLazyFile;
Module['FS_createDevice'] = FS.createDevice;
Module['cwrap'] = cwrap;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_unlink'] = FS.unlink;
var missingLibrarySymbols = [
  'writeI53ToI64Clamped',
  'writeI53ToI64Signaling',
  'writeI53ToU64Clamped',
  'writeI53ToU64Signaling',
  'convertPCtoSourceLocation',
  'jstoi_s',
  'getDynCaller',
  'runtimeKeepalivePush',
  'runtimeKeepalivePop',
  'asmjsMangle',
  'handleAllocatorInit',
  'HandleAllocator',
  'getNativeTypeSize',
  'STACK_SIZE',
  'STACK_ALIGN',
  'POINTER_SIZE',
  'ASSERTIONS',
  'uleb128Encode',
  'sigToWasmTypes',
  'generateFuncType',
  'convertJsFunctionToWasm',
  'getEmptyTableSlot',
  'updateTableMap',
  'getFunctionAddress',
  'addFunction',
  'removeFunction',
  'intArrayToString',
  'AsciiToString',
  'UTF16ToString',
  'stringToUTF16',
  'lengthBytesUTF16',
  'UTF32ToString',
  'stringToUTF32',
  'lengthBytesUTF32',
  'fillDeviceOrientationEventData',
  'registerDeviceOrientationEventCallback',
  'fillDeviceMotionEventData',
  'registerDeviceMotionEventCallback',
  'screenOrientation',
  'fillOrientationChangeEventData',
  'registerOrientationChangeEventCallback',
  'hideEverythingExceptGivenElement',
  'restoreHiddenElements',
  'softFullscreenResizeWebGLRenderTarget',
  'registerPointerlockErrorEventCallback',
  'fillBatteryEventData',
  'battery',
  'registerBatteryEventCallback',
  'stackTrace',
  'checkWasiClock',
  'wasiRightsToMuslOFlags',
  'wasiOFlagsToMuslOFlags',
  'createDyncallWrapper',
  'setImmediateWrapped',
  'clearImmediateWrapped',
  'polyfillSetImmediate',
  'getPromise',
  'makePromise',
  'idsToPromises',
  'makePromiseCallback',
  'Browser_asyncPrepareDataCounter',
  'FS_mkdirTree',
  '_setNetworkCallback',
  'writeGLArray',
  'registerWebGlEventCallback',
  'runAndAbortIfError',
  'ALLOC_NORMAL',
  'ALLOC_STACK',
  'allocate',
  'writeStringToMemory',
  'writeAsciiToMemory',
];
missingLibrarySymbols.forEach(missingLibrarySymbol)

var unexportedSymbols = [
  'run',
  'addOnPreRun',
  'addOnInit',
  'addOnPreMain',
  'addOnExit',
  'addOnPostRun',
  'FS_createFolder',
  'FS_createLink',
  'FS_readFile',
  'out',
  'err',
  'callMain',
  'abort',
  'wasmMemory',
  'wasmExports',
  'stackAlloc',
  'stackSave',
  'stackRestore',
  'getTempRet0',
  'setTempRet0',
  'writeStackCookie',
  'checkStackCookie',
  'writeI53ToI64',
  'readI53FromI64',
  'readI53FromU64',
  'convertI32PairToI53',
  'convertI32PairToI53Checked',
  'convertU32PairToI53',
  'ptrToString',
  'zeroMemory',
  'exitJS',
  'getHeapMax',
  'growMemory',
  'ENV',
  'MONTH_DAYS_REGULAR',
  'MONTH_DAYS_LEAP',
  'MONTH_DAYS_REGULAR_CUMULATIVE',
  'MONTH_DAYS_LEAP_CUMULATIVE',
  'isLeapYear',
  'ydayFromDate',
  'arraySum',
  'addDays',
  'ERRNO_CODES',
  'ERRNO_MESSAGES',
  'setErrNo',
  'inetPton4',
  'inetNtop4',
  'inetPton6',
  'inetNtop6',
  'readSockaddr',
  'writeSockaddr',
  'DNS',
  'getHostByName',
  'Protocols',
  'Sockets',
  'initRandomFill',
  'randomFill',
  'timers',
  'warnOnce',
  'getCallstack',
  'emscriptenLog',
  'UNWIND_CACHE',
  'readEmAsmArgsArray',
  'readEmAsmArgs',
  'runEmAsmFunction',
  'runMainThreadEmAsm',
  'jstoi_q',
  'getExecutableName',
  'listenOnce',
  'autoResumeAudioContext',
  'dynCallLegacy',
  'dynCall',
  'handleException',
  'keepRuntimeAlive',
  'callUserCallback',
  'maybeExit',
  'asyncLoad',
  'alignMemory',
  'mmapAlloc',
  'wasmTable',
  'noExitRuntime',
  'getCFunc',
  'ccall',
  'freeTableIndexes',
  'functionsInTableMap',
  'reallyNegative',
  'unSign',
  'strLen',
  'reSign',
  'formatString',
  'setValue',
  'getValue',
  'PATH',
  'PATH_FS',
  'UTF8Decoder',
  'UTF8ArrayToString',
  'UTF8ToString',
  'stringToUTF8Array',
  'stringToUTF8',
  'lengthBytesUTF8',
  'intArrayFromString',
  'stringToAscii',
  'UTF16Decoder',
  'stringToNewUTF8',
  'stringToUTF8OnStack',
  'writeArrayToMemory',
  'JSEvents',
  'registerKeyEventCallback',
  'specialHTMLTargets',
  'maybeCStringToJsString',
  'findEventTarget',
  'findCanvasEventTarget',
  'getBoundingClientRect',
  'fillMouseEventData',
  'registerMouseEventCallback',
  'registerWheelEventCallback',
  'registerUiEventCallback',
  'registerFocusEventCallback',
  'fillFullscreenChangeEventData',
  'registerFullscreenChangeEventCallback',
  'JSEvents_requestFullscreen',
  'JSEvents_resizeCanvasForFullscreen',
  'registerRestoreOldStyle',
  'setLetterbox',
  'currentFullscreenStrategy',
  'restoreOldWindowedStyle',
  'doRequestFullscreen',
  'fillPointerlockChangeEventData',
  'registerPointerlockChangeEventCallback',
  'requestPointerLock',
  'fillVisibilityChangeEventData',
  'registerVisibilityChangeEventCallback',
  'registerTouchEventCallback',
  'fillGamepadEventData',
  'registerGamepadEventCallback',
  'disableGamepadApiIfItThrows',
  'registerBeforeUnloadEventCallback',
  'setCanvasElementSize',
  'getCanvasElementSize',
  'demangle',
  'demangleAll',
  'jsStackTrace',
  'ExitStatus',
  'getEnvStrings',
  'doReadv',
  'doWritev',
  'safeSetTimeout',
  'promiseMap',
  'uncaughtExceptionCount',
  'exceptionLast',
  'exceptionCaught',
  'ExceptionInfo',
  'findMatchingCatch',
  'getExceptionMessageCommon',
  'incrementExceptionRefcount',
  'decrementExceptionRefcount',
  'getExceptionMessage',
  'Browser',
  'setMainLoop',
  'wget',
  'SYSCALLS',
  'getSocketFromFD',
  'getSocketAddress',
  'preloadPlugins',
  'FS_modeStringToFlags',
  'FS_getMode',
  'FS_stdin_getChar_buffer',
  'FS_stdin_getChar',
  'FS',
  'MEMFS',
  'TTY',
  'PIPEFS',
  'SOCKFS',
  'tempFixedLengthArray',
  'miniTempWebGLFloatBuffers',
  'miniTempWebGLIntBuffers',
  'heapObjectForWebGLType',
  'heapAccessShiftForWebGLHeap',
  'webgl_enable_ANGLE_instanced_arrays',
  'webgl_enable_OES_vertex_array_object',
  'webgl_enable_WEBGL_draw_buffers',
  'webgl_enable_WEBGL_multi_draw',
  'GL',
  'emscriptenWebGLGet',
  'computeUnpackAlignedImageSize',
  'colorChannelsInGlTextureFormat',
  'emscriptenWebGLGetTexPixelData',
  '__glGenObject',
  'emscriptenWebGLGetUniform',
  'webglGetUniformLocation',
  'webglPrepareUniformLocationsBeforeFirstUse',
  'webglGetLeftBracePos',
  'emscriptenWebGLGetVertexAttrib',
  '__glGetActiveAttribOrUniform',
  'emscripten_webgl_power_preferences',
  'AL',
  'GLUT',
  'EGL',
  'GLEW',
  'IDBStore',
  'emscriptenWebGLGetIndexed',
  'webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance',
  'webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance',
  'GLEmulation',
  'GLImmediate',
  'GLImmediateSetup',
  'emulGlGenVertexArrays',
  'emulGlDeleteVertexArrays',
  'emulGlIsVertexArray',
  'emulGlBindVertexArray',
  'allocateUTF8',
  'allocateUTF8OnStack',
];
unexportedSymbols.forEach(unexportedRuntimeSymbol);



var calledRun;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!calledRun) run();
  if (!calledRun) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
};

function callMain(args = []) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on Module["onRuntimeInitialized"])');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  var entryFunction = _main;

  args.unshift(thisProgram);

  var argc = args.length;
  var argv = stackAlloc((argc + 1) * 4);
  var argv_ptr = argv;
  args.forEach((arg) => {
    HEAPU32[((argv_ptr) >> 2)] = stringToUTF8OnStack(arg);
    argv_ptr += 4;
  });
  HEAPU32[((argv_ptr) >> 2)] = 0;

  try {

    var ret = entryFunction(argc, argv);

    // if we're not running an evented main loop, it's time to exit
    exitJS(ret, /* implicit = */ true);
    return ret;
  }
  catch (e) {
    return handleException(e);
  }
}

function stackCheckInit() {
  // This is normally called automatically during __wasm_call_ctors but need to
  // get these values before even running any of the ctors so we call it redundantly
  // here.
  _emscripten_stack_init();
  // TODO(sbc): Move writeStackCookie to native to to avoid this.
  writeStackCookie();
}

function run(args = arguments_) {

  if (runDependencies > 0) {
    return;
  }

  stackCheckInit();

  preRun();

  // a preRun added a dependency, run will be called later
  if (runDependencies > 0) {
    return;
  }

  function doRun() {
    // run may have just been called through dependencies being fulfilled just in this very frame,
    // or while the async setStatus time below was happening
    if (calledRun) return;
    calledRun = true;
    Module['calledRun'] = true;

    if (ABORT) return;

    initRuntime();

    preMain();

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (shouldRunNow) callMain(args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function () {
      setTimeout(function () {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in SYSCALLS_REQUIRE_FILESYSTEM=0
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var oldOut = out;
  var oldErr = err;
  var has = false;
  out = err = (x) => {
    has = true;
  }
  try { // it doesn't matter if it fails
    _fflush(0);
    // also flush in the JS FS layer
    ['stdout', 'stderr'].forEach(function (name) {
      var info = FS.analyzePath('/dev/' + name);
      if (!info) return;
      var stream = info.object;
      var rdev = stream.rdev;
      var tty = TTY.ttys[rdev];
      if (tty?.output?.length) {
        has = true;
      }
    });
  } catch (e) { }
  out = oldOut;
  err = oldErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the Emscripten FAQ), or make sure to emit a newline when you printf etc.');
  }
}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;

if (Module['noInitialRun']) shouldRunNow = false;

run();


// end include: postamble.js
// include: c:\dev\ample\mame_build\mame\scripts\resources\emscripten\emscripten_post.js
// MAME-JavaScript function mappings
var JSMAME = JSMAME || {};
JSMAME.get_machine = Module.cwrap('_ZN15running_machine30emscripten_get_running_machineEv', 'number');
JSMAME.get_ui = Module.cwrap('_ZN15running_machine17emscripten_get_uiEv', 'number');
JSMAME.get_sound = Module.cwrap('_ZN15running_machine20emscripten_get_soundEv', 'number');
JSMAME.ui_set_show_fps = Module.cwrap('_ZN15mame_ui_manager12set_show_fpsEb', '', ['number', 'number']);
JSMAME.ui_get_show_fps = Module.cwrap('_ZNK15mame_ui_manager8show_fpsEv', 'number', ['number']);
JSMAME.sound_manager_mute = Module.cwrap('_ZN13sound_manager4muteEbh', '', ['number', 'number', 'number']);
JSMAME.sdl_pauseaudio = Module.cwrap('SDL_PauseAudio', '', ['number']);
JSMAME.sdl_sendkeyboardkey = Module.cwrap('SDL_SendKeyboardKey', '', ['number', 'number']);

JSMAME.soft_reset = Module.cwrap('_ZN15running_machine21emscripten_soft_resetEv', null);
JSMAME.hard_reset = Module.cwrap('_ZN15running_machine21emscripten_hard_resetEv', null);
JSMAME.exit = Module.cwrap('_ZN15running_machine15emscripten_exitEv', null, []);
JSMAME.save = Module.cwrap('_ZN15running_machine15emscripten_saveEPKc', null, ['string']);
JSMAME.load = Module.cwrap('_ZN15running_machine15emscripten_loadEPKc', null, ['string']);

var JSMESS = JSMAME;

// end include: c:\dev\ample\mame_build\mame\scripts\resources\emscripten\emscripten_post.js
