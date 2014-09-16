function AposPages() {
  var self = this;

  // Return a page type object if one was configured for the given type name.
  // JavaScript doesn't iterate over object properties in a defined order,
  // so we maintain the list of types as a flat array. This convenience method
  // prevents this from being inconvenient and allows us to choose to do more
  // optimization later.

  self.getType = function(name) {
    return _.find(apos.data.aposPages.types, function(item) {
      return item.name === name;
    });
  };

  self.addType = function(type) {
    apos.data.aposPages.types.push(type);
  };

  // Replace a type with a new type object. Typically this is done to replace
  // a type object we got from the server (with just a name and a label) with a
  // type object that includes a settings property with functions for a page
  // settings dialog and so on.
  //
  // We replace rather than extending so that closures with references
  // to "self" still do the right thing.

  self.replaceType = function(name, object) {
    var newTypes = [];
    for (var i in apos.data.aposPages.types) {
      var type = apos.data.aposPages.types[i];
      if (type.name === name) {
        object.name = type.name;
        object.label = type.label;
        newTypes.push(object);
      } else {
        newTypes.push(type);
      }
    }
    apos.data.aposPages.types = newTypes;
  };

  // Get the index type objects corresponding to an instance or the name of an
  // instance type. Instance types are a relevant concept for snippet pages,
  // blog pages, event calendar pages, etc. and everything derived from them.
  //
  // In this pattern "instance" pages, like individual blogPosts, are outside
  // of the page tree but "index" pages, like blogs, are in the page tree and
  // display some or all of the blogPosts according to their own criteria.

  self.getIndexTypes = function(instanceTypeOrInstance) {
    if (!instanceTypeOrInstance) {
      throw 'getIndexTypes called with no type. You probably forgot to specify withType in your schema.';
    }
    var types = apos.data.aposPages.types;
    var instanceTypeName = instanceTypeOrInstance.type || instanceTypeOrInstance;
    var instanceTypes = [];
    var i;
    return _.filter(types, function(type) {
      return (type._instance === instanceTypeName);
    });
  };

  // Get the names of the index types corresponding to an instance type or the name of an
  // instance type
  self.getIndexTypeNames = function(instanceTypeOrInstance) {
    return _.pluck(self.getIndexTypes(instanceTypeOrInstance), 'name');
  };

  // Returns the first index type object corresponding to an instance type or the
  // name of an instance type. This is the object that is providing backend routes
  // and management UI for editing instances
  self.getManager = function(instanceTypeOrInstance) {
    return self.getIndexTypes(instanceTypeOrInstance)[0];
  };

  // Right now this is called even for noneditors, but we don't put the
  // menu dropdown markup in the admin bar for them. TODO: we need to better
  // separate globally useful stuff like apos.data.aposPages.types from
  // clearly editor-specific stuff like editing page settings
  self.enableUI = function(options) {

    if (!options) {
      options = {};
    }

    // Available in other scopes
    aposPages.options = options;

    // Shared state closure for the page settings dialogs (new and edit)
    (function() {
      var oldTypeName;
      // Active dialog
      var $el;
      var defaults;

      $('body').on('click', '[data-new-page]', function() {
        var parent = apos.data.aposPages.page.slug;
        var pageType = $(this).data('pageType');

        self.newPage(parent, { pageType: pageType });
        return false;
      });

      self.newPage = function(parent, options) {
        defaults = {};
        options = options || {};
        $el = apos.modalFromTemplate('.apos-new-page-settings', {
          init: function(callback) {

            populateType(options.pageType, true);

            // Copy parent's published status
            //
            // TODO: refactor this frequently used dance of boolean values
            // into editor.js or content.js

            apos.enableBoolean($el.findByName('published'), apos.data.aposPages.page.published, true);

            // We do not copy the parent's orphan status
            apos.enableBoolean($el.findByName('notOrphan'), true);

            apos.enableTags($el.find('[data-name="tags"]'), []);

            refreshType(function() {

              // Let's go ahead and try to populate the page type setting
              if (options.pageType) {
                type = options.pageType;
              }

              // Copy parent permissions
              enablePermissions(apos.data.aposPages.page, true);
              if (options.title) {
                $el.find('[data-title]').text(options.title);
              }
              return callback(null);
            });
          },
          save: save
        });
        function save(callback) {
          return addOrEdit('new', { parent: parent }, callback);
        }
        return $el;
      };

      $('body').on('click', '[data-edit-page]', function() {
        var slug = apos.data.aposPages.page.slug;

        // Get a more robust JSON representation that includes
        // joined objects if any
        $.getJSON(apos.data.aposPages.page.slug + '?pageInformation=json', function(data) {
          apos.data.aposPages.page = data;
          defaults = data;
          $el = apos.modalFromTemplate('.apos-edit-page-settings', {
            save: save,
            init: function(callback) {
              populateType(defaults.type, false);

              // TODO: refactor this frequently used dance of boolean values
              // into editor.js or content.js
              var published = defaults.published;
              if (published === undefined) {
                published = 1;
              } else {
                // Simple POST friendly boolean values
                published = published ? '1' : '0';
              }
              apos.enableBoolean($el.findByName('published'), defaults.published, true);

              apos.enableBoolean($el.findByName('notOrphan'), !defaults.orphan, true);

              $el.find('[name=type]').val(defaults.type);
              $el.find('[name=title]').val(defaults.title);
              var $seoDescription = $el.find('[name=seoDescription]');
              $seoDescription.val(defaults.seoDescription || '');
              $el.find('[name=slug]').val(slug);
              apos.enableTags($el.find('[data-name="tags"]'), defaults.tags);
              refreshType(function() {
                enablePermissions(defaults, false);

                // Watch the title for changes, update the slug - but only if
                // the slug was in sync with the title to start with

                var $slug = $el.find('[name=slug]');
                var $title = $el.find('[name=title]');

                apos.suggestSlugOnTitleEdits($slug, $title);

                return callback(null);
              });
            }
          });
        });

        function save(callback) {
          var newSlug = $el.find('[name=slug]').val();
          if (newSlug === slug) {
            // Slug not edited, we're fine
            return go();
          }
          // Slug edited, make sure it's available; random digits frustrate people
          return $.jsonCall('/apos-pages/slug-available', { slug: newSlug }, function(response) {
            if (response.status !== 'ok') {
              alert('That slug is already in use by another page.');
              return callback('error');
            }
            return go();
          });
          function go() {
            return addOrEdit('edit', { slug: slug }, callback);
          }
        }
        return false;
      });

      function populateType(presetType, insert) {
        var $type = $el.find('[name=type]');
        $type.html('');
        var found = false;
        var $options;
        var type;

        var choices = apos.data.aposPages.menu || apos.data.aposPages.types;

        // Filter choices via childTypes and descendantTypes
        // options of our ancestors. These filters are
        // cumulative

        var parent = insert ? apos.data.aposPages.page : apos.data.aposPages.page.parent;
        var ancestors = apos.data.aposPages.page.ancestors;
        if (!insert) {
          // Make sure we only look at our parent once
          ancestors = _.clone(ancestors);
          ancestors.pop();
        }

        var filter;

        if (parent) {
          type = self.getType(parent.type);
          if (type) {
            filter = type.childTypes || type.descendantTypes;
            if (filter) {
              choices = _.filter(choices, function(choice) {
                return _.contains(filter, choice.name);
              });
            }
          }
        }
        if (ancestors.length) {
          _.each(ancestors, function(ancestor) {
            type = self.getType(ancestor.type);
            if (type) {
              var filter = type.descendantTypes;
              if (filter) {
                choices = _.filter(choices, function(choice) {
                  return _.contains(filter, choice.name);
                });
              }
            }
          });
        }

        _.each(choices, function(type) {
          $option = $('<option></option>');
          // The label is wrapped in i18n
          $option.text( __(type.label) );
          $option.attr('value', type.name);
          // If we've passed in the presetType, let's select that one.
          if (type.name === presetType) {
            $option.attr('selected', true);
            found = true;
          }
          $type.append($option);
        });
        if (presetType && (!found)) {
          // if the preset type is not one of the choices, populate the
          // menu with that one choice and hide it. It's going to be
          // something like blogPost that shouldn't be switched
          type = _.find(apos.data.aposPages.types, function(type) {
            return (type.name === presetType);
          });
          if (!type) {
            // Even a type not configured in app.js might still be
            // around as a page template; some people remove
            // "home" from the types option for instance so nobody
            // adds a second "home"
            type = {
              label: presetType,
              name: presetType
            };
            apos.data.aposPages.types.push(type);
          }
          if (type) {
            $type.html('');
            $option = $('<option></option>');
            // The label is wrapped in i18n
            $option.text( __(type.label) );
            $option.attr('value', type.name);
            $type.append($option);
            $el.find('[data-name="type"]').hide();
          }
        }
        // Some types have custom settings of their own. When appropriate
        // instantiate the additional template and make it part of the form.
        // If the type has a selector for a settings template (settings.sel)
        // then it must also have an unserialize function to populate that
        // template's form fields from an object and a serialize function
        // to return an object based on the form fields. You can set up
        // client side javascript to assist with the use of the fields in
        // your unserialize function.

        $el.on('change', '[name=type]', function() {
          refreshType(function() {});
        });
      }

      function refreshType(callback) {
        var $type = $el.find('[name=type]');
        if (!$type.length) {
          // Type changes not allowed for this page
          return callback();
        }

        var typeName = $el.find('[name=type]').val();
        if (oldTypeName) {
          $el.find('[data-type-details]').html('');
        }
        var type = aposPages.getType(typeName);
        if (type.orphan) {
          // Locked for this type
          $el.find('[data-name="notOrphan"]').hide();
        } else {
          $el.find('[data-name="notOrphan"]').show();
        }
        if (type.settings) {
          var $typeEl = apos.fromTemplate('.apos-page-settings-' + type._typeCss);
          $el.find('[data-type-details]').html($typeEl);
          var unserialize = type.settings.unserialize;

          // Tolerate unserialize methods without a callback.
          // TODO I'd like to kill that off, but let's break one thing
          // a day tops if we can.
          if (unserialize.length === 3) {
            var superUnserialize = unserialize;
            unserialize = function(data, $el, $details, callback) {
              superUnserialize(data, $el, $details);
              return callback();
            };
          }

          unserialize(defaults, $el, $typeEl, function(err) {
            apos.emit('enhance', $typeEl);
            return callback();
          });
        } else {
          $el.find('[data-type-details]').html('');
          return callback();
        }
      }

      function addOrEdit(action, options, callback) {
        var typeName = $el.find('[name="type"]').val();
        var type = aposPages.getType(typeName);

        var data = {
          title: $el.findByName('title').val(),
          slug: $el.findByName('slug').val(),
          seoDescription: $el.findByName('seoDescription').val(),
          type: $el.findByName('type').val(),
          published: apos.getBoolean($el.findByName('published')),
          orphan: !apos.getBoolean($el.findByName('notOrphan')),
          tags: $el.find('[data-name="tags"]').selective('get', { incomplete: true })
        };
        apos.permissions.debrief($el.find('[data-permissions]'), data, { propagate: (action === 'edit') });

        _.extend(data, { parent: options.parent, originalSlug: options.slug });

        function serializeThenSave() {
          if (!(type && type.settings && type.settings.serialize)) {
            return save();
          }

          // Tolerate serialize methods without a callback.
          // TODO I'd like to kill that off, but let's break one thing
          // a day tops if we can.

          var serialize = type.settings.serialize;
          if (serialize.length === 2) {
            var superSerialize = serialize;
            serialize = function($el, $details, callback) {
              var ok = superSerialize($el, $details);
              return callback(null, ok);
            };
          }

          return serialize($el, $el.find('[data-type-details]'), function(err, result) {
            if (err) {
              // Block
              return callback('invalid');
            }
            // Use _.extend to copy top level properties directly and avoid
            // a recursive merge and appending of arrays which would prevent us
            // from, for instance, clearing a list of tags
            _.extend(data, result);
            return save();
          });
        }

        // Use jsonCall so that sparse arrays
        // (indexed by snippet ID, for instance)
        // don't turn into flat arrays, also more
        // efficient generally. -Tom
        function save() {
          $.jsonCall('/apos-pages/' + action,
            data,
            function(data) {
              apos.redirect(data.slug);
            },
            function() {
              alert('Server error');
              callback('Server error');
            }
          );
        }

        serializeThenSave();
        return false;
      }

      function enablePermissions(page, isNew) {
        apos.permissions.brief($el.find('[data-permissions]'), page, { propagate: !isNew });
      }

    })();

    $('body').on('click', '[data-reorganize-page]', function() {
      var $tree;
      var $el = apos.modalFromTemplate('.apos-reorganize-page', {
        init: function(callback) {
          $tree = $el.find('[data-tree]');
          $tree.tree({
            data: [],
            autoOpen: 0,
            openFolderDelay: 2500,
            dragAndDrop: true,
            onCanMoveTo: function(moved_node, target_node, position) {
              // Cannot create peers of root
              if ((target_node.slug === '/') && (position !== 'inside')) {
                return false;
              }
              return true;
            },
            onCreateLi: function(node, $li) {
              // Identify the root trashcan and add a class to its li so that we
              // can hide inappropriate controls within the trash
              // TODO: do we want to make this slug a constant forever?
              if (node.slug == '/trash') {
                $li.addClass('apos-trash');
              }
              $li.find('.jqtree-element').append($('<span class="apos-reorganize-controls"></span>'));
              // Append a link to the jqtree-element div.
              // The link has a url '#node-[id]' and a data property 'node-id'.
              var link = $('<a class="apos-visit" target="_blank"></a>');
              link.attr('data-node-id', node.id);
              link.attr('data-visit', '1');
              link.attr('href', '#');
              // link.text('»');
              link.append('<i class="icon icon-external-link"></i>');
              $li.find('.jqtree-element .apos-reorganize-controls').append(link);

              if (node.publish) {
                link = $('<a class="apos-delete"></a>');
                link.attr('data-node-id', node.id);
                link.attr('data-delete', '1');
                link.attr('href', '#');
                // link.text('x');
                link.append('<i class="icon icon-trash"></i>');
              }

              $li.find('.jqtree-element .apos-reorganize-controls').append(link);
            }
          });
          $tree.on('click', '[data-visit]', function() {
            var nodeId = $(this).attr('data-node-id');
            var node = $tree.tree('getNodeById', nodeId);
            var tab = window.open(apos.data.prefix + node.slug, '_blank');
            tab.focus();
            // window.location.href = ;
            return false;
          });

          $tree.on('click', '[data-delete]', function() {
            var nodeId = $(this).attr('data-node-id');
            var node = $tree.tree('getNodeById', nodeId);
            // Find the trashcan so we can mirror what happened on the server
            var trash;
            _.each($tree.tree('getTree').children[0].children, function(node) {
              if (node.trash) {
                trash = node;
              }
            });
            if (!trash) {
              alert('No trashcan.');
              return false;
            }
            $.ajax({
              url: '/apos-pages/delete',
              data: {
                slug: node.slug
              },
              type: 'POST',
              dataType: 'json',
              success: function(data) {
                if (data.status === 'ok') {
                  $tree.tree('moveNode', node, trash, 'inside');
                  _.each(data.changed, function(info) {
                    var node = $tree.tree('getNodeById', info.id);
                    if (node) {
                      node.slug = info.slug;
                    }
                  });
                } else {
                  alert(data.status);
                }
              },
              error: function() {
                alert('Server error');
              }
            });
            return false;
          });

          $tree.on('tree.move', function(e) {
            e.preventDefault();
            $el.find('.apos-reorganize-progress').fadeIn();
            var data = {
                moved: e.move_info.moved_node.slug,
                target: e.move_info.target_node.slug,
                position: e.move_info.position
            };
            $.ajax({
              url: '/apos-pages/move-jqtree',
              data: data,
              type: 'POST',
              dataType: 'json',
              success: function(data) {
                // Reflect changed slugs
                _.each(data.changed, function(info) {
                  var node = $tree.tree('getNodeById', info.id);
                  if (node) {
                    node.slug = info.slug;
                  }
                });
                e.move_info.do_move();
                $el.find('.apos-reorganize-progress').fadeOut();
              },
              error: function() {

                alert('You may only move pages you are allowed to publish. If you move a page to a new parent, you must be allowed to edit the new parent.');

                apos.afterYield(function() {
                  reload(function() {
                    $el.find('.apos-reorganize-progress').fadeOut();
                  });
                });
              }
            });
          });
          reload(callback);
        },
        // After a reorg the page URL may have changed, be prepared to
        // navigate there or to the home page or just refresh to reflect
        // possible new tabs
        afterHide: function(callback) {
          var page = apos.data.aposPages.page;
          var _id = page._id;
          $.get('/apos-pages/info', { _id: _id }, function(data) {
            var newPathname = data.slug.replace(/^\/\//, '/');
            apos.redirect(newPathname);
          }).error(function() {
            // If the page no longer exists, navigate away to home page
            apos.redirect('/');
          });
        }
      });
      function reload(callback) {
        $.getJSON('/apos-pages/get-jqtree', function(data) {
          $tree.tree('loadData', data);
          if (callback) {
            return callback();
          }
        }).error(function() {
          alert('The server did not respond or you do not have the appropriate privileges.');
          $el.trigger('aposModalHide');
        });
      }
    });

    $('body').on('click', '.apos-delete-page', function() {
      var slug = apos.data.aposPages.page.slug;
      $.ajax(
        {
          url: '/apos-pages/delete',
          data: {
            slug: slug
          },
          type: 'POST',
          dataType: 'json',
          success: function(data) {
            if(data.status === 'ok') {
              alert('Moved to the trash. Select "Reorganize" from the "Page" menu to drag it back out.');
              apos.redirect(data.parent);
            } else {
              alert(data.status);
            }
          },
          error: function() {
            alert('Server error');
          }
        }
      );
      return false;
    });

    $('body').on('click', '[data-versions-page]', function() {
      var pageId = apos.data.aposPages.page._id;
      aposPages.browseVersions(pageId);
    });
  };

  // This method can also be invoked by snippets and anything else that
  // is represented by a page.
  self.browseVersions = function(pageId) {
    var $el = apos.modalFromTemplate('.apos-versions-page', {
      init: function(callback) {
        $versions = $el.find('[data-versions]');

        $versions.on('click', '[data-version-id]', function() {
          var id = $(this).data('versionId');
          $.post('/apos-pages/revert',
            { page_id: pageId, version_id: id },
            function(data) {
              alert('Switched versions.');
              $el.trigger('aposModalHide');
              apos.change('revert');
            }
          ).error(function() {
            alert('Server error or version no longer available.');
          });
        });

        // Load the available versions
        $template = $versions.find('[data-version].apos-template');
        $template.detach();
        // Easier to render as a nice server side template
        $.get('/apos-pages/versions', {
          _id: pageId
        }, function(data) {
          $versions.html(data);
        });
        return callback();
      }
    });
  };
}

// There is only one instance of AposPages. TODO: provide
// for substituting a subclass
window.aposPages = new AposPages();
