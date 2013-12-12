// Copyright 2013 Traceur Authors.
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

'use strict';

var fs = require('q-io/fs');

var writeTreeToFile = require('./compiler.js').writeTreeToFile;

var traceur = require('./traceur.js');
var ErrorReporter = traceur.util.ErrorReporter;
var FromOptionsTransformer = traceur.codegeneration.FromOptionsTransformer;
var Parser = traceur.syntax.Parser;
var SourceFile = traceur.syntax.SourceFile;

function compileSingleFile(inputFilePath, outputFilePath) {
  return fs.read(inputFilePath).then(function(contents) {
    var reporter = new ErrorReporter();
    var sourceFile = new SourceFile(inputFilePath, contents);
    var parser = new Parser(reporter, sourceFile);
    var tree = parser.parseModule();
    var transformer = new FromOptionsTransformer(reporter);
    var transformed = transformer.transform(tree);

    if (!reporter.hadError()) {
      writeTreeToFile(transformed, outputFilePath);
    }
  });
}


if (process.argv.length < 4) {
  console.log('Not enough arguments!\n' +
              '  Ussage node src/node/to-requirejs-compiler.js <inputDirectory> <outputDirectory>');
  process.exit(1);
}

// Nasty, we should rather pass the options to FromOptionsTransformer
var options = traceur.options;
options.modules = 'parse';
options.requireJsModules = true;


var inputDir = process.argv[2];
var outputDir = process.argv[3];

function onlyJsFiles(path, stat) {
  return stat.isFile() && /\.js$/.test(path) || false;
};

fs.listTree(inputDir, onlyJsFiles).then(function(files) {
  files.forEach(function(inputFilePath) {
    var outputFilePath = inputFilePath.replace(inputDir, outputDir);
    compileSingleFile(inputFilePath, outputFilePath).done();
  });
}).done();