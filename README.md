# dota2-rating

Attempting to rate publicly exposed dota2 players by parsing game results from the steam API

## Requirements
+ npm
+ mongodb
+ steam api key

## How to run
Install dependencies

    npm install

Edit config file to put your API key and database connection string

    config.key = 'YOUR_STEAM_API_KEY';
    config.connectionString = 'mongodb://127.0.0.1:27017/dota2';

Run it

    node app

And the players collection in the database will build. Rating algorithm used is [TrueSkill](https://github.com/izaakschroeder/trueskill)

## Querying the database
### Top 50
    db.players.find().sort({'rating.mu': -1}).limit(50)
### Average Rating
    db.players.aggregate([{$group:{_id:null,total:{$avg: '$rating.mu'}}}])
