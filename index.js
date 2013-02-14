var async = require('async');
var _ = require('underscore');
RegExp.quote = require('regexp-quote');

module.exports = function(options, callback) {
  return new pages(options, callback);
};

function pages(options, callback) {
  var apos = options.apos;
  var app = options.app;
  var self = this;
  
  if (options.ui === undefined) {
    options.ui = true;
  }

  // Make sure that aposScripts and aposStylesheets summon our
  // browser-side UI assets for managing pages

  if (options.ui) {
    apos.scripts.push('/apos-pages/js/rss.js');

    apos.stylesheets.push('/apos-pages/css/rss.css');

    // Serve our assets
    app.get('/apos-pages/*', apos.static(__dirname + '/public'));
  }

  // Usage: app.get('*', pages.serve({ templatePath: __dirname + '/views/pages' }))
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
  // The page object is passed to the Nunjucks template as `page`. 
  //
  // If you want to also load all areas on the "global" page, for instance
  // to fetch shared headers and footers used across a site, supply a
  // `load` callback:
  // 
  // app.get('/pages/*', pages.serve({ load: [ 'global' ] }, ...))
  //
  // The page with the slug `global` then becomes visible to the Nunjucks 
  // template as `global`. Note that it may not exist yet, in which case
  // `global` is not set. Your template code must allow for this.
  // 
  // You can include functions in the load: array. If you do so, those
  // functions are invoked as callbacks, and receive 'req' as their first
  // parameter. They should add additional page objects as properties of the
  // req.extraPages object, then invoke the callback they receive as their
  // second parameter with null, or with an error if they have failed in a
  // way that should result in a 500 error. All such extra pages are made 
  // visible to Nunjucks. For instance, if you load req.extraPages.department, 
  // then a variable named department containing that page is visible to Nunjucks.
  //
  // It is is also acceptable to pass a single function rather than an 
  // array as the `load` property.
  //
  // The template name used to render the page is taken from
  // the template property of the page object. You will need to set the
  // directory from which page templates are loaded:
  //
  // app.get('*', pages.serve({ templatePath: __dirname + '/views/pages' })
  //
  // You can also override individual template paths. Any paths you don't
  // override continue to respect templatePath. Note that you are still 
  // specifying a folder's path, which must contain a nunjucks template 
  // named home.html to render a page with that template property:
  //
  // app.get('*', pages.serve({ ..., templatePaths: { home: __dirname + '/views/pages' } })
  //
  // In the event the page slug requested is not found, the notfound template 
  // is rendered. You can override the notfound template path like any other.
  //
  // Page templates will want to render areas, passing along the slug and the
  // edit permission flag:
  //
  // {{ aposArea({ slug: slug + ':main', area: page.main, edit: edit }) }}
  //
  // {{ aposArea({ slug: 'global:footer', area: global.footer, edit: edit }) }}
  //
  // You can access all properties of the page via the 'page' object. Any pages
  // added to extraPages by `load` callbacks are also visible, like `global` above.
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
  // template property, 'default' is assumed.

  self.serve = function(options) {
    return function(req, res) {

      req.extraPages = {};
      return async.series([page, permissions, relatives, load], main);

      function page(callback) {
        // Get content for this page
        req.slug = req.params[0];
        if ((!req.slug.length) || (req.slug.charAt(0) !== '/')) {
          req.slug = '/' + req.slug;
        }
        apos.getPage(req.slug, function(e, info) {
          if (e) {
            return callback(e);
          }
          // "What if there is no page?" We'll note that later
          // and send the 404 template. We still want to load all
          // the global stuff first
          req.page = info;

          // Allow a callback for supplying nonexistent pages dynamically
          // (apostrophe-wiki uses this)
          if ((!req.page) && options.notfound) {
            return options.notfound(req, function(err) {
              return callback(err);
            });
          } else {
            return callback(null);
          }
        });
      }

      function permissions(callback) {
        // 404 in progress
        if (!req.page) {
          return callback(null);
        }

        // Are we cool enough to view and/or edit this page?
        async.series([checkView, checkEdit], callback);

        function checkView(callback) {
          return apos.permissions(req, 'view-page', req.page, function(err) {
            // If there is a permissions error then note that we are not
            // cool enough to see the page, which triggers the appropriate
            // error template. 
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
          return apos.permissions(req, 'edit-page', req.page, function(err) {
            // If there is no permissions error then note that we are cool
            // enough to edit the page
            req.edit = !err;
            return callback(null);
          });
        } 
      }

      function load(callback) {
        // Get any shared pages like global footers, also
        // invoke load callbacks if needed

        var load = options.load ? options.load : [];

        // Be tolerant if they pass just one function
        if (typeof(load) === 'function') {
          load = [ load ];
        }

        // Turn any slugs into callbacks to fetch those slugs.
        // This is a little lazy: if we turn out to need multiple
        // pages of shared stuff we could coalesce them into a
        // single mongo query. However we typically don't, or
        // we're loading some of them only in certain situations.
        // So let's not prematurely optimize

        load = load.map(function(item) {
          if (typeof(item) !== 'function') {
            return function(callback) {
              apos.getPage(item, function(err, page) {
                if (err) {
                  return callback(err);
                }
                // Provide an object with an empty areas property if
                // the page doesn't exist yet. This simplifies templates
                req.extraPages[item] = page ? page : { areas: [] }
                return callback(null);
              });
            }
          } else {
            // Already a callback, now wrap it in a function that can
            // see the req variable
            return function(callback) {
              return item(req, callback);
            }
          }
        });

        return async.parallel(load, callback);
      }

      // Pages may have a path, separate from their slug, which expresses
      // their relationship to other pages. The path looks like 
      // this:
      //
      // home
      // home/about
      // home/about/staff
      //
      // The path always reflects the relationship between the pages no
      // matter what the slug may be edited to (clients routinely shorten
      // slugs but don't want to lose the relationships among pages).
      //
      // Note that paths do not have a leading /. 
      //
      // Pages also have a rank, which determines their ordering among
      // the children of a particular page.
      // 
      // When a page with a path is served, apostrophe-pages loads the
      // ancestors of that page into req.page.ancestors, in order
      // (root page first). 
      //
      // apostrophe-pages also loads the children of that page into
      // req.page.children, in order by rank. If options.depth
      // is greater than 1, the children of the subpages are loaded into
      // req.page.children[0].children, et cetera. options.depth
      // defaults to 1.
      //
      // Note that multiple roots are permitted by this structure.
      //
      // For performance reasons, req.page.children[0].areas and
      // req.page.ancestors[0].areas are NOT loaded. If you need some of 
      // the items associated with ancestors or descendants, use a 
      // load handler to fetch them.
      //

      function relatives(callback) {
        async.series([
          function(callback) { 
            return self.getAncestors(page, options, function(err, ancestors) {
              req.page.ancestors = ancestors;
              return callback(err);
            });
          },
          function(callback) { 
            return self.getDescendants(page, options, function(err, children) {
              req.page.children = children;
              return callback(err);
            });
          }
        ], callback);
      }

      function main(err) {
        var template;
        var providePage = true;
        // Rendering errors isn't much different from
        // rendering other stuff. We still get access
        // to shared stuff loaded via `load`.
        if (err) {
          template = 'serverError';
          res.statusCode = 500;
          providePage = false;
        } else if (req.loginRequired) {
          template = 'loginRequired';
          providePage = false;
        } else if (req.insufficient) {
          template = 'insufficient';
          providePage = false;
        } else if (req.page) {
          template = req.page.template;
        } else {
          res.statusCode = 404;
          template = 'notfound';
          providePage = false;
        }

        if (template === undefined) {
          // Supply a default template name
          template = 'default';
        }
        
        var args = {
          edit: req.edit,
          slug: req.slug,
          page: providePage ? req.page : null,
          // TODO Permissions callback here
          edit: req.user && (req.user.username === 'admin'),
          user: req.user
        };

        _.defaults(args, req.extraPages);
        
        var path = __dirname + '/views/' + template + '.html';
        if (options.templatePath) {
          path = options.templatePath + '/' + template + '.html';
        }
        if (options.templatePaths) {
          if (options.templatePaths[template]) {
            path = options.templatePaths[template] + '/' + req.page.template + '.html';
          }
        }
        return res.send(apos.partial(path, args));
      }
    }
  }

  // You can also call with just the page and callback arguments
  self.getAncestors = function(page, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    var paths = [];
    if (page.path) {
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
      // Get everything about the related pages except
      // for their actual items, which would be expensive.
      // Sorting by path works because longer strings sort
      // later than shorter prefixes
      return apos.pages.find({ path: { $in: paths } }, { items: 0 }).sort( { path: 1 }).toArray(function(err, pages) {
        if (err) {
          return callback(err);
        }
        return callback(null, pages);
      });
    }
    return callback(null); 
  };

  // You may skip the options parameter and pass just page and callback
  self.getDescendants = function(page, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }

    var depth = options.depth;
    // Careful, let them specify a depth of 0 but still have a good default
    if (depth === undefined) {
      depth = 1;
    }

    apos.pages.find(
      { 
        path: new RegExp('^' + RegExp.quote(page.path + '/')), 
        level: { $gt: page.level, $lte: page.level + depth } 
      }, 
      { items: 0 }
    ).
    sort( { level: 1, rank: 1 } ).
    toArray(function(err, pages) {
      if (err) {
        return callback(err);
      }
      var children = [];
      var pagesByPath = {};
      _.each(pages, function(page) {
        page.children = [];
        pagesByPath[page.path] = page;
        var last = page.path.lastIndexOf('/');
        var parentPath = page.path.substr(0, last);
        if (pagesByPath[parentPath]) {
          pagesByPath[parentPath].children.push(page);
        } else {
          children.push(page);
        }
      });
      return callback(null, children);
    });
  };

  // Unique and sparse together mean that many pages can have no path,
  // but any paths that do exist must be unique

  apos.pages.ensureIndex({ path: 1 }, { unique: true, sparse: true }, callback);
}
