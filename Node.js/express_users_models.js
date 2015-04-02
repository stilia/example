var passport = require('passport')
  , FacebookTokenStrategy = require('passport-facebook-token').Strategy
  , async = require('async')
  , Sequelize = require("sequelize");

module.exports = function(app, movy) {

  var sequelize = app.get('sequelize');

  var to_web = function() {
    return {
      login: this.login,
      strategy: this.strategy,
      name: this.name,
      watchlist: this.watchlist ? this.watchlist.map(function(el) { return { title_uri: el.title_uri }; }) : null,
    }
  };

  var user_add = function(user_data, callback) {
    if(this.group !== 'admin') {
      callback({ error: "Permission denied"}, null);
    }
    user_data.password = 'blank';
    var user = User.build(user_data);
    var errs = user.validate();
    if(errs == null) {
      user.save().success(function() {
        callback(null, user.to_web())
      }).error(function(err) {
        if(err.code === 'ER_DUP_ENTRY')
          callback({ error: {validate: { name: ["Пользователь с таким именем уже существует"]} }}, null);
        else {
          callback(err, null);
        }
      });
    }
    else {
      callback({ error: {validate: errs }}, null);
    };
  };

  var manage_watch_list = function(action, title_uri, callback) {
    var user = this;
    if(action != 'add' && action != 'remove') return callback('dirty call');

    movy.db.movy_movies.find({ where: { title_uri: title_uri }}).success(function(movie) {
      if(!movie) return callback('movie search failed');
      if(action == 'add')
        user.addWatchlist(movie).success(function() {
          callback(null, movie.title_uri);
        }).error(function(err) { callback(err) });
      else
        user.removeWatchlist(movie).success(function() {
          callback(null, movie.title_uri);
        }).error(function(err) { callback(err) });
    }).error(function(err) { callback(err) });
  };

  var watch_list = function(location, callback) {
    var user = this;
    user.getWatchlist({
      attributes: [ "id", "title", "title_uri", "release_date" ],
    }).success(function(watchlist) {
      async.map(watchlist, function(movie, callback2) {
        movie.getSessions({
                where: ["date_stamp > UNIX_TIMESTAMP(CONVERT_TZ(NOW(), 'GMT', '" + location.tz + "')) AND \
                         date_stamp < UNIX_TIMESTAMP(CONVERT_TZ(NOW(), 'GMT', '" + location.tz + "')) + 7 * 24 * 3600 \
                          AND venue_id IN (" + location.venue_ids + ")"],
                order: "date_stamp",
                limit: "20"
              }, {raw: true}).success(function(sessions) {
          movie = movie.values;
          movie.movie_url = movy.tools.seo.movie_uri({
            radius: location.radius,
            movie: movie.title_uri,
            year: movie.release_date ? movie.release_date.substr(0,4) : null
          });
          movie.sessions = sessions.map(function(el2) {
              return { t: el2.date_stamp, v: el2.venue_id }; });
          delete movie.id;
          callback2(null, movie);
        }).error(callback2);
      }, function(err, data) {
        callback(null, data);
      });
    }).error(function(err) { callback(err); });
  };

  var User = sequelize.define('movy_users', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true
    },
    login: { type: Sequelize.STRING, allowNull: false
    },
    name: { type: Sequelize.STRING },
    gender: { type: Sequelize.ENUM, values: ['male', 'female'], defaultValue: 'male' },
    strategy: { type: Sequelize.ENUM, values: ['facebook'], allowNull: false
    }
  }, {
    instanceMethods: {
        to_web: to_web
      , user_add : user_add
      , manage_watch_list: manage_watch_list
      , watch_list: watch_list  
    },
  });
  var UserWatchlist = sequelize.define('movy_users_watchlist', {
    uid: { type: Sequelize.INTEGER, primaryKey: true
    },
    movie_id: { type: Sequelize.INTEGER, primaryKey: true
    }
  });

  var UserTicketsClick = sequelize.define('movy_users_tickets', {
    uid: { type: Sequelize.INTEGER
    },
    movie_id: { type: Sequelize.INTEGER
    },
    venue_id: { type: Sequelize.INTEGER
    },
    date_stamp: { type: Sequelize.BIGINT
    },
    booking_url: { type: Sequelize.STRING
    },
  });

  movy.db.movy_movies.hasMany(User, { as: "users", through: UserWatchlist, foreignKey: "movie_id"});
  User.hasMany(movy.db.movy_movies, { as: "watchlist", through: UserWatchlist, foreignKey: "uid"});

  UserWatchlist.sync();
  UserTicketsClick.sync();
  User.sync();

  function findByUserID(id, fn) {
    User.find({ where: { id: id },
      include: { model: movy.db.movy_movies, as: 'watchlist' }
    }).success(function(user) {
      if(user)
        fn(null, user);
      else
        fn(null, null);
    });
  }

  var ensureAuthenticated = function(req, res, next) {
    if(req.param("access_token")) {
      passport.authenticate('facebook-token')(req, res,
        function () {
          if(req.user) {
            next();                
          }
          else {
            req.logout();
            req.session.destroy();
            res.clearCookie('connect.sid');
            res.send(401);
          }
        });
      return;
    }

    if (req.isAuthenticated())
      return next();
    res.send(401);
  };

  passport.serializeUser(function(user, done) {
    done(null, user.id);
  });

  passport.deserializeUser(function(id, done) {
    findByUserID(id, function (err, user) {
      done(err, user);
    });
  });

  passport.use(new FacebookTokenStrategy(app.get('facebook_api'),
    function(accessToken, refreshToken, profile, done) {
      console.log(accessToken, refreshToken, profile)
      User.find({ where: { login: profile.username, strategy: 'facebook'},
        include: { model: movy.db.movy_movies, as: 'watchlist' }
      }).success(function(user) {
        if(user)
          return done(null, user)
        else {
          return User.create({ login: profile.username, strategy: 'facebook', name: profile.displayName, gender: profile.gender }).success(function(user) {
            if(user)
              return done(null, user)
            done(null, null);
          }).error(function(err) {
            done(err);
          });
        }
      }).error(function(err) {
        done(err);
      });
    }
  ));

  return {
      User: User
    , UserWatchlist: UserWatchlist
    , UserTicketsClick: UserTicketsClick
    , passport : passport
    , ensureAuthenticated : ensureAuthenticated
  };
};