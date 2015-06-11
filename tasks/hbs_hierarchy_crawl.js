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

module.exports = function (grunt) {

  // Please see the Grunt documentation for more information regarding task
  // creation: http://gruntjs.com/creating-tasks

  grunt.registerMultiTask('hbs_hierarchy_crawl', 'Crawl directories creating HBS list of files and dependencies', function () {
    var task = this;
    var done = task.async();

    var elements = [];
    var git_info = {
      branch: "",
    };

    // Merge task-specific and/or target-specific options with these defaults.
    var options = task.options({
      punctuation: '.',
      separator: ', ',
      element_type_folders:{
        "/components/" : "component",
        "/layouts/" : "layout",
        "/pages/" : "page"
      },
      git_path: path.resolve(".")
    });

    var applyGitReleaseTags = function(_callback){

      grunt.log.writeln("Applying Git Release Tags to Elements");
      Git.Repository.open(options.git_path)
        .then(function(repo){
          console.log("GOT REPO");
          //List Git Tags
          Git.Tag.list(repo).then(function(tags){

            //For each tag, check diff between previous tag and mark elements
            console.log("Tags:" + tags);
            //Function array that will be called in series
            var diff_functions = [];

            _.each(tags, function(tag, i, list){
                diff_functions.push(function(_callback){

                  var last_tag = null;

                  if(i > 0){
                    last_tag = list[i-1];
                  }

                  Git.Diff.treeToTree(repo, last_tag, tag)
                    .then(function(diff){
                        console.log(diff.numDeltas());
                        _callback(diff);
                    });
                  grunt.log.writeln("Checking diff between: '" + last_tag + "' and '" + tag + "'");
                });
            });

            //For each diff, execute callback
            async.series(diff_functions, function(err, result){
              console.log(result);

              return _callback(null, null);
            });

          });
        });

    };

    var processElement = function(filepath){
      //Try to find existing element

      var keyRegExp = new RegExp(/\/([\w\-]*)\.hbs/);
      var key = filepath.match(keyRegExp)[1];

      var el = _.find(elements, function(e){return e.key === key;});
      if(!el){
        el = {};
        el.key = key;
        el.referenced_by = [];
      }

      el.hbs_path = filepath;

      //Detect File Type
      var typeKey = _.find(_.allKeys(options.element_type_folders), function(key){
        return filepath.indexOf(key) > -1;
      });
      el.type = options.element_type_folders[typeKey];

      //Load File Contents
      var fileContents = grunt.file.read(filepath);

      //Detect and Process References
      //Example: {{> header-global}}
      el.references = [];
      el.referenced_by = [];
      el.extends = [];
      el.extended_by = [];

      var referenceRegExp = new RegExp(/\{\{>\s+([\w\-]*)\}\}/g);

      var matches = [];
      while (matches = referenceRegExp.exec(fileContents)){
        el.references.push(matches[1]);
      }
      //Back References
      _.each(el.references, function(ref, index, list){
        var reference = _.find(elements, function(item){
          return item.key===ref;
        });


        if(reference){
          reference.referenced_by.push(el.key);
        }
        else{
          //Item wasn't created in element list, create dummy element
          var e = {};

          e.key = ref;
          e.referenced_by = [el.key];
          e.extended_by = [];

          elements.push(e);
        }
      });

      //Detect and Process Extensions
      //Example: {{#extend "global"}}
      el.extends = [];
      el.extended_by = [];

      var extendRegExp = new RegExp(/\{\{#extend\s+\"([\w\-]*)\"\}\}/g);

      matches = [];
      while (matches = extendRegExp.exec(fileContents)){
        el.extends.push(matches[1]);
      }
      //Back References
      _.each(el.extends, function(ref, index, list){
        var extension = _.find(elements, function(item){return item.key===ref;});
        if(extension){
          extension.extended_by.push(el.key);
        }
        else{
          //Item wasn't created in element list, create dummy element
          var e = {};

          e.key = ref;
          e.extended_by = [el.key];
          e.referenced_by = [];
          elements.push(e);
        }
      });

      return el;
    };

    var processFiles = function(_callback){
      // Iterate over all specified file groups.
      task.files.forEach(function (file) {
        // Concat specified files.
        var src = file.src.filter(function (filepath) {
          // Warn on and remove invalid source files (if nonull was set).
          if (!grunt.file.exists(filepath)) {
            grunt.log.warn('Source file "' + filepath + '" not found.');
            return false;
          } else {
            if(filepath.indexOf('.hbs') > -1){
              // Print a success message.
              grunt.log.writeln('Found "' + filepath + '".');
              elements.push(processElement(filepath));

              return true;
            }
            else{
              return false;
            }
          }
        }).map(function (filepath) {
          // Read file source.
          return grunt.file.read(filepath);
        }).join(grunt.util.normalizelf(options.separator));

        // Handle options.
        src += options.punctuation;

        // Write the destination file.
        grunt.file.write(file.dest, JSON.stringify(elements,"",3));

        // Print a success message.
        grunt.log.writeln('File "' + file.dest + '" created.');

        _callback(null,null);

      });
    };

    async.series([
      processFiles,
      applyGitReleaseTags
    ], function(err, result){
      console.log("DONE");
      task.done();
    });

  });
};
