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
    if (!options.root) {
      options.root = apos.data.aposPages.root;
    }

    // Allow / or /pages/ to be specified, just quietly fix it
    options.root = options.root.replace(/\/$/, '');

    // Available in other scopes
    aposPages.options = options;

    // Shared state closure for the page settings dialogs (new and edit)
    (function() {
      var oldTypeName;
      // Active dialog
      var $el;

      $('body').on('click', '.apos-new-page', function() {
        var parent = $(this).data('slug');
        var pageType = $(this).data('pageType');

        $el = apos.modalFromTemplate('.apos-new-page-settings', {
          init: function(callback) {

            // We now can pass an argument to this function that allows a certain page type
            // (identified in the data attribute "page-type") to be automatically selected.
            populateType(pageType);

            // Copy parent's published status
            //
            // TODO: refactor this frequently used dance of boolean values
            // into editor.js or content.js

            apos.enableBoolean($el.findByName('published'), apos.data.aposPages.page.published, true);

            // We do not copy the parent's orphan status
            apos.enableBoolean($el.findByName('notOrphan'), true);

            apos.enableTags($el.find('[data-name="tags"]'), []);
            refreshType();

            // Let's go ahead and try to populate the page type setting
            if (pageType) {
              type = pageType;
            }

            // $el.findByName('published').val(apos.data.pages.parent.published)
            // Copy parent permissions
            enablePermissions(apos.data.aposPages.page);
            return callback(null);
          },
          save: save
        });
        function save(callback) {
          return addOrEdit('new', { parent: parent }, callback);
        }
        return false;
      });

      $('body').on('click', '.apos-edit-page', function() {
        var slug = $(this).data('slug');

        // Get a more robust JSON representation that includes
        // joined objects if any
        $.getJSON(aposPages.options.root + apos.data.aposPages.page.slug + '?pageInformation=json', function(data) {
          apos.data.aposPages.page = data;
          $el = apos.modalFromTemplate('.apos-edit-page-settings', {
            save: save,
            init: function(callback) {
              populateType();

              // TODO: refactor this frequently used dance of boolean values
              // into editor.js or content.js
              var published = apos.data.aposPages.page.published;
              if (published === undefined) {
                published = 1;
              } else {
                // Simple POST friendly boolean values
                published = published ? '1' : '0';
              }
              apos.enableBoolean($el.findByName('published'), apos.data.aposPages.page.published, true);

              apos.enableBoolean($el.findByName('notOrphan'), !apos.data.aposPages.page.orphan, true);

              $el.find('[name=type]').val(apos.data.aposPages.page.type);
              $el.find('[name=title]').val(apos.data.aposPages.page.title);
              var $seoDescription = $el.find('[name=seoDescription]');
              $seoDescription.val(apos.data.aposPages.page.seoDescription || '');
              $el.find('[name=slug]').val(slug);
              apos.enableTags($el.find('[data-name="tags"]'), apos.data.aposPages.page.tags);

              refreshType();

              enablePermissions(apos.data.aposPages.page);

              // Watch the title for changes, update the slug - but only if
              // the slug was in sync with the title to start with

              var $slug = $el.find('[name=slug]');
              var $title = $el.find('[name=title]');

              apos.suggestSlugOnTitleEdits($slug, $title);

              return callback(null);
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

      function populateType(presetType) {
        if (!_.find(apos.data.aposPages.types, function(type) {
          return apos.data.aposPages.page.type === type.name;
        })) {
          // Don't let anyone mess with the type of an existing page whose type is not
          // on the menu, such as the search page
          $el.find('[data-name="type"]').remove();
          return;
        }
        var $type = $el.find('[name=type]');
        $type.html('');
        _.each(apos.data.aposPages.menu || apos.data.aposPages.types, function(type) {
          var $option = $('<option></option>');
          // The label is wrapped in i18n
          $option.text( __(type.label) );
          $option.attr('value', type.name);
          // If we've passed in the presetType, let's select that one.
          if (type.name === presetType) {
            $option.attr('selected', true);
          }
          $type.append($option);
        });
        // Some types have custom settings of their own. When appropriate
        // instantiate the additional template and make it part of the form.
        // If the type has a selector for a settings template (settings.sel)
        // then it must also have an unserialize function to populate that
        // template's form fields from an object and a serialize function
        // to return an object based on the form fields. You can set up
        // client side javascript to assist with the use of the fields in
        // your unserialize function.

        $el.on('change', '[name=type]', function() {
          refreshType();
        });
      }

      function refreshType() {
        var $type = $el.find('[name=type]');
        if (!$type.length) {
          // Type changes not allowed for this page
          return;
        }

        var typeName = $el.find('[name=type]').val();
        if (oldTypeName) {
          $el.find('[data-type-details]').html('');
        }

        var type = aposPages.getType(typeName);
        if (type.settings) {
          var $typeEl = apos.fromTemplate('.apos-page-settings-' + type._typeCss);
          $el.find('[data-type-details]').html($typeEl);
          var typeDefaults = apos.data.aposPages.page;
          var unserialize = type.settings.unserialize;

          // Tolerate unserialize methods without a callback.
          // TODO I'd like to kill that off, but let's break one thing
          // a day tops if we can.
          if (unserialize.length === 3) {
            var superUnserialize = unserialize;
            unserialize = function(data, $el, $details, callback) {
              superUnserialize(data, $el, $details);
              return callback(null);
            };
          }

          unserialize(typeDefaults, $el, $typeEl, function(err) {
            apos.emit('enhance', $typeEl);
            // TODO: refreshType should take a callback of its own but
            // for now there is nothing to invoke and nothing that absolutely
            // depends on running after it
          });
        } else {
          $el.find('[data-type-details]').html('');
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
          tags: $el.find('[data-name="tags"]').selective('get')
        };

        // Permissions are fancy! But the server does most of the hard work
        data.loginRequired = $el.findByName('loginRequired').val();
        data.loginRequiredPropagate = $el.findByName('loginRequiredPropagate').is(':checked') ? '1' : '0';
        // "certain people" (specific users/groups)
        data.viewGroupIds = $el.find('[data-name="viewGroupIds"]').selective('get');
        data.viewPersonIds = $el.find('[data-name="viewPersonIds"]').selective('get');
        data.editGroupIds = $el.find('[data-name="editGroupIds"]').selective('get');
        data.editPersonIds = $el.find('[data-name="editPersonIds"]').selective('get');

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
              return;
            }
            // Use _.extend to copy top level properties directly and avoid
            // a recursive merge and appending of arrays which would prevent us
            // from, for instance, clearing a list of tags
            _.extend(data, result);
            return save();
          });
        }

        function save() {
          $.ajax(
            {
              url: '/apos-pages/' + action,
              data: data,
              type: 'POST',
              dataType: 'json',
              success: function(data) {
                window.location.href = aposPages.options.root + data.slug;
              },
              error: function() {
                alert('Server error');
                callback('Server error');
              }
            }
          );
        }

        serializeThenSave();
        return false;
      }

      function enablePermissions(page) {
        // Admin users can't manipulate edit permissions. (Hackers could try, but the server
        // ignores anything submitted.)

        if (!apos.data.permissions.admin) {
          $el.find('[data-edit-permissions-container]').hide();
        }

        $el.find('[data-show-view-permissions]').click(function() {
          $(this).closest('.apos-page-settings-toggle').toggleClass('apos-active');
          $el.find('.apos-view-permissions').toggle();
          return false;
        });

        var $loginRequired = $el.findByName('loginRequired');
        $loginRequired.val(page.loginRequired);
        $loginRequired.change(function() {
          var $certainPeople = $el.find('.apos-view-certain-people');
          if ($(this).val() == 'certainPeople') {
            $certainPeople.show();
          } else {
            $certainPeople.hide();
          }
        }).trigger('change');

        $el.find('[data-show-edit-permissions]').click(function() {
          $(this).closest('.apos-page-settings-toggle').toggleClass('apos-active');
          $el.find('.apos-edit-permissions').toggle();
          return false;
        });

        // TODO this is a hardcoded dependency on the people and
        // groups modules, think about whether that is acceptable

        $el.find('[data-name="viewGroupIds"]').selective({
          // Unpublished people and groups can still have permissions
          source: '/apos-groups/autocomplete?published=any',
          data: page.viewGroupIds || [],
          propagate: true,
          preventDuplicates: true
        });

        $el.find('[data-name="viewPersonIds"]').selective({
          source: '/apos-people/autocomplete?published=any',
          data: page.viewPersonIds || [],
          propagate: true,
          preventDuplicates: true
        });

        $el.find('[data-name="editGroupIds"]').selective({
          source: '/apos-groups/autocomplete?published=any',
          data: page.editGroupIds || [],
          propagate: true,
          preventDuplicates: true
        });

        $el.find('[data-name="editPersonIds"]').selective({
          source: '/apos-people/autocomplete?published=any',
          data: page.editPersonIds || [],
          propagate: true,
          preventDuplicates: true
        });
      }

    })();

    $('body').on('click', '[data-reorganize-page]', function() {
      var $tree;
      var $el = apos.modalFromTemplate('.apos-reorganize-page', {
        init: function(callback) {
          $tree = $el.find('[data-tree]');
          $tree.tree({
            data: [],
            autoOpen: 1,
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
              // Append a link to the jqtree-element div.
              // The link has a url '#node-[id]' and a data property 'node-id'.
              var link = $('<a class="apos-visit"></a>');
              link.attr('data-node-id', node.id);
              link.attr('data-visit', '1');
              link.attr('href', '#');
              link.text('»');
              $li.find('.jqtree-element').append(link);

              link = $('<a class="apos-delete"></a>');
              link.attr('data-node-id', node.id);
              link.attr('data-delete', '1');
              link.attr('href', '#');
              link.text('x');
              $li.find('.jqtree-element').append(link);
            }
          });
          $tree.on('click', '[data-visit]', function() {
            var nodeId = $(this).attr('data-node-id');
            var node = $tree.tree('getNodeById', nodeId);
            // TODO: this is an assumption about where the root of the page tree
            // is being served
            window.location.href = node.slug;
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
              },
              error: function() {
                // This didn't work, probably because something
                // else has changed in the page tree. Refreshing
                // is an appropriate response
                apos.afterYield(function() { reload(null); });
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
            var newPathname = (apos.data.aposPages.root + data.slug).replace(/^\/\//, '/');
            if (window.location.pathname === newPathname) {
              apos.change('tree');
              return callback();
            } else {
              // Navigates away, so don't call the callback
              window.location.pathname = newPathname;
            }
          }).error(function() {
            // If the page no longer exists, navigate away to home page
            window.location.pathname = apos.data.aposPages.root;
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
      var slug = $(this).data('slug');
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
              window.location.href = aposPages.options.root + data.parent;
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

