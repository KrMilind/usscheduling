
// CATALYST CODE
require('dotenv').load();
//========================================================
// DEFINITIONS
//========================================================
var restify = require('restify');
var builder = require('botbuilder');
var passport = require('passport');
var OIDCStrategy = require('passport-azure-ad').OIDCStrategy;
var expressSession = require('express-session');
var querystring = require('querystring');
var https = require('https');
var cognitiveservices = require('botbuilder-cognitiveservices');
var config = require('./language_en.json');
var telemetryModule = require('./telemetry-module.js');
var appInsights = require('applicationinsights');
var path = require('path');

//bot application identity
var MICROSOFT_APP_ID = process.env.MICROSOFT_APP_ID;
var MICROSOFT_APP_PASSWORD = process.env.MICROSOFT_APP_PASSWORD;
var APPINSIGHTS_INSTRUMENTATION_KEY = process.env.APPINSIGHTS_INSTRUMENTATION_KEY;
//oauth details
var AZUREAD_APP_ID = process.env.AZUREAD_APP_ID;
var AZUREAD_APP_PASSWORD = process.env.AZUREAD_APP_PASSWORD;
var AZUREAD_APP_REALM = process.env.AZUREAD_APP_REALM;
var AUTHBOT_CALLBACKHOST = process.env.AUTHBOT_CALLBACKHOST;
var AUTHBOT_STRATEGY = process.env.AUTHBOT_STRATEGY;

//=========================================================
// SERVICE Setup
//=========================================================

// Create chat bot
var connector = new builder.ChatConnector({
  appId: MICROSOFT_APP_ID,
  appPassword: MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector);
bot.localePath(path.join(__dirname, './locale'));

//Create the qna maker service
var recognizer = new cognitiveservices.QnAMakerRecognizer({
               knowledgeBaseId: '967dec77-8ba7-4802-8221-5ed37a254f3f', 
               subscriptionKey: 'c706b70c809f446182a37190b18613a7'
});

var basicQnAMakerDialog = new cognitiveservices.QnAMakerDialog({
               recognizers: [recognizer],
               defaultMessage: config.diffQuery,
               qnaThreshold: 0.3
});
appInsights.setup(APPINSIGHTS_INSTRUMENTATION_KEY).setAutoDependencyCorrelation(false)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .start();
var client = appInsights.getClient();

//=========================================================
// SERVER Setup
//=========================================================
// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3979, function () {
  console.log('%s listening to %s', server.name, server.url); 
});
  
server.use(restify.queryParser());
server.use(restify.bodyParser({
    mapParams: false
}));
server.use(restify.acceptParser(server.acceptable));
server.use(expressSession({ secret: 'keyboard cat', resave: true, saveUninitialized: false }));
server.use(passport.initialize());
server.use(passport.session());

server.post('/api/messages', connector.listen());
server.get('/login', function (req, res, next) {
  console.log('login endpoit');
  passport.authenticate('azuread-openidconnect', {
      failureRedirect: '/login', 
      customState: req.query.address,
      resourceURL: process.env.MICROSOFT_RESOURCE 
    }, function (err, user, info) {
    console.log('login');
    if (err) {
      console.log(err); 
      return next(err);
    }
    if (!user) {
      return res.redirect('/login');
    }
    req.logIn(user, function (err) {
      if (err) {
        return next(err);
      } else {
        return res.send('Welcome ' + req.user.displayName);
      }
    });
  })(req, res, next);
});
server.get('/home',function(req,res,next) {
  res.send(store);
});
server.post('/api/OAuthCallback/',function(req,res,next) {
  var address = res.req.body.state;
  address = address.substring(address.indexOf('{'));
  address = JSON.parse(address);
  passport.authenticate('azuread-openidconnect', {
     failureRedirect: '/login'},function(req,res,nxt) {
      var user = res;
      var messageData = { accessToken: user.accessToken, refreshToken: user.refreshToken, userId: user.id, name: user.displayName, email: user.preferred_username };
      //console.log(messageData);
      var continueMsg = new builder.Message().address(address).text(JSON.stringify(messageData));
      //console.log(continueMsg.toMessage());
      bot.receive(continueMsg.toMessage());
    })(req,res,next);
    res.send('Return to bot');
  });

// 'logout' route, logout from passport, and destroy the session with AAD.
server.get('/logout', function(req, res){
  req.session.destroy(function(err) {
    req.logOut();
    res.redirect("https://login.microsoftonline.com/common/oauth2/logout");
  });
});

server.get('/home',function(req,res,nxt) {
  res.send("endpoint home");
});

//==================================
// AUTHENTICATION CODE
//==================================

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(id, done) {
  done(null, id);
});


// Use the v1 endpoint (applications configured by manage.windowsazure.com)
// This works against Azure AD
var oidStrategyv1 = {
  redirectUrl: AUTHBOT_CALLBACKHOST +'/api/OAuthCallback',
  allowHttpForRedirectUrl: true,
  realm: AZUREAD_APP_REALM,
  clientID: AZUREAD_APP_ID,
  clientSecret: AZUREAD_APP_PASSWORD,
  useCookieInsteadOfSession: false,
  validateIssuer: false,
  oidcIssuer: undefined,
  identityMetadata: 'https://login.microsoftonline.com/' + AZUREAD_APP_REALM + '/.well-known/openid-configuration',
  skipUserProfile: true,
  responseType: 'code id_token',
  responseMode: 'form_post',
  passReqToCallback: true
};

passport.use(new OIDCStrategy(oidStrategyv1,
  (req, iss, sub, profile, accessToken, refreshToken, done) => {
    if (!profile.displayName) {
      return done(new Error("No oid found"), null);
    }
    // asynchronous verification, for effect...
    process.nextTick(() => {
      profile.accessToken = accessToken;
      profile.refreshToken = refreshToken;
      return done(null, profile);
    });
  }
));

//=========================================================
// Bots Dialogs
//=========================================================


bot.on('conversationUpdate', function (message,session) {
//            session.privateConversationData.first = 0;
    if (message.membersAdded) {
        message.membersAdded.forEach(function (identity) {
            if (identity.id === message.address.bot.id) {
                bot.beginDialog(message.address,'/next');
                              
            }
        });
    }
});

bot.dialog('/next',[
    function(session,args,next)
    {

        var welcomeCard = new builder.HeroCard(session)
            .text(config.btnWelcome)
            .buttons([
                builder.CardAction.imBack(session,session.gettext(config.Welcome_accept),config.Welcome_accept)
            ]);
    
    //-----------
    //prompted card for a new user with userid
    //new user++
    //-----------
    var telemetry = telemetryModule.createTelemetry(session, { setDefault: false });
    client.trackEvent("Prompting card for new user", telemetry);
        
    session.send(new builder.Message(session)
             .addAttachment(welcomeCard),{listStyle: builder.ListStyle.button});
    session.endDialog();
    }]);
    bot.dialog('/confirmations',[
        function(session, results,next){
          if(session.message.text.toLowerCase()==config.got_it) {
            var secureCard = new builder.HeroCard(session)
            .text(config.secure)
            .buttons([
                builder.CardAction.imBack(session,config.private_info,config.private_info)
            ]);
            builder.Prompts.text(session,new builder.Message(session)
             .addAttachment(secureCard),{listStyle: builder.ListStyle.button});
            next();
        }else {
            //-----------
            //user did not reply with got it message , hence conversation with user ended
            //cancel user++
            //-----------   
            var telemetry = telemetryModule.createTelemetry(session, { setDefault: false });
            client.trackEvent("User rejected card", telemetry);
            session.endConversation(config.Endsession);
        }
    },
    function(session,results,next) {
        //-----------
        //user replied with got it message and redirecting user to question maker
        //accepted user++
        //-----------
        if(session.message.text.toLowerCase()==config.private_info.toLowerCase()) {
            var telemetry = telemetryModule.createTelemetry(session, { setDefault: false });    
            client.trackEvent("User accepted card", telemetry);
            var address = session.message.address;
            // TODO: Encrypt the address string
            var link = AUTHBOT_CALLBACKHOST + '/login?address=' + querystring.escape(JSON.stringify(address));
            var msg = new builder.Message(session)
            .attachments([
              new builder.SigninCard(session)
              .text("Please click this link to sign in first.")
              .button("signin", link) 
            ]); 
             //session.send(msg);
            builder.Prompts.text(session,msg);
            next();
        }else {
            //-----------
            //user did not reply with got it message , hence conversation with user ended
            //cancel user++
            //-----------   
            var telemetry = telemetryModule.createTelemetry(session, { setDefault: false });
            client.trackEvent("User rejected card", telemetry);
            session.endConversation(config.Endsession);
        }
        
    },function(session,results,next) {
        try {
          var loginData = JSON.parse(session.message.text);
        }catch(e) {
          var loginData = null;
        }
        if (loginData && loginData.refreshToken && loginData.accessToken) {
          session.privateConversationData.userName = loginData.name;
          session.privateConversationData.accessToken = loginData.accessToken;
          session.privateConversationData.refreshToken = loginData.refreshToken;
          session.endDialogWithResult({ response: true });
        } else {
          //-----------
          //user did not reply with got it message , hence conversation with user ended
          //cancel user++
          //-----------   
          var telemetry = telemetryModule.createTelemetry(session, { setDefault: false });
          client.trackEvent("User rejected card", telemetry);
          session.endConversation(config.Endsession);
        }
          session.send("Hi "+session.privateConversationData.userName+",what can I help you with?");
          session.endDialog();
      }
]);


bot.dialog('/hrpmo',basicQnAMakerDialog);

bot.dialog('/',[
    function(session) {
    if(session.privateConversationData.accessToken&&session.privateConversationData.refreshToken) {
      //session.send("What can I help you with?");
      var telemetry = telemetryModule.createTelemetry(session, { setDefault: false });
      client.trackEvent("User asked question", telemetry);
      session.beginDialog('/hrpmo'); 
    } else {
            session.beginDialog('/confirmations');
    }
}]).triggerAction({
  matches : /^logout$/,
  onSelectAction : (session,args,next) => {
    session.endConversation("You have logged out. Goodbye.");
  }
});