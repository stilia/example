define(['vent'], function(vent) {

  var MovieSession = Backbone.Model.extend({
    idAttribute: "t",
    defaults: {
      time_formated: null,
      p: 0,
      u: false
    },
    initialize: function() {
      if(this.get("t")) {
        var cur_date = vent.moment.unix(this.get("t")).utc();
        this.set({
          time_formated: cur_date.minutes() == '0' ? cur_date.format("ha") : cur_date.format("h:mma")
        });
      }
      if(this.get("p"))
        this.set({ "u": false});
    }
  });

  var MovieSessionsCollection = Backbone.Collection.extend({

    model: MovieSession,

    initialize: function(options) {
    },

    comparator: function(el1, el2) {
      if(el1.get("t") > el2.get("t"))
        return 1;
      else if(el1.get("t") < el2.get("t"))
        return -1;
      else return 0;
    }
  });

  var MovieVenueSessions = Backbone.Model.extend({
    idAttribute: "v",
    defaults: {
      s: null,
      venue_name: null,
      venue_address: null,
      radius: 0
    },
    initialize: function() {
      this.sessions = new MovieSessionsCollection();
      this.sessions.reset(this.get("s"));
      var venue = vent.location.venues.get(this.get("v"));
      if(venue) {
        this.set({
          venue_name: venue.get("name"),
          venue_address: venue.get("address_full"),
          radius: venue.get("radius"),
          venue_url: venue.get("url"),
        });
      }
    }
  });

  var MovieVenuesSessionsCollection = Backbone.Collection.extend({

    baseMovie: null,

    model: MovieVenueSessions,
    is_fetching: false,
    need_to_fetch: false,

    initialize: function(options) {
      var that = this;
      this.baseMovie = options.baseMovie;
      this.listenTo(vent.location, "change:url", function() { that.need_to_fetch = true; });
    },

    comparator: function(el1, el2) {
      if(el1.get("radius") > el2.get("radius"))
        return 1;
      else if(el1.get("radius") < el2.get("radius"))
        return -1;
      // if(el1.get("venue_name") > el2.get("venue_name"))
      //   return 1;
      // else if(el1.get("venue_name") < el2.get("venue_name"))
      //   return -1;
      else return 0;
    },

    fetch_sessions: function(callback) {
      if(!this.need_to_fetch || !this.baseMovie) return;

      var that = this;
      this.is_fetching = true;
      that.trigger("request");
      this.baseMovie.getSessionTimes(this.date, function(times) {
        that.reset(times);
        that.trigger("sync");
        that.is_fetching = false;
        that.need_to_fetch = false;
        callback();
      });
    },
  });

  var MovieDate = Backbone.Model.extend({
    idAttribute: "date",
    defaults: {
      week_day: null,
      week_day_num: null,
      date_formated: null,
      date_formated_full: null,
      date_href: null,
      is_special: false,
      q: 0
    },
    initialize: function() {
      var cur_date = vent.moment(this.get("date"));
      var is_today = vent.moment(cur_date).isSame(vent.moment(), 'day');
      var is_tomorrow = vent.moment(cur_date).subtract("days", 1).isSame(vent.moment(), 'day');

      this.set({
        week_day: vent.moment.langData().weekdaysShort(cur_date),
        week_day_num: cur_date.isoWeekday(),
        date_formated: is_today ? 'Today' : (is_tomorrow ? 'Tomorrow' : cur_date.format("MMMM D")),
        date_formated_full: is_today ? 'Today, ' + cur_date.format("MMMM D") :
                           (is_tomorrow ? 'Tomorrow, ' + cur_date.format("MMMM D") : cur_date.format("MMMM D")),
        date_href: cur_date.format("YYYY_MM_DD"),
        is_special: is_today || is_tomorrow
      })
    }
  });

  var MovieDatesCollection = Backbone.Collection.extend({

    baseMovie: null,

    model: MovieDate,
    is_fetching: false,
    need_to_fetch: false,

    initialize: function(options) {
      var that = this;
      this.baseMovie = options.baseMovie;
      this.venues_near = null;
      this.listenTo(vent.location, "change:url", function() {
        if(!that.need_to_fetch && that.baseMovie && that.baseMovie.id && that.baseMovie.get("title")) {
          that.need_to_fetch = true;
          that.fetch_dates();
        }
      });
      // this.listenTo(this.baseMovie, "change:title_uri", function() {
      //   if(!that.need_to_fetch && that.baseMovie && that.baseMovie.id && that.baseMovie.get("title")) {
      //     that.need_to_fetch = true;
      //     that.fetch_dates();
      //   }
      // });
      this.listenTo(this.baseMovie, "change:dates", function() {
        if(!that.need_to_fetch && that.baseMovie && that.baseMovie.id && that.baseMovie.get("title")) {
          that.need_to_fetch = true;
          that.fetch_dates();
        }
      });
    },

    comparator: function(el1, el2) {
      if(el1.get("date") > el2.get("date"))
        return 1;
      else if(el1.get("date") < el2.get("date"))
        return -1;
      else return 0;
    },

    fetch_dates: function() {
      if(!this.need_to_fetch || !this.baseMovie || !this.baseMovie.id) return;

      var that = this;
      this.is_fetching = true;
      this.trigger("loading")
      this.baseMovie.getSessionDates(function(dates) {
        that.venues_near = null;
        if(dates.dates && dates.dates.length > 0) {
          that.set(dates.dates);
        }
        else if(dates.venues_near && dates.venues_near.length > 0) {
          that.venues_near = dates.venues_near;
          that.reset();
        }
        else
          that.reset();
        // that.sort();
        that.is_fetching = false;
        that.need_to_fetch = false;
        that.trigger("loaded")
      });
    },
  });

  var Track = Backbone.Model.extend({
    defaults: {
    }
  });

  var Tracks = Backbone.Collection.extend({
    model: Track,
  });

  var Album = Backbone.Model.extend({
    defaults: {
      collectionPrice: 0
    },
    initialize: function(options) {
      if(!options.album) return;
      this.set(options.album[0]);
      options.album.splice(0, 1);
      this.unset("album");
      this.set({ tracks: new Tracks() });
      for(var i in options.album) {
        this.get("tracks").add(options.album[i]);
      }      
    },
  });

  var AlbumsList = Backbone.Collection.extend({
    model: Album,
    initialize: function() {
    },
    parse_itunes: function(json) {
      this.reset();
      for(var i in json) {
        var album = json[i];
        this.add({ album: album });        
      }
    }
  });

  var Trailer = Backbone.Model.extend({
    defaults: {
      t: null,
      i: null,
      is: null
    }
  });

  var TrailersList = Backbone.Collection.extend({
    model: Trailer,
    initialize: function() {
    }
  });

  var Poster = Backbone.Model.extend({
    defaults: {
      t: null,
      i: null,
      is: null
    }
  });

  var PostersList = Backbone.Collection.extend({
    model: Poster,
    initialize: function() {
    }
  });

  var Movie = Backbone.Model.extend({
    urlRoot: '/data/movies',
    idAttribute: "title_uri",

    trailers: [],
    posters: [],
    albums: [],

    initialize: function() {
      this.trailers = new TrailersList();
      this.posters = new PostersList();
      this.albums = new AlbumsList();
      this.location_changed_dates = false;
      this.location_changed_sessions = false;
      this.urlRoot = '/data/movies' + vent.location.get("url") + '/movie-';
      this.set("loc_url", vent.location.get("url"));
      var that = this;
      this.listenTo(vent.location, "change:movie change:url", function() {
        that.location_changed_dates = true;
        that.location_changed_sessions = true;
        this.urlRoot = '/data/movies' + vent.location.get("url") + '/movie-';
        this.set("loc_url", vent.location.get("url"));
      }, this);
      this.on("remove", this.unlink, this);
    },

    defaults: {
      // "name": null
      rt_rating: null,
      year: null,
      genres_list: null,
      genres: [],
      title: null,
      classification: null,
      about: null,
      title_uri: null,
      movie_url: null,
      loc_url: null,
      posters: [],
      trailers: [],
      albums: [],
      trailer: false,
      prev_movie: null,
      next_movie: null,
      prev_movie_uri: null,
      next_movie_uri: null,
      duration: null,
      imdb_rating: null,
      share_url: null,
      watchlist: false,
      poster: null,
      poster_retina: null,
    },

    unlink: function() {
      this.off(null, null, this);
      this.stopListening();
    },

    fetch_movie: function(callback) {
      this.url = this.urlRoot + this.id;
      this.location_changed_dates = false;
      this.location_changed_sessions = false;
      this.set({ dates: null, sessions: null });
      this.fetch({ success: function(model, response, options) {
        if(model.get("genres") && model.get("genres").length > 0)
          model.set("genres_list", model.get("genres").map(function(el) { return el.genre.toLowerCase(); }).join(', '));
        if(model.get("release_date"))
          model.set("year", vent.moment(model.get("release_date")).year());
        else
          model.set("year", null);
        var duration = model.get("duration");
        if(duration)
          model.set("duration", (parseInt(duration / 60) > 0 ? parseInt(duration / 60) + 'hr ' : '') +
                    duration % 60 + 'min' );
        var cinemas_dates = model.get("cinemas_dates");
        if(cinemas_dates && cinemas_dates.start)
          if(cinemas_dates.start == cinemas_dates.ending)
            model.set("cinemas_dates", {
              only: vent.moment(cinemas_dates.start).format("D MMM")
            } );
          else
            model.set("cinemas_dates", {
                start: vent.moment(cinemas_dates.start).format("D MMM")
              , ending: vent.moment(cinemas_dates.ending).format("D MMM")
            } );
        if(model.get("last_session"))
          model.set("last_session", vent.moment(model.get("last_session")).format("MMMM Do, YYYY"));
        model.set("trailer", "false");
        if(model.get("trailers")) {
          model.trailers.reset(model.get("trailers"));
          if(model.get("trailers").length > 0)
            model.set("trailer", "true");
        }
        if(model.get("itunes")) {
          model.albums.parse_itunes(model.get("itunes"));
        }
        model.posters.reset(model.get("posters"));
        model.set("share_url", vent.website_url + model.get("movie_share_url"));
        model.set("loc_url", vent.location.get("url"));
        if(vent.user && vent.user.watchlist && vent.user.watchlist.get(model.get('title_uri')))
          model.set({ watchlist: true });
        else
          model.set({ watchlist: false });
        callback();
      }, error: function(err) {
        callback();
      }});
    },

    getSessionDates: function(callback) {
      if(!this.location_changed_dates && this.get("dates"))
        callback({ dates: this.get("dates"), venues_near: this.get("venues_near") });
      else {
        this.location_changed_dates = false;
        var url = '/data/movies' + vent.location.get("url") + '/dates-for-movie-' + this.id;
        $.get(url, function(data) {
          if(data && data.dates && data.dates.length > 0)
            callback({ dates: data.dates });
          else if(data && data.venues_near && data.venues_near.length > 0)
            callback({ dates: [], venues_near: data.venues_near });
          else
            callback([]);
        });
      }
    },

    getSessionTimes: function(date, callback) {
      if(!this.location_changed_sessions && date == this.get("sessions_date") && this.get("sessions"))
        callback(this.get("sessions"));
      else {
        this.location_changed_sessions = false;
        var url = '/data/movies' + vent.location.get("url") + '/sessions-for-movie-' + this.id
                  + '/' + vent.moment(date).format("YYYY_MM_DD");
        var that = this;
        $.get(url, function(data) {
          if(data && data.sessions) {
            that.set({ sessions: data.sessions });
            that.set({ sessions_date: data.sessions_date });
            callback(data.sessions);
          }
          else {
            that.set({ sessions: [] });
            that.set({ sessions_date: null });
            callback([]);
          }
        });
      }
    }
  });

  return {
    Movie: Movie,
    MovieDatesCollection: MovieDatesCollection,
    MovieVenuesSessionsCollection: MovieVenuesSessionsCollection,
  }
});