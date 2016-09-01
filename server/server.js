/*globals Map, socket */
var express = require("express");
var cookieParser = require("cookie-parser");
var socketIo = require("socket.io");

module.exports = function(port, db, githubAuthoriser) {
    var app = express();
    //var server = http.Server(app);
    var server = app.listen(port);
    var io = socketIo.listen(server);

    //server.listen(8080);

    app.use(express.static("public"));
    app.use(cookieParser());

    var users = db.collection("users");
    var sessions = {};

    // Added variables by Justas
    var conversations = db.collection("conversations-justas");
    // var io = require("socket.io").listen(9000);
    var clients = new Map();
    //var onlineUsers = {};
    var onlineUsers = [];
    // load users

    users.find().toArray(function (err, userArray) {
        onlineUsers = userArray;
    });

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
                            avatarUrl: githubUser.avatar_url,
                            color: "#D3D3D3"
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
                        avatarUrl: user.avatarUrl,
                        color: user.color
                    };
                }));
            } else {
                res.sendStatus(500);
            }
        });
    });

    function removeClient(socket) {
        var disconnectedUser = clients.get(socket);
        console.log("Client disconnected: " + disconnectedUser);
        if (disconnectedUser !== null) {
            setUserOnlineStatus(disconnectedUser, false);
            //delete onlineUsers[disconnectedUser];
            clients.delete(socket);
            // Let everyone else know that user went offline
            io.sockets.emit("user-update", getUserProfile(disconnectedUser));
        }
    }

    function addClient(socket) {
        clients.set(socket, null);
    }

    function setUserOnlineStatus(userId, status) {
        var index;
        if (userId !== null) {
            onlineUsers.forEach(function (el, i) {
                if (el._id === userId) {
                    index = i;
                }
            });
            onlineUsers[index].online = status;
        }
    }

    function getUserProfile (userId) {
        var index;
        onlineUsers.forEach(function (el, i) {
            if (el._id === userId) {
                index = i;
            }
        });
        return onlineUsers[index];
    }

    io.on("connection", function(socket) {
        console.log("New client connected ID: " + socket.id);
        addClient(socket);

        socket.on("disconnect", function() {
            removeClient(socket);
        });

        // Register User
        socket.on("register_user", function(userId) {
            clients.set(socket, userId);
            //onlineUsers[userId] = "online";
            setUserOnlineStatus(userId, true);

            console.log("user registered: " + clients.get(socket));

            // send the client a list of other registered users
            socket.emit("users", onlineUsers);

            // Tell other clients that user connected
            socket.broadcast.emit("user-update", getUserProfile(userId));
        });

        // Update user profile
        socket.on("update-profile", function(profile) {
            console.log("user profile update received");
            users.updateOne(
              {_id: profile.id},
              {$set: {"name": profile.name, "avatarUrl": profile.avatarUrl, "color": profile.color
                      }
              }, function(err, d) {
                  // Success handler when user added to the conversation
                  onlineUsers.forEach(function(el, i) {
                      console.log(el._id + "===" + profile.id);
                      if (el._id === profile.id) {
                          onlineUsers[i].name = profile.name;
                          onlineUsers[i].avatarUrl = profile.avatarUrl;
                          onlineUsers[i].color = profile.color;

                          // Tell other clients about profile update
                          socket.broadcast.emit("user-update", getUserProfile(profile.id));
                      }
                  });
              });
        });
        // New conversation request
        socket.on("new_conversation", function(msg) {
            console.log("Received a new conversation request: " + JSON.stringify(msg));
            conversations.insertOne(msg, function(err, conversation) {
                // Add all participants to the room
                msg.participants.forEach(function(el) {
                    clients.forEach(function (val, key, map) {
                        //console.log(val+"==="+el.id);
                        // If person currently is online, add him to the chat channel
                        if (val === el.id) {
                            key.join(msg._id);
                        }
                    });
                });
                io.to(msg._id).emit("new_conversation", msg);
                // Once item has been inserted return msg - which will have ID as well
            });
        });

        // Get conversations
        socket.on("init_conversations", function(clientId) {
            console.log("Client asked to get conversations. Asker: " + clientId);
            var results = conversations.find({"participants.id": clientId}).toArray(function (err, items) {
                //console.log(JSON.stringify(items));
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

            //var msg = {id: data.conversation, sender: "Server", time: Date.now(), body: "Stuff"};
            io.to(data.conversation).emit("leave-conversation", data);
            //TODO: UNSUBSCRIBE FROM CONVERSATION!
            //io.to(data.conversation).emit("message", "User: " + data.userId + " has lef the conversation.");
        });

        // Add more users to conversation
        socket.on("add-more-users", function(data) {
            data.participants.forEach(function(el) {
                conversations.updateOne(
                  {_id: new ObjectID(data.id)},
                  {$push: {"participants": {id: el.id}
                          }
                  }, function(err, d) {
                        // Success handler when user added to the conversation

                        // Check if user is online, if so subscribe him to the channel
                        clients.forEach(function (val, key, map) {
                            // If person currently is online, add him to the chat channel
                            if (val === el.id) {
                                key.join(data.id);
                            }
                        });
                    });
            });

            // Tell everyone in the channel about new user
            var results = conversations.find({"_id": new ObjectID(data.id)}).toArray(function (err, items) {
                // Send conversation to everyone in the chat
                io.to(data.id).emit("user-joined", items[0]);
            });
        });
        socket.on("change-topic", function (data) {
            console.log("got change request");
            conversations.updateOne(
              {_id: new ObjectID(data.id)},
              {$set: {"title": data.topic}
              }, function(err, d) {
                  io.to(data.id).emit("change-topic", data);
              });
        });
    });
    return server;
};
