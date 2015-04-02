module.exports = function(app, models, movy) {

  var extend = require('util')._extend
    , async = require('async')
    , crypto = require('crypto');
  var sequelize = app.get('sequelize');

  app.param(function(name, fn){
    if (fn instanceof RegExp) {
      return function(req, res, next, val){
        var captures;
        if (captures = fn.exec(String(val))) {
          req.params[name] = captures;
          next();
        } else {
          next('route');
        }
      }
    }
  });

  app.param('block', function(req, res, next, block) {
    if(block != 'new-this-week' && block != 'playing' && block != 'ending') {
      next('route');
    }
    else {
      req.params["block"] = block;
      next();
    }
  });

  app.param('around_movie', function(req, res, next, movie_uri) {
    movy.tools.seo.parse_url_for_movie(movie_uri, { radius: 'around' }, function(movie_from_url) {
      if(!movie_from_url)
        return next();
      movy.movies.movie_get_by_url({ movie_uri: movie_from_url.movie, year: movie_from_url.year }, null, function(err, movie) {
        if(!movie)
          return next();
        req.movie = movie;
        next();
      });
    });
  });

  app.param('seo_location', function(req, res, next, location) {
    check_seo_location_url(req, res, next, location);
  });
  app.param('location', function(req, res, next, location) {
    check_seo_location_url(req, res, next, location);
  });

  var check_seo_location_url = function(req, res, next, location) {
    if(req.location_checked) return next();
    req.location_checked = true;
    if(!req.param('movie') && req.session_data.location && req.session_data.location.movie) {
      req.session_data.location.movie = null;
      req.session_data.location.movie_url = null;
      req.session_data.location.inf = null;
    }

    if(req.session_data.location && req.session_data.location.url == location.toLowerCase()) {
      next();
      return;
    }

    app.get("memcached").get('location/' + location, function(err, val) {
      if(!err && val) {
        req.session_data.location = val;
        if(req.session)
          req.session.location_url = req.session_data.location.url;
        return next();
      }

      if(!req.session_data.location) {
        req.session_data.location = {
          // lat: -37.814563,
          // lon: 144.970267,
          // radius: 5,
          // postcode: 3000,
          // state: 'VIC',
          // locality: 'Melbourne',
          // url: '-melbourne-vic-3000',
          // tz: 'Australia/Victoria',
          venue: null,
          movie: null,
          movie_url: null,
        };
        // req.session_data.location.url = movy.tools.seo.location_uri({
        //   radius: req.session_data.location.radius,
        //   locality: req.session_data.location.locality,
        //   postcode: req.session_data.location.postcode,
        //   state: req.session_data.location.state
        // });
      }

      req.session_data.location.locs_near = null;
      req.session_data.location.venue_ids = null;
      req.session_data.location.venues = null;
      req.session_data.location.movies_radius = null;
      req.session_data.location.top_titles = null;
      req.session_data.location.inf = null;
      req.session_data.location.movie = null;
      req.session_data.location.movie_url = null;

      // var loc_match = location.match(/^-(?:(at|in|near|around)-)?([a-z0-9\-]+)-([a-z]{2,3})-(\d{4})$/i);
      movy.tools.seo.parse_url_for_location(location, function(loc) {
        if(!loc) {
          return next();
        }
        if(loc.around == 'around') {
          req.around_me = true;
          if(req.is_phantom) {
            req.session_data.location.radius = 'around';
          }
          return next();
        }
        else if(loc.venue) {
          var where = { name_uri: loc.venue };
          if(loc.postcode) where.postcode = loc.postcode;
          if(loc.state) where.state = loc.state;
          if(loc.locality) where.locality = loc.locality;
          movy.db.movy_venues.find({ where: where }, {raw: true})
            .success(function(venue) {
            if(venue) {
              req.session_data.location = {};
              req.session_data.location.lat = venue.lat;
              req.session_data.location.lon = venue.lon;
              req.session_data.location.radius = 0;
              req.session_data.location.postcode = venue.postcode;
              req.session_data.location.venue = venue.name;
              req.session_data.location.locality = venue.locality;
              req.session_data.location.state = venue.state;
              // req.session_data.location.url = location.toLowerCase();
              if(!loc.locality) {
                req.session_data.location.url = movy.tools.seo.venue_uri({
                  venue: venue.name_uri,
                  locality: venue.locality,
                  postcode: venue.postcode,
                  state: venue.state
                });
              }
              else
                req.session_data.location.url = loc.url;
              req.session_data.location.tz = movy.tools.tz_from_state(venue.state);
              if(req.session)
                req.session.location_url = req.session_data.location.url;

              if(!req.around_me && location == req.session_data.location.url)
                app.get("memcached").set('location/' + location, req.session_data.location);
              return next();
            }
            else {
              return next();
              // return res.json(404, req.session_data.location);
            }
          }).error(function(err) {
            return next();
            // return res.json(404, req.session_data.location);
          });
        }
        else {
          movy.db.postcodes.postcodes.find({ where: { postcode: loc.postcode, state: loc.state, locality: loc.locality.replace(/-/g,' ') } }, {raw: true})
            .success(function(postcode) {
            if(postcode) {
              req.session_data.location = {};
              req.session_data.location.lat = postcode.lat;
              req.session_data.location.lon = postcode.lon;
              req.session_data.location.radius = loc.radius;
              req.session_data.location.postcode = postcode.postcode;
              // req.session_data.location.locality = postcode.locality;
              req.session_data.location.locality = postcode.locality.replace(/\-/g, ' ').replace(/(\w+)/g, function(txt) {
                return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
              });
              req.session_data.location.state = postcode.state;
              // req.session_data.location.url = location.toLowerCase();
              req.session_data.location.url = loc.url;
              req.session_data.location.tz = movy.tools.tz_from_state(postcode.state);
              req.session_data.location.venue = null;
              if(req.session)
                req.session.location_url = req.session_data.location.url;

              if(!req.around_me && location == req.session_data.location.url)
                app.get("memcached").set('location/' + location, req.session_data.location);
              return next();
            }
            else {
              return next();
              // return res.json(404, req.session_data.location);
            }
          }).error(function(err) {
            return next();
            // return res.json(404, req.session_data.location);
          });
        }
      });
    });
  };

  app.param('location', function(req, res, next, location) {
    if(req.is_redirecting) return next();
    if(req.session_data.location.venue_ids) return next();

    fill_location_venues(req, res, next)
  });

  app.param('location', function(req, res, next, location) {
    if(req.is_redirecting) return next();
    if(req.session_data.location.top_titles || !req.session_data.location.url) return next();
    // if(!req.session_data.location.venue) return next();
    var mem_key;
    if(req.session_data.location.venue_ids && req.session_data.location.venue_ids.length < 30)
      mem_key = req.session_data.location.venue_ids + '/' + req.session_data.location.tz;
    else {
      var md5sum = crypto.createHash('md5').update(req.session_data.location.venue_ids).digest('hex');
      mem_key = md5sum + '/' + req.session_data.location.tz;
    }
    app.get("memcached").get('location_top_movie_titles/' + mem_key, function(err, top_titles) {
      if(!err && top_titles) {
        req.session_data.location.top_titles = top_titles;
        return next();
      }

      // if(req.session_data.location.venue) {
        return movy.venues.top_movie_titles({
          venue_id: req.session_data.location.venue_ids,
          tz: req.session_data.location.tz,
        }, function(top_titles) {
          req.session_data.location.top_titles = top_titles;
          if(top_titles)
            app.get("memcached").set('location_top_movie_titles/' + mem_key
                    , top_titles, 24 * 3600);
          next();
        });
      // }
      // next();
    });
  });
  
  app.param('location', function(req, res, next, location) {
    if(req.is_redirecting) return next();
    if(req.session_data.location.movies_radius || !req.session_data.location.url) return next();

    app.get("memcached").get('location_movies_radius/' + req.param('location'), function(err, movies_radius) {
      if(!err && movies_radius) {
        req.session_data.location.movies_radius = movies_radius;
        return next();
      }

      var venue_radius;

      var count_movies_radius = function() {
        movy.venues.count_movies_around({
          lat: req.session_data.location.lat,
          lon: req.session_data.location.lon,
          tz: req.session_data.location.tz,
          radius: [ 5, 10, 25, 50 ],
        }, function(movies_radius) {
          if(movies_radius[req.session_data.location.radius] == 0 && req.session_data.location.radius < 50) {
            if(req.session_data.location.radius < 10 && movies_radius[10] > 0) {
              req.session_data.location.radius = 10;
            }
            else if(req.session_data.location.radius < 25 && movies_radius[25] > 0) {
              req.session_data.location.radius = 25; 
            }
            else {
              req.session_data.location.radius = 50;
            }
            req.session_data.location.url = movy.tools.seo.location_uri({
              radius: req.session_data.location.radius,
              locality: req.session_data.location.locality,
              state: req.session_data.location.state,
              postcode: req.session_data.location.postcode
            });
            req.session_data.location.venue_ids = null;
            req.session_data.location.venues = null;
          }
          req.session_data.location.movies_radius = movies_radius;
          if(venue_radius)
            req.session_data.location.movies_radius.venue = venue_radius;
          if(!req.around_me && req.param('location') == req.session_data.location.url && movies_radius)
            app.get("memcached").set('location_movies_radius/' + req.param('location')
                    , movies_radius, 24 * 3600);

          // return fill_location_venues(req, res, next);
          return next();
        });
      };

      if(req.session_data.location.venue)
        return movy.venues.count_movies_around({
          venue_id: req.session_data.location.venue_ids,
          tz: req.session_data.location.tz,
        }, function(movies_radius) {
          venue_radius = movies_radius.venue;
          return count_movies_radius();
          // req.session_data.location.movies_radius = movies_radius;

          // if(!req.around_me && req.param('location') == req.session_data.location.url && movies_radius)
          //   app.get("memcached").set('location_movies_radius/' + req.param('location')
          //           , movies_radius, 24 * 3600);

          // // if(!req.around_me && req.param('location') == req.session_data.location.url && req.session_data.location.movie == null)
          // //   app.get("memcached").set('location/' + req.param('location'), req.session_data.location);

          // next();
        });
      else
        count_movies_radius();

    });
  });

  app.param('location', function(req, res, next, location) {
    if(req.is_redirecting) return next();
    if(req.session_data.location.locs_near && req.session_data.location.locs_near.length > 0) return next();

    app.get("memcached").get('location_near/' + req.session_data.location.lat + '/' + req.session_data.location.lon, function(err, locs_near) {
      if(!err && locs_near) {
        req.session_data.location.locs_near = locs_near;
        return next();
      }
      movy.models.postcodes.find_nearest_locs({
        lat: req.session_data.location.lat,
        lon: req.session_data.location.lon,
        postcode: req.session_data.location.postcode
      }, function(err, locs_near) {
        if(locs_near && Array.isArray(locs_near)) {
          for(var i = 0; i < locs_near.length; i++) {
            locs_near[i].url = movy.tools.seo.location_uri({
              radius: '5',
              locality: locs_near[i].locality,
              state: locs_near[i].state,
              postcode: locs_near[i].postcode
            });
            locs_near[i].locality = locs_near[i].locality.replace(/\-/g, ' ').replace(/(\w+)/g, function(txt) {
                return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
              });
          }
          req.session_data.location.locs_near = locs_near;
          if(locs_near)
            app.get("memcached").set('location_near/' + req.session_data.location.lat + '/' + req.session_data.location.lon
                    , locs_near, 30 * 24 * 3600);
        }
        next();
      });
    });
  });

  app.param('seo_movie', function(req, res, next, movie_uri) {
    check_seo_movie_url(req, res, next, movie_uri);
  });

  app.param('movie', function(req, res, next, movie_uri) {
    if(req.movie && req.movie.title_uri == movie_uri) return next();
    if(movie_uri) {
      movy.movies.movie_get_by_url({ movie_uri: movie_uri }, ["id", "title", "release_date", "classification", "duration", "trailer_uri",
        "imdb_rating", "imdb_id", "rt_rating", "rt_id", "about", "title_uri"]
      , function(err, movie) {
        if(err == 301 && movie && movie.title_uri) {
          return res.redirect(req.originalUrl.replace(req.param('movie'), movie.title_uri));
        }
        if(!movie) {
          return check_seo_movie_url(req, res, next, movie_uri);
        }

        return save_movie_in_req(movie, req, res, next);
      });
    }
    else {
      next();
    }
  });

  var fill_location_venues = function(req, res, next) {
    app.get("memcached").get('location_venues/' + req.session_data.location.lat + '/'
                + req.session_data.location.lon + '/' + req.session_data.location.radius
                + '/' + (req.session_data.location.venue ? req.session_data.location.venue.replace(/[^a-z0-9]+/gi,'-') : '')
              , function(err, venues) {
      if(!err && venues) {
        req.session_data.location.venue_ids = venues.venue_ids;
        req.session_data.location.venues = venues.venues;
        return next();
      }

      movy.venues.find_venues({
        lat: req.session_data.location.lat,
        lon: req.session_data.location.lon,
        radius: req.session_data.location.radius,
        venue: req.session_data.location.venue
      }, function(new_radius, venues) {
        if(new_radius != req.session_data.location.radius) {
          if(new_radius <= 10) {
            req.session_data.location.radius = 10;
          }
          else if(new_radius <= 25) {
            req.session_data.location.radius = 25; 
          }
          else {
            req.session_data.location.radius = 50;
          }
          req.session_data.location.url = movy.tools.seo.location_uri({
            radius: req.session_data.location.radius,
            locality: req.session_data.location.locality,
            state: req.session_data.location.state,
            postcode: req.session_data.location.postcode
          });
        }
        var venue_ids;
        if(venues && Array.isArray(venues)) {
          for(var i = 0; i < venues.length; i++) {
            // venues[i].url = (venues[i].name_uri + '-' + venues[i].state + '-' + venues[i].postcode).toLowerCase();
            venues[i].url = movy.tools.seo.venue_uri({
              venue: venues[i].name_uri,
              locality: venues[i].locality,
              state: venues[i].state,
              postcode: venues[i].postcode
            });
            if(venue_ids && venue_ids.match(venues[i].id + ',')) continue;
            venue_ids = venue_ids ? venue_ids + ',' + venues[i].id : venues[i].id.toString();
          }
        }
        req.session_data.location.venue_ids = venue_ids;
        req.session_data.location.venues = venues;

        if(!req.around_me && req.param('location') == req.session_data.location.url && venues)
          app.get("memcached").set('location_venues/' + req.session_data.location.lat + '/'
                + req.session_data.location.lon + '/' + req.session_data.location.radius
                + '/' + (req.session_data.location.venue ? req.session_data.location.venue.replace(/[^a-z0-9]+/gi,'-') : '')
                  , { venues: venues, venue_ids: venue_ids }, 24 * 3600);

        next();
      });
    });
  };

  var check_seo_movie_url = function(req, res, next, movie_uri) {
    if(req.movie_checked) return next();
    req.movie_checked = true;
    movy.tools.seo.parse_url_for_movie(movie_uri, { radius: req.around_me ? 'around' : req.session_data.location.radius }, function(movie_from_url) {
      if(!movie_from_url)
        return next();
      if(req.movie && req.movie.title_uri == movie_from_url.movie) return next();
      movy.movies.movie_get_by_url({ movie_uri: movie_from_url.movie, year: movie_from_url.year }, null, function(err, movie) {
        // if(err == 301 && movie && movie.title_uri && movie_uri != movie.title_uri) {
        //   return res.redirect(req.originalUrl.replace(movie_uri, movie.title_uri));
        // }
        if(!movie)
          return next();

        return save_movie_in_req(movie, req, res, next);
      });
    });
  };

  var save_movie_in_req = function(movie, req, res, next) {
    req.session_data.location.movie = movie.title_uri;
    req.session_data.location.movie_url = movy.tools.seo.movie_uri({
      radius: (req.around_me && req.is_phantom) ? 'around' : req.session_data.location.radius,
      movie: movie.title_uri,
      year: movie.release_date ? movie.release_date.substr(0,4) : null
    });
    req.session_data.location.inf = null;
    req.movie = movie;
    // setTimeout(function() { next() },1000);
    next();
  };

  app.param('location', function(req, res, next, location) {
    if(req.is_redirecting) return next();
    if(req.session_data.location.inf || req.param('movie')) return next();
    fill_location_seo(req, res, next);
  });

  app.param('movie', function(req, res, next, movie_uri) {
    if(req.is_redirecting) return next();
    if(req.session_data.location.inf) return next();
    fill_location_seo(req, res, next);
  });

  app.param('seo_movie', function(req, res, next, movie_uri) {
    if(req.is_redirecting || movie_uri != req.session_data.location.movie_url) return next();
    if(req.session_data.location.inf || !req.session_data.location.movies_radius) return next();
    fill_location_seo(req, res, next);
  });

  var fill_location_seo = function(req, res, next) {
    movy.tools.seo.location_seo(req, function(err, seo) {
      req.session_data.location.inf = seo;
      
      var radius_urls = {};
      for(var i in req.session_data.location.movies_radius) {
        if(i == 'venue')
          radius_urls[i] = movy.tools.seo.venue_uri({
            radius: i,
            venue: req.session_data.location.venue,
            locality: req.session_data.location.locality,
            state: req.session_data.location.state,
            postcode: req.session_data.location.postcode
          });
        else
          radius_urls[i] = movy.tools.seo.location_uri({
            radius: i,
            locality: req.session_data.location.locality,
            state: req.session_data.location.state,
            postcode: req.session_data.location.postcode
          });
      }
      req.session_data.location.radius_urls = radius_urls;

      next();
    });
  };
};