/*
 * grunt-hbs-hierarchy-crawl
 * https://github.com/iws-latam/grunt-hbs-hierarchy-crawl
 *
 * Copyright (c) 2015 Isobar IWS Brazil
 * Licensed under the MIT license.
 */

'use strict';
var path = require("path");
var _ = require("underscore");
var Git = require("nodegit");
var async = require("async");

exports.init = function (grunt) {

  var exports = {};

  exports.versionCompare = function(v1, v2, options) {
    var lexicographical = options && options.lexicographical,
      zeroExtend = options && options.zeroExtend,
      v1parts = v1.split('.'),
      v2parts = v2.split('.');

    function isValidPart(x) {
      return (lexicographical ? /^\d+[A-Za-z]*$/ : /^\d+$/).test(x);
    }

    if (!v1parts.every(isValidPart) || !v2parts.every(isValidPart)) {
      return NaN;
    }

    if (zeroExtend) {
      while (v1parts.length < v2parts.length) { v1parts.push("0"); }
      while (v2parts.length < v1parts.length) { v2parts.push("0"); }
    }

    if (!lexicographical) {
      v1parts = v1parts.map(Number);
      v2parts = v2parts.map(Number);
    }

    for (var i = 0; i < v1parts.length; ++i) {
      if (v2parts.length === i) {
        return 1;
      }

      if (v1parts[i] === v2parts[i]) {
        continue;
      }
      else if (v1parts[i] > v2parts[i]) {
        return 1;
      }
      else {
        return -1;
      }
    }

    if (v1parts.length !== v2parts.length) {
      return -1;
    }

    return 0;
  };

  exports.getTreeFromTagName = function(repo, tag_name, _callback){
    Git.Revparse.single(repo, tag_name).then(function(obj){
      Git.Tag.lookup(repo, obj).then(function(tag){
        Git.Commit.lookup(repo, tag.targetId()).then(function(commit){
          Git.Tree.lookup(repo, commit.treeId()).then(function(tree){
            _callback(null, tree);
          });
        });
      });
    });
  };

  exports.getTreeFromBranchName = function(repo, branch_name, _callback){
    repo.getBranchCommit(branch_name).then(function(commit){
      Git.Tree.lookup(repo, commit.treeId()).then(function(tree){
        _callback(null, tree);
      });
    });
  }

  return exports;
};
