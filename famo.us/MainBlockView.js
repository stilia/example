define(function(require, exports, module) {
  var vent          = require('vent');

  var View          = require('famous/core/View');
  var ViewSequence  = require('famous/core/ViewSequence');
  var Surface       = require('famous/core/Surface');
  var Transform     = require('famous/core/Transform');
  var StateModifier = require('famous/modifiers/StateModifier');

  var SnapTransition = require('famous/transitions/SnapTransition');
  var Transitionable = require('famous/transitions/Transitionable');
  Transitionable.registerMethod('snap', SnapTransition);

  var Timer = require('famous/utilities/Timer');
  var Utility = require('famous/utilities/Utility');
  var Timer = require('famous/utilities/Timer');
  var HeaderFooter = require('famous/views/HeaderFooterLayout');
  var ContainerSurface = require('famous/surfaces/ContainerSurface');
  var Scroller = require('famous/views/Scroller');

  var Draggable     = require('famous/modifiers/Draggable');

  var GenericSync     = require('famous/inputs/GenericSync');
  var MouseSync       = require('famous/inputs/MouseSync');
  var ScrollSync       = require('famous/inputs/ScrollSync');
  var TouchSync       = require('famous/inputs/TouchSync');
  GenericSync.register({'mouse': MouseSync, 'scroll': ScrollSync, 'touch': TouchSync});

  var MovieView = require('views/MainMovieView');
  var MovieModal = require('views/MainMovieModalView');
  var MovieModalMusicPlayer = require('views/MainMovieModalAlbumsView');
  var Movies = require('collections/MoviesCollection');
  var MovieViewTemplate = require('text!templates_path/MovieView.html');

  function MainBlockView() {
    View.apply(this, arguments);

    this.pageViewPos = 0;
    this.currentPage = 0;

    this.collections = {};
    this.collections_synced = {};

    this.movies = [];
    this.search_movies = [];
    this.search_query = '';

    this.isModalMusicPlayerShown = false;
    if(vent.location.get("movie"))
      this.isModalShown = true;
    else
      this.isModalShown = false;

    _initCollection.call(this);
    _createLayout.call(this);
    _setListeners.call(this);


  }

  MainBlockView.prototype = Object.create(View.prototype);
  MainBlockView.prototype.constructor = MainBlockView;
  // MainBlockView.prototype.getSize = getSize;

  MainBlockView.DEFAULT_OPTIONS = {
    blocks: [ "playing" ],
    headerSize: 44,
    title_block_height: 30,
    title_block_footer_height: 60,

    offset: 0,
    target: 0,
    dim: 100,
    angle: -70,
    dist: -300,
    shift: 50,
    count: 9,
    old_dim: null,
  };

  function _initCollection() {
    _.each(this.options.blocks, function(i, block) {
      this.collections[block] = new Movies({ block: block });
      this.collections[block].reset();
      this.collections[block].on("start_fetch", function() {
        scroll.call(this, "fade");
        _loader_show.call(this);
      }.bind(this));
      this.collections[block].on("sync", function() {
        _loader_hide.call(this);
        if(this.collections[block].length == 0) {
          this.collections_synced[block] = true;
          _render.call(this);
        }        
      }.bind(this));
      this.collections[block].on("sort_done", function() {
        _loader_hide.call(this);
        this.collections_synced[block] = true;
        _render.call(this);
      }.bind(this));

      this.collections[block].fetch_movies();      
    }.bind(this))
  };

  function _createLayout() {
    this.moviesBlock = new ContainerSurface({});
    this.moviesBlock.context.setPerspective(1000);

    this.moviesBlockModifier = new StateModifier({
      // size: [vent.screen_size[0], vent.screen_size[1]]
      origin: [ .5, .5 ],
      // align: [ .5, 1 ],
      // transform: Transform.translate(400, 0, 0)
    });
    this.add(this.moviesBlockModifier).add(this.moviesBlock);
 
    this.moviesBlockInfo = new Surface({
    });
    this.moviesBlockInfoModifier = new StateModifier({
      size: [undefined, this.options.title_block_height],
      origin: [ .5, 0 ],
      align: [ .5, 0 ],
      opacity: this.isModalShown ? 0 : 1,
      // transform: Transform.translate(400, 0, 0)
    });
    this.add(this.moviesBlockInfoModifier).add(this.moviesBlockInfo);
    this.moviesBlockFooterInfo = new Surface({
    });
    this.moviesBlockFooterInfoModifier = new StateModifier({
      size: [undefined, this.options.title_block_footer_height],
      origin: [ .5, 1 ],
      align: [ .5, 1 ],
      opacity: this.isModalShown ? 0 : 1,
      // transform: Transform.translate(400, 0, 0)
    });
    this.add(this.moviesBlockFooterInfoModifier).add(this.moviesBlockFooterInfo);

    this.moviesBlockLoading = new Surface({
      content: $(MovieViewTemplate).filter("#MovieBlockLoadingView").html()
    });
    this.moviesBlockLoadingModifier = new StateModifier({
      size: [undefined, 50],
      // opacity: this.isModalShown ? 0 : 1,
      // transform: Transform.translate(400, 0, 0)
      origin: [ 0, .5 ],
      align: [ 0, .5 ],
    });
    this.add(this.moviesBlockLoadingModifier).add(this.moviesBlockLoading);

    this.movieModal = new MovieModal();
    this.movieModalModifier = new StateModifier({
      // size: [vent.screen_size[0], vent.screen_size[1]],
      size: this.getSize(),
      origin: [ .5, 0 ],
      // align: [ .5, 0 ],
      opacity: 1,
      transform: this.isModalShown ? Transform.inFront : Transform.rotateY(Math.PI / 2)
    });
    this.moviesBlock.add(this.movieModalModifier).add(this.movieModal);
    // this.add(this.movieModalModifier).add(this.movieModal);

    this.movieModalMusicPlayer = new MovieModalMusicPlayer();
    this.movieModalMusicPlayerModifier = new StateModifier({
      // size: [vent.screen_size[0], vent.screen_size[1]],
      size: this.getSize(),
      origin: [ .5, 0 ],
      // align: [ .5, 0 ],
      opacity: 0,
      transform: Transform.translate(0, 0, -100)
    });
    this.moviesBlock.add(this.movieModalMusicPlayerModifier).add(this.movieModalMusicPlayer);


    _createContent.call(this);
  };

  function _createContent() {
    this.movieViews = [];
    this.movieViewsModifiers = [];
  };

  function _setListeners() {
    vent.on('movy:screen_resize', function() {
     this.moviesBlockModifier.setSize([vent.screen_size[0], vent.screen_size[1] - this.options.headerSize]);
     this.movieModalModifier.setSize(this.getSize());
     // _.each(this.options.blocks, function(i, block) {
     //   this.collections_synced[block] = true;
     // }.bind(this));
     _render.call(this, { search_movies: true })
    }.bind(this));

    vent.on("movy:router:movie:modal:close", function() {
      if(this.isModalMusicPlayerShown)
        return vent.trigger("movy:router:movie:modal:music:close");
      _hideMovieModal.apply(this);
    }.bind(this));

    vent.on("movy:router:movie:open", function() {
      _showMovieModal.apply(this);
    }.bind(this));

    vent.on("movy:router:movie:modal:music:close", function() {
      _hideMovieModalMusicPlayer.apply(this);
    }.bind(this));

    vent.on("movy:router:movie:modal:music:open", function() {
      _showMovieModalMusicPlayer.apply(this);
    }.bind(this));

    vent.on("movy:movie_search", function(data) {
      _filter_movies.call(this, data.query);
    }.bind(this));

    _handleSwipe.call(this);

    this.moviesBlock.on('movie_click', function(movie) {
      this.currentPage %= this.movies.length;
      _.each(this.movies, function(mov, i) {
        if(mov.id == movie.id) {
          if(i == this.currentPage) {
            vent.currentMovieModal = movie;
            if(i == 0)
              this.movieModal.prevMovie = this.movies[this.movies.length - 1];
            else
              this.movieModal.prevMovie = this.movies[i - 1];
            if(i == this.movies.length - 1)
              this.movieModal.nextMovie = this.movies[0];
            else
              this.movieModal.nextMovie = this.movies[i + 1];
            vent.trigger("movy:router:movie:open", { title_uri: movie.get("title_uri"), movie_url: movie.get("movie_url"), from: "movies_block" })
          }
          else
            _goToPage.apply(this, [ {}, parseInt(i) ]);
        }
      }.bind(this));
    }.bind(this))

    this.movieModal.on('goto_movie', function(movie) {
      _.each(this.movies, function(mov, i) {
        if(mov.id == movie.id) {
          this.currentPage = i;
          _manageCurrentPage.call(this);
          vent.currentMovieModal = movie;
            _set_next_prev.call(this, i);
          vent.trigger("movy:router:movie:open", { title_uri: movie.get("title_uri"), movie_url: movie.get("movie_url"), from: "movie_modal_swipe" })
          _goToPage.apply(this, [ {}, parseInt(i) ]);
        }
      }.bind(this));
    }.bind(this))
  };

  function _set_next_prev(i) {
    if(i == 0)
      this.movieModal.prevMovie = this.movies[this.movies.length - 1];
    else
      this.movieModal.prevMovie = this.movies[i - 1];
    if(i == this.movies.length - 1)
      this.movieModal.nextMovie = this.movies[0];
    else
      this.movieModal.nextMovie = this.movies[i + 1];
  }

  function _setScrollOptions() {
    if(!vent.screen_size)
      return;
    this.options.dim = Math.floor(vent.screen_size[0] / this.options.count * 1.7);
    // console.log(vent.screen_size, this.options.dim)
    if(this.movieViews.length > 0) {
      if(this.movieViews[0].getSize())
        this.options.shift = this.movieViews[0].getSize()[0] / 2;
    }
    // this.options.shift
  };

  function _loader_show() {
    if(!this.moviesBlockLoadingModifier) return;
    this.moviesBlockLoadingModifier.setOpacity(1);
    this.moviesBlockLoadingModifier.setTransform(Transform.translate(0, 0, 1));
  };

  function _loader_hide() {
    if(!this.moviesBlockLoadingModifier) return;
    this.moviesBlockLoadingModifier.setOpacity(0);
    this.moviesBlockLoadingModifier.setTransform(Transform.translate(0, 0, -1));
  };

  function _handleSwipe() {
    var sync = new GenericSync(
      ['mouse', 'touch', 'scroll'],
      { 
        direction : GenericSync.DIRECTION_X,
        stallTime: 150,
        // minimumEndSpeed: 1,
      }
    );

    this.moviesBlock.pipe(sync);

    sync.on('update', function(data) {
      // if(data.slip && data.velocity != 0 && Math.abs(data.velocity) < 0.3) {
      //   return _goToPage.apply(this, [data])
      // }
      if(this.isModalShown || this._isGoingToPage)
        return;
      // if(data.touch)
      //   this.pageViewPos -= 2 * data.delta;
      // else
        this.pageViewPos -= data.delta;
      scroll.apply(this)
      // this.moviesBlockModifier.setTransform(Transform.translate(this.pageViewPos, 0, 0));
    }.bind(this));

    sync.on('end', function(data) {
      if(this.isModalShown || this._isGoingToPage || (data.position == 0 && data.delta ==0))
        return;
      _goToPage.apply(this, [data])
    }.bind(this));
  }

  function _goToPage(data, page) {
    if(this._isGoingToPage)
      return;
    this._isGoingToPage = true;
    var nextPagePos;
    if(typeof page === 'number' && this.movies.length > 0) {
      this.pageViewPos = (this.movies.length * this.options.dim + this.pageViewPos) % (this.movies.length * this.options.dim);
      var currentPage = (this.movies.length + this.currentPage) % this.movies.length;
      this.currentPage = page;
      if(Math.abs(currentPage - this.currentPage) > this.movies.length / 2) {
        if(currentPage > this.currentPage)
          nextPagePos =  (this.currentPage + this.movies.length) * this.options.dim;
        else
          nextPagePos =  (this.currentPage - this.movies.length) * this.options.dim;
      }
      else
        nextPagePos =  this.currentPage * this.options.dim;
    }
    else if(data.touch && data.velocity != 0) {
      this.currentPage = Math.floor(-data.velocity * 2 ) + Math.floor((this.pageViewPos + this.options.dim / 2) / this.options.dim);
      nextPagePos =  this.currentPage * this.options.dim;
    }
    else {
      this.currentPage = Math.floor((this.pageViewPos + this.options.dim / 2) / this.options.dim);
      nextPagePos =  this.currentPage * this.options.dim;
    }
    _manageCurrentPage.call(this);

    // console.log(currentPage, this.currentPage, this.movies.length)
    // if(Math.abs(currentPage - this.currentPage) > this.movies.length / 2) {
    //   if(currentPage > this.currentPage)
    //     nextPagePos =  (this.currentPage + this.movies.length) * this.options.dim;
    //   else
    //     nextPagePos =  (this.currentPage - this.movies.length) * this.options.dim;
    // }

    var state = new Transitionable(this.pageViewPos);

    var timer_int = Timer.setInterval(function() {
      this.pageViewPos = state.get();
      if(Math.floor(this.pageViewPos) == nextPagePos || Math.ceil(this.pageViewPos) == nextPagePos) {
        this.pageViewPos = nextPagePos;
        this._isGoingToPage = false;
        Timer.clear(timer_int);
        state.reset(this.pageViewPos);
      }
      scroll.call(this);
      // console.log(state.get());
    }.bind(this), 25);
    var trans = {method : 'snap', dampingRatio : 0.999, period : 100};
    if(data.velocity != 0)
      trans.velocity = data.velocity;
    state.set(nextPagePos, trans, function() {
    // state.set(this.pageViewPos + 100, {duration : 500, curve : 'easeInOut'}, function() {
      this._isGoingToPage = false;
      Timer.clear(timer_int);
    }.bind(this));
  }

  function wrap(x) {
      return (x >= this.movies.length) ? (x % this.movies.length) : (x < 0) ? wrap.apply(this, [this.movies.length + (x % this.movies.length)]) : x;
  }

  function scroll(fade) {
    if(this.movies.length == 0)
      return;

    var x = this.pageViewPos;
    var i, half, delta, dir, tween, el, alignment,
      // dim = 600 * vent.screen_size[0] / (this.movieViews[0].getSize()[0] * this.movies.length),
      dim = this.options.dim,
      shift = this.options.shift,
      dist = this.options.dist,
      angle = this.options.angle,
      count = this.options.count
    ;


    offset = (typeof x === 'number') ? x : offset;
    center = Math.floor((offset + dim / 2) / dim);
    delta = offset - center * dim;
    dir = (delta < 0) ? 1 : -1;
    tween = -dir * delta * 2 / dim;

    // alignment = [ vent.screen_size[0] / 2, (vent.screen_size[1]) / 2, 0 ];
    alignment = [ 0, 0, 0 ];

    if(fade) {
      this.moviesBlockFooterInfoModifier.setOpacity(fade == 'fade in' ? 1 : 0, {period: 200 });
      this.moviesBlockInfoModifier.setOpacity(fade == 'fade in' ? 1 : 0, {period: 200 });
    }

    // center
    var el = this.movieViewsModifiers[wrap.apply(this, [center])];
    if(el && fade) {
      el.setOpacity(fade == 'fade in' ? 1 : 0, {period: 200 });
    }
    else if(el) {
      if(el.getOpacity() != 1)
        el.setOpacity(1, {period: 200 });
      el.setTransform(Transform.multiply(
        Transform.translate(-delta / 2 + dir * shift * tween, this.options.title_block_height, dist * tween),
        Transform.rotateY(dir * angle * tween * Math.PI / 180)
      ));

      if(vent.location.get("movie") && wrap.apply(this, [center]) == this.currentPage) {
        el.setTransform(Transform.multiply(
          Transform.rotateY(Math.PI / 2),
          Transform.scale(.8, .8, 1)
        ));
      }
    }

    half = (this.movies.length < count ? this.movies.length : count) >> 1;
    for (i = 1; i <= half; ++i) {
        // right side
        el = this.movieViewsModifiers[wrap.apply(this, [center + i])];
        if(el && fade) {
          el.setOpacity(fade == 'fade in' ? 1 : 0, {period: 200 });
        }
        else if(el) {
          el.setTransform(Transform.multiply(
            Transform.translate(alignment[0] + shift + (dim * i - delta) / 2, alignment[1] + this.options.title_block_height, alignment[2] + dist),
            Transform.rotateY(angle * Math.PI / 180)        
          ));
          if(el.getOpacity() == 0)
            el.setOpacity((i === half && delta < 0) ? 1 - tween : 1, {period: 200 });
          else
            el.setOpacity((i === half && delta < 0) ? 1 - tween : 1);
        }

        // left side
        el = this.movieViewsModifiers[wrap.apply(this, [center - i])];
        if(el && fade) {
          el.setOpacity(fade == 'fade in' ? 1 : 0, {period: 200 });
        }
        else if(el) {
          el.setTransform(Transform.multiply(
            Transform.translate(alignment[0] - shift + (-dim * i - delta) / 2, alignment[1] + this.options.title_block_height, alignment[2] + dist),
            Transform.rotateY(-angle * Math.PI / 180)        
          ));
          if(el.getOpacity() == 0)
            el.setOpacity((i === half && delta < 0) ? 1 - tween : 1, {period: 200 });
          else
            el.setOpacity((i === half && delta < 0) ? 1 - tween : 1);
        }
    }
    for( i = half + 1; i < Math.ceil(this.movies.length / 2); i++) {
      if(this.movieViewsModifiers[wrap.apply(this, [center + i])])
        this.movieViewsModifiers[wrap.apply(this, [center + i])].setTransform(Transform.translate(-10000, 0, 0));
      if(this.movieViewsModifiers[wrap.apply(this, [center - i])])
        this.movieViewsModifiers[wrap.apply(this, [center - i])].setTransform(Transform.translate(-10000, 0, 0));      
    }
  }

  function _showMovieModal() {
    if(this.isModalShown) return;
    this.isModalShown = true;
    this.movieViewsModifiers[this.currentPage].halt();
    // console.log(this.movieViewsModifiers)
      // this.movieViewsModifiers[this.currentPage].setTransform(Transform.rotateY( Math.PI / 2), { period: 500});
    scroll.call(this, "fade");

    this.movieViewsModifiers[this.currentPage].setTransform(Transform.multiply(
      Transform.rotateY(Math.PI / 2),
      // Transform.scale(this.movieModal.getSize()[1] / this.movieViews[this.currentPage].getSize()[1],
      //                 this.movieModal.getSize()[1] / this.movieViews[this.currentPage].getSize()[1], 1)
        Transform.scale(.8, .8, 1)
    ), { period: 500}, function() {
      this.movieModalModifier.setTransform(Transform.multiply(
        Transform.scale(
          1,
          $(".movie-block").height() / $(".movie-modal-block").height() * 0.8,
          1),
          // this.movieViews[this.currentPage].layout.getSize()[0] / this.movieModalModifier.getSize()[0],
          // this.movieViews[this.currentPage].layout.getSize()[1] / this.movieModalModifier.getSize()[1], 1),
        Transform.rotateY( - Math.PI / 2),
        Transform.inFront
      ));
      this.movieModalModifier.setTransform(Transform.multiply(
        Transform.rotateY( 0),
        // Transform.scale(1, 1, 1)
        Transform.inFront
        ), { period: 500});
      // this.movieModalModifier.setTransform(Transform.multiply(
      //   Transform.rotateY( - Math.PI / 2),
      //   Transform.scale(this.movieModal.getSize()[1] / this.movieViews[this.currentPage].getSize()[1],
      //                   this.movieModal.getSize()[1] / this.movieViews[this.currentPage].getSize()[1], 1)
      // ), { period: 500}, function() {      
    }.bind(this));
  };

  function _hideMovieModal() {
    if(!this.isModalShown) return;
    this.isModalShown = false;
    this.movieModalModifier.setTransform(Transform.multiply(
      Transform.scale(
        1,
        $(".movie-block").height() / $(".movie-modal-block").height() * 0.8,
        1),
      Transform.rotateY( - Math.PI / 2)
    ), { period: 500}, function() {
      scroll.call(this, "fade in");
      this.movieViewsModifiers[this.currentPage].setTransform(Transform.multiply(
        Transform.rotateY(0),
        Transform.translate(0, this.options.title_block_height, 0),
        Transform.scale(1, 1, 1)
        ), { period: 500}, function() {
      }.bind(this));
    }.bind(this));
  };

  function _showMovieModalMusicPlayer() {
    if(!this.isModalShown || this.isModalMusicPlayerShown) return;
    this.isModalMusicPlayerShown = true;
    this.movieModalMusicPlayerModifier.setSize(vent.screen_size);
    this.movieModalMusicPlayerModifier.setTransform(Transform.translate(0, 0, 1));      
    // this.posterFullModifier.setTransform(Transform.translate(0, 0, 0));
    this.movieModalMusicPlayerModifier.setOpacity(1, { period: 400 });
  };

  function _hideMovieModalMusicPlayer() {
    if(!this.isModalMusicPlayerShown) return;
    this.isModalMusicPlayerShown = false;
    this.movieModalMusicPlayerModifier.setOpacity(0, { period: 400 }, function() {
      this.movieModalMusicPlayerModifier.setSize([0, 0]);
      // $(this.posterFull._currTarget).html("");
      // this.posterFullModifier.setTransform(Transform.translate(0, 0, 0));
    }.bind(this));
  };

  function _filter_movies(query) {
    var all_movies = [];
    var search_movies = [];
    this.search_query = query;
    if(!query) {
      this.search_movies = [];
      return _render.call(this, { search_movies: true });
    }

    _.each(this.options.blocks, function(i, block) {
      this.collections[block].each(function(movie) {
        all_movies.push(movie);
      }.bind(this));
    }.bind(this));

    var finish_search = function() {
      if(_.isEqual(_.pluck(search_movies, 'id'), _.pluck(this.search_movies, 'id')))
        return;
      if(search_movies.length == 0)
        this.search_movies = all_movies
      else
        this.search_movies = search_movies;
      return _render.call(this, { search_movies: true });
    }.bind(this);

    search_movies = _.union(search_movies, _.filter(all_movies, function(movie) {
      return (new RegExp('^' + query, "i")).test(movie.get('title'));
    }));
    if(search_movies.length >= 3)
      return finish_search.call(this);

    search_movies = _.union(search_movies, _.filter(all_movies, function(movie) {
      return (new RegExp('[^a-z0-9]' + query, "i")).test(movie.get('title'));
    }));

    if(search_movies.length >= 3)
      return finish_search.call(this);

    var encoded_query = encodeURIComponent(query);

    $.get('/data/movies/search?query=' + encoded_query).done(function(data) {
      if(this.search_query != query) return;
      data.splice(5);
      _.each(data, function(movie, i) {
        var movie_model = new Backbone.Model();
        movie_model.set(movie);
        movie_model.set({ loc_url: vent.location.get('url') + '/' + movie_model.get("movie_url"),
                          genres: _.map(movie_model.get("genres").split(/\, /), function(genre) {
                            return { genre: genre};
                          }),
                          imdb_rating: '-',
                          rt_rating: null
                        });
        if(!_.find(search_movies, function(item) {
          return item.get('title_uri') == movie_model.get("title_uri");
        }))
          search_movies.push(movie_model)
      }.bind(this));
      // _.each(data, function(el) {
      //   var str;
      //   if(el.locality == 'My location') {
      //     str = el.locality;
      //     el.class = 'find-my-location';
      //     el.url = 'My location';
      //   }
      //   else {
      //     el.class = 'locations-search-select';
      //     str = el.locality.replace(/(\w+)/g, function(txt) {
      //           return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
      //         }) + ' ' + el.state + ' ' + el.postcode;
      //   }
      //   $(".locations-search-results").append($("<li class='item " + el.class + "' data-value='" + el.url + "'>" + str + "</li>"))
        return finish_search.call(this);
      // }.bind(this));
    }.bind(this)).fail(function(err) {
      console.log(err);
      return _render.call(this, { search_movies: true });
    });


    // return _render.call(this, { search_movies: true });
  };

  function _manageCurrentPage() {
    if(!this.movieViews[this.currentPage % this.movies.length]) return;
    var serialized_model = this.movies[this.currentPage % this.movies.length].toJSON();
    if(serialized_model.rt_rating > 0) serialized_model.rt_rating += '%';
    else serialized_model.rt_rating = null;
    serialized_model.genre = '';
    if(serialized_model.genres[0]) serialized_model.genre = serialized_model.genres[0].genre.toLowerCase();
    if(serialized_model.sessions_list && serialized_model.sessions_now) {
      var cur_mom = serialized_model.sessions_now;
      var cur_date = vent.moment.unix(_.sortBy(serialized_model.sessions_list.split(','), function(t) {
        if(cur_mom > t) return 1000000000;
        return t - cur_mom;
      })[0]).utc();
      serialized_model.next_session = cur_date.from(vent.moment.unix(cur_mom));
    }
    else
      serialized_model.next_session = null;
    this.moviesBlockInfo.setContent(_.template($(MovieViewTemplate).filter("#MovieBlockTitleView").html(), serialized_model));
    this.moviesBlockFooterInfo.setContent(_.template($(MovieViewTemplate).filter("#MovieBlockFooterView").html(), serialized_model));
    // $(".movie-block").removeClass("current-page");
    // $(this.movieViews[this.currentPage % this.movies.length].layout._currTarget).find(".movie-block").addClass("current-page");
    // $(".movie-block").html($(this.movieViews[this.currentPage % this.movies.length].layout._currTarget).find(".movie-block-data"));
  };

  function _render(options) {
    options = options || {};
    this.movies = [];
    if(options.search_movies && this.search_movies.length > 0) {
      this.movies = this.search_movies;
    }
    else {
      var all_synced = true;
      _.each(this.options.blocks, function(i, block) {
        if(!this.collections_synced[block])
          all_synced = false;
        this.collections[block].each(function(movie) {
          // if(this.movies.length > 50) return;
          // if(movie.get("poster") != "/img/no_poster.jpg") with_poster++;
          this.movies.push(movie);
          this.movies[ this.movies.length - 1].block = block;
        }.bind(this));
      }.bind(this));

      if(this.movies.length > 50) {
        var mov_sorted = _.sortBy(this.movies, function(movie) {
          var value = 0;
          if(movie.get("poster") != "/img/no_poster.jpg") value += 1000;
          return - (value + movie.get("sessions"));
        });
        mov_sorted.splice(50);
        this.movies = _.filter(this.movies, function(movie) {
          return _.find(mov_sorted, function(mov) { return mov.id == movie.id });
        });
      }
      if(!all_synced && !options.search_movies) return;

      _.each(this.options.blocks, function(i, block) {
        this.collections_synced[block] = false;
      }.bind(this));
    }

    _.each(this.movies, function(movie, i) {
      if(this.movieViews.length <= i) {
        var movieView = new MovieView({ containerSize: vent.screen_size });
        this.movieViews.push(movieView);
        this.movieViewsModifiers.push(new StateModifier({
          transform: Transform.translate(200*i, 0, 0),
          origin: [ .5, .5 ],
          // origin: [ .5, 0 ],
          align: [ .5, .5 ],
          // size: [undefined, 10]
        }));
        // if(i<20)
          this.moviesBlock.add(this.movieViewsModifiers[i]).add(movieView);
        movieView.pipe(this.moviesBlock)
        this.moviesBlock.eventHandler.subscribe(movieView)
      }
      this.movieViews[i].setContent(movie, vent.screen_size);
      if(vent.location.get("movie") == movie.id) {
        this.currentPage = i;
        _set_next_prev.call(this, i);
        _manageCurrentPage.call(this);
        this.movieModal.managePrevNext();
      }
    }.bind(this));

    if(options.search_movies && options.search_movies.length > 0) {
      this.currentPage = 0;
    }
    // for(var i = this.movies.length; i < this.movieViewsModifiers.length; i++) {
    for(var i = 0; i < this.movieViewsModifiers.length; i++) {
      this.movieViewsModifiers[i].setOpacity(0);
      this.movieViewsModifiers[i].setTransform(Transform.translate(200*i, 0, -1000));
    }

    _setScrollOptions.apply(this)
    if(this.options.old_dim) {
      this.pageViewPos *= this.options.old_dim / this.options.dim;
      this.options.old_dim = this.options.dim;
    }

    if(!this.isModalShown) {
      this.moviesBlockFooterInfoModifier.setOpacity(1, {period: 200 });
      this.moviesBlockInfoModifier.setOpacity(1, {period: 200 });
    }


    _manageCurrentPage.call(this);
    _goToPage.apply(this, [{}, this.currentPage])
  };

  module.exports = MainBlockView;
});
