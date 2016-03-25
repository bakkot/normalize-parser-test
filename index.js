"use strict";
// import reduce, {MonoidalReducer} from 'shift-reducer';
// import {parseModule, parseScript, Tokenizer} from 'shift-parser';
// import {keyword} from 'esutils';
const parser = require('shift-parser');
const parseScript = parser.parseScript;
const parseModule = parser.parseModule;
const Tokenizer = parser.Tokenizer;
const reducer = require('shift-reducer');
const reduce = reducer.default
const MonoidalReducer = reducer.MonoidalReducer;
const keyword = require('esutils').keyword;


let commonWords = ['async', 'get', 'set', 'Infinity', 'NaN', 'constructor', 'prototype', 'default'];

function isInterestingName(str) {
  return Array.from(str).some(x => x.charCodeAt(0) >= 128) || str.match(/__|\\|\n|\r/) || str === '*default*' || keyword.isRestrictedWord(str) || keyword.isKeywordES6(str, true) || keyword.isReservedWordES6(str, true) || commonWords.indexOf(str) !== -1;
}

function isInterestingString(str) {
  return str === '' || str[0].match(/[0-9]/) || str.match(/[^0-9a-zA-Z_-]/) || isInterestingName(str);
}

function isInterestingNumber(str) {
  return str !== '0' && (str.length > 8 || str[0] === '0' || str.match(/[^0-9]/));
}

function toBase(n, b) {
  if (n === 0) return [0];
  var out = [];
  do {
    out.unshift(n % b);
    n = Math.floor(n/b);
  } while (n > 0)
  return out;
}

function extract(src, loc) {
  return src.substring(loc.start.offset, loc.end.offset);
}

function getOffsetOfLabel(src) { // todo replace with getTokenLoc
  var t = new Tokenizer(src);
  t.lex();
  t.lex();
  return t.lex().slice.start;
}

function getTokenLoc(src, nodeLoc, tokenNumber) {
  var modSrc = extract(src, nodeLoc);
  var t = new Tokenizer(modSrc);
  t.lex();

  var slice;
  if (tokenNumber === -1) {
    while (!t.eof()) {
      slice = t.lex().slice;
    }
  } else {
    for (var i = 0; i < tokenNumber; ++i) {
      t.lex();
    }
    slice = t.lex().slice;
  }

  return {start: {offset: nodeLoc.start.offset + slice.start}, end: {offset: nodeLoc.start.offset + slice.end}};
}

function* nameGen(){
  var chars = ' abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var counter = 0;
  while (true) {
    ++counter;
    var ns = toBase(counter, chars.length);
    if (ns.some(x => x === 0)) continue; // dumb, but works; todo fix before using with large programs
    var word = ns.map(x => chars[x]).join('');
    if (isInterestingName(word)) continue;
    yield word;
  }
}


function NormalizingReducer(src) { // TODO replace with an ES6 class, set engines field

  var red = new MonoidalReducer({empty: ()=>[], concat: function(b){return this.concat(b)}});
  var sup = MonoidalReducer.prototype;

  var seen = new Map;
  var gen = nameGen();

  var offset = 0;
  var numberCounter = 1;
  Object.defineProperty(red, 'reduceBindingIdentifier', {value: function(node, obj) {
    if (node.loc && !isInterestingName(extract(src, node.loc))) {
      var name;
      if (seen.has(node.name)) {
        name = seen.get(node.name);
      } else {
        name = gen.next().value;
        seen.set(node.name, name);
      }
      return [{offset: node.loc.start.offset, length: node.loc.end.offset - node.loc.start.offset, value: name}];
    }
    return [];
  }});
  Object.defineProperty(red, 'reduceIdentifierExpression', {value: function(node, obj) {
    if (node.loc && !isInterestingName(extract(src, node.loc))) {
      var name;
      if (seen.has(node.name)) {
        name = seen.get(node.name);
      } else {
        name = gen.next().value;
        seen.set(node.name, name);
      }
      return [{offset: node.loc.start.offset, length: node.loc.end.offset - node.loc.start.offset, value: name}];
    }
    return [];
  }});
  Object.defineProperty(red, 'reduceLiteralNumericExpression', {value: function(node, obj) {
    var rawValue = extract(src, node.loc);
    if (!isInterestingNumber(rawValue)) {
      var value;
      if (seen.has(rawValue)) {
        value = seen.get(rawValue);
      } else {
        value = '' + numberCounter++;
        //seen.set(rawValue, value); // todo consider if we want number duplication
      }
      return [{offset: node.loc.start.offset, length: node.loc.end.offset - node.loc.start.offset, value: value}];
    }
    return [];
  }});
  Object.defineProperty(red, 'reduceLiteralStringExpression', {value: function(node, obj) {
    var rawValue = extract(src, node.loc);
    if (!isInterestingString(rawValue.slice(1, -1))) {
      var value;
      if (seen.has(node.value)) {
        value = seen.get(node.value);
      } else {
        value = gen.next().value;
        seen.set(node.value, value);
      }
      value = rawValue[0] + value + rawValue[rawValue.length - 1];
      return [{offset: node.loc.start.offset, length: node.loc.end.offset - node.loc.start.offset, value: value}];
    }
    return [];
  }});
  Object.defineProperty(red, 'reduceStaticMemberExpression', {value: function(node, obj) {
    var orig = sup.reduceStaticMemberExpression.call(this, node, obj);
    var loc = {start: {offset: node.loc.end.offset - node.property.length}, end: {offset: node.loc.end.offset}};
    var rawValue = extract(src, loc);
    if (rawValue === node.property && !isInterestingString(rawValue)) {
      var value;
      if (seen.has(rawValue)) {
        value = seen.get(rawValue);
      } else {
        value = gen.next().value;
        seen.set(rawValue, value);
      }
      return orig.concat([{offset: loc.start.offset, length: loc.end.offset - loc.start.offset, value: value}]);
    }
    return orig;
  }});
  Object.defineProperty(red, 'reduceStaticPropertyName', {value: function(node, obj) {
    var orig = sup.reduceStaticPropertyName.call(this, node, obj);
    var rawValue = extract(src, node.loc);
    var isQuoted = rawValue[0] === '"' || rawValue[0] === '\'';
    var strippedValue = isQuoted ? rawValue.slice(1, -1) : rawValue;
    if (strippedValue === node.value && !isInterestingString(strippedValue)) {
      var value;
      if (seen.has(strippedValue)) {
        value = seen.get(strippedValue);
      } else {
        value = gen.next().value;
        seen.set(strippedValue, value);
      }
      if (isQuoted) {
        value = rawValue[0] + value + rawValue[rawValue.length - 1];
      }
      return orig.concat([{offset: node.loc.start.offset, length: node.loc.end.offset - node.loc.start.offset, value: value}]);
    }
    return orig;
  }});
  Object.defineProperty(red, 'reduceLabeledStatement', {value: function(node, obj) {
    var orig = sup.reduceLabeledStatement.call(this, node, obj);
    var loc = {start: {offset: node.loc.start.offset}, end: {offset: node.loc.start.offset + node.label.length}};
    var rawValue = extract(src, loc);
    if (rawValue === node.label && !isInterestingString(rawValue)) {
      var value;
      if (seen.has(rawValue)) {
        value = seen.get(rawValue);
      } else {
        value = gen.next().value;
        seen.set(rawValue, value);
      }
      return orig.concat([{offset: loc.start.offset, length: loc.end.offset - loc.start.offset, value: value}]);
    }
    return orig;
  }});
  Object.defineProperty(red, 'reduceBreakStatement', {value: function(node, obj) {
    var orig = sup.reduceBreakStatement.call(this, node, obj);
    if (node.label === null) return orig;
    var labelOffset = getOffsetOfLabel(extract(src, node.loc));
    var loc = {start: {offset: node.loc.start.offset + labelOffset}, end: {offset: node.loc.start.offset + labelOffset + node.label.length}};
    var rawValue = extract(src, loc);
    if (rawValue === node.label && !isInterestingString(rawValue)) {
      var value;
      if (seen.has(rawValue)) {
        value = seen.get(rawValue);
      } else {
        value = gen.next().value;
        seen.set(rawValue, value);
      }
      return orig.concat([{offset: loc.start.offset, length: loc.end.offset - loc.start.offset, value: value}]);
    }
    return orig;
  }});
  Object.defineProperty(red, 'reduceContinueStatement', {value: function(node, obj) {
    var orig = sup.reduceContinueStatement.call(this, node, obj);
    if (node.label === null) return orig;
    var labelOffset = getOffsetOfLabel(extract(src, node.loc));
    var loc = {start: {offset: node.loc.start.offset + labelOffset}, end: {offset: node.loc.start.offset + labelOffset + node.label.length}};
    var rawValue = extract(src, loc);
    if (rawValue === node.label && !isInterestingString(rawValue)) {
      var value;
      if (seen.has(rawValue)) {
        value = seen.get(rawValue);
      } else {
        value = gen.next().value;
        seen.set(rawValue, value);
      }
      return orig.concat([{offset: loc.start.offset, length: loc.end.offset - loc.start.offset, value: value}]);
    }
    return orig;
  }});
  Object.defineProperty(red, 'reduceExportSpecifier', {value: function(node, obj) {
    var ret = [];
    var nameLoc = getTokenLoc(src, node.loc, 0);
    var rawValue = extract(src, nameLoc);
    var name;
    if (node.name) {
      if (rawValue === node.name && !isInterestingName(rawValue)) {
        if (seen.has(node.name)) {
          name = seen.get(node.name);
        } else {
          name = gen.next().value;
          seen.set(node.name, name);
        }
        ret.push({offset: nameLoc.start.offset, length: nameLoc.end.offset - nameLoc.start.offset, value: name});
      }
      nameLoc = getTokenLoc(src, node.loc, 2);
      rawValue = extract(src, nameLoc);
    }
    if (rawValue === node.exportedName && !isInterestingName(rawValue)) {
      if (seen.has(node.exportedName)) {
        name = seen.get(node.exportedName);
      } else {
        name = gen.next().value;
        seen.set(node.exportedName, name);
      }
      ret.push({offset: nameLoc.start.offset, length: nameLoc.end.offset - nameLoc.start.offset, value: name});
    }
    return ret;
  }});
  Object.defineProperty(red, 'reduceImportSpecifier', {value: function(node, obj) {
    var orig = sup.reduceImportSpecifier.call(this, node, obj);
    if (node.name) {
      var nameLoc = getTokenLoc(src, node.loc, 0);
      var rawValue = extract(src, nameLoc);
      if (rawValue === node.name && !isInterestingName(rawValue)) {
        var name;
        if (seen.has(node.name)) {
          name = seen.get(node.name);
        } else {
          name = gen.next().value;
          seen.set(node.name, name);
        }
        return orig.concat([{offset: nameLoc.start.offset, length: nameLoc.end.offset - nameLoc.start.offset, value: name}]);
      }
    }
    return orig;
  }});  
  Object.defineProperty(red, 'reduceExportAllFrom', {value: function(node, obj) {
    var moduleLoc = getTokenLoc(src, node.loc, -1);
    var rawValue = extract(src, moduleLoc);
    if (!isInterestingString(rawValue.slice(1, -1))) {
      var value;
      if (seen.has(node.moduleSpecifier)) {
        value = seen.get(node.moduleSpecifier);
      } else {
        value = gen.next().value;
        seen.set(node.moduleSpecifier, value);
      }
      value = rawValue[0] + value + rawValue[rawValue.length - 1];
      return [{offset: moduleLoc.start.offset, length: moduleLoc.end.offset - moduleLoc.start.offset, value: value}];
    }
    return [];
  }});
  Object.defineProperty(red, 'reduceExportFrom', {value: function(node, obj) {
    var orig = sup.reduceExportFrom.call(this, node, obj);
    var moduleLoc = getTokenLoc(src, node.loc, -1);
    var rawValue = extract(src, moduleLoc);
    if (!isInterestingString(rawValue.slice(1, -1))) {
      var value;
      if (seen.has(node.moduleSpecifier)) {
        value = seen.get(node.moduleSpecifier);
      } else {
        value = gen.next().value;
        seen.set(node.moduleSpecifier, value);
      }
      value = rawValue[0] + value + rawValue[rawValue.length - 1];
      return orig.concat([{offset: moduleLoc.start.offset, length: moduleLoc.end.offset - moduleLoc.start.offset, value: value}]);
    }
    return orig;
  }});
  Object.defineProperty(red, 'reduceImport', {value: function(node, obj) {
    var orig = sup.reduceImport.call(this, node, obj);
    var moduleLoc = getTokenLoc(src, node.loc, -1);
    var rawValue = extract(src, moduleLoc);
    if (!isInterestingString(rawValue.slice(1, -1))) {
      var value;
      if (seen.has(node.moduleSpecifier)) {
        value = seen.get(node.moduleSpecifier);
      } else {
        value = gen.next().value;
        seen.set(node.moduleSpecifier, value);
      }
      value = rawValue[0] + value + rawValue[rawValue.length - 1];
      return orig.concat([{offset: moduleLoc.start.offset, length: moduleLoc.end.offset - moduleLoc.start.offset, value: value}]);
    }
    return orig;
  }});
  Object.defineProperty(red, 'reduceImportNamespace', {value: function(node, obj) {
    var orig = sup.reduceImportNamespace.call(this, node, obj);
    var moduleLoc = getTokenLoc(src, node.loc, -1);
    var rawValue = extract(src, moduleLoc);
    if (!isInterestingString(rawValue.slice(1, -1))) {
      var value;
      if (seen.has(node.moduleSpecifier)) {
        value = seen.get(node.moduleSpecifier);
      } else {
        value = gen.next().value;
        seen.set(node.moduleSpecifier, value);
      }
      value = rawValue[0] + value + rawValue[rawValue.length - 1];
      return orig.concat([{offset: moduleLoc.start.offset, length: moduleLoc.end.offset - moduleLoc.start.offset, value: value}]);
    }
    return orig;
  }});

  return red;
}

module.exports.default = function normalize(src, isModule) {
  var effects = reduce(new NormalizingReducer(src), (isModule ? parseModule : parseScript)(src, {loc: true, earlyErrors: false}));

  var newSrc = src.split(''); // not the same as `Array.from(src)`, because unicode.
  effects.sort((a,b) => b.offset - a.offset); // this sort is in descending order of offset
  effects.forEach(effect => {
    newSrc.splice(effect.offset, effect.length, ...effect.value);
  });
  return newSrc.join('');
}
