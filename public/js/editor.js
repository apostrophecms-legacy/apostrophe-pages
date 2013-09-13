$.extend(true, window, {
  aposPages: {
    groups: {},
    // Return a page type object if one was configured for the given type name.
    // JavaScript doesn't iterate over object properties in a defined order,
    // so we maintain the list of types as a flat array. This convenience method
    // prevents this from being inconvenient and allows us to choose to do more
    // optimization later.

    getType: function(name) {
      return _.find(apos.data.aposPages.types, function(item) {
        return item.name === name;
      });
    },

    addType: function(type) {
      apos.data.aposPages.types.push(type);
    },

    // Replace a type with a new type object. Typically this is done to replace
    // a type object we got from the server (with just a name and a label) with a
    // type object that includes a settings property with functions for a page
    // settings dialog and so on.
    //
    // We replace rather than extending so that closures with references
    // to "self" still do the right thing.

    replaceType: function(name, object) {
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
    },

    // Right now this is called even for noneditors, but we don't put the
    // menu dropdown markup in the admin bar for them. TODO: we need to better
    // separate globally useful stuff like apos.data.aposPages.types from
    // clearly editor-specific stuff like editing page settings
    enableUI: function(options) {

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
        var otherTypeSettings = {};
        // Active dialog
        var $el;

        $('body').on('click', '.apos-new-page', function() {
          var parent = $(this).data('slug');
          var pageType = $(this).data('pageType');

          $el = apos.modalFromTemplate('.apos-new-page-settings', {
            init: function(callback) {

              // We now can pass an argument to this function that allows a certain page type
              // (identified in the data attribute "page-type") to be automtically selected.
              populateType(pageType);

              // Copy parent's published status
              //
              // TODO: refactor this frequently used dance of boolean values
              // into editor.js or content.js
              var published = apos.data.aposPages.page.published;
              if (published === undefined) {
                published = 1;
              } else {
                // Simple POST friendly boolean values
                published = published ? '1' : '0';
              }

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
              $el.find('[name=published]').val(published);
              $el.find('[name=type]').val(apos.data.aposPages.page.type);
              $el.find('[name=title]').val(apos.data.aposPages.page.title);
              $el.find('[name=slug]').val(slug);
              apos.enableTags($el.find('[data-name="tags"]'), apos.data.aposPages.page.tags);

              // Persistence for settings made when the page had a different type.
              // Makes Apostrophe forgiving of otherwise serious mistakes, like
              // adding 20 hand-curated choices in custom page settings for a type,
              // switching to another type, saving, and then changing your mind
              if (apos.data.aposPages.page.otherTypeSettings) {
                otherTypeSettings = apos.data.aposPages.page.otherTypeSettings;
              }

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
          function save(callback) {
            return addOrEdit('edit', { slug: slug }, callback);
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
            $option.text(type.label);
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
            var oldType = aposPages.getType(oldTypeName);
            if (oldType.settings) {
              otherTypeSettings[oldTypeName] = oldType.settings.serialize($el, $el.find('[data-type-details]'));
            }
            $el.find('[data-type-details]').html('');
          }
          oldTypeName = typeName;

          var type = aposPages.getType(typeName);

          if (type.settings) {
            var $typeEl = apos.fromTemplate('.apos-page-settings-' + type._typeCss);
            $el.find('[data-type-details]').html($typeEl);
            var typeDefaults = otherTypeSettings[typeName];
            if (!typeDefaults) {
              if (apos.data.aposPages.page.type === type.name) {
                typeDefaults = apos.data.aposPages.page.typeSettings;
              }
            }
            if (!typeDefaults) {
              typeDefaults = {};
            }
            type.settings.unserialize(typeDefaults, $el, $el.find('[data-type-details]'));
          }
        }

        function addOrEdit(action, options, callback) {
          var typeName = $el.find('[name=type]').val();
          var type = aposPages.getType(typeName);

          var data = {
            title: $el.find('[name=title]').val(),
            slug: $el.find('[name=slug]').val(),
            type: $el.find('[name=type]').val(),
            published: $el.find('[name=published]').val(),
            tags: $el.find('[data-name="tags"]').selective('get'),
            otherTypeSettings: otherTypeSettings
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
          if (type) {
            if (type.settings && type.settings.serialize) {
              data.typeSettings = type.settings.serialize($el, $el.find('[data-type-details]'));
            }
          }
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
              }
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
                success: function() {
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
    },

    // This method can also be invoked by snippets and anything else that
    // is represented by a page.
    browseVersions: function(pageId) {
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
    }
  }
});


