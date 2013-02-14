# apostrophe-pages

`apostrophe-pages` adds page rendering to the [Apostrophe](http://github.com/punkave/apostrophe) content management system. The `apostrophe-pages` module makes it easy to serve pages, fetching the requested page and making its content areas available to your Nunjucks template along with any other attributes of interest.

`apostrophe-pages` will soon also account for traditional "page trees," in which the "Staff" page is a child of the "About" page which is a child of the "Home" page, and provide a convenient interface for creating and managing pages.

By default `apostrophe-pages` renders page templates found in its `views` folder depending on the `template` property of the page. You can override the location where one or all of these are found in order to provide custom templates for your project's needs.

Setting up `apostrophe-pages` is easy once you have the main `apos` object. See the [apostrophe-wiki](http://github.com/punkave/apostrophe-wiki) project for a more complete sample app. In this example we want to render any URL that matches a page slug as a page:

    var apos = require('apostrophe')({ ..., partialPaths: [ '/views/global' ]});
    var pages = require('apostrophe-pages')({ apos: apos, templatePath: __dirname + '/views/pages' });

    // Your app specific routes should come first.
    app.get('/mything', function(req, res) { ... my non-Apostrophe-related stuff ... });

    // Now try to serve anything else as a page.
    app.get('*', pages.serve());

Notice that we set partialPaths to provide global layout templates that can be `extend`ed by our page templates, and set `templatePath` to specify where our page templates area.

`pages.serve` has options that can be used to override its behavior in many ways. Complete documentation for the `pages.serve` function is provided at the top of the function in `index.js` (TODO: work on publishing this as jsdoc).

Your page templates will want to render areas. Just use the page objects passed to you to access them and call the aposArea helper available in anything rendered via apos.partial, which includes page templates:

    {{ aposArea({ slug: slug + ':main', area: page.areas.main, edit: edit }) }}
    {{ aposArea({ slug: slug + ':main', area: global.areas.footer, edit: edit }) }}
