var assert = require('assert');
var mongo = require('mongodb');
var apos = require('apostrophe')();

var db;

var pages;

var home;

var page;

var children;

var about;

var contact;

var req = {};

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
            slug: '/'
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
            tags: [ 'red', 'green' ]
          },
          {
            _id: 'about',
            path: 'home/about',
            title: 'About',
            sortTitle: 'about',
            level: 1,
            rank: 0,
            slug: '/about',
            tags: [ 'green', 'blue' ]
          },
          {
            _id: 'location',
            path: 'home/about/location',
            title: 'Location',
            sortTitle: 'location',
            level: 2,
            rank: 1,
            slug: '/about/location'
          },
          {
            _id: 'people',
            path: 'home/about/people',
            title: 'People',
            sortTitle: 'people',
            level: 2,
            rank: 0,
            slug: '/about/people',
            tags: [ 'green' ]
          },
          {
            _id: 'products',
            path: 'home/products',
            title: 'Products',
            sortTitle: 'products',
            level: 1,
            rank: 1,
            slug: '/products'
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
    it('have grandkids', function() {
      assert(children[0].children.length === 2);
    });
    it('grandkids in order', function() {
      assert(children[0].children[0]._id === 'people');
      assert(children[0].children[1]._id === 'location');
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
    it('home/about has 2 descendants', function(done) {
      pages.getDescendants(req, about, { depth: 1 }, function(err, childrenArg) {
        children = childrenArg;
        assert(children.length === 2);
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
        fetched = fetchedArg;
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
});

