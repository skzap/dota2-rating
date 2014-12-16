var request = require('request');
var async = require('async');
var trueskill = require("com.izaakschroeder.trueskill").create();
var colors = require('colors');
var MongoClient = require('mongodb').MongoClient;
var config = require('./config');

var matchSeqNumbers = [];
var players = [];
var maxMatchSeqNum = config.startAtMatchSeqNumber;

MongoClient.connect(config.connectionString, function(err, db) {
  if(err) throw err;

  players = db
    .collection('players')
    .find({})
    .toArray(function(err, docs) {
      console.log(docs.length+ ' players loaded. Starting calling API in 3 seconds...');
      setInterval(function() {
        parseGames();
      }, 3000);
  });

  function savePlayers(players) {
    for (var i = 0; i < players.length; i++) {
      if (players[i]._id != 'Hidden'){
        db.collection('players').update({_id: players[i]._id}, {$set: {
          rating: players[i].rating,
          games: players[i].games,
          wins: players[i].wins,
          losses: players[i].losses
        }}, {w:1}, function(err) {
          if (err) console.warn(err.message);
        });
      }
    }
  }

  function registerPlayer(apiPlayer, radiant_win, callback) {
    var account_id = apiPlayer.account_id;

    if(account_id==4294967295) {
      var player = { _id: 'Hidden' };
      player = addRank(player, wonned(apiPlayer, radiant_win));
      callback(err, player);
      return;
    }

    db.collection('players').find({_id: account_id}).toArray(function(err, items) {
      if(err) throw err;
      if (items.length > 0) {
        // existing player
        var player = items[0]
        player = addRank(player, wonned(apiPlayer, radiant_win));
        callback(err, player);
      }
      else
      {
        // new player
        var player = {
          _id: account_id,
          games: 0,
          wins: 0,
          losses: 0,
          rating: trueskill.createRating()
        }

        db.collection('players').insert(player, function(err, docs) {
          player = addRank(player, wonned(apiPlayer, radiant_win));
          callback(err, player);
        });
      }
    });
  }

  function addRank(player, wonned) {
    // in trueskill, the lower rank beats the higher rank
    if (wonned)
      player.rank = 0
    else
      player.rank = 1

    return player
  }

  function wonned(player, radiant_win) {
    if (player.player_slot > 4)
      return !radiant_win
    else
      return radiant_win
  }

  // https://wiki.teamfortress.com/wiki/WebAPI/GetMatchHistory
  function parseGames() {
    var url = 'https://api.steampowered.com/IDOTA2Match_570/GetMatchHistoryBySequenceNum/V001/?format=JSON&key='+config.key;
    url += '&min_players=10';
    url += '&matches_requested=100';

    if (maxMatchSeqNum != null)
      url = url+'&start_at_match_seq_num='+maxMatchSeqNum;

    console.log(url);
    request(url, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        body = JSON.parse(body);
        for (var i = 0; i < body.result.matches.length; i++) {
          var date = new Date(body.result.matches[i].start_time*1000);
          maxMatchSeqNum = body.result.matches[i].match_seq_num+1;
          if (matchSeqNumbers.indexOf(body.result.matches[i].match_seq_num) < 0
              && body.result.matches[i].lobby_type == 7
              && body.result.matches[i].game_mode == 22)
          {
            // new game found
            console.log(body.result.matches[i].match_seq_num + ' ' + date);
            var newGame = body.result.matches[i];
            matchSeqNumbers.push(newGame.match_seq_num);
            async.parallel([
              function(callback){
                registerPlayer(newGame.players[0], newGame.radiant_win, function(err, player) {
                  callback(null, player);
                })
              },
              function(callback){
                registerPlayer(newGame.players[1], newGame.radiant_win, function(err, player) {
                  callback(null, player);
                })
              },
              function(callback){
                registerPlayer(newGame.players[2], newGame.radiant_win, function(err, player) {
                  callback(null, player);
                })
              },
              function(callback){
                registerPlayer(newGame.players[3], newGame.radiant_win, function(err, player) {
                  callback(null, player);
                })
              },
              function(callback){
                registerPlayer(newGame.players[4], newGame.radiant_win, function(err, player) {
                  callback(null, player);
                })
              },
              function(callback){
                registerPlayer(newGame.players[5], newGame.radiant_win, function(err, player) {
                  callback(null, player);
                })
              },
              function(callback){
                registerPlayer(newGame.players[6], newGame.radiant_win, function(err, player) {
                  callback(null, player);
                })
              },
              function(callback){
                registerPlayer(newGame.players[7], newGame.radiant_win, function(err, player) {
                  callback(null, player);
                })
              },
              function(callback){
                registerPlayer(newGame.players[8], newGame.radiant_win, function(err, player) {
                  callback(null, player);
                })
              },
              function(callback){
                registerPlayer(newGame.players[9], newGame.radiant_win, function(err, player) {
                  callback(null, player);
                })
              }
            ], function(err, players){
              // This returns in array of 10 players. First 5 are radiant, last 5 are dire.
              var avgSkillWinners = {
                mu: 0,
                sigma: 0
              };
              var avgSkillLosers = {
                mu: 0,
                sigma: 0
              };
              var winners = 0;
              var losers = 0;

              for (var i = 0; i < players.length; i++) {
                if (players[i].rating != null) {
                  players[i].games++;
                  if (players[i].rank == 1) {
                    avgSkillWinners.mu += players[i].rating.mu;
                    avgSkillWinners.sigma += players[i].rating.sigma;
                    players[i].wins++;
                    winners++;
                  }
                  else
                  {
                    avgSkillLosers.mu += players[i].rating.mu;
                    avgSkillLosers.sigma += players[i].rating.sigma;
                    players[i].losses++;
                    losers++;
                  }
                }
              }
              if (winners == 0 || losers == 0) {
                console.log('One side has no identifiable player, game ignored.'.red);
                return;
              }
              avgSkillWinners.mu /= winners;
              avgSkillWinners.sigma /= winners;
              avgSkillLosers.mu /= losers;
              avgSkillLosers.sigma /= losers;
              for (var i = 0; i < players.length; i++) {
                if (players[i].rating == null) {
                  if (players[i].rank == 1) players[i].rating = avgSkillWinners;
                  else players[i].rating = avgSkillLosers;
                }
              }

              // Create the teams
              var teams = [
                [players[0].rating, players[1].rating, players[2].rating, players[3].rating, players[4].rating],
                [players[5].rating, players[6].rating, players[7].rating, players[8].rating, players[9].rating]
              ];
              // Get the score
              var score = [players[5].rank, players[0].rank];
              // Get the new ratings using the players
              newRatings = trueskill.update(teams, score);

            	//Update the player's rating
            	for (var i = 0; i < teams.length; ++i) {
            		players[i*5].rating = newRatings[i][0];
            		players[i*5+1].rating = newRatings[i][1];
                players[i*5+2].rating = newRatings[i][2];
                players[i*5+3].rating = newRatings[i][3];
                players[i*5+4].rating = newRatings[i][4];
            	}
              savePlayers(players);
            });
          }
        }
      }
    })
  }
});
