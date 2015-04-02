module.exports = function(app, models) {

  var sequelize = app.get('sequelize')
    , async = require('async')
    , knox = require('knox')
    , Sequelize = require("sequelize")
    , s3_client = knox.createClient({
              key: process.env.AWS_ACCESS_KEY_ID
            , secret: process.env.AWS_SECRET_KEY
            , bucket: app.get('posters_path').pub_bucket
          })
    , s3_client_trailers = knox.createClient({
              key: process.env.AWS_ACCESS_KEY_ID
            , secret: process.env.AWS_SECRET_KEY
            , bucket: app.get('posters_path').trailer_pub_bucket
          })
    ;
  var movy = sequelize.import(__dirname + '/../node_modules/movy_npm/models/movy_model');

  app.post('/admin_nerds/data/venues', models.Users.ensureAuthenticated, function(req, res, next) {
    var where = {}, where_func = [], perpage = 20, page = 0;
    if(req.param("page") > 0)
      page = parseInt(req.param("page"));

    if(req.param("state"))
      where.state = req.param("state");
    if(req.param("str"))
      where.name = { "like": req.param("str") + '%' };
    movy.db.movy_venues.count({ where: where }).success(function(count) {
      if(page > count)
        page = 0;
      movy.db.movy_venues.findAll({ attributes: [ "name", "address", "locality", "postcode", "state" ],
                    where: where,
                    include: [{ model: movy.db.flicks.flicks_venues, as: "flicks"},
                              { model: movy.db.ebc.ebc_venues, as: "ebc"},
                              { model: movy.db.moviefix.moviefix_venues, as: "moviefix"},
                              { model: movy.db.icaa.icaa_venues, as: "icaa"},
                              ],
                    order: ["name"],
                    limit: perpage,
                    offset: page}).success(function(results) {
        var venues = {};
        venues.rows = results;
        venues.count = count;
        async.map(venues.rows, function(venue, callback) {
          var result = venue.values;
          result.srcs = [];
          if(result.flicks && result.flicks.length > 0) {
            result.flicks.forEach(function(el) {
              result.srcs.push({
                name: el.title,
                address: el.address,
                id: el.name,
                type: 'flicks'
              });
            });
          }
          if(result.ebc && result.ebc.length > 0) {
            result.ebc.forEach(function(el) {
              result.srcs.push({
                name: el.vn,
                address: el.sa,
                id: el.vi,
                type: 'ebc'
              });
            });
          }
          if(result.moviefix && result.moviefix.length > 0) {
            result.moviefix.forEach(function(el) {
              result.srcs.push({
                name: el.CinemaName,
                address: [ el.CinemaAddress1, el.CinemaAddress2, el.CinemaAddress3 ].join(', '),
                id: el.CinemaId,
                type: 'moviefix'
              });
            });
          }
          if(result.icaa && result.icaa.length > 0) {
            result.icaa.forEach(function(el) {
              result.srcs.push({
                name: '------',
                address: el.url,
                id: el.url,
                type: 'icaa'
              });
            });
          }
          result.address = result.address + ', ' + result.locality + ' ' + result.postcode + ', ' + result.state;
          delete(result.flicks);
          delete(result.ebc);
          delete(result.moviefix);
          delete(result.icaa);
          callback(null, result);
        }, function(err, res_venues) {
          res.json({
            total: venues.count,
            perpage: perpage,
            page: page,
            venues: res_venues
          });
        });
      }).error(function(err) {
        res.json(500);
      });
    }).error(function(err) {
      res.json(500);
    });
  });

  app.post('/admin_nerds/data/venues/empty_srcs', models.Users.ensureAuthenticated, function(req, res, next) {
    var where = {}, where_func = [], perpage = 20, page = 0;
    if(req.param("page") > 0)
      page = parseInt(req.param("page"));

    where.movy_venue_id = null;

    movy.db.icaa.icaa_venues.count({ where: where }).success(function(count) {
      if(page > count)
        page = 0;
      movy.db.icaa.icaa_venues.findAll({ attributes: [ "url" ],
                    where: where,
                    order: ["url"],
                    limit: perpage,
                    offset: page}).success(function(results) {
        var venues = {};
        venues.rows = results;
        venues.count = count;
        async.map(venues.rows, function(venue, callback) {
          var result = venue.values;
          result.id = null;
          result.name = null;
          result.address = null;
          result.srcs = [];
          result.srcs.push({
            name: '------',
            address: venue.url,
            id: venue.url,
            type: 'icaa'
          });
          callback(null, result);
        }, function(err, res_venues) {
          res.json({
            total: venues.count,
            perpage: perpage,
            page: page,
            venues: res_venues
          });
        });
      }).error(function(err) {
        res.json(500);
      });
    }).error(function(err) {
      res.json(500);
    });
  });

  app.get('/admin_nerds/data/venues/:id', models.Users.ensureAuthenticated, function(req, res, next) {
    movy.db.movy_venues.find(req.param('id'), { raw: true }).success(function(venue) {
      async.parallel([
        function(callback) {
          movy.db.ebc.ebc_venues.findAll({ where: {"movy_venue_id": venue.id },
              include: [{ model: movy.db.ebc.ebc_states, as: "state" }, movy.db.ebc.google_places ]},
              { raw: true }).success(function(ebc_venues) {
            async.map(ebc_venues, function(el, callback2) {
              if(el.google_place && el.google_place.json) {
                el.google_place.data = JSON.parse(el.google_place.json);
                delete(el.google_place.json);
              }
              callback2(null, el);
            }, function(err, ebc_venues_res) {
              venue.ebc = ebc_venues_res;
              callback();
            })
          }).error(function(err) { callback() });
        }, function(callback) {
          movy.db.flicks.flicks_venues.findAll({ where: {"movy_venue_id": venue.id },
              include: [ movy.db.flicks.google_places ]},
              { raw: true }).success(function(flicks_venues) {
            async.map(flicks_venues, function(el, callback2) {
              if(el.google_place && el.google_place.json) {
                el.google_place.data = JSON.parse(el.google_place.json);
                delete(el.google_place.json);
              }
              callback2(null, el);
            }, function(err, flicks_venues_res) {
              venue.flicks = flicks_venues_res;
              callback();
            })
          }).error(function(err) { callback() });
        }, function(callback) {
          movy.db.moviefix.moviefix_venues.findAll({ where: {"movy_venue_id": venue.id },
              include: [ movy.db.moviefix.google_places ]},
              { raw: true }).success(function(moviefix_venues) {
            async.map(moviefix_venues, function(el, callback2) {
              if(el.google_place && el.google_place.json) {
                el.google_place.data = JSON.parse(el.google_place.json);
                delete(el.google_place.json);
              }
              callback2(null, el);
            }, function(err, moviefix_venues_res) {
              venue.moviefix = moviefix_venues_res;
              callback();
            })
          }).error(function(err) { callback() });
        }, function(callback) {
          movy.db.icaa.icaa_venues.findAll({ where: {"movy_venue_id": venue.id }},
              { raw: true }).success(function(icaa_venues) {
            venue.icaa = icaa_venues;
            callback();
          }).error(function(err) { callback() });
        }], function(err, result) {
        res.json(venue);
      });
    }).error(function(err) {
      res.json(500);
    })
  });

  app.post('/admin_nerds/data/venues/merge', models.Users.ensureAuthenticated, function(req, res, next) {
    movy.venues.venues_merge({
      merge_venue: req.param('merge_venue'),
      base_venue: req.param('base_venue')
    }, function(err, data) {
      if(err)
        return res.json(400, err);
      return res.json(data);
    })
  });

  app.post('/admin_nerds/data/venues/attach_src', models.Users.ensureAuthenticated, function(req, res, next) {
    movy.venues.venues_attach_src({
      movy_venue_id: req.param('movy_id'),
      type: req.param('type'),
      src_id: req.param('src_id'),
    }, function(err, data) {
      if(err)
        return res.json(400, err);
      return res.json(data);
    })
  });

  app.post('/admin_nerds/data/venues/create_src', models.Users.ensureAuthenticated, function(req, res, next) {
    movy.venues.venues_create_src({
      type: req.param('type'),
      src_id: req.param('src_id'),
    }, function(err, data) {
      if(err)
        return res.json(400, err);
      return res.json(data);
    })
  });

  app.post('/admin_nerds/data/venues/trash_src', models.Users.ensureAuthenticated, function(req, res, next) {
    movy.venues.venues_trash_src({
      type: req.param('type'),
      src_id: req.param('src_id'),
    }, function(err, data) {
      if(err)
        return res.json(400, err);
      return res.json(data);
    })
  });

  app.patch('/admin_nerds/data/venues/:id', models.Users.ensureAuthenticated, function(req, res, next) {
    movy.venues.venues_update_manually({
      attributes: req.body,
      movy_venue_id: req.param('id'),
    }, function(err, data) {
      if(err)
        return res.json(400, err);
      return res.json(data);
    })
  });
};