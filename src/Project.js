// Copyright 2012 Traceur Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {options} from './options';
import {ErrorReporter} from './util/ErrorReporter';
import {TraceurLoader} from './runtime/TraceurLoader';
import {LoaderHooks} from './runtime/LoaderHooks';
import {Script} from './syntax/trees/ParseTrees';
import {SourceMapGenerator} from './outputgeneration/SourceMapIntegration'
import {TreeWriter} from './outputgeneration/TreeWriter'

var getOwnHashObject = $traceurRuntime.getOwnHashObject;
var $hasOwnProperty = Object.prototype.hasOwnProperty;
var globalNum = 0;

function normalizePath(s) {
  return s.replace(/\\/g, '/');
}

function clone(obj) {
  var ret = [];
  Object.keys(obj).forEach(key => {
    ret[key] = obj[key];
  });
  return ret;
}

class SinkErrorReporter extends ErrorReporter {
  constructor() {
    this.errors_ = [];
  }
  
  reportMessageInternal(location, message) {
    if (location) {
      message = `${location}: ${message}`;
    }
    this.errors_.push({location, message});
  }
  
  get errors() {
    return [for (e of this.errors_) e];
  }
  
  clearError() {
    super.clearError();
    this.errors_ = [];
  }
}

class ProjectLoader extends TraceurLoader {
  constructor(files, reporter) {
    super(new ProjectLoaderHooks(reporter, this));
    this.files_ = files;
    this.elements_ = [];
  }
  
  fetch_(url) {
    return new Promise((resolve, reject) => {
      for(var i = 0, l = this.files_.length; i < l; i++) {
        var f = this.files_[i];
        if(f.name === url) {
          resolve(f.content);
          return;
        }
      }
      reject(new Error('File not found in project'));
    });
  }
}

class ProjectLoaderHooks extends LoaderHooks {
  constructor(reporter, loader) {
    super(reporter);
    this.loader_ = loader;
  }
  
  evaluateCodeUnit(codeUnit) {
    // Don't eval. Instead append the trees to the output.
    var tree = codeUnit.metadata.transformedTree;
    this.loader_.elements_.push.apply(this.loader_.elements_, tree.scriptItemList);
  }

  fetch(codeUnit) {
    return this.loader_.fetch_(codeUnit.url);
  }
}

function allLoaded(elements) {
  return new Script(null, elements);
}

function inlineAndCompile(files, options, reporter) {
  return new Promise((resolve, reject) => {
    var scriptCount = files.length;
    
    var loadCount = 0;
    var loader = new ProjectLoader(files, reporter);
    
    function appendEvaluateModule(name, referrerName) {
      var normalizedName =
        traceur.ModuleStore.normalize(name, referrerName);
      // Create tree for System.get('normalizedName');
      var tree =
        traceur.codegeneration.module.createModuleEvaluationStatement(normalizedName);
      loader.elements_.push(tree);
    }
    
    function loadNext() {
      var loadAsScript = false //files.length && (loadCount < files.length);
      loader.addElement(tree);
    }
    
    function loadNext() {
      var loadAsScript = scriptsCount && (loadCount < scriptsCount);
      var doEvaluateModule = false;
      var loadFunction = loader.import;
      var file = files[loadCount];
      var name = file.name;
      if (loadAsScript) {
        loadFunction = loader.loadAsScript;
      } else {
        name = name.replace(/\.js$/,'');
        if (options.modules !== 'inline' && options.modules !== 'instantiate')
          doEvaluateModule = true;
      }
      var loadOptions = {referrerName: options.referrer, address: name};
      loadFunction.call(loader, name, loadOptions).then(() => {
        if (doEvaluateModule) {
          appendEvaluateModule(name, options.referrer);
        }
        loadCount++;
        if (loadCount < files.length) {
          loadNext();
        } else {
          var tree = allLoaded(loader.elements_);
          resolve(tree);
        }
      }, reject);
    }

    loadNext();
  });
}

export class Project {
  constructor() {
    // if any global options are set before the Project is created,
    // it keeps those.
    this.options_ = clone(options);
    this.files_ = [];
    this.fileNames_ = new Map();
  }
  
  addFile(content, name = undefined) {
    if(name !== undefined) {
      if(this.fileNames_.has(name)) {
        throw new Error('Name already in use');
      }
      this.fileNames_.set(name, true);
    } else {
      do {
        name = `_@${++globalNum}.js`;
      } while(this.fileNames_.has(name));
      this.fileNames_.set(name, true);
    }

    this.files_.push({content, name});
  }
  
  compile() {
    var reporter = new SinkErrorReporter();
    return inlineAndCompile(this.files_, this.options_, reporter).then(tree => {
      var options;
      if(this.options_.sourceMap) {
        var sourceMapGenerator = new SourceMapGenerator({
          
        });
        options = {sourceMapGenerator: sourceMapGenerator};
      }
      
      return {
        js: TreeWriter.write(tree, options),
        errors: reporter.errors,
        sourceMap: (options || {}).sourceMap || null
      };
    });
  }
}