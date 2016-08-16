var express = require("express");
var cookieParser = require("cookie-parser");

module.exports = function(port, db, githubAuthoriser) {
    var app = express();

    app.use(express.static("public"));
    app.use(cookieParser());

    var users = db.collection("users");
    var sessions = {};

    // Added variables by Justas
    var conversations = db.collection("conversations-justas");
    var io = require("socket.io").listen(9999);
    var clients = [];

    app.get("/oauth", function(req, res) {
        githubAuthoriser.authorise(req, function(githubUser, token) {
            if (githubUser) {
                users.findOne({
                    _id: githubUser.login
                }, function(err, user) {
                    if (!user) {
                        // TODO: Wait for this operation to complete
                        users.insertOne({
                            _id: githubUser.login,
                            name: githubUser.name,
                            avatarUrl: githubUser.avatar_url
                        });
                    }
                    sessions[token] = {
                        user: githubUser.login
                    };
                    res.cookie("sessionToken", token);
                    res.header("Location", "/");
                    res.sendStatus(302);
                });
            }
            else {
                res.sendStatus(400);
            }

        });
    });

    app.get("/api/oauth/uri", function(req, res) {
        res.json({
            uri: githubAuthoriser.oAuthUri
        });
    });

    app.use(function(req, res, next) {
        if (req.cookies.sessionToken) {
            req.session = sessions[req.cookies.sessionToken];
            if (req.session) {
                next();
            } else {
                res.sendStatus(401);
            }
        } else {
            res.sendStatus(401);
        }
    });

    app.get("/api/user", function(req, res) {
        users.findOne({
            _id: req.session.user
        }, function(err, user) {
            if (!err) {
                res.json(user);
            } else {
                res.sendStatus(500);
            }
        });
    });

    app.get("/api/users", function(req, res) {
        users.find().toArray(function(err, docs) {
            if (!err) {
                res.json(docs.map(function(user) {
                    return {
                        id: user._id,
                        name: user.name,
                        avatarUrl: user.avatarUrl
                    };
                }));
            } else {
                res.sendStatus(500);
            }
        });
    });
    /*
    app.get("/api/conversations", function (req, res) {
        res.json({
          justas: "justas is amazing!"
        });

        conversations.insertOne({
            participants: [{id: "JMiknys"}, {id: "TestUser"}],
            messages: [{sender: "JMiknys", time: 1049, body:"first message"}]
        });
    });

    app.post("/api/conversations", function (req, res) {
        var conversation = req.body;
        console.log(conversation);
        res.sendStatus(201);
    });
    */

    io.on('connection', function(socket) {
        console.log("New client connected ID: "+socket.id);
        clients.push(socket);

        socket.on('disconnect', function() {
            var index = clients.indexOf(socket);
            if (index != -1) {
                clients.splice(index,1);
                console.log('Client disconnected: '+socket.id);
            }
        });

        // New conversation request
        socket.on('new_conversation', function(msg) {
            console.log('Received a new conversation request: ' + JSON.stringify(msg));
            conversations.insertOne(msg);
        });

        // Get conversations
        socket.on('init_conversations', function(clientId) {
            console.log("Client asked to get conversations. Asker: "+clientId);
            var results = conversations.find({'participants.id': 'JMiknys'}).toArray(function (err, items) {
                console.log("Found "+items.length+" conversations. Sending back answer");
                socket.emit("init_conversations", items);
            });
        });
    });

    return app.listen(port);
};
