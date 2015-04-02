var google_places_api = (require(__dirname + '/../libs/google_places')()).google_places
    , exec = require('child_process').exec
    , google_api_keys = (require(__dirname + '/../config/db')(process.env.NODE_ENV)).google_api_keys
    ;

module.exports = function(sequelize) {

  var google_places_models = sequelize.import(__dirname + '/../db_models/google_places');
  var google_places = google_places_models.google_places;

  var place_search = function(place_name, address, suburb, place_id, callback, old_place_name) {
    if(place_id === 'none' || place_name.match(/Melbourne Cinémathèque/)) {
      callback('google place not found', { google_id: 'none' });
      return;
    }
    if(place_id) {
      google_places.find({ where: { id: place_id } }).success(function(place) { 
        if(place) {
          callback(null, place);
          return;
        }
        else {
          place_search(place_name, address, suburb, null, callback);
          return;
        }
      }).error(callback);
      return;
    }
    
    var place_name_strip = place_name.replace(/ \d{1,2} /, ' ');
    place_name_strip = place_name_strip.replace('La Premiere', '');
    place_name_strip = place_name_strip.replace('The Halfpipe at', '');
    var address_strip = address.replace(/ \(Cnr .+?\)/, '');
    address_strip = address_strip.replace('Melbourne Central Shopping Centre,', '');
console.log(place_name_strip + ' cinema in ' + address_strip + ' ' + suburb + ', Australia');
    var types = [ 'movie_theater' ];
    if(place_name_strip.match(/ACMI/)) types = [];
    google_places_api.textsearch({query: place_name_strip +
                                     ' cinema in ' + address_strip + ' ' + suburb + ', Australia',
                                  types: types
                          },
                         function(err, response) {
      if(response.status === 'ZERO_RESULTS') {
        if(place_name && address) {
          place_search('', address, suburb, null, callback, place_name);
          return;
        }
        else if(address && old_place_name) {
          place_search(old_place_name, '', suburb, null, callback);
          return;
        }
        callback('google place not found', { google_id: 'none' });
        return;       
      }
      if(response.results.length == 0) {
        console.log(response);
        // dshksh();
        callback('google place not found', null);
        return;
      }
      console.log(response.results)

      google_places_api.details({reference: response.results[0].reference}, function(err, response) {
        if(response.result.id) {
          console.log('Google place "' + response.result.name + ' (' + response.result.formatted_address + ')" for');
          console.log('"' + place_name + ' (' + address + ', ' + suburb + ')"');
          // if(place_name_strip.match(/ACMI/)) response.result.id = "3c26b8ad47f4ea2e94cc9799345c2478100549bd";
          google_places.findOrCreate({ google_id: response.result.id} ,
                                     { json: JSON.stringify(response.result) }
                                    ).success(function(place, created) {
            if(place.json !== JSON.stringify(response.result)) {
            // if(!place_name_strip.match(/ACMI/) && place.json !== JSON.stringify(response.result)) {
              place.json = JSON.stringify(response.result);
              place.save(['json']).success(function() { callback(null, place); })
                                  .error(function(err) { callback(err, place); });
              return;
            }
            callback(null, place);
            return;
          }).error(function(err) { callback(err, null); });
        }
        else {
          console.log(response);
          callback('google place not found', null);
          sdkjk();
        }
      });
    });
  };

  var address_search = function(address, suburb, callback) {
    var address_strip = address.replace(/ \(Cnr .+?\)/, '');
    // address_strip = address_strip.replace('Melbourne Central Shopping Centre,', '');

    var url = 'https://maps.googleapis.com/maps/api/geocode/json?key=' + google_api_keys[0]
            + '&address=' + encodeURIComponent(address_strip + ' ' + suburb + ', Australia')
            + '&sensor=false';
    var child = exec("`which bash` " + __dirname + '/../httpie/httpie_google_api_get.sh "' + url + '"', { timeout: 15000 },
      function (error, data, stderr) {
        if (error !== null || !data) {
          callback(error);
          return;
        }
        var google_json;
        try {
          google_json = JSON.parse(data);
        } catch(err) {
          callback(err, null);
          return;
        }
        if(google_json.error && google_json.error.message)
          return callback(google_json.error.message, null);
        else if(!google_json.results || google_json.results.length == 0)
          return callback('nothing found', null);

        setImmediate(function() { callback(null, google_json); });
    });
  };

  return {
      place_search: place_search
    , address_search: address_search
  };
};