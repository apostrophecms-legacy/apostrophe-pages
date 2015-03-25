/*jshint undef:true */
/*jshint node:true */

var async = require('async');
var _ = require('lodash');
var extend = require('extend');
var path = require('path');

RegExp.quote = require('regexp-quote');

module.exports = function(options, callback) {
  return new pages(options, callback);
};

function pages(options, callback) {
  var apos = options.apos;
  var app = options.app;
  var self = this;
  var aposPages = this;
  self._action = '/apos-pages';
  self._apos = apos;

  // Usage: app.get('*', pages.serve({ typePath: __dirname + '/views/pages' }))
  //
  // If you use this global wildcard route, make it your LAST route,
  // as otherwise it overrides everything else.
  //
  // If you want to mount your pages as a "subdirectory:"
  //
  // app.get('/pages/*', pages.serve({ ... }))
  //
  // You can use other route patterns, as long as req.params[0] contains the
  // page slug.
  //
  // self.serve will automatically prepend a / to the slug if
  // req.params[0] does not contain one.
  //
  // The page object is passed to the Nunjucks type as `page`.
  //
  // If you want to also load all areas on the "global" page, for instance
  // to fetch shared headers and footers used across a site, supply a
  // `load` callback:
  //
  // app.get('/pages/*', pages.serve({ load: [ 'global' ] }, ...))
  //
  // The page with the slug `global` then becomes visible to the Nunjucks
  // type as `global`. Note that it may not exist yet, in which case
  // `global` is not set. Your type code must allow for this.
  //
  // You can include functions in the load: array. If you do so, those
  // functions are invoked as callbacks, and receive 'req' as their first
  // parameter. They should add additional page objects as properties of the
  // req.extras object, then invoke the callback they receive as their
  // second parameter with null, or with an error if they have failed in a
  // way that should result in a 500 error. All such extra pages are made
  // visible to Nunjucks. For instance, if you load req.extras.department,
  // then a variable named department containing that page is visible to Nunjucks.
  //
  // It is is also acceptable to pass a single function rather than an
  // array as the `load` property.
  //
  // The type name used to render the page is taken from
  // the type property of the req.page object. You will need to set the
  // directory from which page type templates are loaded:
  //
  // app.get('*', pages.serve({ typePath: __dirname + '/views/pages' })
  //
  // You can also override individual type paths. Any paths you don't
  // override continue to respect typePath. Note that you are still
  // specifying a folder's path, which must contain a nunjucks type
  // named home.html to render a page with that type property:
  //
  // app.get('*', pages.serve({ ..., typePaths: { home: __dirname + '/views/pages' } })
  //
  // In the event the page slug requested is not found, the notfound type
  // is rendered. You can override the notfound type path like any other.
  //
  // Loaders can access the page loaded by `page.serve` as `req.page`. This will
  // be null if no page slug matched the URL exactly.  However, if there is a page
  // that matches a leading portion of the URL when followed by `/`, that page
  // is also made available as `req.bestPage`. In this case the remainder of the
  // URL after the slug of the best page is returned as `req.remainder`. If more
  // than one page partially matches the URL the longest match is provided.
  //
  // Loaders can thus implement multiple-page experiences of almost any complexity
  // by paying attention to `req.remainder` and choosing to set `req.template` to
  // something that suits their purposes. If `req.template` is set by a loader it is
  // used instead of the original type of the page to select a template. Usually this
  // process begins by examining `req.bestPage.type` to determine whether it is suitable
  // for this treatment (a blog page, for example, might need to implement virtual
  // subpages for articles in this way).
  //
  // Loaders can also set req.page to req.bestPage, and should do so when electing
  // to accept a partial match, because this makes the page available to templates.
  //
  // Page type templates will want to render areas, passing along the slug and the
  // edit permission flag:
  //
  // {{ aposArea({ slug: slug + ':main', area: page.main, edit: edit }) }}
  //
  // {{ aposArea({ slug: 'global:footer', area: global.footer, edit: edit }) }}
  //
  // You can access all properties of the page via the 'page' object. Any pages
  // added to extras by `load` callbacks are also visible, like `global` above.
  //
  // If you want to create pages dynamically when nonexistent page slugs are visited,
  // you can supply a notfound handler:
  //
  // // Just create an empty page object like a wiki would
  // app.get('*', pages.serve({
  //   notfound: function(req, callback) {
  //     req.page = { };
  //     callback(null);
  //   }
  // });
  //
  // If you do not set req.page the normal page-not-found behavior is applied.
  // If you do not supply a type property, 'default' is assumed.
  //
  // A JSON interface is also built in for each page: if you add
  // ?pageInformation=json to the URL, a JSON description of the page
  // is returned, including any information added to the page object
  // by loader functions. This is available only to users with
  // editing permissions.

  self.serve = function(options) {

    if(!options) {
      options = {};
    }
    _.defaults(options, {
      root: ''
    });

    return function(req, res) {
      // we can use the __ function here, since we're in a request
      var __ = res.__;

      // let's push translations for the page types for this specific request
      // the reason we do it here, as opposed to a global push is because
      // we can't know which language the user wants until the request is served
      var pageTypesLocaleStrings = {};
      _.each(self.types, function(type){
        pageTypesLocaleStrings[type.label] = __(type.label);

        if(type.pluralLabel)
          pageTypesLocaleStrings[type.pluralLabel] = __(type.pluralLabel);

        if(type.instanceLabel)
          pageTypesLocaleStrings[type.instanceLabel] = __(type.instanceLabel);
      });

      apos.pushLocaleStrings(pageTypesLocaleStrings, req);

      function time(fn, name) {
        return function(callback) {
          req.traceIn(name);
          return fn(function(err) {
            req.traceOut();
            return callback(err);
          });
        };
      }

      function timeSync(fn, name) {
        req.traceIn(name);
        fn();
        req.traceOut();
      }

      // Let's defer various types of widget joins
      // until the last possible minute for all
      // content loaded as part of this request, so
      // we can do it with one efficient query
      // per type instead of many queries

      req.deferredLoads = {};
      req.deferredLoaders = {};

      // Express doesn't provide the absolute URL the user asked for by default.
      // TODO: move this to middleware for even more general availability in Apostrophe.
      // See: https://github.com/visionmedia/express/issues/1377
      if (!req.absoluteUrl) {
        req.absoluteUrl = req.protocol + '://' + req.get('Host') + apos.prefix + req.url;
      }

      req.extras = {};

      req.traceIn('TOTAL');

      return async.series([time(page, 'page'), time(secondChanceLogin, 'secondChanceLogin'), time(relatives, 'relatives'), time(load, 'load'), time(notfound, 'notfound'), time(executeDeferredLoads, 'deferred loads')], main);

      function page(callback) {
        // Get content for this page
        req.slug = req.params[0];

        // Fix common screwups in URLs: leading/trailing whitespace,
        // presence of trailing slashes (but always restore the
        // leading slash). Express leaves escape codes uninterpreted
        // in the path, so look for %20, not ' '.
        req.slug = req.slug.trim();
        req.slug = req.slug.replace(/\/+$/, '');
        if ((!req.slug.length) || (req.slug.charAt(0) !== '/')) {
          req.slug = '/' + req.slug;
        }

        // Had to change the URL, so redirect to it. TODO: this
        // contains an assumption that we are mounted at /
        if (req.slug !== req.params[0]) {
          return res.redirect(req.slug);
        }

        apos.getPage(req, req.slug, function(e, page, bestPage, remainder) {
          if (e) {
            return callback(e);
          }

          // Set on exact slug matches only

          // "What if there is no page?" We'll note that later
          // and send the 404 type. We still want to load all
          // the global stuff first
          req.page = page;

          // Set on partial slug matches followed by a / and on
          // exact matches as well
          req.bestPage = bestPage;

          // Set to the empty string on exact matches, otherwise
          // to the portion of the URL after the slug of req.bestPage. Note
          // that any trailing / has already been removed. A leading
          // / is always present, even if the page is the home page.
          req.remainder = remainder;

          if (req.bestPage) {
            req.bestPage.url = apos.prefix + options.root + req.bestPage.slug;
          }

          return callback(null);

        });
      }

      function secondChanceLogin(callback) {
        if (!options.secondChanceLogin) {
          return callback(null);
        }

        if (req.user) {
          return callback(null);
        }

        if (req.page) {
          return callback(null);
        }
        // Try again with admin privs. If we get a better page,
        // note the URL in the session and redirect to login.
        return apos.getPage(apos.getTaskReq(), req.slug, { fields: { slug: 1 } }, function(e, page, bestPage, remainder) {
          if (e) {
            return callback(e);
          }
          if (page || (bestPage && req.bestPage && req.bestPage.slug < bestPage.slug)) {
            res.cookie('aposAfterLogin', req.url);
            return res.redirect('/login');
          }
          return callback(null);
        });
      }

      function relatives(callback) {
        if(!req.bestPage) {
          return callback(null);
        }
        async.series({
          ancestors: time(function(callback) {
            // ancestors are always fetched. You need 'em
            // for tabs, you need 'em for breadcrumb, you
            // need 'em for the admin UI. You just need 'em.
            var ancestorOptions = options.ancestorOptions ? _.cloneDeep(options.ancestorOptions) : {};
            if (!ancestorOptions.childrenOptions) {
              ancestorOptions.childrenOptions = {};
            }
            ancestorOptions.childrenOptions.orphan = false;

            return self.getAncestors(req, req.bestPage, options.ancestorCriteria || {}, ancestorOptions || {}, function(err, ancestors) {
              req.bestPage.ancestors = ancestors;
              if (ancestors.length) {
                // Also set parent as a convenience
                req.bestPage.parent = req.bestPage.ancestors.slice(-1)[0];
              }
              return callback(err);
            });
          }, 'ancestors'),
          peers: time(function(callback) {
            if (options.peers || true) {
              var ancestors = req.bestPage.ancestors;
              if (!ancestors.length) {
                // The only peer of the homepage is itself.
                //
                // Avoid a circular reference that crashes
                // extend() later when we try to pass the homepage
                // as the .permalink option to a loader. This
                // happens if the homepage is a blog.
                var selfAsPeer = {};
                extend(true, selfAsPeer, req.bestPage);
                req.bestPage.peers = [ selfAsPeer ];
                return callback(null);
              }
              var parent = ancestors[ancestors.length - 1];
              var peerOptions = options.peerOptions ? _.cloneDeep(options.peerOptions) : {};
              peerOptions.orphan = false;
              self.getDescendants(req, parent, peerOptions, function(err, pages) {
                req.bestPage.peers = pages;
                return callback(err);
              });
            } else {
              return callback(null);
            }
          }, 'peers'),
          descendants: time(function(callback) {
            if (options.descendants || true) {
              var descendantOptions = options.descendantOptions ? _.cloneDeep(options.descendantOptions) : {};
              descendantOptions.orphan = false;
              return self.getDescendants(req, req.bestPage, options.descendantCriteria || {}, descendantOptions, function(err, children) {
                req.bestPage.children = children;
                return callback(err);
              });
            } else {
              return callback(null);
            }
          }, 'descendants'),
          tabs: time(function(callback) {
            if (options.tabs || true) {
              var tabOptions = options.tabOptions ? _.cloneDeep(options.tabOptions) : {};
              tabOptions.orphan = false;
              self.getDescendants(req, req.bestPage.ancestors[0] ? req.bestPage.ancestors[0] : req.bestPage, options.tabCriteria || {}, tabOptions, function(err, pages) {
                req.bestPage.tabs = pages;
                return callback(err);
              });
            } else {
              return callback(null);
            }
          }, 'tabs')
        }, callback);
      }

      function load(callback) {
        // Get any shared pages like global footers, also
        // invoke load callbacks if needed

        var loadList = options.load ? options.load : [];

        // Be tolerant if they pass just one function
        if (typeof(loadList) === 'function') {
          loadList = [ loadList ];
        }

        // Turn any slugs into callbacks to fetch those slugs.
        // This is a little lazy: if we turn out to need multiple
        // pages of shared stuff we could coalesce them into a
        // single mongo query. However we typically don't, or
        // we're loading some of them only in certain situations.
        // So let's not prematurely optimize

        loadList = loadList.map(function(item) {
          if (typeof(item) !== 'function') {
            return function(callback) {
              // Hardcoded slugs of virtual pages to be loaded for every user every time
              // imply we're not concerned with permissions. Avoiding them saves us the
              // hassle of precreating pages like "global" just to set published: true etc.
              apos.getPage(req, item, { permissions: false }, function(err, page) {
                if (err) {
                  return callback(err);
                }
                // The new syntax for aposArea() requires a more convincing fake page!
                // Populate slug and permissions correctly
                req.extras[item] = page ? page : { slug: item };
                if (!page) {
                  req.extras[item]._edit = true;
                }
                return callback(null);
              });
            };
          } else {
            // Already a callback, now wrap it in a function that can
            // see the req variable
            return function(callback) {
              return item(req, callback);
            };
          }
        });

        // series lets later modules' loaders see the results of earlier ones
        return async.series(loadList, callback);
      }

      function notfound(callback) {
        // Implement the automatic redirect mechanism for pages whose
        // slugs have changed, unless an alternate mechanism has been specified
        if ((!req.page) || (req.notfound)) {
          if (options.notfound) {
            return options.notfound(req, function(err) {
              return callback(err);
            });
          } else {
            // Check for a redirect from an old slug before giving up
            apos.redirects.findOne({from: req.slug }, function(err, redirect) {
              if (redirect) {
                return res.redirect(options.root + redirect.to);
              } else {
                return callback(null);
              }
            });
          }
        } else {
          return callback(null);
        }
      }

      function executeDeferredLoads(callback) {
        // Keep making passes until there are
        // no more recursive loads to do; loads
        // may do joins that require more loads, etc.
        var deferredLoads;
        var deferredLoaders;
        return async.whilst(function() {
          deferredLoads = req.deferredLoads;
          deferredLoaders = req.deferredLoaders;
          req.deferredLoads = {};
          req.deferredLoaders = {};
          return !_.isEmpty(deferredLoads);
        }, function(callback) {
          return async.eachSeries(
            _.keys(deferredLoads),
            function(type, callback) {
              return deferredLoaders[type](req, deferredLoads[type], callback);
            },
            callback);
        }, callback);
      }

      function main(err) {
        var providePage = true;
        // Rendering errors isn't much different from
        // rendering other stuff. We still get access
        // to shared stuff loaded via `load`.

        // If the load functions already picked a type respect it,
        // whether it is on the allowed list for manual type choices
        // or not. Otherwise implement standard behaviors

        // pages.serve treats the request object as a repository of everything
        // we know about this request so far, including simple hints about the
        // desired response. This is different from the default paradigm
        // of Express.

        if (req.contentType) {
          res.setHeader('Content-Type', req.contentType);
        }

        if (req.redirect) {
          return res.redirect(req.redirect);
        }

        if (req.notfound) {
          // A loader asked us to 404
          res.statusCode = 404;
          req.template = 'notfound';
          providePage = false;
        } else if (!req.template) {
          if (err) {
            console.log(err);
            req.template = 'serverError';
            res.statusCode = 500;
            providePage = false;
          } else if (req.loginRequired) {
            req.template = 'loginRequired';
            providePage = false;
          } else if (req.insufficient) {
            req.template = 'insufficient';
            providePage = false;
          } else if (req.page) {
            // Make sure the type is allowed
            req.template = req.page.type;
            // This check was coded incorrectly and never
            // actually flunked a missing template. I have
            // fixed the check, but I don't want to break 0.5 sites.
            // TODO: revive this code in 0.6 and test more.
            //
            // -Tom
            //
            // if (!_.some(aposPages.types, function(item) {
            //   return item.name === req.template;
            // })) {
            //   req.template = 'default';
            // }
          } else {
            res.statusCode = 404;
            req.template = 'notfound';
            providePage = false;
          }
        }

        if (req.template === undefined) {
          // Supply a default template name
          req.template = 'default';
        }

        if (providePage) {
          req.traceIn('prune page');
          req.pushData({
            aposPages: {
              // Prune the page back so we're not sending everything
              // we know about every event in every widget etc., which
              // is redundant and results in slow page loads and
              // high bandwidth usage
              page: apos.prunePage(req.bestPage)
            }
          });
          req.traceOut();
        }

        if (typeof(req.contextMenu) === 'function') {
          // Context menu can be generated on the fly
          // by a function
          req.contextMenu = req.contextMenu(req);
        }

        var args = {
          edit: providePage ? req.bestPage._edit : null,
          slug: providePage ? req.bestPage.slug : null,
          page: providePage ? req.bestPage : null,
          // Allow page loaders to set the context menu
          contextMenu: req.contextMenu
        };

        if (args.page && args.edit && (!args.contextMenu)) {
          // Standard context menu for a regular page
          args.contextMenu = [
            {
              name: 'new-page',
              label: 'New Page'
            },
            {
              name: 'edit-page',
              label: 'Page Settings'
            },
            {
              name: 'versions-page',
              label: 'Page Versions'
            },
            {
              name: 'delete-page',
              label: 'Move to Trash'
            },
            {
              name: 'reorganize-page',
              label: 'Reorganize'
            }
          ];
        }

        else if (args.contextMenu && req.user) {
          // This user does NOT have permission to see reorg,
          // but it might exist already in the contextMenu (why??),
          // so we have to remove it explicitly.
          args.contextMenu = _.filter(args.contextMenu, function(item) {
            return item.name !== 'reorganize-page';
          });
        }

        if (args.page) {
          var type = self.getType(args.page.type);
          if (type && type.childTypes && (!type.childTypes.length)) {
            // Snip out add page if no
            // child page types are allowed
            args.contextMenu = _.filter(args.contextMenu, function(item) {
              return item.name !== 'new-page';
            });
          }
        }

        _.extend(args, req.extras);

        // A simple way to access everything we know about the page
        // in JSON format. Allow this only if we have editing privileges
        // on the page.
        if ((req.query.pageInformation === 'json') && args.page && (args.page._edit)) {
          return res.send(args.page);
        }

        var path;

        if (typeof(req.template) === 'string') {
          path = __dirname + '/views/' + req.template;
          if (options.templatePath) {
            path = options.templatePath + '/' + req.template;
          }
        }

        var result;
        timeSync(function() {
          result = self.renderPage(req, path ? path : req.template, args);
          if (req.statusCode) {
            res.statusCode = req.statusCode;
          }
        }, 'render');

        req.traceOut();
        self._apos.traceReport(req);

        if (!req.user) {
          // Most recent Apostrophe page they saw is a good
          // candidate to redirect them to if they choose to log in.
          // However don't make a memo of an ajax load of the third
          // page of people in the directory, etc. Don't make a memo
          // of a 404 or other error page, either
          if (options.updateAposAfterLogin && ((!res.statusCode) || (res.statusCode === 200)) && (!req.xhr) && (!req.query.xhr)) {
            res.cookie('aposAfterLogin', req.url);
          }
        }

        return res.send(result);
      }
    };
  };

  // Fetch ancestors of the specified page. We need req to
  // determine permissions. Normally areas associated with
  // ancestors are not returned. If you specify options.areas as
  // `true`, all areas will be returned. If you specify options.areas
  // as an array of area names, areas in that list will be returned.
  //
  // You may use options.getOptions to pass additional options
  // directly to apos.get, notably trash: 'any' for use when
  // implementing reorganize, trashcan, etc.
  //
  // You may use the criteria parameter to directly specify additional
  // MongoDB criteria ancestors must match to be returned.
  //
  // You may skip the criteria and options arguments.

  self.getAncestors = function(req, page, criteriaArg, options, callback) {
    if (arguments.length === 4) {
      callback = arguments[3];
      options = arguments[2];
      criteriaArg = {};
    }
    if (arguments.length === 3) {
      callback = arguments[2];
      criteriaArg = {};
      options = {};
    }
    _.defaults(options, {
      root: ''
    });

    var paths = [];
    // Pages that are not part of the tree and the home page of the tree
    // have no ancestors
    if ((!page.path) || (page.path.indexOf('/') === -1)) {
      return callback(null, paths);
    }

    var components = page.path.split('/');
    var path = '';
    _.each(components, function(component) {
      path += component;
      // Don't redundantly load ourselves
      if (path === page.path) {
        return;
      }
      paths.push(path);
      path += '/';
    });

    var getOptions = {
      fields: {
        lowSearchText: 0, highSearchText: 0, searchSummary: 0
      },
      sort: {
        path: 1
      }
    };

    if (options.areas) {
      getOptions.areas = options.areas;
    } else {
      // We can't populate the fields option because we can't know the names
      // of all the area properties in the world in order to exclude them.
      // Use the `areas` option which filters them after fetching so we at least
      // don't pay to run their loaders
      getOptions.areas = false;
    }

    if (options.getOptions) {
      extend(true, getOptions, options.getOptions);
    }

    var criteria = {
      $and: [
        { path: { $in: paths } },
        criteriaArg
      ]
    };

    var pages;
    return async.series({
      getAncestors: function(callback) {
        // Get metadata about the related pages, skipping expensive stuff.
        // Sorting by path works because longer strings sort
        // later than shorter prefixes
        return apos.get(req, criteria, getOptions, function(err, results) {
          if (err) {
            return callback(err);
          }
          pages = results.pages;
          _.each(pages, function(page) {
            page.url = apos.prefix + options.root + page.slug;
          });
          return callback(null);
        });
      },
      getChildrenOfAncestors: function(callback) {
        if (!options.children) {
          return callback(null);
        }
        // TODO: there is a clever mongo query to avoid
        // separate invocations of getDescendants
        return async.eachSeries(pages, function(page, callback) {
          var childrenOptions = options.childrenOptions || {};
          return self.getDescendants(req, page, {}, childrenOptions, function(err, pages) {
            if (err) {
              return callback(err);
            }
            page.children = pages;
            return callback(null);
          });
        }, callback);
      }
    }, function (err) {
      if (err) {
        return callback(err);
      }
      return callback(null, pages);
    });
  };

  // We need req to determine permissions
  self.getParent = function(req, page, options, callback) {
    if (arguments.length === 3) {
      callback = arguments[2];
      options = {};
    }
    return self.getAncestors(req, page, options, function(err, ancestors) {
      if (err) {
        return callback(err);
      }
      if (!ancestors.length) {
        return callback(null);
      }
      return callback(null, ancestors[ancestors.length - 1]);
    });
  };

  // The `trash` option controls whether pages with the trash flag are
  // included. If true, only trash is returned. If false, only non-trash
  // is returned. If null, both are returned. false is the default.
  //
  // The `orphan` option works the same way. `orphan` pages are
  // normally accessible, but are snot shown in subnav, tabs, etc., so
  // this is the only method for which `orphan` defaults to false.
  //
  // Normally areas associated with ancestors are not returned.
  // If you specify `options.areas` as `true`, all areas will be returned.
  // If you specify `options.areas` as an array of area names, areas on that
  // list will be returned.
  //
  // Specifying options.depth = 1 fetches immediate children only.
  // You may specify any depth. The default depth is 1.
  //
  // You may also pass arbitrary mongodb criteria as the criteria parameter.
  //
  // You may skip the criteria argument, or both criteria and options.

  self.getDescendants = function(req, ofPage, criteriaArg, optionsArg, callback) {
    if (arguments.length === 4) {
      callback = arguments[3];
      optionsArg = arguments[2];
      criteriaArg = {};
    }
    if (arguments.length === 3) {
      callback = arguments[2];
      optionsArg = {};
      criteriaArg = {};
    }
    var options = {};
    extend(true, options, optionsArg);
    _.defaults(options, {
      root: ''
    });

    var depth = options.depth;
    // Careful, let them specify a depth of 0 but still have a good default
    if (depth === undefined) {
      depth = 1;
    }

    var criteria = {
      $and: [
        {
          path: new RegExp('^' + RegExp.quote(ofPage.path + '/')),
          level: { $gt: ofPage.level, $lte: ofPage.level + depth }
        }, criteriaArg
      ]
    };

    // Skip expensive things
    options.fields = { lowSearchText: 0, highSearchText: 0, searchSummary: 0 };
    if (!options.areas) {
      // Don't fetch areas at all unless we're interested in a specific
      // subset of them
      options.areas = false;
    }
    options.sort = { level: 1, rank: 1 };

    apos.get(req, criteria, options, function(err, results) {
      if (err) {
        return callback(err);
      }
      var pages = results.pages;
      var children = [];
      var pagesByPath = {};
      _.each(pages, function(page) {
        page.children = [];
        page.url = apos.prefix + options.root + page.slug;
        pagesByPath[page.path] = page;
        var last = page.path.lastIndexOf('/');
        var parentPath = page.path.substr(0, last);
        if (pagesByPath[parentPath]) {
          pagesByPath[parentPath].children.push(page);
        } else if (page.level === (ofPage.level + 1)) {
          children.push(page);
        } else {
          // The parent of this page is hidden from us, so we shouldn't
          // include this page in the results as viewed from here
        }
      });
      return callback(null, children);
    });
  };

  // Get all pages that have the mentioned tag. 'options' parameter, if present,
  // may contain an 'areas' flag indicating that the content areas should be returned,
  // otherwise only metadata is returned. Pages are sorted by rank, which is helpful
  // if you are using tags to display a subset of child pages and wish to preserve their
  // natural order. Pages are not returned in a tree structure, pages of any level
  // may appear anywhere in the result
  self.getByTag = function(req, tag, options, callback) {
    return self.getByTags(req, [tag], options, callback);
  };

  // Get all pages that have at least one of the mentioned tags. 'options' parameter,
  // if present, may contain an 'areas' flag indicating that the content areas should
  // be returned, otherwise only metadata is returned.
  //
  // Pages are sorted by rank, which is helpful if you are using tags to display a subset
  // of child pages and wish to preserve their natural order. Pages are not returned in a tree
  // structure, pages of any level may appear anywhere in the result
  self.getByTags = function(req, tags, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    if (!options.areas) {
      options.areas = false;
    }
    var criteria = { path: { $exists: 1 }, tags: { $in: tags }};
    return apos.get(req, criteria, options, function(err, results) {
      if (err) {
        return callback(err);
      }
      var pages;
      if (results) {
        pages = results.pages;
      }
      return callback(null, results);
    });
  };

  // Filter the pages array to those pages that have the specified tag. Returns directly,
  // has no callback
  self.filterByTag = function(pages, tag) {
    return self.filterByTags(pages, [tag]);
  };

  // Filter the pages array to those pages that have at least one of the specified tags.
  // Returns directly, has no callback
  self.filterByTags = function(pages, tags) {
    return _.filter(pages, function(page) {
      return page.tags && _.some(page.tags, function(tag) {
        return _.contains(tags, tag);
      });
    });
  };

  // position can be 'before', 'after' or 'inside' and determines the
  // moved page's new relationship to the target page. You may pass
  // page objects instead of slugs if you have them. The callback
  // receives an error and, if there is no error, also an array of
  // objects with _id and slug properties, indicating the new slugs
  // of all modified pages

  self.move = function(req, movedSlug, targetSlug, position, callback) {
    var moved, target, parent, oldParent, changed = [];
    if (typeof(movedSlug) === 'object') {
      moved = movedSlug;
    }
    if (typeof(targetSlug) === 'object') {
      target = targetSlug;
    }
    var rank;
    var originalPath;
    var originalSlug;
    async.series([getMoved, getTarget, getOldParent, getParent, permissions, nudgeNewPeers, moveSelf, updateRedirects, moveDescendants, trashDescendants ], finish);
    function getMoved(callback) {
      if (moved) {
        return callback(null);
      }
      if (movedSlug.charAt(0) !== '/') {
        return callback('not a tree page');
      }
      apos.pages.findOne({ slug: movedSlug }, function(err, page) {
        if (!page) {
          return callback('no such page');
        }
        moved = page;
        if (!moved.level) {
          return callback('cannot move root');
        }
        // You can't move the trashcan itself, but you can move its children
        if (moved.trash && (moved.level === 1)) {
          return callback('cannot move trashcan');
        }
        return callback(null);
      });
    }
    function getTarget(callback) {
      if (target) {
        return callback(null);
      }
      if (targetSlug.charAt(0) !== '/') {
        return callback('not a tree page');
      }
      apos.pages.findOne({ slug: targetSlug }, function(err, page) {
        if (!page) {
          return callback('no such page');
        }
        target = page;
        if ((target.trash) && (target.level === 1) && (position === 'after')) {
          return callback('trash must be last');
        }
        return callback(null);
      });
    }
    function getOldParent(callback) {
      self.getParent(req, moved, { getOptions: { permissions: false, trash: 'any' } }, function(err, parentArg) {
        oldParent = parentArg;
        return callback(err);
      });
    }
    function getParent(callback) {
      if (position === 'inside') {
        parent = target;
        rank = 0;
        return callback(null);
      }
      if (position === 'before') {
        rank = target.rank;
        if (rank >= 1000000) {
          // It's legit to move a page before search or trash, but we
          // don't want its rank to wind up in the reserved range. Find
          // the rank of the next page down and increment that.
          return self.pages.find({ slug: /^\//, path: /^home\/[^\/]$/ }, { rank: 1 }).sort({ rank: -1 }).limit(1).toArray(function(err, pages) {
            if (err) {
              return callback(err);
            }
            if (!pages.length) {
              rank = 1;
              return callback(null);
            }
            rank = pages[0].rank;
            return callback(null);
          });
        }
      } else if (position === 'after') {
        if (target.rank >= 1000000) {
          // Reserved range
          return callback('cannot move a page after a system page');
        }
        rank = target.rank + 1;
      } else {
        return callback('no such position option');
      }
      self.getParent(req, target, { getOptions: { permissions: false, trash: 'any' } }, function(err, parentArg) {
        if (!parentArg) {
          return callback('cannot create peer of home page');
        }
        parent = parentArg;
        return callback(null);
      });
    }
    function permissions(callback) {
      if (!apos.permissions.can(req, 'publish-page', moved)) {
        return callback('forbidden');
      }
      // You can always move a page into the trash. You can
      // also change the order of subpages if you can
      // edit the subpage you're moving. Otherwise you
      // must have edit permissions for the new parent page.
      if ((oldParent._id !== parent._id) && (parent.path !== 'home/trash') && (!apos.permissions.can(req, 'edit-page', parent))) {
        return callback('forbidden');
      }
      return callback(null);
    }
    // This results in problems if the target is below us, and
    // it really doesn't matter if there are gaps between ranks. -Tom
    //
    // function nudgeOldPeers(callback) {
    //   // Nudge up the pages that used to follow us
    //   // Leave reserved range alone
    //   var oldParentPath = path.dirname(moved.path);
    //   apos.pages.update({ path: new RegExp('^' + RegExp.quote(oldParentPath + '/')), level: moved.level, rank: { $gte: moved.rank, $lte: 1000000 }}, { $inc: { rank: -1 } }, { multi: true }, function(err, count) {
    //     return callback(err);
    //   });
    // }
    function nudgeNewPeers(callback) {
      // Nudge down the pages that should now follow us
      // Leave reserved range alone
      // Always remember multi: true
      apos.pages.update({ path: new RegExp('^' + RegExp.quote(parent.path + '/')), level: parent.level + 1, rank: { $gte: rank, $lte: 1000000 } }, { $inc: { rank: 1 } }, { multi: true }, function(err, count) {
        return callback(err);
      });
    }
    function moveSelf(callback) {
      originalPath = moved.path;
      originalSlug = moved.slug;
      var level = parent.level + 1;
      var newPath = parent.path + '/' + path.basename(moved.path);
      // We're going to use update with $set, but we also want to update
      // the object so that moveDescendants can see what we did
      moved.path = newPath;
      // If the old slug wasn't customized, update the slug as well as the path
      if (parent._id !== oldParent._id) {
        var matchOldParentSlugPrefix = new RegExp('^' + RegExp.quote(apos.addSlashIfNeeded(oldParent.slug)));
        if (moved.slug.match(matchOldParentSlugPrefix)) {
          var slugStem = parent.slug;
          if (slugStem !== '/') {
            slugStem += '/';
          }
          moved.slug = moved.slug.replace(matchOldParentSlugPrefix, apos.addSlashIfNeeded(parent.slug));
          changed.push({
            _id: moved._id,
            slug: moved.slug
          });
        }
      }
      moved.level = level;
      moved.rank = rank;
      // Are we in the trashcan? Our new parent reveals that
      if (parent.trash) {
        moved.trash = true;
      } else {
        delete moved.trash;
      }
      apos.putPage(req, originalSlug, moved, function(err, page) {
        moved = page;
        return callback(null);
      });
    }
    function updateRedirects(callback) {
      return apos.updateRedirect(originalSlug, moved.slug, callback);
    }
    function moveDescendants(callback) {
      return self.updateDescendantPathsAndSlugs(moved, originalPath, originalSlug, function(err, changedArg) {
        if (err) {
          return callback(err);
        }
        changed = changed.concat(changedArg);
        return callback(null);
      });
    }
    function trashDescendants(callback) {
      // Make sure our descendants have the same trash status
      var matchParentPathPrefix = new RegExp('^' + RegExp.quote(moved.path + '/'));
      var $set = {};
      var $unset = {};
      if (moved.trash) {
        $set.trash = true;
      } else {
        $unset.trash = true;
      }
      var action = {};
      if (!_.isEmpty($set)) {
        action.$set = $set;
      }
      if (!_.isEmpty($unset)) {
        action.$unset = $unset;
      }
      if (_.isEmpty(action)) {
        return setImmediate(callback);
      }
      return apos.pages.update({ path: matchParentPathPrefix }, action, { multi: true }, callback);
    }
    function finish(err) {
      if (err) {
        return callback(err);
      }
      return callback(null, changed);
    }
  };

  /**
   * Update the paths and slugs of descendant pages, changing slugs only if they were
   * compatible with the original slug. On success, invokes callback with
   * null and an array of objects with _id and slug properties, indicating
   * the new slugs for any objects that were modified.
   * @param  {page}   page
   * @param  {string}   originalPath
   * @param  {string}   originalSlug
   * @param  {Function} callback
   */
  self.updateDescendantPathsAndSlugs = function(page, originalPath, originalSlug, callback) {
    // If our slug changed, then our descendants' slugs should
    // also change, if they are still similar. You can't do a
    // global substring replace in MongoDB the way you can
    // in MySQL, so we need to fetch them and update them
    // individually. async.mapSeries is a good choice because
    // there may be zillions of descendants and we don't want
    // to choke the server. We could use async.mapLimit, but
    // let's not get fancy just yet
    var changed = [];
    if ((originalSlug === page.slug) && (originalPath === page.path)) {
      return callback(null, changed);
    }
    var oldLevel = originalPath.split('/').length - 1;
    var matchParentPathPrefix = new RegExp('^' + RegExp.quote(originalPath + '/'));
    var matchParentSlugPrefix = new RegExp('^' + RegExp.quote(originalSlug + '/'));
    var done = false;
    var cursor = apos.pages.find({ path: matchParentPathPrefix }, { slug: 1, path: 1, level: 1 });
    return async.whilst(function() { return !done; }, function(callback) {
      return cursor.nextObject(function(err, desc) {
        if (err) {
          return callback(err);
        }
        if (!desc) {
          // This means there are no more objects
          done = true;
          return callback(null);
        }
        var newSlug = desc.slug.replace(matchParentSlugPrefix, page.slug + '/');
        changed.push({
          _id: desc._id,
          slug: newSlug
        });
        return async.series({
          update: function(callback) {
            return apos.pages.update({ _id: desc._id }, { $set: {
              // Always matches
              path: desc.path.replace(matchParentPathPrefix, page.path + '/'),
              // Might not match, and we don't care (if they edited the slug that far up,
              // they did so intentionally)
              slug: newSlug,
              level: desc.level + (page.level - oldLevel)
            }}, callback);
          },
          redirect: function(callback) {
            if (desc.slug === newSlug) {
              return setImmediate(callback);
            }
            return apos.updateRedirect(desc.slug, newSlug, callback);
          }
        }, callback);
      });
    }, function(err) {
      if (err) {
        return callback(err);
      }
      return callback(null, changed);
    });
  };

  // Return a page type object if one was configured for the given type name.
  // JavaScript doesn't iterate over object properties in a defined order,
  // so we maintain the list of types as a flat array. This convenience method
  // prevents this from being inconvenient and allows us to choose to do more
  // optimization later.

  self.getType = function(name) {
    return _.find(aposPages.types, function(item) {
      return item.name === name;
    });
  };

  // Add a page type.
  //
  // The simplest type you can pass in is an object with name and label properties.
  // That enables a custom page template in your views folder. You can do a lot more
  // than that, though; see apostrophe-snippets for the basis from which blogs and
  // events are both built.
  //
  // To simplify the creation of the page types menu, you may push a type more than
  // once under the same name: usually the first time with just the name and label,
  // and the second time with a complete page type manager object, as when initializing
  // the blog module. The last version added wins.

  self.addType = function(type) {
    var found = false;
    var i;
    for (i = 0; (i < self.types.length); i++) {
      if (self.types[i].name === type.name) {
        self.types[i] = type;
        return;
      }
    }
    self.types.push(type);

    apos.pushGlobalCallWhen('user', 'aposPages.addType(?)', {
      name: type.name,
      label: type.label,
      childTypes: type.childTypes,
      descendantTypes: type.descendantTypes
    });
  };

  // Get the index type objects corresponding to an instance or the name of an
  // instance type. Instance types are a relevant concept for snippet pages,
  // blog pages, event calendar pages, etc. and everything derived from them.
  //
  // In this pattern "instance" pages, like individual blogPosts, are outside
  // of the page tree but "index" pages, like blogs, are in the page tree and
  // display some or all of the blogPosts according to their own criteria.

  self.getIndexTypes = function(instanceTypeOrInstance) {
    var instanceTypeName = instanceTypeOrInstance.type || instanceTypeOrInstance;
    var instanceTypes = [];
    var i;
    return _.filter(self.types, function(type) {
      return (type._instance === instanceTypeName);
    });
  };

  // Get the names of the index types corresponding to an instance type or the name of an
  // instance type
  self.getIndexTypeNames = function(instanceTypeOrInstance) {
    return _.pluck(self.getIndexTypes(instanceTypeOrInstance), 'name');
  };

  // Returns the manager object corresponding to a type name or an object of the type.
  //
  // Some manager objects are responsible for two types: an instance type
  // ("blogPost") that does not appear in the page tree, and an index type
  // ("blog") that does. In such cases the manager object has an _instance
  // property which indicates the instance type name and a `name` property
  // which indicates the index type name.
  //
  // If the manager object has an _instance property, then
  // it will have both .get and .getIndexes methods for retrieving the
  // instances and the indexes, respectively. If not, then the
  // .get method should always be used.

  self.getManager = function(nameOrObject) {
    var name = nameOrObject.type || nameOrObject;

    if (name === 'page') {
      // A special case: we are interested in all "regular pages", those that
      // have a slug starting with "/" and are therefore directly part
      // of the page tree. Provide a manager object with a suitable
      // "get" method.
      return {
        get: function(req, _criteria, filters, callback) {
          var criteria = {
            $and: [
              {
                slug: /^\//
              },
              _criteria
            ]
          };
          return apos.get(req, criteria, filters, callback);
        }
      };
    }

    var instanceManager = self.getIndexTypes(name)[0];
    if (instanceManager) {
      return instanceManager;
    }
    var indexManager = _.find(self.types, function(type) {
      return type.name === name;
    });
    return indexManager;
  };

  // Get all the instance type names: the type names which have a corresponding
  // index type - snippet, event, blogPost, etc.
  self.getAllInstanceTypeNames = function() {
    var result = [];
    _.each(self.types, function(type) {
      if (type._instance) {
        result.push(type._instance);
      }
    });
    return result;
  };

  // May be called to re-order page types. Called automatically once at the end
  // of initialization, which is usually sufficient now that the `types` option
  // is permitted to contain types that will later be reinitialized by other
  // modules, e.g. blog

  self.setMenu = function(choices) {
    apos.pushGlobalData({
      aposPages: {
        menu: choices
      }
    });
  };

  if (!options.types) {
    options.types = [ { name: 'default', label: 'Default' } ];
  }

  self.types = [];

  if (options.ui === undefined) {
    options.ui = true;
  }

  // Broken out to a method for easy testing
  self._newRoute = function(req, res) {
    var data = req.body;
    return self.insertPage(req, req.body, function(err, page) {
      if (err) {
        res.statusCode = 500;
        return res.send('error');
      }
      return res.send(JSON.stringify(page));
    });
  };

  // Insert a page. The req argument is examined for
  // permissions purposes.
  //
  // The data argument is consulted for title, parent
  // (slug of parent page), published, tags, type,
  // seoDescription, and pagePermissions fields,
  // which are validated here.
  //
  // All other fields are validated via the sanitizer for
  // the specified page type, except that fields with the
  // "type: area" property may always be introduced as long
  // as they do not override existing properties
  // that are not areas. This allows the introduction
  // of areas in page templates without the need for changes
  // in app.js. Such spontaneous areas are still
  // sanitized as areas.
  //
  // You may safely pass in a page object from the browser
  // (req.body), but this method may also be called to add
  // pages for other reasons. The new page is
  // the last child of its parent.
  //
  // If three arguments are passed, they are req, data
  // and callback.
  //
  // If four arguments are passed, the properties of the
  // `overrides` object are merged into the page
  // WITHOUT validation. Use this mechanism to insert a
  // page of a type that is not available for selection
  // by the user.
  //
  // The callback receives (err, page), where page is
  // the new page object.

  self.insertPage = function(req, data, overrides, callback) {

    if (arguments.length === 3) {
      callback = overrides;
      overrides = {};
    }

    var parent;
    var page;
    var parentSlug;
    var title;
    var seoDescription;
    var type;
    var nextRank;
    var published;
    var tags;
    var orphan;
    var slug;

    title = apos.sanitizeString(data.title).trim();

    // Our default page settings modal does not offer
    // a custom slug for a brand new page (we do have it in
    // the "edit" modal). However let's support this for
    // other uses of insertPage. -Tom

    if (data.slug) {
      slug = self.sanitizeSlug(data.slug);
    }

    // Validation is annoying, automatic cleanup is awesome
    if (!title.length) {
      title = 'New Page';
    }
    seoDescription = apos.sanitizeString(data.seoDescription).trim();

    published = apos.sanitizeBoolean(data.published, true);
    orphan = apos.sanitizeBoolean(data.orphan, false);
    tags = apos.sanitizeTags(data.tags);
    type = determineType(data.type);

    if (type.orphan) {
      // Type-level override of the orphan flag
      orphan = true;
    }

    return async.series([ allowedTags, getParent, permissions, getNextRank, insertPage ], function(err) {
      if (err) {
        return callback(err);
      }
      return callback(null, page);
    });

    function allowedTags(callback) {
      if (!self._apos.options.lockTags) {
        return setImmediate(callback);
      }
      return self._apos.getTags({ tags: tags }, function(err, _tags) {
        if (err) {
          return callback(err);
        }
        tags = _tags;
        return callback(null);
      });
    }

    function getParent(callback) {
      parentSlug = data.parent;
      return apos.getPage(req, parentSlug, function(err, parentArg) {
        parent = parentArg;
        if ((!err) && (!parent)) {
          err = 'Bad parent';
        }
        return callback(err);
      });
    }

    function permissions(callback) {
      if (!apos.permissions.can(req, 'publish-page', parent)) {
        // I can create a child page but I can't publish it
        published = false;
      }
      if (!apos.permissions.can(req, 'edit-page', parent)) {
        return callback('forbidden');
      }
      return callback(null);
    }

    // TODO: there's a potential race condition here. It's not a huge deal,
    // having two pages with the same rank just leads to them sorting
    // randomly, the page tree is not destroyed. But we should have a
    // cleanup task or a lock mechanism
    function getNextRank(callback) {

      return self.getNextRank(parent, function(err, rank) {
        if (err) {
          return callback(err);
        }
        nextRank = rank;
        return callback(null);
      });
    }

    function insertPage(callback) {
      if (!slug) {
        slug = apos.addSlashIfNeeded(parentSlug) + apos.slugify(title);
      }
      page = { title: title, seoDescription: seoDescription, published: published, orphan: orphan, tags: tags, type: type.name, level: parent.level + 1, path: parent.path + '/' + apos.slugify(title), slug: slug, rank: nextRank };

      extend(true, page, overrides);

      return async.series({
        applyPermissions: function(callback) {
          return self.applyPermissions(req, data, page, callback);
        },
        sanitizeTypeData: function(callback) {
          return addSanitizedTypeData(req, data, page, type, callback);
        },
        sanitizeSpontaneousAreas: function(callback) {
          return sanitizeSpontaneousAreas(req, data, page, callback);
        },
        putPage: function(callback) {
          if (type.putOne) {
            // A fancy page or similar
            return type.putOne(req, page.slug, {}, page, callback);
          } else {
            return apos.putPage(req, page.slug, page, callback);
          }
        }
      }, function(err) {
        if (err) {
          return callback(err);
        }
        return callback(null, page);
      });
    }

  };

  // Sanitize a page slug. Ensures it is a string,
  // passes it to slugify, ensures there is a leading slash,
  // et cetera.

  self.sanitizeSlug = function(slug) {
    slug = apos.slugify(apos.sanitizeString(slug), { allow: '/' });
    // Make sure they don't turn it into a virtual page
    if (!slug.match(/^\//)) {
      slug = '/' + slug;
    }
    // Eliminate double slashes
    slug = slug.replace(/\/+/g, '/');
    // Eliminate trailing slashes
    slug = slug.replace(/\/$/, '');
    // ... But never eliminate the leading /
    if (!slug.length) {
      slug = '/';
    }
    return slug;
  };

  /**
   * Get the correct rank to assign to a newly inserted subpage
   * (one higher than the rank of any existing page). By default
   * any pages with ranks greater than or equal to 1000000 are
   * ignored, so that newly inserted pages do not come
   * after system pages like the trashcan. However if options.system
   * is true then the rank returned will be at least 1000000 and
   * higher than any existing child, including system pages.
   *
   * "parent" must be a page object. "options" may
   * be skipped in favor of just two arguments. "cb" is the callback.
   * The callback receives an error if any, and if no error,
   * the rank for the new page.
   */
  self.getNextRank = function(parent, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    var criteria = {
      path: new RegExp('^' + RegExp.quote(parent.path + '/'))
    };
    if (!options.system) {
      criteria.rank = { $lt: 1000000 };
    }
    return apos.pages.find(criteria, { rank: 1 }).sort({ rank: -1 }).limit(1).toArray(function(err, pages) {
      if (err) {
        return callback(err);
      }
      if (!pages.length) {
        return callback(null, options.system ? 1000000 : 1);
      }
      return callback(null, pages[0].rank + 1);
    });
  };

  // Implementation of the /edit route which manipulates page settings. Broken out to
  // a method for easier unit testing. See insertPage for a discussion of core
  // properties, type-specific properties, and spontaneous area properties

  self._editRoute = function(req, res) {

    var page;
    var originalSlug;
    var originalPath;
    var slug;
    var title;
    var published;
    var tags;
    var type;
    var seoDescription;
    var orphan;

    title = apos.sanitizeString(req.body.title).trim();
    seoDescription = apos.sanitizeString(req.body.seoDescription).trim();
    // Validation is annoying, automatic cleanup is awesome
    if (!title.length) {
      title = 'Untitled Page';
    }

    published = apos.sanitizeBoolean(req.body.published, true);
    tags = apos.sanitizeTags(req.body.tags);

    orphan = apos.sanitizeBoolean(req.body.orphan, false);

    // Allows simple edits of page settings that aren't interested in changing the slug.
    // If you are allowing slug edits you must supply originalSlug.
    originalSlug = self.sanitizeSlug(req.body.originalSlug || req.body.slug);
    slug = self.sanitizeSlug(req.body.slug);

    async.series([ allowedTags, getPage, permissions, updatePage, redirect, updateDescendants ], sendPage);

    function allowedTags(callback) {
      if (!self._apos.options.lockTags) {
        return setImmediate(callback);
      }
      return self._apos.getTags({ tags: tags }, function(err, _tags) {
        if (err) {
          return callback(err);
        }
        tags = _tags;
        return callback(null);
      });
    }

    function getPage(callback) {
      return apos.getPage(req, originalSlug, function(err, pageArg) {
        page = pageArg;
        if ((!err) && (!page)) {
          err = 'Bad page';
        }
        originalPath = page.path;
        return callback(err);
      });
    }

    function permissions(callback) {
      if (!apos.permissions.can(req, 'publish-page', page)) {
        return callback('forbidden');
      }
      return callback(null);
    }

    function updatePage(callback) {
      page.title = title;
      page.seoDescription = seoDescription;
      page.published = published;
      page.slug = slug;
      page.tags = tags;
      type = determineType(req.body.type, page.type);

      if (type.orphan) {
        // Type-level override of the orphan flag
        orphan = true;
      }

      page.orphan = orphan;

      page.type = type.name;

      if ((slug !== originalSlug) && (originalSlug === '/')) {
        return callback('Cannot change the slug of the home page');
      }

      return async.series({
        applyPermissions: function(callback) {
          return self.applyPermissions(req, req.body, page, callback);
        },
        sanitizeTypeData: function(callback) {
          return addSanitizedTypeData(req, req.body, page, type, callback);
        },
        sanitizeSpontaneousAreas: function(callback) {
          return sanitizeSpontaneousAreas(req, req.body, page, callback);
        },
        putPage: function(callback) {
          if (type.putOne) {
            // A fancy page or similar
            return type.putOne(req, originalSlug, {}, page, callback);
          } else {
            // A plain vanilla page template
            return apos.putPage(req, originalSlug, page, callback);
          }
        }
      }, callback);
    }

    function redirect(callback) {
      apos.updateRedirect(originalSlug, slug, callback);
    }

    function updateDescendants(callback) {
      // Note we may very well have changed the path when adding random digits to keep
      // the slug unique, since the code that detects the need for that can't distinguish
      // whether it was the slug or the path that caused the error. So we have to propagate
      // that to the descendants correctly
      self.updateDescendantPathsAndSlugs(page, originalPath, originalSlug, callback);
    }

    function sendPage(err) {
      if (err) {
        console.error(err);
        res.statusCode = 500;
        return res.send(err);
      }
      return res.send(JSON.stringify(page));
    }
  };

  // Both the new and edit page operations utilize this to deal with areas
  // that arise spontaneously via page templates rather than being hardcoded
  // in the schema. The rule is that if an otherwise unknown property is an
  // object with a "type" sub-property set to "area", that is accepted and
  // sanitized as an area.

  function sanitizeSpontaneousAreas(req, data, page, callback) {
    var toSanitize = [];
    _.each(data, function(val, key) {
      if (typeof(val) === 'object') {
        if (val.type === 'area') {
          if (_.has(page, key) && ((typeof(page[key]) !== 'object') || (page[key].type !== 'area'))) {
            // Spontaneous areas may not replace properties that are not areas
            return;
          }
          toSanitize.push({ key: key, items: val.items });
        }
      }
    });
    return async.eachSeries(toSanitize, function(entry, callback) {
      return apos.sanitizeItems(req, entry.items || [], function(err, _items) {
        if (err) {
          return callback(err);
        }
        entry.items = _items;
        return callback(null);
      });
    }, function(err) {
      if (err) {
        return callback(err);
      }
      _.each(toSanitize, function(entry) {
        page[entry.key] = { type: 'area', items: entry.items };
      });
      return callback(null);
    });
  }

  // Invoke apos.permissions.apply to propagate our permissions
  // choices and prepare them for saving in this page object as well.
  self.applyPermissions = function(req, data, page, callback) {
    return apos.permissions.apply(
      req,
      data,
      page,
      // Use _.bind to wrap apos.pages.update so that its first
      // argument is pre-filled to be criteria that match descendants
      // of this page
      _.bind(apos.pages.update, apos.pages, { path: new RegExp('^' + RegExp.quote(page.path) + '/') }),
      callback);
  };

  if (options.ui) {

    apos.pushGlobalData({
      aposPages: {
        root: options.root || '/',
        types: []
      }
    });
    apos.pushGlobalCallWhen('user', 'aposPages.enableUI()', options.uiOptions || {});
  }

  // This pushes more entries browser side as well
  _.each(options.types, function(type) {
    self.addType(type);
  });

  self.setMenu(options.types);

  // For visibility in other scopes
  self.options = options;

  function determineType(typeName, def) {
    if (def === undefined) {
      def = 'default';
    }
    var type = self.getType(typeName);

    if (!type) {
      typeName = def;
      // Really basic fallback for things like the search page
      type = self.getType(typeName) || { name: typeName, label: typeName };
    }
    return type;
  }

  function addSanitizedTypeData(req, data, page, type, callback) {
    // Allow for sanitization of data submitted for specific page types.
    // If there is no sanitize function assume there is no data for safety
    if (type.settings && type.settings.sanitize) {
      return type.settings.sanitize(req, data || {}, function(err, data) {
        if (err) {
          return callback(err);
        } else {
          // This is not a deep merge operation, we want to replace
          // top level properties and we don't want to append to arrays.
          // So _.extend is the right choice, not the jQuery-style extend module
          _.extend(page, data);
          return callback(null);
        }
      });
    } else {
      return callback(null);
    }
  }

  if (options.ui) {
    apos.mixinModuleAssets(self, 'pages', __dirname, options);

    self.pushAsset('script', 'jqtree', { when: 'user' });
    self.pushAsset('stylesheet', 'jqtree', { when: 'user' });
    self.pushAsset('script', 'editor', { when: 'user' });
    // Browser side javascript for search is not just for logged in people
    self.pushAsset('script', 'content', { when: 'always' });
    self.pushAsset('stylesheet', 'editor', { when: 'user' });
    self.pushAsset('template', 'newPageSettings', { when: 'user', data: { workflow: apos.options.workflow } });
    self.pushAsset('template', 'editPageSettings', { when: 'user', data: { workflow: apos.options.workflow } });
    self.pushAsset('stylesheet', 'reorganize', { when: 'user' });
    self.pushAsset('template', 'reorganize', { when: 'user' });
    self.pushAsset('template', 'pageVersions', { when: 'user' });

    // Broken out to a method for testability
    app.post(self._action + '/new', self._newRoute);

    // Broken out to a method for testability
    app.post(self._action + '/edit', self._editRoute);

    // Test whether a slug is available for use
    app.post(self._action + '/slug-available', function(req, res) {
      return apos.getPage(req, req.body.slug, function(err, page) {
        if (err) {
          return res.send({ status: 'error' });
        }
        if (page) {
          return res.send({ status: 'taken' });
        }
        return res.send({ status: 'ok' });
      });
    });

    // Move page to trashcan
    app.post(self._action + '/delete', function(req, res) {
      var slug = apos.sanitizeString(req.body.slug);
      return self.moveToTrash(req, slug, function(err, parentSlug, changed) {
        if (err) {
          return res.send(JSON.stringify({
            status: err
          }));
        }
        // jqtree likes .id, not ._id
        _.each(changed, function(info) {
          info.id = info._id;
        });
        return res.send(JSON.stringify({
          status: 'ok',
          parent: parentSlug,
          changed: changed
        }));
      });
    });

    // Accepts `req`, `slug` and `callback`.
    //
    // Delivers `err`, `parentSlug` (the slug of the page's
    // former parent), and `changed` (an array of objects with
    // _id and slug properties, including all subpages that
    // had to move too).

    self.moveToTrash = function(req, slug, callback) {
      var trash;
      var page;
      var parent;
      var changed = [];
      return async.series([findTrash, findPage, findParent, movePage], function(err) {
        return callback(err, parent && parent.slug, changed);
      });

      function findTrash(callback) {
        // Always only one trash page at level 1, so we don't have to
        // hardcode the slug
        apos.pages.findOne({ trash: true, level: 1}, function(err, trashArg) {
          if (err || (!trashArg)) {
            return callback('Site has no trashcan, contact administrator');
          }
          trash = trashArg;
          return callback(null);
        });
      }

      function findPage(callback) {
        // Also checks permissions
        apos.get(req, { slug: slug }, { editable: true }, function(err, results) {
          if (err || (!results.pages.length)) {
            return callback('Page not found');
          }
          page = results.pages[0];
          return callback(null);
        });
      }

      function findParent(callback) {
        self.getParent(req, page, function(err, parentArg) {
          if (err || (!parentArg)) {
            return callback('Cannot move the home page to the trash');
          }
          parent = parentArg;
          return callback(null);
        });
      }

      function movePage(callback) {
        self.move(req, page, trash, 'inside', function(err, changedArg) {
          if (err) {
            return callback(err);
          }
          changed = changedArg;
          return callback(null);
        });
      }
    };

    app.get(self._action + '/get-jqtree', function(req, res) {
      var page;
      apos.getPage(req, '/', function(err, page) {
        if (!page) {
          res.statusCode = 404;
          return res.send('No Pages');
        }
        var data = {
          label: page.title
        };

        // trash: 'any' means return both trash and non-trash

        // Don't fetch pages that are part of the tree but explicitly
        // reject being displayed by "reorganize", such as blog articles
        // (they are too numerous and are best managed within the blog)

        self.getDescendants(req, page, { reorganize: { $ne: false } }, { depth: 1000, trash: 'any', orphan: 'any', permissions: false }, function(err, children) {
          page.children = children;
          // jqtree supports more than one top level node, so we have to pass an array
          data = [ pageToJqtree(page) ];
          // Prune pages we can't reorganize
          data = clean(data);
          res.send(data);
        });

        // Recursively build a tree in the format jqtree expects
        function pageToJqtree(page) {
          var info = {
            label: page.title,
            slug: page.slug,
            // Available both ways for compatibility with jqtree and
            // mongodb expectations
            _id: page._id,
            id: page._id,
            // For icons
            type: page.type,
            // Also nice for icons and browser-side decisions about what's draggable where
            trash: page.trash,
            publish: (page.path === 'home/trash') || apos.permissions.can(req, 'publish-page', page),
            edit: apos.permissions.can(req, 'edit-page', page)
          };
          if (page.children && page.children.length) {
            info.children = [];
            // Sort trash after non-trash
            _.each(page.children, function(child) {
              if (!child.trash) {
                info.children.push(pageToJqtree(child));
              }
            });
            _.each(page.children, function(child) {
              if (child.trash) {
                info.children.push(pageToJqtree(child));
              }
            });
          }
          return info;
        }

        // If I can't publish at least one of a node's
        // descendants, prune it from the tree. Returns
        // a pruned version of the tree

        function clean(nodes) {
          mark(nodes, []);
          return prune(nodes);
          function mark(nodes, ancestors) {
            _.each(nodes, function(node) {
              if (node.publish) {
                node.good = true;
                _.each(ancestors, function(ancestor) {
                  ancestor.good = true;
                });
              }
              mark(node.children || [], ancestors.concat([ node ]));
            });
          }
          function prune(nodes) {
            var newNodes = [];
            _.each(nodes, function(node) {
              node.children = prune(node.children || []);
              if (node.good) {
                newNodes.push(node);
              }
            });
            return newNodes;
          }
        }
      });
    });

    // Simple JSON access to pages by id. Reorganize uses this to figure out
    // if the page we're sitting on has been moved out from under us.
    app.get(self._action + '/info', function(req, res) {
      var _id = req.query._id;
      // Do a simple mongo fetch, we don't want the loaders invoked
      apos.pages.findOne({ _id: _id }, function(err, page) {
        if (!page) {
          res.statusCode = 404;
          return res.send(404);
        }
        if (err || (!apos.permissions.can(req, 'view-page', page))) {
          res.statusCode = 404;
          return res.send(404);
        }
        return res.send(page);
      });
    });

    // Extension point for criteria used to fetch pages that are part of
    // the page tree (their slugs begin with /).

    self.addExtraAutocompleteCriteria = function(req, criteria, options) {
    };

    // Can be overridden if titles & slugs aren't enough to identify
    // pages for autocomplete. We also send the slug as a
    // separate property from "label".
    self.getAutocompleteTitle = function(snippet) {
      return snippet.title;
    };

    // For performance this is minimal but if you need more data in your JSON
    // response you can have it
    self.getAutocompleteFields = function() {
      return { title: 1, _id: 1, slug: 1 };
    };

    // Autocomplete for Pages in the Page Tree
    //
    // The autocomplete route returns an array of objects with
    // label and value properties, suitable for use with
    // $.selective. The label is the title, the value
    // is the id of the snippet.
    //
    // Send either a `term` parameter, used for autocomplete search,
    // or a `values` array parameter, used to fetch title information
    // about an existing list of ids. If neither is present the
    // request is assumed to be for an empty array of ids and an
    // empty array is returned, not a 404.
    //
    // GET and POST are supported to allow for large `values`
    // arrays.
    //
    // "limit" and "skip" are also supported, with a default of
    // limit 50, skip 0. They must be in the query string.

    app.all(self._action + '/autocomplete', function(req, res) {
      var criteria = { slug: /^\// };
      var data = (req.method === 'POST') ? req.body : req.query;
      var options = {
        fields: self.getAutocompleteFields(),
        limit: apos.sanitizeInteger(data.limit, 50),
        skip: apos.sanitizeInteger(data.skip, 0)
      };
      var ids;
      if (data.term !== undefined) {
        options.titleSearch = data.term;
      } else if (data.values !== undefined) {
        ids = [];
        if (data.values.length && (typeof(data.values[0]) === 'object')) {
          ids = _.pluck(data.values, 'value');
        } else {
          ids = data.values;
        }
        if (!ids.length) {
          criteria._id = '_never_happens';
        } else {
          criteria._id = { $in: ids };
        }
      } else {
        // Since arrays in REST queries are ambiguous,
        // treat the absence of either parameter as an
        // empty `ids` array
        return res.send(JSON.stringify([]));
      }
      // The special "page" type means "any page in the page tree"
      if (data.type && (data.type !== 'page')) {
        criteria.type = apos.sanitizeString(data.type);
      }
      if (data.values && data.values.length && (data.limit === undefined)) {
        // We are loading specific items to repopulate a control,
        // so get all of them, don't set a default limit
        delete options.limit;
      }
      // If requested, allow autocomplete to find unpublished
      // things (published === 'any'). Note that this is still
      // restricted by the permissions of the user making the request.
      if (data.published !== undefined) {
        options.published = data.published;
      }
      self.addExtraAutocompleteCriteria(req, criteria, options);
      // Format it as value & id properties for compatibility with jquery UI autocomplete
      apos.get(req, criteria, options, function(err, results) {
        if (err) {
          res.statusCode = 500;
          return res.send('error');
        }
        var pages = results.pages;
        // Put the pages in id order, $in does NOT do this
        if (ids) {
          pages = apos.orderById(ids, pages);
        }
        return res.send(
          JSON.stringify(_.map(pages, function(snippet) {
              return { label: self.getAutocompleteTitle(snippet), value: snippet._id, slug: snippet.slug };
          }))
        );
      });
    });

    // Return past versions of a page (just the metadata and the diff),
    // rendered via the versions.html template
    app.post(self._action + '/versions', function(req, res) {
      var page;
      var versions;
      function findPage(callback) {
        var criteria = {};
        if (req.body._id) {
          criteria._id = self._apos.sanitizeString(req.body._id);
        } else {
          criteria.slug = self._apos.sanitizeString(req.body.slug);
        }
        return apos.pages.findOne(criteria, function(err, pageArg) {
          page = pageArg;
          if (!page) {
            return callback('notfound');
          }
          return callback(err);
        });
      }

      function permissions(callback) {
        if (!apos.permissions.can(req, 'publish-page', page)) {
          return callback('forbidden');
        }
        return callback(null);
      }

      function findVersions(callback) {
        return apos.versions.find({ pageId: page._id }).sort({ createdAt: 1 }).toArray(function(err, versionsArg) {
          if (err) {
            return callback(err);
          }
          versions = versionsArg;
          return callback(err);
        });
      }

      // We must diff on the fly because versions get pruned over time
      function diffVersions(callback) {
        var prior = null;
        _.each(versions, function(version) {
          if (!prior) {
            version.diff = [ { value: '[NEW]', added: true } ];
          } else {
            version.diff = apos.diffPages(prior, version);
          }
          prior = version;
        });
        versions.reverse();
        return callback(null);
      }

      function ready(err) {
        if (err) {
          return res.send({ status: 'error' });
        } else {
          return res.send({ status: 'ok',
            html: self.render('versions', { versions: versions }),
            _id: page._id
          });
        }
      }

      async.series([findPage, permissions, findVersions, diffVersions], ready);
    });

    self.revertListeners = [];
    self.addRevertListener = function(listener) {
      self.revertListeners.push(listener);
    };

    app.post(self._action + '/revert', function(req, res) {
      var pageId = self._apos.sanitizeString(req.body.pageId);
      var versionId = self._apos.sanitizeString(req.body.versionId);
      var page;
      var version;

      function findPage(callback) {
        return apos.pages.findOne({ _id: pageId }, function(err, pageArg) {
          page = pageArg;
          return callback(err);
        });
      }

      function permissions(callback) {
        if (!apos.permissions.can(req, 'publish-page', page)) {
          return callback('forbidden');
        }
        return callback(null);
      }

      function findVersion(callback) {
        return apos.versions.findOne({ _id: versionId }, function(err, versionArg) {
          version = versionArg;
          return callback(err);
        });
      }

      function revert(callback) {
        // Remove properties that belong to the version, not the page
        // it is a copy of
        delete version._id;
        delete version.createdAt;
        delete version.diff;
        delete version.author;
        delete version.pageId;
        // Remove properties of the page that we cannot revert because they
        // alter the relationship of the page to other pages in unpredictable ways
        // which may destroy the navigability of the page tree or create
        // slug conflicts. Think of these properties as belonging to the tree,
        // not the page
        delete version.level;
        delete version.path;
        delete version.slug;
        delete version.rank;
        // Allow listeners to remove dangerous properties that shouldn't
        // be overwritten in a revert, for instance because they relate
        // to a larger structure that is not being reverted as a whole
        // (like the page tree related fields just above)
        _.each(self.revertListeners, function(listener) {
          listener(version);
        });

        // Now we can merge the version back onto the page, reverting it.
        // We don't want a deep merge or appending of arrays, we want
        // simple replacement of top level properties.
        if (apos.options.workflow) {
          // Version rollback should be subject to workflow.
          page.draft = _.clone(version);
        } else {
          _.extend(page, version);
        }
        // Use apos.putPage so that a new version with a new diff is saved
        return apos.putPage(req, page.slug, page, callback);
      }

      function ready(err) {
        if (err) {
          return res.send({ status: 'error' });
        } else {
          return res.send({ status: 'ok' });
        }
      }

      async.series([findPage, permissions, findVersion, revert], ready);
    });

    // Decide whether to honor a jqtree 'move' event and carry it out.
    // This is done by adjusting the path and level properties of the moved page
    // as well as the rank properties of that page and its new and former peers
    app.post(self._action + '/move-jqtree', function(req, res) {
      var movedSlug = apos.sanitizeString(req.body.moved);
      var targetSlug = apos.sanitizeString(req.body.target);
      var position = req.body.position;
      return self.move(req, movedSlug, targetSlug, position, function(err, changed) {
        if (err) {
          console.error(err);
          res.statusCode = 404;
          return res.send();
        } else {
          // jqtree likes .id, not ._id
          _.each(changed, function(info) {
            info.id = info._id;
          });
          return res.send({status: 'ok', changed: changed });
        }
      });
    });

    apos.addLocal('aposPagesMenu', function(options) {
      // Pass the options as one argument so they can be passed on
      return self.render('pagesMenu', { args: options });
    });

    apos.on('tasks:register', function(taskGroups) {
      taskGroups.apostrophe.repairTree = function(apos, argv, callback) {
        var root;
        var pages;
        var req = apos.getTaskReq();
        return async.series({
          getRoot: function(callback) {
            return apos.pages.findOne({ slug: '/' }, function(err, page) {
              if (err) {
                return callback(err);
              }
              if (!page) {
                return callback('No home page found');
              }
              root = page;
              return callback(null);
            });
          },
          getDescendants: function(callback) {
            return self.getDescendants(apos.getTaskReq(), root, {}, { permissions: false, orphan: null, trash: null, depth: 100 }, function(err, pagesArg) {
              pages = pagesArg;
              return callback(err);
            });
          },
          fixChildren: function(callback) {
            return fixChildren(root, pages, callback);
          },
          rescueOrphans: function(callback) {
            return apos.forEachPage({ slug: /^\// }, function(page, callback) {
              var last = page.path.lastIndexOf('/');
              if (last === -1) {
                // It's the homepage
                return callback(null);
              }
              var parentPath = page.path.substr(0, last);
              return apos.pages.findOne({ path: parentPath }, function(err, parentPage) {
                if (err) {
                  return callback(err);
                }
                if (parentPage) {
                  // We have a parent, no problem
                  return callback(null);
                }
                // We have no parent. Consternation. Move to trash
                console.log(page.slug + ' (' + page.title + ') has no parent, moving to trash');
                return self.move(req, page.slug, '/trash', 'inside', callback);
              });
            }, callback);
          }
        }, callback);
        function fixChildren(parent, pages, callback) {
          var rank = 0;
          return async.eachSeries(pages, function(page, callback) {
            if (page.slug === '/trash') {
              page.rank = 1000001;
            } else if (page.slug === '/search') {
              page.rank = 1000000;
            } else {
              page.rank = rank++;
            }
            return async.series({
              updateRank: function(callback) {
                var update = { $set: { rank: page.rank } };
                if (parent.trash) {
                  update.$set.trash = true;
                  page.trash = true;
                } else {
                  page.$unset = { trash: true };
                }
                return apos.pages.update({ _id: page._id }, update, callback);
              },
              updateChildren: function(callback) {
                return fixChildren(page, page.children || [], callback);
              }
            }, callback);
          }, callback);
        }
      };
    });
  }

  async.series([ pathIndex ], callback);

  function pathIndex(callback) {
    // Unique and sparse together mean that many pages can have no path,
    // but any paths that do exist must be unique
    return apos.pages.ensureIndex({ path: 1 }, { safe: true, unique: true, sparse: true }, callback);
  }
}
