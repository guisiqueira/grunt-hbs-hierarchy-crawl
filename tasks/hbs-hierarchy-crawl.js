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

  var GitHelpers = require('./lib/githelpers').init(grunt);

  // Please see the Grunt documentation for more information regarding task
  // creation: http://gruntjs.com/creating-tasks

  grunt.registerMultiTask('hbshierarchycrawl', 'Crawl directories creating HBS list of files and dependencies', function () {
    var task = this;
    var done = task.async();

    var elements = [];
    var fileReleaseTags = {};

    // Merge task-specific and/or target-specific options with these defaults.
    var options = task.options({
      punctuation: '.',
      separator: ', ',
      element_type_folders:{
        "/components/" : "component",
        "/layouts/" : "layout",
        "/pages/" : "page"
      },
      same_name_dependencies: ['.hbs', '.scss', '.js'],
      git_path: path.resolve("."),
      git_develop_branch: "develop",
      git_cascade_component_version: true
    });

    var processFilesGitReleaseTags = function(_callback){

      grunt.log.writeln("Processing Files Git Release Tags");
      Git.Repository.open(options.git_path)
        .then(function(repo){
          //List Git Tags
          Git.Tag.list(repo).then(function(tags){

            //For each tag, check diff between previous tag and mark elements
            grunt.log.writeln("Tags:" + tags);
            //Function array that will be called in series
            var diff_functions = [];

            _.each(tags, function(tag_name, i, list){

              diff_functions.push(function(_callback){
                var last_tag_name = null;
                var tag = null;
                var last_tag = null;
                var tag_commit_tree = null;
                var last_tag_commit_tree = null;

                if(i > 0){
                  last_tag_name = list[i-1];
                }

                async.series([
                  function(cb){
                    //Get Git Tree from tag name so we can diff later
                    GitHelpers.getTreeFromTagName(repo, tag_name, function(error, tree){
                      if(!error){
                        tag_commit_tree = tree;
                      }
                      cb(error, tree);
                    });
                  },

                  function(cb){
                    if(last_tag_name != null){
                      GitHelpers.getTreeFromTagName(repo, last_tag_name, function(error, tree){
                        if(!error){
                          last_tag_commit_tree = tree;
                        }
                        cb(error, tree);
                      });
                    }
                    else{
                      last_tag = null;
                      last_tag_commit_tree = null;
                      cb(null, null);
                    }
                  },

                  function(cb){
                    Git.Diff.treeToTree(repo, last_tag_commit_tree, tag_commit_tree, null)
                      .then(function(diff){
                          var patches = diff.patches();

                          _.each(patches, function(patch){
                            var file_path = patch.newFile().path();

                            grunt.log.writeln("Tag [" + tag_name + "]: " + file_path);
                            fileReleaseTags[file_path] = tag_name;
                          });

                          cb(null, diff);
                      });
                      grunt.log.writeln("Checking diff between: '" + last_tag_name + "' and '" + tag_name + "'");
                  }
                ], function(err, result){
                  _callback(null, result);
                });
              });

            });

            //Make diff between most recent tag and the current develop branch
            diff_functions.push(function(_callback){
              var last_tag_name = tags[tags.length-1];
              var last_tag_commit_tree = null;

              var tag_commit_tree = null;


              async.series([
                function(cb){
                  //Get Git Tree from latest commit of develop branch
                  GitHelpers.getTreeFromBranchName(repo, options.git_develop_branch, function(error, tree){
                    if(!error){
                      tag_commit_tree = tree;
                    }
                    cb(error, tree);
                  });
                },

                function(cb){
                  if(last_tag_name != null){
                    GitHelpers.getTreeFromTagName(repo, last_tag_name, function(error, tree){
                      if(!error){
                        last_tag_commit_tree = tree;
                      }
                      cb(error, tree);
                    });
                  }
                  else{
                    last_tag_commit_tree = null;
                    cb(null, null);
                  }
                },

                function(cb){
                  Git.Diff.treeToTree(repo, last_tag_commit_tree, tag_commit_tree, null)
                    .then(function(diff){
                        var patches = diff.patches();

                        _.each(patches, function(patch){
                          var file_path = patch.newFile().path();

                          grunt.log.writeln("[Develop Branch]: " + file_path);
                          fileReleaseTags[file_path] = last_tag_name + "dev";
                        });

                        cb(null, diff);
                    });
                  grunt.log.writeln("Checking diff between: '" + last_tag_name + "' Tag and '" + options.git_develop_branch + "' Branch latest Commit.");
                }
              ], function(err, result){
                _callback(null, result);
              });

            });

            //For each diff, execute callback
            async.series(diff_functions, function(err, result){
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
        el.references = [];
        el.referenced_by = [];
        el.extends = [];
        el.extended_by = [];
        el.latest_version = "0";
      }

      el.hbs_path = filepath;

      if (_.has(fileReleaseTags, filepath)){
        el.latest_version = fileReleaseTags[filepath];
      }

      //Detect File Type
      var typeKey = _.find(_.allKeys(options.element_type_folders), function(key){
        return filepath.indexOf(key) > -1;
      });
      el.type = options.element_type_folders[typeKey];

      //Load File Contents
      var fileContents = grunt.file.read(filepath);

      //Detect and Process References
      //Example: {{> header-global}}


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
          if(GitHelpers.versionCompare(el.latest_version, reference.latest_version) > 0){
            reference.latest_version = el.latest_version;
          }
          reference.referenced_by.push(el.key);
        }
        else{
          //Item wasn't created in element list, create dummy element
          var e = {};

          e.key = ref;
          e.referenced_by = [el.key];
          e.extended_by = [];
          e.references = [];
          e.extends = [];
          e.latest_version = "0";

          elements.push(e);
        }
      });

      //Detect and Process Extensions
      //Example: {{#extend "global"}}

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

          if(options.git_cascade_component_version && GitHelpers.versionCompare(extension.latest_version, el.latest_version) > 0){
            el.latest_version = extension.latest_version;
          }
        }
        else{
          //Item wasn't created in element list, create dummy element
          var e = {};

          e.key = ref;
          e.extended_by = [el.key];
          e.referenced_by = [];
          e.references = [];
          e.extends = [];
          e.latest_version = "0";
          elements.push(e);
        }

      });

      //Dependencies
      //Try to process dependencies
      el.dependencies = [];
      _.each(options.same_name_dependencies, function(file_extension){
        var dep_path = filepath.replace('.hbs', file_extension);

        if(grunt.file.exists(dep_path)){
          var dep = {};
          dep.path = dep_path;
          dep.extended_by = [];
          dep.referenced_by = [];
          dep.references = [];
          dep.extends = [];
          dep.latest_version = "0";

          if (_.has(fileReleaseTags, dep_path)){
            dep.latest_version = fileReleaseTags[dep_path];

            if(GitHelpers.versionCompare(dep.latest_version, el.latest_version) > 0){
              el.latest_version = dep.latest_version;
              console.log(el.latest_version);
            }
          }

          el.dependencies.push(dep);
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

              var el = processElement(filepath);

              elements.push(el);

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
      processFilesGitReleaseTags,
      processFiles,
    ], function(err, result){
      console.log("DONE");
      task.done();
    });

  });
};
