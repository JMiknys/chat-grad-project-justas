/*globals Map, socket */
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
    var clients = new Map();
    var onlineUsers = {};
    var ObjectID = require("mongodb").ObjectID;

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

    io.on("connection", function(socket) {
        console.log("New client connected ID: " + socket.id);
        clients.set(socket, null);

        socket.on("disconnect", function() {
            var disconnectedUser = clients.get(socket);
            console.log("Client disconnected: " + disconnectedUser);
            delete onlineUsers[disconnectedUser];
            clients.delete(socket);

            // TODO SEND EVERYONE USER DISCONNECTED MESSAGE!
            io.sockets.emit("user-disconnect", disconnectedUser);

        });

        // New conversation request
        socket.on("new_conversation", function(msg) {
            console.log("Received a new conversation request: " + JSON.stringify(msg));
            conversations.insertOne(msg);
        });

        // Get conversations
        socket.on("init_conversations", function(clientId) {
            console.log("Client asked to get conversations. Asker: " + clientId);
            var results = conversations.find({"participants.id": clientId}).toArray(function (err, items) {
                console.log(JSON.stringify(items));
                socket.emit("init_conversations", items);
                // Subscribe to all rooms
                items.forEach(function (el) {
                    socket.join(el._id);
                });
            });
        });

        socket.on("message", function(msg) {
            console.log("Received a new message request: " + JSON.stringify(msg));
            //conversations.insertOne(msg);
            //var cnv = conversations.find(ObjectId(msg.id));
            conversations.updateOne(
              {_id: new ObjectID(msg.id)},
              {$push: {"messages": {
                      sender: msg.sender,
                      time: msg.time,
                      body: msg.body}
                     }
              }, function(err, data) {
                  console.log("Message was sucessfully added to DB");
                  // Tell other listeners about Message
                  io.to(msg.id).emit("message", msg);
              });
        });

        socket.on("leaveConversation", function(data) {
            console.log("Leave request received: " + JSON.stringify(data));
            conversations.updateOne(
            {_id: new ObjectID(data.conversation)},
            {$pull : {"participants": {id: data.userId}}
          }, function(err, data) {
              // callback after user is deleted from conversation
          });

        });

        socket.on("register_user", function(userId) {
            clients.set(socket, userId);
            onlineUsers[userId] = "online";
            console.log("user registered: " + clients.get(socket));

            // send the client a list of other registered users
            socket.emit("users", onlineUsers);

            // TODO SEND OTHER CLIENTS USER CONNECTED MESSAGE!
            socket.broadcast.emit("user-connect", userId);
        });

    });

    return app.listen(port);
};
