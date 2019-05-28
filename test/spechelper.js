var Cache,
  ClientRequest,
  FileKeyValueStorage,
  KeyValueCacheAdapter,
  Q,
  allExamples,
  api_http,
  cloneDeep,
  cloudinary,
  config,
  expect,
  http,
  https,
  isEmpty,
  isFunction,
  last,
  libPath,
  querystring,
  ref,
  sharedExamples,
  sinon,
  utils;

expect = require('expect.js');

isFunction = require('lodash/isFunction');

cloneDeep = require('lodash/cloneDeep');

libPath = exports.libPath = Number(process.versions.node.split('.')[0]) < 8 ? 'lib-es5' : 'lib';

cloudinary = require("../cloudinary");

({ utils, config, Cache } = cloudinary);

({ isEmpty, last } = utils);

FileKeyValueStorage = require(`../${libPath}/cache/FileKeyValueStorage`);

KeyValueCacheAdapter = require(`../${libPath}/cache/KeyValueCacheAdapter`);

http = require('http');

https = require('https');

if (config().upload_prefix && config().upload_prefix.slice(0, 5) === 'http:') {
  api_http = http;
} else {
  api_http = https;
}

querystring = require('querystring');

sinon = require('sinon');

ClientRequest = require('_http_client').ClientRequest;

Q = require('q');

exports.TIMEOUT_SHORT = 5000;

exports.TIMEOUT_MEDIUM = 20000;

exports.TIMEOUT_LONG = 50000;

exports.SUFFIX = (ref = process.env.TRAVIS_JOB_ID) != null ? ref : Math.floor(Math.random() * 999999);

exports.SDK_TAG = "SDK_TEST"; // identifies resources created by all SDKs tests

exports.TEST_TAG_PREFIX = "cloudinary_npm_test"; // identifies resources created by this SDK's tests

exports.TEST_TAG = exports.TEST_TAG_PREFIX + "_" + exports.SUFFIX; // identifies resources created in the current test run

exports.UPLOAD_TAGS = [exports.TEST_TAG, exports.TEST_TAG_PREFIX, exports.SDK_TAG];

exports.IMAGE_FILE = "test/resources/logo.png";

exports.LARGE_RAW_FILE = "test/resources/TheCompleteWorksOfShakespeare.mobi";

exports.LARGE_VIDEO = "test/resources/CloudBookStudy-HD.mp4";

exports.EMPTY_IMAGE = "test/resources/empty.gif";

exports.RAW_FILE = "test/resources/docx.docx";

exports.ICON_FILE = "test/resources/favicon.ico";

exports.IMAGE_URL = "http://res.cloudinary.com/demo/image/upload/sample";

exports.test_cloudinary_url = function (public_id, options, expected_url, expected_options) {
  var url;
  url = utils.url(public_id, options);
  expect(url).to.eql(expected_url);
  expect(options).to.eql(expected_options);
  return url;
};

expect.Assertion.prototype.produceUrl = function (url) {
  var actual, actualOptions, options, public_id;
  [public_id, options] = this.obj;
  actualOptions = cloneDeep(options);
  actual = utils.url(public_id, actualOptions);
  this.assert(actual.match(url), function () {
    return `expected '${public_id}' and ${JSON.stringify(options)} to produce '${url}' but got '${actual}'`;
  }, function () {
    return `expected '${public_id}' and ${JSON.stringify(options)} not to produce '${url}' but got '${actual}'`;
  });
  return this;
};

expect.Assertion.prototype.emptyOptions = function () {
  var actual, options, public_id;
  [public_id, options] = this.obj;
  actual = cloneDeep(options);
  utils.url(public_id, actual);
  this.assert(isEmpty(actual), function () {
    return `expected '${public_id}' and ${JSON.stringify(options)} to produce empty options but got ${JSON.stringify(actual)}`;
  }, function () {
    return `expected '${public_id}' and ${JSON.stringify(options)} not to produce empty options`;
  });
  return this;
};

expect.Assertion.prototype.beServedByCloudinary = function (done) {
  var actual, actualOptions, callHttp, options, public_id;
  [public_id, options] = this.obj;
  actualOptions = cloneDeep(options);
  actual = utils.url(public_id, actualOptions);
  if (actual.startsWith("https")) {
    callHttp = https;
  } else {
    callHttp = http;
  }
  callHttp.get(actual, (res) => {
    this.assert(res.statusCode === 200, function () {
      return `Expected to get ${actual} but server responded with "${res.statusCode}: ${res.headers['x-cld-error']}"`;
    }, function () {
      return `Expeted not to get ${actual}.`;
    });
    return done();
  });
  return this;
};

allExamples = null;

sharedExamples = (function (allExamples, isFunction) {
  return function (name, examples) {
    if (allExamples == null) {
      allExamples = {};
    }
    if (isFunction(examples)) {
      allExamples[name] = examples;
      return examples;
    } else {
      if (allExamples[name] != null) {
        return allExamples[name];
      } else {
        return function () {
          return console.log(`Shared example ${name} was not found!`);
        };
      }
    }
  };
})(allExamples, isFunction);

exports.sharedExamples = exports.sharedContext = sharedExamples;

exports.itBehavesLike = function (name, ...args) {
  return context(`behaves like ${name}`, function () {
    return sharedExamples(name).apply(this, args);
  });
};

exports.includeContext = function (name, ...args) {
  return sharedExamples(name).apply(this, args);
};

/**
Create a matcher method for upload parameters
@private
@function helper.paramMatcher
@param {string} name the parameter name
@param value {Any} the parameter value
@return {(arg)->Boolean} the matcher function
*/
exports.uploadParamMatcher = function (name, value) {
  return function (arg) {
    var return_part;
    return_part = 'Content-Disposition: form-data; name="' + name + '"\r\n\r\n';
    return_part += String(value);
    return arg.indexOf(return_part) + 1;
  };
};

/**
  Create a matcher method for api parameters
  @private
  @function helper.apiParamMatcher
  @param {string} name the parameter name
  @param value {Any} the parameter value
  @return {(arg)->Boolean} the matcher function
*/
exports.apiParamMatcher = function (name, value) {
  var expected, params;
  params = {};
  params[name] = value;
  expected = querystring.stringify(params);
  return function (arg) {
    return new RegExp(expected).test(arg);
  };
};

/**
  Escape RegExp characters
  @private
  @param {string} s the string to escape
  @return a new escaped string
*/
exports.escapeRegexp = function (s) {
  return s.replace(/[{\[\].*+()}]/g, c => '\\' + c);
};

/**
@function mockTest
@nodoc
Provides a wrapper for mocked tests. Must be called in a `describe` context.
@example
<pre>
const mockTest = require('./spechelper').mockTest
describe("some topic", function() {
  mocked = mockTest()
  it("should do something" function() {
    options.access_control = [acl];
    cloudinary.v2.api.update("id", options);
    sinon.assert.calledWith(mocked.writeSpy, sinon.match(function(arg) {
      return helper.apiParamMatcher('access_control', "[" + acl_string + "]")(arg);
  })
);
</pre>
@return {object} the mocked objects: `xhr`, `write`, `request`
*/
exports.mockTest = function () {
  var mocked;
  mocked = {};
  before(function () {
    mocked.xhr = sinon.useFakeXMLHttpRequest();
    mocked.write = sinon.spy(ClientRequest.prototype, 'write');
    return mocked.request = sinon.spy(api_http, 'request');
  });
  after(function () {
    mocked.request.restore();
    mocked.write.restore();
    return mocked.xhr.restore();
  });
  return mocked;
};

/**
@callback mockBlock
A test block
@param xhr
@param writeSpy
@param requestSpy
@return {*} a promise or a value
*/
/**
@function mockPromise
Wraps the test to be mocked using a promise.
Can be called inside `it` functions
@param {mockBlock} the test function, accepting (xhr, write, request)
@return {Promise}
*/
exports.mockPromise = function (mockBlock) {
  var requestSpy, writeSpy, xhr;
  xhr = void 0;
  writeSpy = void 0;
  requestSpy = void 0;
  return Q.Promise(function (resolve, reject, notify) {
    var mock, result;
    xhr = sinon.useFakeXMLHttpRequest();
    writeSpy = sinon.spy(ClientRequest.prototype, 'write');
    requestSpy = sinon.spy(api_http, 'request');
    mock = { xhr, writeSpy, requestSpy };
    result = mockBlock(xhr, writeSpy, requestSpy);
    if (isFunction(result != null ? result.then : void 0)) {
      return result.then(resolve);
    } else {
      return resolve(result);
    }
  }).finally(function () {
    requestSpy.restore();
    writeSpy.restore();
    return xhr.restore();
  }).done();
};

exports.setupCache = function () {
  if (!Cache.getAdapter()) {
    Cache.setAdapter(new KeyValueCacheAdapter(new FileKeyValueStorage()));
  }
};

/**
  Upload an image to be tested on.
  @callback the callback receives the public_id of the uploaded image
*/
exports.uploadImage = function (options) {
  return cloudinary.v2.uploader.upload(exports.IMAGE_FILE, options);
};
