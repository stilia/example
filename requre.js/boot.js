/* GOOD READS on proper require.js usage:
* http://stackoverflow.com/questions/10302724/calling-methods-in-requirejs-modules-from-html-elements-such-as-onclick-handlers
* http://www.codersgrid.com/2013/05/30/understand-require-js/
* http://www.requirejs.org/jqueryui-amd/example/webapp/scripts/main.js
* http://www.rojotek.com/blog/2013/08/29/how-to-use-any-javascript-library-with-requirejs-2-1/
* KEEP IN MIND, that I tried to convert/build AMD-versions of as many modules as possible, so not much shimming required at all
*/

/* ADDING A 3rd party LIBRARY (to be build inside libs.js)
* boot.js:
* 1. drop library to lib/ and add to paths {} section
* 2. for non-AMD libs add it to shim {}
*
* libs.js
* 1. add library call to define []
*/

define([], function() {
  require.config({
      //To get timely, correct error triggers in IE, force a define/shim exports check.
      // enforceDefine: true,
      // see http://requirejs.org/docs/api.html#ieloadfail for details in case IE behaves weirdly

      //to keep track of versions, local non-CDN will have ver.# in filenames, CDN modules won't
      //cant load jquery from CDN along with shims... :( all modules need to be AMD or define'd. This method didnt work:
      //http://aspnetperformance.com/post/How-to-use-the-RequireJS-optimizer-with-jQuery-loaded-from-CDN-and-plugins-as-shims.aspx
      paths : {
        libs        : 'libs.dev', // empty version of libs.js only for NODE_ENV=dev, build.js uses normal path
        // when bumping versions of libs NOT included in libs.js, just rename and update path below, no other changes needed
        jquery        : '../vendor/jquery',
        famous        : '../vendor/famous',
        underscore    : '../vendor/underscore',
        backbone      : '../vendor/backbone',
        jwplayer      : '../vendor/jwplayer',
        facebook      : ['//connect.facebook.net/en_US/sdk',
                        '../vendor/fb_sdk'],
  // http://www.benknowscode.com/2014/01/requirejs-optimized-realease-dynamic-shim-loading.html
  // "all the shimmed libraries need to be included in the built file."
        marionette : '../vendor/backbone.marionette-1.8.2.amd',
        'backbone.wreqr' : '../vendor/backbone.wreqr',
        'backbone.babysitter' : '../vendor/backbone.babysitter',
        text       : '../vendor/text',
        moment     : '../vendor/moment',
        typeahead  : '../vendor/typeahead',
        vent       : 'vent',
        models       : '../app.desktop/models',
        collections       : '../app.desktop/collections',
      templates_path  : '../templates/mobile'
    },
    shim : {
      //http://www.rojotek.com/blog/2013/08/29/how-to-use-any-javascript-library-with-requirejs-2-1/
      //"Typeahead depends on jquery being loaded first. Because the API is done via jquery, we dont need to worry about exporting anything."
      typeahead : {
        deps : ['jquery']
      },
     //  iscroll : {
     //   "exports": "IScroll"
     // },
      // magnificpopup: {
      //   deps: ['jquery']
      // },
      // mediaelement : {
      //   deps : ['jquery']
      // },
      facebook : {
        exports: 'FB'
      }
    }
  });

  require(['libs','famous', 'jwplayer'], function () {require(['app','routers/index','controllers/index'],function(app,Router,Controller){
    "use strict";

    if(!window.movy) window.movy = {};
    window.movy.start_app = function() {
      app.start();
      new Router({
        controller : Controller
      });
      window.movy.start_app = null;
    };
    if(window.movy.init_location) window.movy.start_app();
    document.getElementsByTagName( "html" )[0].className= "";
     $('#loaderContainer').fadeOut(500, function() { $('#loaderContainer').remove(); });
     //- http://mathiasbynens.be/notes/async-analytics-snippet#universal-analytics
     (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
      (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
      m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
    })(window,document,'script','//www.google-analytics.com/analytics.js','ga');

    ga('create','UA-51404669-1','movy.com.au');
    ga('require', 'displayfeatures');
    ga('send','pageview');

    jwplayer.key="S6qTK6vX6aI8MQwhOgqTuwxK+gZNynsuydm1cA==";

   });

    // $("a").click(function(e) { navigateLink(e, router); });

  });
});
