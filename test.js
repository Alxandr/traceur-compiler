var traceur = require('./');
var project = new traceur.Project();
project.addFile('export var a = 5;', 'test1.js');
project.addFile('import {a} from "./test1"; export var b = a + 5;', 'test2.js');
project.compile().then(function(result) {
  console.log(result);
  debugger;
}).catch(function(err) {
  console.log(err.stack);
});