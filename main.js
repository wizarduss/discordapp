let Discord = require("discord.js");
let config = require("./config.js");

const bot = new Discord.Client({autoReconnect: true});

let poll = [];
let tempPoll = "";

let userGames = [];

let commands = [
	{
		command: 'help',
		description: 'Displays command list.',
		inHelp: true,
		params: [],
		execute: (m, p) => {
			let res = "***The following commands are currently available***\n";
			for(i=0;i<commands.length; i++){
				let c = commands[i];
				if(!c.inHelp){continue;}
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
		inHelp: true,
		params: [
			'question'
		],
		execute: (m, p) => {
			let q = p.substring(12,p.length);
			if(poll['question'] == undefined && q != ""){
				createPoll(m, q);
			}else if(q == ""){
				commandHelp(m, 'pollcreate');
			}else if(poll['question'] == q){
				bot.sendMessage(m.channel,"There is a poll with the same question running now.");
				commandHelp(m, 'pollscore');
				commandHelp(m, 'polladd');
			}else{
				tempPoll = m.content;
				bot.sendMessage(m.channel,"Are you sure you want to overwrite the current poll \'"+poll['question']+"\"? Confirmation is required before new vote is cast.");
				commandHelp(m, 'polloverwrite');
			}
		}
	},
	{
		command: 'pollscore',
		description: 'Displays scores for current poll',
		inHelp: true,
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
		inHelp: true,
		params: [
			'option'
		],
		execute: (m, p) => {
			if(poll['question'] !== undefined){
				let o = p.substring(9,p.length);
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
		inHelp: true,
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
		command: 'polloverwrite',
		description: 'Confirms creating of new poll subsequently closing the current poll.',
		inHelp: false,
		params: [],
		execute: (m, p) => {
			let q = tempPoll.substring(12,tempPoll.length);
			if(poll['question'] == undefined && q != ""){
				createPoll(m, q);
			}else if(q == ""){
				commandHelp(m, 'pollcreate');
			}else if(poll['question'] !== undefined && q == ""){
				bot.sendMessage(m.channel,"No new poll request to overwrite current poll with.");
				commandHelp(m, 'pollcreate');
			}else{
				noPoll(m);
			}
		}
	},
	{
		command: 'vote',
		description: 'Adds a vote in the current poll',
		inHelp: true,
		params: [
			'option'
		],
		execute: (m, p) => {
			let o = p.substring(6,p.length);
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
		inHelp: true,
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
		inHelp: true,
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
		inHelp: true,
		params: [],
		execute: (m, p) => {
			bot.awaitResponse(m,"I ain't listening to you!",function(){
				bot.reply(m.channel,"j/k, pong.");
			});
		}
	}
]

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

bot.on("message", (m) => {
	let p = m.content;
	let com = (p.indexOf(" ") == -1)?p.substring(1,p.length):p.substring(1,p.indexOf(" "));
	let knownCommand = false;
	if(m.author.id !== bot.user.id && p.substring(0,1) == "/"){
		for(i=0;i<commands.length;i++){
			let c = commands[i];
			if(com == c.command){
				c.execute(m, p);
				knownCommand = true;
				break;
			}
		}
		if(!knownCommand){bot.sendMessage(m.channel,"Unknown command")}
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
})

bot.loginWithToken(config.testbot);