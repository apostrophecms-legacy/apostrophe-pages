var assert = require('assert');
var mongo = require('mongodb');
var _ = require('lodash');
var apos = require('apostrophe')();

var db;

var pages;

var home;

var page;

var children;

var about;

var contact;

var req = apos.getTaskReq();

// TODO: test 'before' position for move(), test conflicting paths and slugs

describe('apostrophe-pages', function() {
  describe('initialize resources', function() {
    it('initialize mongodb', function(done) {
      db = new mongo.Db(
        'apostest',
        new mongo.Server('127.0.0.1', 27017, {}),
        // Sensible default of safe: true
        // (soon to be the driver's default)
        { safe: true }
      );
      assert(!!db);
      db.open(function(err) {
        assert(!err);
        return done();
      });
    });
    it('initialize apostrophe', function(done) {
      return apos.init({
        db: db,
        app: {
          request: {},
          locals: {},
          get: function() {},
          post: function() {}
        }
      }, function(err) {
        assert(!err);
        return done();
      });
    });
    it('initialize apostrophe-pages', function(done) {
      pages = require('../index.js')({
        apos: apos,
        ui: false
      }, function(err) {
        assert(!err);
        assert(!!pages);
        return done();
      });
    });
  });
  describe('remove test data', function() {
    it('removed', function(done) {
      apos.pages.remove({}, function(err) {
        assert(!err);
        done();
      });
    });
  });
  describe('insert test data', function() {
    apos.pages = apos.pages;
    it('inserted', function(done) {
      apos.pages.insert(
        [
          {
            _id: 'home',
            path: 'home',
            title: 'Home',
            sortTitle: 'home',
            level: 0,
            rank: 0,
            slug: '/',
            body: {
              items: [
                {
                  type: 'richText',
                  content: '<p>Body content</p>'
                }
              ],
              type: 'area'
            },
            sidebar: {
              items: [
                {
                  type: 'richText',
                  content: '<p>Sidebar content</p>'
                }
              ],
              type: 'area'
            },
            published: true
          },
          // Kids in scrambled order so sort() has work to do
          {
            _id: 'contact',
            path: 'home/contact',
            title: 'Contact',
            sortTitle: 'contact',
            level: 1,
            rank: 2,
            slug: '/contact',
            body: {
              items: [
                {
                  type: 'richText',
                  content: '<p>Body content</p>'
                }
              ],
              type: 'area'
            },
            sidebar: {
              items: [
                {
                  type: 'richText',
                  content: '<p>Sidebar content</p>'
                }
              ],
              type: 'area'
            },
            tags: [ 'red', 'green' ],
            published: true
          },
          {
            _id: 'about',
            path: 'home/about',
            title: 'About',
            sortTitle: 'about',
            level: 1,
            rank: 0,
            slug: '/about',
            body: {
              items: [
                {
                  type: 'richText',
                  content: '<p>Body content</p>'
                }
              ],
              type: 'area'
            },
            sidebar: {
              items: [
                {
                  type: 'richText',
                  content: '<p>Sidebar content</p>'
                }
              ],
              type: 'area'
            },
            tags: [ 'green', 'blue' ],
            published: true
          },
          {
            _id: 'location',
            path: 'home/about/location',
            title: 'Location',
            sortTitle: 'location',
            level: 2,
            rank: 1,
            slug: '/about/location',
            body: {
              items: [
                {
                  type: 'richText',
                  content: '<p>Body content</p>'
                }
              ],
              type: 'area'
            },
            sidebar: {
              items: [
                {
                  type: 'richText',
                  content: '<p>Sidebar content</p>'
                }
              ],
              type: 'area'
            },
            published: true
          },
          {
            _id: 'people',
            path: 'home/about/people',
            title: 'People',
            sortTitle: 'people',
            level: 2,
            rank: 0,
            slug: '/about/people',
            body: {
              items: [
                {
                  type: 'richText',
                  content: '<p>Body content</p>'
                }
              ],
              type: 'area'
            },
            sidebar: {
              items: [
                {
                  type: 'richText',
                  content: '<p>Sidebar content</p>'
                }
              ],
              type: 'area'
            },
            tags: [ 'green' ],
            published: true
          },
          {
            _id: 'friends',
            // This page is an "orphan" that should not show up
            // if methods other than getAncestors are given the
            // orphan: false flag
            orphan: true,
            path: 'home/about/friends',
            title: 'Friends',
            sortTitle: 'friends',
            level: 2,
            rank: 2,
            slug: '/about/friends',
            body: {
              items: [
                {
                  type: 'richText',
                  content: '<p>Body content</p>'
                }
              ],
              type: 'area'
            },
            sidebar: {
              items: [
                {
                  type: 'richText',
                  content: '<p>Sidebar content</p>'
                }
              ],
              type: 'area'
            },
            tags: [ 'friends' ],
            published: true
          },
          {
            _id: 'products',
            path: 'home/products',
            title: 'Products',
            sortTitle: 'products',
            level: 1,
            rank: 1,
            slug: '/products',
            body: {
              items: [
                {
                  type: 'richText',
                  content: '<p>Body content</p>'
                }
              ],
              type: 'area'
            },
            sidebar: {
              items: [
                {
                  type: 'richText',
                  content: '<p>Sidebar content</p>'
                }
              ],
              type: 'area'
            },
            published: true
          }
        ], function(err) {
          assert(!err);
          done();
        }
      );
    });
  });
  describe('fetch home page', function() {
    it('fetched', function(done) {
      apos.pages.findOne({ _id: 'home' }, function(err, doc) {
        assert(!!doc);
        home = doc;
        page = doc;
        done();
      });
    });
  });
  describe('fetch ancestors of home page (should be empty)', function() {
    it('fetched', function(done) {
      pages.getAncestors(req, page, function(err, ancestors) {
        assert(ancestors.length === 0);
        done();
      });
    });
  });

  describe('fetch descendants of home page', function() {
    it('fetched', function(done) {
      pages.getDescendants(req, page, { depth: 2 }, function(err, childrenArg) {
        children = childrenArg;
        assert(!err);
        assert(children.length === 3);
        done();
      });
    });
    it('in order', function() {
      assert(children[0]._id === 'about');
      assert(children[1]._id === 'products');
      assert(children[2]._id === 'contact');
    });
    it('did not return areas', function() {
      assert(!children[0].body);
      assert(!children[1].body);
      assert(!children[2].body);
    });
    it('have grandkids', function() {
      assert(children[0].children.length === 3);
    });
    it('grandkids in order', function() {
      assert(children[0].children[0]._id === 'people');
      assert(children[0].children[1]._id === 'location');
      assert(children[0].children[2]._id === 'friends');
    });
    it('fetch again with orphans turned off', function(done) {
      pages.getDescendants(req, page, { depth: 2, orphan: false }, function(err, childrenArg) {
        children = childrenArg;
        assert(!err);
        assert(children.length === 3);
        done();
      });
    });
    it('in order', function() {
      assert(children[0]._id === 'about');
      assert(children[1]._id === 'products');
      assert(children[2]._id === 'contact');
    });
    it('did not return areas', function() {
      assert(!children[0].body);
      assert(!children[1].body);
      assert(!children[2].body);
    });
    it('have correct number of grandkids', function() {
      assert(children[0].children.length === 2);
    });
    it('grandkids in order', function() {
      assert(children[0].children[0]._id === 'people');
      assert(children[0].children[1]._id === 'location');
    });
    it('fetch again with areas turned on', function(done) {
      pages.getDescendants(req, page, { depth: 2, areas: true }, function(err, childrenArg) {
        children = childrenArg;
        assert(!err);
        assert(children.length === 3);
        done();
      });
    });
    it('did return areas', function() {
      assert(children[0].sidebar);
      assert(children[1].sidebar);
      assert(children[2].sidebar);
      assert(children[0].body);
      assert(children[1].body);
      assert(children[2].body);
    });
    it('fetch again with specific area', function(done) {
      pages.getDescendants(req, page, { depth: 2, areas: [ 'body' ] }, function(err, childrenArg) {
        children = childrenArg;
        assert(!err);
        assert(children.length === 3);
        done();
      });
    });
    it('returned body area', function() {
      assert(children[0].body);
      assert(children[1].body);
      assert(children[2].body);
    });
    it('did not return sidebar area', function() {
      assert(!children[0].sidebar);
      assert(!children[1].sidebar);
      assert(!children[2].sidebar);
    });
  });

  var ancestors;

  describe('fetch ancestors of home/about/people', function() {
    it('fetched', function(done) {
      var people = children[0].children[0];
      pages.getAncestors(req, people, function(err, ancestorsArg) {
        assert(!err);
        assert(ancestorsArg);
        ancestors = ancestorsArg;
        done();
      });
    });
    it('correct count', function() {
      assert(ancestors.length === 2);
    });
    it('correct paths in order', function() {
      assert(ancestors[0]._id === 'home');
      assert(ancestors[1]._id === 'about');
    });
    it('did not return areas', function() {
      assert(!ancestors[0].body);
      assert(!ancestors[1].body);
      assert(!ancestors[0].sidebar);
      assert(!ancestors[1].sidebar);
    });
    it('fetch again with areas turned on', function(done) {
      var people = children[0].children[0];
      pages.getAncestors(req, people, { areas: true }, function(err, ancestorsArg) {
        assert(!err);
        assert(ancestorsArg);
        ancestors = ancestorsArg;
        done();
      });
    });
    it('did return all areas', function() {
      assert(ancestors[0].body);
      assert(ancestors[1].body);
      assert(ancestors[0].sidebar);
      assert(ancestors[1].sidebar);
    });
    it('fetch again with specific area', function(done) {
      var people = children[0].children[0];
      pages.getAncestors(req, people, { areas: [ 'body' ] }, function(err, ancestorsArg) {
        assert(!err);
        assert(ancestorsArg);
        ancestors = ancestorsArg;
        done();
      });
    });
    it('returned body area', function() {
      assert(ancestors[0].body);
      assert(ancestors[1].body);
    });
    it('did not return sidebar area', function() {
      assert(!ancestors[0].sidebar);
      assert(!ancestors[1].sidebar);
    });
    it('did not return children', function() {
      assert(!ancestors[0].children);
      assert(!ancestors[1].children);
    });
    it('fetch again with children', function(done) {
      var people = children[0].children[0];
      pages.getAncestors(req, people, { children: true }, function(err, ancestorsArg) {
        assert(!err);
        assert(ancestorsArg);
        ancestors = ancestorsArg;
        done();
      });
    });
    it('did return children arrays', function() {
      assert(Array.isArray(ancestors[0].children));
      assert(Array.isArray(ancestors[1].children));
    });
    it('children arrays are correct', function() {
      assert(ancestors[0].children.length === 3);
    });
  });

  describe('getParent returns home/about for home/about/people', function() {
    it('returned', function(done) {
      var people = children[0].children[0];
      pages.getParent(req, people, function(err, parent) {
        assert(!err);
        assert(parent);
        assert(parent._id === 'about');
        about = parent;
        return done();
      });
    });
  });

  describe('move home/about/people after home/contact', function() {
    var people;
    it('people exists', function(done) {
      people = children[0].children[0];
      assert(people._id === 'people');
      done();
    });
    it('moved without error', function(done) {
      pages.move(req, people, '/contact', 'after', function(err) {
        if (err) {
          console.log(err);
        }
        assert(!err);
        return done();
     });
    });
    it('home has 4 descendants', function(done) {
      pages.getDescendants(req, home, { depth: 1 }, function(err, childrenArg) {
        children = childrenArg;
        assert(children.length === 4);
        done();
      });
    });
    it('people is now the final child of home', function(done) {
      assert(children[3]._id === 'people');
      return done();
    });
    it('slug of people is now /people', function(done) {
      assert(children[3].slug === '/people');
      return done();
    });
  });

  describe('move home/people back under home/about as first child', function() {
    var people;
    it('people exists', function(done) {
      people = children[3];
      assert(people._id === 'people');
      done();
    });
    it('moved without error', function(done) {
      pages.move(req, people, '/about', 'inside', function(err) {
        if (err) {
          console.log(err);
        }
        assert(!err);
        return done();
     });
    });
    it('home/about has 3 descendants', function(done) {
      pages.getDescendants(req, about, { depth: 1 }, function(err, childrenArg) {
        children = childrenArg;
        assert(children.length === 3);
        done();
      });
    });
    it('first child of home/about is now people', function(done) {
      assert(children[0]._id === 'people');
      return done();
    });
    it('people is at /about/people', function(done) {
      assert(children[0].slug === '/about/people');
      return done();
    });
  });

  describe('move home/about under home/contact, by slug', function() {
    var location;
    it('moved without error', function(done) {
      pages.move(req, '/about', '/contact', 'inside', function(err) {
        if (err) {
          console.log(err);
        }
        assert(!err);
        return done();
     });
    });
    it('got contact', function(done) {
      apos.pages.findOne({ slug: '/contact' }, function(err, page) {
        contact = page;
        assert(page);
        return done();
      });
    });
    it('home/contact has 1 child', function(done) {
      pages.getDescendants(req, contact, { depth: 2 }, function(err, childrenArg) {
        children = childrenArg;
        assert(children.length === 1);
        done();
      });
    });
    it('home/contact/about/location exists at the right path', function(done) {
      apos.pages.findOne({ _id: 'location', path: 'home/contact/about/location' }, function(err, page) {
        location = page;
        assert(location);
        return done();
      });
    });
    it('home/contact/about/location has level 3', function(done) {
      assert(location.level === 3);
      return done();
    });
    it('home/contact/about/location has slug /contact/about/location', function(done) {
      assert(location.slug === '/contact/about/location');
      return done();
    });
  });

  describe('fetch pages by tag', function() {
    var fetched;
    it('fetched without error', function(done) {
      pages.getByTag(req, 'green', function(err, fetchedArg) {
        if (err) {
          console.log(err);
        }
        assert(!err);
        fetched = fetchedArg.pages;
        return done();
      });
    });
    it('fetched three pages', function(done) {
      assert(fetched.length === 3);
      return done();
    });
    it('first one must be about due to title order', function(done) {
      assert(fetched[0]._id === 'about');
      return done();
    });
    it('filterByTag returns only contact for "red"', function(done) {
      var filtered = pages.filterByTag(fetched, 'red');
      assert(filtered.length === 1);
      assert(filtered[0]._id === 'contact');
      return done();
    });
  });

  describe('add page', function() {
    it('adds a new page beneath /contact called /contact/new-kid', function(done) {
      var req = {
        user: {
          permissions: {
            admin: true
          }
        },
        body: {
          parent: '/contact',
          title: 'New Kid',
          published: true,
          tags: [ 'one', 'two' ],
          type: 'default'
        }
      };
      var res = {
        send: function(data) {
          assert((!res.statusCode) || (res.statusCode === 200));
          var page = JSON.parse(data);
          assert(typeof(page) === 'object');
          assert(page.slug === '/contact/new-kid');
          return apos.getPage(req, '/contact', function(err, page) {
            assert(!err);
            assert(page);
            assert(page.slug === '/contact');
            return pages.getDescendants(apos.getTaskReq(), page, { depth: 2 }, function(err, children) {
              assert(children.length === 2);
              assert(children[0].slug === '/contact/about');
              assert(children[1].slug === '/contact/new-kid');
              assert(children[1].path === 'home/contact/new-kid');
              return done();
            });
          });
        }
      };
      return pages._newRoute(req, res);
    });
  });

  describe('edit page settings', function() {
    it('propagates slug changes to children properly', function(done) {
      var req = {
        user: {
          permissions: {
            admin: true
          }
        },
        body: {
          originalSlug: '/contact/about',
          slug: '/contact/about2',
          title: 'About2',
          published: true,
          tags: [ 'one', 'two' ],
          type: 'default'
        }
      };
      var res = {
        send: function(data) {
          assert((!res.statusCode) || (res.statusCode === 200));
          var page = JSON.parse(data);
          assert(typeof(page) === 'object');
          assert(page.slug === '/contact/about2');
          return pages.getDescendants(apos.getTaskReq(), page, { depth: 2 }, function(err, childrenArg) {
            children = childrenArg;
            assert(!err);
            assert(children.length === 3);
            assert(children[0]._id === 'people');
            assert(children[0].slug === '/contact/about2/people');
            assert(children[1].slug === '/contact/about2/location');
            assert(children[2].slug === '/contact/about2/friends');
            return done();
          });
        }
      };
      return pages._editRoute(req, res);
    });
   it('retains children when avoiding a duplicate slug error', function(done) {
      var req = {
        user: {
          permissions: {
            admin: true
          }
        },
        body: {
          originalSlug: '/contact/about2',
          slug: '/contact/new-kid',
          title: 'About2',
          published: true,
          tags: [ 'one', 'two' ],
          type: 'default'
        }
      };
      var res = {
        send: function(data) {
          assert((!res.statusCode) || (res.statusCode === 200));
          var page = JSON.parse(data);
          assert(typeof(page) === 'object');
          assert(page.slug.match(/^\/contact\/new\-kid\d$/));
          var baseSlug = page.slug;
          return pages.getDescendants(apos.getTaskReq(), page, { depth: 2 }, function(err, childrenArg) {
            children = childrenArg;
            assert(!err);
            assert(children.length === 3);
            assert(children[0]._id === 'people');
            assert(children[0].slug === baseSlug + '/people');
            assert(children[1].slug === baseSlug + '/location');
            assert(children[2].slug === baseSlug + '/friends');
            return done();
          });
        }
      };
      return pages._editRoute(req, res);
    });  });
});

