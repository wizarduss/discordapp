const Discord = require("discord.js");
const config = require("./config.js");
const request = require('request'); // require the request package - just so I don't have to use cURL.

const bot = new Discord.Client({autoReconnect: true});

let poll = [],
	userGames = [],
	voiceChannel = 0,
	textChannel = 0,
	queue = [], // create queue as an empty array. URLs will be pushed here as users add them.
    paused = false; // defines whether the playlist is paused. Without this, whenever the playlist is paused the bot thinks the song is finished and skips is. Not ideal.

///////////////////
// Commands List //
///////////////////

let commands = [
	{
		command: 'help',
		description: 'Displays command list.',
		params: [],
		execute: (m, p) => {
			let res = "***The following commands are currently available***\n";
			for(i=0;i<commands.length; i++){
				let c = commands[i];
				res += "***/"+c.command;
				for(j=0;j<c.params.length;j++){
					res += " <"+c.params[j]+">";
				}
				res += "*** "+c.description+"\n";
			}
			bot.sendMessage(m.channel, res);
		}
	},
	{
		command: 'pollcreate',
		description: 'Used to create a poll.',
		params: [
			'question'
		],
		execute: (m, p) => {
			p.shift();
			let q = p.join(" ");
			if(poll['question'] == undefined && q != ""){
				createPoll(m, q);
			}else if(q == ""){
				commandHelp(m, 'pollcreate');
			}else if(poll['question'] == q){
				bot.sendMessage(m.channel,"There is a poll with the same question running now.");
				commandHelp(m, 'pollscore');
				commandHelp(m, 'polladd');
			}else if(q != ""){
				bot.awaitResponse(m,"Are you sure you want to overwrite the current poll \'"+poll['question']+"\"? Please confirm by typing ***confirm***", function(e, r){
					if(r.content == "confirm"){
						createPoll(r, q)
					}else{
						bot.sendMessage(m.channel,"No confirmation received, please send in a new pollcreate request.");
					}
				});
			}
		}
	},
	{
		command: 'pollscore',
		description: 'Displays scores for current poll',
		params: [],
		execute: (m, p) => {
			if(poll['question'] !== undefined){
				sharePollScore(m, false);
			}else{
				noPoll(m);
			}
		}
	},
	{
		command: 'polladd',
		description: 'Adds an option to the active poll.',
		params: [
			'option'
		],
		execute: (m, p) => {
			if(poll['question'] !== undefined){
				p.shift();
				let o = p.join(" ");
				let res = "";
				if(poll[o] == undefined){
					poll[o] = 0;
					res = "The option \""+o+"\" has been added to the poll.";
				}else{
					res = "That option already exists in the current poll.";
				}
				bot.sendMessage(m.channel, res);
			}else{
				noPoll(m);
			}
		}
	},
	{
		command: 'pollclose',
		description: 'Closes the current poll and displays final results.',
		params: [],
		execute: (m, p) => {
			if(poll['question'] !== undefined){
				sharePollScore(m, true);
				poll = [];
			}else{
				noPoll(m);
			}
		}
	},
	{
		command: 'vote',
		description: 'Adds a vote in the current poll',
		params: [
			'option'
		],
		execute: (m, p) => {
			p.shift();
			let o = p.join(" ");
			if(poll[o] !== undefined){
				poll[o]++;
				tempPoll = "";
				sharePollScore(m,false);
			}else{
				bot.sendMessage(m.channel,"That vote is not an option in the current poll.");
			}
		}
	},
	{
		command: 'timeplayed',
		description: 'Returns your current time played (if in game)',
		params: [],
		execute: (m, p) => {
			let started = 0;
			let ended = Date.now();
			let game = "";
			let res = "";
			for(i=0;i<userGames.length; i++){
				let ug = userGames[i];
				if(ug.id != m.author.id){continue;}
				started = ug.started
				game = ug.name;
			}
			if(game != "" && started > 0){
				let x = (ended-started) / 1000;
				let seconds = Math.floor(x % 60);
				x /= 60;
				let minutes = Math.floor(x % 60);
				x /= 60;
				let hours = Math.floor(x);
				let session = hours+"h"+minutes+"m"+seconds+"s";
				res = "You have been playing "+game+" for: "+session;
			}else if(game != "" && started == 0){
				res = "No known start time."
			}else{
				res = "You're not playing a game.";
			}
			bot.reply(m,res);
		}
	},
	{
		command: 'yell',
		description: 'YELLS!',
		params: [
			'message'
		],
		execute: (m, p) => {
			let res = ("___***"+m.content.substring(6,m.content.length)+"!***___").toUpperCase();
			bot.sendMessage(m.channel,res);
		}
	},
	{
		command: 'ping',
		description: 'pong.',
		params: [],
		execute: (m, p) => {
			bot.awaitResponse(m,"I ain't listening to you!",function(){
				bot.reply(m.channel,"j/k, pong.");
			});
		}
	},
	{
		command: 'summon',
		description: 'Brings the bot to your voice channel',
		params: [],
		execute: (m, p) => {
			if (m.author.voiceChannel === null) {
				bot.reply(m, "you're not in a voice channel, you spoon.");
			}
			else {
				let voicechannel = m.author.voiceChannel;

				bot.joinVoiceChannel(voicechannel, (err, vc) => {
					bot.reply(m, `joining your voice channel.`);
				});
			}
	    }
	},

	//Gohome command, sends the bot back to its own voice channel - the ID for this channel is stored in the settings.json file.
	{
		command: 'gohome',
		description: 'Sends the bot back to its default voice channel',
		params: [],
		execute: (m, p) => {
			bot.joinVoiceChannel(voiceChannel, (err, vc) => {
				bot.sendMessage(textChannel, `Connecting to default Channel.`);
			});
		}
	},
    //Play command. Adds a song to the queue.
    {
		command: 'queue',
		description: 'Plays the requested video, or adds it to the queue.',
		params: ["Youtube URL"],
		execute: (m, p) => {
			if(m.author.voiceChannel === bot.channels.get("type","voice")){
				let videoId = getVideoId(p[1]);
				play(videoId, m);
			}else{
				bot.reply(m,"Unauthorized. You're not in the same voicechannel as the bot.")
			}
		}
    },

    //Stops playback and clears the whole queue.
    {
		command: 'stop',
		description: 'Stops the current song and clears the queue.',
		params: [],
		execute: (m, p) => {
			if(m.author.voiceChannel === bot.channels.get("type","voice")){
				bot.sendMessage(m.channel, "Stopping...");
				bot.voiceConnection.stopPlaying();
				queue = [];
			}else{
				bot.reply(m,"Unauthorized. You're not in the same voicechannel as the bot.")
			}
		}
    },

    //Pauses playback. Sets the pause variable to true so that the checkQueue function doesn't think the song has ended.
	{
		command: 'pause',
		description: 'Pauses the current playlist.',
		params: [],
		execute: (m, p) => {
			if(m.author.voiceChannel === bot.channels.get("type","voice")){
				//Check if playback is already paused.
				if (!paused) {
					bot.voiceConnection.pause();
					paused = true;
					bot.sendMessage(m.channel, "Playback has been paused.");
				}
				else {
					bot.sendMessage(m.channel, "Playback is already paused.");
				}
			}else{
				bot.reply(m,"Unauthorized. You're not in the same voicechannel as the bot.")
			}
		}
	},

    //Resumes the playlist, if it is paused.
    {
		command: 'resume',
		description: 'Resumes the playlist',
		params: [],
		execute: (m, p) => {
			if(m.author.voiceChannel === bot.channels.get("type","voice")){
				if (!paused) {
					bot.sendMessage(m.channel, "Playback isn't paused.");
				}
				else {
					bot.voiceConnection.resume();
					paused = false
					bot.sendMessage(m.channel, "Playback resumed.");
				}
			}else{
				bot.reply(m,"Unauthorized. You're not in the same voicechannel as the bot.")
			}
		}
    },

    //Skip the current song in the queue, play the next one.
    {
		command: 'skip',
		description: 'Skips the current song.',
		params: [],
		execute: (m, p) => {
			if(m.author.voiceChannel === bot.channels.get("type","voice")){
				playNext();
			}else{
				bot.reply(m,"Unauthorized. You're not in the same voicechannel as the bot.")
			}
		}
    },

    //Set the volume of the bot. 100% is loud. Very loud.
    {
		command: 'volume',
		description: 'Sets the volume of the bot between 0-200%',
		params: ['percentage'],
		execute: (m, p) => {
			if(m.author.voiceChannel === bot.channels.get("type","voice")){
				if (p[1] <= 200 && p[1] >= 0) {
					bot.voiceConnection.setVolume(p[1]/100); // volume is actually set between 0 and 2, but percentages are easier for users to understand.
					bot.sendMessage(m.channel, `Setting volume to ${p[1]}%`);
				}
				else {
					bot.sendMessage(m.channel, 'Volume must be set between 0% and 200%. '+p[1]+' is not a valid volume.');
				}
			}else{
				bot.reply(m,"Unauthorized. You're not in the same voicechannel as the bot.")
			}
		}
    }
]

///////////////////////
// Create bot events //
///////////////////////

bot.on('message', (m) => {
  if (m.author.id !== bot.user.id) { // <--- check that the bot didn't send the message. Very important. Mistakes were made.
    if (m.channel.topic !== undefined) { // <--- If channel topic is undefined, then this is a DM to the bot. We don't want to run commands in a DM. It breaks things.
      if (m.content[0] == "/") { // <--- Check if the first character of the message is a !.
        executeCommand(m, m.content.substring(1)); // If the first character is !, run executeCommand.
      }
    }
  }
});


bot.on("presence", (usrOld,usrNew) => {
	if(usrOld.game !== usrNew.game){
		if(usrNew.game !== null){
			gameData(usrNew,true);
		}else{
			gameData(usrOld);
		}
	}
});

bot.on("serverNewMember", (s,u) => {
	bot.sendMessage(s.defaultChannel,u.mention()+" Welcome to the server: "+s.name);
});

bot.once('ready', () => {
	textChannel = bot.channels.get("name","general").id;
	voiceChannel = bot.channels.get("name","General").id;
	bot.joinVoiceChannel(voiceChannel, (err, vc) => { //Join the default voice channel defined in the settings.json file
		bot.sendMessage(textChannel, "Bot "+bot.user.username+" connected. Type ***/help*** to view a list of commands."); //The bot will say this message every time it connects.
	});

	checkQueue();
});

bot.loginWithToken(config.testbot);

/////////////////////
// Other functions //
/////////////////////

function executeCommand(m, c) { // Called when the user types a command in chat
  let params = c.split(' '); // Split the command into individual words.
  let command = null; // used in the loop below

  for (let i = 0; i < commands.length; i++) { // Loop through commands array
    if (commands[i].command == params[0].toLowerCase()) { // Check if command matches the one typed
      command = commands[i]; // Set it to variable 'command'. Maybe break out of the loop. I'll sort that out later.
    }
  }

  if (command !== null) { // If no matching command was set in the loop, 'command' will still be null. Otherwise, run the command.
    if (params.length-1 < command.params.length) { // check that the command has enough parameters. Might move this check to the command itself, since some params are optional.
      bot.reply(m, 'Insufficient parameters'); // Reply to the user, tell them to add params.
      commandHelp(m, command.command); // Display help message for specific command.
    }
    else {
      command.execute(m, params); // Run the 'execute' function stored in the command object.
    }
  }else{
  	bot.sendMessage(m.channel,"Unknown command");
  }
}

function commandHelp(m, p) {
	let res = "";
	for(i=0;i<commands.length; i++){
		let c = commands[i];
		if(c.command != p){continue;}
		res += "***/"+c.command;
		for(j=0;j<c.params.length;j++){
			res += " <"+c.params[j]+">";
		}
		res += "*** "+c.description+"\n";
		break;
	}
	bot.sendMessage(m.channel,res);
}

function noPoll(m) {
	bot.sendMessage(m.channel,"No poll running.");
	commandHelp(m, 'pollcreate');
}

function sharePollScore(m,finalTally){
	let res = (!finalTally)?"Current":"Final";
	let winner = "";
	let winCount = 0;
	res += " votes for \"*"+poll['question']+"*\':"
	for(opt in poll){
		if(opt != "question"){
			res += "\n"+opt+": "+poll[opt];
			if(poll[opt] > 0 && winner == "" && winCount == 0){
				winner = opt;
				winCount = poll[opt];
			}else{
				if(poll[opt] > winCount){
					winner = opt;
					winCount = poll[opt];
				}else if(poll[opt] == winCount){
					winner = "";
				}
			}
		}
	}
	if(winner != ""){
		let s = (!finalTally)?" is currently winning":" has won with";
		let v = (winCount == 1)?" vote.":" votes.";
		res += "\n\n"+winner+s+" with "+poll[winner]+v;
	}else{
		res += (!finalTally)?"\nThere is currently a tie":"\nThe poll ended in a tie";
	}
	bot.sendMessage(m.channel,res);
}

function createPoll(m,p){
	poll = [];
	poll['question']=p;
	let optCount = 0;
	bot.awaitResponse(m,m.author.mention()+" How many options do you want (limit is 10)?",(e, m2) => {
		let regex = /\d+/g;
		let res = regex.exec(m2.content);
		optCount = (res[0] > 10)?10:res[0];
		let i = 0;
		askOption(m2, optCount, i);
	});
}

function askOption(m, o, i){
	bot.awaitResponse(m,"Option "+(i+1)+"?",(e,m2) => {
		poll[m2.content] = 0;
		i++;
		if(i<o){
			askOption(m2, o, i);
		}else if(i==o){
			pollCreated(m);
		}
	})
}

function pollCreated(m){
	let res = "The poll \"*"+poll['question']+"*\" has been created. Please be aware only one poll can run at the same time.\n The following options have been specified for the poll:";
	for(k in poll){
		if(k == "question"){continue;}
		res += "\n"+k;
	}
	bot.sendMessage(m.channel,res);
	commandHelp(m, 'vote');
}

function gameData(u,g){
	if(u.game !== null){
		if(g){
			let rec = {
				'id': u.id,
				'game': u.game.name,
				'started': Date.now()
			};
			userGames.push(rec);
		}else{
			let index = 0;
			let started = 0;
			let ended = Date.now();
			for(i=0;i<userGames.length; i++){
				let ug = userGames[i];
				if(ug.id != u.id){continue;}
				index = i;
				started = ug.started
			}
			userGames.splice(index,1);

			let x = (ended-started) / 1000;
			let seconds = Math.floor(x % 60);
			x /= 60;
			let minutes = Math.floor(x % 60);
			x /= 60;
			let hours = Math.floor(x);
			let session = hours+"h"+minutes+"m"+seconds+"s";
		}
	}
}

function play(id, m) { // called when a user requests a song to add to the queue
  let baseURL = "https://savedeo.com/download?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D"; // using savedeo to download and play audio files.

  request (baseURL + id, (err, res, body) => { // Append the youtube video ID to the base URL and request the page contents
    if (!err && res.statusCode == 200) { // check that no errors are thrown and the HTTP response is 200 (success)
      let cheerio = require('cheerio'), $ = cheerio.load(body); // load the response body with cheerio
      let videoTitle = $('title').text(); // set the video title to the title of the page.
      let audioUrl = $('#main div.clip table tbody tr th span.fa-music').first().parent().parent().find('td a').attr('href'); // horrible selector query to get the first URL to an audio file

      queue.push({ // push this file to the queue
        title: videoTitle, // this is all self-explanatory. Just storing data about the song.
        user: m.author.username,
        url: audioUrl
      });

      bot.sendMessage(m.channel, videoTitle+" has been added to the queue by "+m.author.username); // Tell everyone what song was added and by who.
    }
    else { // If 'err' exists, or response code is not 200.
      bot.sendMessage(m.channel, "There was an issue handling your request."); // generic error message
      console.log("Error requesting video: " + err); // log stuff
    }
  })
}

function checkQueue() { // called every 5 seconds.
  if (queue.length !== 0 && !bot.voiceConnection.playing && !paused) { // check that the queue is not empty, the bot is not playing something, and the playlist is not paused.
    playNext(); // play next song if above conditions are met
  }
  setTimeout(checkQueue, 5000); // run this function again in 5 seconds
}

function playNext() { // called when a user runs the !stop command, or when a song ends
  bot.voiceConnection.playFile(queue[0]['url'],function(a,e){console.log(a);console.log(e)}); // play the first song in the queue. This song is then removed, so the first song is the next song. Makes sense?
  bot.sendMessage(textChannel, 'Now playing "'+queue[0]['title']+'", requested by '+queue[0]['user']); // more messaging
  queue.splice(0,1); // Remove the song we just played from the queue, so queue[0] is always the next song.
}

function getVideoId(v){
    let searchToken = "?v=";
	  var i = v.indexOf(searchToken);

	  if(i == -1) {
		  searchToken = "&v=";
		  i = v.indexOf(searchToken);
	  }

	  if(i == -1) {
		  searchToken = "youtu.be/";
		  i = v.indexOf(searchToken);
	  }

	  if(i != -1) {
		  var substr = v.substring(i + searchToken.length);
		  var j = substr.indexOf("&");

		  if(j == -1) {
			  j = substr.indexOf("?");
		  }

		  if(j == -1) {
			  return substr;
		  } else {
			  return substr.substring(0,j);
		  }
	  }

	  return v;
  }