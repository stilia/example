define(['vent', 'collections/MenuMoviesCollection'],
  function (vent, MenuMovies) {
  "use strict";

  var MenuMovieView = Backbone.Marionette.ItemView.extend({

    tagName: 'a',

    template : function(serialized_model) {
      return _.template('<span class="menu_movie_title"><%=title %></span> <small>&nbsp; <% for(var i in sessions) { if(i > 20) { %> and more... <% break; } %><%=(i>0?",":"") %> <%=sessions[i] %><% } %></small>', serialized_model);
    },

    onRender : function() {
      this.$el.attr('href', '#');
    },

    events: {
      "click .menu_movie_title": "movieModalOpenClicked"
    },

    movieModalOpenClicked: function() {
      vent.currentMovieModal = this.model;
      vent.trigger("movy:router:movie:open", { movie_url: this.model.get("movie_url"), title_uri: this.model.get("title_uri"), from: "menu_movies" });
    }
  });

  var MenuMoviesView = Backbone.Marionette.CollectionView.extend({
    itemView: MenuMovieView,

    selected_date: null,
    is_fetching: false,

    behaviors: {
      Loading_spinner: { }
    },

    initialize: function(options) {
      var that = this;
      this.collection = new MenuMovies();
      this.triggerMethod("ViewInit", { load_model: this.collection });
      // var selected_date = new Date(this.$el.find("li.active a").attr('href').substr(1).replace(/_/g,'-'));
      // if(selected_date) {
      //   this.collection = new MenuMovies({ date: selected_date});
      //   this.collection_to_fetch = true;
      // }
      this.changeLocationTitle();
      // this.changeDateTitle(selected_date);
      this.listenTo(vent.location, "change:url", function() {
        that.collection_to_fetch = true;
        // if(that.selected_date) that.fetch_collection();
        // that.changeLocationTitle();
      });
      // this.collection.fetch_movies();
    },

    collectionEvents: {
      "sync": function() {
        // this.$el.addClass("in");
      }
    },

    fetch_collection: function() {
      // console.log(this.collection)
      if(this.collection_to_fetch) {
        this.is_fetching = true;
        var that = this;
        // this.$el.removeClass("in");
        that.collection.fetch_movies(function() {
          that.is_fetching = false;
          that.collection_to_fetch = false;
        });
      }
      // console.log(this.$el.find("li.active a").attr('href'))
    },

    change_date: function(date) {
      this.selected_date = new Date(date.replace(/_/g,'-'));
      if(this.selected_date) {
        this.collection.date = this.selected_date;
        this.collection_to_fetch = true;
        this.fetch_collection();
        this.changeDateTitle();
      }
    },

    changeDateTitle: function() {
      this.$(".menu_movies_date").html(vent.moment(this.selected_date).format("MMMM D, YYYY"));
    },

    changeLocationTitle: function() {
      if(vent.location) {
        this.$(".menu_movies_location").html(vent.location.get("locality"));
      }
    }
  });

  var MoviesDate = Backbone.Model.extend({
    idAttribute: "date",
    defaults: {
      week_day: null,
      week_day_num: null,
      date_formated: null,
      date_href: null
    },
    initialize: function() {
      var cur_date = vent.moment(this.get("date"));
      this.set({
        week_day: vent.moment.langData().weekdaysShort(cur_date),
        week_day_num: cur_date.isoWeekday(),
        date_formated: cur_date.format("MMM D"),
        date_href: cur_date.format("YYYY_MM_DD")
      })
    }
  });

  var MoviesDatesCollection = Backbone.Collection.extend({
    // url: "/data/movies/dates",
    baseURL: "/data/movies:location/dates",

    model: MoviesDate,
    is_fetching: false,
    need_to_fetch: true,

    initialize: function(options) {
      var that = this;
      this.listenTo(vent.location, "change:url", function() { that.need_to_fetch = true; });
    },

    comparator: function(el1, el2) {
      if(el1.get("date") > el2.get("date"))
        return 1;
      else if(el1.get("date") < el2.get("date"))
        return -1;
      else return 0;
    },

    fetch_dates: function() {
      if(!this.need_to_fetch) return;

      var that = this;
      this.is_fetching = true;
      this.url = this.baseURL;
      if(vent.location) this.url = this.baseURL.replace(':location', vent.location.get("url"));
      this.fetch({ success: function(collection, response, options) {
        that.is_fetching = false;
        that.need_to_fetch = false;
      }, error: function() {
        that.is_fetching = false;
        that.need_to_fetch = true;
      }});
    },
  });

  var MenuMoviesDateView = Backbone.Marionette.ItemView.extend({
    tagName: "li",
    template : function(serialized_model) {
      // if(!serialized_model.week_day || !serialized_model.cur_date) {
      //   var cur_date = vent.moment(serialized_model.date);
      //   serialized_model.week_day = vent.moment.langData().weekdaysShort(cur_date);
      //   serialized_model.date_formated = cur_date.format("MMM D");
      // }
      return _.template('<a href="#<%=date_href %>" data-toggle="tab"><small><%=week_day %></small><br><%=date_formated %></a>', serialized_model);
    },

    onRender: function() {
      if(this.model.get("week_day_num") == 6 || this.model.get("week_day_num") == 7)
        this.$el.addClass("weekend");
    },

    events: {
      "show.bs.tab": function(e) {
        this.trigger("date_clicked", this.model.get("date_href"));
      }
    }
  });

  var MenuMoviesDatesView = Backbone.Marionette.CollectionView.extend({
    itemView: MenuMoviesDateView,

    behaviors: {
      Loading_spinner: { }
    },

    initialize: function(options) {
      var that = this;
      this.movies_tab = options.movies_tab;
      this.triggerMethod("ViewInit", { load_model: this.collection });
      this.on("itemview:date_clicked", function(childView, date) {
        that.movies_tab.change_date(date);
      });
    },

    collectionEvents: {
      "sync": function() {
        var dates_length = this.collection.length;
        if(dates_length < 7) dates_length = 7;
        else if(dates_length > 15) dates_length = 15;
        dates_length = 'days' + dates_length;
        this.$el.removeClass("days7 days8 days9 days10 days11 days12 days13 days14 days15")
          .addClass(dates_length);
        if(this.$el.find(".active").length == 0 && this.children.length > 0) {
          this.children.findByIndex(0).$el.find("a").tab('show');
        }
      },
      "sort": function() {
      }
    },

    appendHtml: function(collectionView, itemView, index) {
// buffering - new marionette's feature but not quite working at the moment....
      // if (collectionView.isBuffering) {
      //   collectionView.elBuffer.appendChild(itemView.el);
      // }
      // else {
        if(index == 0)
          collectionView.$el.prepend(itemView.el);
        else
          collectionView.$el.find("li:eq(" + (index - 1) +")").after(itemView.el);
      // }
    },

    // appendBuffer: function(collectionView, buffer) {
    //   console.log(buffer)
    //   collectionView.$el.append(buffer);
    // }
  });

  return Backbone.Marionette.Layout.extend({

    initialize : function(options) {
      var that = this;
      var moviesDates = new MoviesDatesCollection();
      if(this.$el.length) {
        this.$el.on('show.bs.dropdown', function (e) {
          if((moviesDates.need_to_fetch || moviesDates.length == 0) && !moviesDates.is_fetching)
            moviesDates.fetch_dates();
          if(that.movies && that.movies.currentView &&
                (that.movies.currentView.collection_to_fetch || that.movies.currentView.length == 0)
                  && !that.movies.currentView.is_fetching)
            that.movies.currentView.fetch_collection();
        });
        // close on MovieModal open
        vent.on("movy:router:movie:open", function(options) {
          if(options.from == 'menu')
            that.$el.removeClass('open');
            // that.$el.dropdownHover('toggle');
          // $('[data-toggle="dropdown"]').parent().removeClass('open');
        });
      }
      var movies_el = this.$el.find("#menu_movies_tab");
      if(movies_el.length) {
        this.addRegion("movies", movies_el);
        this.movies.attachView(new MenuMoviesView({ el: movies_el }));
      }
      var dates_el = this.$el.find("ul.nav.nav-tabs");
      if(dates_el.length) {
        this.addRegion("dates", dates_el);
        this.dates.attachView(new MenuMoviesDatesView({ el: dates_el,
                movies_tab: this.movies.currentView,
                collection: moviesDates }));
      }
    },

    onClose: function() {
      this.$el.off();
      vent.off(null, null, this);
    }
  });
});
