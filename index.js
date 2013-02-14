var async = require('async');
var _ = require('underscore');

module.exports = function(options) {
  return new pages(options);
};

function pages(options) {
  var apos = options.apos;
  var app = options.app;
  var self = this;
  
  // Make sure that aposScripts and aposStylesheets summon our
  // browser-side UI assets for managing pages

  apos.scripts.push('/apos-rss/js/rss.js');

  apos.stylesheets.push('/apos-rss/css/rss.css');

  // Serve our assets
  app.get('/apos-pages/*', apos.static(__dirname + '/public'));

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
      return async.series([page, permissions, load], main);

      function page(callback) {
        // Get content for this page
        req.slug = req.params[0];
        if ((!req.slug.length) || (req.slug.charAt(0) !== '/')) {
          req.slug = '/' + req.slug;
        }
        console.log("SLUG IS " + req.slug);
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
            console.log('NOT FOUND');
            return options.notfound(req, function(err) {
              return callback(err);
            });
          } else {
            console.log('FOUND');
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
          console.log(callback);
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
          console.log(callback);
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

        console.log('REQ.PAGE IN LOAD:');
        console.log(req.page);

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
                req.extraPages[item] = page;
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

      function main(err) {
        console.log('REQ.PAGE IN MAIN:');
        console.log(req.page);
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
        console.log('providePage: ' + providePage);
        
        var args = {
          edit: req.edit,
          slug: req.slug,
          page: providePage ? req.page : null,
          // TODO Permissions callback here
          edit: req.user && (req.user.username === 'admin'),
          user: req.user
        };

        _.defaults(args, req.extraPages);

        console.log('ARGS ARE:');
        console.log(args);
        
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
}
