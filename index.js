var async = require('async');
var _ = require('underscore');
var extend = require('extend');
var path = require('path');
var ent = require('ent');

RegExp.quote = require('regexp-quote');

module.exports = function(options, callback) {
  return new pages(options, callback);
};

function pages(options, callback) {
  var apos = options.apos;
  var app = options.app;
  var self = this;
  var aposPages = this;

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
  // by paying attention to `req.remainder` and choosing to set `req.type` to
  // something that suits their purposes. If `req.type` is set by a loader it is
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
  //     req.page = { areas: {} };
  //     callback(null);
  //   }
  // });
  //
  // If you do not set req.page the normal page-not-found behavior is applied.
  // Make sure you specify at least an areas property. If you do not supply a
  // type property, 'default' is assumed.

  self.serve = function(options) {

    if(!options) {
      options = {};
    }
    _.defaults(options, {
      root: ''
    });

    return function(req, res) {

      function now() {
        var time = process.hrtime();
        return time[0] + (time[1] / 1000000000.0);
      }

      function time(fn, name) {
        return function(callback) {
          var start = now();
          return fn(function(err) {
            // console.log(name + ': ' + (now() - start));
            return callback(err);
          });
        };
      }

      var start = now();

      // Express doesn't provide the absolute URL the user asked for by default.
      // TODO: move this to middleware for even more general availability in Apostrophe.
      // See: https://github.com/visionmedia/express/issues/1377
      if (!req.absoluteUrl) {
        req.absoluteUrl = req.protocol + '://' + req.get('Host') + req.url;
      }

      req.extras = {};
      return async.series([time(page, 'page'), time(permissions, 'permissions'), time(relatives, 'relatives'), time(load, 'load'), time(notfound, 'notfound')], main);

      function page(callback) {
        // Get content for this page
        req.slug = req.params[0];
        if ((!req.slug.length) || (req.slug.charAt(0) !== '/')) {
          req.slug = '/' + req.slug;
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
            req.bestPage.url = options.root + req.bestPage.slug;
          }

          return callback(null);

        });
      }

      function permissions(callback) {
        // 404 in progress
        if (!req.bestPage) {
          return callback(null);
        }

        // Are we cool enough to view and/or edit this page?
        async.series([checkView, checkEdit], callback);

        function checkView(callback) {
          return apos.permissions(req, 'view-page', req.bestPage, function(err) {
            // If there is a permissions error then note that we are not
            // cool enough to see the page, which triggers the appropriate
            // error type.
            if (err) {
              if (req.user) {
                req.insufficient = true;
              } else {
                req.loginRequired = true;
              }
            }
            return callback(null);
          });
        }

        function checkEdit(callback) {
          return apos.permissions(req, 'edit-page', req.bestPage, function(err) {
            // If there is no permissions error then note that we are cool
            // enough to edit the page
            req.edit = !err;
            return callback(null);
          });
        }
      }

      function relatives(callback) {
        if(!req.bestPage) {
          return callback(null);
        }
        async.series([
          function(callback) {
            // If you want tabs you also get ancestors, so that
            // the home page is available (the parent of tabs).
            if (options.ancestors || options.tabs || true) {
              return self.getAncestors(req, req.bestPage, options.ancestorCriteria || {}, options.ancestorOptions || {}, function(err, ancestors) {
                req.bestPage.ancestors = ancestors;
                if (ancestors.length) {
                  // Also set parent as a convenience
                  req.bestPage.parent = req.bestPage.ancestors.slice(-1)[0];
                }
                return callback(err);
              });
            } else {
              return callback(null);
            }
          },
          function(callback) {
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
              self.getDescendants(req, parent, options.tabOptions || {}, function(err, pages) {
                req.bestPage.peers = pages;
                return callback(err);
              });
            } else {
              return callback(null);
            }
          },
          function(callback) {
            if (options.descendants || true) {
              return self.getDescendants(req, req.bestPage, options.descendantCriteria || {}, options.descendantOptions || {}, function(err, children) {
                req.bestPage.children = children;
                return callback(err);
              });
            } else {
              return callback(null);
            }
          },
          function(callback) {
            if (options.tabs || true) {
              self.getDescendants(req, req.bestPage.ancestors[0] ? req.bestPage.ancestors[0] : req.bestPage, options.tabCriteria || {}, options.tabOptions || {}, function(err, pages) {
                req.bestPage.tabs = pages;
                return callback(err);
              });
            } else {
              return callback(null);
            }
          }
        ], callback);
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
                // Provide an object with an empty areas property if
                // the page doesn't exist yet. This simplifies page type templates
                req.extras[item] = page ? page : { areas: [] };
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

        return async.parallel(loadList, callback);
      }

      function notfound(callback) {
        // Implement the automatic redirect mechanism for pages whose
        // slugs have changed, unless an alternate mechanism has been specified
        if (!req.page) {
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
            if (_.some(aposPages.types, function(item) {
              return item.name === req.type;
            })) {
              req.template = 'default';
            }
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
          req.pushData({
            aposPages: {
              // Prune the page back so we're not sending everything
              // we know about every event in every widget etc., which
              // is redundant and results in slow page loads and
              // high bandwidth usage
              page: self.prunePage(req.bestPage)
            }
          });
        }

        req.pushData({
          permissions: (req.user && req.user.permissions) || {}
        });

        var when = req.user ? 'user' : 'anon';
        var calls = apos.getGlobalCallsWhen('always');
        if (when === 'user') {
          calls = calls + apos.getGlobalCallsWhen('user');
        }
        calls = calls + apos.getCalls(req);
        // Always the last call; signifies we're done initializing the
        // page as far as the core is concerned; a lovely time for other
        // modules and project-level javascript to do their own
        // enhancements. The content area refresh mechanism also
        // triggers this event
        calls += '\n$("body").trigger("aposReady");\n';

        var args = {
          edit: req.edit,
          // Make sure we pass the slug of the page, not the
          // complete URL. Frontend devs are expecting to be able
          // to use this slug to attach URLs to a page
          slug: providePage ? req.bestPage.slug : null,
          page: providePage ? req.bestPage : null,
          user: req.user,
          permissions: (req.user && req.user.permissions) || {},
          when: req.user ? 'user' : 'anon',
          calls: calls,
          data: apos.getGlobalData() + apos.getData(req),
          refreshing: !!req.query.apos_refresh,
          // Make the query available to templates for easy access to
          // filter settings etc.
          query: req.query
        };

        _.defaults(args, req.extras);

        var content;

        if (typeof(req.template) === 'string') {
          var path = __dirname + '/views/' + req.template;
          if (options.templatePath) {
            path = options.templatePath + '/' + req.template;
          }
          if (options.templatePaths) {
            if (options.templatePaths[type]) {
              path = options.templatePaths[type] + '/' + req.template;
            }
          }
          content = apos.partial(path, args);
        } else {
          // A custom loader gave us a function to render with.
          // Give it access to the same arguments, and also to the request
          // object which is helpful in unusual cases like RSS feed generation
          content = req.template(args, req);
        }

        args.content = content;
        args.safeMode = (req.query.safe_mode !== undefined);
        // AJAX requests never get an outer layout. Also allow
        // for a query parameter that fakes xhr and a flag to
        // explicitly shut off decoration, which is useful if
        // the template is rendering an alternative format
        // such as RSS
        if (req.xhr || req.query.xhr || (req.decorate === false)) {
          return send(content);
        } else {
          return send(self.decoratePageContent(args));
        }
      }

      function send(data) {
        // console.log(now() - start);
        return res.send(data);
      }
    };
  };

  // We send the current page's metadata as inline JSON that winds up in
  // apos.data.aposPages.page in the browser. It's very helpful for building
  // page manipulation UI. But we shouldn't redundantly send the areas, as we are already
  // rendering the ones we care about. And we shouldn't send our relatives
  // as we're already rendering those as navigation if we want them. Also
  // prune out the search text which can contain characters that are valid
  // JSON but not valid JS (the existence of this is a nightmare):
  // https://code.google.com/p/v8/issues/detail?id=1907

  self.prunePage = function(page) {
    return _.omit(page, 'areas', 'tabs', 'ancestors', 'children', 'peers', 'lowSearchText', 'highSearchText', 'searchSummary');
  };

  // Decorate the contents of args.content as a complete webpage. If args.refreshing is
  // true, return just that content, as we're performing an AJAX refresh of the main
  // content area. If args.refreshing is not true, return it as a completely
  // new page (CSS, JS, head, body...) wrapped in the outerLayout template. This is
  // made available to allow developers to render other content the same way
  // Apostrophe pages are rendered. For instance, it's useful for a local
  // login page template, a site reorganization screen or anything else that
  // is a poor fit for a page template or a javascript modal.
  //
  // This may go away when nunjucks gets conditional extends.
  //
  // As a workaround to allow you to set the body class, use a comment like this
  // inside args.content:
  //
  // <!-- APOS-BODY-CLASS class names here -->

  self.decoratePageContent = function(args) {
    // On an AJAX refresh of the main content area only, just send the
    // main content area. The rest of the time, render the outerLayout and
    // pass the main content to it
    if (args.refreshing) {
      return args.content;
    } else {
      // This is a bit of a nasty workaround: we need to communicate a few things
      // to the outer layout, and since it must run as a separate invocation of
      // nunjucks there's no great way to get them there.

      // [\s\S] is like . but matches newlines too. Great workaround for the lack
      // of a /s modifier in JavaScript
      // http://stackoverflow.com/questions/1068280/javascript-regex-multiline-flag-doesnt-work

      var match = args.content.match(/<\!\-\- APOS\-BODY\-CLASS ([\s\S]*?) \-\-\>/);
      if (match) {
        args.bodyClass = match[1];
      }
      match = args.content.match(/<\!\-\- APOS\-TITLE ([\s\S]*?) \-\-\>/);
      if (match) {
        args.title = match[1];
      }
      match = args.content.match(/<\!\-\- APOS\-EXTRA\-HEAD ([\s\S]*?) \-\-\>/);
      if (match) {
        args.extraHead = match[1];
      }

      // Allow raw HTML slots on a true page update, without the risk
      // of document.write blowing up a page during a partial update.
      // This is pretty nasty too, keep thinking about alternatives.
      if (!args.safeMode) {
        args.content = args.content.replace(/<\!\-\- APOS\-RAW\-HTML\-BEFORE \-\-\>[\s\S]*?<\!\-\- APOS\-RAW\-HTML\-START \-\-\>([\s\S]*?)<\!\-\- APOS\-RAW\-HTML\-END \-\-\>[\s\S]*?<\!\-\- APOS\-RAW\-HTML\-AFTER \-\-\>/g, function(all, code) {
        return ent.decode(code);
        });
      }

      if (typeof(options.outerLayout) === 'function') {
        return options.outerLayout(args);
      } else {
        return apos.partial(options.outerLayout || 'outerLayout', args);
      }
    }
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
      getOptions.fields.areas = 0;
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
    // Get metadata about the related pages, skipping expensive stuff.
    // Sorting by path works because longer strings sort
    // later than shorter prefixes
    return apos.get(req, criteria, getOptions, function(err, results) {
      if (err) {
        return callback(err);
      }
      var pages = results.pages;
      _.each(pages, function(page) {
        page.url = options.root + page.slug;
      });
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
    if (options.orphan === undefined) {
      options.orphan = false;
    }

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
      options.fields.areas = 0;
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
        page.url = options.root + page.slug;
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
    var projection;
    if (options.areas) {
      projection = {};
    } else {
      projection = { areas: 0 };
    }
    var criteria = { path: { $exists: 1 }, tags: { $in: tags }};
    return apos.get(req, criteria, {}, function(err, results) {
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
    async.series([getMoved, getTarget, getOldParent, getParent, permissions, nudgeOldPeers, nudgeNewPeers, moveSelf, moveDescendants, trashDescendants ], finish);
    function getMoved(callback) {
      if (moved) {
        return callback(null);
      }
      if (movedSlug.charAt(0) !== '/') {
        return fail();
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
        return fail();
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
      apos.permissions(req, 'manage-page', parent, function(err) {
        if (err) {
          return callback(err);
        }
        apos.permissions(req, 'manage-page', moved, callback);
      });
    }
    function nudgeOldPeers(callback) {
      // Nudge up the pages that used to follow us
      // Leave reserved range alone
      var oldParentPath = path.dirname(moved.path);
      apos.pages.update({ path: new RegExp('^' + RegExp.quote(oldParentPath + '/')), level: moved.level, rank: { $gte: moved.rank, $lte: 1000000 }}, { $inc: { rank: -1 } }, function(err, count) {
        return callback(err);
      });
    }
    function nudgeNewPeers(callback) {
      // Nudge down the pages that should now follow us
      // Leave reserved range alone
      apos.pages.update({ path: new RegExp('^' + RegExp.quote(parent.path + '/')), level: parent.level + 1, rank: { $gte: rank, $lte: 1000000 }}, { $inc: { rank: 1 } }, function(err, count) {
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
        var matchOldParentSlugPrefix = new RegExp('^' + RegExp.quote(addSlashIfNeeded(oldParent.slug)));
        if (moved.slug.match(matchOldParentSlugPrefix)) {
          var slugStem = parent.slug;
          if (slugStem !== '/') {
            slugStem += '/';
          }
          moved.slug = moved.slug.replace(matchOldParentSlugPrefix, addSlashIfNeeded(parent.slug));
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
      apos.pages.update({ path: matchParentPathPrefix }, { $set: $set, $unset: $unset }, callback);
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
        apos.pages.update({ _id: desc._id }, { $set: {
          // Always matches
          path: desc.path.replace(matchParentPathPrefix, page.path + '/'),
          // Might not match, and we don't care (if they edited the slug that far up,
          // they did so intentionally)
          slug: newSlug,
          level: desc.level + (page.level - oldLevel)
        }}, callback);
      });
    }, function(err) {
      if (err) {
        return callback(err);
      }
      return callback(null, changed);
    });
  };

  // Accepts page objects and filters them to those that the
  // current user is permitted to view
  self.filterByView = function(req, pages, callback) {
    async.filter(pages, function(page, callback) {
      return apos.permissions(req, 'view-page', page, function(err) {
        return callback(!err);
      });
    }, function(pages) {
      return callback(null, pages);
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
    apos.pushGlobalCallWhen('user', 'aposPages.addType(?)', { name: type.name, label: type.label });
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

  // Returns the first index type object corresponding to an instance type or the
  // name of an instance type. This is the object that is providing backend routes
  // and management UI for editing instances
  self.getManager = function(instanceTypeOrInstance) {
    return self.getIndexTypes(instanceTypeOrInstance)[0];
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
    var parent;
    var page;
    var parentSlug;
    var title;
    var type;
    var nextRank;
    var published;
    var tags;

    title = req.body.title.trim();
    // Validation is annoying, automatic cleanup is awesome
    if (!title.length) {
      title = 'New Page';
    }

    published = apos.sanitizeBoolean(req.body.published, true);
    tags = apos.sanitizeTags(req.body.tags);
    type = determineType(req);

    async.series([ getParent, permissions, getNextRank, insertPage ], sendPage);

    function getParent(callback) {
      parentSlug = req.body.parent;
      return apos.getPage(req, parentSlug, function(err, parentArg) {
        parent = parentArg;
        if ((!err) && (!parent)) {
          err = 'Bad parent';
        }
        return callback(err);
      });
    }

    function permissions(callback) {
      return apos.permissions(req, 'edit-page', parent, function(err) {
        // If there is no permissions error then note that we are cool
        // enough to manage the page
        return callback(err);
      });
    }

    // TODO: there's a potential race condition here. It's not a huge deal,
    // having two pages with the same rank just leads to them sorting
    // randomly, the page tree is not destroyed. But we should have a
    // cleanup task or a lock mechanism
    function getNextRank(callback) {
      self.getDescendants(req, parent, { depth: 1, orphan: 'any', trash: 'any' }, function(err, children) {
        if (err) {
          return callback(err);
        }
        nextRank = 1;
        nextRank = _.reduce(children, function(memo, child) {
          if (child.rank >= memo) {
            memo = child.rank + 1;
          }
          return memo;
        }, nextRank);
        return callback(null);
      });
    }

    function insertPage(callback) {
      page = { title: title, published: published, tags: tags, type: type.name, level: parent.level + 1, areas: {}, path: parent.path + '/' + apos.slugify(title), slug: addSlashIfNeeded(parentSlug) + apos.slugify(title), rank: nextRank };

      // Permissions initially match those of the parent
      page.viewGroupIds = parent.viewGroupIds;
      page.viewPersonIds = parent.viewPersonIds;
      page.editGroupIds = parent.editGroupIds;
      page.editPersonIds = parent.editPersonIds;
      if (parent.loginRequired) {
        page.loginRequired = parent.loginRequired;
      }

      return async.series({
        applyPermissions: function(callback) {
          return self.applyPermissions(req, page, callback);
        },
        sanitizeTypeSettings: function(callback) {
          return addSanitizedTypeData(req, page, type, callback);
        },
        // To be nice we keep the type settings around for other page types the user
        // thought about giving this page. This avoids pain if the user switches and
        // switches back. Alas it means we must keep validating them on save
        sanitizeOtherTypeSettings: function(callback) {
          return self.sanitizeOtherTypeSettings(req, page, callback);
        },
        putPage: function(callback) {
          return apos.putPage(req, page.slug, page, callback);
        }
      }, callback);
    }

    function sendPage(err) {
      if (err) {
        res.statusCode = 500;
        return res.send('error');
      }
      return res.send(JSON.stringify(page));
    }
  };

  // Implementation of the /edit route which manipulates page settings. Broken out to
  // a method for easier unit testing
  self._editRoute = function(req, res) {

    var page;
    var originalSlug;
    var originalPath;
    var slug;
    var title;
    var published;
    var tags;
    var type;

    title = req.body.title.trim();
    // Validation is annoying, automatic cleanup is awesome
    if (!title.length) {
      title = 'Untitled Page';
    }

    published = apos.sanitizeBoolean(req.body.published, true);
    tags = apos.sanitizeTags(req.body.tags);

    // Allows simple edits of page settings that aren't interested in changing the slug.
    // If you are allowing slug edits you must supply originalSlug.
    originalSlug = req.body.originalSlug || req.body.slug;
    slug = req.body.slug;

    slug = apos.slugify(slug, { allow: '/' });
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

    async.series([ getPage, permissions, updatePage, redirect, updateDescendants ], sendPage);

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
      return apos.permissions(req, 'edit-page', page, function(err) {
        // If there is no permissions error then we are cool
        // enough to edit the page
        return callback(err);
      });
    }

    function updatePage(callback) {
      page.title = title;
      page.published = published;
      page.slug = slug;
      page.tags = tags;
      type = determineType(req, page.type);
      page.type = type.name;

      if ((slug !== originalSlug) && (originalSlug === '/')) {
        return callback('Cannot change the slug of the home page');
      }

      return async.series({
        applyPermissions: function(callback) {
          return self.applyPermissions(req, page, callback);
        },
        sanitizeTypeSettings: function(callback) {
          return addSanitizedTypeData(req, page, type, callback);
        },
        // To be nice we keep the type settings around for other page types this page
        // has formerly had. This avoids pain if the user switches and switches back.
        // Alas it means we must keep validating them on save
        sanitizeOtherTypeSettings: function(callback) {
          return self.sanitizeOtherTypeSettings(req, page, callback);
        },
        putPage: function(callback) {
          return apos.putPage(req, originalSlug, page, callback);
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
        console.log('the error:');
        console.log(err);
        res.statusCode = 500;
        return res.send(err);
      }
      return res.send(JSON.stringify(page));
    }
  };

  self.sanitizeOtherTypeSettings = function(req, page, callback) {
    var raw = req.body.otherTypeSettings || {};
    var sanitized = {};
    return async.eachSeries(aposPages.types, function(type, callback) {
      if (raw[type.name] && type.settings.sanitize) {
        return type.settings.sanitize(raw[type.name] || {}, function(err, data) {
          if (err) {
            // Bad page settings for types not currently in effect are not a crisis
            return callback(null);
          }
          sanitized[type.name] = data;
          return callback(null);
        });
      } else {
        return callback(null);
      }
    }, function(err) {
      if (err) {
        return callback(err);
      }
      page.otherTypeSettings = sanitized;
      return callback(null);
    });
  };

  self.applyPermissions = function(req, page, callback) {
    var fields = [ 'viewGroupIds', 'viewPersonIds' ];

    // Only admins can change editing permissions.
    //
    // TODO I should be checking this as a named permission in its own right

    var userPermissions = req.user && req.user.permissions;
    if (userPermissions.admin) {
      fields = fields.concat([ 'editGroupIds', 'editPersonIds' ]);
    }

    var propagatePull;
    var propagateAdd;
    var propagateSet;
    var propagateUnset;
    var loginRequired = apos.sanitizeSelect(req.body.loginRequired, [ '', 'loginRequired', 'certainPeople' ], '');
    if (loginRequired === '') {
      delete page.loginRequired;
    } else {
      page.loginRequired = loginRequired;
    }
    if (apos.sanitizeBoolean(req.body.loginRequiredPropagate)) {
      if (loginRequired !== '') {
        propagateSet = { loginRequired: loginRequired };
      } else {
        propagateUnset = { loginRequired: 1 };
      }
    }

    _.each(fields, function(field) {
      page[field] = [];
      _.each(req.body[field], function(datum) {
        if (typeof(datum) !== 'object') {
          return;
        }
        var removed = apos.sanitizeBoolean(datum.removed);
        var propagate = apos.sanitizeBoolean(datum.propagate);
        if (removed) {
          if (propagate) {
            if (!propagatePull) {
              propagatePull = {};
            }
            if (!propagatePull[field]) {
              propagatePull[field] = [];
            }
            propagatePull[field].push(datum.value);
          }
        } else {
          if (propagate) {
            if (!propagateAdd) {
              propagateAdd = {};
            }
            if (!propagateAdd[field]) {
              propagateAdd[field] = [];
            }
            propagateAdd[field].push(datum.value);
          }
          page[field].push(datum.value);
          page.certainPeople = true;
        }
      });
    });
    if (propagatePull || propagateAdd || propagateSet || propagateUnset) {
      var command = {};
      if (propagatePull) {
        command.$pull = { };
        _.each(propagatePull, function(values, field) {
          command.$pull[field] = { $in: values };
        });
      }
      if (propagateAdd) {
        command.$addToSet = { };
        _.each(propagateAdd, function(values, field) {
          command.$addToSet[field] = { $each: values };
        });
      }
      if (propagateSet) {
        command.$set = propagateSet;
      }
      if (propagateUnset) {
        command.$unset = propagateUnset;
      }
      apos.pages.update({ path: new RegExp('^' + RegExp.quote(page.path) + '/') }, command, callback);
    } else {
      return callback(null);
    }
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

  function determineType(req, def) {
    if (def === undefined) {
      def = 'default';
    }
    var typeName = req.body.type;
    type = self.getType(typeName);
    if (!type) {
      typeName = def;
      // Really basic fallback for things like the search page
      type = self.getType(typeName) || { name: typeName, label: typeName };
    }
    return type;
  }

  function addSanitizedTypeData(req, page, type, callback) {
    // Allow for sanitization of data submitted for specific page types.
    // If there is no sanitize function assume there is no data for safety
    if (type.settings && type.settings.sanitize) {
      type.settings.sanitize(req.body.typeSettings || {}, function(err, data) {
        if (err) {
          return callback(err);
        } else {
          page.typeSettings = data;
          return callback(null);
        }
      });
    } else {
      return callback(null);
    }
  }

  // Make sure that aposScripts and aposStylesheets summon our
  // browser-side UI assets for managing pages

  if (options.ui) {
    self.pushAsset = function(type, name, options) {
      // TODO should probably support a chain of subclasses like
      // the snippet modules do
      if (!options) {
        options = {};
      }
      options.fs = __dirname;
      options.web = '/apos-pages';
      return apos.pushAsset(type, name, options);
    };

    self.pushAsset('script', 'jqtree', { when: 'user' });
    self.pushAsset('stylesheet', 'jqtree', { when: 'user' });
    self.pushAsset('script', 'editor', { when: 'user' });
    // Browser side javascript for search is not just for logged in people
    self.pushAsset('script', 'content', { when: 'always' });
    self.pushAsset('stylesheet', 'editor', { when: 'user' });
    self.pushAsset('template', 'newPageSettings', { when: 'user' });
    self.pushAsset('template', 'editPageSettings', { when: 'user' });
    self.pushAsset('template', 'reorganize', { when: 'user' });
    self.pushAsset('template', 'pageVersions', { when: 'user' });

    // Broken out to a method for testability
    app.post('/apos-pages/new', self._newRoute);

    // Broken out to a method for testability
    app.post('/apos-pages/edit', self._editRoute);

    // Test whether a slug is available for use
    app.post('/apos-pages/slug-available', function(req, res) {
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
    app.post('/apos-pages/delete', function(req, res) {
      var trash;
      var page;
      var parent;
      var changed = [];
      async.series([findTrash, findPage, findParent, movePage], respond);

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
        apos.get(req, { slug: req.body.slug }, { editable: true }, function(err, results) {
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
            return respond('Cannot move the home page to the trash');
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

      function respond(err) {
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
          parent: parent.slug,
          changed: changed
        }));
      }
    });

    app.get('/apos-pages/get-jqtree', function(req, res) {
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
        self.getDescendants(req, page, { depth: 1000, trash: 'any', orphan: 'any' }, function(err, children) {
          page.children = children;
          // jqtree supports more than one top level node, so we have to pass an array
          data = [ pageToJqtree(page) ];
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
            trash: page.trash
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
      });
    });

    // Simple JSON access to pages by id. Reorganize uses this to figure out
    // if the page we're sitting on has been moved out from under us. Does
    // *not* run loaders, it's meant for a quick peek at data that lives
    // directly in the page
    app.get('/apos-pages/info', function(req, res) {
      var _id = req.query._id;
      // Do a simple mongo fetch, we don't want the loaders invoked
      apos.pages.findOne({ _id: _id }, function(err, page) {
        if (!page) {
          res.statusCode = 404;
          return res.send(404);
        }
        self.filterByView(req, [ page ], function(err, pages) {
          if (err || (!pages.length)) {
            res.statusCode = 404;
            return res.send(404);
          }
          res.send(page);
        });
      });
    });

    // Return past versions of a page (just the metadata and the diff),
    // rendered via the versions.html template
    app.get('/apos-pages/versions', function(req, res) {
      var _id = req.query._id;
      var page;
      var versions;

      function findPage(callback) {
        return apos.pages.findOne({ _id: _id }, function(err, pageArg) {
          page = pageArg;
          return callback(err);
        });
      }

      function permissions(callback) {
        return apos.permissions(req, 'edit-page', page, callback);
      }

      function findVersions(callback) {
        return apos.versions.find({ pageId: _id }, { _id: 1, diff: 1, createdAt: 1, author: 1}).sort({ createdAt: -1 }).toArray(function(err, versionsArg) {
          versions = versionsArg;
          return callback(err);
        });
      }

      function ready(err) {
        if (err) {
          res.statusCode = 404;
          return res.send();
        } else {
          return res.send(apos.partial('versions', { versions: versions }));
        }
      }

      async.series([findPage, permissions, findVersions], ready);
    });

    self.revertListeners = [];
    self.addRevertListener = function(listener) {
      self.revertListeners.push(listener);
    };

    app.post('/apos-pages/revert', function(req, res) {
      var pageId = req.body.page_id;
      var versionId = req.body.version_id;
      var page;
      var version;

      function findPage(callback) {
        return apos.pages.findOne({ _id: pageId }, function(err, pageArg) {
          page = pageArg;
          return callback(err);
        });
      }

      function permissions(callback) {
        return apos.permissions(req, 'edit-page', page, callback);
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
        // Now we can merge the version back onto the page, reverting it
        extend(true, page, version);
        // Use apos.putPage so that a new version with a new diff is saved
        return apos.putPage(req, page.slug, page, callback);
      }

      function ready(err) {
        if (err) {
          res.statusCode = 404;
          return res.send();
        } else {
          return res.send('OK');
        }
      }

      async.series([findPage, permissions, findVersion, revert], ready);
    });

    // Decide whether to honor a jqtree 'move' event and carry it out.
    // This is done by adjusting the path and level properties of the moved page
    // as well as the rank properties of that page and its new and former peers
    app.post('/apos-pages/move-jqtree', function(req, res) {
      var movedSlug = apos.sanitizeString(req.body.moved);
      var targetSlug = apos.sanitizeString(req.body.target);
      var position = req.body.position;
      return self.move(req, movedSlug, targetSlug, position, function(err, changed) {
        if (err) {
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

    // pages.searchLoader is a loader function. If the page type is 'search',
    // it'll kick in and make search results available in req.extras.search.
    // You enable this by specifying it when you set your loader option in
    // calling pages.serve. Include a form on the page template with itself as
    // the action so you can make queries. (Confused? See the sandbox for
    // an example.)

    self.searchLoader = function(req, callback) {
      if (!req.page) {
        // We're only interested in exact matches, /search/something is
        // none of our business, we don't look at req.bestPage
        return callback(null);
      }
      // We're only interested in enhancing pages of type "search"
      if (req.page.type !== 'search') {
        return callback(null);
      }
      var q = req.query.q;
      req.extras.q = q;
      // Turn it into a regular expression
      q = apos.searchify(q);
      var resultGroups = [];
      var queries = [
        { sortTitle: q },
        { highSearchText: q },
        { lowSearchText: q }
      ];

      // TODO: add some more variants considered even better matches, such as
      // exact word boundaries rather than embedded words. We can afford it,
      // mongo+node's awfully fast even at this crappy scanning stuff

      function find(callback) {
        return async.mapSeries(queries, function(query, callback) {
          apos.get(req, query, { fields: { title: 1, slug: 1, type: 1, searchSummary: 1, lowSearchText: 1, publishedAt: 1, startDate: 1, startTime: 1, start: 1, endDate: 1, endTime: 1, end: 1 }, limit: 100 }, function(err, results) {
            if (err) {
              return callback(err);
            }
            // Most recent first. The best definition of most recent is
            // somewhat type dependent.
            results.pages.sort(function(a, b) {
              var d1 = a.start || a.publishedAt || a.createdAt;
              var d2 = b.start || b.publishedAt || b.createdAt;
              if (d1) {
                d1 = d1.getTime();
              }
              if (d2) {
                d2 = d2.getTime();
              }
              if (d1 > d2) {
                return -1;
              } else if (d1 === d2) {
                return 0;
              } else {
                return 1;
              }
            });
            return callback(null, results.pages);
          });
        }, function(err, resultGroupsArg) {
          resultGroups = resultGroupsArg;
          return callback(null);
        });
      }

      function finish(err) {
        if (err) {
          res.statusCode = 500;
          return res.send(err);
        }
        var results = [];
        var taken = {};
        _.each(resultGroups, function(resultGroup) {
          _.each(resultGroup, function(page) {
            if ((!taken[page.slug]) && suitable(page)) {
              results.push(page);
              taken[page.slug] = true;
            }
          });
        });
        req.extras.search = results;
        return callback(null);
      }

      // Vetoes anything belonging to a snippets module that has
      // specifically declared itself unsearchable
      function suitable(page) {
        var s = { page: page, suitable: true };
        apos.emit('searchable', s);
        if (!s.suitable) {
          return false;
        }
        return true;
      }
      return async.series([find], finish);
    };

    // Given a slug that was returned as a search result, generate a redirect
    // to the appropriate place. The idea is that doing this when users actually
    // click is much cheaper than determining the perfect URL for every search
    // result in the list, most of which will never be clicked on

    app.get('/apos-pages/search-result', function(req, res) {
      var slug = req.query.slug;
      return apos.getPage(req, slug, function(err, page) {
        if (!page) {
          res.statusCode = 404;
          return res.send('Not Found');
        }
        if (page.slug.match(/\//)) {
          // TODO this is another place we are hardcoding the root, it is
          // increasingly clear we don't support more than one root right now
          return res.redirect(page.slug);
        } else {
          // we don't know what to do with this kind of page, but
          // another module might; emit an event
          var context = {};
          apos.emit('searchResult', req, res, page, context);
          if (!context.accepted) {
            // No one will admit to knowing what to do with this page
            res.statusCode = 404;
            return res.send('Not Found');
          } else {
            // Someone else is asynchronously dealing with it, we're good here
          }
        }
      });
    });

    // Serve our assets. This is the final route so it doesn't
    // beat out the rest
    app.get('/apos-pages/*', apos.static(__dirname + '/public'));

    apos.addLocal('aposPagesMenu', function(options) {
      // Pass the options as one argument so they can be passed on
      return apos.partial('pagesMenu', { args: options }, __dirname + '/views');
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

  function addSlashIfNeeded(path) {
    path += '/';
    path = path.replace(/\/\/$/, '/');
    return path;
  }
}
