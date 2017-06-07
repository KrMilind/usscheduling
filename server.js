var restify = require('restify');
var builder = require('botbuilder');

// Get secrets from server environment
var botConnectorOptions = { 
    appId: process.env.MICROSOFT_APP_ID, 
    appPassword: process.env.MICROSOFT_APP_PASSWORD
};

// Create bot
var connector = new builder.ChatConnector(botConnectorOptions);
var bot = new builder.UniversalBot(connector);
bot.on('conversationUpdate', function (message,session) {
    if (message.membersAdded) {
        message.membersAdded.forEach(function (identity) {
            if (identity.id === message.address.bot.id) {
                bot.beginDialog(message.address,'/next');
		
            }
        });
    }
});
bot.dialog('/next',[
    function(session) {
        builder.Prompts.text(session,'hello this is prompts');
    },
    function(session) {
        session.send('you entered '+session.message.text);
    }
]);
bot.dialog('/', function (session) {
    //respond with user's message
    session.send("You said this " + session.message.text);
});

// Setup Restify Server
var server = restify.createServer();

// Handle Bot Framework messages
server.post('/api/messages', connector.listen());

// Serve a static web page
server.get('/', restify.serveStatic({
	'directory': '.',
	'default': 'chat.html'
}));

server.get('/home',function(req,res,nxt) {
    res.send("hello");
});

server.listen(process.env.port || 3978, function () {
    console.log('%s listening to %s', server.name, server.url); 
});